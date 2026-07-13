import { createLogger } from '@job-copilot/shared';
import { Worker } from 'bullmq';
import { Redis } from 'redis';

const logger = createLogger('worker');

async function main() {
  logger.info('Job Copilot Worker starting...');

  // Connect to Redis
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  });

  redis.on('error', (err) => logger.error(err, 'Redis error'));
  redis.on('connect', () => logger.info('Connected to Redis'));

  // TODO: Initialize workers for:
  // - Discovery
  // - Enrichment
  // - Scoring
  // - Document generation
  // - Browser automation / application submission

  logger.info('Worker initialized and listening for jobs');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down worker...');
    await redis.quit();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error(err, 'Fatal error');
  process.exit(1);
});
