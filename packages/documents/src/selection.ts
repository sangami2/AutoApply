import { createLogger } from '@job-copilot/shared';

const logger = createLogger('documents:selection');

export interface SelectionPolicy {
  minimumScore: number;
  maximumApplications: number;
  oneApplicationPerCompany: boolean;
  requireEligibilityPassed: boolean;
}

export interface SelectableJob {
  id: string;
  company: string;
  normalizedCompany: string;
  title: string;
  finalScore: number;
  eligibilityPassed: boolean;
}

export interface SelectionResult {
  selected: SelectableJob[];
  rejected: Array<{
    job: SelectableJob;
    reason: string;
  }>;
  statistics: {
    evaluated: number;
    passedEligibility: number;
    passedScore: number;
    selectedCount: number;
    rejectedCount: number;
    companiesRepresented: number;
  };
}

export class JobSelector {
  constructor(private policy: SelectionPolicy) {}

  /**
   * Select jobs for application based on policy
   */
  selectJobs(candidates: SelectableJob[]): SelectionResult {
    logger.info(
      {
        candidates: candidates.length,
        policy: this.policy,
      },
      'Starting job selection'
    );

    const rejected: SelectionResult['rejected'] = [];
    const eligible: SelectableJob[] = [];

    // Filter candidates
    for (const job of candidates) {
      // Check eligibility requirement
      if (this.policy.requireEligibilityPassed && !job.eligibilityPassed) {
        rejected.push({
          job,
          reason: 'Did not pass eligibility gates',
        });
        continue;
      }

      // Check score threshold
      if (job.finalScore < this.policy.minimumScore) {
        rejected.push({
          job,
          reason: `Score ${job.finalScore.toFixed(1)} below minimum ${this.policy.minimumScore}`,
        });
        continue;
      }

      eligible.push(job);
    }

    // Sort by score descending
    eligible.sort((a, b) => b.finalScore - a.score);

    // Apply one-per-company constraint
    let selected: SelectableJob[] = [];
    const companiesUsed = new Set<string>();

    if (this.policy.oneApplicationPerCompany) {
      for (const job of eligible) {
        if (!companiesUsed.has(job.normalizedCompany)) {
          selected.push(job);
          companiesUsed.add(job.normalizedCompany);

          if (selected.length >= this.policy.maximumApplications) {
            break;
          }
        } else {
          rejected.push({
            job,
            reason: `Company already selected (${job.company})`,
          });
        }
      }
    } else {
      // Select top candidates by score without company constraint
      selected = eligible.slice(0, this.policy.maximumApplications);
      rejected.push(
        ...eligible
          .slice(this.policy.maximumApplications)
          .map((job) => ({
            job,
            reason: 'Exceeded maximum application limit',
          }))
      );
    }

    // Log statistics
    const passedEligibility = candidates.filter((j) => j.eligibilityPassed).length;
    const passedScore = candidates.filter((j) => j.finalScore >= this.policy.minimumScore)
      .length;

    const statistics = {
      evaluated: candidates.length,
      passedEligibility,
      passedScore,
      selectedCount: selected.length,
      rejectedCount: rejected.length,
      companiesRepresented: companiesUsed.size,
    };

    logger.info(statistics, 'Job selection complete');

    return { selected, rejected, statistics };
  }
}
