import { z } from 'zod';

export enum ErrorCategory {
  // Network errors (retryable)
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  DNS_ERROR = 'DNS_ERROR',

  // Rate limiting (retryable with backoff)
  RATE_LIMITED = 'RATE_LIMITED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // Transient errors (retryable)
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TEMPORARY_FAILURE = 'TEMPORARY_FAILURE',
  CONNECTION_RESET = 'CONNECTION_RESET',

  // Validation errors (not retryable)
  INVALID_INPUT = 'INVALID_INPUT',
  SCHEMA_VALIDATION_ERROR = 'SCHEMA_VALIDATION_ERROR',
  INVALID_URL = 'INVALID_URL',

  // Authentication errors (not retryable)
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',
  CREDENTIAL_INVALID = 'CREDENTIAL_INVALID',

  // Job-specific errors
  JOB_CLOSED = 'JOB_CLOSED',
  DUPLICATE_APPLICATION = 'DUPLICATE_APPLICATION',
  ALREADY_APPLIED = 'ALREADY_APPLIED',

  // ATS errors
  ATS_NOT_SUPPORTED = 'ATS_NOT_SUPPORTED',
  ATS_UNAVAILABLE = 'ATS_UNAVAILABLE',
  PORTAL_CHANGED = 'PORTAL_CHANGED',

  // Security errors
  SECURITY_BLOCKED = 'SECURITY_BLOCKED',
  CAPTCHA_REQUIRED = 'CAPTCHA_REQUIRED',
  MFA_REQUIRED = 'MFA_REQUIRED',

  // Application errors
  FORM_VALIDATION_ERROR = 'FORM_VALIDATION_ERROR',
  DOCUMENT_ERROR = 'DOCUMENT_ERROR',
  SUBMISSION_ERROR = 'SUBMISSION_ERROR',

  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface AppError {
  category: ErrorCategory;
  message: string;
  details?: unknown;
  timestamp: Date;
}

export function isRetryableError(category: ErrorCategory): boolean {
  const retryableCategories = [
    ErrorCategory.NETWORK_TIMEOUT,
    ErrorCategory.NETWORK_ERROR,
    ErrorCategory.DNS_ERROR,
    ErrorCategory.SERVICE_UNAVAILABLE,
    ErrorCategory.TEMPORARY_FAILURE,
    ErrorCategory.CONNECTION_RESET,
  ];

  return retryableCategories.includes(category);
}

export function isRateLimitError(category: ErrorCategory): boolean {
  return (
    category === ErrorCategory.RATE_LIMITED ||
    category === ErrorCategory.QUOTA_EXCEEDED
  );
}

export function classifyError(error: unknown): ErrorCategory {
  if (error instanceof z.ZodError) {
    return ErrorCategory.SCHEMA_VALIDATION_ERROR;
  }

  const errorMessage = String(error).toLowerCase();

  // Network errors
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out')
  ) {
    return ErrorCategory.NETWORK_TIMEOUT;
  }

  if (
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('connection reset')
  ) {
    return ErrorCategory.CONNECTION_RESET;
  }

  if (
    errorMessage.includes('enotfound') ||
    errorMessage.includes('getaddrinfo') ||
    errorMessage.includes('dns')
  ) {
    return ErrorCategory.DNS_ERROR;
  }

  if (
    errorMessage.includes('network') ||
    errorMessage.includes('socket')
  ) {
    return ErrorCategory.NETWORK_ERROR;
  }

  // Rate limiting
  if (
    errorMessage.includes('429') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many requests')
  ) {
    return ErrorCategory.RATE_LIMITED;
  }

  if (errorMessage.includes('quota')) {
    return ErrorCategory.QUOTA_EXCEEDED;
  }

  // Service errors
  if (
    errorMessage.includes('503') ||
    errorMessage.includes('unavailable') ||
    errorMessage.includes('service unavailable')
  ) {
    return ErrorCategory.SERVICE_UNAVAILABLE;
  }

  if (errorMessage.includes('502') || errorMessage.includes('bad gateway')) {
    return ErrorCategory.TEMPORARY_FAILURE;
  }

  // Authentication
  if (
    errorMessage.includes('401') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('invalid token')
  ) {
    return ErrorCategory.AUTHENTICATION_FAILED;
  }

  if (
    errorMessage.includes('403') ||
    errorMessage.includes('forbidden')
  ) {
    return ErrorCategory.AUTHORIZATION_FAILED;
  }

  // Validation
  if (errorMessage.includes('invalid') && errorMessage.includes('url')) {
    return ErrorCategory.INVALID_URL;
  }

  if (
    errorMessage.includes('validation') ||
    errorMessage.includes('invalid input')
  ) {
    return ErrorCategory.INVALID_INPUT;
  }

  // Job-specific
  if (
    errorMessage.includes('closed') ||
    errorMessage.includes('no longer accepting')
  ) {
    return ErrorCategory.JOB_CLOSED;
  }

  if (
    errorMessage.includes('duplicate') ||
    errorMessage.includes('already applied')
  ) {
    return ErrorCategory.DUPLICATE_APPLICATION;
  }

  // ATS
  if (errorMessage.includes('captcha')) {
    return ErrorCategory.CAPTCHA_REQUIRED;
  }

  if (errorMessage.includes('mfa') || errorMessage.includes('two factor')) {
    return ErrorCategory.MFA_REQUIRED;
  }

  return ErrorCategory.UNKNOWN_ERROR;
}

export const AppErrorSchema = z.object({
  category: z.nativeEnum(ErrorCategory),
  message: z.string(),
  details: z.unknown().optional(),
  timestamp: z.date(),
});

export type AppErrorType = z.infer<typeof AppErrorSchema>;
