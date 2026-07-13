import { createLogger } from '@job-copilot/shared';
import { PrismaClient } from '@job-copilot/database';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('evaluation:application-logger');

export interface ApplicationSubmissionLog {
  applicationId: string;
  jobId: string;
  company: string;
  title: string;
  requisitionId?: string;
  atsProvider?: string;
  submittedAt: Date;
  confirmationText?: string;
  confirmationId?: string;
  resumeUsed: string;
  coverLetterUsed?: string;
  formValidationPassed: boolean;
  policyValidationPassed: boolean;
  interventionsResolved: number;
  duration: number; // milliseconds
}

export class ApplicationLogger {
  private prisma: PrismaClient;
  private logsDir: string;

  constructor(logsDir: string = 'logs') {
    this.prisma = new PrismaClient();
    this.logsDir = logsDir;

    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * Log successful application submission
   */
  async logSubmission(log: ApplicationSubmissionLog): Promise<void> {
    logger.info(
      {
        company: log.company,
        jobId: log.jobId,
      },
      'Logging application submission'
    );

    try {
      // Store in database
      await this.prisma.application.update({
        where: { id: log.applicationId },
        data: {
          submittedAt: log.submittedAt,
          confirmedAt: log.submittedAt,
        },
      });

      // Write to JSONL file for audit trail
      const logEntry = {
        ...log,
        timestamp: log.submittedAt.toISOString(),
      };

      const logPath = path.join(this.logsDir, 'submissions.jsonl');
      fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');

      logger.info({ applicationId: log.applicationId }, 'Submission logged');
    } catch (error) {
      logger.error({ error }, 'Failed to log submission');
      throw error;
    }
  }

  /**
   * Log application failure
   */
  async logFailure(
    applicationId: string,
    reason: string,
    category: string
  ): Promise<void> {
    logger.info({ applicationId, reason }, 'Logging application failure');

    try {
      await this.prisma.application.update({
        where: { id: applicationId },
        data: {
          failureReason: reason,
          failureCategory: category,
          failedAt: new Date(),
        },
      });

      const logEntry = {
        applicationId,
        reason,
        category,
        timestamp: new Date().toISOString(),
      };

      const logPath = path.join(this.logsDir, 'failures.jsonl');
      fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');

      logger.info({ applicationId }, 'Failure logged');
    } catch (error) {
      logger.error({ error }, 'Failed to log failure');
    }
  }

  /**
   * Get submission statistics
   */
  async getStatistics(): Promise<{
    submitted: number;
    confirmed: number;
    failed: number;
    pending: number;
    averageDuration: number;
  }> {
    try {
      const submitted = await this.prisma.application.count({
        where: { state: 'SUBMITTED' },
      });

      const confirmed = await this.prisma.application.count({
        where: { state: 'CONFIRMED' },
      });

      const failed = await this.prisma.application.count({
        where: { state: 'FAILED' },
      });

      const pending = await this.prisma.application.count({
        where: {
          state: {
            notIn: ['SUBMITTED', 'CONFIRMED', 'FAILED', 'SKIPPED'],
          },
        },
      });

      // Calculate average duration from JSONL
      const logPath = path.join(this.logsDir, 'submissions.jsonl');
      let averageDuration = 0;

      if (fs.existsSync(logPath)) {
        const lines = fs
          .readFileSync(logPath, 'utf-8')
          .split('\n')
          .filter((line) => line.trim());

        if (lines.length > 0) {
          const durations = lines
            .map((line) => {
              try {
                const entry = JSON.parse(line);
                return entry.duration || 0;
              } catch {
                return 0;
              }
            })
            .filter((d) => d > 0);

          if (durations.length > 0) {
            averageDuration =
              durations.reduce((a, b) => a + b, 0) / durations.length;
          }
        }
      }

      return {
        submitted,
        confirmed,
        failed,
        pending,
        averageDuration,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get statistics');
      return {
        submitted: 0,
        confirmed: 0,
        failed: 0,
        pending: 0,
        averageDuration: 0,
      };
    }
  }

  /**
   * Generate submission report
   */
  async generateReport(): Promise<string> {
    const stats = await this.getStatistics();

    return `
Application Submission Report
==============================

Summary:
- Submitted: ${stats.submitted}
- Confirmed: ${stats.confirmed}
- Failed: ${stats.failed}
- Pending: ${stats.pending}
- Average Duration: ${(stats.averageDuration / 1000).toFixed(1)}s

Success Rate: ${
      stats.submitted > 0
        ? ((stats.confirmed / stats.submitted) * 100).toFixed(1)
        : 0
    }%

Report Generated: ${new Date().toISOString()}
    `.trim();
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
