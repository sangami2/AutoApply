import { createLogger } from '@job-copilot/shared';
import { PrismaClient } from '@job-copilot/database';
import { JobWorkbookExporter } from '@job-copilot/workbook';
import * as path from 'path';
import * as fs from 'fs';

const logger = createLogger('export');
const prisma = new PrismaClient();

async function main() {
  logger.info('Exporting jobs to Excel workbook');

  const outputDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, 'job-search.xlsx');

  try {
    // Fetch scored jobs from database
    const jobs = await prisma.job.findMany({
      where: {
        scoring: {
          isNot: null,
        },
      },
      include: {
        scoring: true,
        eligibility: true,
      },
      orderBy: {
        scoring: {
          finalScore: 'desc',
        },
      },
      take: 100,
    });

    logger.info({ count: jobs.length }, 'Fetched jobs from database');

    const exporter = new JobWorkbookExporter();
    const jobsForExport = jobs.map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      externalApplyUrl: job.externalApplyUrl,
      finalScore: job.scoring?.finalScore || 0,
      tailoredSummary: '',
      source: job.source,
      requisitionId: job.requisitionId,
      postedAt: job.postedAt,
      atsProvider: job.atsProvider,
      experienceScore: job.scoring?.experienceScore || 0,
      viabilityScore: job.scoring?.viabilityScore || 0,
      sponsorshipStatus: job.eligibility?.sponsorshipStatus,
      eligibilityStatus: job.eligibility?.passed ? 'PASSED' : 'FAILED',
      eligibilityReasons: job.eligibility?.rejectionReasons || [],
      scoreEvidence: job.scoring?.matchedEvidence,
    }));

    await exporter.exportJobs(jobsForExport, filePath, process.env.TIMEZONE || 'America/Chicago');

    logger.info({ filePath }, 'Workbook exported successfully');
    console.log(`✅ Excel workbook created: ${filePath}`);
  } catch (error) {
    logger.error(error, 'Export failed');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error(err, 'Export failed');
  process.exit(1);
});
