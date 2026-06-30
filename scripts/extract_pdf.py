import sys
from pathlib import Path
from PyPDF2 import PdfReader

src = Path(r"C:\Users\sagar\Downloads\SIM Senior Engineering Interview Assignment - School Operations Agent Platform.pdf")
out = Path(r"C:\Users\sagar\Documents\Codex\2026-07-01\i-want-to-build-this\work\pdf_text.txt")

def main():
    if not src.exists():
        print('Source PDF not found:', src)
        sys.exit(1)
    reader = PdfReader(str(src))
    texts = []
    for p in reader.pages:
        try:
            texts.append(p.extract_text() or '')
        except Exception as e:
            texts.append(f'<!-- error extracting page: {e} -->')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text('\n\n'.join(texts), encoding='utf-8')
    print('Wrote:', out)

if __name__ == '__main__':
    main()
