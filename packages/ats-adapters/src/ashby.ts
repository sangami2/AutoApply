import { Page } from 'playwright';
import {
  BaseATSAdapter,
  FormInspectionResult,
  FillResult,
  SubmissionResult,
} from './base';

export class AshbyAdapter extends BaseATSAdapter {
  id = 'ashby';
  name = 'Ashby';

  async canHandle(page: Page): Promise<boolean> {
    const url = page.url();
    return /jobs\.ashby\.com|ashby\.com.*careers/i.test(url);
  }

  async openApplication(page: Page, jobUrl: string): Promise<boolean> {
    this.logAction('opening-application', { url: jobUrl });

    try {
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });

      // Ashby typically shows form on same page
      return true;
    } catch (error) {
      this.logError(error);
      return false;
    }
  }

  async inspectForm(page: Page): Promise<FormInspectionResult> {
    this.logAction('inspecting-form');

    try {
      const fields = await page.$$eval(
        'input, textarea, select',
        (elements) =>
          elements.map((el) => ({
            name: (el as any).name || (el as any).id || '',
            type: (el as any).type || 'text',
            required: (el as any).required || false,
          }))
      );

      return {
        fields: fields.map((f) => ({
          id: f.name,
          label: f.name,
          normalizedLabel: this.normalizeLabel(f.name),
          type: this.mapFieldType(f.type),
          required: f.required,
        })),
        sections: [],
        requiresResume: Boolean(await page.$('input[type="file"]')),
        requiresCoverLetter: false,
        requiresProfileCompletion: false,
        additionalRequirements: [],
      };
    } catch (error) {
      this.logError(error);
      return {
        fields: [],
        sections: [],
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
      // Ashby uses generic input labels
      const allInputs = await page.$$('input[type="text"], input[type="email"], input[type="tel"]');

      for (const input of allInputs) {
        const label = await input.evaluate((el: HTMLInputElement) => el.placeholder || el.name || '');

        if (label.toLowerCase().includes('name')) {
          await input.fill(data.name);
          result.filled++;
        } else if (label.toLowerCase().includes('email')) {
          await input.fill(data.email);
          result.filled++;
        } else if (label.toLowerCase().includes('phone')) {
          await input.fill(data.phone);
          result.filled++;
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
    return { success: true, filled: 0, failed: 0, warnings: ['Employment filling not yet implemented for Ashby'] };
  }

  async fillEducation(page: Page, education: any[]): Promise<FillResult> {
    this.logAction('filling-education', { count: education.length });
    return { success: true, filled: 0, failed: 0, warnings: ['Education filling not yet implemented for Ashby'] };
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
    return { success: true, filled: 0, failed: 0, warnings: ['Question answering not yet implemented for Ashby'] };
  }

  async validate(page: Page): Promise<{ valid: boolean; errors: string[] }> {
    this.logAction('validating-form');
    return { valid: true, errors: [] };
  }

  async submit(page: Page): Promise<SubmissionResult> {
    this.logAction('submitting-application');

    try {
      const submitButton = await page.$('button[type="submit"]');
      if (!submitButton) {
        return { success: false, error: 'Submit button not found' };
      }

      await submitButton.click();
      await page.waitForTimeout(2000);

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
