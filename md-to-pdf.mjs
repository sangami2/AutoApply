#!/usr/bin/env node
/**
 * MD-TO-PDF — turns a tailored resume.md (in applications/<slug>/) into a clean
 * 1-page resume.pdf ready to upload. Strips the <<<TOP-THIRD>>> markers.
 *
 * Usage: node md-to-pdf.mjs applications/<slug>/resume.md
 *        node md-to-pdf.mjs --all      (convert every applications/* resume.md)
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal, dependency-free markdown -> HTML for resume content
function mdToHtml(md) {
  md = md.replace(/<<<TOP-THIRD-(START|END)>>>/g, '');
  const lines = md.split('\n');
  let html = '', inList = false;
  const inline = (s) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1');
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (let raw of lines) {
    const l = raw.trim();
    if (!l) { closeList(); continue; }
    if (l.startsWith('### ')) { closeList(); html += `<h3>${inline(l.slice(4))}</h3>`; }
    else if (l.startsWith('## ')) { closeList(); html += `<h2>${inline(l.slice(3))}</h2>`; }
    else if (l.startsWith('# ')) { closeList(); html += `<h1>${inline(l.slice(2))}</h1>`; }
    else if (l.startsWith('- ') || l.startsWith('* ')) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(l.slice(2))}</li>`; }
    else if (/^---+$/.test(l)) { closeList(); }
    else { closeList(); html += `<p>${inline(l)}</p>`; }
  }
  closeList();
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Georgia,'Times New Roman',serif;font-size:8.4pt;line-height:1.25;color:#000;padding:0.4in 0.55in}
    h1{text-align:center;font-size:16pt;font-variant:small-caps;letter-spacing:1px}
    h2{font-size:9pt;text-transform:uppercase;border-bottom:1.1px solid #000;margin:7px 0 2px;padding-bottom:1px;letter-spacing:.5px}
    h3{font-size:8.8pt;margin:4px 0 1px}
    p{margin:1.5px 0;text-align:justify}
    ul{margin:1px 0 2px 15px}
    li{margin-bottom:1px}
    b{font-weight:bold}
  </style></head><body>${html}</body></html>`;
}

async function convert(mdPath, browser) {
  const md = fs.readFileSync(mdPath, 'utf-8');
  const htmlPath = mdPath.replace(/\.md$/, '.html');
  const pdfPath = mdPath.replace(/\.md$/, '.pdf');
  fs.writeFileSync(htmlPath, mdToHtml(md));
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(htmlPath), { waitUntil: 'networkidle' });
  await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await page.close();
  const pages = 1; // Letter; content tuned to 1pg
  console.log(`  ✓ ${path.relative(__dirname, pdfPath)}`);
}

async function main() {
  const arg = process.argv[2];
  const browser = await chromium.launch({ headless: true });
  let targets = [];
  if (arg === '--all') {
    const base = path.join(__dirname, 'applications');
    for (const dir of fs.readdirSync(base)) {
      const p = path.join(base, dir, 'resume.md');
      if (fs.existsSync(p)) targets.push(p);
    }
  } else if (arg) {
    targets = [arg];
  } else {
    console.error('Usage: node md-to-pdf.mjs <resume.md> | --all');
    process.exit(1);
  }
  console.log(`Converting ${targets.length} resume(s) to PDF...`);
  for (const t of targets) await convert(t, browser);
  await browser.close();
  console.log('Done.');
}
main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
