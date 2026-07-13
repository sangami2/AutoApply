import { createLogger } from '@job-copilot/shared';
import { Page } from 'playwright';

const logger = createLogger('browser:detection');

export enum AtsProvider {
  GREENHOUSE = 'greenhouse',
  LEVER = 'lever',
  ASHBY = 'ashby',
  WORKDAY = 'workday',
  ICIMS = 'icims',
  PHENOM = 'phenom',
  TALEO = 'taleo',
  SMARTRECRUITERS = 'smartrecruiters',
  JOBVITE = 'jobvite',
  SUCCESSFACTORS = 'successfactors',
  CUSTOM = 'custom',
  UNKNOWN = 'unknown',
}

interface DetectionPattern {
  name: AtsProvider;
  urlPatterns: RegExp[];
  domPatterns: { selector: string; text?: RegExp }[];
  scriptPatterns: RegExp[];
}

const DETECTION_PATTERNS: DetectionPattern[] = [
  {
    name: AtsProvider.GREENHOUSE,
    urlPatterns: [/boards\.greenhouse\.io/, /greenhouse\.io/],
    domPatterns: [
      { selector: '[data-testid*="greenhouse"]' },
      { selector: '.gh-job-board' },
      { selector: 'a[href*="boards.greenhouse.io"]' },
    ],
    scriptPatterns: [/greenhouse/i],
  },
  {
    name: AtsProvider.LEVER,
    urlPatterns: [/jobs\.lever\.co/, /apply\.lever\.co/],
    domPatterns: [
      { selector: '[data-testid*="lever"]' },
      { selector: '.lever-form' },
      { selector: 'a[href*="lever.co"]' },
    ],
    scriptPatterns: [/lever/i],
  },
  {
    name: AtsProvider.ASHBY,
    urlPatterns: [/jobs\.ashby\.com/, /ashby\.com.*careers/i],
    domPatterns: [
      { selector: '[data-testid*="ashby"]' },
      { selector: '.ashby' },
      { selector: 'a[href*="ashby.com"]' },
    ],
    scriptPatterns: [/ashby/i],
  },
  {
    name: AtsProvider.WORKDAY,
    urlPatterns: [/myworkdayjobs/, /careers\.workday\.com/, /jobs\.workday\.com/],
    domPatterns:
      [
        { selector: '[data-component-id*="workday"]' },
        { selector: '.workday' },
        { selector: 'div[role="main"] iframe' },
      ],
    scriptPatterns: [/workday/i, /myworkdayjobs/i],
  },
  {
    name: AtsProvider.ICIMS,
    urlPatterns: [/icims\.com/, /talentcloud.*icims/i],
    domPatterns: [
      { selector: '[class*="icims"]' },
      { selector: '.applicant-profile' },
    ],
    scriptPatterns: [/icims/i],
  },
  {
    name: AtsProvider.PHENOM,
    urlPatterns: [/jobs\.phenom\.com/, /phenom\.com/],
    domPatterns: [
      { selector: '[data-phenom]' },
      { selector: '.phenom' },
    ],
    scriptPatterns: [/phenom/i],
  },
];

export class ATSDetector {
  /**
   * Detect ATS provider from URL first, then DOM if needed
   */
  async detect(page: Page): Promise<AtsProvider> {
    const url = page.url();
    logger.info({ url }, 'Detecting ATS provider');

    // Check URL patterns first (fastest)
    for (const pattern of DETECTION_PATTERNS) {
      for (const urlPattern of pattern.urlPatterns) {
        if (urlPattern.test(url)) {
          logger.info({ provider: pattern.name }, 'Detected ATS from URL');
          return pattern.name;
        }
      }
    }

    // Check DOM patterns
    for (const pattern of DETECTION_PATTERNS) {
      for (const domPattern of pattern.domPatterns) {
        try {
          const element = await page.$(domPattern.selector);
          if (element) {
            if (domPattern.text) {
              const text = await element.textContent();
              if (text && domPattern.text.test(text)) {
                logger.info({ provider: pattern.name, selector: domPattern.selector }, 'Detected ATS from DOM');
                return pattern.name;
              }
            } else {
              logger.info({ provider: pattern.name, selector: domPattern.selector }, 'Detected ATS from DOM');
              return pattern.name;
            }
          }
        } catch (error) {
          // Continue to next pattern
        }
      }
    }

    // Check for custom job board patterns
    try {
      const content = await page.content();
      if (content.includes('job-application') || content.includes('apply-now')) {
        logger.info('Detected custom employer portal');
        return AtsProvider.CUSTOM;
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to check page content');
    }

    logger.warn('Could not detect ATS provider');
    return AtsProvider.UNKNOWN;
  }

  /**
   * Check if page appears to be a job application form
   */
  async isApplicationPage(page: Page): Promise<boolean> {
    try {
      const content = await page.content();
      const url = page.url();

      // Check for common form indicators
      const isForm =
        content.includes('<form') ||
        content.includes('type="submit"') ||
        content.includes('apply') ||
        content.includes('apply');

      const isJobUrl =
        /job|apply|application|career/i.test(url) ||
        /position|role|opening/i.test(url);

      return isForm && isJobUrl;
    } catch (error) {
      logger.error({ error }, 'Failed to check if application page');
      return false;
    }
  }

  /**
   * Detect if a login/account creation page
   */
  async isAuthPage(page: Page): Promise<boolean> {
    try {
      const url = page.url();
      const content = await page.content();

      const hasLoginForm =
        content.includes('type="password"') ||
        content.includes('login') ||
        content.includes('sign in') ||
        content.includes('email');

      const isAuthUrl =
        /login|signin|signup|register|auth|account/i.test(url);

      return hasLoginForm || isAuthUrl;
    } catch (error) {
      logger.error({ error }, 'Failed to check if auth page');
      return false;
    }
  }

  /**
   * Detect if page shows an error or rejection
   */
  async hasError(page: Page): Promise<{ hasError: boolean; message?: string }> {
    try {
      const content = await page.content();

      const errorPatterns = [
        /error occurred/i,
        /something went wrong/i,
        /failed/i,
        /unable to/i,
        /not available/i,
        /already applied/i,
        /application.*closed/i,
      ];

      for (const pattern of errorPatterns) {
        if (pattern.test(content)) {
          return {
            hasError: true,
            message: `Page contains error pattern: ${pattern.source}`,
          };
        }
      }

      return { hasError: false };
    } catch (error) {
      logger.warn({ error }, 'Failed to check for errors');
      return { hasError: false };
    }
  }

  /**
   * Detect if page requires account creation
   */
  async requiresAccount(page: Page): Promise<boolean> {
    try {
      const content = await page.content();

      return (
        content.includes('create account') ||
        content.includes('create profile') ||
        content.includes('sign up') ||
        content.includes('register') ||
        content.includes('new user')
      );
    } catch (error) {
      logger.error({ error }, 'Failed to check account requirement');
      return false;
    }
  }

  /**
   * Detect common field types on page
   */
  async detectFields(page: Page): Promise<Array<{
    type: string;
    selector?: string;
    label?: string;
  }>> {
    try {
      const fields: Array<{ type: string; selector?: string; label?: string }> = [];

      // Check for form fields
      const inputTypes = await page.$$eval('input', (inputs: any[]) =>
        inputs.map((input) => ({
          type: input.type,
          name: input.name,
          placeholder: input.placeholder,
        }))
      );

      for (const input of inputTypes) {
        fields.push({
          type: `input[${input.type}]`,
          label: input.name || input.placeholder,
        });
      }

      // Check for textareas
      const textareaCount = await page.$$eval('textarea', (t) => t.length);
      if (textareaCount > 0) {
        fields.push({ type: 'textarea' });
      }

      // Check for selects
      const selectCount = await page.$$eval('select', (s) => s.length);
      if (selectCount > 0) {
        fields.push({ type: 'select' });
      }

      logger.info({ count: fields.length }, 'Detected form fields');
      return fields;
    } catch (error) {
      logger.warn({ error }, 'Failed to detect fields');
      return [];
    }
  }
}

export default ATSDetector;
