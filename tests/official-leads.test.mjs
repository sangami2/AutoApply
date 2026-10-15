import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOfficialLeads } from '../official-leads.mjs';
import { extractBaseSalary } from '../pm-policy.mjs';

test('official Morgan posting is read from Greenhouse with its pay and direct link', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    return { ok: true, status: 200, json: async () => ({
      id: 5831710004, title: 'Product Manager',
      absolute_url: 'https://job-boards.greenhouse.io/morganmorganjobsapplynow/jobs/5831710004',
      location: { name: 'Brooklyn, New York, United States' },
      content: '&lt;p&gt;2+ years of experience in product management, product operations, consulting, or a related role.&lt;/p&gt;&lt;p&gt;Salary Range: $120,000&mdash;$150,000 USD&lt;/p&gt;',
    }) };
  };
  const jobs = await fetchOfficialLeads({ fetchImpl, selected: (item) => item.company === 'Morgan & Morgan' });
  assert.equal(requests.length, 1);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, 'Morgan & Morgan');
  assert.equal(jobs[0].pinnedPick, true);
  assert.equal(jobs[0].applicationUrl, jobs[0].officialSourceUrl);
  assert.deepEqual([extractBaseSalary(jobs[0].description).min, extractBaseSalary(jobs[0].description).max], [120000, 150000]);
});

test('official Kikoff posting preserves base pay and stated H-1B sponsorship', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({
    id: 4147830009, title: 'Product Manager',
    absolute_url: 'https://job-boards.greenhouse.io/kikoff/jobs/4147830009',
    location: { name: 'San Francisco, California' },
    content: '&lt;p&gt;Visa sponsorship available: H1-B visas.&lt;/p&gt;&lt;p&gt;Base Range $160,000 &amp;mdash; $200,000 USD&lt;/p&gt;',
  }) });
  const jobs = await fetchOfficialLeads({ fetchImpl, selected: (item) => item.company === 'Kikoff' });
  assert.equal(jobs.length, 1);
  assert.equal(extractBaseSalary(jobs[0].description).min, 160000);
  assert.match(jobs[0].description, /Visa sponsorship available/);
});

test('official Ashby role uses listed job and current posted compensation', async () => {
  const fetchImpl = async (url) => {
    if (url.startsWith('https://api.ashbyhq.com/')) return { ok: true, status: 200, json: async () => ({ jobs: [{
      id: 'fe97ce1b-5745-4b14-bf04-d3f7b309aaa7', title: 'Forward Deployed Product Manager (NYC)',
      isListed: true, jobUrl: 'https://jobs.ashbyhq.com/doss/fe97ce1b-5745-4b14-bf04-d3f7b309aaa7',
      applyUrl: 'https://jobs.ashbyhq.com/doss/fe97ce1b-5745-4b14-bf04-d3f7b309aaa7/application',
      location: 'New York City', descriptionPlain: '2+ years in engineering or consulting.',
    }] }) };
    return { ok: true, status: 200, text: async () => '<script>"compensationTierSummary":"$120K – $150K • Offers Equity"</script>' };
  };
  const jobs = await fetchOfficialLeads({ fetchImpl, selected: (item) => item.company === 'DOSS' });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, 'DOSS');
  assert.equal(extractBaseSalary(jobs[0].description).min, 120000);
  assert.equal(jobs[0].applicationUrl.endsWith('/application'), true);
});
