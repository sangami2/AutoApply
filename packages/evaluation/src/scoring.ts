import { createLogger, ScoringConfig, SponsorshipStatus } from '@job-copilot/shared';
import { NormalizedJob } from '@job-copilot/discovery';

const logger = createLogger('evaluation:scoring');

export interface ScoreEvidence {
  category: string;
  evidence: string;
  weight: number;
  points: number;
}

export interface ScoringResult {
  experienceScore: number;
  viabilityScore: number;
  finalScore: number;
  recommendation: 'APPLY' | 'REVIEW' | 'SKIP';
  matchedEvidence: ScoreEvidence[];
  gaps: Array<{
    requirement: string;
    evidence: string | null;
  }>;
  sponsorshipStatus: SponsorshipStatus;
  confidence: number;
}

export class ScoringEngine {
  constructor(private config: ScoringConfig) {}

  score(
    job: NormalizedJob,
    candidateSkills: string[],
    candidateExperience: string[],
    sponsorshipStatus: SponsorshipStatus
  ): ScoringResult {
    const evidence: ScoreEvidence[] = [];
    const gaps: ScoringResult['gaps'] = [];

    // Experience score components
    const coreResp = this.scoreCoreResponsibility(job, candidateExperience, evidence);
    const requiredSkills = this.scoreRequiredSkills(job, candidateSkills, evidence);
    const productDomain = this.scoreProductDomain(job, candidateExperience, evidence);
    const seniority = this.scoreSeniority(job, evidence);
    const technicalBg = this.scoreTechnicalBackground(job, candidateSkills, evidence);
    const education = 0.8; // Placeholder: would check against profile
    const location = this.scoreLocationWork(job, evidence);

    const rubric = this.config.rubric || {};
    const coreWeight = rubric.coreResponsibilityWeight || 0.3;
    const skillsWeight = rubric.requiredSkillsWeight || 0.2;
    const domainWeight = rubric.productDomainWeight || 0.15;
    const seniorityWeight = rubric.seniorityAlignWeight || 0.15;
    const technicalWeight = rubric.technicalBackgroundWeight || 0.1;
    const educationWeight = rubric.educationWeight || 0.05;
    const locationWeight = rubric.locationWorkWeight || 0.05;

    const experienceScore =
      coreResp * coreWeight * 10 +
      requiredSkills * skillsWeight * 10 +
      productDomain * domainWeight * 10 +
      seniority * seniorityWeight * 10 +
      technicalBg * technicalWeight * 10 +
      education * educationWeight * 10 +
      location * locationWeight * 10;

    // Viability score
    const sponsorshipVia = this.scoreSponsorship(sponsorshipStatus, evidence);
    const freshness = this.scoreFreshness(job, evidence);
    const appAvailability = this.scoreApplicationAvailability(job, evidence);
    const locationVia = this.scoreLocationViability(job, evidence);
    const compensation = 0.7; // Placeholder
    const duplicatePenalty = 0; // Would be checked against applications
    const portalAccess = this.scorePortalAccess(job, evidence);

    const viabilityScore =
      (sponsorshipVia * 0.25 +
        freshness * 0.2 +
        appAvailability * 0.2 +
        locationVia * 0.15 +
        compensation * 0.1 +
        portalAccess * 0.1) *
      10;

    // Final score
    const expWeight = this.config.experienceWeightPercentage || 70;
    const viaWeight = this.config.viabilityWeightPercentage || 30;
    const finalScore = (experienceScore * (expWeight / 100) + viabilityScore * (viaWeight / 100)) / 10;

    // Recommendation
    let recommendation: ScoringResult['recommendation'] = 'SKIP';
    if (finalScore >= 8.5) {
      recommendation = 'APPLY';
    } else if (finalScore >= 7) {
      recommendation = 'APPLY';
    } else if (finalScore >= 6) {
      recommendation = 'REVIEW';
    }

    // Confidence score (0-1)
    const confidence = Math.min(0.95, 0.5 + evidence.length * 0.1);

    return {
      experienceScore: Math.round(experienceScore * 100) / 100,
      viabilityScore: Math.round(viabilityScore * 100) / 100,
      finalScore: Math.round(finalScore * 100) / 100,
      recommendation,
      matchedEvidence: evidence,
      gaps,
      sponsorshipStatus,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  private scoreCoreResponsibility(
    job: NormalizedJob,
    experience: string[],
    evidence: ScoreEvidence[]
  ): number {
    const description = (job.description || '').toLowerCase();
    const keywords = ['strategy', 'roadmap', 'product', 'feature', 'vision', 'goals'];

    const matches = keywords.filter((kw) => description.includes(kw)).length;
    const score = Math.min(1, matches / keywords.length);

    if (score > 0.5) {
      evidence.push({
        category: 'Core Responsibility',
        evidence: `Found ${matches} key product terms in job description`,
        weight: 0.3,
        points: score * 10,
      });
    }

    return score;
  }

  private scoreRequiredSkills(
    job: NormalizedJob,
    skills: string[],
    evidence: ScoreEvidence[]
  ): number {
    const description = (job.description || '').toLowerCase();
    const skillMatches = skills.filter((skill) => description.includes(skill.toLowerCase()))
      .length;

    const score = Math.min(1, skillMatches / Math.max(1, skills.length));

    if (skillMatches > 0) {
      evidence.push({
        category: 'Required Skills',
        evidence: `Matched ${skillMatches} of ${skills.length} candidate skills`,
        weight: 0.2,
        points: score * 10,
      });
    }

    return score;
  }

  private scoreProductDomain(
    job: NormalizedJob,
    experience: string[],
    evidence: ScoreEvidence[]
  ): number {
    const domains = ['ai', 'ml', 'data', 'platform', 'marketplace', 'creator', 'b2b'];
    const description = (job.description || '').toLowerCase();

    const matches = domains.filter((d) => description.includes(d)).length;
    const score = Math.min(1, matches / domains.length);

    if (matches > 0) {
      evidence.push({
        category: 'Product Domain',
        evidence: `Job mentions ${matches} relevant domains`,
        weight: 0.15,
        points: score * 10,
      });
    }

    return score;
  }

  private scoreSeniority(job: NormalizedJob, evidence: ScoreEvidence[]): number {
    const title = job.normalizedTitle.toLowerCase();
    const isSenior = title.includes('senior') || title.includes('staff');
    const isAssociate = title.includes('associate');

    // Prefer mid-to-senior level roles
    const score = isSenior ? 0.9 : isAssociate ? 0.6 : 0.8;

    evidence.push({
      category: 'Seniority',
      evidence: `Role: ${job.normalizedTitle}`,
      weight: 0.15,
      points: score * 10,
    });

    return score;
  }

  private scoreTechnicalBackground(
    job: NormalizedJob,
    skills: string[],
    evidence: ScoreEvidence[]
  ): number {
    const description = (job.description || '').toLowerCase();
    const technicalKeywords = [
      'system design',
      'architecture',
      'engineering',
      'technical',
      'api',
      'database',
    ];

    const matches = technicalKeywords.filter((kw) => description.includes(kw)).length;
    const score = Math.min(1, matches / technicalKeywords.length);

    if (matches > 0) {
      evidence.push({
        category: 'Technical Background',
        evidence: `Found ${matches} technical concepts`,
        weight: 0.1,
        points: score * 10,
      });
    }

    return score;
  }

  private scoreLocationWork(job: NormalizedJob, evidence: ScoreEvidence[]): number {
    const isRemote = job.location.toLowerCase().includes('remote');
    const score = isRemote ? 1.0 : 0.7;

    evidence.push({
      category: 'Location & Work',
      evidence: `${isRemote ? 'Remote' : 'On-site'} position`,
      weight: 0.05,
      points: score * 10,
    });

    return score;
  }

  private scoreSponsorship(
    sponsorshipStatus: SponsorshipStatus,
    evidence: ScoreEvidence[]
  ): number {
    const scores: Record<SponsorshipStatus, number> = {
      [SponsorshipStatus.SUPPORTED]: 1.0,
      [SponsorshipStatus.LIKELY_SUPPORTED]: 0.8,
      [SponsorshipStatus.UNKNOWN]: 0.6,
      [SponsorshipStatus.LIKELY_UNSUPPORTED]: 0.3,
      [SponsorshipStatus.EXPLICITLY_UNSUPPORTED]: 0,
    };

    const score = scores[sponsorshipStatus] || 0.6;

    evidence.push({
      category: 'Sponsorship Viability',
      evidence: `Sponsorship status: ${sponsorshipStatus}`,
      weight: 0.25,
      points: score * 10,
    });

    return score;
  }

  private scoreFreshness(job: NormalizedJob, evidence: ScoreEvidence[]): number {
    const daysOld = Math.floor((Date.now() - job.postedAt.getTime()) / (1000 * 60 * 60 * 24));
    const score = Math.max(0, 1 - daysOld / 7); // 0 at 7 days old

    evidence.push({
      category: 'Posting Freshness',
      evidence: `Posted ${daysOld} days ago`,
      weight: 0.2,
      points: score * 10,
    });

    return score;
  }

  private scoreApplicationAvailability(job: NormalizedJob, evidence: ScoreEvidence[]): number {
    const hasApplyUrl = Boolean(job.externalApplyUrl);
    const score = hasApplyUrl ? 1.0 : 0.5;

    evidence.push({
      category: 'Application Availability',
      evidence: hasApplyUrl ? 'Direct apply URL available' : 'No direct apply URL',
      weight: 0.2,
      points: score * 10,
    });

    return score;
  }

  private scoreLocationViability(job: NormalizedJob, evidence: ScoreEvidence[]): number {
    const isUS = job.location.toLowerCase().includes('united states') || job.location.includes('US');
    const score = isUS ? 1.0 : 0.7;

    evidence.push({
      category: 'Location Viability',
      evidence: `Location: ${job.location}`,
      weight: 0.15,
      points: score * 10,
    });

    return score;
  }

  private scorePortalAccess(job: NormalizedJob, evidence: ScoreEvidence[]): number {
    const supportedATS = ['greenhouse', 'lever', 'ashby', 'workday'];
    const isSupported = job.atsProvider ? supportedATS.includes(job.atsProvider) : true;
    const score = isSupported ? 1.0 : 0.8;

    evidence.push({
      category: 'Portal Access',
      evidence: `ATS: ${job.atsProvider || 'Unknown'}`,
      weight: 0.1,
      points: score * 10,
    });

    return score;
  }
}
