import os
import json
import asyncio
import base64
import re
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


def _ocr_image_bytes(file_bytes):
    engine = _get_local_ocr_engine()
    if engine is None or not file_bytes:
        return ''

    try:
        image = Image.open(BytesIO(file_bytes)).convert('RGB')
        result = engine(np.array(image))
        if isinstance(result, tuple):
            result = result[0]

        lines = []
        for item in result or []:
            if isinstance(item, dict):
                text = item.get('text') or item.get('transcription') or ''
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                text = item[1]
            else:
                text = ''

            text = str(text).strip()
            if text:
                lines.append(text)

        return '\n'.join(lines)
    except Exception:
        return ''


def _extract_text_from_pdf_bytes(file_bytes):
    if fitz is None or not file_bytes:
        return ''

    texts = []
    try:
        pdf = fitz.open(stream=file_bytes, filetype='pdf')
    except Exception:
        return ''

    try:
        for page in pdf:
            page_text = (page.get_text('text') or '').strip()
            if page_text:
                texts.append(page_text)
                continue

            engine = _get_local_ocr_engine()
            if engine is None:
                continue

            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image = Image.frombytes('RGB', [pixmap.width, pixmap.height], pixmap.samples)
            result = engine(np.array(image))
            if isinstance(result, tuple):
                result = result[0]

            page_lines = []
            for item in result or []:
                if isinstance(item, dict):
                    text = item.get('text') or item.get('transcription') or ''
                elif isinstance(item, (list, tuple)) and len(item) >= 2:
                    text = item[1]
                else:
                    text = ''

                text = str(text).strip()
                if text:
                    page_lines.append(text)

            if page_lines:
                texts.append('\n'.join(page_lines))
    finally:
        pdf.close()

    return '\n'.join(texts)


def _extract_local_text(file_bytes):
    if not file_bytes:
        return ''

    if file_bytes.startswith(b'%PDF'):
        return _extract_text_from_pdf_bytes(file_bytes)

    pdf_text = _extract_text_from_pdf_bytes(file_bytes)
    if pdf_text:
        return pdf_text

    return _ocr_image_bytes(file_bytes)


def _parse_tor_subjects_from_text(text):
    subjects = []
    seen_codes = set()

    def _looks_like_grade(token):
        return bool(re.fullmatch(r'(?:\d+(?:\.\d+)?)|A\+?|B\+?|C\+?|D\+?|F|P|PASSED|FAILED|INC|INCOMPLETE|DRP', token, re.IGNORECASE))

    def _looks_like_units(token):
        return bool(re.fullmatch(r'\d+(?:\.\d+)?', token))

    def _is_code_line(line):
        return bool(re.fullmatch(r'[A-Z]{2,5}\s?-?\s?\d{2,4}[A-Z]?', line.strip(), re.IGNORECASE))

    def _is_heading(line):
        normalized = re.sub(r'\s+', '', line).lower()
        return (
            'semester' in normalized
            or normalized in {'coursecode', 'coursecodeandnumber', 'coursetitle', 'grade', 'credits', 'andnumber', 'final', 'completion'}
            or normalized.startswith('admissiondata')
            or normalized.startswith('remarks')
            or normalized.startswith('dateissued')
            or normalized.startswith('issuedby')
            or normalized.startswith('grading')
            or normalized.startswith('note')
        )

    def _add_subject(code, title, units, grade=''):
        code = re.sub(r'\s+', '', (code or '').upper())
        title = re.sub(r'\s+', ' ', (title or '')).strip(' -:;|')
        if not code or code in seen_codes or not title:
            return
        try:
            units_val = int(float(units))
        except (TypeError, ValueError):
            units_val = 0
        seen_codes.add(code)
        subjects.append({
            'code': code,
            'title': title,
            'grade': (grade or '').strip(),
            'units': units_val,
        })

    normalized_lines = [re.sub(r'\s+', ' ', raw_line).strip() for raw_line in (text or '').splitlines()]
    normalized_lines = [line for line in normalized_lines if line]

    def _parse_compact_subject(line):
        for pattern in (LOCAL_SUBJECT_PATTERN, LOCAL_SUBJECT_PATTERN_ALT):
            match = pattern.search(line)
            if match:
                return {
                    'code': match.group('code'),
                    'title': match.group('title'),
                    'units': match.group('units'),
                    'grade': match.groupdict().get('grade', ''),
                }
        return None

    i = 0
    while i < len(normalized_lines):
        line = normalized_lines[i]
        if not line:
            i += 1
            continue

        compact = _parse_compact_subject(line)
        if compact:
            _add_subject(compact['code'], compact['title'], compact['units'], compact['grade'])
            i += 1
            continue

        if _is_code_line(line):
            code = line
            title_parts = []
            grade = ''
            units = '0'
            j = i + 1

            while j < len(normalized_lines):
                candidate = normalized_lines[j]

                if _is_code_line(candidate):
                    # If we already have title text, the next code marks the end of this subject.
                    if title_parts:
                        break
                    j += 1
                    continue

                if _is_heading(candidate):
                    j += 1
                    continue

                if _looks_like_grade(candidate) and title_parts and not grade:
                    grade = candidate
                    k = j + 1
                    while k < len(normalized_lines):
                        units_candidate = normalized_lines[k]
                        if _is_heading(units_candidate):
                            k += 1
                            continue
                        if _is_code_line(units_candidate):
                            break
                        if _looks_like_units(units_candidate):
                            units = units_candidate
                            j = k
                            break
                        k += 1
                    _add_subject(code, ' '.join(title_parts), units, grade)
                    break

                if not grade:
                    title_parts.append(candidate)

                j += 1

            i = max(i + 1, j + 1)
            continue

        i += 1

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
        client = self._get_client()
        self.api_key = self.api_key or os.getenv('GEMINI_API_KEY') or os.getenv('EMERGENT_LLM_KEY') or ''
        if not client and not (legacy_genai and self.api_key):
            return None

        loop = asyncio.get_event_loop()

        def _sync_call():
            models_to_try = [GEMINI_MODEL, 'gemini-pro-latest', 'gemini-3.6-flash']
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
                        print(f"GenAI generate error ({model_name}): {ex}")
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
                        print(f"Legacy GenAI error ({model_name}): {ex}")
                        continue
            return None

        try:
            return await loop.run_in_executor(None, _sync_call)
        except Exception as e:
            print(f"Error in _generate: {e}")
            return None

    async def extract_subjects_from_tor(self, image_base64):
        """Extract subjects from TOR image using Gemini vision"""
        try:
            file_bytes = _decode_document_bytes(image_base64)
            local_text = _extract_local_text(file_bytes)
            local_subjects = _parse_tor_subjects_from_text(local_text)

            prompt = """Extract ALL subjects from this Transcript of Records (TOR) image or document.

For each subject, provide:
- Subject Code (e.g., IT111, GE-MATH1, ENGL101)
- Subject Title
- Grade (numerical like 1.5, 2.0 or letter like A, B+)
- Units/Credits (integer)

Return ONLY a valid JSON array with this exact structure:
[
  {
    "code": "IT111",
    "title": "Introduction to Computing",
    "grade": "1.5",
    "units": 3
  }
]

If you cannot clearly read any field, use "UNCLEAR" for that field.
Do not include any explanatory text, just the JSON array. Return [] if no subjects found."""

            contents = [prompt]
            if file_bytes and types:
                mime = "application/pdf" if file_bytes.startswith(b'%PDF') else "image/png"
                contents.append(types.Part.from_bytes(data=file_bytes, mime_type=mime))
            elif local_text:
                contents.append(f"Document OCR Text:\n{local_text}")

            response_text = await self._generate(contents, system_instruction="You are an expert at extracting academic transcript data.")
            if response_text:
                cleaned = _clean_json_response(response_text)
                try:
                    subjects = json.loads(cleaned)
                    if isinstance(subjects, list) and subjects:
                        return subjects
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

    async def match_subject(self, tor_subject_data, curriculum_subjects):
        """Match a TOR subject against curriculum subjects using multi-stage hybrid AI & ontology"""
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
                        'programming 1 (c/c++)', 'fundamentals of computer programming'
                    ]),
                    # 2. Intermediate / Object-Oriented Programming (CSIT201, CSIT221)
                    (['CSIT201', 'CSIT221'], [
                        'computer programming 2', 'intermediate programming', 'object-oriented programming', 'object oriented programming',
                        'programming 2', 'oop', 'java programming', 'c++ programming', 'computer programming ii',
                        'object-oriented analysis and design', 'advanced programming', 'java 1', 'java 2', 'c# programming',
                        'event-driven programming', 'visual programming', 'visual basic', 'vb.net', 'java programming 1',
                        'object oriented programming in java', 'object oriented programming in c++'
                    ]),
                    # 3. Discrete Structures 1 (CSIT122)
                    (['CSIT122'], [
                        'discrete structures', 'discrete mathematics', 'discrete structures 1', 'discrete math',
                        'discrete structures i', 'combinatorics', 'graph theory', 'discrete structures and graph theory',
                        'discrete mathematics with graph theory', 'mathematics for computer science'
                    ]),
                    # 4. Introduction to Computing (CSIT111)
                    (['CSIT111'], [
                        'introduction to computing', 'intro to computing', 'computer fundamentals', 'introduction to computer studies',
                        'intro to computer science', 'it fundamentals', 'intro to it', 'introduction to it', 'pc operations',
                        'computer literacy', 'living in the it era', 'information technology concepts', 'computing fundamentals',
                        'computer concepts and applications', 'information technology fundamentals'
                    ]),
                    # 5. Introduction to Computer Systems / Hardware (CSIT112)
                    (['CSIT112'], [
                        'introduction to computer systems', 'pc hardware', 'hardware and troubleshooting', 'computer systems',
                        'computer architecture', 'computer hardware', 'pc hardware and troubleshooting', 'computer hardware and servicing',
                        'computer system servicing', 'hardware servicing', 'digital electronics', 'electronics (lab)', 'electronics (lec)',
                        'electronics lab', 'electronics lec', 'electronics', 'microprocessor systems', 'computer assembly and maintenance',
                        'css nc ii', 'computer technician course', 'computer assembly, maintenance and troubleshooting'
                    ]),
                    # 6. Database Systems / Information Management 1 (CSIT226)
                    (['CSIT226'], [
                        'database management systems', 'database management', 'database systems', 'fundamentals of database',
                        'information management 1', 'information management', 'dbms', 'intro to database', 'relational database',
                        'database concepts', 'sql fundamentals', 'data management', 'relational database management systems',
                        'sql server', 'mysql database', 'oracle database 1', 'ms access and sql', 'database design and management'
                    ]),
                    # 7. Advanced Database / Information Management 2 (CSIT327)
                    (['CSIT327'], [
                        'advanced database', 'information management 2', 'advanced dbms', 'database administration',
                        'data warehousing', 'nosql databases', 'big data', 'oracle database 2', 'data warehousing and mining',
                        'database administration and security'
                    ]),
                    # 8. Data Structures and Algorithms (CSIT227)
                    (['CSIT227'], [
                        'data structures and algorithms', 'data structures', 'algorithms and data structures',
                        'data structures and algorithm analysis', 'data structure and algorithms', 'design and analysis of algorithms',
                        'algorithms and complexity', 'advanced data structures'
                    ]),
                    # 9. Web Development / Platform-based Development 2 (CSIT238)
                    (['CSIT238'], [
                        'web development', 'web systems and technologies', 'web design', 'web development fundamentals',
                        'advanced web design', 'internet programming', 'web programming', 'web technologies', 'web applications',
                        'web development 1', 'web development 2', 'platform-based development 2 (web)', 'basic internet',
                        'internet concepts', 'web page design', 'html and css', 'client-side web development', 'server-side web development',
                        'php and mysql', 'full-stack web development', 'e-commerce technology', 'web development technologies'
                    ]),
                    # 10. Multimedia Systems / Platform-based Development 1 (CSIT213)
                    (['CSIT213'], [
                        'platform-based development 1 (multimedia)', 'multimedia systems', 'multimedia technologies', 'digital media',
                        'computer graphics', 'multimedia and animation', 'multimedia arts', 'audio video production', '2d animation',
                        '3d animation', 'desktop publishing', 'interactive media', 'digital graphics and animation'
                    ]),
                    # 11. Human Computer Interaction (CSIT284)
                    (['CSIT284'], [
                        'human computer interaction', 'human-computer interaction', 'hci', 'ui/ux design', 'user interface design',
                        'user experience design', 'ui design', 'ux design', 'interaction design', 'usability engineering',
                        'user interface and user experience design', 'human computer interface'
                    ]),
                    # 12. Networking 1 (IT227)
                    (['IT227'], [
                        'networking 1', 'networking fundamentals', 'computer networks', 'data communications and networking',
                        'network fundamentals', 'cisco 1', 'ccna 1', 'intro to networking', 'networking i', 'data communications',
                        'telecommunications', 'lan fundamentals', 'computer networking and data communication'
                    ]),
                    # 13. Networking 2 (IT228)
                    (['IT228'], [
                        'networking 2', 'routing and switching', 'advanced networking', 'cisco 2', 'ccna 2', 'networking ii',
                        'network administration', 'wan technologies', 'cisco 3', 'cisco 4', 'scaling networks', 'advanced computer networks'
                    ]),
                    # 14. Information Assurance and Security 1 (IT332)
                    (['IT332'], [
                        'information assurance and security 1', 'information security', 'cybersecurity', 'information assurance',
                        'principles of information security', 'fundamentals of cybersecurity', 'infosec', 'network security',
                        'general and industrial safety 1', 'industrial safety', 'it safety and security', 'information security fundamentals',
                        'computer security', 'security principles'
                    ]),
                    # 15. Systems Integration and Architecture 1 (IT344)
                    (['IT344'], [
                        'systems integration and architecture 1', 'systems analysis and design', 'system analysis and design',
                        'enterprise architecture', 'systems integration', 'software design', 'sad', 'system analysis and software engineering',
                        'software architecture'
                    ]),
                    # 16. Systems Administration and Maintenance (IT346)
                    (['IT346'], [
                        'systems administration and maintenance', 'system administration', 'server administration',
                        'network and systems administration', 'linux administration', 'windows server', 'server maintenance',
                        'systems and network administration'
                    ]),
                    # 17. Applications Development and Emerging Technologies (CSIT321, CSITELEC1)
                    (['CSIT321', 'CSITELEC1'], [
                        'applications development and emerging technologies', 'mobile application development', 'mobile development',
                        'android development', 'ios development', 'mobile programming', 'app development', 'cross-platform mobile development',
                        'mobile apps development', 'emerging technologies in it', 'emerging trends in computing'
                    ]),
                    # 18. Project Management for IT (IT365)
                    (['IT365'], [
                        'project management for it', 'it project management', 'software engineering', 'software engineering 1',
                        'software project management', 'it quality assurance', 'it project management and quality assurance'
                    ]),
                    # 19. Capstone and Research 1 & 2 (IT342, IT411)
                    (['IT342'], [
                        'capstone and research 1', 'capstone project 1', 'capstone 1', 'undergraduate thesis 1',
                        'methods of research', 'it research', 'research methodology', 'technical research', 'thesis 1'
                    ]),
                    (['IT411'], [
                        'capstone and research 2', 'capstone project 2', 'capstone 2', 'undergraduate thesis 2', 'thesis defense', 'thesis 2'
                    ]),
                    # 20. Practicum / OJT (IT412)
                    (['IT412'], [
                        'ojt/practicum', 'practicum', 'on-the-job training', 'ojt', 'internship', 'industry practicum',
                        'supervised industrial training', 'industry internship', 'practicum course'
                    ]),
                    # 21. Purposive Communication / English (ENGL031)
                    (['ENGL031'], [
                        'purposive communication', 'communication arts', 'english 1', 'english 2', 'oral communication',
                        'speech communication', 'technical writing', 'grammar and composition', 'study and thinking skills',
                        'business communication', 'writing in the discipline', 'college english', 'english plus', 'speech and oral communication',
                        'effective communication'
                    ]),
                    # 22. Mathematics in the Modern World (MATH031)
                    (['MATH031'], [
                        'mathematics in the modern world', 'college algebra', 'general mathematics', 'advance algebra',
                        'trigonometry', 'elementary statistics', 'contemporary mathematics', 'differential calculus',
                        'integral calculus', 'basic calculus', 'applied mathematics', 'business mathematics', 'college algebra and trigonometry'
                    ]),
                    # 23. Readings in Philippine History / Social Sciences (SOCSCI031)
                    (['SOCSCI031'], [
                        'readings in philippine history', 'philippine history', 'philippine history and government',
                        'philippine government and constitution', 'social science 1', 'social science 2', 'society and culture',
                        'general sociology', 'philippine governance', 'politics and governance', 'philippine history with politics and governance',
                        'philippine political and social life'
                    ]),
                    # 24. Understanding the Self (PSYCH031)
                    (['PSYCH031'], [
                        'understanding the self', 'general psychology', 'intro to psychology', 'personality development',
                        'human behavior', 'general psychology with drug education'
                    ]),
                    # 25. Rizal Course (RIZAL031)
                    (['RIZAL031'], [
                        'the life and works of rizal', 'life and works of rizal', 'rizal course', 'rizal', 'rizals life and works'
                    ]),
                    # 26. Ethics / Philosophy / Values (PHILO031)
                    (['PHILO031'], [
                        'ethics', 'moral philosophy', 'professional ethics', 'ethics in it', 'basic christian doctrine 1',
                        'christian doctrine', 'religious education', 'values education', 'logic and critical thinking',
                        'philosophy of man', 'logic', 'critical thinking', 'christian living'
                    ]),
                    # 27. Science, Technology and Society (STS031)
                    (['STS031'], [
                        'science, technology and society', 'science technology and society', 'sts', 'environmental science',
                        'general science', 'earth science', 'ecology', 'biological science', 'physical science'
                    ]),
                    # 28. NSTP 1 & 2 (NSTP111, NSTP112)
                    (['NSTP111'], [
                        'national service training program 1', 'nstp 1', 'cwts 1', 'rotc 1', 'nstp i', 'civic welfare training service 1', 'military science 1'
                    ]),
                    (['NSTP112'], [
                        'national service training program 2', 'nstp 2', 'cwts 2', 'rotc 2', 'nstp ii', 'civic welfare training service 2', 'military science 2'
                    ]),
                    # 29. Physical Education / PATHFit 1-4 (PE103, PE104, PE205, PE206)
                    (['PE103'], [
                        'pathfit 1', 'physical education 1', 'pe 1', 'physical fitness', 'pe i', 'self testing activities',
                        'physical fitness and gymnastics', 'movement competency'
                    ]),
                    (['PE104'], [
                        'pathfit 2', 'physical education 2', 'pe 2', 'rhythmic activities', 'pe ii', 'fitness and dance', 'aerobics'
                    ]),
                    (['PE205'], [
                        'pathfit 3', 'physical education 3', 'pe 3', 'individual and dual sports', 'pe iii', 'swimming', 'badminton', 'table tennis'
                    ]),
                    (['PE206'], [
                        'pathfit 4', 'physical education 4', 'pe 4', 'team sports', 'pe iv', 'basketball', 'volleyball'
                    ]),
                    # 30. Analytics / Technopreneurship / Quantitative Methods (CSIT385, IT317, CSIT212)
                    (['CSIT385'], [
                        'data analytics', 'data analytics 1', 'data analysis', 'business analytics', 'data science fundamentals', 'data mining'
                    ]),
                    (['IT317'], [
                        'technopreneurship', 'entrepreneurship', 'techno entrepreneurship', 'business planning', 'principles of management'
                    ]),
                    (['CSIT212'], [
                        'quantitative methods', 'statistics', 'probability and statistics', 'biostatistics', 'operations research', 'quantitative techniques'
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

                for s in curriculum_subjects:
                    ccode = (s.get('code') or '').upper().replace(' ', '').replace('-', '')
                    ctitle = (s.get('title') or '').lower().strip()
                    cdesc = (s.get('description') or '').lower().strip()
                    c_compact = _compact(ctitle)
                    cur_tokens = _meaningful_tokens(f"{ctitle} {cdesc}")

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
                            'confidence': 98 if exact_code else 95,
                            'reasoning': f"Exact syllabus match: '{raw_title}' aligns directly with '{s['title']}' ({s['code']})"
                        })
                        continue

                    # 3. Knowledge-based academic equivalence
                    equiv_keywords = equiv_by_code.get(ccode, [])
                    rule_matched = False
                    for kw in equiv_keywords:
                        kw_compact = _compact(kw)
                        if (kw in tor_title or tor_title in kw or
                                (kw_compact and (kw_compact in tor_compact or tor_compact in kw_compact))):
                            matches.append({
                                'curriculum_code': s['code'],
                                'confidence': 92,
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
                        score = max(score, 0.85)

                    if score >= 0.70:
                        conf = int(min(90, max(70, score * 95)))
                        matches.append({
                            'curriculum_code': s['code'],
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

            local_matches = _local_match_subjects()

            curriculum_list = "\n".join([
                f"- {s['code']}: {s['title']} ({s['units']} units) - {s['description']}"
                for s in curriculum_subjects
            ])
            
            prompt = f"""You are a Senior Academic Evaluator specializing in CHED ETEEAP (Expanded Tertiary Education Equivalency and Accreditation Program) credit evaluation at CIT-University.
Your task is to evaluate an applicant's Transcript of Records (TOR) course and determine if it satisfies the learning outcomes and competency requirements of a course in the BSIT curriculum.

EVALUATION GUIDELINES:
1. Academic Equivalency: Different Philippine universities (e.g. AMA, STI, DLSU, UST, State Universities, TESDA) use differing course codes/names for identical core competencies.
2. Common Course Equivalents:
   - "Structured Programming" / "PROG 1" / "Turbo C" / "Logic Formulation" -> CSIT121 Fundamentals of Programming
   - "Object-Oriented Programming" / "PROG 2" / "Java Programming" -> CSIT201 Intermediate Programming or CSIT221 Object-Oriented Programming 1
   - "Database Management Systems" / "DB MGT SYS" / "SQL Fundamentals" -> CSIT226 Information Management 1
   - "Data Communications & Networking" / "DATA COMM & NET" / "Cisco 1" -> IT227 Networking 1
   - "Computer Hardware & Servicing" / "PC Troubleshooting" / "CSS NC II" -> CSIT112 Introduction to Computer Systems
   - "Web Page Design & Development" / "Internet Concepts" -> CSIT238 Platform-based Development 2 (Web)
   - "College Algebra" / "Trigonometry" -> MATH031 Mathematics in the Modern World
   - "Grammar & Composition" / "Communication Arts" -> ENGL031 Purposive Communication
3. Provide an audit-ready accredited rationale explaining the competency equivalence.
4. If the course is unrelated (e.g. Agriculture, Nursing, Dental), return an empty array [].

FEW-SHOT EXAMPLES:
Example 1:
TOR: Code: "CS 101", Title: "PROG 1", Units: 3
Output: [{{"curriculum_code": "CSIT121", "confidence": 95, "reasoning": "Equivalent academic competency: PROG 1 covers core procedural programming and logic formulation required by CSIT121"}}]

Example 2:
TOR: Code: "IT 202", Title: "SYS AN & DES", Units: 3
Output: [{{"curriculum_code": "IT344", "confidence": 92, "reasoning": "Equivalent academic competency: Systems Analysis and Design directly satisfies IT344 Systems Integration and Architecture 1 requirements"}}]

Example 3:
TOR: Code: "AGRI 101", Title: "Crop Science", Units: 3
Output: []

INPUT TO EVALUATE:
TOR Subject:
Code: {tor_subject_data['code']}
Title: {tor_subject_data['title']}
Units: {tor_subject_data['units']}

Target Curriculum Subjects:
{curriculum_list}

Return ONLY a valid JSON array of matches (at most 2), sorted by confidence:
[{{"curriculum_code": "CSIT121", "confidence": 92, "reasoning": "Detailed audit-ready rationale..."}}]

If no reasonable academic equivalence exists, return [] only."""

            system_instruction = "You are an expert ETEEAP academic accreditation evaluator at CIT-University. Evaluate course equivalencies based on learning outcomes and syllabus competencies across Philippine higher education institutions."
            response_text = await self._generate(prompt, system_instruction=system_instruction)
            if response_text:
                cleaned = _clean_json_response(response_text)
                try:
                    matches = json.loads(cleaned)
                    if isinstance(matches, list) and matches:
                        return matches
                except json.JSONDecodeError:
                    pass
            return local_matches
        
        except Exception as e:
            print(f"Error in subject matching: {str(e)}")
            try:
                return _local_match_subjects()
            except Exception:
                return []

    async def summarize_applicant(self, application_evidence):
        """Generate a short summary of the applicant's work experience and job description."""
        try:
            work_exps = application_evidence.get('work_experiences', []) or []
            job_docs = application_evidence.get('job_docs', []) or []

            def _local_summary():
                lines = []
                total_years = 0.0
                it_related_count = 0
                for w in work_exps:
                    title = w.get('job_title') or ''
                    yrs = 0
                    try:
                        yrs = float(w.get('years', 0) or 0)
                    except Exception:
                        yrs = 0
                    total_years += yrs
                    desc = (w.get('job_description') or '')[:200]
                    lines.append(f"{title} ({yrs:g}y): {desc}")
                    if _local_is_it_related_text(f"{title} {desc}"):
                        it_related_count += 1

                doc_evidence = ' '.join((d or '')[:300] for d in job_docs)
                summary = (
                    f"Applicant has {len(work_exps)} work experience entries totalling {total_years:g} years. "
                    f"IT-related roles detected: {it_related_count}."
                )
                if doc_evidence:
                    summary += f" Document evidence: {doc_evidence[:200]}"

                highlights = []
                if total_years > 0:
                    highlights.append(f"Total experience: {total_years:g} years")
                if it_related_count:
                    highlights.append(f"IT-related roles: {it_related_count}")
                if doc_evidence:
                    highlights.append('Job description present')

                confidence = 60 + min(30, int(it_related_count * 10))
                return {'summary': summary, 'highlights': highlights, 'confidence': confidence}

            work_text = '\n'.join([f"Title: {w.get('job_title','')} | Years: {w.get('years',0)} | Desc: {w.get('job_description','')}" for w in work_exps])
            docs_text = '\n'.join((job_docs or []))
            prompt = f"""You are an assistant that summarizes an applicant's work experience and uploaded job documents.

Return ONLY a JSON object with keys: summary (a short paragraph), highlights (array of 3 short bullet points), confidence (0-100 integer).

Work Experience:
{work_text}

Documents:
{docs_text}

Example output:
{{"summary":"...","highlights":["...","..."],"confidence":85}}"""

            system_instruction = "Summarize applicant work experience and job documents."
            response_text = await self._generate(prompt, system_instruction=system_instruction)
            if response_text:
                cleaned = _clean_json_response(response_text)
                try:
                    payload = json.loads(cleaned)
                    if isinstance(payload, dict) and payload:
                        return payload
                except json.JSONDecodeError:
                    pass
            return _local_summary()

        except Exception as e:
            print(f"Error in summarization: {e}")
            return {'summary': 'Applicant evidence recorded.', 'highlights': [], 'confidence': 50}

    async def match_work_experience(self, work_data, curriculum_subjects):
        """Match work experience to curriculum subjects"""
        try:
            def _local_match_work():
                matches = []
                title = (work_data.get('job_title') or '').lower()
                desc = (work_data.get('description') or '').lower()
                years = float(work_data.get('years') or 0)

                for s in curriculum_subjects:
                    ctitle = (s.get('title') or '').lower()
                    cdesc = (s.get('description') or '').lower()

                    tokens = set(re.findall(r"\w+", f"{title} {desc}"))
                    cur_tokens = set(re.findall(r"\w+", f"{ctitle} {cdesc}"))
                    if not tokens or not cur_tokens:
                        continue
                    inter = tokens.intersection(cur_tokens)
                    score = len(inter)

                    confidence = int(min(95, 40 + score * 10 + min(30, int(years * 5))))
                    if confidence >= 60:
                        reason = f"Keyword overlap ({len(inter)} shared tokens); {years:g} years experience"
                        matches.append({'curriculum_code': s['code'], 'confidence': confidence, 'reasoning': reason})

                matches.sort(key=lambda x: x['confidence'], reverse=True)
                return matches

            local_matches = _local_match_work()

            curriculum_list = "\n".join([
                f"{s['code']}: {s['title']} ({s['units']} units) - {s['description']}"
                for s in curriculum_subjects
            ])
            
            prompt = f"""Evaluate this work experience and identify which curriculum subjects could be credited based on demonstrated skills.

Work Experience:
Job Title: {work_data.get('job_title','')}
Years of Experience: {work_data.get('years',0)}
Job Description: {work_data.get('description','')}

BSIT Curriculum Subjects:
{curriculum_list}

For ETEEAP credit, consider:
- Job skills directly relate to subject content
- Years of experience demonstrates mastery
- Job description shows practical application of subject knowledge

Return ONLY a valid JSON array sorted by confidence:
[{{"curriculum_code": "IT213", "confidence": 85, "reasoning": "..."}}]

Include matches with confidence >= 60. Return [] if no credit-worthy matches.
Just the JSON array, no explanations."""

            system_instruction = "You are an expert at evaluating work experience for academic credit through ETEEAP."
            response_text = await self._generate(prompt, system_instruction=system_instruction)
            if response_text:
                cleaned = _clean_json_response(response_text)
                try:
                    matches = json.loads(cleaned)
                    if isinstance(matches, list) and matches:
                        return matches
                except json.JSONDecodeError:
                    pass
            return local_matches
        
        except Exception as e:
            print(f"Error in work experience matching: {str(e)}")
            return []

    async def recommend_program(self, work_experiences):
        """Recommend the best program based on work experiences"""
        def _local_recommend_program(work_experiences):
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

        try:
            exp_summary = "\n".join([
                f"- {exp.get('job_title','')} ({exp.get('years',0)} years): {exp.get('job_description','')}"
                for exp in work_experiences or []
            ])
            
            prompt = f"""Based on this applicant's work experience, recommend the most suitable program at CIT-University.

Work Experience:
{exp_summary}

Available Programs at CIT-U:
- BSIT (Bachelor of Science in Information Technology) - for IT professionals, developers, designers, systems administrators
- BSCS (Bachelor of Science in Computer Science) - for those in algorithm-heavy roles, data scientists
- BSCpE (Bachelor of Science in Computer Engineering) - for hardware-focused, embedded systems
- BSBA (Bachelor of Science in Business Administration) - for business managers, sales
- BSA (Bachelor of Science in Accountancy) - for accountants, auditors

Return ONLY a valid JSON object:
{{"program": "BSIT", "confidence": 90, "reasoning": "...", "career_alignment": "...", "strengths": ["..."]}}

Just the JSON object, no explanations."""

            system_instruction = "You are a career counselor and academic advisor for CIT-University."
            response_text = await self._generate(prompt, system_instruction=system_instruction)
            if response_text:
                cleaned = _clean_json_response(response_text)
                try:
                    recommendation = json.loads(cleaned)
                    if isinstance(recommendation, dict) and recommendation.get('program'):
                        return recommendation
                except json.JSONDecodeError:
                    pass
            return _local_recommend_program(work_experiences)
        
        except Exception as e:
            print(f"Error in recommendation: {str(e)}")
            try:
                return _local_recommend_program(work_experiences)
            except Exception:
                return {'program': 'BSIT', 'reasoning': 'Error generating recommendation. Please try again.', 'confidence': 0}

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

