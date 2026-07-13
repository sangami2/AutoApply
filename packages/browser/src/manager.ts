import { createLogger } from '@job-copilot/shared';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('browser:manager');

export interface BrowserSessionOptions {
  headless?: boolean;
  slowMo?: number;
  timeout?: number;
  viewport?: { width: number; height: number };
}

export class BrowserManager {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private pages: Map<string, Page> = new Map();
  private stateDir: string;

  constructor(
    private options: BrowserSessionOptions = {},
    stateDir: string = 'browser-state'
  ) {
    this.stateDir = stateDir;
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  async launch(): Promise<void> {
    if (this.browser) {
      logger.warn('Browser already launched');
      return;
    }

    logger.info('Launching browser');

    this.browser = await chromium.launch({
      headless: this.options.headless ?? true,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    logger.info('Browser launched');
  }

  async getContext(name: string, userId?: string): Promise<BrowserContext> {
    if (!this.browser) {
      throw new Error('Browser not launched');
    }

    if (this.contexts.has(name)) {
      return this.contexts.get(name)!;
    }

    logger.info({ contextName: name }, 'Creating browser context');

    const storageStatePath = this.getStorageStatePath(name);
    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: this.options.viewport || { width: 1280, height: 720 },
      ignoreHTTPSErrors: false,
    };

    // Load saved state if exists
    if (fs.existsSync(storageStatePath)) {
      try {
        contextOptions.storageState = storageStatePath;
        logger.info({ path: storageStatePath }, 'Loaded saved context state');
      } catch (error) {
        logger.warn({ error }, 'Failed to load context state, starting fresh');
      }
    }

    const context = await this.browser.newContext(contextOptions);

    // Set viewport
    if (this.options.slowMo) {
      context.setDefaultTimeout(this.options.timeout || 30000);
    }

    this.contexts.set(name, context);
    return context;
  }

  async getPage(contextName: string, pageKey?: string): Promise<Page> {
    const context = await this.getContext(contextName);
    const key = pageKey || `${contextName}-page`;

    if (this.pages.has(key)) {
      return this.pages.get(key)!;
    }

    logger.info({ pageKey: key }, 'Creating page');

    const page = await context.newPage();

    // Set default timeout
    page.setDefaultTimeout(this.options.timeout || 30000);
    page.setDefaultNavigationTimeout(this.options.timeout || 30000);

    // Add slow motion if configured
    if (this.options.slowMo) {
      page.context().setDefaultTimeout(this.options.slowMo);
    }

    this.pages.set(key, page);
    return page;
  }

  async navigateTo(page: Page, url: string): Promise<boolean> {
    try {
      logger.info({ url }, 'Navigating to URL');
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return true;
    } catch (error) {
      logger.error({ url, error }, 'Navigation failed');
      return false;
    }
  }

  async screenshot(page: Page, name: string, dir: string = 'screenshots'): Promise<string | null> {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}-${timestamp}.png`;
      const filepath = path.join(dir, filename);

      await page.screenshot({ path: filepath, fullPage: true });
      logger.info({ filepath }, 'Screenshot saved');
      return filepath;
    } catch (error) {
      logger.error({ error }, 'Screenshot failed');
      return null;
    }
  }

  async saveContext(contextName: string): Promise<void> {
    const context = this.contexts.get(contextName);
    if (!context) {
      logger.warn({ contextName }, 'Context not found');
      return;
    }

    const storageStatePath = this.getStorageStatePath(contextName);

    try {
      const state = await context.storageState();
      fs.writeFileSync(storageStatePath, JSON.stringify(state, null, 2));
      logger.info({ path: storageStatePath }, 'Context state saved');
    } catch (error) {
      logger.error({ error }, 'Failed to save context state');
    }
  }

  async closePage(pageKey: string): Promise<void> {
    const page = this.pages.get(pageKey);
    if (page) {
      try {
        await page.close();
        this.pages.delete(pageKey);
        logger.info({ pageKey }, 'Page closed');
      } catch (error) {
        logger.warn({ pageKey, error }, 'Failed to close page');
      }
    }
  }

  async closeContext(contextName: string): Promise<void> {
    // Close all pages in context
    const pagesToClose = Array.from(this.pages.entries())
      .filter(([key]) => key.startsWith(contextName))
      .map(([key]) => key);

    for (const pageKey of pagesToClose) {
      await this.closePage(pageKey);
    }

    const context = this.contexts.get(contextName);
    if (context) {
      try {
        // Save state before closing
        await this.saveContext(contextName);
        await context.close();
        this.contexts.delete(contextName);
        logger.info({ contextName }, 'Context closed');
      } catch (error) {
        logger.warn({ contextName, error }, 'Failed to close context');
      }
    }
  }

  async close(): Promise<void> {
    // Close all contexts
    for (const contextName of Array.from(this.contexts.keys())) {
      await this.closeContext(contextName);
    }

    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        logger.info('Browser closed');
      } catch (error) {
        logger.warn({ error }, 'Failed to close browser');
      }
    }
  }

  private getStorageStatePath(contextName: string): string {
    return path.join(this.stateDir, `${contextName}-state.json`);
  }

  // Utility methods for common interactions
  async click(page: Page, selector: string, options?: { timeout?: number }): Promise<boolean> {
    try {
      await page.click(selector, options);
      return true;
    } catch (error) {
      logger.warn({ selector, error }, 'Click failed');
      return false;
    }
  }

  async fill(page: Page, selector: string, text: string, options?: { timeout?: number }): Promise<boolean> {
    try {
      await page.fill(selector, text, options);
      return true;
    } catch (error) {
      logger.warn({ selector, error }, 'Fill failed');
      return false;
    }
  }

  async selectOption(page: Page, selector: string, value: string): Promise<boolean> {
    try {
      await page.selectOption(selector, value);
      return true;
    } catch (error) {
      logger.warn({ selector, error }, 'Select failed');
      return false;
    }
  }

  async waitForSelector(
    page: Page,
    selector: string,
    options?: { timeout?: number }
  ): Promise<boolean> {
    try {
      await page.waitForSelector(selector, options);
      return true;
    } catch (error) {
      logger.warn({ selector, error }, 'Selector not found');
      return false;
    }
  }

  async getPageContent(page: Page): Promise<string> {
    try {
      return await page.content();
    } catch (error) {
      logger.error({ error }, 'Failed to get page content');
      return '';
    }
  }

  async getPageUrl(page: Page): Promise<string> {
    return page.url();
  }

  async getPageTitle(page: Page): Promise<string> {
    try {
      return await page.title();
    } catch (error) {
      logger.warn({ error }, 'Failed to get page title');
      return '';
    }
  }
}
