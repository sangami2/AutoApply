import { createLogger, ApplicationPolicy } from '@job-copilot/shared';

const logger = createLogger('evaluation:submission-policy');

export interface SubmissionCheckResult {
  name: string;
  passed: boolean;
  message: string;
}

export interface SubmissionPolicyResult {
  allowed: boolean;
  checks: SubmissionCheckResult[];
  recommendation: 'SUBMIT' | 'REVIEW' | 'SKIP';
  timestamp: Date;
}

export class SubmissionPolicyEngine {
  constructor(private policy: ApplicationPolicy) {}

  /**
   * Evaluate if application meets submission policy
   */
  evaluatePolicy(applicationData: {
    score: number;
    eligibilityPassed: boolean;
    validationPassed: boolean;
    hasUnknownAnswers: boolean;
    hasPendingChallenge: boolean;
    isDuplicate: boolean;
    hasCorrectDocuments: boolean;
    sponsorshipVerified: boolean;
    isApplicationAlreadySubmitted?: boolean;
  }): SubmissionPolicyResult {
    logger.info('Evaluating submission policy');

    const checks: SubmissionCheckResult[] = [];

    // Check 1: Score threshold
    const scoreCheck: SubmissionCheckResult = {
      name: 'Score Threshold',
      passed: applicationData.score >= this.policy.minimumScore,
      message: `Score ${applicationData.score.toFixed(1)} ${
        applicationData.score >= this.policy.minimumScore
          ? '>='
          : '<'
      } threshold ${this.policy.minimumScore}`,
    };
    checks.push(scoreCheck);

    // Check 2: Eligibility
    if (this.policy.requireAll?.eligibilityPassed) {
      const eligibilityCheck: SubmissionCheckResult = {
        name: 'Eligibility Passed',
        passed: applicationData.eligibilityPassed,
        message: applicationData.eligibilityPassed
          ? 'Passed eligibility gates'
          : 'Failed eligibility gates',
      };
      checks.push(eligibilityCheck);
    }

    // Check 3: Validation
    if (this.policy.requireAll?.validationPassed) {
      const validationCheck: SubmissionCheckResult = {
        name: 'Form Validation',
        passed: applicationData.validationPassed,
        message: applicationData.validationPassed
          ? 'Form validation passed'
          : 'Form validation failed',
      };
      checks.push(validationCheck);
    }

    // Check 4: No unknown answers
    if (this.policy.requireAll?.noUnknownAnswers) {
      const unknownCheck: SubmissionCheckResult = {
        name: 'No Unknown Answers',
        passed: !applicationData.hasUnknownAnswers,
        message: applicationData.hasUnknownAnswers
          ? 'Has unanswered questions'
          : 'All questions answered',
      };
      checks.push(unknownCheck);
    }

    // Check 5: No pending challenges
    if (this.policy.requireAll?.noPendingChallenge) {
      const challengeCheck: SubmissionCheckResult = {
        name: 'No Pending Challenges',
        passed: !applicationData.hasPendingChallenge,
        message: applicationData.hasPendingChallenge
          ? 'Pending OTP/MFA/CAPTCHA'
          : 'No pending challenges',
      };
      checks.push(challengeCheck);
    }

    // Check 6: Duplicate check
    if (this.policy.requireAll?.duplicateCheckPassed) {
      const duplicateCheck: SubmissionCheckResult = {
        name: 'Duplicate Check',
        passed: !applicationData.isDuplicate,
        message: applicationData.isDuplicate
          ? 'Already applied to company'
          : 'Not a duplicate',
      };
      checks.push(duplicateCheck);
    }

    // Check 7: Documents attached
    if (this.policy.requireAll?.correctDocumentsAttached) {
      const docsCheck: SubmissionCheckResult = {
        name: 'Documents Attached',
        passed: applicationData.hasCorrectDocuments,
        message: applicationData.hasCorrectDocuments
          ? 'Required documents present'
          : 'Missing required documents',
      };
      checks.push(docsCheck);
    }

    // Check 8: Sponsorship verified
    if (this.policy.requireAll?.sponsorshipAnswerVerified) {
      const sponsorshipCheck: SubmissionCheckResult = {
        name: 'Sponsorship Answer',
        passed: applicationData.sponsorshipVerified,
        message: applicationData.sponsorshipVerified
          ? 'Sponsorship verified'
          : 'Sponsorship not verified',
      };
      checks.push(sponsorshipCheck);
    }

    // Check 9: Not already submitted
    const notSubmittedCheck: SubmissionCheckResult = {
      name: 'Not Already Submitted',
      passed: !applicationData.isApplicationAlreadySubmitted,
      message: applicationData.isApplicationAlreadySubmitted
        ? 'Application already submitted'
        : 'First submission',
    };
    checks.push(notSubmittedCheck);

    // Determine if allowed
    const failedChecks = checks.filter((c) => !c.passed);
    const allowed =
      this.policy.submissionMode !== 'manual' && failedChecks.length === 0;

    // Determine recommendation
    let recommendation: 'SUBMIT' | 'REVIEW' | 'SKIP' = 'SKIP';

    if (failedChecks.length === 0) {
      recommendation = 'SUBMIT';
    } else if (failedChecks.length <= 2) {
      recommendation = 'REVIEW';
    } else {
      recommendation = 'SKIP';
    }

    // Check manual review requirements
    if (this.policy.manualReviewWhen && this.policy.manualReviewWhen.length > 0) {
      if (recommendation === 'SUBMIT') {
        recommendation = 'REVIEW'; // Force review if manual review is required
      }
    }

    logger.info(
      {
        allowed,
        recommendation,
        checksPassed: checks.length - failedChecks.length,
        checksFailed: failedChecks.length,
      },
      'Policy evaluation complete'
    );

    return {
      allowed: this.policy.submissionMode !== 'manual' ? allowed : false,
      checks,
      recommendation,
      timestamp: new Date(),
    };
  }

  /**
   * Check if should trigger manual review
   */
  shouldManualReview(reasons: string[]): boolean {
    if (
      !this.policy.manualReviewWhen ||
      this.policy.manualReviewWhen.length === 0
    ) {
      return false;
    }

    for (const reason of reasons) {
      if (this.policy.manualReviewWhen.includes(reason)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get policy description
   */
  describe(): string {
    return `
Submission Policy: ${this.policy.submissionMode.toUpperCase()}
- Minimum score: ${this.policy.minimumScore}
- Max applications: ${this.policy.maximumApplications}
- One per company: ${this.policy.oneApplicationPerCompany}
- Require eligibility: ${this.policy.requireAll?.eligibilityPassed ?? true}
- Require validation: ${this.policy.requireAll?.validationPassed ?? true}
- Manual review when: ${
      this.policy.manualReviewWhen?.join(', ') || 'never'
    }
    `.trim();
  }
}
