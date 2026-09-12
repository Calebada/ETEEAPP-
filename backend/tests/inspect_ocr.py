import os
import sys
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
from core.gemini_service import _parse_tor_subjects_from_text, LOCAL_SUBJECT_PATTERN, LOCAL_SUBJECT_PATTERN_ALT

uploaded_dir = Path(r"C:\Users\Admin\.gemini\antigravity-ide\brain\d9c6ef5a-ca42-4c08-b17a-66154317e60c\.user_uploaded")
pdf_files = list(uploaded_dir.glob("*.pdf"))
engine = RapidOCR()

for pdf_path in pdf_files:
    print(f"\n=======================================================")
    print(f"Inspecting PDF: {pdf_path.name} ({pdf_path.stat().st_size} bytes)")
    doc = fitz.open(pdf_path)
    print(f"Pages: {len(doc)}")
    
    all_page_texts = []
    for page_idx, page in enumerate(doc):
        text = page.get_text('text').strip()
        print(f"\n--- Page {page_idx + 1} Native Text Length: {len(text)} ---")
        
        # Run OCR with 2x zoom
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        img = Image.frombytes('RGB', [pixmap.width, pixmap.height], pixmap.samples)
        ocr_result, _ = engine(np.array(img))
        
        print(f"OCR Detected Boxes: {len(ocr_result) if ocr_result else 0}")
        if ocr_result:
            # Let's inspect raw box structure
            first_item = ocr_result[0]
            print(f"Sample Box: {first_item}")
            
            # Reconstruct lines sorted by Y then X
            # Bounding box is [[x1,y1], [x2,y1], [x2,y2], [x1,y2]]
            items_with_coords = []
            for item in ocr_result:
                box = item[0]
                txt = item[1].strip()
                conf = item[2]
                y_center = (box[0][1] + box[2][1]) / 2.0
                x_left = box[0][0]
                items_with_coords.append({'box': box, 'text': txt, 'conf': conf, 'y': y_center, 'x': x_left, 'h': abs(box[2][1] - box[0][1])})
            
            # Sort primarily by Y
            items_with_coords.sort(key=lambda item: item['y'])
            
            # Group into lines where Y difference <= row_height_threshold (e.g. 15px at 2x)
            lines = []
            current_line = []
            current_y = None
            
            for item in items_with_coords:
                if current_y is None:
                    current_y = item['y']
                    current_line.append(item)
                elif abs(item['y'] - current_y) <= 18:  # same line threshold
                    current_line.append(item)
                else:
                    # Sort current line by X (left to right)
                    current_line.sort(key=lambda it: it['x'])
                    line_str = "   ".join([it['text'] for it in current_line])
                    lines.append(line_str)
                    current_line = [item]
                    current_y = item['y']
            
            if current_line:
                current_line.sort(key=lambda it: it['x'])
                line_str = "   ".join([it['text'] for it in current_line])
                lines.append(line_str)
            
            page_ocr_text = "\n".join(lines)
            print(f"--- Reconstructed Page {page_idx + 1} OCR Text (First 10 lines) ---")
            for l in lines[:10]:
                print(f"  {l}")
            all_page_texts.append(page_ocr_text)

    combined_text = "\n\n".join(all_page_texts)
    parsed_subjects = _parse_tor_subjects_from_text(combined_text)
    print(f"\n>>> Total Parsed Subjects from {pdf_path.name}: {len(parsed_subjects)}")
    for s in parsed_subjects[:10]:
        print(f"   Code: {s['code']:<10} | Title: {s['title']:<40} | Grade: {s['grade']:<6} | Units: {s['units']}")
