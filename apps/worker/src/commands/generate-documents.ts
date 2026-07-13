import {
  createLogger,
  CandidateProfileSchema,
  ExperienceInventorySchema,
  ApplicationPolicySchema,
} from '@job-copilot/shared';
import { PrismaClient } from '@job-copilot/database';
import { ResumeGenerator, CoverLetterGenerator, JobSelector } from '@job-copilot/documents';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('generate-documents');
const prisma = new PrismaClient();

async function main() {
  logger.info('Generating documents for selected jobs');

  // Load configuration
  const profilePath = path.join(process.cwd(), 'private-data', 'profile.json');
  const inventoryPath = path.join(process.cwd(), 'private-data', 'experience-inventory.json');
  const policyPath = path.join(process.cwd(), 'config', 'application-policy.json');
  const resumeTemplatePath = path.join(process.cwd(), 'private-data', 'master-resume.tex');

  if (!fs.existsSync(profilePath)) {
    throw new Error(`Profile not found: ${profilePath}`);
  }
  if (!fs.existsSync(inventoryPath)) {
    throw new Error(`Experience inventory not found: ${inventoryPath}`);
  }
  if (!fs.existsSync(policyPath)) {
    throw new Error(`Application policy not found: ${policyPath}`);
  }
  if (!fs.existsSync(resumeTemplatePath)) {
    throw new Error(`Resume template not found: ${resumeTemplatePath}`);
  }

  const profile = CandidateProfileSchema.parse(
    JSON.parse(fs.readFileSync(profilePath, 'utf-8'))
  );
  const inventory = ExperienceInventorySchema.parse(
    JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'))
  );
  const appPolicy = ApplicationPolicySchema.parse(
    JSON.parse(fs.readFileSync(policyPath, 'utf-8'))
  );

  logger.info(
    { candidateName: profile.legalName, experiences: inventory.experiences.length },
    'Loaded candidate data'
  );

  try {
    // Fetch scored jobs
    const scoredJobs = await prisma.job.findMany({
      where: {
        scoring: { isNot: null },
        eligibility: { isNot: null },
      },
      include: {
        scoring: true,
        eligibility: true,
      },
    });

    logger.info({ count: scoredJobs.length }, 'Fetched scored jobs');

    // Select jobs for application
    const selector = new JobSelector({
      minimumScore: appPolicy.minimumScore,
      maximumApplications: appPolicy.maximumApplications,
      oneApplicationPerCompany: appPolicy.oneApplicationPerCompany,
      requireEligibilityPassed: true,
    });

    const selectableJobs = scoredJobs.map((job) => ({
      id: job.id,
      company: job.company,
      normalizedCompany: job.normalizedCompany,
      title: job.title,
      finalScore: job.scoring?.finalScore || 0,
      eligibilityPassed: job.eligibility?.passed || false,
    }));

    const selection = selector.selectJobs(selectableJobs);
    logger.info(selection.statistics, 'Job selection complete');

    // Generate documents for selected jobs
    const outputDir = path.join(process.cwd(), 'output', 'applications');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const resumeGenerator = new ResumeGenerator(
      resumeTemplatePath,
      inventory.experiences,
      inventory.education,
      inventory.skills
    );

    const coverLetterGenerator = new CoverLetterGenerator(
      inventory.experiences,
      profile.legalName,
      profile.email
    );

    let documentedCount = 0;

    for (const selectedJob of selection.selected) {
      try {
        const job = scoredJobs.find((j) => j.id === selectedJob.id);
        if (!job) continue;

        // Create job-specific directory
        const jobDir = path.join(outputDir, job.normalizedCompany, job.id);
        fs.mkdirSync(jobDir, { recursive: true });

        // Store job info
        fs.writeFileSync(
          path.join(jobDir, 'job.json'),
          JSON.stringify(
            {
              id: job.id,
              title: job.title,
              company: job.company,
              externalApplyUrl: job.externalApplyUrl,
              requisitionId: job.requisitionId,
              atsProvider: job.atsProvider,
              postedAt: job.postedAt,
            },
            null,
            2
          )
        );

        // Store scoring info
        fs.writeFileSync(
          path.join(jobDir, 'score.json'),
          JSON.stringify(job.scoring, null, 2)
        );

        // Generate tailored resume
        const { pdfPath, validation } = await resumeGenerator.generateTailoredResume(
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
          jobDir
        );

        // Store validation report
        fs.writeFileSync(path.join(jobDir, 'resume-validation.json'), JSON.stringify(validation, null, 2));

        logger.info(
          {
            company: job.company,
            score: job.scoring?.finalScore,
            valid: validation.isValid,
          },
          'Generated resume'
        );

        // Generate cover letter if needed
        if (
          coverLetterGenerator.shouldGenerateCoverLetter(
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
            job.scoring?.finalScore || 0,
            { highValueThreshold: 8.0 }
          )
        ) {
          const { content } = coverLetterGenerator.generateCoverLetter(
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
            inventory.experiences,
            jobDir
          );

          fs.writeFileSync(
            path.join(jobDir, 'cover-letter.txt'),
            content
          );

          logger.info(
            { company: job.company },
            'Generated cover letter'
          );
        }

        documentedCount++;
      } catch (error) {
        logger.warn({ jobId: selectedJob.id, error }, 'Failed to generate documents for job');
      }
    }

    logger.info(
      {
        selected: selection.statistics.selectedCount,
        documented: documentedCount,
        outputDir,
      },
      'Document generation complete'
    );

    console.log(`✅ Generated documents for ${documentedCount} jobs`);
    console.log(`📁 Output directory: ${outputDir}`);
  } catch (error) {
    logger.error(error, 'Document generation failed');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error(err, 'Document generation failed');
  process.exit(1);
});
