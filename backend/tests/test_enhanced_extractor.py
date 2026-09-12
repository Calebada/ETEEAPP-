import os
import sys
import re
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'accredia.settings')
django.setup()

import fitz
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

from core.gemini_service import clean_ocr_subject_title

def reconstruct_page_lines_from_ocr(ocr_result, y_threshold=16):
    """Spatially reconstruct horizontal tabular text lines from OCR bounding boxes."""
    if not ocr_result:
        return []
    
    items = []
    for item in ocr_result:
        box = item[0]
        text = str(item[1]).strip()
        conf = float(item[2]) if len(item) > 2 else 1.0
        if not text:
            continue
        y_center = (box[0][1] + box[2][1]) / 2.0
        x_left = box[0][0]
        items.append({'text': text, 'y': y_center, 'x': x_left, 'conf': conf})
    
    # Sort by Y ascending
    items.sort(key=lambda it: it['y'])
    
    lines = []
    current_line = []
    current_y = None
    
    for item in items:
        if current_y is None:
            current_y = item['y']
            current_line.append(item)
        elif abs(item['y'] - current_y) <= y_threshold:
            current_line.append(item)
            # update running average y
            current_y = sum(it['y'] for it in current_line) / len(current_line)
        else:
            current_line.sort(key=lambda it: it['x'])
            lines.append("   ".join(it['text'] for it in current_line))
            current_line = [item]
            current_y = item['y']
            
    if current_line:
        current_line.sort(key=lambda it: it['x'])
        lines.append("   ".join(it['text'] for it in current_line))
        
    return lines


# Comprehensive regex for course codes across Philippine colleges (ACLC, CITE, CIT-U, STI, AMA, DLSU, etc.)
COURSE_CODE_REGEX = re.compile(
    r'\b(?P<code>'
    r'[A-Z]{2,6}\s*[-–—]?\s*\d{1,4}[A-Z]?'    # e.g., IT 113, MATH 113, RT-01, CSIT121, PP&PC 312
    r'|[A-Z]{2,4}\s*&\s*[A-Z]{2,4}\s*\d{1,4}' # e.g. PP&PC 312
    r'|COMSK\d|COMFUN|ETHNS\d|NSTP\d{1,2}|PHYED\d|ALGBRA|INTPRO|SYMLOG|NET\d|COMPR\d|PUBSPK|PREVAL|BUSDEV|MULDEV|PROJMG|STCAB|TECWRT|WEBPD|SYSDES|ACCTGI|OJT|BAS|SEM\s*\d' # ACLC/AMA mnemonics
    r')\b',
    re.IGNORECASE
)

# Common headers / non-subject lines to ignore
IGNORE_KEYWORDS = {
    'transcript', 'registrar', 'entrance data', 'school attended', 'admission', 'graduation',
    'student name', 'id number', 'birthdate', 'birthplace', 'personal data', 'preliminary education',
    'grading system', 'remarks', 'date issued', 'prepared by', 'checked by', 'evaluator',
    'not valid without', 'official transcript', 'page 1', 'page 2', 'page 3', 'subject description',
    'course code', 'in-plant training', 'transcript closed', 'nothing follows', 'satisfactorily completed',
    'we do ordinary', 'elementary', 'secondary', 'high school', 'national high school'
}

def parse_enhanced_tor_subjects(lines):
    subjects = []
    seen_codes = set()
    
    for raw_line in lines:
        line = raw_line.strip()
        if not line or len(line) < 3:
            continue
        
        lower_line = line.lower()
        if any(ign in lower_line for ign in IGNORE_KEYWORDS) and not any(term in lower_line for term in ['semester', 'sem', 'tri']):
            # Skip pure header / metadata lines
            if not COURSE_CODE_REGEX.search(line):
                continue

        # Look for subject code match in line
        code_matches = list(COURSE_CODE_REGEX.finditer(line))
        if not code_matches:
            continue
        
        # Take the best matching code in the row (usually first code after term info)
        for code_match in code_matches:
            code_raw = code_match.group('code').strip()
            code_clean = re.sub(r'\s+', '', code_raw.upper())
            
            if code_clean in {'PAGE', 'DATE', 'FORM', 'YEAR', 'TERM', 'CODE', 'UNIT', 'GRAD', 'NOTE'}:
                continue
            
            # The text after the code contains Title, Grade, Units
            post_code_text = line[code_match.end():].strip()
            if not post_code_text:
                continue
            
            # Extract trailing numbers / grades / units from the end of post_code_text
            # Patterns:
            # Case 1: Title ... <Grade: e.g. 1.9 or 2.50 or Passed> ... <Units: e.g. 3.0 or 3 or 4>
            # Case 2: Title ... <Units: e.g. 3> ... <Grade: e.g. 2.0>
            # Case 3: Title only (if numbers got clipped)
            
            tokens = [t.strip(' ,;') for t in post_code_text.split() if t.strip(' ,;')]
            if not tokens:
                continue
            
            title = ''
            grade = ''
            units = 0.0
            
            # Check if last 2 tokens are grade & units
            grade_units_found = False
            if len(tokens) >= 2:
                t_last = tokens[-1]
                t_prev = tokens[-2]
                
                # Check format: Grade (e.g. 1.9, 2.50, Passed) followed by Units (e.g. 3.0, 3, 2)
                grade_match_prev = re.match(r'^(?:\d+(?:\.\d+)?|passed|pass|p|failed|inc|incomplete|drp|dropped|w)$', t_prev, re.IGNORECASE)
                unit_match_last = re.match(r'^\d+(?:\.\d+)?$', t_last)
                
                if grade_match_prev and unit_match_last:
                    grade = t_prev
                    try:
                        units = float(t_last)
                    except ValueError:
                        units = 0.0
                    title = " ".join(tokens[:-2])
                    grade_units_found = True
                
                if not grade_units_found:
                    # Check reverse format: Units followed by Grade
                    unit_match_prev = re.match(r'^\d+(?:\.\d+)?$', t_prev)
                    grade_match_last = re.match(r'^(?:\d+(?:\.\d+)?|passed|pass|p|failed|inc|incomplete|drp|dropped|w)$', t_last, re.IGNORECASE)
                    
                    if unit_match_prev and grade_match_last:
                        try:
                            units = float(t_prev)
                        except ValueError:
                            units = 0.0
                        grade = t_last
                        title = " ".join(tokens[:-2])
                        grade_units_found = True
            
            if not grade_units_found and len(tokens) >= 1:
                t_last = tokens[-1]
                # If only one number is at end
                if re.match(r'^\d+(?:\.\d+)?$', t_last):
                    val = float(t_last)
                    if val in (1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 12.0, 17.0):
                        units = val
                    else:
                        grade = t_last
                    title = " ".join(tokens[:-1])
                elif re.match(r'^(?:passed|pass|p|failed|inc|drp)$', t_last, re.IGNORECASE):
                    grade = t_last
                    title = " ".join(tokens[:-1])
                else:
                    title = " ".join(tokens)
            
            cleaned_title = clean_ocr_subject_title(title)
            # Remove any stray term words from start of title
            cleaned_title = re.sub(r'^(?:1st|2nd|3rd|4th)\s+(?:Tri|Sem|Semester|Year)\s*', '', cleaned_title, flags=re.IGNORECASE).strip()
            
            if not cleaned_title or len(cleaned_title) < 2:
                continue
            
            # Avoid duplicate entries on same code
            dedup_key = f"{code_clean}_{cleaned_title.lower()}"
            if dedup_key in seen_codes:
                continue
            seen_codes.add(dedup_key)
            
            subjects.append({
                'code': code_raw,
                'title': cleaned_title,
                'grade': grade,
                'units': units,
            })
            break # move to next line once code is processed
            
    return subjects

# Run test on 3 sample PDFs
uploaded_dir = Path(r"C:\Users\Admin\.gemini\antigravity-ide\brain\d9c6ef5a-ca42-4c08-b17a-66154317e60c\.user_uploaded")
pdf_files = list(uploaded_dir.glob("*.pdf"))
engine = RapidOCR()

for pdf_path in pdf_files:
    print(f"\n=================================================================")
    print(f"Testing Enhanced Extractor on: {pdf_path.name}")
    doc = fitz.open(pdf_path)
    
    all_lines = []
    for page_idx, page in enumerate(doc):
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        img = Image.frombytes('RGB', [pixmap.width, pixmap.height], pixmap.samples)
        ocr_result, _ = engine(np.array(img))
        page_lines = reconstruct_page_lines_from_ocr(ocr_result)
        all_lines.extend(page_lines)
    
    extracted = parse_enhanced_tor_subjects(all_lines)
    print(f"Total Subjects Extracted: {len(extracted)}")
    print(f"{'#':<3} | {'Code':<10} | {'Subject Title':<45} | {'Grade':<8} | {'Units':<5}")
    print("-" * 80)
    for idx, s in enumerate(extracted, 1):
        print(f"{idx:<3} | {s['code']:<10} | {s['title']:<45} | {s['grade']:<8} | {s['units']:<5.1f}")
