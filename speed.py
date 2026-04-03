import time
import sys
from pathlib import Path
sys.path.append(r"c:\Users\RANA\Desktop\learn_git\jnv_pipeline")
from parse_text import extract_pdf_text

pdf_dir = Path(r"c:\Users\RANA\Desktop\learn_git\jnv-platform\tools\pmshri-crawler\data\pdfs")
pdfs = list(pdf_dir.glob("*.pdf"))[:5]

t0 = time.time()
for p in pdfs:
    extract_pdf_text(p)
t1 = time.time()

print(f"Time for {len(pdfs)} pdfs: {t1-t0:.2f} seconds")
