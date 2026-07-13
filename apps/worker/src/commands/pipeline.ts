import { createLogger } from '@job-copilot/shared';

const logger = createLogger('pipeline');

async function main() {
  logger.info('Pipeline orchestration command');
  logger.info('TODO: Orchestrate full job discovery → scoring → selection → document generation → application workflow');
  // TODO: Implement orchestration that respects configuration and submission policy
}

main().catch((err) => {
  logger.error(err, 'Pipeline failed');
  process.exit(1);
});
