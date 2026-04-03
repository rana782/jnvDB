import sys
from pathlib import Path

# Add pipeline dir to path
sys.path.append(r"c:\Users\RANA\Desktop\learn_git\jnv_pipeline")
from parse_text import extract_pdf_text

pdf_dir = Path(r"c:\Users\RANA\Desktop\learn_git\jnv-platform\tools\pmshri-crawler\data\pdfs")
first_pdf = next(pdf_dir.glob("*.pdf"), None)

if not first_pdf:
    print("NO PDF FOUND")
else:
    print(f"Reading: {first_pdf.name}")
    t, _ = extract_pdf_text(first_pdf)
    
    # Try to find teachers section
    lines = t.split('\n')
    teacher_lines = []
    capture = False
    for i, line in enumerate(lines):
        if "Teacher" in line or "Staff" in line or "Teaching" in line:
            capture = True
        
        if capture:
            teacher_lines.append(line)
            if len(teacher_lines) > 50:
                break
                
    print("--- FIRST 50 LINES AFTER FINDING 'Teacher' keywords ---")
    print('\n'.join(teacher_lines))
    print("--- FIRST 3000 CHARACTERS OF PDF ---")
    print(t[:3000])
