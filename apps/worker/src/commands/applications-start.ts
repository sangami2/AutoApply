import { createLogger, ApplicationState, InterventionType } from '@job-copilot/shared';
import { PrismaClient } from '@job-copilot/database';
import { BrowserManager } from '@job-copilot/browser';
import { ATSDetector } from '@job-copilot/browser';
import { ADAPTERS } from '@job-copilot/ats-adapters';
import { AccountManager } from '@job-copilot/credentials';
import { InterventionManager } from '@job-copilot/interventions';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('applications-start');
const prisma = new PrismaClient();

async function main() {
  logger.info('Starting application submission workflow');

  const browserManager = new BrowserManager(
    {
      headless: false, // Show browser for user to monitor
      slowMo: 100,
      timeout: 30000,
      viewport: { width: 1280, height: 720 },
    },
    'browser-state'
  );

  const accountManager = new AccountManager('vault');
  const interventionManager = new InterventionManager();

  try {
    await browserManager.launch();

    // Get applications ready for submission
    const applications = await prisma.application.findMany({
      where: {
        state: ApplicationState.READY_TO_SUBMIT,
        dryRun: false,
      },
      include: {
        job: true,
        resume: true,
        coverLetter: true,
      },
      take: 5, // Process max 5 per run
    });

    logger.info({ count: applications.length }, 'Found applications to submit');

    const atsDetector = new ATSDetector();
    let submitted = 0;
    let failed = 0;

    for (const app of applications) {
      try {
        logger.info(
          {
            company: app.company,
            title: app.title,
          },
          'Processing application submission'
        );

        // Update state
        await prisma.application.update({
          where: { id: app.id },
          data: { state: ApplicationState.APPLICATION_OPENED },
        });

        // Get page
        const page = await browserManager.getPage(`submit-${app.id}`);

        const jobUrl = app.job?.externalApplyUrl;
        if (!jobUrl) {
          logger.error({ jobId: app.jobId }, 'No application URL');
          await updateApplicationState(
            app.id,
            ApplicationState.FAILED,
            'No application URL available'
          );
          failed++;
          continue;
        }

        // Navigate
        const navigated = await browserManager.navigateTo(page, jobUrl);
        if (!navigated) {
          logger.error({ jobUrl }, 'Navigation failed');
          await updateApplicationState(
            app.id,
            ApplicationState.FAILED,
            'Failed to navigate to application page'
          );
          failed++;
          continue;
        }

        // Detect ATS
        const atsProvider = await atsDetector.detect(page);
        logger.info({ atsProvider }, 'Detected ATS');

        // Find adapter
        const adapter = ADAPTERS.find((a) => a.id === atsProvider);
        if (!adapter) {
          logger.warn({ atsProvider }, 'No adapter for ATS');

          // Create intervention for manual handling
          await interventionManager.createIntervention({
            type: InterventionType.PORTAL_MISMATCH,
            applicationId: app.id,
            description: `Unsupported ATS: ${atsProvider}`,
            metadata: { atsProvider },
          });

          await updateApplicationState(
            app.id,
            ApplicationState.WAITING_FOR_REVIEW,
            'Unsupported ATS'
          );

          continue;
        }

        // Check if account needed
        const requiresAccount = await atsDetector.requiresAccount(page);
        logger.info({ requiresAccount }, 'Checked account requirement');

        if (requiresAccount) {
          await updateApplicationState(
            app.id,
            ApplicationState.ACCOUNT_REQUIRED
          );

          // Get or create account
          const accountResult = await accountManager.getOrCreateAccount(
            page,
            new URL(jobUrl).hostname,
            new URL(jobUrl).hostname,
            atsProvider,
            app.job?.company || 'unknown'
          );

          if (!accountResult.success) {
            logger.error('Account creation/login failed');

            await interventionManager.createIntervention({
              type: InterventionType.OTP,
              applicationId: app.id,
              description: accountResult.message,
            });

            await updateApplicationState(
              app.id,
              ApplicationState.WAITING_FOR_OTP,
              accountResult.message
            );

            continue;
          }

          await updateApplicationState(
            app.id,
            ApplicationState.ACCOUNT_READY
          );
        }

        // Inspect form
        await updateApplicationState(
          app.id,
          ApplicationState.FORM_INSPECTION_PENDING
        );

        const inspection = await adapter.inspectForm(page);
        logger.info(
          { fieldsCount: inspection.fields.length },
          'Form inspected'
        );

        await prisma.application.update({
          where: { id: app.id },
          data: { formInspection: inspection },
        });

        // Fill profile
        await updateApplicationState(app.id, ApplicationState.FORM_FILLING);

        const profileResult = await adapter.fillProfile(page, {
          name: app.job?.company || 'Candidate',
          email: 'candidate@example.com',
          phone: '+1-555-0123',
        });

        logger.info(
          { filled: profileResult.filled, failed: profileResult.failed },
          'Profile filled'
        );

        // Upload documents
        if (inspection.requiresResume && app.resume) {
          const docResult = await adapter.uploadDocuments(page, {
            resume: app.resume.filePath,
          });
          logger.info({ success: docResult.success }, 'Documents uploaded');
        }

        // Validate form
        await updateApplicationState(
          app.id,
          ApplicationState.VALIDATION_PENDING
        );

        const validation = await adapter.validate(page);
        if (!validation.valid) {
          logger.error({ errors: validation.errors }, 'Form validation failed');

          await interventionManager.createIntervention({
            type: InterventionType.FINAL_REVIEW,
            applicationId: app.id,
            description: `Form validation errors: ${validation.errors.join(', ')}`,
          });

          await updateApplicationState(
            app.id,
            ApplicationState.WAITING_FOR_REVIEW,
            'Form validation failed'
          );

          continue;
        }

        // Submit
        await updateApplicationState(app.id, ApplicationState.SUBMITTING);

        const submitResult = await adapter.submit(page);
        if (!submitResult.success) {
          logger.error({ error: submitResult.error }, 'Submission failed');

          await updateApplicationState(
            app.id,
            ApplicationState.FAILED,
            submitResult.error || 'Submission failed'
          );

          failed++;
          continue;
        }

        // Success
        await updateApplicationState(
          app.id,
          ApplicationState.SUBMITTED,
          submitResult.confirmationText
        );

        logger.info(
          { company: app.company },
          'Application submitted successfully'
        );

        submitted++;
      } catch (error) {
        logger.error({ jobId: app.jobId, error }, 'Error processing application');

        await updateApplicationState(
          app.id,
          ApplicationState.FAILED,
          String(error)
        );

        failed++;
      }

      // Close page
      await browserManager.closePage(`submit-${app.id}`);
    }

    logger.info({ submitted, failed }, 'Application submission complete');
    console.log(`✅ Submitted ${submitted} applications`);
    console.log(`⚠️  Failed: ${failed}`);

    // Get intervention stats
    const stats = await interventionManager.getStats();
    console.log(`📋 Interventions pending: ${stats.pending}`);
  } catch (error) {
    logger.error(error, 'Submission workflow failed');
    throw error;
  } finally {
    await browserManager.close();
    await accountManager.close();
    await interventionManager.close();
    await prisma.$disconnect();
  }
}

async function updateApplicationState(
  applicationId: string,
  state: string,
  message?: string
): Promise<void> {
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      state,
      failureReason: message,
    },
  });
}

main().catch((err) => {
  logger.error(err, 'Application submission failed');
  process.exit(1);
});
