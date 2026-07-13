import { createLogger, ApplicationState, InterventionType, ApplicationPolicySchema } from '@job-copilot/shared';
import { PrismaClient } from '@job-copilot/database';
import { BrowserManager } from '@job-copilot/browser';
import { ATSDetector } from '@job-copilot/browser';
import { ADAPTERS } from '@job-copilot/ats-adapters';
import { AccountManager } from '@job-copilot/credentials';
import { InterventionManager } from '@job-copilot/interventions';
import { FormValidator, SubmissionPolicyEngine, ApplicationLogger } from '@job-copilot/evaluation';
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
  const applicationLogger = new ApplicationLogger();

  // Load application policy
  const policyPath = path.join(process.cwd(), 'config', 'application-policy.json');
  const policyConfig = ApplicationPolicySchema.parse(
    JSON.parse(fs.readFileSync(policyPath, 'utf-8'))
  );
  const policyEngine = new SubmissionPolicyEngine(policyConfig);

  const formValidator = new FormValidator();

  logger.info({ policy: policyConfig }, 'Loaded submission policy');

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

        // Validate form with detailed checks
        await updateApplicationState(
          app.id,
          ApplicationState.VALIDATION_PENDING
        );

        const formValidation = await formValidator.validateForm(page);
        const adapterValidation = await adapter.validate(page);

        logger.info(
          { formValid: formValidation.isValid, adapterValid: adapterValidation.valid },
          'Form validation complete'
        );

        if (!formValidation.isValid || !adapterValidation.valid) {
          logger.error(
            {
              formErrors: formValidation.errors,
              adapterErrors: adapterValidation.errors,
            },
            'Form validation failed'
          );

          await interventionManager.createIntervention({
            type: InterventionType.FINAL_REVIEW,
            applicationId: app.id,
            description: `Form validation errors: ${[...formValidation.errors, ...adapterValidation.errors].join('; ')}`,
            metadata: {
              formValidation: formValidation,
              adapterValidation: adapterValidation,
            },
          });

          await updateApplicationState(
            app.id,
            ApplicationState.VALIDATION_FAILED,
            'Form validation failed'
          );

          continue;
        }

        // Check submission policy
        const policyResult = policyEngine.evaluatePolicy({
          score: app.scoring?.finalScore || 0,
          eligibilityPassed: app.eligibility?.passed || false,
          validationPassed: formValidation.isValid,
          hasUnknownAnswers: false,
          hasPendingChallenge: false,
          isDuplicate: false,
          hasCorrectDocuments: app.resume ? true : false,
          sponsorshipVerified: true,
          isApplicationAlreadySubmitted: false,
        });

        logger.info(
          {
            allowed: policyResult.allowed,
            recommendation: policyResult.recommendation,
          },
          'Policy evaluation complete'
        );

        if (policyConfig.submissionMode === 'manual' || policyResult.recommendation === 'REVIEW') {
          logger.info({ company: app.company }, 'Application requires manual review');

          await interventionManager.createIntervention({
            type: InterventionType.FINAL_REVIEW,
            applicationId: app.id,
            description: `${policyResult.recommendation}: ${policyResult.checks.map((c) => c.message).join('; ')}`,
            metadata: policyResult,
          });

          await updateApplicationState(
            app.id,
            ApplicationState.WAITING_FOR_REVIEW,
            `Policy recommendation: ${policyResult.recommendation}`
          );

          continue;
        }

        if (!policyResult.allowed) {
          logger.error({ recommendation: policyResult.recommendation }, 'Policy rejected submission');

          await updateApplicationState(
            app.id,
            ApplicationState.FAILED,
            `Policy rejected: ${policyResult.checks.filter((c) => !c.passed).map((c) => c.message).join('; ')}`
          );

          failed++;
          continue;
        }

        // Submit
        await updateApplicationState(app.id, ApplicationState.SUBMITTING);

        const startTime = Date.now();
        const submitResult = await adapter.submit(page);
        const duration = Date.now() - startTime;

        if (!submitResult.success) {
          logger.error({ error: submitResult.error }, 'Submission failed');

          await updateApplicationState(
            app.id,
            ApplicationState.FAILED,
            submitResult.error || 'Submission failed'
          );

          await applicationLogger.logFailure(
            app.id,
            submitResult.error || 'Unknown error',
            'SUBMISSION_ERROR'
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

        // Log submission
        await applicationLogger.logSubmission({
          applicationId: app.id,
          jobId: app.jobId,
          company: app.company,
          title: app.title,
          requisitionId: app.job?.requisitionId,
          atsProvider: app.atsProvider,
          submittedAt: new Date(),
          confirmationText: submitResult.confirmationText,
          confirmationId: submitResult.applicationId,
          resumeUsed: app.resume?.filename || 'unknown',
          coverLetterUsed: app.coverLetter?.filename,
          formValidationPassed: formValidation.isValid,
          policyValidationPassed: policyResult.allowed,
          interventionsResolved: 0,
          duration,
        });

        logger.info(
          { company: app.company, duration },
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

    // Generate and display report
    const report = await applicationLogger.generateReport();
    console.log('\n' + report);
  } catch (error) {
    logger.error(error, 'Submission workflow failed');
    throw error;
  } finally {
    await browserManager.close();
    await accountManager.close();
    await interventionManager.close();
    await applicationLogger.close();
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
