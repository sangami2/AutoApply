export enum ApplicationState {
  DISCOVERED = 'DISCOVERED',
  ENRICHMENT_PENDING = 'ENRICHMENT_PENDING',
  ENRICHED = 'ENRICHED',
  ELIGIBILITY_PENDING = 'ELIGIBILITY_PENDING',
  ELIGIBILITY_PASSED = 'ELIGIBILITY_PASSED',
  ELIGIBILITY_FAILED = 'ELIGIBILITY_FAILED',
  SCORING_PENDING = 'SCORING_PENDING',
  SCORED = 'SCORED',
  SELECTED = 'SELECTED',
  DOCUMENTS_PENDING = 'DOCUMENTS_PENDING',
  DOCUMENTS_READY = 'DOCUMENTS_READY',
  APPLICATION_QUEUED = 'APPLICATION_QUEUED',
  APPLICATION_OPENED = 'APPLICATION_OPENED',
  ACCOUNT_REQUIRED = 'ACCOUNT_REQUIRED',
  ACCOUNT_READY = 'ACCOUNT_READY',
  FORM_INSPECTION_PENDING = 'FORM_INSPECTION_PENDING',
  FORM_FILLING = 'FORM_FILLING',
  WAITING_FOR_OTP = 'WAITING_FOR_OTP',
  WAITING_FOR_MFA = 'WAITING_FOR_MFA',
  WAITING_FOR_CAPTCHA = 'WAITING_FOR_CAPTCHA',
  WAITING_FOR_ANSWER = 'WAITING_FOR_ANSWER',
  WAITING_FOR_REVIEW = 'WAITING_FOR_REVIEW',
  VALIDATION_PENDING = 'VALIDATION_PENDING',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  READY_TO_SUBMIT = 'READY_TO_SUBMIT',
  SUBMITTING = 'SUBMITTING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum InterventionType {
  OTP = 'OTP',
  MFA = 'MFA',
  CAPTCHA = 'CAPTCHA',
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  UNKNOWN_QUESTION = 'UNKNOWN_QUESTION',
  LEGAL_QUESTION = 'LEGAL_QUESTION',
  WORK_AUTHORIZATION_QUESTION = 'WORK_AUTHORIZATION_QUESTION',
  SALARY_QUESTION = 'SALARY_QUESTION',
  PORTAL_MISMATCH = 'PORTAL_MISMATCH',
  DOCUMENT_VALIDATION_FAILURE = 'DOCUMENT_VALIDATION_FAILURE',
  FINAL_REVIEW = 'FINAL_REVIEW',
  UNRECOVERABLE_ADAPTER_FAILURE = 'UNRECOVERABLE_ADAPTER_FAILURE',
}

export enum SponsorshipStatus {
  SUPPORTED = 'SUPPORTED',
  LIKELY_SUPPORTED = 'LIKELY_SUPPORTED',
  UNKNOWN = 'UNKNOWN',
  LIKELY_UNSUPPORTED = 'LIKELY_UNSUPPORTED',
  EXPLICITLY_UNSUPPORTED = 'EXPLICITLY_UNSUPPORTED',
}

export enum ErrorCategory {
  NETWORK_ERROR = 'NETWORK_ERROR',
  ACTOR_ERROR = 'ACTOR_ERROR',
  DATA_VALIDATION_ERROR = 'DATA_VALIDATION_ERROR',
  JOB_CLOSED = 'JOB_CLOSED',
  ATS_NOT_SUPPORTED = 'ATS_NOT_SUPPORTED',
  PORTAL_CHANGED = 'PORTAL_CHANGED',
  LOGIN_FAILED = 'LOGIN_FAILED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  OTP_REQUIRED = 'OTP_REQUIRED',
  MFA_REQUIRED = 'MFA_REQUIRED',
  CAPTCHA_REQUIRED = 'CAPTCHA_REQUIRED',
  UNKNOWN_QUESTION = 'UNKNOWN_QUESTION',
  DOCUMENT_ERROR = 'DOCUMENT_ERROR',
  FORM_VALIDATION_ERROR = 'FORM_VALIDATION_ERROR',
  POLICY_REJECTED = 'POLICY_REJECTED',
  DUPLICATE_APPLICATION = 'DUPLICATE_APPLICATION',
  SUBMISSION_ERROR = 'SUBMISSION_ERROR',
  CONFIRMATION_MISSING = 'CONFIRMATION_MISSING',
}

export enum SubmissionMode {
  MANUAL = 'manual',
  REVIEWED_AUTO = 'reviewed-auto',
  AUTOMATIC = 'automatic',
}

export interface JobData {
  id: string;
  source: string;
  sourceJobId: string;
  title: string;
  normalizedTitle: string;
  company: string;
  normalizedCompany: string;
  location: string;
  remoteType?: string;
  employmentType?: string;
  salaryText?: string;
  postedAt: Date;
  discoveredAt: Date;
  listingUrl: string;
  externalApplyUrl?: string;
  description?: string;
  descriptionHash?: string;
  requisitionId?: string;
  atsProvider?: string;
  isOpen: boolean;
}

export interface ScoringResult {
  experienceScore: number;
  viabilityScore: number;
  finalScore: number;
  recommendation: 'APPLY' | 'REVIEW' | 'SKIP';
  matchedEvidence: Array<{
    category: string;
    evidence: string;
    weight: number;
  }>;
  gaps: Array<{
    requirement: string;
    evidence: string | null;
  }>;
  sponsorshipStatus: SponsorshipStatus;
  confidence: number;
}

export interface WorkflowEvent {
  eventId: string;
  timestamp: Date;
  workflowId: string;
  jobId?: string;
  applicationId?: string;
  company?: string;
  role?: string;
  requisitionId?: string;
  eventType: string;
  previousState?: string;
  newState?: string;
  safeMetadata?: Record<string, unknown>;
  errorCategory?: string;
  errorMessage?: string;
}
