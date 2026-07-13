import { createLogger, CandidateProfileSchema, ExperienceInventorySchema, ScoringConfigSchema } from '@job-copilot/shared';
import { PrismaClient } from '@job-copilot/database';
import { EligibilityEngine, ScoringEngine } from '@job-copilot/evaluation';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('score');
const prisma = new PrismaClient();

async function main() {
  logger.info('Scoring discovered jobs');

  // Load configuration files
  const profilePath = path.join(process.cwd(), 'private-data', 'profile.json');
  const inventoryPath = path.join(process.cwd(), 'private-data', 'experience-inventory.json');
  const scoringPath = path.join(process.cwd(), 'config', 'scoring.json');

  if (!fs.existsSync(profilePath)) {
    throw new Error(`Profile not found: ${profilePath}`);
  }
  if (!fs.existsSync(inventoryPath)) {
    throw new Error(`Experience inventory not found: ${inventoryPath}`);
  }
  if (!fs.existsSync(scoringPath)) {
    throw new Error(`Scoring config not found: ${scoringPath}`);
  }

  const profile = CandidateProfileSchema.parse(
    JSON.parse(fs.readFileSync(profilePath, 'utf-8'))
  );
  const inventory = ExperienceInventorySchema.parse(
    JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'))
  );
  const scoringConfig = ScoringConfigSchema.parse(
    JSON.parse(fs.readFileSync(scoringPath, 'utf-8'))
  );

  logger.info(
    {
      profileName: profile.legalName,
      skills: inventory.skills.length,
      experiences: inventory.experiences.length,
    },
    'Loaded candidate profile'
  );

  try {
    // Fetch unscored jobs
    const jobs = await prisma.job.findMany({
      where: {
        scoring: null,
        isOpen: true,
      },
      take: 100,
    });

    logger.info({ count: jobs.length }, 'Found unscored jobs');

    const eligibilityEngine = new EligibilityEngine(profile, 7, 15);
    const scoringEngine = new ScoringEngine(scoringConfig);

    let scoredCount = 0;
    let passedEligibility = 0;

    for (const job of jobs) {
      try {
        // Evaluate eligibility
        const eligibility = eligibilityEngine.evaluate({
          source: job.source,
          sourceJobId: job.sourceJobId,
          sourceUrl: job.sourceUrl,
          title: job.title,
          normalizedTitle: job.normalizedTitle,
          company: job.company,
          normalizedCompany: job.normalizedCompany,
          location: job.location,
          remoteType: job.remoteType || undefined,
          employmentType: job.employmentType || undefined,
          salaryText: job.salaryText || undefined,
          postedAt: job.postedAt,
          discoveredAt: job.discoveredAt,
          listingUrl: job.listingUrl,
          externalApplyUrl: job.externalApplyUrl || undefined,
          description: job.description || undefined,
          descriptionHash: job.descriptionHash || undefined,
          descriptionSimplified: job.descriptionSimplified || undefined,
          requisitionId: job.requisitionId || undefined,
          atsProvider: job.atsProvider || undefined,
          easyApply: job.easyApply,
          isOpen: job.isOpen,
          rawSourceData: job.rawSourceData as Record<string, unknown>,
        });

        // Store eligibility result
        await prisma.jobEligibility.upsert({
          where: { jobId: job.id },
          update: {
            status: 'EVALUATED',
            passed: eligibility.passed,
            evaluatedAt: new Date(),
            rejectionReasons: eligibility.rejectionReasons,
            rejectionEvidence: eligibility.evidence,
            sponsorshipStatus: eligibility.sponsorshipStatus,
          },
          create: {
            jobId: job.id,
            status: 'EVALUATED',
            passed: eligibility.passed,
            evaluatedAt: new Date(),
            rejectionReasons: eligibility.rejectionReasons,
            rejectionEvidence: eligibility.evidence,
            sponsorshipStatus: eligibility.sponsorshipStatus,
          },
        });

        // Score job
        const score = scoringEngine.score(
          {
            source: job.source,
            sourceJobId: job.sourceJobId,
            sourceUrl: job.sourceUrl,
            title: job.title,
            normalizedTitle: job.normalizedTitle,
            company: job.company,
            normalizedCompany: job.normalizedCompany,
            location: job.location,
            remoteType: job.remoteType || undefined,
            employmentType: job.employmentType || undefined,
            salaryText: job.salaryText || undefined,
            postedAt: job.postedAt,
            discoveredAt: job.discoveredAt,
            listingUrl: job.listingUrl,
            externalApplyUrl: job.externalApplyUrl || undefined,
            description: job.description || undefined,
            descriptionHash: job.descriptionHash || undefined,
            descriptionSimplified: job.descriptionSimplified || undefined,
            requisitionId: job.requisitionId || undefined,
            atsProvider: job.atsProvider || undefined,
            easyApply: job.easyApply,
            isOpen: job.isOpen,
            rawSourceData: job.rawSourceData as Record<string, unknown>,
          },
          inventory.skills,
          inventory.experiences.map((e) => e.employer),
          eligibility.sponsorshipStatus
        );

        // Store score
        await prisma.jobScoring.upsert({
          where: { jobId: job.id },
          update: {
            status: 'SCORED',
            scoredAt: new Date(),
            experienceScore: score.experienceScore,
            viabilityScore: score.viabilityScore,
            finalScore: score.finalScore,
            recommendation: score.recommendation,
            matchedEvidence: score.matchedEvidence,
            gaps: score.gaps,
            confidence: score.confidence,
            sponsorshipStatus: eligibility.sponsorshipStatus,
          },
          create: {
            jobId: job.id,
            status: 'SCORED',
            scoredAt: new Date(),
            experienceScore: score.experienceScore,
            viabilityScore: score.viabilityScore,
            finalScore: score.finalScore,
            recommendation: score.recommendation,
            matchedEvidence: score.matchedEvidence,
            gaps: score.gaps,
            confidence: score.confidence,
            sponsorshipStatus: eligibility.sponsorshipStatus,
          },
        });

        if (eligibility.passed) {
          passedEligibility++;
        }

        scoredCount++;

        if (scoredCount % 10 === 0) {
          logger.info({ scored: scoredCount, eligible: passedEligibility }, 'Scoring progress');
        }
      } catch (error) {
        logger.warn({ jobId: job.id, error }, 'Failed to score job');
      }
    }

    logger.info(
      {
        totalScored: scoredCount,
        passedEligibility,
        percentage: Math.round((passedEligibility / scoredCount) * 100) || 0,
      },
      'Scoring complete'
    );

    // Summary
    const scored = await prisma.jobScoring.count({
      where: { status: 'SCORED' },
    });

    const aboveThreshold = await prisma.jobScoring.count({
      where: {
        status: 'SCORED',
        finalScore: { gte: 7.0 },
      },
    });

    logger.info(
      {
        totalScored: scored,
        aboveThreshold,
      },
      'Scoring summary'
    );
  } catch (error) {
    logger.error(error, 'Scoring failed');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error(err, 'Scoring failed');
  process.exit(1);
});
