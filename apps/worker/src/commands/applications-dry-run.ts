import { createLogger } from '@job-copilot/shared';
import { PrismaClient } from '@job-copilot/database';
import { BrowserManager } from '@job-copilot/browser';
import { ATSDetector } from '@job-copilot/browser';
import { ADAPTERS } from '@job-copilot/ats-adapters';

const logger = createLogger('applications-dry-run');
const prisma = new PrismaClient();

async function main() {
  logger.info('Starting dry-run application workflow');

  const browserManager = new BrowserManager(
    {
      headless: false, // Show browser for dry-run
      slowMo: 500, // Slow down interactions
      timeout: 30000,
      viewport: { width: 1280, height: 720 },
    },
    'browser-state'
  );

  try {
    await browserManager.launch();

    // Get applications ready for processing
    const applications = await prisma.application.findMany({
      where: {
        state: 'DOCUMENTS_READY',
        dryRun: true,
      },
      include: {
        job: true,
        resume: true,
      },
      take: 3, // Limit for dry-run
    });

    logger.info({ count: applications.length }, 'Found applications to process');

    const atsDetector = new ATSDetector();

    for (const app of applications) {
      try {
        logger.info(
          {
            company: app.company,
            title: app.title,
          },
          'Processing application'
        );

        // Get page
        const page = await browserManager.getPage('dry-run', app.id);

        // Navigate to job URL
        const jobUrl = app.job?.externalApplyUrl;
        if (!jobUrl) {
          logger.warn({ jobId: app.jobId }, 'No application URL available');
          continue;
        }

        // Navigate
        const navigated = await browserManager.navigateTo(page, jobUrl);
        if (!navigated) {
          logger.error({ jobUrl }, 'Failed to navigate to application page');
          continue;
        }

        // Take screenshot
        await browserManager.screenshot(page, `${app.id}-opened`, 'output/screenshots');

        // Detect ATS
        const atsProvider = await atsDetector.detect(page);
        logger.info({ atsProvider }, 'Detected ATS');

        // Find matching adapter
        const adapter = ADAPTERS.find((a) => a.id === atsProvider);

        if (!adapter) {
          logger.warn({ atsProvider }, 'No adapter available for ATS');

          // Update application state
          await prisma.application.update({
            where: { id: app.id },
            data: {
              state: 'WAITING_FOR_REVIEW',
              atsProvider: atsProvider,
            },
          });

          continue;
        }

        logger.info({ adapter: adapter.name }, 'Using adapter');

        // Inspect form
        const inspection = await adapter.inspectForm(page);
        logger.info(
          { fieldsCount: inspection.fields.length },
          'Inspected form'
        );

        // Save form inspection
        await prisma.application.update({
          where: { id: app.id },
          data: {
            formInspection: inspection,
            atsProvider: atsProvider,
            state: 'FORM_INSPECTION_PENDING',
          },
        });

        // Take screenshot
        await browserManager.screenshot(page, `${app.id}-form-inspected`, 'output/screenshots');

        logger.info(
          {
            company: app.company,
            fields: inspection.fields.length,
            requiresResume: inspection.requiresResume,
          },
          'Form inspection complete'
        );

        // Close page
        await browserManager.closePage(`dry-run-${app.id}`);
      } catch (error) {
        logger.error({ jobId: app.jobId, error }, 'Error processing application');

        // Update state to waiting for review
        await prisma.application.update({
          where: { id: app.id },
          data: {
            state: 'WAITING_FOR_REVIEW',
            failureReason: String(error),
            failureCategory: 'ADAPTER_ERROR',
          },
        });
      }
    }

    logger.info('Dry-run complete');
    console.log(`✅ Processed ${applications.length} applications in dry-run`);
    console.log('📸 Screenshots: output/screenshots/');
  } catch (error) {
    logger.error(error, 'Dry-run failed');
    throw error;
  } finally {
    await browserManager.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error(err, 'Dry-run failed');
  process.exit(1);
});
