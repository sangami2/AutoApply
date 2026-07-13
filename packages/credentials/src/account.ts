import { createLogger } from '@job-copilot/shared';
import { PrismaClient } from '@job-copilot/database';
import { Page } from 'playwright';
import { CredentialProvider, CredentialRef, CredentialProviderFactory } from './provider';

const logger = createLogger('credentials:account');

export interface AccountInfo {
  email: string;
  password: string;
}

export interface AccountCreationResult {
  success: boolean;
  accountId?: string;
  message: string;
  requiresVerification?: boolean;
}

export interface LoginResult {
  success: boolean;
  accountId?: string;
  requiresMFA?: boolean;
  message: string;
}

export class AccountManager {
  private credentialProvider: CredentialProvider;
  private prisma: PrismaClient;

  constructor(credentialProviderType: string = 'vault') {
    this.credentialProvider = CredentialProviderFactory.create(credentialProviderType);
    this.prisma = new PrismaClient();
  }

  /**
   * Get or create account for an employer/ATS tenant
   */
  async getOrCreateAccount(
    page: Page,
    employerDomain: string,
    atsTenant: string,
    atsProvider: string,
    email: string
  ): Promise<AccountCreationResult> {
    logger.info(
      { employerDomain, atsTenant, atsProvider },
      'Getting or creating account'
    );

    try {
      // Check if account exists
      const existingAccount = await this.prisma.account.findFirst({
        where: {
          employerDomain,
          atsTenant,
          email,
        },
      });

      if (existingAccount) {
        logger.info({ accountId: existingAccount.id }, 'Account already exists');

        // Try to login
        const loginResult = await this.attemptLogin(
          page,
          existingAccount,
          email
        );

        if (loginResult.success) {
          return {
            success: true,
            accountId: existingAccount.id,
            message: 'Logged into existing account',
          };
        }

        // If login fails, may need password recovery
        logger.warn('Login to existing account failed');
      }

      // Create new account
      return await this.createAccount(
        page,
        employerDomain,
        atsTenant,
        atsProvider,
        email
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get or create account');
      return {
        success: false,
        message: `Account error: ${String(error)}`,
      };
    }
  }

  /**
   * Create a new account
   */
  private async createAccount(
    page: Page,
    employerDomain: string,
    atsTenant: string,
    atsProvider: string,
    email: string
  ): Promise<AccountCreationResult> {
    logger.info(
      { employerDomain, atsProvider },
      'Creating new account'
    );

    try {
      // Generate password
      const password = await this.credentialProvider.generatePassword();

      // Look for account creation form
      const createAccountLink = await page.$(
        'a:has-text("Create account"), a:has-text("Sign up"), button:has-text("Create account")'
      );

      if (createAccountLink) {
        await createAccountLink.click();
        await page.waitForTimeout(1000);
      }

      // Try to fill email field
      const emailInput = await page.$('input[type="email"]');
      if (emailInput) {
        await emailInput.fill(email);
      }

      // Try to fill password field
      const passwordInput = await page.$('input[type="password"]');
      if (passwordInput) {
        await passwordInput.fill(password);
      }

      // Look for submit button
      const submitButton = await page.$(
        'button[type="submit"], button:has-text("Create"), button:has-text("Sign up")'
      );

      if (submitButton) {
        await submitButton.click();
        await page.waitForTimeout(2000);
      }

      // Store credential
      const credentialRef = await this.credentialProvider.store(
        `${employerDomain}-${email}`,
        email,
        password
      );

      // Create database record
      const account = await this.prisma.account.create({
        data: {
          employerDomain,
          atsTenant,
          atsProvider,
          email,
          credentialId: credentialRef.id,
          accountStatus: 'CREATED',
          createdVia: 'AUTOMATED',
        },
      });

      logger.info({ accountId: account.id }, 'Account created');

      // Check if email verification is needed
      const requiresVerification = await this.checkEmailVerification(page);

      return {
        success: true,
        accountId: account.id,
        message: 'Account created successfully',
        requiresVerification,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create account');
      return {
        success: false,
        message: `Account creation failed: ${String(error)}`,
        requiresVerification: true,
      };
    }
  }

  /**
   * Attempt to login to existing account
   */
  private async attemptLogin(
    page: Page,
    account: any,
    email: string
  ): Promise<LoginResult> {
    logger.info({ accountId: account.id }, 'Attempting login');

    try {
      // Retrieve credential
      const credential = await this.credentialProvider.retrieve({
        id: account.credentialId,
        provider: 'vault',
        vaultName: account.credentialId,
      });

      if (!credential) {
        return {
          success: false,
          message: 'Could not retrieve credential',
        };
      }

      // Look for login form
      const emailInput = await page.$('input[type="email"], input[name*="email"]');
      if (emailInput) {
        await emailInput.fill(email);
      }

      const passwordInput = await page.$('input[type="password"], input[name*="password"]');
      if (passwordInput) {
        await passwordInput.fill(credential.password);
      }

      const submitButton = await page.$('button[type="submit"]');
      if (submitButton) {
        await submitButton.click();
        await page.waitForTimeout(2000);
      }

      // Check for success
      const errorMessage = await page.$('[role="alert"], .error, .validation-error');
      if (errorMessage) {
        return {
          success: false,
          accountId: account.id,
          requiresMFA: true,
          message: 'Login requires MFA or verification',
        };
      }

      // Update last login
      await this.prisma.account.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        success: true,
        accountId: account.id,
        message: 'Login successful',
      };
    } catch (error) {
      logger.error({ error }, 'Login failed');
      return {
        success: false,
        accountId: account.id,
        message: `Login failed: ${String(error)}`,
      };
    }
  }

  /**
   * Check if email verification is required
   */
  private async checkEmailVerification(page: Page): Promise<boolean> {
    try {
      const content = await page.content();

      const verificationRequired =
        content.includes('verify email') ||
        content.includes('verification link') ||
        content.includes('confirm email') ||
        content.includes('check your email');

      return verificationRequired;
    } catch (error) {
      logger.warn({ error }, 'Could not check email verification');
      return false;
    }
  }

  /**
   * Handle OTP verification
   */
  async handleOTP(
    page: Page,
    accountId: string,
    otpCode?: string
  ): Promise<{ success: boolean; message: string }> {
    logger.info({ accountId }, 'Handling OTP');

    try {
      // Look for OTP input field
      const otpInput = await page.$('input[name*="otp"], input[name*="code"], input[placeholder*="OTP"]');

      if (!otpInput) {
        return {
          success: false,
          message: 'OTP input field not found',
        };
      }

      if (otpCode) {
        await otpInput.fill(otpCode);

        const submitButton = await page.$('button[type="submit"]');
        if (submitButton) {
          await submitButton.click();
          await page.waitForTimeout(2000);
        }

        return {
          success: true,
          message: 'OTP submitted',
        };
      }

      return {
        success: false,
        message: 'OTP code required',
      };
    } catch (error) {
      logger.error({ error }, 'OTP handling failed');
      return {
        success: false,
        message: `OTP error: ${String(error)}`,
      };
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export default AccountManager;
