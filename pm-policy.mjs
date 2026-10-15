import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.join(root, 'config', 'pm-search-policy.json');

export function loadPmPolicy() {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  if (!Number.isFinite(policy.minimumBaseSalary) || policy.minimumBaseSalary <= 75000) {
    throw new Error('PM minimumBaseSalary must be above the current $75k base.');
  }
  if (!Number.isInteger(policy.maxShortlistPerRun) || policy.maxShortlistPerRun < 1) {
    throw new Error('PM maxShortlistPerRun must be a positive integer.');
  }
  if (!Number.isInteger(policy.maxRequiredPmYears) || policy.maxRequiredPmYears < 0) {
    throw new Error('PM maxRequiredPmYears must be a nonnegative integer.');
  }
  return policy;
}

export function titleRelevance(title) {
  const value = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (/\b(intern|internship|graduate|student|co op|apprentice)\b/.test(value)) return false;
  if (/\b(product marketing|marketing product|project manager|program manager|product operations|product analyst)\b/.test(value)) return false;
  if (/\b(chief|vice president|vp|director|head of|principal|staff|lead product manager|group product manager)\b/.test(value)) return false;
  return /\b(product manager|product owner|(?:senior|technical|platform|compliance|product) pm)\b/.test(value);
}

function amount(raw) {
  const cleaned = String(raw).replace(/,/g, '').toLowerCase();
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? Math.round(value * (/k\b/.test(cleaned) ? 1000 : 1)) : 0;
}

// Only use explicit annual USD base ranges. Equity, OTE, hourly pay and
// ambiguous numbers remain unknown so the candidate can verify them.
export function extractBaseSalary(description) {
  const text = String(description || '');
  const ranges = [];
  const pattern = /\$\s*([\d,]+(?:\.\d+)?\s*k?)\s*(?:USD\s*)?(?:-|–|—|to)\s*\$?\s*([\d,]+(?:\.\d+)?\s*k?)\b(?:\s*USD)?/gi;
  for (const match of text.matchAll(pattern)) {
    const low = amount(match[1]);
    const high = amount(match[2]);
    const context = text.slice(Math.max(0, match.index - 55), match.index + match[0].length + 12);
    if (low < 60000 || high < low || high > 1000000) continue;
    if (/\b(hour|hourly|equity|stock|ote|on.target.earnings|commission)\b/i.test(context)) continue;
    ranges.push({ min: low, max: high, evidence: match[0].trim() });
  }
  if (!ranges.length) return { min: null, max: null, evidence: '' };
  return {
    min: Math.min(...ranges.map((range) => range.min)),
    max: Math.max(...ranges.map((range) => range.max)),
    evidence: ranges.map((range) => range.evidence).join('; '),
  };
}

export function companyPriority(company, policy) {
  const normalized = String(company || '').toLowerCase().replace(/^the\s+/, '').trim();
  return policy.preferredCompanies.some((name) => {
    const target = name.toLowerCase();
    return normalized === target || (normalized.startsWith(target) && /[^a-z0-9]/.test(normalized[target.length] || ''));
  });
}

export function compensationStatus(salary, minimum) {
  if (salary.min == null || salary.max == null) return 'PAY NOT POSTED';
  if (salary.max < minimum) return 'BELOW PAY TARGET';
  if (salary.min >= minimum) return 'MEETS PAY TARGET';
  return 'VERIFY PAY';
}

export function extractExplicitPmYears(description) {
  const text = String(description || '');
  const pattern = /\b(\d{1,2})\s*(?:\+|or more)?\s*years?['’]?\s+(?:of\s+)?(?:experience\s+)?(?:in\s+|as\s+(?:a\s+)?)?(?:product management|product manager|pm)\b/gi;
  const years = [];
  for (const match of text.matchAll(pattern)) {
    const lead = text.slice(Math.max(0, match.index - 50), match.index).toLowerCase();
    if (/\b(preferred|nice to have|bonus)\b/.test(lead)) continue;
    const requirement = text.slice(match.index, match.index + 220).split(/[.;\n]/)[0];
    if (/\b(?:product management|product manager|pm)\s*(?:,|or)\s*[^.;\n]{0,160}\bor\b/i.test(requirement)
      || /\b(?:product management|product manager|pm)\s+or\b/i.test(requirement)) continue;
    years.push(Number(match[1]));
  }
  return years.length ? Math.max(...years) : 0;
}

export function requiredDomainGap(description) {
  const text = String(description || '');
  if (/\b(?:experience in healthcare is required|healthcare experience is required|healthcare experience required)\b/i.test(text)) {
    return 'Posting requires healthcare experience; none is documented in the candidate profile.';
  }
  if (/\bhands-on ERP implementation experience is required\b/i.test(text)) {
    return 'Posting requires hands-on ERP implementation experience; none is documented in the candidate profile.';
  }
  return '';
}

export function undisclosedHiringCompany(description) {
  return /\b(?:on behalf of (?:the|a|an) hiring company|on behalf of (?:an? )?unnamed (?:company|client)|confidential client|undisclosed (?:company|client))\b/i
    .test(String(description || ''));
}

export function safeSummaryForAuthorization(summary, status) {
  const value = String(summary || '').trim();
  if (status !== 'NO_RESTRICTION_STATED') return value;
  const sentences = value.match(/[^.!?]+[.!?]?/g) || [];
  return sentences.filter((sentence) => !/\b(?:F-1|OPT|STEM|H-1B|sponsor(?:ship)?)\b/i.test(sentence))
    .join(' ').trim() || 'Review role fit and work authorization with the employer.';
}
