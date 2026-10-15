import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Experience and work-authorization gates remain active alongside the PM policy.
test('experience gate: skip 5+ years, keep 4', () => {
  const MAX_REQUIRED_YEARS = 4;
  const skip = (yrs) => yrs > MAX_REQUIRED_YEARS;
  assert.equal(skip(5), true, '5 years should skip');
  assert.equal(skip(6), true, '6 years should skip');
  assert.equal(skip(4), false, '4 years should apply');
  assert.equal(skip(3), false, '3 years should apply');
  assert.equal(skip(0), false, 'unspecified should apply');
});

test('daily-run enforces experience, graduation, and sponsorship gates', () => {
  const src = fs.readFileSync(path.join(root, 'daily-run.mjs'), 'utf-8');
  assert.match(src, /MAX_REQUIRED_YEARS\s*=\s*PM_POLICY\.maxRequiredYears/, 'experience gate must use PM policy');
  assert.match(src, /requiredYears\s*>\s*MAX_REQUIRED_YEARS/, 'must skip on required years');
  assert.match(src, /EXPLICIT_NO_SPONSORSHIP/, 'must classify explicit no-sponsorship language');
  assert.match(src, /CITIZENSHIP_OR_CLEARANCE/, 'must classify citizenship and clearance restrictions');
  assert.match(src, /NO_RESTRICTION_STATED/, 'must give every job a non-empty classification');
  assert.match(src, /graduationEligibilityIssue/, 'must reject incompatible graduation windows');
});

test('daily flow never invokes resume tailoring', () => {
  const daily = fs.readFileSync(path.join(root, 'daily-run.mjs'), 'utf-8');
  assert.doesNotMatch(daily, /tailor-resume\.mjs/, 'daily-run must not invoke resume tailoring');
  assert.doesNotMatch(daily, /resumePdf|resumeFolder/, 'daily reports must not attach generated resumes');
  assert.match(daily, /0 resumes tailored/, 'completion output must make the boundary explicit');
});

test('daily flow cannot fill or submit applications', () => {
  const src = fs.readFileSync(path.join(root, 'daily-run.mjs'), 'utf-8');
  assert.doesNotMatch(src, /apply-window\.mjs/, 'daily flow must never launch application automation');
  assert.doesNotMatch(src, /AUTO_SUBMIT/, 'daily flow must not have an auto-submit mode');
  assert.match(src, /0 applications filled or submitted/, 'completion output must make the boundary explicit');
});

test('LinkedIn discovery balances relevant PM terms in the 24-hour window', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config/linkedin-search.json'), 'utf-8'));
  const src = fs.readFileSync(path.join(root, 'linkedin-jobs.mjs'), 'utf-8');
  const daily = fs.readFileSync(path.join(root, 'daily-run.mjs'), 'utf-8');
  assert.equal(cfg.maxTotalResults, 0, 'discovery must not have a fixed total-job cap');
  assert.ok(cfg.maxResultsPerSearchTerm > 0, 'must cap each term for a selective daily scan');
  assert.match(src, /consecutiveEmptyPages/, 'must paginate until results are exhausted');
  assert.match(src, /titleRelevance\(job\.title\)/, 'must drop unrelated titles before enrichment');
  assert.match(src, /termAdded >= termLimit/, 'must advance to the next search term after its quota');
  assert.match(src, /start:\s*pageNumber \* 25/, 'must advance LinkedIn result offsets');
  assert.match(daily, /postedWithinDays:\s*POSTED_WITHIN_DAYS/, 'daily discovery must support configurable catch-up windows');
  assert.match(daily, /--days/, 'daily runner must expose a catch-up window argument');
  assert.match(daily, /--per-term-limit/, 'daily runner must support a balanced one-off scan');
});

test('scheduled scan stays awake and uses an isolated browser profile', () => {
  const plist = fs.readFileSync(path.join(root, 'config/com.akash.autoapply.daily.plist'), 'utf-8');
  assert.match(plist, /\/usr\/bin\/caffeinate/, 'scheduled run must prevent system sleep while active');
  assert.match(plist, /\.browser-profile-daily/, 'scheduled run must use its own browser profile');
});

test('daily runner rejects overlapping scheduler starts', () => {
  const src = fs.readFileSync(path.join(root, 'daily-run.mjs'), 'utf-8');
  assert.match(src, /\.daily-run\.lock/, 'daily runner must own an exclusive process lock');
  assert.match(src, /Another AutoApply daily scan is already running/, 'duplicate scheduler starts must exit safely');
  assert.match(src, /process\.kill\(ownerPid, 0\)/, 'stale run locks must be distinguished from active runs');
});

test('daily runner supports a one-time pause without disabling future days', () => {
  const src = fs.readFileSync(path.join(root, 'daily-run.mjs'), 'utf-8');
  assert.match(src, /\.daily-skip-next/, 'daily runner must support a one-time skip marker');
  assert.match(src, /fs\.unlinkSync\(SKIP_NEXT_RUN_PATH\)/, 'one-time marker must be consumed automatically');
  assert.match(src, /Tomorrow.s schedule remains enabled/, 'skip must leave future scheduling enabled');
});

test('Excel export leads with focused picks and retains a complete scan tab', () => {
  const src = fs.readFileSync(path.join(root, 'export-job-scan.mjs'), 'utf-8');
  assert.equal((src.match(/addWorksheet\(/g) || []).length, 2, 'workbook must contain a focused and a full worksheet');
  assert.ok(src.indexOf("addWorksheet('PM Picks'") < src.indexOf("addWorksheet('All Scanned'"), 'PM Picks must be the first worksheet');
  assert.match(src, /job\.verdict === 'SHORTLIST'/, 'PM Picks must include only selected jobs');
  const summaryIndex = src.indexOf("{ header: 'Match Summary'");
  const applicationIndex = src.indexOf("{ header: 'Application Link'");
  assert.ok(summaryIndex > applicationIndex, 'match summary must be the last detailed column');
  assert.doesNotMatch(src, /Résumé PDF|Résumé Folder|Tailored Resume/, 'workbook must not include resume-generation columns');
  assert.match(src, /for \(const column of \[7, 8\]\)/, 'posting and application links must be adjacent near the front');
});
