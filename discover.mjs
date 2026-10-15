#!/usr/bin/env node
/**
 * DISCOVER — searches real LinkedIn PM jobs (last 7 days), scores each against your resume
 * with Claude, writes a sorted spreadsheet.
 *
 * Source: LinkedIn job search in an authenticated browser session.
 * Output: jobs-scored.csv  (opens in Excel / Google Sheets / Numbers)
 *
 * Columns: Job Title | Company | Link | Match Score /10 | Tailored Summary
 * Sorted by match score, highest first.
 *
 * Usage: node discover.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { discoverLinkedInJobs } from './linkedin-jobs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- load key + profile ----
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '.env'), 'utf-8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';

// Concise resume context Claude scores against
const RESUME_CONTEXT = `
Candidate: Akash Shashikanth Sangami. Graduating MS Information Management, UIUC (May 2026, GPA 3.92).
Target: Product Manager / Technical PM / AI Product Manager / Associate PM roles. Consumer, mobile, social, AI/ML products.
Experience:
- Product Manager Intern, TikTok/ByteDance (2025): shipped consumer-social camera-effect features, A/B testing, +18% effect usage, +25% discoverability.
- Product Consultant, UIUC Business Intelligence Group (2025-26): discovery, PRDs, user stories, KPIs for a scheduling platform.
- Senior Engineer, Samsung R&D (2022-24): 4G/LTE platforms, raised test coverage 52%->80%.
- AI product projects: built prototypes with Claude, Claude Code, Cursor; NLP news app (150+ DAU, 40% WoW retention).
Skills: product strategy, roadmaps, PRDs, A/B testing, user research, SQL, Python, React, analytics, AI/LLM product work.
Strong fit: APM/PM/AI-PM/consumer/mobile/social/tech-product roles. Weak fit: pure retail/ops/category-specialist/sales/warehouse roles, senior roles needing 5+ yrs.
`.trim();

// ---- Claude call (batched scoring) ----
async function scoreBatch(batch) {
  const jobList = batch.map((j, i) => `${i + 1}. Title: "${j.title}" | Company: "${j.company}" | Location: "${j.location}" | Work Model: "${j.workModel}"`).join('\n');
  const prompt = `You are screening jobs for this candidate:

${RESUME_CONTEXT}

For EACH job below, output a match score 0-10 (how well it fits THIS candidate — real PM/APM/AI-PM/consumer/tech roles score high; retail/ops/sales/warehouse/category-specialist or senior 5+ yr roles score low) and a ONE-paragraph (2-3 sentence) tailored summary written as if it's the candidate's resume summary for that specific role (reference their most relevant experience).

Jobs:
${jobList}

Respond with ONLY a JSON array, one object per job in order, each: {"n": <number>, "score": <0-10 number, one decimal ok>, "summary": "<one paragraph>"}. No prose, no markdown fences.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json();
  if (!data.content) throw new Error(JSON.stringify(data.error || data));
  let text = data.content[0].text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(text);
}

// ---- CSV writer (properly escaped) ----
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;
  console.log('→ Searching LinkedIn for live PM jobs (last 7 days)...');
  let jobs = await discoverLinkedInJobs({ postedWithinDays: 7, limit: Number.isFinite(limit) ? limit : undefined });
  console.log(`✓ ${jobs.length} unique LinkedIn jobs discovered.`);
  console.log(`→ Scoring ${jobs.length} jobs with Claude (batches of 12)...\n`);

  const BATCH = 12;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    try {
      const scored = await scoreBatch(batch);
      scored.forEach((s) => {
        const job = batch[s.n - 1];
        if (job) { job.score = s.score; job.summary = s.summary; }
      });
      console.log(`  ✓ scored ${Math.min(i + BATCH, jobs.length)}/${jobs.length}`);
    } catch (e) {
      console.log(`  ⚠ batch ${i}-${i + BATCH} failed: ${e.message}`);
      batch.forEach((j) => { j.score = j.score ?? 0; j.summary = j.summary ?? '(scoring failed)'; });
    }
  }

  // sort by score desc
  jobs.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // write CSV
  const header = ['Job Title', 'Company', 'Link', 'Match Score (/10)', 'Tailored Summary'];
  const rows = [header.map(csvCell).join(',')];
  for (const j of jobs) {
    rows.push([j.title, j.company, j.link, j.score ?? 0, j.summary ?? ''].map(csvCell).join(','));
  }
  const outPath = path.join(__dirname, 'jobs-scored.csv');
  fs.writeFileSync(outPath, rows.join('\n'));

  console.log(`\n✓ Wrote ${jobs.length} scored jobs to jobs-scored.csv (sorted by match, highest first).`);
  console.log('\nTop 10:');
  jobs.slice(0, 10).forEach((j, i) => console.log(`  ${String(i + 1).padStart(2)}. [${(j.score ?? 0).toFixed(1)}] ${j.title} — ${j.company}`));
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
