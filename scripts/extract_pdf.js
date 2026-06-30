import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

const src = path.join('c:', 'Users', 'sagar', 'Downloads', 'SIM Senior Engineering Interview Assignment - School Operations Agent Platform.pdf');
const out = path.join('c:', 'Users', 'sagar', 'Documents', 'Codex', '2026-07-01', 'i-want-to-build-this', 'work', 'pdf_text.txt');

async function run() {
  try {
    const data = fs.readFileSync(src);
    const parsed = await pdf(data);
    fs.writeFileSync(out, parsed.text, 'utf8');
    console.log('Wrote:', out);
  } catch (err) {
    console.error('Error extracting PDF:', err.message);
    process.exit(1);
  }
}

run();
