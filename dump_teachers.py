import sys
from pathlib import Path

# Add pipeline dir to path
sys.path.append(r"c:\Users\RANA\Desktop\learn_git\jnv_pipeline")
from parse_text import extract_pdf_text

pdf_dir = Path(r"c:\Users\RANA\Desktop\learn_git\jnv-platform\tools\pmshri-crawler\data\pdfs")
for pdf in list(pdf_dir.glob("*.pdf"))[:3]:
    t, _ = extract_pdf_text(pdf)
    lines = t.split('\n')
    
    with open("dump_teachers.txt", "a", encoding="utf-8") as f:
        f.write(f"\n============= {pdf.name} =============\n")
        capture = False
        captured_lines = []
        for line in lines:
            if "Teacher" in line or "Staff" in line or "Teaching" in line:
                capture = True
            if capture:
                captured_lines.append(line)
            if len(captured_lines) > 80:
                break
        f.write('\n'.join(captured_lines))
