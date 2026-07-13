import { Page } from 'playwright';
import {
  BaseATSAdapter,
  ApplicationField,
  FormInspectionResult,
  FillResult,
  SubmissionResult,
} from './base';

export class GreenhouseAdapter extends BaseATSAdapter {
  id = 'greenhouse';
  name = 'Greenhouse';

  async canHandle(page: Page): Promise<boolean> {
    const url = page.url();
    return /boards\.greenhouse\.io|greenhouse\.io/.test(url);
  }

  async openApplication(page: Page, jobUrl: string): Promise<boolean> {
    this.logAction('opening-application', { url: jobUrl });

    try {
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });

      // Click "Apply now" button if present
      const applyButton = await page.$('a:has-text("Apply now"), button:has-text("Apply now")');
      if (applyButton) {
        await applyButton.click();
        await page.waitForURL(/\/applications?\//, { timeout: 10000 });
      }

      return true;
    } catch (error) {
      this.logError(error, { jobUrl });
      return false;
    }
  }

  async inspectForm(page: Page): Promise<FormInspectionResult> {
    this.logAction('inspecting-form');

    const fields: ApplicationField[] = [];
    const sections: string[] = [];

    try {
      // Get form sections
      const sectionElements = await page.$$('fieldset, [data-section], h3, h2');
      for (const el of sectionElements) {
        const text = await el.textContent();
        if (text) {
          sections.push(text.trim());
        }
      }

      // Get form fields
      const formInputs = await page.$$('input, textarea, select');
      for (const input of formInputs) {
        const type = await input.getAttribute('type');
        const name = await input.getAttribute('name');
        const label = await this.findLabelForInput(input);
        const required = await input.evaluate((el: HTMLInputElement) => el.required);

        const fieldType = this.mapFieldType(type || 'text');

        if (name) {
          fields.push({
            id: name,
            label: label || name,
            normalizedLabel: this.normalizeLabel(label || name),
            type: fieldType,
            required,
            selector: `[name="${name}"]`,
          });
        }
      }

      // Check for file uploads
      const hasResume = Boolean(await page.$('input[type="file"][name*="resume"]'));
      const hasCoverLetter = Boolean(await page.$('input[type="file"][name*="cover"]'));

      this.logAction('form-inspection-complete', {
        fieldsCount: fields.length,
        sectionsCount: sections.length,
        hasResume,
        hasCoverLetter,
      });

      return {
        fields,
        sections,
        requiresResume: hasResume,
        requiresCoverLetter: hasCoverLetter,
        requiresProfileCompletion: false,
        additionalRequirements: [],
      };
    } catch (error) {
      this.logError(error);
      return {
        fields,
        sections,
        requiresResume: false,
        requiresCoverLetter: false,
        requiresProfileCompletion: false,
        additionalRequirements: ['Failed to inspect form'],
      };
    }
  }

  async fillProfile(
    page: Page,
    data: { name: string; email: string; phone: string; location?: string }
  ): Promise<FillResult> {
    this.logAction('filling-profile');

    const result: FillResult = { success: true, filled: 0, failed: 0, warnings: [] };

    try {
      // Fill name
      const nameSelectors = ['[name="first_name"]', '[name="last_name"]', '[name="name"]'];
      for (const selector of nameSelectors) {
        if (await page.$(selector)) {
          const [firstName, lastName] = data.name.split(' ');
          if (selector.includes('first')) {
            await page.fill(selector, firstName || '');
            result.filled++;
          } else if (selector.includes('last')) {
            await page.fill(selector, lastName || '');
            result.filled++;
          } else {
            await page.fill(selector, data.name);
            result.filled++;
          }
        }
      }

      // Fill email
      const emailInput = await page.$('input[type="email"]');
      if (emailInput) {
        await emailInput.fill(data.email);
        result.filled++;
      }

      // Fill phone
      const phoneSelectors = ['[name="phone"]', '[name="mobile"]', 'input[type="tel"]'];
      for (const selector of phoneSelectors) {
        if (await page.$(selector)) {
          await page.fill(selector, data.phone);
          result.filled++;
        }
      }

      result.success = result.failed === 0;
      return result;
    } catch (error) {
      this.logError(error);
      result.success = false;
      result.failed += 1;
      return result;
    }
  }

  async fillEmployment(
    page: Page,
    experiences: Array<{
      company: string;
      title: string;
      startDate: string;
      endDate?: string;
      description?: string;
    }>
  ): Promise<FillResult> {
    this.logAction('filling-employment', { count: experiences.length });

    const result: FillResult = { success: true, filled: 0, failed: 0, warnings: [] };

    try {
      // Greenhouse typically has experience form sections
      // Look for "Add another position" button
      for (const exp of experiences) {
        try {
          // Fill current position fields
          const companyInput = await page.$('input[placeholder*="Company"]');
          if (companyInput) {
            await companyInput.fill(exp.company);
            result.filled++;
          }

          const titleInput = await page.$('input[placeholder*="Title"]');
          if (titleInput) {
            await titleInput.fill(exp.title);
            result.filled++;
          }

          // Try to add another position
          const addButton = await page.$('button:has-text("Add another"), a:has-text("Add another")');
          if (addButton && experiences.indexOf(exp) < experiences.length - 1) {
            await addButton.click();
            await page.waitForTimeout(500);
          }
        } catch (error) {
          this.logWarning(`Failed to fill experience: ${exp.company}`, { error });
          result.failed++;
        }
      }

      result.success = result.failed === 0;
      return result;
    } catch (error) {
      this.logError(error);
      result.success = false;
      return result;
    }
  }

  async fillEducation(
    page: Page,
    education: Array<{
      school: string;
      degree: string;
      field: string;
      graduationDate: string;
    }>
  ): Promise<FillResult> {
    this.logAction('filling-education', { count: education.length });

    const result: FillResult = { success: true, filled: 0, failed: 0, warnings: [] };

    try {
      for (const edu of education) {
        try {
          const schoolInput = await page.$('input[placeholder*="School"]');
          if (schoolInput) {
            await schoolInput.fill(edu.school);
            result.filled++;
          }

          const degreeInput = await page.$('input[placeholder*="Degree"]');
          if (degreeInput) {
            await degreeInput.fill(edu.degree);
            result.filled++;
          }

          const fieldInput = await page.$('input[placeholder*="Field"]');
          if (fieldInput) {
            await fieldInput.fill(edu.field);
            result.filled++;
          }
        } catch (error) {
          this.logWarning(`Failed to fill education: ${edu.school}`, { error });
          result.failed++;
        }
      }

      result.success = result.failed === 0;
      return result;
    } catch (error) {
      this.logError(error);
      result.success = false;
      return result;
    }
  }

  async uploadDocuments(
    page: Page,
    documents: { resume?: string; coverLetter?: string }
  ): Promise<FillResult> {
    this.logAction('uploading-documents');

    const result: FillResult = { success: true, filled: 0, failed: 0, warnings: [] };

    try {
      if (documents.resume) {
        const resumeInput = await page.$('input[type="file"][name*="resume"]');
        if (resumeInput) {
          await resumeInput.setInputFiles(documents.resume);
          result.filled++;
        }
      }

      if (documents.coverLetter) {
        const coverInput = await page.$('input[type="file"][name*="cover"]');
        if (coverInput) {
          await coverInput.setInputFiles(documents.coverLetter);
          result.filled++;
        }
      }

      result.success = true;
      return result;
    } catch (error) {
      this.logError(error);
      result.success = false;
      result.failed = 1;
      return result;
    }
  }

  async answerQuestions(
    page: Page,
    answers: Record<string, string>
  ): Promise<FillResult> {
    this.logAction('answering-questions', { count: Object.keys(answers).length });

    const result: FillResult = { success: true, filled: 0, failed: 0, warnings: [] };

    try {
      for (const [questionId, answer] of Object.entries(answers)) {
        try {
          const field = await page.$(`[name="${questionId}"], [data-question-id="${questionId}"]`);
          if (field) {
            const tagName = await field.evaluate((el) => el.tagName);

            if (tagName === 'TEXTAREA') {
              await field.fill(answer);
            } else if (tagName === 'INPUT') {
              const type = await field.getAttribute('type');
              if (type === 'text' || type === 'email') {
                await field.fill(answer);
              } else if (type === 'radio' || type === 'checkbox') {
                if (answer.toLowerCase() === 'yes' || answer === 'true') {
                  await field.check();
                }
              }
            } else if (tagName === 'SELECT') {
              await field.selectOption(answer);
            }

            result.filled++;
          }
        } catch (error) {
          this.logWarning(`Failed to answer question: ${questionId}`, { error });
          result.failed++;
        }
      }

      result.success = result.failed === 0;
      return result;
    } catch (error) {
      this.logError(error);
      result.success = false;
      return result;
    }
  }

  async validate(page: Page): Promise<{ valid: boolean; errors: string[] }> {
    this.logAction('validating-form');

    const errors: string[] = [];

    try {
      // Check for validation error messages
      const errorElements = await page.$$('.error, [role="alert"], .validation-error');

      for (const el of errorElements) {
        const text = await el.textContent();
        if (text) {
          errors.push(text.trim());
        }
      }

      // Check for required fields that are empty
      const requiredInputs = await page.$$('input[required], textarea[required], select[required]');
      for (const input of requiredInputs) {
        const value = await input.inputValue().catch(() => '');
        if (!value) {
          const label = await this.findLabelForInput(input);
          errors.push(`Required field not filled: ${label || 'Unknown'}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logError(error);
      return {
        valid: false,
        errors: ['Failed to validate form'],
      };
    }
  }

  async submit(page: Page): Promise<SubmissionResult> {
    this.logAction('submitting-application');

    try {
      const submitButton = await page.$('button[type="submit"]');
      if (!submitButton) {
        return {
          success: false,
          error: 'Submit button not found',
        };
      }

      await submitButton.click();

      // Wait for confirmation page
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {
        // Navigation might not happen
      });

      // Check for confirmation message
      const confirmationText = await page.textContent('body');

      return {
        success: true,
        confirmationText: confirmationText || undefined,
      };
    } catch (error) {
      this.logError(error);
      return {
        success: false,
        error: String(error),
      };
    }
  }

  private async findLabelForInput(input: any): Promise<string | null> {
    try {
      const name = await input.getAttribute('name');
      const label = await input.evaluate(
        (el: HTMLInputElement) =>
          document.querySelector(`label[for="${el.id}"]`)?.textContent ||
          el.placeholder ||
          el.name ||
          ''
      );
      return label || name || null;
    } catch {
      return null;
    }
  }

  private mapFieldType(
    type: string
  ): 'text' | 'email' | 'phone' | 'date' | 'textarea' | 'select' | 'checkbox' | 'file' | 'unknown' {
    switch (type?.toLowerCase()) {
      case 'email':
        return 'email';
      case 'tel':
      case 'phone':
        return 'phone';
      case 'date':
        return 'date';
      case 'checkbox':
        return 'checkbox';
      case 'file':
        return 'file';
      case 'text':
      default:
        return 'text';
    }
  }
}
