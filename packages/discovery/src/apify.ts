import { ApifyClient } from '@apify/client';
import { createLogger } from '@job-copilot/shared';

const logger = createLogger('discovery:apify');

interface ActorInput {
  [key: string]: unknown;
}

interface ActorRun {
  id: string;
  status: string;
  datasetId: string;
  startedAt: string;
  finishedAt: string | null;
}

export class ApifyDiscoveryClient {
  private client: ApifyClient;
  private actorId: string;

  constructor(token: string, actorId: string) {
    this.client = new ApifyClient({ token });
    this.actorId = actorId;
  }

  async runActor(input: ActorInput): Promise<ActorRun> {
    logger.info({ actorId: this.actorId }, 'Starting actor run');

    try {
      const run = await this.client.actor(this.actorId).call(input);

      logger.info(
        {
          actorId: this.actorId,
          runId: run.id,
          status: run.status,
          datasetId: run.datasetId,
        },
        'Actor run completed'
      );

      return {
        id: run.id,
        status: run.status,
        datasetId: run.datasetId || '',
        startedAt: run.startedAt || new Date().toISOString(),
        finishedAt: run.finishedAt || null,
      };
    } catch (error) {
      logger.error({ actorId: this.actorId, error }, 'Actor run failed');
      throw error;
    }
  }

  async getDataset(datasetId: string): Promise<unknown[]> {
    logger.info({ datasetId }, 'Fetching dataset');

    try {
      const items: unknown[] = [];
      await this.client.dataset(datasetId).forEachItem((item) => {
        items.push(item);
      });

      logger.info({ datasetId, count: items.length }, 'Dataset fetched');
      return items;
    } catch (error) {
      logger.error({ datasetId, error }, 'Failed to fetch dataset');
      throw error;
    }
  }

  async monitorRun(runId: string): Promise<ActorRun> {
    logger.info({ runId }, 'Monitoring actor run');

    try {
      const run = await this.client.run(runId).get();

      if (!run) {
        throw new Error(`Run ${runId} not found`);
      }

      const status = run.status;
      logger.info({ runId, status }, 'Run status');

      return {
        id: run.id,
        status,
        datasetId: run.datasetId || '',
        startedAt: run.startedAt || new Date().toISOString(),
        finishedAt: run.finishedAt || null,
      };
    } catch (error) {
      logger.error({ runId, error }, 'Failed to monitor run');
      throw error;
    }
  }
}
