import { Workbook } from 'exceljs';
import { createLogger } from '@job-copilot/shared';
import { format } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';

const logger = createLogger('workbook');

export interface JobForExport {
  id: string;
  title: string;
  company: string;
  externalApplyUrl?: string;
  finalScore: number;
  tailoredSummary?: string;
  source: string;
  requisitionId?: string;
  postedAt: Date;
  atsProvider?: string;
  experienceScore: number;
  viabilityScore: number;
  sponsorshipStatus?: string;
  eligibilityStatus?: string;
  eligibilityReasons?: string[];
  scoreEvidence?: unknown;
}

export class JobWorkbookExporter {
  async exportJobs(
    jobs: JobForExport[],
    filePath: string,
    timezone: string = 'America/Chicago'
  ): Promise<void> {
    logger.info({ count: jobs.length, filePath }, 'Exporting jobs to workbook');

    const workbook = new Workbook();

    // Jobs sheet (visible)
    this.createJobsSheet(workbook, jobs, timezone);

    // Job data sheet (hidden)
    this.createJobDataSheet(workbook, jobs, timezone);

    // Applications sheet (for tracking)
    this.createApplicationsSheet(workbook);

    await workbook.xlsx.writeFile(filePath);
    logger.info({ filePath }, 'Workbook exported');
  }

  private createJobsSheet(
    workbook: Workbook,
    jobs: JobForExport[],
    timezone: string
  ): void {
    const sheet = workbook.addWorksheet('Jobs');

    // Header row
    sheet.columns = [
      { header: 'Job Title', key: 'jobTitle', width: 35 },
      { header: 'Company', key: 'company', width: 25 },
      { header: 'Link', key: 'link', width: 50 },
      { header: 'Match Score', key: 'score', width: 12 },
      { header: 'Tailored Resume Summary', key: 'summary', width: 50 },
    ];

    // Format header
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };

    // Add data rows
    for (const job of jobs) {
      sheet.addRow({
        jobTitle: job.title,
        company: job.company,
        link: job.externalApplyUrl || '',
        score: job.finalScore.toFixed(1),
        summary: job.tailoredSummary || '',
      });
    }

    // Format data rows
    for (let i = 2; i <= jobs.length + 1; i++) {
      const row = sheet.getRow(i);
      row.alignment = { wrapText: true, vertical: 'top' };

      // Score cell formatting
      const scoreCell = row.getCell(4);
      const score = parseFloat(String(scoreCell.value || 0));
      if (score >= 8) {
        scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
        scoreCell.font = { color: { argb: 'FF006100' } };
      } else if (score >= 7) {
        scoreCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
        scoreCell.font = { color: { argb: 'FF9C6500' } };
      }
      scoreCell.alignment = { horizontal: 'center' };

      // Link formatting
      const linkCell = row.getCell(3);
      if (linkCell.value) {
        linkCell.hyperlink = String(linkCell.value);
        linkCell.font = { underline: 'single', color: { argb: 'FF0563C1' } };
      }
    }

    // Auto-fit columns
    sheet.columns.forEach((col) => {
      col.width = Math.min(col.width || 20, 50);
    });

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  private createJobDataSheet(
    workbook: Workbook,
    jobs: JobForExport[],
    timezone: string
  ): void {
    const sheet = workbook.addWorksheet('Job Data', { hidden: true });

    sheet.columns = [
      { header: 'Job ID', key: 'id', width: 20 },
      { header: 'Source', key: 'source', width: 15 },
      { header: 'Source URL', key: 'sourceUrl', width: 50 },
      { header: 'External Apply URL', key: 'externalApplyUrl', width: 50 },
      { header: 'Requisition ID', key: 'requisitionId', width: 20 },
      { header: 'Posted Date', key: 'postedAt', width: 20 },
      { header: 'ATS Provider', key: 'atsProvider', width: 20 },
      { header: 'Experience Score', key: 'experienceScore', width: 15 },
      { header: 'Viability Score', key: 'viabilityScore', width: 15 },
      { header: 'Final Score', key: 'finalScore', width: 15 },
      { header: 'Sponsorship Status', key: 'sponsorshipStatus', width: 20 },
      { header: 'Eligibility Status', key: 'eligibilityStatus', width: 20 },
      { header: 'Eligibility Reasons', key: 'eligibilityReasons', width: 50 },
      { header: 'Score Evidence', key: 'scoreEvidence', width: 50 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

    for (const job of jobs) {
      const postedAt = job.postedAt
        ? format(utcToZonedTime(job.postedAt, timezone), 'yyyy-MM-dd HH:mm:ss zzz')
        : '';

      sheet.addRow({
        id: job.id,
        source: job.source,
        sourceUrl: job.externalApplyUrl || '',
        externalApplyUrl: job.externalApplyUrl || '',
        requisitionId: job.requisitionId || '',
        postedAt,
        atsProvider: job.atsProvider || 'Unknown',
        experienceScore: job.experienceScore?.toFixed(2) || 'N/A',
        viabilityScore: job.viabilityScore?.toFixed(2) || 'N/A',
        finalScore: job.finalScore.toFixed(2),
        sponsorshipStatus: job.sponsorshipStatus || 'UNKNOWN',
        eligibilityStatus: job.eligibilityStatus || 'UNKNOWN',
        eligibilityReasons: (job.eligibilityReasons || []).join('; '),
        scoreEvidence: job.scoreEvidence ? JSON.stringify(job.scoreEvidence) : '',
      });
    }
  }

  private createApplicationsSheet(workbook: Workbook): void {
    const sheet = workbook.addWorksheet('Applications');

    sheet.columns = [
      { header: 'Timestamp', key: 'timestamp', width: 20 },
      { header: 'Job Title', key: 'jobTitle', width: 35 },
      { header: 'Company', key: 'company', width: 25 },
      { header: 'Link', key: 'link', width: 50 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'ATS', key: 'ats', width: 15 },
      { header: 'Resume Used', key: 'resume', width: 20 },
      { header: 'Cover Letter Used', key: 'coverLetter', width: 20 },
      { header: 'Intervention Needed', key: 'intervention', width: 15 },
      { header: 'Submission Confirmation', key: 'confirmation', width: 25 },
      { header: 'Failure Reason', key: 'failure', width: 30 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
}

export default JobWorkbookExporter;
