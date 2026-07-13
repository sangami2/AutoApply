import { createLogger, CandidateProfile, SponsorshipStatus } from '@job-copilot/shared';
import { NormalizedJob } from '@job-copilot/discovery';
import { subDays, isBefore } from 'date-fns';

const logger = createLogger('evaluation:eligibility');

export interface EligibilityResult {
  passed: boolean;
  rejectionReasons: string[];
  sponsorshipStatus: SponsorshipStatus;
  evidence: Record<string, unknown>;
}

export class EligibilityEngine {
  constructor(
    private profile: CandidateProfile,
    private daysBack: number = 7,
    private maxExperienceYears: number = 15
  ) {}

  evaluate(job: NormalizedJob): EligibilityResult {
    const reasons: string[] = [];
    const evidence: Record<string, unknown> = {};
    let sponsorshipStatus = SponsorshipStatus.UNKNOWN;

    // Check if job is too old
    const cutoff = subDays(new Date(), this.daysBack);
    if (isBefore(job.postedAt, cutoff)) {
      reasons.push('Job posted more than ' + this.daysBack + ' days ago');
      evidence['tooOld'] = true;
    }

    // Check if application is closed
    if (!job.isOpen) {
      reasons.push('Application appears to be closed');
      evidence['isClosed'] = true;
    }

    // Check company exclusions
    if (this.profile.excludedCompanies?.includes(job.normalizedCompany)) {
      reasons.push('Company is in exclusion list');
      evidence['companyExcluded'] = true;
    }

    // Check keyword exclusions
    const description = (job.description || '').toLowerCase();
    const excludedKeyword = this.profile.excludedKeywords?.find((keyword) =>
      description.includes(keyword.toLowerCase())
    );
    if (excludedKeyword) {
      reasons.push(`Contains excluded keyword: "${excludedKeyword}"`);
      evidence['excludedKeyword'] = excludedKeyword;
    }

    // Check sponsorship language
    sponsorshipStatus = this.evaluateSponsorshipStatus(job, evidence);

    // Title/role matching
    const normalizedTargets = this.profile.targetRoles.map((r) => r.toLowerCase());
    const jobTitleLower = job.normalizedTitle.toLowerCase();
    const titleMatch = normalizedTargets.some((target) => jobTitleLower.includes(target));

    if (!titleMatch) {
      // Don't reject, just log
      logger.info(
        { jobTitle: job.normalizedTitle, targetRoles: this.profile.targetRoles },
        'Job title does not match target roles'
      );
      evidence['titleMismatch'] = true;
    }

    // Location check
    if (this.profile.targetLocations && this.profile.targetLocations.length > 0) {
      const locationMatch = this.profile.targetLocations.some((loc) =>
        job.location.toLowerCase().includes(loc.toLowerCase())
      );

      if (!locationMatch && !job.location.toLowerCase().includes('remote')) {
        reasons.push('Location does not match target locations');
        evidence['locationMismatch'] = true;
      }
    }

    const passed = reasons.length === 0;

    return {
      passed,
      rejectionReasons: reasons,
      sponsorshipStatus,
      evidence,
    };
  }

  private evaluateSponsorshipStatus(
    job: NormalizedJob,
    evidence: Record<string, unknown>
  ): SponsorshipStatus {
    const description = (job.description || '').toLowerCase();

    // Explicit sponsorship support
    const supportedPatterns = [
      /sponsor.*visa/i,
      /visa.*sponsor/i,
      /h-1b.*sponsor/i,
      /offer.*sponsorship/i,
      /willing to sponsor/i,
    ];

    for (const pattern of supportedPatterns) {
      if (pattern.test(description)) {
        evidence['sponsorshipSupported'] = true;
        return SponsorshipStatus.SUPPORTED;
      }
    }

    // Explicit no sponsorship
    const unsupportedPatterns = [
      /no sponsorship/i,
      /cannot sponsor/i,
      /sponsor not available/i,
      /no visa sponsorship/i,
    ];

    for (const pattern of unsupportedPatterns) {
      if (pattern.test(description)) {
        evidence['sponsorshipExplicitlyUnsupported'] = true;
        return SponsorshipStatus.EXPLICITLY_UNSUPPORTED;
      }
    }

    // Likely patterns
    const likelyPatterns = [
      /employment authorization/i,
      /eligible to work/i,
      /legal work authorization/i,
    ];

    for (const pattern of likelyPatterns) {
      if (pattern.test(description)) {
        evidence['sponsorshipLikelySupported'] = true;
        return SponsorshipStatus.LIKELY_SUPPORTED;
      }
    }

    evidence['sponsorshipUnknown'] = true;
    return SponsorshipStatus.UNKNOWN;
  }
}
