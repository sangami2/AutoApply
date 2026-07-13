import { createLogger } from '@job-copilot/shared';

const logger = createLogger('applications-dry-run');

async function main() {
  logger.info('Dry-run applications command - TODO: Implement browser automation');
  // TODO: Implement dry-run application workflow
}

main().catch((err) => {
  logger.error(err, 'Dry-run failed');
  process.exit(1);
});
