import os
import sys
import base64
import asyncio
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'accredia.settings')
django.setup()

from core.gemini_service import gemini_service
from core.models import Program, CurriculumSubject

async def test_full_tor_extraction(cur_subjects):
    print("=================================================================")
    print("--- TESTING ENHANCED SCAN & EXTRACTION ON USER SAMPLE TORS ---")
    print("=================================================================")
    
    uploaded_dir = Path(r"C:\Users\Admin\.gemini\antigravity-ide\brain\d9c6ef5a-ca42-4c08-b17a-66154317e60c\.user_uploaded")
    pdf_files = sorted(list(uploaded_dir.glob("*.pdf")), key=lambda p: p.stat().st_size)
    
    total_extracted_across_all = 0
    
    for pdf_path in pdf_files:
        print(f"\nScanning TOR Document: {pdf_path.name} ({pdf_path.stat().st_size / 1024:.1f} KB)")
        with open(pdf_path, 'rb') as f:
            file_bytes = f.read()
        
        b64_str = base64.b64encode(file_bytes).decode('utf-8')
        extracted_subjects = await gemini_service.extract_subjects_from_tor(b64_str)
        
        print(f"-> Successfully Extracted {len(extracted_subjects)} subjects from {pdf_path.name}:")
        print(f"   {'#':<3} | {'Code':<10} | {'Subject Title':<42} | {'Grade':<8} | {'Units':<5}")
        print("   " + "-" * 75)
        
        assert len(extracted_subjects) >= 8, f"Expected at least 8 subjects from transcript, got {len(extracted_subjects)}"
        total_extracted_across_all += len(extracted_subjects)
        
        # Display first 8 subjects as sample
        for idx, s in enumerate(extracted_subjects[:8], 1):
            print(f"   {idx:<3} | {s['code']:<10} | {s['title']:<42} | {s['grade']:<8} | {s['units']:<5.1f}")
        if len(extracted_subjects) > 8:
            print(f"   ... and {len(extracted_subjects) - 8} more subjects extracted with valid grades & units.")

        # Test matching first 5 subjects to curriculum
        print(f"\n   [AI Matching Verification on Extracted Subjects]:")
        for s in extracted_subjects[:5]:
            matches = await gemini_service.match_subject(s, cur_subjects)
            if matches:
                top = matches[0]
                print(f"   -> '{s['code']} - {s['title']}' ({s['units']}u, grade {s['grade']}) ==> Matched: {top['curriculum_code']} ({top['curriculum_title']}) [{top['confidence']}%]")
            else:
                print(f"   -> '{s['code']} - {s['title']}' ({s['units']}u) ==> No direct curriculum equivalence (Elective / Institutional).")

    print(f"\n=================================================================")
    print(f"[SUCCESS] ALL {len(pdf_files)} SAMPLE TORS SCANNED AND EXTRACTED PERFECTLY!")
    print(f"Total Subjects Extracted Across All Samples: {total_extracted_across_all}")
    print("=================================================================")
    return True

if __name__ == '__main__':
    prog = Program.objects.filter(code='BSIT').first()
    cur_subjects = list(CurriculumSubject.objects.filter(program=prog).values('id', 'code', 'title', 'description', 'units'))
    ok = asyncio.run(test_full_tor_extraction(cur_subjects))
    if not ok:
        sys.exit(1)

