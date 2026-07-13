import axios from 'axios';
import { createLogger } from '@job-copilot/shared';
import { NormalizedJob } from './normalization';

const logger = createLogger('discovery:enrichment');

export interface EnrichedJob extends NormalizedJob {
  enrichedAt?: Date;
  fullerDescription?: string;
  atsProvider?: string;
  detectedPortal?: string;
  enrichmentError?: string;
}

// ATS provider detection patterns
const ATS_PATTERNS: Record<string, RegExp[]> = {
  workday: [
    /workday/i,
    /myworkdayjobs/,
    /wday\.com/,
    /careers\.workday\.com/,
    /jobs\.workday\.com/,
  ],
  greenhouse: [
    /greenhouse/i,
    /greenhouse\.io/,
    /boards\.greenhouse\.io/,
    /hiring\.greenhouse\.io/,
  ],
  lever: [
    /lever/i,
    /lever\.co/,
    /jobs\.lever\.co/,
    /apply\.lever\.co/,
  ],
  ashby: [
    /ashby/i,
    /jobs\.ashby\.com/,
    /ashby\.com.*careers/i,
  ],
  icims: [
    /icims/i,
    /icims\.com/,
    /talentcloud.*icims/i,
  ],
  phenom: [
    /phenom/i,
    /phenom\.com/,
    /jobs\.phenom\.com/,
  ],
  taleo: [
    /taleo/i,
    /taleo\.net/,
    /erecruit\.taleo\.net/,
  ],
  smartrecruiters: [
    /smartrecruiters/i,
    /app\.smartrecruiters\.com/,
  ],
  jobvite: [
    /jobvite/i,
    /jobvite\.com/,
    /jobs\.jobvite\.com/,
  ],
  successfactors: [
    /successfactors/i,
    /sapjobs\.successfactors\.com/,
  ],
};

export class JobEnricher {
  async enrichJob(job: NormalizedJob): Promise<EnrichedJob> {
    const enriched: EnrichedJob = { ...job, enrichedAt: new Date() };

    // Detect ATS provider
    enriched.atsProvider = this.detectATS(job.externalApplyUrl || job.listingUrl);
    enriched.detectedPortal = enriched.atsProvider;

    // Try to fetch fuller description
    if (job.externalApplyUrl && !job.description?.includes('responsibilities')) {
      try {
        const fuller = await this.fetchJobDescription(job.externalApplyUrl);
        if (fuller && fuller.length > job.description?.length || 0) {
          enriched.fullerDescription = fuller;
        }
      } catch (error) {
        logger.warn(
          {
            jobId: job.sourceJobId,
            url: job.externalApplyUrl,
            error,
          },
          'Failed to fetch fuller description'
        );
        enriched.enrichmentError = 'Failed to fetch fuller description';
      }
    }

    return enriched;
  }

  private detectATS(url: string): string | undefined {
    if (!url) return undefined;

    for (const [atsName, patterns] of Object.entries(ATS_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(url)) {
          logger.debug({ url, atsName }, 'Detected ATS');
          return atsName;
        }
      }
    }

    return undefined;
  }

  private async fetchJobDescription(url: string): Promise<string | undefined> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (response.status !== 200) {
        return undefined;
      }

      const html = response.data;

      // Extract text from common job description containers
      const descPatterns = [
        /<div[^>]*class="[^"]*description[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*id="[^"]*description[^"]*"[^>]*>(.*?)<\/div>/is,
        /<article[^>]*>(.*?)<\/article>/is,
        /<main[^>]*>(.*?)<\/main>/is,
      ];

      for (const pattern of descPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          const text = this.stripHTML(match[1]).trim();
          if (text.length > 200) {
            return text;
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.debug({ url, error }, 'Failed to fetch URL');
      return undefined;
    }
  }

  private stripHTML(html: string): string {
    return html
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Verify that a job posting is still open
   */
  async verifyJobIsOpen(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });

      return response.status < 400;
    } catch (error) {
      logger.debug({ url, error }, 'Failed to verify job is open');
      return false;
    }
  }
}
