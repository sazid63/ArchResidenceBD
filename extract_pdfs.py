import os
from PyPDF2 import PdfReader

base = r"C:\1_SAJID\ArchResidenceBD\repo\boq_lessons"
out = r"C:\1_SAJID\ArchResidenceBD\repo\boq_lessons_text"
os.makedirs(out, exist_ok=True)

for root, dirs, files in os.walk(base):
    for f in files:
        if not f.lower().endswith(".pdf"):
            continue
        src = os.path.join(root, f)
        rel = os.path.relpath(src, base)
        dst = os.path.join(out, rel.replace(".pdf", ".txt"))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        try:
            reader = PdfReader(src)
            text = ""
            for i, page in enumerate(reader.pages):
                t = page.extract_text()
                if t:
                    text += f"\n--- PAGE {i+1} ---\n" + t
            with open(dst, "w", encoding="utf-8") as fh:
                fh.write(text)
            print(f"OK {rel} -> {len(text)} chars, {len(reader.pages)} pages")
        except Exception as e:
            print(f"FAIL {rel}: {e}")