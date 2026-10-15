#!/usr/bin/env node
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dateIndex = args.indexOf('--date');
const requestedDate = dateIndex >= 0 ? args[dateIndex + 1] : '';
const outputIndex = args.indexOf('--output');
const requestedOutput = outputIndex >= 0 ? args[outputIndex + 1] : '';

function sourceFile() {
  const runs = path.join(root, 'runs');
  if (requestedDate) {
    const exact = path.join(runs, `jobs-${requestedDate}.json`);
    if (!fs.existsSync(exact)) throw new Error(`Missing ${exact}`);
    return exact;
  }
  const latest = fs.readdirSync(runs).filter((name) => /^jobs-\d{4}-\d{2}-\d{2}(?:(?:_to_\d{4}-\d{2}-\d{2})|-smoke)?\.json$/.test(name)).sort().reverse()[0];
  if (!latest) throw new Error('No runs/jobs-YYYY-MM-DD.json report found.');
  return path.join(runs, latest);
}

const input = sourceFile();
const stamp = path.basename(input).match(/^jobs-(\d{4}-\d{2}-\d{2}(?:(?:_to_\d{4}-\d{2}-\d{2})|-smoke)?)\.json$/)?.[1];
if (!stamp) throw new Error(`Unsupported jobs report filename: ${path.basename(input)}`);
const jobs = JSON.parse(fs.readFileSync(input, 'utf-8'))
  .sort((left, right) => Number(right.priorityScore || right.score || 0) - Number(left.priorityScore || left.score || 0)
    || String(left.company || '').localeCompare(String(right.company || ''))
    || String(left.title || '').localeCompare(String(right.title || '')));

const workbook = new ExcelJS.Workbook();
workbook.creator = 'AutoApply';
workbook.created = new Date();
workbook.views = [{ activeTab: 0 }];
const picks = workbook.addWorksheet('PM Picks', {
  views: [{ state: 'frozen', ySplit: 1, xSplit: 2, zoomScale: 80 }],
  pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
});
picks.columns = [
  { header: 'Rank', key: 'rank', width: 6 },
  { header: 'Company', key: 'company', width: 25 },
  { header: 'PM Role', key: 'title', width: 36 },
  { header: 'Posted Base Pay', key: 'basePay', width: 24 },
  { header: 'Location', key: 'location', width: 28 },
  { header: 'Why It Fits', key: 'summary', width: 78 },
  { header: 'Apply', key: 'application', width: 18 },
  { header: 'Job Posting', key: 'posting', width: 18 },
  { header: 'Score / 10', key: 'score', width: 12 },
  { header: 'Sponsorship Policy', key: 'authorization', width: 48 },
];
jobs.filter((job) => job.verdict === 'SHORTLIST')
  .sort((left, right) => Number(right.pinnedPick) - Number(left.pinnedPick)
    || Number(right.preferredCompany) - Number(left.preferredCompany)
    || Number(right.priorityScore || right.score || 0) - Number(left.priorityScore || left.score || 0))
  .forEach((job, index) => picks.addRow({
    rank: index + 1, company: job.company || '', title: job.title || '',
    basePay: job.salary?.min != null ? `$${Number(job.salary.min).toLocaleString()}–$${Number(job.salary.max).toLocaleString()}` : 'Not posted',
    location: job.location || '', summary: job.summary || '',
    application: job.applicationUrl || job.externalApplyUrl || job.link
      ? { text: 'Open application', hyperlink: job.applicationUrl || job.externalApplyUrl || job.link } : '',
    posting: job.officialSourceUrl || job.link || job.applicationUrl
      ? { text: 'Open posting', hyperlink: job.officialSourceUrl || job.link || job.applicationUrl } : '',
    score: Number(job.score || 0), authorization: job.sponsorshipF1 || 'Policy not stated; future sponsorship unconfirmed',
  }));
picks.autoFilter = { from: 'A1', to: 'J1' };
picks.pageSetup.printArea = `A1:J${Math.max(1, picks.rowCount)}`;
picks.getRow(1).height = 30;
picks.getRow(1).eachCell((cell) => {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  cell.alignment = { vertical: 'middle', wrapText: true };
});
for (let rowNumber = 2; rowNumber <= picks.rowCount; rowNumber++) {
  const row = picks.getRow(rowNumber);
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 60;
  row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber % 2 === 0 ? 'FFE2F0D9' : 'FFF3F9F0' } }; });
  for (const column of [7, 8]) {
    const cell = row.getCell(column);
    if (typeof cell.value === 'object' && cell.value?.hyperlink) cell.font = { color: { argb: 'FF0563C1' }, underline: true };
  }
}

const sheet = workbook.addWorksheet('All Scanned', {
  views: [{ state: 'frozen', ySplit: 1, xSplit: 2, zoomScale: 80 }],
  pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
});
sheet.columns = [
  { header: 'Rank', key: 'rank', width: 6 },
  { header: 'Score / 10', key: 'score', width: 9 },
  { header: 'Priority Score', key: 'priorityScore', width: 12 },
  { header: 'Verdict', key: 'verdict', width: 18 },
  { header: 'Job Title', key: 'title', width: 34 },
  { header: 'Company', key: 'company', width: 22 },
  { header: 'Job Posting', key: 'linkedin', width: 14 },
  { header: 'Application Link', key: 'application', width: 16 },
  { header: 'Location', key: 'location', width: 28 },
  { header: 'Posted Base Pay', key: 'basePay', width: 22 },
  { header: 'Pay Status', key: 'payStatus', width: 20 },
  { header: 'Company Focus', key: 'companyFocus', width: 17 },
  { header: 'Sponsorship / F-1', key: 'sponsorship', width: 42 },
  { header: 'Required Years', key: 'years', width: 15 },
  { header: 'Required PM Years', key: 'pmYears', width: 18 },
  { header: 'Authorization Evidence', key: 'evidence', width: 58 },
  { header: 'Reason', key: 'reason', width: 58 },
  { header: 'Match Summary', key: 'summary', width: 68 },
];

jobs.forEach((job, index) => {
  const shared = {
    rank: index + 1,
    score: Number(job.score || 0),
    priorityScore: Number(job.priorityScore || job.score || 0),
    verdict: job.verdict || '',
    sponsorship: job.sponsorshipF1 || 'Policy not stated; future sponsorship unconfirmed',
    evidence: job.workAuthorizationEvidence || 'Review posting manually.',
    reason: job.reason || '',
    years: Number(job.requiredYears || 0),
    pmYears: Number(job.requiredPmYears || 0),
    title: job.title || '',
    company: job.company || '',
    location: job.location || '',
    basePay: job.salary?.min != null ? `$${Number(job.salary.min).toLocaleString()}–$${Number(job.salary.max).toLocaleString()}` : 'Not posted / verify',
    payStatus: job.compensationStatus || 'PAY NOT POSTED',
    companyFocus: job.preferredCompany ? 'Preferred company' : '',
    linkedin: job.officialSourceUrl || job.link ? { text: 'Open posting', hyperlink: job.officialSourceUrl || job.link } : '',
    application: job.applicationUrl || job.externalApplyUrl || job.link
      ? { text: 'Open application', hyperlink: job.applicationUrl || job.externalApplyUrl || job.link } : '',
    summary: job.summary || '',
  };
  sheet.addRow(shared);
});

sheet.autoFilter = { from: 'A1', to: 'R1' };
sheet.pageSetup.printArea = `A1:R${Math.max(1, sheet.rowCount)}`;
sheet.getRow(1).height = 30;
sheet.getRow(1).eachCell((cell) => {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  cell.alignment = { vertical: 'middle', wrapText: true };
});
for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
  const row = sheet.getRow(rowNumber);
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 45;
  const verdict = String(row.getCell(4).value || '');
  const color = verdict === 'SHORTLIST' ? 'FFE2F0D9'
    : verdict.startsWith('REVIEW') ? 'FFFFF2CC'
      : verdict === 'INELIGIBLE' ? 'FFFCE4D6'
        : rowNumber % 2 === 0 ? 'FFF3F6F9' : 'FFFFFFFF';
  row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; });
  for (const column of [7, 8]) {
    const cell = row.getCell(column);
    if (typeof cell.value === 'object') cell.font = { color: { argb: 'FF0563C1' }, underline: true };
  }
}
sheet.addConditionalFormatting({
  ref: `C2:C${Math.max(2, sheet.rowCount)}`,
  rules: [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
    color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }] }],
});

const output = requestedOutput
  ? (path.isAbsolute(requestedOutput) ? requestedOutput : path.join(root, 'runs', 'excel-sheets', requestedOutput))
  : path.join(root, 'runs', 'excel-sheets', `AutoApply_Jobs_${stamp}.xlsx`);
fs.mkdirSync(path.dirname(output), { recursive: true });
await workbook.xlsx.writeFile(output);
console.log(output);
