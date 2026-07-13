import { createLogger, SearchesConfigSchema } from '@job-copilot/shared';
import { PrismaClient } from '@job-copilot/database';
import {
  ApifyDiscoveryClient,
  JobNormalizer,
  JobDeduplicator,
  JobEnricher,
} from '@job-copilot/discovery';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('discovery');
const prisma = new PrismaClient();

async function main() {
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    throw new Error('APIFY_TOKEN environment variable not set');
  }

  // Load search configuration
  const configPath = path.join(process.cwd(), 'config', 'searches.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = SearchesConfigSchema.parse(JSON.parse(configContent));

  logger.info({ searches: config.searches.length }, 'Starting job discovery');

  // Create discovery run record
  const discoveryRun = await prisma.discoveryRun.create({
    data: {
      status: 'RUNNING',
      searchConfig: config,
    },
  });

  logger.info({ runId: discoveryRun.id }, 'Created discovery run');

  try {
    const normalizer = new JobNormalizer();
    const deduplicator = new JobDeduplicator();
    const enricher = new JobEnricher();

    let totalDiscovered = 0;
    let totalNormalized = 0;
    const allJobs: Parameters<typeof deduplicator.deduplicate>[0] = [];

    // Run discovery for each search (would be parallelized with BullMQ in production)
    for (const search of config.searches) {
      logger.info(
        {
          titles: search.titles,
          locations: search.locations,
        },
        'Running search'
      );

      // For demo purposes, create synthetic jobs if no actors are configured
      // In production, this would call Apify actors
      const syntheticJobs = this.createSyntheticJobs(search);

      for (const rawJob of syntheticJobs) {
        try {
          const normalized = normalizer.normalizeLinkedInJob(rawJob);

          // Filter by date window
          if (normalizer.filterByDate(normalized, search.postedWithinDays)) {
            allJobs.push(normalized);
            totalNormalized++;
          }
        } catch (error) {
          logger.warn({ job: rawJob, error }, 'Failed to normalize job');
        }
      }

      totalDiscovered += syntheticJobs.length;
    }

    logger.info(
      {
        discovered: totalDiscovered,
        normalized: totalNormalized,
      },
      'Normalization complete'
    );

    // Deduplicate
    const { unique, duplicates } = deduplicator.deduplicate(allJobs);
    logger.info(
      {
        unique: unique.length,
        duplicates: duplicates.length,
      },
      'Deduplication complete'
    );

    // Store jobs in database
    for (const job of unique) {
      await prisma.job.upsert({
        where: { source_sourceJobId: { source: job.source, sourceJobId: job.sourceJobId } },
        update: {
          isOpen: true,
          enrichedAt: new Date(),
        },
        create: {
          source: job.source,
          sourceJobId: job.sourceJobId,
          sourceUrl: job.sourceUrl,
          title: job.title,
          normalizedTitle: job.normalizedTitle,
          company: job.company,
          normalizedCompany: job.normalizedCompany,
          location: job.location,
          remoteType: job.remoteType,
          employmentType: job.employmentType,
          salaryText: job.salaryText,
          postedAt: job.postedAt,
          discoveredAt: job.discoveredAt,
          listingUrl: job.listingUrl,
          externalApplyUrl: job.externalApplyUrl,
          description: job.description,
          descriptionHash: job.descriptionHash,
          descriptionSimplified: job.descriptionSimplified,
          requisitionId: job.requisitionId,
          atsProvider: job.atsProvider,
          easyApply: job.easyApply,
          isOpen: true,
          rawSourceData: job.rawSourceData,
          discoveryRunId: discoveryRun.id,
        },
      });
    }

    // Update discovery run
    await prisma.discoveryRun.update({
      where: { id: discoveryRun.id },
      data: {
        status: 'COMPLETED',
        jobsDiscovered: totalDiscovered,
        jobsNormalized: totalNormalized,
        jobsDeduplicated: unique.length,
        completedAt: new Date(),
      },
    });

    logger.info(
      {
        discovered: totalDiscovered,
        normalized: totalNormalized,
        deduplicated: unique.length,
        duplicates: duplicates.length,
      },
      'Discovery complete'
    );
  } catch (error) {
    logger.error(error, 'Discovery failed');
    await prisma.discoveryRun.update({
      where: { id: discoveryRun.id },
      data: {
        status: 'FAILED',
        error: String(error),
      },
    });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

function createSyntheticJobs(search: any) {
  // For demonstration purposes, create synthetic job data
  const syntheticJobs = [];

  for (let i = 0; i < 3; i++) {
    for (const title of search.titles) {
      for (const location of search.locations) {
        syntheticJobs.push({
          jobId: `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          jobTitle: title,
          companyName: `Company ${i + 1}`,
          location: location,
          link: `https://linkedin.com/jobs/view/${Math.random().toString(36).substr(2, 9)}`,
          description: `This is a synthetic ${title} position at Company ${i + 1}.
            Responsibilities include product strategy, cross-functional collaboration,
            data analysis, and roadmap planning. Ideal for experienced product professionals.`,
          listedAt: `${Math.floor(Math.random() * 7)} days ago`,
          easyApply: Math.random() > 0.5,
          workType: 'full-time',
          salary: '$150k - $200k',
        });
      }
    }
  }

  return syntheticJobs;
}

main().catch((err) => {
  logger.error(err, 'Discovery failed');
  process.exit(1);
});
