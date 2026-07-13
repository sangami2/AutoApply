import { Page } from 'playwright';
import {
  BaseATSAdapter,
  FormInspectionResult,
  FillResult,
  SubmissionResult,
} from './base';

export class WorkdayAdapter extends BaseATSAdapter {
  id = 'workday';
  name = 'Workday';

  async canHandle(page: Page): Promise<boolean> {
    const url = page.url();
    return /myworkdayjobs|careers\.workday\.com|jobs\.workday\.com/.test(url);
  }

  async openApplication(page: Page, jobUrl: string): Promise<boolean> {
    this.logAction('opening-application', { url: jobUrl });

    try {
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });

      // Workday may have application form on same page or separate modal
      // Check for "Apply" button or link
      const applyButton = await page.$(
        'button:has-text("Apply"), a:has-text("Apply"), [data-automation-id="applyButton"]'
      );

      if (applyButton) {
        await applyButton.click();
        await page.waitForTimeout(1500);
      }

      return true;
    } catch (error) {
      this.logError(error);
      return false;
    }
  }

  async inspectForm(page: Page): Promise<FormInspectionResult> {
    this.logAction('inspecting-form');

    try {
      // Workday forms can be complex with multiple steps
      // Try to find form fields
      const fields = await page.$$eval(
        'input, textarea, select, [role="textbox"], [role="combobox"]',
        (elements) =>
          elements.map((el) => ({
            name: (el as any).name || (el as any).id || (el as any).getAttribute?.('aria-label') || '',
            type: (el as any).type || 'text',
            required: (el as any).required || (el as any).getAttribute?.('aria-required') === 'true',
          }))
      );

      const hasResume = Boolean(await page.$('input[type="file"]'));

      return {
        fields: fields.map((f) => ({
          id: f.name,
          label: f.name,
          normalizedLabel: this.normalizeLabel(f.name),
          type: this.mapFieldType(f.type),
          required: f.required,
        })),
        sections: [],
        requiresResume: hasResume,
        requiresCoverLetter: false,
        requiresProfileCompletion: true, // Workday often has profile section
        additionalRequirements: ['Workday forms may require multi-step completion'],
      };
    } catch (error) {
      this.logError(error);
      return {
        fields: [],
        sections: [],
        requiresResume: false,
        requiresCoverLetter: false,
        requiresProfileCompletion: true,
        additionalRequirements: ['Failed to inspect Workday form - may require account'],
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
      // Workday fields use various identifiers
      const inputs = await page.$$('input, [role="textbox"]');

      for (const input of inputs) {
        try {
          const label = await input.evaluate(
            (el: HTMLInputElement) =>
              el.placeholder ||
              el.name ||
              (el.parentElement?.textContent || '') ||
              el.getAttribute('aria-label') ||
              ''
          );

          const labelLower = label.toLowerCase();

          if (labelLower.includes('first name') || labelLower.includes('given name')) {
            const [firstName] = data.name.split(' ');
            await input.fill(firstName || '');
            result.filled++;
          } else if (labelLower.includes('last name') || labelLower.includes('surname')) {
            const [, lastName] = data.name.split(' ');
            await input.fill(lastName || '');
            result.filled++;
          } else if (labelLower.includes('email')) {
            await input.fill(data.email);
            result.filled++;
          } else if (labelLower.includes('phone')) {
            await input.fill(data.phone);
            result.filled++;
          }
        } catch (error) {
          // Continue to next input
        }
      }

      result.success = true;
      return result;
    } catch (error) {
      this.logError(error);
      result.success = false;
      return result;
    }
  }

  async fillEmployment(page: Page, experiences: any[]): Promise<FillResult> {
    this.logAction('filling-employment', { count: experiences.length });
    return { success: true, filled: 0, failed: 0, warnings: ['Employment filling not yet fully implemented for Workday'] };
  }

  async fillEducation(page: Page, education: any[]): Promise<FillResult> {
    this.logAction('filling-education', { count: education.length });
    return { success: true, filled: 0, failed: 0, warnings: ['Education filling not yet fully implemented for Workday'] };
  }

  async uploadDocuments(
    page: Page,
    documents: { resume?: string; coverLetter?: string }
  ): Promise<FillResult> {
    this.logAction('uploading-documents');

    const result: FillResult = { success: true, filled: 0, failed: 0, warnings: [] };

    try {
      if (documents.resume) {
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(documents.resume);
          result.filled++;
        }
      }

      return result;
    } catch (error) {
      this.logError(error);
      result.success = false;
      return result;
    }
  }

  async answerQuestions(page: Page, answers: Record<string, string>): Promise<FillResult> {
    this.logAction('answering-questions', { count: Object.keys(answers).length });
    return { success: true, filled: 0, failed: 0, warnings: ['Question answering not yet implemented for Workday'] };
  }

  async validate(page: Page): Promise<{ valid: boolean; errors: string[] }> {
    this.logAction('validating-form');

    try {
      // Check for error messages
      const errors: string[] = [];
      const errorElements = await page.$$('[role="alert"], .error, .validation-error');

      for (const el of errorElements) {
        const text = await el.textContent();
        if (text) {
          errors.push(text.trim());
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      this.logError(error);
      return { valid: true, errors: [] };
    }
  }

  async submit(page: Page): Promise<SubmissionResult> {
    this.logAction('submitting-application');

    try {
      // Find submit button - Workday uses various patterns
      const submitButton = await page.$(
        'button[type="submit"], button:has-text("Submit"), button:has-text("Apply"), [data-automation-id="submitButton"]'
      );

      if (!submitButton) {
        return { success: false, error: 'Submit button not found' };
      }

      await submitButton.click();
      await page.waitForTimeout(3000);

      // Check for confirmation
      const content = await page.content();
      if (content.includes('success') || content.includes('submitted') || content.includes('thank')) {
        return { success: true };
      }

      return { success: true };
    } catch (error) {
      this.logError(error);
      return { success: false, error: String(error) };
    }
  }

  private mapFieldType(type: string) {
    switch (type?.toLowerCase()) {
      case 'email':
        return 'email' as const;
      case 'tel':
      case 'phone':
        return 'phone' as const;
      case 'date':
        return 'date' as const;
      case 'checkbox':
        return 'checkbox' as const;
      case 'file':
        return 'file' as const;
      default:
        return 'text' as const;
    }
  }
}
