import { createLogger } from '@job-copilot/shared';

const logger = createLogger('export');

async function main() {
  logger.info('Export command - TODO: Generate Excel workbook');
  // TODO: Implement Excel export
}

main().catch((err) => {
  logger.error(err, 'Export failed');
  process.exit(1);
});
