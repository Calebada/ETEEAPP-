import os
import json
import asyncio
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv()

# Use EMERGENT_LLM_KEY first (universal key), fall back to GEMINI_API_KEY
LLM_API_KEY = os.getenv('EMERGENT_LLM_KEY') or os.getenv('GEMINI_API_KEY')
GEMINI_MODEL = "gemini-2.5-pro"  # Fallback model if 3.1-pro is rate-limited


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


class GeminiService:
    def __init__(self):
        self.api_key = LLM_API_KEY
    
    def _get_chat(self, session_id, system_message):
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
                return subjects if isinstance(subjects, list) else []
            except json.JSONDecodeError:
                print(f"Failed to parse OCR response: {response_text[:200]}")
                return []
        
        except Exception as e:
            print(f"Error in OCR extraction: {str(e)}")
            return []
    
    async def match_subject(self, tor_subject_data, curriculum_subjects):
        """Match a TOR subject against curriculum subjects using AI"""
        try:
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
    
    async def match_work_experience(self, work_data, curriculum_subjects):
        """Match work experience to curriculum subjects"""
        try:
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
        try:
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
                return recommendation if isinstance(recommendation, dict) else {'program': 'BSIT', 'reasoning': 'Default recommendation', 'confidence': 50}
            except json.JSONDecodeError:
                return {'program': 'BSIT', 'reasoning': 'Default recommendation', 'confidence': 50}
        
        except Exception as e:
            print(f"Error in recommendation: {str(e)}")
            return {'program': 'BSIT', 'reasoning': 'Error generating recommendation. Please try again.', 'confidence': 0}
    
    async def chat_with_bot(self, conversation_history, user_message, user_context=None):
        """Chat with the ETEEAP assistant bot"""
        try:
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
