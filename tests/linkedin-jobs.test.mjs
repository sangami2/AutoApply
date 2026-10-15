import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildLinkedInSearchUrl, loadLinkedInSearchConfig } from '../linkedin-jobs.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('loads a usable LinkedIn search configuration', () => {
  const config = loadLinkedInSearchConfig();
  assert.ok(config.searchTerms.length > 0);
  assert.ok(config.locations.length > 0);
  assert.equal(config.maxTotalResults, 0, 'zero means no fixed total-results cap');
  assert.ok(config.maxPagesPerSearch >= 1);
  assert.equal(config.maxResultsPerSearchTerm, 20);
  assert.deepEqual(config.experienceLevels, ['Entry level', 'Associate', 'Mid-Senior level']);
  assert.ok(config.searchTerms.includes('Technical Product Manager'));
  assert.ok(config.searchTerms.includes('Senior Product Manager'));
  assert.ok(config.searchTerms.includes('Associate Product Manager'));
});

test('discovery captures virtualized cards and bypasses unreliable experience tags for exact APM roles', () => {
  const src = fs.readFileSync(path.join(root, 'linkedin-jobs.mjs'), 'utf-8');
  assert.match(src, /scrollHeight <= list\.clientHeight \+ 5/, 'scanner must find the actual scrollable results ancestor');
  assert.match(src, /unfilteredExperienceTerms/, 'scanner must support roles omitted by LinkedIn experience tags');
  assert.match(src, /strictTitleTerms/, 'unfiltered searches must retain strict title relevance');
  assert.match(src, /searchKeywords = unfilteredExperience \? `"\$\{keywords\}"`/, 'unfiltered title search must use an exact quoted phrase');
  assert.match(src, /consecutiveEmptyPages = renderedCards\.length/, 'strict title misses must not prematurely stop pagination');
});

test('builds a LinkedIn URL with native date and configured filters', () => {
  const config = {
    experienceLevels: ['Internship', 'Entry level', 'Associate'],
    jobTypes: ['Full-time'],
    workModels: ['Remote', 'Hybrid'],
    easyApplyOnly: true,
  };
  const url = new URL(buildLinkedInSearchUrl({
    keywords: 'Product Manager',
    location: 'United States',
    postedWithinDays: 1,
    start: 25,
    config,
  }));

  assert.equal(url.origin + url.pathname, 'https://www.linkedin.com/jobs/search/');
  assert.equal(url.searchParams.get('keywords'), 'Product Manager');
  assert.equal(url.searchParams.get('location'), 'United States');
  assert.equal(url.searchParams.get('f_TPR'), 'r86400');
  assert.equal(url.searchParams.get('f_E'), '1,2,3');
  assert.equal(url.searchParams.get('f_JT'), 'F');
  assert.equal(url.searchParams.get('f_WT'), '2,3');
  assert.equal(url.searchParams.get('f_AL'), 'true');
  assert.equal(url.searchParams.get('start'), '25');
});

test('discovery clears only stale isolated-profile Chrome locks', () => {
  const src = fs.readFileSync(path.join(root, 'linkedin-jobs.mjs'), 'utf-8');
  assert.match(src, /clearStaleChromeProfileLocks/, 'discovery must recover from an exited Chrome lock owner');
  assert.match(src, /process\.kill\(pid, 0\)/, 'discovery must check that the lock owner is not alive');
  assert.match(src, /error\.code !== 'ESRCH'/, 'an active or unknown lock must never be removed');
  assert.match(src, /lstatSync\(lockPath\)/, 'broken stale-lock symlinks must still be detected');
});
