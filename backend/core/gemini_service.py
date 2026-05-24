import os
import json
import asyncio
import base64
import re
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
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
except ModuleNotFoundError:
    LlmChat = None
    UserMessage = None
    ImageContent = None

load_dotenv()

# Use EMERGENT_LLM_KEY first (universal key), fall back to GEMINI_API_KEY
LLM_API_KEY = os.getenv('EMERGENT_LLM_KEY') or os.getenv('GEMINI_API_KEY')
GEMINI_MODEL = "gemini-2.5-pro"  # Fallback model if 3.1-pro is rate-limited

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

    for raw_line in (text or '').splitlines():
        line = re.sub(r'\s+', ' ', raw_line).strip()
        if not line:
            continue

        match = LOCAL_SUBJECT_PATTERN.search(line)
        if not match:
            continue

        code = re.sub(r'\s+', '', match.group('code').upper())
        if code in seen_codes:
            continue

        title = match.group('title').strip(' -:;|')
        try:
            units = int(float(match.group('units')))
        except (TypeError, ValueError):
            units = 0

        grade = match.group('grade').strip()

        if code and title:
            seen_codes.add(code)
            subjects.append({
                'code': code,
                'title': title,
                'grade': grade,
                'units': units,
            })

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
        self.api_key = LLM_API_KEY
    
    def _get_chat(self, session_id, system_message):
        if not LlmChat:
            raise RuntimeError(
                "emergentintegrations is not installed. AI features are unavailable in this local environment."
            )
        chat = LlmChat(
            api_key=self.api_key,
            session_id=session_id,
            system_message=system_message
        )
        chat.with_model("gemini", GEMINI_MODEL)
        return chat
    
    async def extract_subjects_from_tor(self, image_base64):
        """Extract subjects from TOR image using Gemini vision"""
        try:
            file_bytes = _decode_document_bytes(image_base64)
            local_text = _extract_local_text(file_bytes)
            local_subjects = _parse_tor_subjects_from_text(local_text)

            if not LlmChat:
                return local_subjects

            chat = self._get_chat(
                f"ocr-{os.urandom(8).hex()}",
                "You are an expert at extracting academic transcript data from images."
            )
            
            prompt = """Extract ALL subjects from this Transcript of Records (TOR) image.

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
            
            msg = UserMessage(
                text=prompt,
                file_contents=[ImageContent(image_base64)]
            )
            
            response = await chat.send_message(msg)
            response_text = _clean_json_response(response)
            
            try:
                subjects = json.loads(response_text)
                if isinstance(subjects, list) and subjects:
                    return subjects
            except json.JSONDecodeError:
                print(f"Failed to parse OCR response: {response_text[:200]}")
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

            if not LlmChat:
                return local_work_data

            chat = self._get_chat(
                f"jobdesc-{os.urandom(8).hex()}",
                "You extract work-experience evidence from uploaded job description documents."
            )

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

            msg = UserMessage(
                text=prompt,
                file_contents=[ImageContent(image_base64)]
            )

            response = await chat.send_message(msg)
            response_text = _clean_json_response(response)

            try:
                payload = json.loads(response_text)
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
        """Match a TOR subject against curriculum subjects using AI"""
        try:
            if not LlmChat:
                return []

            chat = self._get_chat(
                f"match-{os.urandom(8).hex()}",
                "You are an expert at academic credit evaluation and subject matching."
            )
            
            curriculum_list = "\n".join([
                f"{s['code']}: {s['title']} ({s['units']} units) - {s['description']}"
                for s in curriculum_subjects
            ])
            
            prompt = f"""Compare this TOR subject against the curriculum subjects and find the best match.

TOR Subject:
Code: {tor_subject_data['code']}
Title: {tor_subject_data['title']}
Units: {tor_subject_data['units']}

Curriculum Subjects:
{curriculum_list}

Return ONLY a valid JSON array of matches with confidence >= 40, sorted by confidence:
[{{"curriculum_code": "IT111", "confidence": 95, "reasoning": "..."}}]

Just the JSON array, no explanations."""
            
            msg = UserMessage(text=prompt)
            response = await chat.send_message(msg)
            response_text = _clean_json_response(response)
            
            try:
                matches = json.loads(response_text)
                return matches if isinstance(matches, list) else []
            except json.JSONDecodeError:
                return []
        
        except Exception as e:
            print(f"Error in subject matching: {str(e)}")
            return []

    async def summarize_applicant(self, application_evidence):
        """Generate a short summary of the applicant's work experience and job description.

        application_evidence: dict with keys 'work_experiences' (list) and optional 'job_docs' (list of text)
        Returns a dict: { 'summary': str, 'highlights': [str], 'confidence': int }
        """
        try:
            work_exps = application_evidence.get('work_experiences', []) or []
            job_docs = application_evidence.get('job_docs', []) or []

            # If no LLM available, return a deterministic summary
            if not LlmChat:
                # Build a simple summary from work experiences
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
                is_it_related = it_related_count > 0 or any(keyword in doc_evidence.lower() for keyword in LOCAL_IT_KEYWORDS)

                summary = (
                    f"Applicant has {len(work_exps)} work experience entries totalling {total_years:g} years. "
                    f"IT-related roles detected: {it_related_count}. "
                )
                if doc_evidence:
                    summary += f"Document evidence: {doc_evidence[:200]}"

                highlights = []
                if total_years > 0:
                    highlights.append(f"Total experience: {total_years:g} years")
                if it_related_count:
                    highlights.append(f"IT-related roles: {it_related_count}")
                if doc_evidence:
                    highlights.append('Job description present')

                confidence = 60 + min(30, int(it_related_count * 10))
                return {'summary': summary, 'highlights': highlights, 'confidence': confidence}

            # Use LLM to create a concise JSON summary
            chat = self._get_chat(f"summary-{os.urandom(8).hex()}", "Summarize applicant work experience and job documents.")
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

            msg = UserMessage(text=prompt)
            response = await chat.send_message(msg)
            response_text = _clean_json_response(response)
            try:
                payload = json.loads(response_text)
                if isinstance(payload, dict):
                    return payload
            except json.JSONDecodeError:
                print(f"Failed to parse summary response: {response_text[:200]}")
                # fall back to the deterministic local summary
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

        except Exception as e:
            print(f"Error in summarization: {e}")
            # fallback deterministic
            return {'summary': 'No summary available', 'highlights': [], 'confidence': 35}
    
    async def match_work_experience(self, work_data, curriculum_subjects):
        """Match work experience to curriculum subjects"""
        try:
            if not LlmChat:
                return []

            chat = self._get_chat(
                f"work-{os.urandom(8).hex()}",
                "You are an expert at evaluating work experience for academic credit through ETEEAP."
            )
            
            curriculum_list = "\n".join([
                f"{s['code']}: {s['title']} ({s['units']} units) - {s['description']}"
                for s in curriculum_subjects
            ])
            
            prompt = f"""Evaluate this work experience and identify which curriculum subjects could be credited based on demonstrated skills.

Work Experience:
Job Title: {work_data['job_title']}
Years of Experience: {work_data['years']}
Job Description: {work_data['description']}

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
            
            msg = UserMessage(text=prompt)
            response = await chat.send_message(msg)
            response_text = _clean_json_response(response)
            
            try:
                matches = json.loads(response_text)
                return matches if isinstance(matches, list) else []
            except json.JSONDecodeError:
                return []
        
        except Exception as e:
            print(f"Error in work experience matching: {str(e)}")
            return []
    
    async def recommend_program(self, work_experiences):
        """Recommend the best program based on work experiences"""
        def _local_recommend_program(work_experiences):
            """Deterministic local recommender that analyzes job titles/descriptions.

            Returns a dict with program, confidence, reasoning, career_alignment, strengths.
            """
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

            # Choose best program by score
            best_prog = max(scores.keys(), key=lambda p: scores[p])
            best_score = scores[best_prog]

            if best_score == 0:
                # No signals found - be explicit and return a neutral default
                return {
                    'program': 'BSIT',
                    'confidence': 50,
                    'reasoning': 'No clear signals in uploaded documents. Defaulting to BSIT as a general IT program.',
                    'career_alignment': '',
                    'strengths': []
                }

            # Confidence scaling
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
            if not LlmChat:
                # Use deterministic local recommender when LLM is not available
                return _local_recommend_program(work_experiences)

            chat = self._get_chat(
                f"recommend-{os.urandom(8).hex()}",
                "You are a career counselor and academic advisor for CIT-University."
            )
            
            exp_summary = "\n".join([
                f"- {exp['job_title']} ({exp['years']} years): {exp['job_description']}"
                for exp in work_experiences
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
            
            msg = UserMessage(text=prompt)
            response = await chat.send_message(msg)
            response_text = _clean_json_response(response)
            
            try:
                recommendation = json.loads(response_text)
                if isinstance(recommendation, dict):
                    return recommendation
                # If response isn't a dict, fall back to local recommender
                return _local_recommend_program(work_experiences)
            except json.JSONDecodeError:
                # Fall back to deterministic recommender on parse errors
                return _local_recommend_program(work_experiences)
        
        except Exception as e:
            print(f"Error in recommendation: {str(e)}")
            # Try deterministic recommender as a last resort
            try:
                return _local_recommend_program(work_experiences)
            except Exception:
                return {'program': 'BSIT', 'reasoning': 'Error generating recommendation. Please try again.', 'confidence': 0}
    
    async def chat_with_bot(self, conversation_history, user_message, user_context=None):
        """Chat with the ETEEAP assistant bot"""
        try:
            if not LlmChat:
                return "AI assistant is unavailable in this local environment."

            system_message = """You are AcrediaBot, the AI assistant for ACREDIA, the CIT-U AI Credit Evaluation System for ETEEAP (Expanded Tertiary Education Equivalency and Accreditation Program).

Your role:
- Help users understand the ETEEAP process
- Answer questions about credit evaluation at CIT-University
- Explain how TOR subject matching and work experience credit works
- Guide applicants through the application process
- Provide information about BSIT and other programs at CIT-U

ETEEAP allows working professionals to get academic credit for:
- Prior formal education (through TOR)
- Work experience (relevant job roles count for course credits)
- Professional certifications
- Life experiences

Be helpful, professional, and concise. Keep responses under 200 words."""
            
            if user_context:
                system_message += f"\n\nUser Context: {user_context}"
            
            chat = self._get_chat(
                f"chat-{os.urandom(8).hex()}",
                system_message
            )
            
            msg = UserMessage(text=user_message)
            response = await chat.send_message(msg)
            
            return response
        
        except Exception as e:
            print(f"Error in chat: {str(e)}")
            return "I apologize, but I'm having trouble processing your message right now. Please try again."


gemini_service = GeminiService()
