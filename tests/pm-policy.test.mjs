import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPmPolicy, titleRelevance, extractBaseSalary, compensationStatus, companyPriority, extractExplicitPmYears, requiredDomainGap, undisclosedHiringCompany, safeSummaryForAuthorization } from '../pm-policy.mjs';

test('PM search policy respects salary, selectivity and current experience', () => {
  const policy = loadPmPolicy();
  assert.equal(policy.minimumBaseSalary, 100000);
  assert.equal(policy.maxRequiredYears, 4);
  assert.equal(policy.maxRequiredPmYears, 2);
  assert.ok(policy.maxShortlistPerRun <= 10);
  assert.equal(companyPriority('Microsoft', policy), true);
  assert.equal(companyPriority('Microsoft Corporation', policy), true);
  assert.equal(companyPriority('Uber Technologies', policy), true);
  assert.equal(companyPriority('AppleOne', policy), false);
  assert.equal(companyPriority('Unknown startup', policy), false);
});

test('includes PM titles and excludes internships and adjacent non-PM roles', () => {
  for (const title of ['Product Manager', 'Senior Product Manager, Compliance', 'Sr. Product Manager, AI', 'Technical Product Manager', 'Platform Product Owner', 'Senior PM, Platform']) {
    assert.equal(titleRelevance(title), true, title);
  }
  for (const title of ['Product Manager Intern', 'Graduate Product Manager', 'Product Marketing Manager', 'Technical Program Manager', 'Principal Product Manager', 'Lead Product Manager']) {
    assert.equal(titleRelevance(title), false, title);
  }
});

test('posted base pay is classified without treating equity or unknown pay as salary', () => {
  assert.deepEqual(extractBaseSalary('Base salary: $120,000 - $150,000 per year.'), { min: 120000, max: 150000, evidence: '$120,000 - $150,000' });
  assert.equal(compensationStatus(extractBaseSalary('Base salary $90k-$120k annually.'), 100000), 'VERIFY PAY');
  assert.equal(compensationStatus(extractBaseSalary('Base salary $80k-$95k annually.'), 100000), 'BELOW PAY TARGET');
  assert.equal(compensationStatus(extractBaseSalary('Salary discussed during interviews.'), 100000), 'PAY NOT POSTED');
  assert.equal(extractBaseSalary('Equity: $120k-$150k over four years.').min, null);
  assert.equal(extractBaseSalary('Redwood City Pay Range: $151,000 USD - $188,500 USD').min, 151000);
  assert.equal(extractBaseSalary('Hourly rate: $100-$120 per hour.').min, null);
});

test('explicit product management tenure is separate from overall experience', () => {
  assert.equal(extractExplicitPmYears('Requires 3+ years of product management experience.'), 3);
  assert.equal(extractExplicitPmYears('At least 5 years experience as a product manager.'), 5);
  assert.equal(extractExplicitPmYears('Preferred: 7 years of product management experience.'), 0);
  assert.equal(extractExplicitPmYears('Requires 4 years of engineering experience.'), 0);
  assert.equal(extractExplicitPmYears('2+ years of experience in product management, product operations, consulting, business integration, or a related role.'), 0);
});

test('manual review catches unsupported hard domain requirements and unnamed employers', () => {
  assert.match(requiredDomainGap('Experience in healthcare is required, preferably in care delivery.'), /healthcare experience/);
  assert.match(requiredDomainGap('Hands-on ERP implementation experience is required.'), /ERP implementation/);
  assert.equal(requiredDomainGap('Healthcare experience is a plus.'), '');
  assert.equal(undisclosedHiringCompany('Sharing this role on behalf of the hiring company.'), true);
  assert.equal(undisclosedHiringCompany('We are hiring directly for our product team.'), false);
  assert.equal(safeSummaryForAuthorization('Strong product fit. F-1 OPT aligns with this remote role.', 'NO_RESTRICTION_STATED'), 'Strong product fit.');
});
