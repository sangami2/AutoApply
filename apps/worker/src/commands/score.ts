import { createLogger } from '@job-copilot/shared';

const logger = createLogger('score');

async function main() {
  logger.info('Scoring command - TODO: Implement scoring engine');
  // TODO: Implement scoring worker
}

main().catch((err) => {
  logger.error(err, 'Scoring failed');
  process.exit(1);
});
