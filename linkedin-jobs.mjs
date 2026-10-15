#!/usr/bin/env node
/**
 * LINKEDIN JOB DISCOVERY
 *
 * Searches LinkedIn in a real Chromium session and returns the rendered job
 * cards in the shape consumed by discover.mjs and daily-run.mjs. The same
 * persistent browser profile used by apply-window.mjs is reused, so LinkedIn
 * login survives between discovery and application runs.
 *
 * This is browser automation, not an official LinkedIn API. It never submits
 * an application and never stores LinkedIn credentials in this repository.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AutomationSafety } from './automation-safety.mjs';
import { titleRelevance } from './pm-policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'config', 'linkedin-search.json');
const EXAMPLE_CONFIG_PATH = path.join(__dirname, 'config', 'linkedin-search.example.json');
const PROFILE_PATH = path.join(__dirname, 'private-data', 'profile.json');
// Discovery uses its own Chrome profile so a manually opened AutoApply Chrome
// session cannot lock the scheduled scanner out of its user-data directory.
const BROWSER_PROFILE_PATH = path.resolve(process.env.LINKEDIN_PROFILE_PATH || path.join(__dirname, '.browser-profile-daily'));
const safety = new AutomationSafety(__dirname);

function clearStaleChromeProfileLocks() {
  const lockPath = path.join(BROWSER_PROFILE_PATH, 'SingletonLock');
  // existsSync follows symlinks and returns false for Chrome's stale/broken
  // SingletonLock symlink, so use lstat to detect the directory entry itself.
  try { fs.lstatSync(lockPath); } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  let owner = '';
  try { owner = fs.readlinkSync(lockPath); } catch { return; }
  const pid = Number(owner.match(/-(\d+)$/)?.[1]);
  if (!pid) return;
  try {
    process.kill(pid, 0);
    throw new Error(`LinkedIn browser profile is actively used by Chrome process ${pid}. Close that AutoApply Chrome window and retry.`);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try { fs.unlinkSync(path.join(BROWSER_PROFILE_PATH, name)); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  console.log(`  Cleared stale Chrome profile lock from exited process ${pid}.`);
}

async function launchLinkedInContext() {
  clearStaleChromeProfileLocks();
  const options = {
    headless: process.env.HEADLESS === '1',
    slowMo: 40,
    viewport: null,
    args: ['--start-maximized'],
    timeout: 30_000,
  };
  try {
    return await chromium.launchPersistentContext(BROWSER_PROFILE_PATH, {
      ...options,
      channel: 'chrome',
    });
  } catch (error) {
    // Chrome can occasionally crash on startup; use Playwright's tested browser
    // with the same persistent profile so the scheduled scan can still proceed.
    console.warn(`  System Chrome did not start (${error.message}); retrying with Playwright Chromium.`);
    clearStaleChromeProfileLocks();
    return chromium.launchPersistentContext(BROWSER_PROFILE_PATH, options);
  }
}

const EXPERIENCE_CODES = {
  internship: '1',
  'entry level': '2',
  associate: '3',
  'mid-senior level': '4',
  director: '5',
  executive: '6',
};
const JOB_TYPE_CODES = {
  'full-time': 'F',
  'part-time': 'P',
  contract: 'C',
  temporary: 'T',
  internship: 'I',
  volunteer: 'V',
  other: 'O',
};
const WORK_MODEL_CODES = { 'on-site': '1', remote: '2', hybrid: '3' };

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const unique = (values) => [...new Set(values.map(clean).filter(Boolean))];
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));

export function loadLinkedInSearchConfig(configPath = DEFAULT_CONFIG_PATH) {
  const profile = fs.existsSync(PROFILE_PATH) ? readJson(PROFILE_PATH) : {};
  const configured = fs.existsSync(configPath)
    ? readJson(configPath)
    : (fs.existsSync(EXAMPLE_CONFIG_PATH) ? readJson(EXAMPLE_CONFIG_PATH) : {});

  const config = {
    searchTerms: unique(configured.searchTerms?.length ? configured.searchTerms : (profile.targetRoles || [])),
    locations: unique(configured.locations?.length ? configured.locations : (profile.targetLocations || [])),
    experienceLevels: unique(configured.experienceLevels || []),
    unfilteredExperienceTerms: unique(configured.unfilteredExperienceTerms || []),
    strictTitleTerms: unique(configured.strictTitleTerms || []),
    jobTypes: unique(configured.jobTypes || []),
    workModels: unique(configured.workModels || []),
    easyApplyOnly: configured.easyApplyOnly === true,
    maxPagesPerSearch: Number(configured.maxPagesPerSearch || 40),
    maxResultsPerSearchTerm: Number(configured.maxResultsPerSearchTerm || 20),
    maxTotalResults: Number(configured.maxTotalResults ?? 0),
    loginWaitMinutes: Number(configured.loginWaitMinutes || 5),
  };

  if (!config.searchTerms.length) throw new Error('LinkedIn search has no searchTerms. Add them to config/linkedin-search.json.');
  if (!config.locations.length) config.locations = ['United States'];
  if (!Number.isFinite(config.maxPagesPerSearch) || config.maxPagesPerSearch < 1) config.maxPagesPerSearch = 40;
  if (!Number.isFinite(config.maxResultsPerSearchTerm) || config.maxResultsPerSearchTerm < 1) config.maxResultsPerSearchTerm = 20;
  if (!Number.isFinite(config.maxTotalResults) || config.maxTotalResults < 0) config.maxTotalResults = 0;
  return config;
}

function mappedCodes(values, mapping) {
  return unique(values.map((value) => mapping[value.toLowerCase()]).filter(Boolean));
}

export function buildLinkedInSearchUrl({
  keywords,
  location,
  postedWithinDays = 7,
  start = 0,
  config,
}) {
  const url = new URL('https://www.linkedin.com/jobs/search/');
  url.searchParams.set('keywords', keywords);
  url.searchParams.set('location', location);
  url.searchParams.set('f_TPR', `r${Math.max(1, Math.round(postedWithinDays * 86400))}`);
  url.searchParams.set('sortBy', 'DD');
  if (start) url.searchParams.set('start', String(start));

  const experience = mappedCodes(config.experienceLevels, EXPERIENCE_CODES);
  const jobTypes = mappedCodes(config.jobTypes, JOB_TYPE_CODES);
  const workModels = mappedCodes(config.workModels, WORK_MODEL_CODES);
  if (experience.length) url.searchParams.set('f_E', experience.join(','));
  if (jobTypes.length) url.searchParams.set('f_JT', jobTypes.join(','));
  if (workModels.length) url.searchParams.set('f_WT', workModels.join(','));
  if (config.easyApplyOnly) url.searchParams.set('f_AL', 'true');
  return url.toString();
}

async function requiresLogin(page) {
  const url = page.url();
  if (/(\/login|\/checkpoint|authwall)/i.test(url)) return true;
  return await page.locator('input#username, input[name="session_key"]').count() > 0;
}

async function waitForLinkedInLogin(page, targetUrl, loginWaitMinutes) {
  if (!(await requiresLogin(page))) return;
  if (process.env.HEADLESS === '1') {
    throw new Error('LinkedIn login is required. Run once without HEADLESS=1 and sign in in the browser window.');
  }

  console.log(`\nLinkedIn needs your login/checkpoint. Complete it in the browser (waiting up to ${loginWaitMinutes} minutes).`);
  const deadline = Date.now() + loginWaitMinutes * 60_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    if (!(await requiresLogin(page))) {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      return;
    }
  }
  throw new Error('Timed out waiting for LinkedIn login. Run discovery again after signing in.');
}

async function cardText(card, selectors) {
  for (const selector of selectors) {
    const locator = card.locator(selector).first();
    if (await locator.count()) {
      const text = clean(await locator.innerText().catch(() => ''));
      if (text) return text;
    }
  }
  return '';
}

async function extractCards(page) {
  // Extract every card in one in-page DOM pass. Per-element Playwright calls
  // are extremely slow against LinkedIn's constantly re-rendered virtual list.
  const raw = await page.locator('li[data-occludable-job-id]').evaluateAll((cards) => {
    const tidy = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const firstText = (card, selectors) => {
      for (const selector of selectors) {
        const text = tidy(card.querySelector(selector)?.textContent);
        if (text) return text;
      }
      return '';
    };
    return cards.map((card) => {
      const href = card.querySelector('a[href*="/jobs/view/"]')?.getAttribute('href') || '';
      const jobId = tidy(card.getAttribute('data-occludable-job-id')) || href.match(/\/jobs\/view\/(\d+)/)?.[1] || '';
      return {
        jobId,
        title: firstText(card, ['.job-card-list__title--link', '.job-card-list__title', '.job-card-container__link strong', 'a[href*="/jobs/view/"] strong', 'a[href*="/jobs/view/"]']),
        company: firstText(card, ['.artdeco-entity-lockup__subtitle', '.job-card-container__primary-description', '.job-card-container__company-name']),
        location: firstText(card, ['.artdeco-entity-lockup__caption', '.job-card-container__metadata-item', '.job-card-container__metadata-wrapper']),
        easyApply: /\beasy apply\b/i.test(tidy(card.textContent)),
      };
    });
  }).catch(() => []);

  return raw.filter((job) => job.jobId && job.title && job.company).map((job) => ({
    source: 'linkedin',
    sourceJobId: job.jobId,
    title: job.title,
    company: job.company,
    location: job.location,
    workModel: /\bremote\b/i.test(job.location) ? 'Remote'
      : /\bhybrid\b/i.test(job.location) ? 'Hybrid'
      : /\bon-site\b|\bonsite\b/i.test(job.location) ? 'On-site' : '',
    easyApply: job.easyApply,
    // /jobs/view/<id> is LinkedIn's public/SEO permalink — good for a spreadsheet
    // link, but navigating there directly does NOT reliably render the
    // interactive Apply button (confirmed: it stays unrendered even after a
    // 60s networkidle wait). The SPA route below (used when a user clicks a
    // search result) loads the same job inside the authenticated app shell and
    // reliably renders the Apply/Easy Apply control within ~3s. Always use
    // applyNavUrl, never `link`, when the code needs to interact with the page.
    link: `https://www.linkedin.com/jobs/view/${job.jobId}`,
    applyNavUrl: `https://www.linkedin.com/jobs/search/?currentJobId=${job.jobId}`,
  }));
}

async function extractVirtualizedResultPage(page, limit = 25) {
  const collected = new Map();
  let unchangedPasses = 0;
  for (let pass = 0; pass < 20 && collected.size < limit; pass++) {
    const before = collected.size;
    for (const job of await extractCards(page)) collected.set(job.sourceJobId, job);
    unchangedPasses = collected.size === before ? unchangedPasses + 1 : 0;
    if (unchangedPasses >= 2) break;

    const scroll = await page.evaluate(() => {
      let list = document.querySelector('li[data-occludable-job-id]')?.parentElement;
      while (list && list !== document.body && list.scrollHeight <= list.clientHeight + 5) list = list.parentElement;
      if (list) {
        list.scrollTop = Math.min(list.scrollHeight, list.scrollTop + Math.max(600, list.clientHeight * 0.85));
        return { top: list.scrollTop, height: list.scrollHeight, client: list.clientHeight };
      }
      window.scrollBy(0, Math.max(600, window.innerHeight * 0.85));
      return { top: window.scrollY, height: document.documentElement.scrollHeight, client: window.innerHeight };
    }).catch(() => null);
    await page.waitForTimeout(500);
  }
  return [...collected.values()].slice(0, limit);
}

export async function discoverLinkedInJobs({
  postedWithinDays = 7,
  limit,
  limitPerTerm,
  searchTerm,
  configPath = DEFAULT_CONFIG_PATH,
} = {}) {
  const config = loadLinkedInSearchConfig(configPath);
  const configuredLimit = config.maxTotalResults > 0 ? config.maxTotalResults : Number.POSITIVE_INFINITY;
  const requestedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.min(Number(limit), configuredLimit)
    : configuredLimit;
  const termLimit = Number.isFinite(Number(limitPerTerm)) && Number(limitPerTerm) > 0
    ? Number(limitPerTerm) : config.maxResultsPerSearchTerm;
  const context = await launchLinkedInContext();
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(12_000);
  page.setDefaultNavigationTimeout(45_000);
  const found = new Map();

  try {
    outer: for (const keywords of (searchTerm ? [searchTerm] : config.searchTerms)) {
      const termSeen = new Set();
      let termAdded = 0;
      for (const location of config.locations) {
        if (termAdded >= termLimit) break;
        const unfilteredExperience = config.unfilteredExperienceTerms
          .some((term) => term.toLowerCase() === keywords.toLowerCase());
        const strictTitle = config.strictTitleTerms
          .find((term) => term.toLowerCase() === keywords.toLowerCase());
        const queryConfig = unfilteredExperience ? { ...config, experienceLevels: [] } : config;
        const searchKeywords = unfilteredExperience ? `"${keywords}"` : keywords;
        const pages = unfilteredExperience ? Math.min(config.maxPagesPerSearch, 12) : config.maxPagesPerSearch;
        let consecutiveEmptyPages = 0;
        for (let pageNumber = 0; pageNumber < pages; pageNumber++) {
          if (termAdded >= termLimit) break;
          const targetUrl = buildLinkedInSearchUrl({
            keywords: searchKeywords,
            location,
            postedWithinDays,
            start: pageNumber * 25,
            config: queryConfig,
          });
          try {
            await safety.beforeLinkedInSearch();
          } catch (error) {
            if (/Daily LinkedIn search safety limit reached/i.test(error.message)) {
              console.log(`  ⏹ ${error.message} Returning ${found.size} jobs collected so far.`);
              break outer;
            }
            throw error;
          }
          console.log(`  LinkedIn: "${keywords}" · ${location}${pageNumber ? ` · page ${pageNumber + 1}` : ''}`);
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
            .catch((error) => console.warn(`    navigation note: ${error.message}`));
          console.log(`    page loaded: ${page.url()}`);
          await waitForLinkedInLogin(page, targetUrl, config.loginWaitMinutes);

          await page.locator('li[data-occludable-job-id]').first().waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(1200);

          const renderedCards = await extractVirtualizedResultPage(page, 25);
          const cards = strictTitle
            ? renderedCards.filter((job) => job.title.toLowerCase().includes(strictTitle.toLowerCase()))
            : renderedCards;
          const relevantCards = cards.filter((job) => titleRelevance(job.title));
          for (const job of relevantCards) {
            if (termSeen.has(job.sourceJobId)) continue;
            termSeen.add(job.sourceJobId);
            if (!found.has(job.sourceJobId)) {
              found.set(job.sourceJobId, job);
              termAdded++;
            }
            if (found.size >= requestedLimit) break outer;
            if (termAdded >= termLimit) break;
          }
          console.log(`    found ${relevantCards.length} PM cards from ${renderedCards.length} rendered (${found.size} unique total)`);
          consecutiveEmptyPages = renderedCards.length ? 0 : consecutiveEmptyPages + 1;
          if (consecutiveEmptyPages >= 2) break;
          await safety.actionPause(2);
        }
        await safety.actionPause(2);
      }
    }
  } finally {
    await context.close().catch(() => {});
  }
  return Number.isFinite(requestedLimit) ? [...found.values()].slice(0, requestedLimit) : [...found.values()];
}

/** Load full descriptions and application metadata only for shortlisted jobs. */
export async function enrichLinkedInJobs(jobs) {
  if (!jobs.length) return jobs;
  const config = loadLinkedInSearchConfig();
  const context = await launchLinkedInContext();
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultNavigationTimeout(45_000);

  try {
    for (const job of jobs) {
      await safety.actionPause(2);
      console.log(`  Reading LinkedIn job details: ${job.title} @ ${job.company}`);
      // Use the SPA route (currentJobId), NOT the /jobs/view/<id> permalink.
      // Confirmed by direct testing: navigating straight to the permalink never
      // renders the interactive Apply button, even after a 60s networkidle
      // wait. Loading the job inside the search app shell renders it in ~3s.
      const navUrl = job.applyNavUrl || job.link;
      await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
      await waitForLinkedInLogin(page, navUrl, config.loginWaitMinutes);
      await page.waitForFunction(() => document.querySelector('.jobs-description-content__text, .jobs-box__html-content, #job-details'), null, { timeout: 8_000 }).catch(() => {});
      await page.waitForSelector('.jobs-apply-button', { timeout: 8_000 }).catch(() => {});
      const details = await page.evaluate(() => {
        const tidy = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const description = [...document.querySelectorAll('.jobs-description-content__text, .jobs-description__content, .jobs-box__html-content, #job-details')]
          .map((node) => tidy(node.textContent)).sort((left, right) => right.length - left.length)[0] || '';
        // LinkedIn tags BOTH the Easy Apply button and the external-apply
        // button with class "jobs-apply-button" — that class is the reliable
        // signal for "this is the primary apply CTA", not button text (which
        // LinkedIn now renders as plain "Apply" for both cases). The aria-label
        // is what distinguishes them: Easy Apply's aria-label is literally
        // "LinkedIn Apply to <title> at <company>"; external applications
        // don't carry that "LinkedIn " prefix.
        const apply = document.querySelector('.jobs-apply-button')
          || [...document.querySelectorAll('button, a')].find((node) => {
            const t = tidy(node.textContent);
            const a = tidy(node.getAttribute('aria-label'));
            return /^easy apply$/i.test(t) || /^apply$/i.test(t) || /^linkedin apply\b/i.test(a);
          });
        const applyAria = tidy(apply?.getAttribute('aria-label'));
        const applyText = tidy(apply?.textContent);
        const isEasyApply = /^linkedin apply\b/i.test(applyAria) || /^easy apply$/i.test(applyText);
        return { description, applyText, applyAria, isEasyApply, hasLinkedInApply: Boolean(apply) };
      }).catch(() => ({ description: '', applyText: '', applyAria: '', isEasyApply: false, hasLinkedInApply: false }));
      job.description = details.description.slice(0, 16_000);
      if (job.description.length < 200) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
        await page.waitForFunction(() => {
          return [...document.querySelectorAll('.jobs-description-content__text, .jobs-description__content, .jobs-box__html-content, #job-details')]
            .some((node) => (node.textContent || '').trim().length >= 200);
        }, null, { timeout: 6_000 }).catch(() => {});
        const retried = await page.evaluate(() => [...document.querySelectorAll('.jobs-description-content__text, .jobs-description__content, .jobs-box__html-content, #job-details')]
          .map((node) => String(node.textContent || '').replace(/\s+/g, ' ').trim())
          .sort((left, right) => right.length - left.length)[0] || '').catch(() => '');
        if (retried.length > job.description.length) job.description = retried.slice(0, 16_000);
      }
      job.easyApply = details.isEasyApply || job.easyApply;
      job.hasLinkedInApply = details.hasLinkedInApply;
      console.log(`    apply button: text="${details.applyText}" aria="${details.applyAria}" → ${job.easyApply ? 'Easy Apply' : details.hasLinkedInApply ? 'external' : 'not found'}`);

      // External applications often contain a cleaner, complete description
      // than LinkedIn's SPA. Open the Apply destination for inspection only;
      // no form fields or submit controls are touched here.
      if (!job.easyApply && details.hasLinkedInApply) {
        const sourceUrl = page.url();
        const popupPromise = context.waitForEvent('page', { timeout: 4_000 }).catch(() => null);
        await page.locator('.jobs-apply-button').first().click({ timeout: 6_000 }).catch(() => {});
        const popup = await popupPromise;
        const target = popup || page;
        await target.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {});
        await target.waitForTimeout(1800);
        const targetUrl = target.url();
        if (targetUrl && targetUrl !== sourceUrl && !/linkedin\.com\/jobs\/view/i.test(targetUrl)) {
          job.externalApplyUrl = targetUrl;
          const externalText = clean(await target.locator('main, body').first().innerText({ timeout: 8_000 }).catch(() => ''));
          if (externalText.length > job.description.length) job.description = externalText.slice(0, 16_000);
        }
        if (popup) await popup.close().catch(() => {});
      }
      console.log(`    description: ${job.description.length} chars · apply: ${job.easyApply ? 'Easy Apply' : details.hasLinkedInApply ? 'Apply' : 'not detected'}`);
      await safety.actionPause(2);
    }
  } finally {
    await context.close().catch(() => {});
  }
  return jobs;
}

async function cli() {
  const args = process.argv.slice(2);
  const value = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const days = Number(value('--days', '1'));
  const rawLimit = Number(value('--limit', '0'));
  const jobs = await discoverLinkedInJobs({ postedWithinDays: days, limit: rawLimit > 0 ? rawLimit : undefined });
  console.log(`\n${jobs.length} unique LinkedIn jobs found.`);
  console.log(JSON.stringify(jobs, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch((error) => { console.error('LinkedIn discovery failed:', error.message); process.exit(1); });
}
