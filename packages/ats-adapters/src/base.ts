import { createLogger } from '@job-copilot/shared';
import { Page } from 'playwright';

const logger = createLogger('ats-adapters:base');

export interface ApplicationField {
  id: string;
  label: string;
  normalizedLabel: string;
  type: 'text' | 'email' | 'phone' | 'date' | 'textarea' | 'select' | 'checkbox' | 'file' | 'unknown';
  required: boolean;
  options?: string[];
  value?: string;
  selector?: string;
}

export interface FormInspectionResult {
  fields: ApplicationField[];
  sections: string[];
  requiresResume: boolean;
  requiresCoverLetter: boolean;
  requiresProfileCompletion: boolean;
  additionalRequirements: string[];
}

export interface FillResult {
  success: boolean;
  filled: number;
  failed: number;
  warnings: string[];
}

export interface SubmissionResult {
  success: boolean;
  confirmationText?: string;
  applicationId?: string;
  error?: string;
}

export abstract class BaseATSAdapter {
  protected logger = logger;

  abstract id: string;
  abstract name: string;

  /**
   * Check if this adapter can handle the current page
   */
  abstract canHandle(page: Page): Promise<boolean>;

  /**
   * Navigate to application page and prepare for filling
   */
  abstract openApplication(page: Page, jobUrl: string): Promise<boolean>;

  /**
   * Inspect form and return field configuration
   */
  abstract inspectForm(page: Page): Promise<FormInspectionResult>;

  /**
   * Fill candidate profile information
   */
  abstract fillProfile(
    page: Page,
    data: {
      name: string;
      email: string;
      phone: string;
      location?: string;
    }
  ): Promise<FillResult>;

  /**
   * Fill employment/experience information
   */
  abstract fillEmployment(
    page: Page,
    experiences: Array<{
      company: string;
      title: string;
      startDate: string;
      endDate?: string;
      description?: string;
    }>
  ): Promise<FillResult>;

  /**
   * Fill education information
   */
  abstract fillEducation(
    page: Page,
    education: Array<{
      school: string;
      degree: string;
      field: string;
      graduationDate: string;
    }>
  ): Promise<FillResult>;

  /**
   * Upload documents (resume, cover letter, etc.)
   */
  abstract uploadDocuments(
    page: Page,
    documents: {
      resume?: string;
      coverLetter?: string;
    }
  ): Promise<FillResult>;

  /**
   * Answer application questions
   */
  abstract answerQuestions(
    page: Page,
    answers: Record<string, string>
  ): Promise<FillResult>;

  /**
   * Validate form before submission
   */
  abstract validate(page: Page): Promise<{ valid: boolean; errors: string[] }>;

  /**
   * Submit application
   */
  abstract submit(page: Page): Promise<SubmissionResult>;

  /**
   * Normalize field label for matching
   */
  protected normalizeLabel(label: string): string {
    return label
      .toLowerCase()
      .trim()
      .replace(/[*:]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 100);
  }

  /**
   * Find field selector by common patterns
   */
  protected async findFieldByLabel(
    page: Page,
    patterns: string[]
  ): Promise<string | null> {
    for (const pattern of patterns) {
      try {
        // Try to find by label
        const labelSelector = `label:has-text("${pattern}")`;
        const label = await page.$(labelSelector);
        if (label) {
          const parentForm = await label.evaluate((el) => {
            return (el.closest('form') || el.closest('div[role="group"]') || el.parentElement)?.id || 'unknown';
          });
          if (parentForm !== 'unknown') {
            return parentForm;
          }
        }

        // Try to find by placeholder
        const inputSelector = `input[placeholder*="${pattern}"], textarea[placeholder*="${pattern}"]`;
        if (await page.$(inputSelector)) {
          return inputSelector;
        }
      } catch (error) {
        // Continue to next pattern
      }
    }

    return null;
  }

  /**
   * Log adapter action
   */
  protected logAction(action: string, data?: Record<string, unknown>): void {
    this.logger.info({ adapter: this.id, action, ...data }, `${this.name}: ${action}`);
  }

  /**
   * Log adapter warning
   */
  protected logWarning(warning: string, data?: Record<string, unknown>): void {
    this.logger.warn({ adapter: this.id, warning, ...data }, `${this.name}: ${warning}`);
  }

  /**
   * Log adapter error
   */
  protected logError(error: unknown, data?: Record<string, unknown>): void {
    this.logger.error({ adapter: this.id, error, ...data }, `${this.name}: Error`);
  }
}
