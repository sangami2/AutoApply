#!/usr/bin/env node
/**
 * RESOLVE-ATS — turns (company, job title) into a DIRECT application URL by
 * querying the public JSON APIs of Greenhouse, Lever, and Ashby with likely
 * board-token guesses. No login, no scraping — these APIs are public by design.
 *
 * Used by daily-run.mjs. Also runnable standalone:
 *   node resolve-ats.mjs "FanDuel" "Data Product Manager"
 */

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Words that change what the JOB IS. If the candidate title has one of these
// and the target doesn't, it's a different role ("Product MARKETING Manager"
// is not "Product Manager") — reject regardless of overlap.
const ROLE_WORDS = ['marketing', 'design', 'designer', 'engineer', 'engineering', 'sales',
  'security', 'hardware', 'staff', 'principal', 'director', 'vp', 'counsel', 'intern',
  'scientist', 'analyst', 'researcher', 'recruiter', 'finance', 'accounting', 'legal'];

// Token-overlap similarity between job titles (0..1), with role-word guard
function titleScore(target, candidate) {
  const ta = new Set(norm(target).split(' ')), tb = new Set(norm(candidate).split(' '));
  if (!ta.size || !tb.size) return 0;
  for (const w of ROLE_WORDS) if (tb.has(w) && !ta.has(w)) return 0; // different role
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size);
}

// Likely board tokens for a company name: "IXL Learning" -> ixllearning, ixl-learning, ixl
function slugVariants(company) {
  const base = norm(company).replace(/\b(inc|llc|corp|co|ltd|ai|labs)\b/g, '').trim();
  const words = base.split(' ').filter(Boolean);
  const out = new Set([
    words.join(''), words.join('-'),
    norm(company).split(' ').join(''), norm(company).split(' ').join('-'),
  ]);
  if (words.length > 1) { out.add(words[0]); out.add(words.slice(0, 2).join('')); }
  return [...out].filter(Boolean);
}

async function tryJson(url, opts = {}) {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function resolveATS(company, title) {
  for (const slug of slugVariants(company)) {
    // Greenhouse: public board API
    const gh = await tryJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
    if (gh && Array.isArray(gh.jobs)) {
      const best = gh.jobs.map((j) => ({ j, s: titleScore(title, j.title) })).sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0.5) return { ats: 'greenhouse', url: best.j.absolute_url, matchedTitle: best.j.title, confidence: best.s };
    }
    // Lever: public postings API
    const lv = await tryJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    if (Array.isArray(lv) && lv.length) {
      const best = lv.map((j) => ({ j, s: titleScore(title, j.text) })).sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0.5) return { ats: 'lever', url: best.j.hostedUrl + '/apply', matchedTitle: best.j.text, confidence: best.s };
    }
    // Ashby: public job-board API
    const ab = await tryJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=false`);
    if (ab && Array.isArray(ab.jobs) && ab.jobs.length) {
      const best = ab.jobs.map((j) => ({ j, s: titleScore(title, j.title) })).sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0.5) {
        const u = best.j.jobUrl || `https://jobs.ashbyhq.com/${slug}/${best.j.id}`;
        return { ats: 'ashby', url: u.replace(/\/$/, '') + '/application', matchedTitle: best.j.title, confidence: best.s };
      }
    }
  }
  return null;
}

// Standalone CLI
if (process.argv[1] && process.argv[1].endsWith('resolve-ats.mjs') && process.argv[2]) {
  const [company, ...t] = process.argv.slice(2);
  const title = t.join(' ');
  resolveATS(company, title).then((r) => {
    if (r) console.log(`✓ ${r.ats} (${(r.confidence * 100).toFixed(0)}% title match): ${r.url}\n  matched: "${r.matchedTitle}"`);
    else console.log('✗ Not resolved — mark MANUAL');
  });
}
