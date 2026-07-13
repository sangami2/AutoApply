import { createLogger } from '@job-copilot/shared';
import { NormalizedJob } from './normalization';

const logger = createLogger('discovery:deduplication');

export interface DeduplicationResult {
  unique: NormalizedJob[];
  duplicates: Array<{
    job: NormalizedJob;
    duplicateOf: NormalizedJob;
    reason: string;
  }>;
}

export class JobDeduplicator {
  /**
   * Deduplicate jobs using multi-strategy approach:
   * 1. Requisition ID + normalized company (highest confidence)
   * 2. Canonical external application URL
   * 3. Normalized company + title + location + description hash
   * 4. Fuzzy title matching (future: implement levenshtein)
   */
  deduplicate(jobs: NormalizedJob[]): DeduplicationResult {
    const unique: NormalizedJob[] = [];
    const duplicates: DeduplicationResult['duplicates'] = [];
    const seen = new Map<string, NormalizedJob>();

    logger.info({ count: jobs.length }, 'Starting deduplication');

    for (const job of jobs) {
      // Strategy 1: Requisition ID + company
      if (job.requisitionId && job.requisitionId.length > 0) {
        const reqKey = `req:${job.requisitionId}:${job.normalizedCompany}`;
        if (seen.has(reqKey)) {
          duplicates.push({
            job,
            duplicateOf: seen.get(reqKey)!,
            reason: 'Requisition ID + company match',
          });
          continue;
        }
        seen.set(reqKey, job);
        unique.push(job);
        continue;
      }

      // Strategy 2: Canonical application URL
      if (job.externalApplyUrl && job.externalApplyUrl.length > 0) {
        const urlKey = `url:${this.normalizeUrl(job.externalApplyUrl)}`;
        if (seen.has(urlKey)) {
          duplicates.push({
            job,
            duplicateOf: seen.get(urlKey)!,
            reason: 'Canonical application URL match',
          });
          continue;
        }
        seen.set(urlKey, job);
        unique.push(job);
        continue;
      }

      // Strategy 3: Company + Title + Location + Description Hash
      if (job.descriptionHash) {
        const hashKey = `hash:${job.normalizedCompany}:${job.normalizedTitle}:${job.location}:${job.descriptionHash}`;
        if (seen.has(hashKey)) {
          duplicates.push({
            job,
            duplicateOf: seen.get(hashKey)!,
            reason: 'Company + title + location + description hash match',
          });
          continue;
        }
        seen.set(hashKey, job);
        unique.push(job);
        continue;
      }

      // Strategy 4: Company + Title + Location (lower confidence)
      const simpleKey = `simple:${job.normalizedCompany}:${job.normalizedTitle}:${job.location}`;
      if (seen.has(simpleKey)) {
        duplicates.push({
          job,
          duplicateOf: seen.get(simpleKey)!,
          reason: 'Company + title + location match (lower confidence)',
        });
        continue;
      }

      seen.set(simpleKey, job);
      unique.push(job);
    }

    logger.info(
      { unique: unique.length, duplicates: duplicates.length },
      'Deduplication complete'
    );

    return { unique, duplicates };
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove common tracking parameters
      const params = new URLSearchParams(parsed.search);
      params.delete('utm_source');
      params.delete('utm_medium');
      params.delete('utm_campaign');
      params.delete('utm_content');
      params.delete('utm_term');
      params.delete('ref');
      params.delete('source');

      return `${parsed.origin}${parsed.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    } catch {
      return url.toLowerCase().trim();
    }
  }
}
