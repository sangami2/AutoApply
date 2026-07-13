import { createLogger } from '@job-copilot/shared';
import { execa } from 'execa';

const logger = createLogger('pipeline');

async function main() {
  logger.info('Starting full pipeline: discover → enrich → score → generate → select');

  const startTime = Date.now();

  try {
    // Step 1: Discovery
    logger.info('Step 1/4: Job Discovery');
    await execa('npm', ['run', '--workspace=apps/worker', 'discovery'], {
      stdio: 'inherit',
    });
    logger.info('✅ Discovery complete');

    // Step 2: Scoring
    logger.info('Step 2/4: Job Scoring & Eligibility');
    await execa('npm', ['run', '--workspace=apps/worker', 'score'], {
      stdio: 'inherit',
    });
    logger.info('✅ Scoring complete');

    // Step 3: Document Generation
    logger.info('Step 3/4: Document Generation');
    await execa('npm', ['run', '--workspace=apps/worker', 'generate-documents'], {
      stdio: 'inherit',
    });
    logger.info('✅ Document generation complete');

    // Step 4: Export
    logger.info('Step 4/4: Excel Export');
    await execa('npm', ['run', '--workspace=apps/worker', 'export'], {
      stdio: 'inherit',
    });
    logger.info('✅ Export complete');

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.info(
      { elapsedSeconds: elapsed },
      'Pipeline complete'
    );

    console.log(`\n✅ Pipeline complete in ${elapsed}s`);
    console.log('📁 Output: output/job-search.xlsx');
    console.log('📄 Documents: output/applications/[company]/[job-id]/');
  } catch (error) {
    logger.error(error, 'Pipeline failed');
    throw error;
  }
}

main().catch((err) => {
  logger.error(err, 'Pipeline failed');
  process.exit(1);
});
