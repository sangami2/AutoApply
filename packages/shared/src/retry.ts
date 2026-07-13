import { createLogger } from './logging';

const logger = createLogger('retry');

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;
  let delayMs = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      logger.debug({ attempt }, 'Attempting operation');
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry =
        opts.shouldRetry?.(error, attempt) ?? true;

      if (!shouldRetry || attempt === opts.maxAttempts) {
        logger.error(
          { attempt, error },
          'Operation failed, no more retries'
        );
        throw error;
      }

      // Log and wait before retry
      logger.warn(
        { attempt, delayMs, error },
        'Operation failed, retrying'
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Exponential backoff
      delayMs = Math.min(
        delayMs * opts.backoffMultiplier,
        opts.maxDelayMs
      );
    }
  }

  throw lastError;
}

export function exponentialBackoffMs(
  attempt: number,
  baseMs: number = 1000,
  maxMs: number = 30000
): number {
  const delay = baseMs * Math.pow(2, attempt - 1);
  return Math.min(delay, maxMs);
}

export async function waitWithJitter(delayMs: number): Promise<void> {
  const jitter = Math.random() * 0.1 * delayMs;
  const totalDelay = delayMs + jitter;
  return new Promise((resolve) => setTimeout(resolve, totalDelay));
}

export class RateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private readonly refillRate: number;
  private readonly maxTokens: number;

  constructor(
    tokensPerSecond: number = 10,
    initialTokens?: number
  ) {
    this.refillRate = tokensPerSecond;
    this.maxTokens = tokensPerSecond;
    this.tokens = initialTokens ?? tokensPerSecond;
    this.lastRefillTime = Date.now();
  }

  async acquire(tokensNeeded: number = 1): Promise<void> {
    const now = Date.now();
    const timePassed = (now - this.lastRefillTime) / 1000;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + timePassed * this.refillRate
    );
    this.lastRefillTime = now;

    if (this.tokens < tokensNeeded) {
      const tokensNeeded = 1 - this.tokens;
      const waitTime = (tokensNeeded / this.refillRate) * 1000;
      logger.debug({ waitTime }, 'Rate limit: waiting');
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.tokens = 0;
      this.lastRefillTime = Date.now();
    } else {
      this.tokens -= tokensNeeded;
    }
  }

  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefillTime = Date.now();
  }
}
