import os
import json
import asyncio
import base64
import re
import time
from difflib import SequenceMatcher
from functools import lru_cache
from io import BytesIO
from dotenv import load_dotenv

import numpy as np
from PIL import Image

try:
    import fitz
except ModuleNotFoundError:
    fitz = None

try:
    from rapidocr_onnxruntime import RapidOCR
except ModuleNotFoundError:
    RapidOCR = None

try:
    from google import genai
    from google.genai import types
except ModuleNotFoundError:
    genai = None
    types = None

try:
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=FutureWarning)
        import google.generativeai as legacy_genai
except ModuleNotFoundError:
    legacy_genai = None

load_dotenv()

# Use GEMINI_API_KEY first, fall back to EMERGENT_LLM_KEY
LLM_API_KEY = os.getenv('GEMINI_API_KEY') or os.getenv('EMERGENT_LLM_KEY')
GEMINI_MODEL = "gemini-flash-latest"


LOCAL_IT_KEYWORDS = {
    'it', 'information technology', 'software', 'developer', 'programmer',
    'web', 'database', 'network', 'systems', 'system admin', 'devops',
    'qa', 'test automation', 'cybersecurity', 'cloud', 'data analyst',
    'ui', 'ux', 'frontend', 'backend', 'full stack', 'technical support'
}

LOCAL_SUBJECT_PATTERN = re.compile(
    r'(?P<code>[A-Z]{2,5}\s?-?\s?\d{2,4}[A-Z]?)\s+'
    r'(?P<title>.+?)\s+'
    r'(?P<units>\d+(?:\.\d+)?)\s+'
    r'(?P<grade>(?:\d+(?:\.\d+)?)|A\+?|B\+?|C\+?|D\+?|F|P|PASSED|FAILED|INC|INCOMPLETE|DRP)\b',
    re.IGNORECASE,
)

LOCAL_SUBJECT_PATTERN_ALT = re.compile(
    r'(?P<code>[A-Z]{2,5}\s?-?\s?\d{2,4}[A-Z]?)\s+'
    r'(?P<title>.+?)\s+'
    r'(?P<grade>(?:\d+(?:\.\d+)?)|A\+?|B\+?|C\+?|D\+?|F|P|PASSED|FAILED|INC|INCOMPLETE|DRP)\s+'
    r'(?P<units>\d+(?:\.\d+)?)\b',
    re.IGNORECASE,
)

LOCAL_JOB_TITLE_HINTS = [
    'web designer', 'ui designer', 'ux designer', 'ui/ux designer',
    'frontend developer', 'back-end developer', 'backend developer',
    'web developer', 'software engineer', 'software developer',
    'it support', 'technical support', 'system administrator',
]


def _clean_json_response(text):
    """Clean LLM response to extract JSON"""
    text = text.strip()
    if text.startswith('```json'):
        text = text[7:]
    if text.startswith('```'):
        text = text[3:]
    if text.endswith('```'):
        text = text[:-3]
    return text.strip()


ABBREVIATION_EXPANSIONS = {
    'prog': 'programming',
    'progg': 'programming',
    'dev': 'development',
    'sys': 'systems',
    'syst': 'systems',
    'des': 'design',
    'dsgn': 'design',
    'mgt': 'management',
    'mgmt': 'management',
    'comm': 'communication',
    'comms': 'communication',
    'communicat': 'communication',
    'net': 'networking',
    'netw': 'networking',
    'sec': 'security',
    'secur': 'security',
    'info': 'information',
    'inf': 'information',
    'tech': 'technology',
    'technol': 'technology',
    'comp': 'computer',
    'elec': 'electronics',
    'elect': 'elective',
    'algo': 'algorithms',
    'struc': 'structures',
    'struct': 'structures',
    'int': 'introduction',
    'intro': 'introduction',
    'fund': 'fundamentals',
    'funda': 'fundamentals',
    'inter': 'internet',
    'admin': 'administration',
    'adm': 'administration',
    'maint': 'maintenance',
    'integ': 'integration',
    'arch': 'architecture',
    'app': 'applications',
    'appl': 'applications',
    'apps': 'applications',
    'emerg': 'emerging',
    'mult': 'multimedia',
    'graph': 'graphics',
    'anim': 'animation',
    'quant': 'quantitative',
    'meth': 'methods',
    'math': 'mathematics',
    'alg': 'algebra',
    'trig': 'trigonometry',
    'calc': 'calculus',
    'stat': 'statistics',
    'stats': 'statistics',
    'anal': 'analysis',
    'db': 'database',
    'dbms': 'database management systems',
    'sad': 'systems analysis and design',
    'hci': 'human computer interaction',
    'hum': 'human',
    'assur': 'assurance',
    'oop': 'object oriented programming',
    'ias': 'information assurance and security',
    'pe': 'physical education',
    'nstp': 'national service training program',
    'cwts': 'civic welfare training service',
    'rotc': 'reserve officers training corps',
    'soc': 'social',
    'socio': 'sociology',
    'psych': 'psychology',
    'phil': 'philosophy',
    'philo': 'philosophy',
    'hist': 'history',
    'gov': 'government',
    'govt': 'government',
    'const': 'constitution',
    'lit': 'literature',
    'eng': 'english',
    'engl': 'english',
    'fil': 'filipino',
    'fili': 'filipino',
    'res': 'research',
    'rsch': 'research',
    'pract': 'practicum',
    'prac': 'practicum',
    'ojt': 'on the job training',
    'serv': 'servicing',
    'servic': 'servicing',
    'troub': 'troubleshooting',
    'doc': 'doctrine',
    'doct': 'doctrine',
    'act': 'activities',
    'activ': 'activities',
    'fit': 'fitness',
    'hardw': 'hardware',
    'hdw': 'hardware',
    'softw': 'software',
    'sftw': 'software',
}


def expand_subject_abbreviations(text):
    """Expand abbreviated subject words and compound course acronyms"""
    if not text:
        return ''
    t = text
    compounds = [
        (r'\bSYS(?:TEMS?)?\s+AN(?:AL)?(?:\s+AND|\s*&)?\s+DES(?:IGN)?\b', 'systems analysis and design'),
        (r'\bDATA\s+COMM(?:S)?(?:\s+AND|\s*&)?\s+NET(?:W(?:ORK)?)?\b', 'data communications and networking'),
        (r'\bCOMP(?:UTER)?\s+HARDW(?:ARE)?(?:\s+AND|\s*&)?\s+SERV(?:ICING)?\b', 'computer hardware and servicing'),
        (r'\bHUM(?:AN)?\s+COMP(?:UTER)?\s+INTER(?:ACTION)?\b', 'human computer interaction'),
        (r'\bINFO(?:RMATION)?\s+ASSUR(?:ANCE)?(?:\s+AND|\s*&)?\s+SEC(?:URITY)?\b', 'information assurance and security'),
        (r'\bAPP(?:L(?:ICATIONS?)?)?\s+DEV(?:ELOPMENT)?(?:\s+AND|\s*&)?\s+EMERG(?:ING)?(?:\s+TECH(?:NOLOGY)?)?\b', 'applications development and emerging technologies'),
        (r'\bWEB\s+SYS(?:TEMS?)?(?:\s+AND|\s*&)?\s+TECH(?:NOLOGIES)?\b', 'web systems and technologies'),
        (r'\bSYS(?:TEMS?)?\s+INTEG(?:RATION)?(?:\s+AND|\s*&)?\s+ARCH(?:ITECTURE)?\b', 'systems integration and architecture'),
        (r'\bSYS(?:TEMS?)?\s+ADMIN(?:ISTRATION)?(?:\s+AND|\s*&)?\s+MAINT(?:ENANCE)?\b', 'systems administration and maintenance'),
    ]
    for pattern, repl in compounds:
        t = re.sub(pattern, repl, t, flags=re.IGNORECASE)

    tokens = t.split()
    expanded = []
    for tok in tokens:
        clean_tok = tok.lower().rstrip('.,;:/&')
        if clean_tok in ABBREVIATION_EXPANSIONS:
            expanded.append(ABBREVIATION_EXPANSIONS[clean_tok])
        else:
            expanded.append(tok)
    return ' '.join(expanded)


def clean_ocr_subject_title(title):
    """Clean, normalize and expand OCR-extracted subject titles"""
    if not title:
        return ''
    t = title.strip()
    # Split concatenated words with conjunctions (e.g., 'GrammarandComposition' -> 'Grammar and Composition')
    t = re.sub(r'([a-zA-Z]{3,})(and|with|for|of)([A-Z][a-zA-Z]+)', r'\1 \2 \3', t)
    # Insert space between lowercase and uppercase letters (e.g., 'andServicing' -> 'and Servicing', 'ServiceTraining' -> 'Service Training')
    t = re.sub(r'([a-z])([A-Z])', r'\1 \2', t)
    # Insert space around parentheses (e.g., 'Electronics(Lab)' -> 'Electronics (Lab)')
    t = re.sub(r'([a-zA-Z0-9])\(', r'\1 (', t)
    t = re.sub(r'\)([a-zA-Z0-9])', r') \1', t)
    # Insert space between letters and numbers (e.g., 'Science1' -> 'Science 1')
    t = re.sub(r'([a-zA-Z])(\d+)', r'\1 \2', t)
    t = re.sub(r'(\d+)([a-zA-Z])', r'\1 \2', t)
    # Fix common OCR character confusion for Roman numerals / numbers at word end (e.g. 'Programl' -> 'Program 1', 'Doctrinel' -> 'Doctrine 1')
    t = re.sub(r'\b(Program|Course|Part|Sem|Level|Safety|Doctrine|Activities|Arts|Training|Mathematics|Programming|Physics|Chemistry|Science|English|PE|PATHFit|NSTP|Electronics)[lI1]\b', r'\1 1', t, flags=re.IGNORECASE)
    t = re.sub(r'\b(Program|Course|Part|Sem|Level|Safety|Doctrine|Activities|Arts|Training|Mathematics|Programming|Physics|Chemistry|Science|English|PE|PATHFit|NSTP|Electronics)(?:ll|II|2)\b', r'\1 2', t, flags=re.IGNORECASE)
    t = re.sub(r'\s+', ' ', t).strip()
    t = expand_subject_abbreviations(t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def _decode_document_bytes(image_base64):
    if isinstance(image_base64, bytes):
        return image_base64

    if not isinstance(image_base64, str):
        return b''

    if 'base64,' in image_base64:
        _, image_base64 = image_base64.split('base64,', 1)

    try:
        return base64.b64decode(image_base64)
    except Exception:
        return b''


@lru_cache(maxsize=1)
def _get_local_ocr_engine():
    if RapidOCR is None:
        return None
    try:
        return RapidOCR()
    except Exception:
        return None


def _reconstruct_page_lines_from_ocr(ocr_result, y_threshold=18):
    """Spatially reconstruct horizontal tabular text lines from OCR bounding boxes."""
    if not ocr_result:
        return []

    items = []
    for item in ocr_result:
        if not item or len(item) < 2:
            continue
        box = item[0]
        text = str(item[1]).strip()
        conf = float(item[2]) if len(item) > 2 else 1.0
        if not text:
            continue
        try:
            y_center = (box[0][1] + box[2][1]) / 2.0
            x_left = box[0][0]
            items.append({'text': text, 'y': y_center, 'x': x_left, 'conf': conf})
        except (IndexError, TypeError):
            continue

    if not items:
        return []

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


def _ocr_image_bytes(file_bytes):
    engine = _get_local_ocr_engine()
    if engine is None or not file_bytes:
        return ''

    try:
        image = Image.open(BytesIO(file_bytes)).convert('RGB')
        # Constrain dimensions to prevent ONNX memory overflow on huge scans
        if image.width > 1600 or image.height > 1600:
            image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        result = engine(np.array(image))
        if isinstance(result, tuple):
            result = result[0]

        lines = _reconstruct_page_lines_from_ocr(result)
        return '\n'.join(lines)
    except Exception:
        return ''


def _extract_text_and_subjects_from_pdf_bytes(file_bytes):
    if fitz is None or not file_bytes:
        return '', []

    all_lines = []
    engine = _get_local_ocr_engine()

    try:
        pdf = fitz.open(stream=file_bytes, filetype='pdf')
    except Exception:
        return '', []

    try:
        for page in pdf:
            native_text = (page.get_text('text') or '').strip()

            # If page has substantial text, include native text lines
            if len(native_text) > 100:
                for line in native_text.splitlines():
                    cleaned_line = line.strip()
                    if cleaned_line:
                        all_lines.append(cleaned_line)

            # Also render page with dynamic scale factor (up to 1600px) and run OCR for visual tables
            if engine is not None:
                try:
                    max_dim = max(page.rect.width, page.rect.height) if (page.rect.width and page.rect.height) else 800
                    scale = min(2.0, max(1.0, 1600.0 / max_dim))
                    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                    image = Image.frombytes('RGB', [pixmap.width, pixmap.height], pixmap.samples)
                    result = engine(np.array(image))
                    if isinstance(result, tuple):
                        result = result[0]

                    page_lines = _reconstruct_page_lines_from_ocr(result)
                    all_lines.extend(page_lines)
                except Exception as e:
                    print(f"Error during page OCR: {e}")
    finally:
        pdf.close()

    combined_text = '\n'.join(all_lines)
    parsed_subjects = _parse_tor_subjects_from_text(combined_text)
    return combined_text, parsed_subjects


def _extract_text_from_pdf_bytes(file_bytes):
    text, _ = _extract_text_and_subjects_from_pdf_bytes(file_bytes)
    return text


def _extract_local_text(file_bytes):
    if not file_bytes:
        return ''

    if file_bytes.startswith(b'%PDF'):
        return _extract_text_from_pdf_bytes(file_bytes)

    return _ocr_image_bytes(file_bytes)


# Comprehensive regex for course codes across Philippine colleges (ACLC, CITE, CIT-U, STI, AMA, DLSU, etc.)
COURSE_CODE_REGEX = re.compile(
    r'\b(?P<code>'
    r'[A-Z]{2,6}\s*[-–—]?\s*\d{1,4}[A-Z]?'
    r'|[A-Z]{2,4}\s*&\s*[A-Z]{2,4}\s*\d{1,4}'
    r'|COMSK\d|COMFUN|ETHNS\d|NSTP\d{1,2}|PHYED\d|ALGBRA|INTPRO|SYMLOG|NET\d|COMPR\d|PUBSPK|PREVAL|BUSDEV|MULDEV|PROJMG|STCAB|TECWRT|WEBPD|SYSDES|ACCTGI|OJT|BAS|SEM\s*\d'
    r')\b',
    re.IGNORECASE
)

IGNORE_LINE_KEYWORDS = {
    'transcript', 'registrar', 'entrance data', 'school attended', 'admission credential', 'admission status',
    'date of graduation', 'student name', 'id number', 'birthdate', 'birthplace', 'personal data',
    'preliminary education', 'grading system', 'remarks', 'date issued', 'prepared by', 'checked by',
    'evaluator', 'not valid without', 'official transcript', 'subject description', 'course code',
    'in-plant training', 'transcript closed', 'nothing follows', 'satisfactorily completed',
    'we do ordinary', 'elementary', 'secondary', 'high school', 'national high school', 'officials',
    'address', 'location', 'branch', 'issued by tesda', 'reproduction of the original', 'special order'
}


def _detect_term_header(line):
    """
    Detects if a line represents an academic term/semester header in a TOR.
    Returns (year_level, semester, school_year) or None.
    """
    if not line or len(line) < 4:
        return None

    lower = line.lower()
    
    # Must look like a term/semester/school year line, and not be a course subject line
    term_keywords = [
        'semester', 'sem', 'trimester', 'tri', 'midyear', 'summer', 'school year', 
        's.y.', 'a.y.', 'academic year', 'in-plant', 'dts', 'practicum', 
        '1st year', '2nd year', '3rd year', '4th year', 
        'first year', 'second year', 'third year', 'fourth year'
    ]
    if not any(k in lower for k in term_keywords):
        return None

    # Skip lines that are actually subject lines with units/grades or course descriptions
    if COURSE_CODE_REGEX.search(line) and re.search(r'\b(?:\d\.\d|\d{2,3}%|passed|inc|drp)\b', lower):
        return None

    year_level = None
    semester = None
    school_year = ''

    # Detect School Year: e.g. 2018-2019, 2018 - 2019, 2018/2019
    sy_match = re.search(r'\b(20\d\d\s*[-–/]\s*20\d\d|19\d\d\s*[-–/]\s*19\d\d)\b', line)
    if sy_match:
        school_year = re.sub(r'\s+', '', sy_match.group(1)).replace('–', '-').replace('/', '-')

    # Detect Year Level
    if re.search(r'\b(?:1st|first|1|one|i)\s*(?:year|yr|level)\b', lower):
        year_level = 1
    elif re.search(r'\b(?:2nd|second|2|two|ii)\s*(?:year|yr|level)\b', lower):
        year_level = 2
    elif re.search(r'\b(?:3rd|third|3|three|iii)\s*(?:year|yr|level)\b', lower):
        year_level = 3
    elif re.search(r'\b(?:4th|fourth|4|four|iv)\s*(?:year|yr|level)\b', lower):
        year_level = 4

    # Detect Semester
    if re.search(r'\b(?:1st|first|1|one|i)\s*(?:sem|semester|term|tri|trimester)\b', lower):
        semester = 1
    elif re.search(r'\b(?:2nd|second|2|two|ii)\s*(?:sem|semester|term|tri|trimester)\b', lower):
        semester = 2
    elif re.search(r'\b(?:3rd|third|3|three|iii)\s*(?:sem|semester|term|tri|trimester)\b', lower):
        semester = 3
    elif re.search(r'\b(?:summer|midyear|mid-year|in-plant|dts|practicum|ojt)\b', lower):
        semester = 3

    if year_level is not None or semester is not None or school_year:
        return (year_level, semester, school_year)

    return None


def _parse_tor_subjects_from_text(text):
    subjects = []
    seen_codes = set()
    raw_lines = (text or '').splitlines()

    current_year = 1
    current_sem = 1
    current_sy = ''
    subject_count_in_current_term = 0

    for raw_line in raw_lines:
        line = raw_line.strip()
        if not line or len(line) < 3:
            continue

        # Check for term/semester header
        term_info = _detect_term_header(line)
        if term_info:
            hdr_yr, hdr_sem, hdr_sy = term_info
            if hdr_yr is not None:
                current_year = hdr_yr
            elif hdr_sem == 1 and current_sem == 2:
                current_year = min(4, current_year + 1)

            if hdr_sem is not None:
                current_sem = hdr_sem

            if hdr_sy:
                current_sy = hdr_sy
            subject_count_in_current_term = 0
            continue

        lower_line = line.lower()
        if any(ign in lower_line for ign in IGNORE_LINE_KEYWORDS):
            # If line is purely header/metadata without a course code, skip
            if not COURSE_CODE_REGEX.search(line) or 'official' in lower_line or 'grading' in lower_line:
                continue

        code_matches = list(COURSE_CODE_REGEX.finditer(line))
        if not code_matches:
            continue

        for code_match in code_matches:
            code_raw = code_match.group('code').strip()
            code_clean = re.sub(r'\s+', '', code_raw.upper())

            if code_clean in {'PAGE', 'DATE', 'FORM', 'YEAR', 'TERM', 'CODE', 'UNIT', 'GRAD', 'NOTE', 'JUNE', 'MAY', 'APRIL', 'MARCH', 'SEAL'}:
                continue

            post_code_text = line[code_match.end():].strip()
            if not post_code_text:
                continue

            # Clean and split trailing tokens
            tokens = [re.sub(r'[^a-zA-Z0-9.\-/%]', '', t).strip('. ,;:') for t in post_code_text.split()]
            tokens = [t for t in tokens if t]
            if not tokens:
                continue

            title = ''
            grade = ''
            units = 0.0
            grade_units_found = False

            if len(tokens) >= 2:
                t_last = tokens[-1].rstrip('.')
                t_prev = tokens[-2].rstrip('.')

                # Case A: Grade followed by Units (e.g., "1.9   3.0" or "2.50   3" or "Passed   1.0")
                is_grade_prev = bool(re.match(r'^(?:\d+(?:\.\d+)?%?|passed|pass|p|failed|inc|incomplete|drp|dropped|w)$', t_prev, re.IGNORECASE))
                is_unit_last = bool(re.match(r'^\d+(?:\.\d+)?$', t_last))

                if is_grade_prev and is_unit_last:
                    grade = t_prev
                    try:
                        units = float(t_last)
                    except ValueError:
                        units = 0.0
                    title = " ".join(tokens[:-2])
                    grade_units_found = True

                # Case B: Units followed by Grade (e.g., "3   1.5" or "3.0   2.0")
                if not grade_units_found:
                    is_unit_prev = bool(re.match(r'^\d+(?:\.\d+)?$', t_prev))
                    is_grade_last = bool(re.match(r'^(?:\d+(?:\.\d+)?%?|passed|pass|p|failed|inc|incomplete|drp|dropped|w)$', t_last, re.IGNORECASE))

                    if is_unit_prev and is_grade_last:
                        try:
                            units = float(t_prev)
                        except ValueError:
                            units = 0.0
                        grade = t_last
                        title = " ".join(tokens[:-2])
                        grade_units_found = True

            if not grade_units_found and len(tokens) >= 1:
                t_last = tokens[-1].rstrip('.')
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
            # Remove any stray term prefix from title
            cleaned_title = re.sub(r'^(?:1st|2nd|3rd|4th)\s+(?:Tri|Sem|Semester|Year)\s*', '', cleaned_title, flags=re.IGNORECASE).strip()
            # Remove trailing numbers if title still has stray digits
            cleaned_title = re.sub(r'\s+\d+(?:\.\d+)?$', '', cleaned_title).strip()

            if not cleaned_title or len(cleaned_title) < 2:
                continue

            # Standardize default units if missing/zero
            if units <= 0:
                if any(k in cleaned_title.lower() for k in ['lab', 'laboratory', 'euthenics']):
                    units = 1.0
                elif any(k in cleaned_title.lower() for k in ['pe', 'pathfit', 'sports', 'fitness', 'dance']):
                    units = 2.0
                else:
                    units = 3.0

            # Format grade nicely
            clean_grade = grade.strip()
            if not clean_grade:
                clean_grade = 'Passed'

            dedup_key = f"{code_clean}_{cleaned_title.lower()}"
            if dedup_key in seen_codes:
                continue
            seen_codes.add(dedup_key)

            sem_name = "1st Semester" if current_sem == 1 else ("2nd Semester" if current_sem == 2 else "Summer / Midyear")
            yr_name = f"{current_year}st Year" if current_year == 1 else (f"{current_year}nd Year" if current_year == 2 else (f"{current_year}rd Year" if current_year == 3 else f"{current_year}th Year"))
            term_label = f"{yr_name} - {sem_name}"
            if current_sy:
                term_label += f" ({current_sy})"

            subjects.append({
                'code': code_raw,
                'title': cleaned_title,
                'grade': clean_grade,
                'units': units,
                'year_level': current_year,
                'semester': current_sem,
                'school_year': current_sy,
                'term_label': term_label,
            })
            subject_count_in_current_term += 1
            break

    all_same_sem = all(s.get('year_level') == 1 and s.get('semester') == 1 for s in subjects)
    if all_same_sem and len(subjects) > 9:
        for idx, s in enumerate(subjects):
            sem_idx = idx // 7
            y = (sem_idx // 2) + 1
            sem = (sem_idx % 2) + 1
            s['year_level'] = min(4, y)
            s['semester'] = sem
            yr_name = f"{s['year_level']}st Year" if s['year_level'] == 1 else (f"{s['year_level']}nd Year" if s['year_level'] == 2 else (f"{s['year_level']}rd Year" if s['year_level'] == 3 else f"{s['year_level']}th Year"))
            sem_name = "1st Semester" if sem == 1 else "2nd Semester"
            s['term_label'] = f"{yr_name} - {sem_name}"

    return subjects



def _parse_job_description_from_text(text):
    normalized_lines = [re.sub(r'\s+', ' ', line).strip() for line in (text or '').splitlines()]
    normalized_lines = [line for line in normalized_lines if line]
    lowered = ' '.join(normalized_lines).lower()

    company_name = ''
    job_title = ''

    for line in normalized_lines:
        company_match = re.search(r'^(?:company|employer|organization)\s*[:\-]\s*(.+)$', line, re.IGNORECASE)
        if company_match:
            company_name = company_match.group(1).strip()
            break

    for line in normalized_lines:
        title_match = re.search(r'^(?:job title|position|role)\s*[:\-]\s*(.+)$', line, re.IGNORECASE)
        if title_match:
            job_title = title_match.group(1).strip()
            break

    if not job_title:
        for hint in LOCAL_JOB_TITLE_HINTS:
            if hint in lowered:
                job_title = hint.title().replace('Ui/Ux', 'UI/UX').replace('It ', 'IT ')
                break

    if not job_title and normalized_lines:
        for line in normalized_lines[:5]:
            if len(line) <= 80 and not re.search(r'(sample|confidential|job description|responsibilities|qualifications)', line, re.IGNORECASE):
                job_title = line
                break

    years = 0
    years_match = re.search(r'(\d+(?:\.\d+)?)\s*\+?\s*years?', lowered, re.IGNORECASE)
    if years_match:
        try:
            years = float(years_match.group(1))
        except (TypeError, ValueError):
            years = 0

    if not company_name:
        company_match = re.search(r'([A-Z][A-Za-z0-9&.,\-/ ]{2,60})\s+(?:Inc\.?|Corp\.?|Company|Studio|Solutions|Technologies|Systems|Labs)\b', text or '')
        if company_match:
            company_name = company_match.group(0).strip()

    if not job_title:
        job_title = 'IT-related role' if any(keyword in lowered for keyword in LOCAL_IT_KEYWORDS) else 'Role'

    summary_parts = []
    if company_name:
        summary_parts.append(company_name)
    if job_title:
        summary_parts.append(job_title)
    if years:
        summary_parts.append(f'{years:g} years')

    job_description = ' - '.join(summary_parts) if summary_parts else 'Extracted job description evidence'
    is_it_related = any(keyword in lowered for keyword in LOCAL_IT_KEYWORDS)

    return {
        'company_name': company_name,
        'job_title': job_title,
        'years': years,
        'job_description': job_description,
        'is_it_related': is_it_related,
        'confidence': 60 if job_title != 'Role' else 35,
    }


def _local_is_it_related_text(text):
    normalized = (text or '').lower()
    return any(keyword in normalized for keyword in LOCAL_IT_KEYWORDS)


class GeminiService:
    def __init__(self):
        self.api_key = os.getenv('GEMINI_API_KEY') or os.getenv('EMERGENT_LLM_KEY') or ''
        self._client = None
        self._circuit_breaker_until = 0
        if genai and self.api_key:
            try:
                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                print(f"Failed to initialize Google GenAI Client: {e}")
                self._client = None
        elif legacy_genai and self.api_key:
            try:
                legacy_genai.configure(api_key=self.api_key)
            except Exception as e:
                print(f"Failed to initialize legacy GenerativeAI: {e}")

    def _get_client(self):
        if self._client:
            return self._client
        self.api_key = os.getenv('GEMINI_API_KEY') or os.getenv('EMERGENT_LLM_KEY') or ''
        if genai and self.api_key:
            try:
                self._client = genai.Client(api_key=self.api_key)
                return self._client
            except Exception:
                pass
        return None

    async def _generate(self, contents, system_instruction=None):
        """Asynchronously call Gemini API across client or legacy fallback."""
        if time.time() < self._circuit_breaker_until:
            return None

        client = self._get_client()
        self.api_key = self.api_key or os.getenv('GEMINI_API_KEY') or os.getenv('EMERGENT_LLM_KEY') or ''
        if not client and not (legacy_genai and self.api_key):
            return None

        loop = asyncio.get_event_loop()

        def _sync_call():
            models_to_try = [GEMINI_MODEL, 'gemini-3.6-flash', 'gemini-pro-latest']
            if client:
                config = None
                if system_instruction and types:
                    config = types.GenerateContentConfig(system_instruction=system_instruction)
                for model_name in models_to_try:
                    try:
                        if config:
                            resp = client.models.generate_content(
                                model=model_name,
                                contents=contents,
                                config=config
                            )
                        else:
                            resp = client.models.generate_content(
                                model=model_name,
                                contents=contents
                            )
                        if resp and resp.text:
                            return resp.text
                    except Exception as ex:
                        err_msg = str(ex)
                        if '429' in err_msg or 'RESOURCE_EXHAUSTED' in err_msg or 'quota' in err_msg.lower():
                            self._circuit_breaker_until = time.time() + 45
                            return None
                        continue

            if legacy_genai and self.api_key:
                legacy_genai.configure(api_key=self.api_key)
                for model_name in models_to_try:
                    try:
                        full_name = model_name if model_name.startswith('models/') else f"models/{model_name}"
                        m = legacy_genai.GenerativeModel(
                            model_name=full_name,
                            system_instruction=system_instruction
                        )
                        resp = m.generate_content(contents)
                        if resp and resp.text:
                            return resp.text
                    except Exception as ex:
                        err_msg = str(ex)
                        if '429' in err_msg or 'RESOURCE_EXHAUSTED' in err_msg or 'quota' in err_msg.lower():
                            self._circuit_breaker_until = time.time() + 45
                            return None
                        continue
            return None

        try:
            return await loop.run_in_executor(None, _sync_call)
        except Exception as e:
            print(f"Error in _generate: {e}")
            return None

    async def extract_subjects_from_tor(self, image_base64):
        """Extract subjects from TOR image or multi-page PDF using Gemini Vision + Enhanced Local OCR"""
        try:
            file_bytes = _decode_document_bytes(image_base64)
            if not file_bytes:
                return []

            local_subjects = []
            local_text = ''
            page_images_bytes = []

            if file_bytes.startswith(b'%PDF') and fitz is not None:
                try:
                    pdf = fitz.open(stream=file_bytes, filetype='pdf')
                    for page in pdf:
                        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                        img_bytes = pixmap.tobytes(output='png')
                        page_images_bytes.append(img_bytes)
                    pdf.close()
                except Exception as e:
                    print(f"Error converting PDF pages for vision: {e}")

                local_text, local_subjects = _extract_text_and_subjects_from_pdf_bytes(file_bytes)
            else:
                page_images_bytes.append(file_bytes)
                local_text = _extract_local_text(file_bytes)
                local_subjects = _parse_tor_subjects_from_text(local_text)

            if len(local_subjects) >= 5:
                return local_subjects

            if time.time() < self._circuit_breaker_until or not (self._client or (legacy_genai and self.api_key)):
                return local_subjects

            prompt = """You are an expert Academic Registrar OCR and Data Extraction Specialist.
Extract ALL academic courses/subjects from ALL pages and semesters of this Transcript of Records (TOR).

For each subject listed, extract:
1. "code": Exact course code (e.g. "IT 113", "COMSK1", "MATH 113", "ELEX 111", "RT - 01", "NSTP 113", "BCD 111", "COMPR2", "MULDEV", "SYSDES", "OJT")
2. "title": Exact subject description / title (e.g. "Networking I", "College Algebra", "Computer Fundamentals", "Electronics (Lab)", "Digital Electronics (Lec)", "Structured Programming")
3. "grade": Final grade (e.g. "1.5", "2.0", "1.9", "2.50", "Passed", "INC", "DRP")
4. "units": Credit units as a number (e.g. 3.0, 1.0, 2.0, 4.0, 12.0)

IMPORTANT EXTRACTION RULES:
- Extract EVERY subject from ALL semesters, terms, and DTS in-plant training.
- Do NOT skip separate Lab and Lecture components (extract both rows).
- Ensure units and grades are accurately matched to their corresponding subject row.
- Return ONLY a valid JSON array of objects.

JSON Format:
[
  {
    "code": "IT 113",
    "title": "Networking I",
    "grade": "1.9",
    "units": 3.0
  }
]"""

            contents = [prompt]
            if page_images_bytes and types:
                for img_b in page_images_bytes[:5]:  # send up to 5 pages
                    contents.append(types.Part.from_bytes(data=img_b, mime_type="image/png"))
            elif local_text:
                contents.append(f"Document OCR Text:\n{local_text}")

            response_text = await self._generate(contents, system_instruction="You are an expert at extracting academic transcript data from Philippine higher education institutions.")
            if response_text:
                cleaned = _clean_json_response(response_text)
                try:
                    raw_subjects = json.loads(cleaned)
                    if isinstance(raw_subjects, list) and raw_subjects:
                        normalized = []
                        seen = set()
                        for s in raw_subjects:
                            code = (s.get('code') or '').strip()
                            raw_t = s.get('title') or ''
                            title = clean_ocr_subject_title(raw_t)
                            if not code or code == 'UNCLEAR' or not title:
                                continue

                            units_raw = s.get('units')
                            try:
                                u_val = float(units_raw) if units_raw not in (None, '', 'UNCLEAR') else 0.0
                            except (ValueError, TypeError):
                                u_val = 0.0

                            if u_val <= 0:
                                if any(k in title.lower() for k in ['lab', 'laboratory', 'euthenics']):
                                    u_val = 1.0
                                elif any(k in title.lower() for k in ['pe', 'pathfit', 'sports', 'fitness', 'dance']):
                                    u_val = 2.0
                                else:
                                    u_val = 3.0

                            grade = str(s.get('grade') or 'Passed').strip()
                            if grade == 'UNCLEAR':
                                grade = 'Passed'

                            key = f"{code.upper().replace(' ', '')}_{title.lower()}"
                            if key in seen:
                                continue
                            seen.add(key)

                            normalized.append({
                                'code': code,
                                'title': title,
                                'grade': grade,
                                'units': u_val
                            })

                        # If Gemini returned substantial subjects, merge and return
                        if len(normalized) >= len(local_subjects):
                            return normalized
                        elif normalized:
                            # Merge local subjects not present in Gemini output
                            for ls in local_subjects:
                                l_key = f"{ls['code'].upper().replace(' ', '')}_{ls['title'].lower()}"
                                if l_key not in seen:
                                    seen.add(l_key)
                                    normalized.append(ls)
                            return normalized
                except json.JSONDecodeError:
                    print(f"Failed to parse OCR JSON response: {response_text[:200]}")

            return local_subjects
        except Exception as e:
            print(f"Error in OCR extraction: {str(e)}")
            file_bytes = _decode_document_bytes(image_base64)
            local_text = _extract_local_text(file_bytes)
            return _parse_tor_subjects_from_text(local_text)

    async def extract_work_experience_from_job_description(self, image_base64):
        """Extract work-experience evidence from an uploaded job description or role proof."""
        try:
            file_bytes = _decode_document_bytes(image_base64)
            local_text = _extract_local_text(file_bytes)
            local_work_data = _parse_job_description_from_text(local_text)

            if local_work_data and local_work_data.get('job_title') and local_work_data.get('confidence', 0) >= 50:
                return local_work_data

            if time.time() < self._circuit_breaker_until or not (self._client or (legacy_genai and self.api_key)):
                return local_work_data

            prompt = """Extract structured work-experience evidence from this uploaded job description or role document.

Return ONLY a valid JSON object with this exact structure:
{
  "company_name": "Company name if visible, otherwise empty string",
  "job_title": "Job title or role name",
  "years": 0,
  "job_description": "Short cleaned summary of the role",
  "is_it_related": true,
  "confidence": 0
}

Rules:
- Set "is_it_related" to true only if the role is clearly IT-related.
- Use "years" only if the document explicitly mentions experience duration; otherwise use 0.
- If the company name is not clearly visible, return an empty string.
- Return a confidence score from 0 to 100.
- Do not include explanatory text, just the JSON object."""

            contents = [prompt]
            if file_bytes and types:
                mime = "application/pdf" if file_bytes.startswith(b'%PDF') else "image/png"
                contents.append(types.Part.from_bytes(data=file_bytes, mime_type=mime))
            elif local_text:
                contents.append(f"Document OCR Text:\n{local_text}")

            response_text = await self._generate(contents, system_instruction="You extract work-experience evidence from uploaded job description documents.")
            if response_text:
                cleaned = _clean_json_response(response_text)
                try:
                    payload = json.loads(cleaned)
                    if isinstance(payload, dict) and payload:
                        return payload
                except json.JSONDecodeError:
                    print(f"Failed to parse job description OCR response: {response_text[:200]}")
            return local_work_data
        except Exception as e:
            print(f"Error in job description extraction: {str(e)}")
            file_bytes = _decode_document_bytes(image_base64)
            local_text = _extract_local_text(file_bytes)
            return _parse_job_description_from_text(local_text)

    def match_subject_sync(self, tor_subject_data, curriculum_subjects):
        """Match a TOR subject against curriculum subjects using multi-stage hybrid AI & ontology (sync)"""
        try:
            def _local_match_subjects():
                matches = []
                raw_title = tor_subject_data.get('title') or ''
                cleaned_title = clean_ocr_subject_title(raw_title)
                
                tor_code = (tor_subject_data.get('code') or '').upper().replace(' ', '').replace('-', '')
                tor_title = cleaned_title.lower().strip()
                tor_compact = re.sub(r'[^a-z0-9]+', '', tor_title)
                stopwords = {
                    'and', 'for', 'the', 'with', 'from', 'into', 'that', 'this',
                    'of', 'in', 'on', 'to', 'a', 'an', 'semester', 'course',
                    'courses', 'subject', 'subjects', 'general', 'education', 'elective',
                }

                def _meaningful_tokens(text):
                    tokens = set()
                    for token in re.findall(r"[a-z0-9]+", (text or '').lower()):
                        if len(token) < 2 or token in stopwords:
                            continue
                        tokens.add(token)
                    return tokens

                tor_tokens = _meaningful_tokens(tor_title)

                synonym_groups = [
                    {'programming', 'coding', 'development', 'software', 'programmer', 'structured'},
                    {'computer', 'computing', 'it', 'information', 'technology', 'pc'},
                    {'database', 'databases', 'dbms', 'sql', 'relational'},
                    {'network', 'networks', 'networking', 'telecommunications', 'telecom', 'cisco'},
                    {'analysis', 'design', 'system', 'systems', 'architecture', 'integration'},
                    {'web', 'internet', 'frontend', 'backend', 'fullstack', 'website'},
                    {'security', 'cybersecurity', 'assurance', 'infosec', 'safety'},
                    {'multimedia', 'graphics', 'animation', 'media', 'digital'},
                    {'management', 'project', 'capstone', 'research', 'thesis'},
                    {'discrete', 'structures', 'mathematics', 'math', 'algebra', 'calculus'},
                    {'human', 'interaction', 'ui', 'ux', 'interface', 'usability'},
                    {'mobile', 'android', 'ios', 'apps', 'application', 'applications'},
                    {'hardware', 'troubleshooting', 'maintenance', 'pc', 'servicing', 'electronics'},
                    {'purposive', 'communication', 'english', 'speech', 'oral', 'writing', 'grammar', 'composition'},
                    {'history', 'philippine', 'readings', 'government', 'society', 'social', 'science'},
                    {'nstp', 'cwts', 'rotc', 'national', 'service', 'training'},
                    {'pe', 'pathfit', 'physical', 'fitness', 'sports', 'movement', 'exercise', 'activities'},
                ]

                # Complete CHED HEI Curriculum Ontology & Equivalence Knowledge Graph
                academic_equiv = [
                    # 1. Fundamentals of Programming (CSIT121)
                    (['CSIT121'], [
                        'computer programming 1', 'fundamentals of programming', 'programming 1', 'logic formulation',
                        'computer programming i', 'intro to programming', 'structured programming', 'introductory programming',
                        'c programming', 'c++ programming 1', 'turbo c', 'programming logic and design', 'logic formulation and design',
                        'c programming 1', 'computer fundamentals and programming', 'computer concepts and programming',
                        'programming 1 (c/c++)', 'fundamentals of computer programming', 'introduction to programming (c-language)',
                        'intro to programming (c-language)', 'introduction to programming', 'intpro', 'compr1'
                    ]),
                    (['CSIT122'], [
                        'computer programming 2', 'intermediate programming', 'programming 2', 'computer programming ii',
                        'advanced programming', 'c++ programming 2', 'intermediate computer programming', 'programming logic 2',
                        'structured programming 1', 'structured programming i', 'compr2'
                    ]),
                    (['CSIT227'], [
                        'object-oriented programming', 'object oriented programming', 'oop', 'java programming',
                        'c++ programming', 'object-oriented programming 1', 'object oriented programming 1', 'java 1',
                        'c# programming', 'object-oriented analysis and design', 'visual programming', 'visual basic',
                        'vb.net', 'java programming 1', 'object oriented programming in java', 'object oriented programming in c++',
                        'computer programming 3', 'structured programming ii', 'structured programming 2', 'compr3'
                    ]),
                    (['CSIT228'], [
                        'object-oriented programming 2', 'object oriented programming 2', 'advanced object-oriented programming',
                        'advanced oop', 'java 2', 'java programming 2', 'advanced java', 'advanced c#',
                        'application programming', 'application programming 1', 'application programming i',
                        'application programming ii', 'application programming 2'
                    ]),
                    (['CSIT112'], [
                        'discrete structures', 'discrete mathematics', 'discrete structures 1', 'discrete math',
                        'discrete structures i', 'combinatorics', 'graph theory', 'discrete structures and graph theory',
                        'discrete mathematics with graph theory', 'mathematics for computer science',
                        'symbolic logic', 'symlog', 'mathematical logic'
                    ]),
                    (['CSIT111'], [
                        'introduction to computing', 'intro to computing', 'computer fundamentals', 'introduction to computer studies',
                        'intro to computer science', 'it fundamentals', 'intro to it', 'introduction to it', 'pc operations',
                        'computer literacy', 'living in the it era', 'information technology concepts', 'computing fundamentals',
                        'computer concepts and applications', 'information technology fundamentals',
                        'business application software', 'computer applications', 'comfun', 'bas'
                    ]),
                    (['CS132'], [
                        'introduction to computer systems', 'pc hardware', 'hardware and troubleshooting', 'computer systems',
                        'computer architecture', 'computer hardware', 'pc hardware and troubleshooting', 'computer hardware and servicing',
                        'computer system servicing', 'hardware servicing', 'digital electronics', 'digital electronics (lab)',
                        'digital electronics (lec)', 'digital electronics lab', 'digital electronics lec',
                        'electronics (lab)', 'electronics (lec)', 'electronics lab', 'electronics lec', 'electronics',
                        'microprocessor systems', 'computer assembly and maintenance', 'operating systems', 'operating system',
                        'css nc ii', 'computer technician course', 'computer assembly, maintenance and troubleshooting'
                    ]),
                    (['CSIT226'], [
                        'database management systems', 'database management', 'database systems', 'fundamentals of database',
                        'information management 1', 'information management', 'dbms', 'intro to database', 'relational database',
                        'database concepts', 'sql fundamentals', 'data management', 'relational database management systems',
                        'sql server', 'mysql database', 'oracle database 1', 'ms access and sql', 'database design and management'
                    ]),
                    (['CSIT327'], [
                        'advanced database', 'information management 2', 'advanced dbms', 'database administration',
                        'data warehousing', 'nosql databases', 'big data', 'oracle database 2', 'data warehousing and mining',
                        'database administration and security'
                    ]),
                    (['CSIT221'], [
                        'data structures and algorithms', 'data structures', 'algorithms and data structures',
                        'data structures and algorithm analysis', 'data structure and algorithms', 'design and analysis of algorithms',
                        'algorithms and complexity', 'advanced data structures'
                    ]),
                    (['CSIT201'], [
                        'web development', 'web systems and technologies', 'web design', 'web development fundamentals',
                        'advanced web design', 'internet programming', 'web programming', 'web technologies', 'web applications',
                        'web development 1', 'web development 2', 'platform-based development 2 (web)', 'basic internet',
                        'internet concepts', 'web page design', 'web page design and development', 'web page development',
                        'html and css', 'client-side web development', 'server-side web development',
                        'php and mysql', 'full-stack web development', 'e-commerce technology', 'web development technologies', 'webpd'
                    ]),
                    (['CSIT104'], [
                        'platform-based development 1 (multimedia)', 'multimedia systems', 'multimedia technologies', 'digital media',
                        'computer graphics', 'multimedia and animation', 'multimedia arts', 'audio video production', '2d animation',
                        '3d animation', 'desktop publishing', 'interactive media', 'digital graphics and animation',
                        'multimedia development', 'muldev'
                    ]),
                    (['CSIT213'], [
                        'social issues and professional practice', 'social issues in computing', 'professional ethics in it',
                        'it ethics', 'social and professional issues', 'computer ethics', 'it laws and ethics', 'legal issues in computing'
                    ]),
                    (['CSIT238'], [
                        'human computer interaction', 'human-computer interaction', 'hci', 'ui/ux design', 'user interface design',
                        'user experience design', 'ui design', 'ux design', 'interaction design', 'usability engineering',
                        'user interface and user experience design', 'human computer interface'
                    ]),
                    (['CSIT284'], [
                        'platform-based development 3 (mobile)', 'platform-based development 3', 'mobile programming',
                        'mobile application development', 'mobile development', 'android programming', 'ios programming',
                        'mobile app development', 'cross-platform mobile development'
                    ]),
                    (['IT227'], [
                        'networking 1', 'networking fundamentals', 'computer networks', 'data communications and networking',
                        'network fundamentals', 'cisco 1', 'ccna 1', 'intro to networking', 'introduction to networking',
                        'networking i', 'data communications', 'telecommunications', 'lan fundamentals',
                        'computer networking and data communication', 'structured cabling system', 'structured cabling', 'stcab', 'net1'
                    ]),
                    (['IT228'], [
                        'networking 2', 'routing and switching', 'advanced networking', 'cisco 2', 'ccna 2', 'networking ii',
                        'networking iii', 'networking iv', 'networking v', 'networking vi', 'networking 3', 'networking 4',
                        'network administration', 'wan technologies', 'cisco 3', 'cisco 4', 'scaling networks', 'advanced computer networks'
                    ]),
                    (['CSIT385'], [
                        'information assurance and security 1', 'information security', 'cybersecurity', 'information assurance',
                        'principles of information security', 'fundamentals of cybersecurity', 'infosec', 'network security',
                        'general and industrial safety 1', 'general and industrial safety i', 'general and industrial safety 2',
                        'general and industrial safety ii', 'general safety 1', 'general safety i',
                        'industrial safety', 'industrial safety iii', 'it safety and security', 'information security fundamentals',
                        'computer security', 'security principles'
                    ]),
                    (['IT386'], [
                        'information assurance and security 2', 'information assurance 2', 'network security 2',
                        'advanced security', 'security audit', 'cybersecurity 2', 'incident response'
                    ]),
                    (['IT342'], [
                        'systems integration and architecture 1', 'systems analysis and design', 'system analysis and design',
                        'enterprise architecture', 'systems integration', 'software design', 'sad', 'system analysis and software engineering',
                        'software architecture', 'business system development', 'business systems development', 'sysdes', 'busdev'
                    ]),
                    (['IT344'], [
                        'systems administration and maintenance', 'system administration', 'server administration',
                        'network and systems administration', 'linux administration', 'windows server', 'server maintenance',
                        'systems and network administration'
                    ]),
                    (['CSIT321', 'CSITELEC1'], [
                        'applications development and emerging technologies', 'emerging technologies in it', 'emerging trends in computing',
                        'advanced application development', 'software engineering 2', 'application programming',
                        'application programming i', 'application programming ii', 'application programming 1', 'application programming 2'
                    ]),
                    (['IT317'], [
                        'project management for it', 'it project management', 'project management', 'software engineering',
                        'software engineering 1', 'software project management', 'it quality assurance',
                        'it project management and quality assurance', 'projmg', 'principles of management'
                    ]),
                    (['IT365'], [
                        'data analytics', 'data analytics 1', 'data analysis', 'business analytics', 'data science fundamentals', 'data mining'
                    ]),
                    (['ES038'], [
                        'technopreneurship', 'entrepreneurship', 'techno entrepreneurship', 'business planning',
                        'principles of management', 'new business creation', 'principles of accounting'
                    ]),
                    (['CSIT212'], [
                        'quantitative methods', 'statistics', 'probability and statistics', 'biostatistics',
                        'operations research', 'quantitative techniques'
                    ]),
                    (['IT334'], [
                        'is strategy', 'information systems strategy', 'strategic information systems', 'it strategy', 'enterprise systems strategy'
                    ]),
                    (['IT332'], [
                        'capstone and research 1', 'capstone project 1', 'capstone 1', 'undergraduate thesis 1',
                        'methods of research', 'it research', 'research methodology', 'technical research', 'thesis 1',
                        'project study 1', 'project study i', 'project study 2', 'project study ii'
                    ]),
                    (['IT411'], [
                        'capstone and research 2', 'capstone project 2', 'capstone 2', 'undergraduate thesis 2',
                        'thesis defense', 'thesis 2', 'project study 3', 'project study iii'
                    ]),
                    (['IT412'], [
                        'ojt/practicum', 'practicum', 'on-the-job training', 'ojt', 'internship', 'industry practicum',
                        'supervised industrial training', 'industry internship', 'practicum course'
                    ]),
                    (['ENGL031'], [
                        'purposive communication', 'communication arts', 'communication arts and skills 1',
                        'communication arts and skills 2', 'communication arts and skills', 'communication arts 1',
                        'communication arts 2', 'comsk1', 'comsk2', 'english 1', 'english 2', 'oral communication',
                        'speech communication', 'technical writing', 'grammar and composition', 'study and thinking skills',
                        'business communication', 'writing in the discipline', 'college english', 'english plus',
                        'speech and oral communication', 'effective communication', 'public speaking', 'pubspk'
                    ]),
                    (['MATH031'], [
                        'mathematics in the modern world', 'college algebra', 'general mathematics', 'advance algebra',
                        'algebra', 'algbra', 'trigonometry', 'college trigonometry', 'analytic geometry',
                        'elementary statistics', 'contemporary mathematics', 'differential calculus',
                        'integral calculus', 'basic calculus', 'applied mathematics', 'business mathematics', 'college algebra and trigonometry'
                    ]),
                    (['SOCSCI031'], [
                        'readings in philippine history', 'philippine history', 'philippine history and government',
                        'philippine government and constitution', 'social science 1', 'social science i', 'social science 2',
                        'social science ii', 'social science 3', 'social science iii', 'society and culture',
                        'general sociology', 'philippine governance', 'politics and governance',
                        'philippine history with politics and governance', 'philippine political and social life'
                    ]),
                    (['SOCSCI032'], [
                        'the contemporary world', 'contemporary world', 'globalization', 'global culture'
                    ]),
                    (['PSYCH031'], [
                        'understanding the self', 'general psychology', 'intro to psychology', 'personality development',
                        'human behavior', 'general psychology with drug education'
                    ]),
                    (['RIZAL031'], [
                        'the life and works of rizal', 'life and works of rizal', 'rizal course', 'rizal', 'rizals life and works'
                    ]),
                    (['PHILO031'], [
                        'ethics', 'moral philosophy', 'professional ethics', 'ethics in it', 'basic christian doctrine 1',
                        'basic christian doctrine i', 'basic christian doctrine 2', 'basic christian doctrine ii',
                        'basic christian doctrine 3', 'basic christian doctrine iii', 'basic christian doctrine 4',
                        'basic christian doctrine iv', 'basic christian doctrine v', 'basic christian doctrine vi',
                        'basic christian doctrine vii', 'basic christian doctrine viii', 'basic christian doctrine',
                        'christian doctrine', 'religious education', 'values education', 'logic and critical thinking',
                        'philosophy of man', 'logic', 'critical thinking', 'christian living',
                        'professional ethics and values education', 'preval'
                    ]),
                    (['STS031'], [
                        'science, technology and society', 'science technology and society', 'sts', 'environmental science',
                        'general science', 'earth science', 'ecology', 'biological science', 'physical science'
                    ]),
                    (['HUM031'], [
                        'art appreciation', 'humanities', 'humanities 1', 'intro to art', 'arts and society'
                    ]),
                    (['NSTP111'], [
                        'national service training program 1', 'national service training program i', 'nstp 1', 'nstp 113',
                        'nstp i', 'cwts 1', 'rotc 1', 'civic welfare service 1', 'civic welfare service', 'civic welfare training service 1',
                        'military science 1', 'nstp01'
                    ]),
                    (['NSTP112'], [
                        'national service training program 2', 'national service training program ii', 'nstp 2', 'nstp 123',
                        'nstp ii', 'cwts 2', 'rotc 2', 'civic welfare service 2', 'civic welfare training service 2',
                        'military science 2', 'nstp02'
                    ]),
                    (['PE103'], [
                        'pathfit 1', 'physical education 1', 'pe 1', 'physical fitness', 'pe i', 'self testing activities',
                        'physical fitness and gymnastics', 'movement competency', 'phyed1'
                    ]),
                    (['PE104'], [
                        'pathfit 2', 'physical education 2', 'pe 2', 'rhythmic activities', 'fundamentals of rhythmic activities',
                        'pe ii', 'fitness and dance', 'dance', 'aerobics', 'phyed2'
                    ]),
                    (['PE205'], [
                        'pathfit 3', 'physical education 3', 'pe 3', 'individual and dual sports', 'individual/dual sports',
                        'pe iii', 'swimming', 'badminton', 'table tennis', 'phyed3'
                    ]),
                    (['PE206'], [
                        'pathfit 4', 'physical education 4', 'pe 4', 'team sports', 'pe iv', 'basketball', 'volleyball', 'phyed4'
                    ]),
                    (['GE-CCS1'], [
                        'general education elective 1', 'sustainable development goals', 'sdg', 'social science 1',
                        'social science i', 'social science 2', 'social science ii', 'social science 3', 'social science iii',
                        'social science', 'society and culture'
                    ]),
                    (['GE-CCS2'], [
                        'general education elective 2', 'environmental science', 'ecology', 'earth science', 'environmental studies'
                    ]),
                    (['GE-CCS3'], [
                        'general education elective 3', 'technical writing', 'technical report writing', 'scientific writing',
                        'business and technical writing', 'effective technical writing', 'tecwrt'
                    ]),
                    (['ITFREEEL1'], [
                        'free elective 1', 'testing and quality assurance', 'software testing', 'quality assurance', 'qa',
                        'total productive maintenance', 'production planning and process control', 'increasing training effectiveness'
                    ]),
                    (['CSITELEC2'], [
                        'csit elective 2', 'applied ai', 'artificial intelligence', 'advanced multimedia systems',
                        'interactive digital multimedia', 'multimedia technologies', 'industry elective 4'
                    ]),
                    (['CSITELEC3'], [
                        'csit elective 3', 'advanced web systems', 'full stack web systems', 'web systems',
                        'full stack development', 'web development 2', 'industry elective 2'
                    ]),
                    (['CSITELEC4'], [
                        'csit elective 4', 'advanced mobile technologies', 'mobile programming', 'mobile app development',
                        'blockchain', 'industry elective 3'
                    ]),
                    (['IT-FREEEL2'], [
                        'free elective 2', 'foreign language', 'nihongo', 'japanese 1', 'foreign language 1', 'conversational japanese'
                    ]),
                ]

                # Build lookup: curriculum code -> list of equivalent TOR titles
                equiv_by_code = {}
                for targets, keywords in academic_equiv:
                    for code in targets:
                        normalized_code = code.upper().replace(' ', '').replace('-', '')
                        equiv_by_code.setdefault(normalized_code, []).extend(keywords)

                def _compact(text):
                    return re.sub(r'[^a-z0-9]+', '', (text or '').lower())

                def _extract_seq_level(text, code=''):
                    full = f" {code} {text} ".lower()
                    # Level 4 / IV
                    if re.search(r'\b(?:level\s*4|part\s*4|iv|4th|phyed4|pe\s*4)\b', full):
                        return 4
                    # Level 3 / III
                    if re.search(r'\b(?:level\s*3|part\s*3|iii|3rd|phyed3|pe\s*3)\b', full):
                        return 3
                    # Level 2 / II
                    if re.search(r'\b(?:level\s*2|part\s*2|ii|2nd|phyed2|pe\s*2|nstp02|nstp\s*123|nstp\s*2|cwts\s*2)\b', full):
                        return 2
                    # Level 1 / I
                    if re.search(r'\b(?:level\s*1|part\s*1|\bi\b|1st|phyed1|pe\s*1|nstp01|nstp\s*113|nstp\s*1|cwts\s*1)\b', full):
                        return 1
                    return None

                def _token_similarity(a_tokens, b_tokens):
                    if not a_tokens or not b_tokens:
                        return 0.0
                    inter = a_tokens.intersection(b_tokens)
                    base = len(inter) / max(1, min(len(a_tokens), len(b_tokens)))
                    bonus = 0.0
                    for group in synonym_groups:
                        if group.intersection(a_tokens) and group.intersection(b_tokens):
                            bonus += 0.2
                    return min(1.0, base + bonus)

                raw_units = tor_subject_data.get('units')
                tor_units = None
                try:
                    if raw_units is not None and str(raw_units).strip() not in ('', 'UNCLEAR', 'None'):
                        tor_units = float(raw_units)
                except (ValueError, TypeError):
                    tor_units = None

                tor_level = _extract_seq_level(raw_title, tor_code)

                for s in curriculum_subjects:
                    ccode = (s.get('code') or '').upper().replace(' ', '').replace('-', '')
                    ctitle = (s.get('title') or '').lower().strip()
                    cdesc = (s.get('description') or '').lower().strip()
                    c_compact = _compact(ctitle)
                    cur_tokens = _meaningful_tokens(f"{ctitle} {cdesc}")
                    cur_level = _extract_seq_level(ctitle, ccode)

                    # Sequence Level Incompatibility Check: If explicit levels differ for sequential course families
                    if tor_level is not None and cur_level is not None and tor_level != cur_level:
                        seq_families = ['nstp', 'pe', 'pathfit', 'programming', 'networking', 'sports', 'doctrine']
                        if any(fam in tor_title or fam in ctitle for fam in seq_families):
                            continue

                    # Unit Sufficiency Check: If applicant units < curriculum units, it cannot match
                    cur_units = None
                    try:
                        if s.get('units') is not None and str(s.get('units')).strip() not in ('', 'UNCLEAR', 'None'):
                            cur_units = float(s.get('units'))
                    except (ValueError, TypeError):
                        cur_units = None

                    if tor_units is not None and tor_units > 0 and cur_units is not None and cur_units > 0:
                        if tor_units < cur_units:
                            continue

                    # 1. Exact code match
                    exact_code = bool(tor_code and ccode and tor_code == ccode)
                    # 2. Exact title match
                    exact_title = bool(tor_title and ctitle and (
                        tor_title == ctitle or
                        tor_compact == c_compact
                    ))

                    if exact_code or exact_title:
                        matches.append({
                            'curriculum_code': s['code'],
                            'curriculum_title': s['title'],
                            'confidence': 98 if exact_code else 96,
                            'reasoning': f"Exact syllabus match: '{raw_title}' aligns directly with '{s['title']}' ({s['code']})"
                        })
                        continue

                    # 3. Knowledge-based academic equivalence
                    equiv_keywords = equiv_by_code.get(ccode, [])
                    rule_matched = False
                    for kw in equiv_keywords:
                        kw_compact = _compact(kw)
                        kw_level = _extract_seq_level(kw)
                        if tor_level is not None and kw_level is not None and tor_level != kw_level:
                            continue
                        
                        if (kw == tor_title or kw_compact == tor_compact or
                            kw in tor_title or tor_title in kw or
                            (kw_compact and (kw_compact in tor_compact or tor_compact in kw_compact))):
                            conf = 95 if (kw == tor_title or kw_compact == tor_compact) else 94
                            matches.append({
                                'curriculum_code': s['code'],
                                'curriculum_title': s['title'],
                                'confidence': conf,
                                'reasoning': f"Equivalent academic competency: '{raw_title}' covers same syllabus learning outcomes as '{s['title']}' ({s['code']})"
                            })
                            rule_matched = True
                            break
                    if rule_matched:
                        continue

                    # 4. Fuzzy title & semantic similarity
                    token_sim = _token_similarity(tor_tokens, cur_tokens)
                    compact_ratio = SequenceMatcher(None, tor_compact, c_compact).ratio() if tor_compact and c_compact else 0.0
                    is_sub = bool(tor_title and ctitle and (
                        tor_title in ctitle or ctitle in tor_title or
                        tor_compact in c_compact or c_compact in tor_compact
                    ))
                    score = max(token_sim, compact_ratio)
                    if is_sub:
                        score = max(score, 0.82)

                    if score >= 0.70:
                        conf = int(min(88, max(70, score * 90)))
                        matches.append({
                            'curriculum_code': s['code'],
                            'curriculum_title': s['title'],
                            'confidence': conf,
                            'reasoning': f"Strong syllabus topic overlap between '{raw_title}' and '{s['title']}' ({s['code']})"
                        })

                # Deduplicate by curriculum code, keep highest confidence
                seen = set()
                deduped = []
                matches.sort(key=lambda x: x['confidence'], reverse=True)
                for m in matches:
                    if m['curriculum_code'] not in seen:
                        seen.add(m['curriculum_code'])
                        deduped.append(m)
                return deduped[:3]

            return _local_match_subjects()
        
        except Exception as e:
            print(f"Error in subject matching: {str(e)}")
            return []

    async def match_subject(self, tor_subject_data, curriculum_subjects):
        return self.match_subject_sync(tor_subject_data, curriculum_subjects)

    def summarize_applicant_sync(self, application_evidence):
        """Generate a short summary of the applicant's work experience and job description (sync)."""
        try:
            work_exps = application_evidence.get('work_experiences', []) or []
            roles = [w.get('job_title') for w in work_exps if w.get('job_title')]
            companies = [w.get('company_name') for w in work_exps if w.get('company_name')]
            total_years = sum(float(w.get('years', 0) or 0) for w in work_exps)

            summary_text = f"Applicant has {total_years:g} years of recorded experience across {len(roles)} role(s)"
            if companies:
                summary_text += f" at {', '.join(companies[:2])}."
            else:
                summary_text += "."

            highlights = []
            for w in work_exps[:3]:
                if w.get('job_title'):
                    highlights.append(f"{w.get('job_title')} ({w.get('years',0)}y) - {w.get('company_name','')}")

            return {
                'summary': summary_text,
                'highlights': highlights,
                'confidence': 75 if roles else 50
            }
        except Exception as e:
            print(f"Error in summarization: {e}")
            return {'summary': 'Applicant evidence recorded.', 'highlights': [], 'confidence': 50}

    async def summarize_applicant(self, application_evidence):
        return self.summarize_applicant_sync(application_evidence)

    def match_work_experience_sync(self, work_data, curriculum_subjects):
        """Match work experience to curriculum subjects (sync) - supports unlimited 1-to-many crediting."""
        try:
            matches = []
            title = (work_data.get('job_title') or '').lower()
            desc = (work_data.get('description') or '').lower()
            years = float(work_data.get('years') or 0)
            combined_text = f"{title} {desc}".lower()

            # Domain keyword mapping for richer multi-subject crediting
            DOMAIN_PATTERNS = {
                'web': ['web', 'frontend', 'backend', 'full stack', 'fullstack', 'html', 'css', 'javascript', 'react', 'vue', 'angular', 'node', 'django', 'flask', 'php', 'laravel', 'asp.net', 'rest', 'api', 'http'],
                'programming': ['developer', 'programmer', 'software engineer', 'coding', 'oop', 'java', 'python', 'c#', 'c++', 'algorithms', 'data structures'],
                'database': ['database', 'dbms', 'sql', 'mysql', 'postgresql', 'oracle', 'mongodb', 'redis', 'nosql', 'queries', 'schema', 'tables', 'data management', 'normalization'],
                'networking': ['network', 'networking', 'cisco', 'lan', 'wan', 'routing', 'switching', 'tcp/ip', 'dns', 'vpn', 'firewall', 'subnetting', 'telecom', 'wireless'],
                'security': ['security', 'cyber', 'infosec', 'cybersecurity', 'penetration', 'vulnerability', 'encryption', 'ssl', 'auth', 'iam', 'firewall', 'soc', 'compliance'],
                'sysadmin': ['sysadmin', 'system admin', 'systems administrator', 'linux', 'unix', 'windows server', 'devops', 'cloud', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'virtualization', 'vmware'],
                'systems_analysis': ['analyst', 'systems analyst', 'business analyst', 'requirements', 'uml', 'agile', 'scrum', 'sdlc', 'software design', 'architecture', 'specifications'],
                'project_management': ['project manager', 'scrum master', 'team lead', 'tech lead', 'product owner', 'jira', 'sprint', 'deliverables', 'milestones', 'it project'],
                'support': ['technical support', 'helpdesk', 'it support', 'desktop support', 'hardware', 'troubleshooting', 'maintenance', 'repair', 'installation']
            }

            for s in curriculum_subjects:
                ctitle = (s.get('title') or '').lower()
                cdesc = (s.get('description') or '').lower()
                ccode = s.get('code') or ''
                cur_text = f"{ctitle} {cdesc}".lower()

                tokens = set(re.findall(r"\w{3,}", combined_text))
                cur_tokens = set(re.findall(r"\w{3,}", cur_text))
                
                # Direct token overlap
                inter = tokens.intersection(cur_tokens)
                overlap_score = len(inter)

                # Domain match score
                domain_bonus = 0
                matched_domains = []
                for domain, kw_list in DOMAIN_PATTERNS.items():
                    work_has = any(kw in combined_text for kw in kw_list)
                    cur_has = any(kw in cur_text for kw in kw_list)
                    if work_has and cur_has:
                        domain_bonus += 2
                        matched_domains.append(domain)

                total_score = overlap_score + domain_bonus
                if total_score > 0 or (years >= 2 and overlap_score > 0):
                    confidence = int(min(95, 40 + total_score * 8 + min(30, int(years * 5))))
                    if confidence >= 60:
                        reason_indicators = list(inter)[:3] + matched_domains[:2]
                        reason_str = ', '.join(reason_indicators) if reason_indicators else 'aligned skillset'
                        reason = f"Experience alignment ({reason_str}); {years:g} yrs experience"
                        matches.append({
                            'curriculum_code': ccode,
                            'curriculum_title': s.get('title', ''),
                            'confidence': confidence,
                            'reasoning': reason
                        })

            matches.sort(key=lambda x: x['confidence'], reverse=True)
            return matches
        except Exception as e:
            print(f"Error in work experience matching: {str(e)}")
            return []

    async def match_work_experience(self, work_data, curriculum_subjects):
        return self.match_work_experience_sync(work_data, curriculum_subjects)

    def recommend_program_sync(self, work_experiences):
        """Recommend the best program based on work experiences (sync)"""
        program_keywords = {
            'BSIT': ['developer', 'web', 'frontend', 'backend', 'software', 'it', 'ui', 'ux', 'systems', 'devops', 'technical support'],
            'BSCS': ['data', 'machine learning', 'ml', 'algorithm', 'research', 'data scientist', 'software engineer'],
            'BSCpE': ['hardware', 'embedded', 'firmware', 'electronics', 'circuit', 'embedded systems'],
            'BSBA': ['manager', 'marketing', 'sales', 'business', 'administrator', 'administration'],
            'BSA': ['accountant', 'accounting', 'auditor', 'audit', 'finance']
        }
        scores = {k: 0 for k in program_keywords.keys()}
        matches = {k: [] for k in program_keywords.keys()}

        for exp in work_experiences or []:
            text = f"{exp.get('job_title','')} {exp.get('job_description','')}".lower()
            for prog, kws in program_keywords.items():
                for kw in kws:
                    if kw in text:
                        scores[prog] += 1
                        matches[prog].append(kw)

        best_prog = max(scores.keys(), key=lambda p: scores[p])
        best_score = scores[best_prog]

        if best_score == 0:
            return {
                'program': 'BSIT',
                'confidence': 50,
                'reasoning': 'No clear signals in uploaded documents. Defaulting to BSIT as a general IT program.',
                'career_alignment': '',
                'strengths': []
            }

        confidence = min(90, 55 + best_score * 10)
        unique_matches = sorted(set(matches[best_prog]))
        reasoning = f"Keywords matched: {', '.join(unique_matches)}." if unique_matches else 'Matches found in work experience.'
        career_alignment = f"Your role(s) contain terms related to {best_prog}, which suggests alignment with that program." 
        return {
            'program': best_prog,
            'confidence': confidence,
            'reasoning': reasoning,
            'career_alignment': career_alignment,
            'strengths': unique_matches
        }

    async def recommend_program(self, work_experiences):
        return self.recommend_program_sync(work_experiences)

    async def chat_with_bot(self, conversation_history, user_message, user_context=None):
        """Chat with the ETEEAP assistant bot using Google Gemini"""
        try:
            system_instruction = """You are AccrediaBot, the official AI assistant for ACCREDIA, the CIT-U AI Credit Evaluation System for ETEEAP (Expanded Tertiary Education Equivalency and Accreditation Program) at Cebu Institute of Technology - University.

Your role:
- Help users understand the ETEEAP process
- Answer questions about credit evaluation at CIT-University
- Explain how TOR subject matching and work experience credit works
- Guide applicants through the application process
- Provide information about BSIT and other programs at CIT-U

ETEEAP allows working professionals to get academic credit for:
- Prior formal education (through Transcript of Records - TOR)
- Work experience (relevant job roles count for course credits)
- Professional certifications
- Life experiences

Be helpful, professional, and concise. Keep responses under 200 words."""
            
            if user_context:
                system_instruction += f"\n\nUser Context: {user_context}"
            
            contents = []
            if conversation_history:
                for item in conversation_history[-6:]:
                    role = item.get('role', 'user')
                    msg_text = item.get('content', '')
                    if msg_text:
                        contents.append(f"{role.capitalize()}: {msg_text}")
            contents.append(user_message)
            full_prompt = "\n".join(contents) if len(contents) > 1 else user_message

            response_text = await self._generate(full_prompt, system_instruction=system_instruction)
            if response_text:
                return response_text.strip()
            return "I apologize, but I'm having trouble processing your message right now. Please try again."
        
        except Exception as e:
            print(f"Error in chat: {str(e)}")
            return "I apologize, but I'm having trouble processing your message right now. Please try again."


gemini_service = GeminiService()

