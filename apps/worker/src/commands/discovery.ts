import { createLogger } from '@job-copilot/shared';

const logger = createLogger('discovery');

async function main() {
  logger.info('Discovery command - TODO: Implement Apify integration');
  // TODO: Implement discovery worker
}

main().catch((err) => {
  logger.error(err, 'Discovery failed');
  process.exit(1);
});
