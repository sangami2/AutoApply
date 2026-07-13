import { createLogger, InterventionType } from '@job-copilot/shared';
import { PrismaClient } from '@job-copilot/database';

const logger = createLogger('interventions');

export interface InterventionRequest {
  type: InterventionType;
  applicationId: string;
  description: string;
  metadata?: Record<string, unknown>;
  screenshotPath?: string;
}

export interface InterventionQueue {
  id: string;
  applicationId: string;
  company: string;
  title: string;
  type: InterventionType;
  status: 'pending' | 'in-progress' | 'resolved' | 'skipped';
  createdAt: Date;
  resolvedAt?: Date;
}

export class InterventionManager {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Create an intervention request
   */
  async createIntervention(request: InterventionRequest): Promise<string> {
    logger.info(
      { type: request.type, applicationId: request.applicationId },
      'Creating intervention request'
    );

    try {
      const application = await this.prisma.application.findUnique({
        where: { id: request.applicationId },
        include: { job: true },
      });

      if (!application) {
        throw new Error('Application not found');
      }

      const intervention = await this.prisma.intervention.create({
        data: {
          applicationId: request.applicationId,
          type: request.type,
          description: request.description,
          metadata: request.metadata,
          screenshotPath: request.screenshotPath,
          status: 'PENDING',
        },
      });

      logger.info(
        { interventionId: intervention.id },
        'Intervention created'
      );

      return intervention.id;
    } catch (error) {
      logger.error({ error }, 'Failed to create intervention');
      throw error;
    }
  }

  /**
   * Get pending interventions
   */
  async getPendingInterventions(): Promise<InterventionQueue[]> {
    try {
      const interventions = await this.prisma.intervention.findMany({
        where: { status: 'PENDING' },
        include: {
          application: {
            include: { job: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return interventions.map((i) => ({
        id: i.id,
        applicationId: i.applicationId,
        company: i.application.job?.company || 'Unknown',
        title: i.application.job?.title || 'Unknown',
        type: i.type as InterventionType,
        status: i.status as 'pending' | 'in-progress' | 'resolved' | 'skipped',
        createdAt: i.createdAt,
        resolvedAt: i.respondedAt || undefined,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get pending interventions');
      return [];
    }
  }

  /**
   * Respond to intervention
   */
  async respondToIntervention(
    interventionId: string,
    response: string
  ): Promise<boolean> {
    logger.info(
      { interventionId },
      'Responding to intervention'
    );

    try {
      await this.prisma.intervention.update({
        where: { id: interventionId },
        data: {
          userResponse: response,
          respondedAt: new Date(),
          status: 'RESOLVED',
        },
      });

      logger.info({ interventionId }, 'Intervention resolved');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to respond to intervention');
      return false;
    }
  }

  /**
   * Skip intervention
   */
  async skipIntervention(interventionId: string): Promise<boolean> {
    logger.info({ interventionId }, 'Skipping intervention');

    try {
      await this.prisma.intervention.update({
        where: { id: interventionId },
        data: {
          status: 'SKIPPED',
          respondedAt: new Date(),
        },
      });

      logger.info({ interventionId }, 'Intervention skipped');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to skip intervention');
      return false;
    }
  }

  /**
   * Get intervention details
   */
  async getIntervention(interventionId: string): Promise<{
    id: string;
    type: InterventionType;
    description: string;
    metadata?: Record<string, unknown>;
    screenshot?: string;
    createdAt: Date;
  } | null> {
    try {
      const intervention = await this.prisma.intervention.findUnique({
        where: { id: interventionId },
      });

      if (!intervention) {
        return null;
      }

      return {
        id: intervention.id,
        type: intervention.type as InterventionType,
        description: intervention.description || '',
        metadata: intervention.metadata as Record<string, unknown> | undefined,
        screenshot: intervention.screenshotPath || undefined,
        createdAt: intervention.createdAt,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get intervention');
      return null;
    }
  }

  /**
   * Check if application is waiting for intervention
   */
  async isWaitingForIntervention(applicationId: string): Promise<boolean> {
    try {
      const pending = await this.prisma.intervention.findFirst({
        where: {
          applicationId,
          status: 'PENDING',
        },
      });

      return Boolean(pending);
    } catch (error) {
      logger.error({ error }, 'Failed to check intervention status');
      return false;
    }
  }

  /**
   * Get intervention statistics
   */
  async getStats(): Promise<{
    pending: number;
    resolved: number;
    skipped: number;
    byType: Record<string, number>;
  }> {
    try {
      const all = await this.prisma.intervention.findMany();

      const byType: Record<string, number> = {};
      for (const intervention of all) {
        byType[intervention.type] = (byType[intervention.type] || 0) + 1;
      }

      return {
        pending: all.filter((i) => i.status === 'PENDING').length,
        resolved: all.filter((i) => i.status === 'RESOLVED').length,
        skipped: all.filter((i) => i.status === 'SKIPPED').length,
        byType,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get statistics');
      return {
        pending: 0,
        resolved: 0,
        skipped: 0,
        byType: {},
      };
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export default InterventionManager;
