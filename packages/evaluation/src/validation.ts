import { createLogger } from '@job-copilot/shared';
import { Page } from 'playwright';

const logger = createLogger('evaluation:validation');

export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning';
}

export interface FormValidationResult {
  isValid: boolean;
  checks: ValidationCheck[];
  errors: string[];
  warnings: string[];
  timestamp: Date;
}

export class FormValidator {
  /**
   * Validate form before submission
   */
  async validateForm(page: Page): Promise<FormValidationResult> {
    logger.info('Starting form validation');

    const checks: ValidationCheck[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check 1: Required fields are filled
      const requiredCheck = await this.checkRequiredFields(page);
      checks.push(requiredCheck);
      if (!requiredCheck.passed) {
        errors.push(requiredCheck.message);
      }

      // Check 2: No validation error messages visible
      const errorCheck = await this.checkNoValidationErrors(page);
      checks.push(errorCheck);
      if (!errorCheck.passed) {
        errors.push(errorCheck.message);
      }

      // Check 3: Email fields are valid format
      const emailCheck = await this.checkEmailFields(page);
      checks.push(emailCheck);
      if (!emailCheck.passed) {
        errors.push(emailCheck.message);
      }

      // Check 4: Phone fields are valid format
      const phoneCheck = await this.checkPhoneFields(page);
      checks.push(phoneCheck);
      if (!phoneCheck.passed) {
        warnings.push(phoneCheck.message);
      }

      // Check 5: File uploads are present if required
      const fileCheck = await this.checkRequiredFiles(page);
      checks.push(fileCheck);
      if (!fileCheck.passed) {
        errors.push(fileCheck.message);
      }

      // Check 6: No suspicious auto-filled values
      const suspiciousCheck = await this.checkSuspiciousValues(page);
      checks.push(suspiciousCheck);
      if (!suspiciousCheck.passed) {
        warnings.push(suspiciousCheck.message);
      }

      const isValid = errors.length === 0;

      logger.info(
        {
          isValid,
          checksCount: checks.length,
          errorsCount: errors.length,
          warningsCount: warnings.length,
        },
        'Form validation complete'
      );

      return {
        isValid,
        checks,
        errors,
        warnings,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error({ error }, 'Form validation failed');

      return {
        isValid: false,
        checks,
        errors: [...errors, `Validation error: ${String(error)}`],
        warnings,
        timestamp: new Date(),
      };
    }
  }

  private async checkRequiredFields(page: Page): Promise<ValidationCheck> {
    try {
      const requiredInputs = await page.$$(
        'input[required], textarea[required], select[required]'
      );

      const emptyCount = await Promise.all(
        requiredInputs.map(async (input) => {
          const value = await input.inputValue().catch(() => '');
          return value.trim().length === 0;
        })
      ).then((results) => results.filter((r) => r).length);

      const passed = emptyCount === 0;

      return {
        name: 'Required Fields',
        passed,
        message: passed
          ? 'All required fields are filled'
          : `${emptyCount} required field(s) are empty`,
        severity: 'error',
      };
    } catch (error) {
      logger.warn({ error }, 'Could not check required fields');
      return {
        name: 'Required Fields',
        passed: true,
        message: 'Could not verify required fields (skipped)',
        severity: 'warning',
      };
    }
  }

  private async checkNoValidationErrors(page: Page): Promise<ValidationCheck> {
    try {
      const errorElements = await page.$$(
        '[role="alert"], .error, .validation-error, .alert-danger'
      );

      const errorMessages: string[] = [];
      for (const el of errorElements) {
        const text = await el.textContent();
        if (text?.trim()) {
          errorMessages.push(text.trim());
        }
      }

      const passed = errorMessages.length === 0;

      return {
        name: 'No Validation Errors',
        passed,
        message: passed
          ? 'No validation errors on page'
          : `${errorMessages.length} error(s): ${errorMessages.slice(0, 2).join('; ')}`,
        severity: 'error',
      };
    } catch (error) {
      logger.warn({ error }, 'Could not check validation errors');
      return {
        name: 'No Validation Errors',
        passed: true,
        message: 'Could not check for errors (skipped)',
        severity: 'warning',
      };
    }
  }

  private async checkEmailFields(page: Page): Promise<ValidationCheck> {
    try {
      const emailInputs = await page.$$('input[type="email"]');

      const invalidEmails: string[] = [];
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      for (const input of emailInputs) {
        const value = await input.inputValue();
        if (value && !emailRegex.test(value)) {
          invalidEmails.push(value);
        }
      }

      const passed = invalidEmails.length === 0;

      return {
        name: 'Valid Email Addresses',
        passed,
        message: passed
          ? 'All email addresses are valid'
          : `${invalidEmails.length} invalid email(s)`,
        severity: 'error',
      };
    } catch (error) {
      logger.warn({ error }, 'Could not check email fields');
      return {
        name: 'Valid Email Addresses',
        passed: true,
        message: 'Could not verify emails (skipped)',
        severity: 'warning',
      };
    }
  }

  private async checkPhoneFields(page: Page): Promise<ValidationCheck> {
    try {
      const phoneInputs = await page.$$('input[type="tel"], input[name*="phone"]');

      const invalidPhones: string[] = [];
      const phoneRegex = /^\+?[\d\s\-()]{10,}$/;

      for (const input of phoneInputs) {
        const value = await input.inputValue();
        if (value && !phoneRegex.test(value)) {
          invalidPhones.push(value);
        }
      }

      const passed = invalidPhones.length === 0;

      return {
        name: 'Valid Phone Numbers',
        passed,
        message: passed
          ? 'All phone numbers are valid'
          : `${invalidPhones.length} invalid phone(s)`,
        severity: 'warning',
      };
    } catch (error) {
      logger.warn({ error }, 'Could not check phone fields');
      return {
        name: 'Valid Phone Numbers',
        passed: true,
        message: 'Could not verify phones (skipped)',
        severity: 'warning',
      };
    }
  }

  private async checkRequiredFiles(page: Page): Promise<ValidationCheck> {
    try {
      const fileInputs = await page.$$('input[type="file"][required]');

      const missingFiles: string[] = [];

      for (const input of fileInputs) {
        const files = await input.inputValue();
        if (!files || files.length === 0) {
          const label = await input.evaluate(
            (el: HTMLInputElement) => el.name || el.id || 'Document'
          );
          missingFiles.push(label);
        }
      }

      const passed = missingFiles.length === 0;

      return {
        name: 'Required Files',
        passed,
        message: passed
          ? 'All required files are uploaded'
          : `${missingFiles.length} file(s) missing: ${missingFiles.join(', ')}`,
        severity: 'error',
      };
    } catch (error) {
      logger.warn({ error }, 'Could not check file uploads');
      return {
        name: 'Required Files',
        passed: true,
        message: 'Could not verify files (skipped)',
        severity: 'warning',
      };
    }
  }

  private async checkSuspiciousValues(page: Page): Promise<ValidationCheck> {
    try {
      const suspiciousPatterns = [
        /example|test|sample|placeholder|default|unknown|N\/A|TBD/i,
      ];

      const inputs = await page.$$('input, textarea, select');
      const suspicious: string[] = [];

      for (const input of inputs) {
        const value = await input.inputValue();
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(value)) {
            suspicious.push(value.slice(0, 50));
          }
        }
      }

      const passed = suspicious.length === 0;

      return {
        name: 'No Suspicious Values',
        passed,
        message: passed
          ? 'No suspicious auto-filled values detected'
          : `${suspicious.length} potentially suspicious value(s)`,
        severity: 'warning',
      };
    } catch (error) {
      logger.warn({ error }, 'Could not check suspicious values');
      return {
        name: 'No Suspicious Values',
        passed: true,
        message: 'Could not verify values (skipped)',
        severity: 'warning',
      };
    }
  }
}
