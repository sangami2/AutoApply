import { createHash } from 'crypto';
import { createLogger } from '@job-copilot/shared';
import { parseISO, subDays, isAfter } from 'date-fns';

const logger = createLogger('discovery:normalization');

export interface RawJob {
  [key: string]: unknown;
}

export interface NormalizedJob {
  source: string;
  sourceJobId: string;
  sourceUrl: string;
  title: string;
  normalizedTitle: string;
  company: string;
  normalizedCompany: string;
  location: string;
  remoteType?: string;
  employmentType?: string;
  salaryText?: string;
  postedAt: Date;
  discoveredAt: Date;
  listingUrl: string;
  externalApplyUrl?: string;
  description?: string;
  descriptionHash?: string;
  descriptionSimplified?: string;
  requisitionId?: string;
  atsProvider?: string;
  easyApply?: boolean;
  isOpen?: boolean;
  rawSourceData: RawJob;
}

// Normalize company names
function normalizeCompanyName(company: string): string {
  return company
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[®™©]/g, '')
    .replace(/,\s*inc\.?$/i, '')
    .replace(/,\s*llc\.?$/i, '')
    .replace(/,\s*ltd\.?$/i, '')
    .replace(/,\s*co\.?$/i, '');
}

// Normalize job titles
function normalizeJobTitle(title: string): string {
  const normalized = title
    .toLowerCase()
    .trim()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ');

  // Map variations to canonical forms
  const titleMappings: Record<string, string> = {
    'product manager': 'product manager',
    'pm': 'product manager',
    'product mgr': 'product manager',
    'associate pm': 'associate product manager',
    'associate product manager': 'associate product manager',
    'senior product manager': 'senior product manager',
    'senior pm': 'senior product manager',
    'technical product manager': 'technical product manager',
    'tech pm': 'technical product manager',
    'ai product manager': 'ai product manager',
    'ml product manager': 'ai product manager',
    'data product manager': 'data product manager',
    'product owner': 'product owner',
    'product lead': 'product manager',
    'technical program manager': 'technical program manager',
    'program manager': 'program manager',
    'product operations': 'product operations',
  };

  for (const [key, value] of Object.entries(titleMappings)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return title.trim();
}

// Parse relative dates like "2 days ago"
function parseRelativeDate(dateStr: string): Date | null {
  const now = new Date();
  const lowerStr = dateStr.toLowerCase().trim();

  // Try ISO format first
  try {
    const parsed = parseISO(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch {
    // Continue to relative parsing
  }

  // Relative date patterns
  const patterns = [
    { regex: /^(\d+)\s*(?:minute|min)s?\s*ago$/i, unit: 'minutes' as const },
    { regex: /^(\d+)\s*(?:hour|hr)s?\s*ago$/i, unit: 'hours' as const },
    { regex: /^(\d+)\s*(?:day|d)s?\s*ago$/i, unit: 'days' as const },
    { regex: /^(\d+)\s*(?:week|w)s?\s*ago$/i, unit: 'weeks' as const },
    { regex: /^(\d+)\s*(?:month|m)s?\s*ago$/i, unit: 'months' as const },
  ];

  for (const { regex, unit } of patterns) {
    const match = lowerStr.match(regex);
    if (match) {
      const amount = parseInt(match[1], 10);
      switch (unit) {
        case 'minutes':
          return new Date(now.getTime() - amount * 60 * 1000);
        case 'hours':
          return new Date(now.getTime() - amount * 60 * 60 * 1000);
        case 'days':
          return subDays(now, amount);
        case 'weeks':
          return subDays(now, amount * 7);
        case 'months':
          return subDays(now, amount * 30);
      }
    }
  }

  return null;
}

// Compute description hash for deduplication
function hashDescription(description: string): string {
  const simplified = description
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 500); // Use first 500 chars
  return createHash('sha256').update(simplified).digest('hex');
}

// Simplify description for storage and matching
function simplifyDescription(description: string): string {
  return description
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 200)
    .slice(0, 20)
    .join('\n');
}

export class JobNormalizer {
  normalizeLinkedInJob(raw: RawJob, source: string = 'linkedin'): NormalizedJob {
    const jobId = String(raw.jobId || raw.id || '');
    let postedAt = new Date();

    // Parse LinkedIn date format
    if (raw.listedAt) {
      const parsed = parseRelativeDate(String(raw.listedAt));
      if (parsed) postedAt = parsed;
    }

    const description = String(raw.description || raw.jobDescription || '');
    const descriptionHash = hashDescription(description);

    return {
      source,
      sourceJobId: jobId,
      sourceUrl: String(raw.link || raw.jobUrl || ''),
      title: String(raw.jobTitle || raw.title || ''),
      normalizedTitle: normalizeJobTitle(String(raw.jobTitle || raw.title || '')),
      company: String(raw.companyName || raw.company || ''),
      normalizedCompany: normalizeCompanyName(String(raw.companyName || raw.company || '')),
      location: String(raw.location || ''),
      remoteType: this.classifyRemoteType(String(raw.location || '')),
      employmentType: String(raw.workType || raw.jobFunction || 'full-time'),
      salaryText: String(raw.salary || raw.salaryRange || ''),
      postedAt,
      discoveredAt: new Date(),
      listingUrl: String(raw.link || raw.jobUrl || ''),
      externalApplyUrl: String(raw.link || raw.jobUrl || ''),
      description,
      descriptionHash,
      descriptionSimplified: simplifyDescription(description),
      requisitionId: String(raw.jobId || ''),
      easyApply: Boolean(raw.easyApply),
      isOpen: true,
      rawSourceData: raw,
    };
  }

  normalizeIndeedJob(raw: RawJob, source: string = 'indeed'): NormalizedJob {
    const jobId = String(raw.jobKey || raw.id || '');
    let postedAt = new Date();

    // Parse Indeed date format
    if (raw.datePosted) {
      const parsed = parseRelativeDate(String(raw.datePosted));
      if (parsed) postedAt = parsed;
    }

    const description = String(raw.description || raw.jobDescription || '');
    const descriptionHash = hashDescription(description);

    return {
      source,
      sourceJobId: jobId,
      sourceUrl: String(raw.jobLink || raw.applyUrl || ''),
      title: String(raw.jobTitle || raw.title || ''),
      normalizedTitle: normalizeJobTitle(String(raw.jobTitle || raw.title || '')),
      company: String(raw.companyName || raw.company || ''),
      normalizedCompany: normalizeCompanyName(String(raw.companyName || raw.company || '')),
      location: String(raw.location || ''),
      remoteType: this.classifyRemoteType(String(raw.location || '')),
      employmentType: String(raw.jobType || 'full-time'),
      salaryText: String(raw.salary || raw.salaryRange || ''),
      postedAt,
      discoveredAt: new Date(),
      listingUrl: String(raw.jobLink || raw.applyUrl || ''),
      externalApplyUrl: String(raw.applyUrl || ''),
      description,
      descriptionHash,
      descriptionSimplified: simplifyDescription(description),
      requisitionId: undefined,
      easyApply: false,
      isOpen: true,
      rawSourceData: raw,
    };
  }

  private classifyRemoteType(location: string): string {
    const lower = location.toLowerCase();
    if (lower.includes('remote') || lower.includes('anywhere')) {
      return 'remote';
    }
    if (
      lower.includes('hybrid') ||
      lower.includes('flexible') ||
      lower.includes('on-site')
    ) {
      return 'hybrid';
    }
    return 'onsite';
  }

  filterByDate(job: NormalizedJob, daysBack: number): boolean {
    const cutoffDate = subDays(new Date(), daysBack);
    return isAfter(job.postedAt, cutoffDate);
  }
}
