#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const dateIndex = args.indexOf('--date');
const stamp = dateIndex >= 0 ? args[dateIndex + 1] : new Date().toISOString().slice(0, 10);
const companyIndex = args.indexOf('--company');
const companyFilter = companyIndex >= 0 ? String(args[companyIndex + 1] || '').toLowerCase() : '';
const reportPath = path.join(root, 'runs', `jobs-${stamp}.json`);
if (!fs.existsSync(reportPath)) throw new Error(`Missing ${reportPath}`);

const jobs = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
const shortlist = jobs.filter((job) => job.verdict === 'SHORTLIST'
  && (!companyFilter || String(job.company || '').toLowerCase().includes(companyFilter)));
if (!shortlist.length) throw new Error(`No shortlisted jobs matched${companyFilter ? ` company filter "${companyFilter}"` : ''}.`);
let failures = 0;

for (const [index, job] of shortlist.entries()) {
  console.log(`\n[${index + 1}/${shortlist.length}] Rebuilding ${job.title} @ ${job.company}`);
  const result = spawnSync(process.execPath, ['tailor-resume.mjs', job.title, job.company, job.description || ''], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    failures += 1;
    job.resumeError = `Full-page resume rebuild failed with exit code ${result.status}.`;
    continue;
  }
  const slug = `${job.company}-${job.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  job.resumePdf = path.join('applications', slug, 'akash_sangami.pdf');
  job.resumeFolder = path.dirname(job.resumePdf);
  delete job.resumeError;
}

fs.writeFileSync(reportPath, JSON.stringify(jobs, null, 2));
const exportResult = spawnSync(process.execPath, ['export-job-scan.mjs', '--date', stamp], { cwd: root, stdio: 'inherit' });
if (exportResult.status !== 0) throw new Error('Excel export failed after rebuilding resumes.');
if (failures) throw new Error(`${failures} of ${shortlist.length} shortlisted resumes failed the full-page quality gate.`);
console.log(`\n✓ Rebuilt ${shortlist.length} full-page resumes and refreshed runs/excel-sheets/AutoApply_Jobs_${stamp}.xlsx`);
