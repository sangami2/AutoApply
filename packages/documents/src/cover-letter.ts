import { createLogger, ExperienceEntry } from '@job-copilot/shared';
import { NormalizedJob } from '@job-copilot/discovery';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

const logger = createLogger('documents:cover-letter');

export interface CoverLetterGenerationOptions {
  required?: boolean;
  highValueThreshold?: number;
  includeMetrics?: boolean;
}

export class CoverLetterGenerator {
  constructor(
    private experiences: ExperienceEntry[],
    private candidateName: string,
    private candidateEmail: string
  ) {}

  /**
   * Determine if cover letter is needed
   */
  shouldGenerateCoverLetter(
    job: NormalizedJob,
    score: number,
    options: CoverLetterGenerationOptions = {}
  ): boolean {
    // Skip if explicitly not required
    if (options.required === false) {
      return false;
    }

    // Generate for high-value opportunities (score >= threshold)
    const threshold = options.highValueThreshold || 8.0;
    if (score >= threshold) {
      return true;
    }

    // Check if job description asks for cover letter
    if (job.description) {
      const description = job.description.toLowerCase();
      if (
        description.includes('cover letter') ||
        description.includes('motivation') ||
        description.includes('letter of interest')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate a targeted cover letter
   */
  generateCoverLetter(
    job: NormalizedJob,
    relevantExperiences: ExperienceEntry[],
    outputDir: string,
    options: CoverLetterGenerationOptions = {}
  ): { texPath: string; pdfPath: string; content: string } {
    logger.info(
      { company: job.company, title: job.title },
      'Generating cover letter'
    );

    // Extract role requirements
    const requirements = this.extractRequirements(job.description || '');

    // Select most relevant experiences
    const topExperiences = this.selectTopExperiences(relevantExperiences, requirements, 2);

    // Generate cover letter content
    const content = this.generateContent(
      job,
      topExperiences,
      requirements,
      options
    );

    // Create LaTeX wrapper
    const latex = this.wrapInLatex(content);

    // Write files
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const jobHandle = this.createJobHandle(job);
    const texPath = path.join(outputDir, `${jobHandle}-cover-letter.tex`);
    const pdfPath = path.join(outputDir, `${jobHandle}-cover-letter.pdf`);

    fs.writeFileSync(texPath, latex);
    logger.info({ texPath }, 'Wrote cover letter');

    return { texPath, pdfPath, content };
  }

  private extractRequirements(description: string): string[] {
    const requirements: string[] = [];

    // Extract bullet points or requirements
    const lines = description.split('\n').filter((line) => line.trim());
    for (const line of lines) {
      if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
        const req = line.replace(/^[-•]\s*/, '').trim();
        if (req.length > 10 && req.length < 150) {
          requirements.push(req);
        }
      }
    }

    return requirements.slice(0, 10);
  }

  private selectTopExperiences(
    experiences: ExperienceEntry[],
    requirements: string[],
    count: number
  ): ExperienceEntry[] {
    const reqSet = new Set(requirements.map((r) => r.toLowerCase()));

    // Score experiences
    const scored = experiences.map((exp) => {
      let score = 0;

      const expText = `${exp.title} ${exp.description} ${(exp.responsibilities || []).join(' ')}`.toLowerCase();

      // Check requirement matches
      for (const req of reqSet) {
        const reqLower = req.toLowerCase();
        if (expText.includes(reqLower)) {
          score += 2;
        }
      }

      // Recent roles score higher
      if (exp.current) score += 3;

      return { exp, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map((s) => s.exp);
  }

  private generateContent(
    job: NormalizedJob,
    experiences: ExperienceEntry[],
    requirements: string[],
    options: CoverLetterGenerationOptions
  ): string {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Extract company contact (placeholder)
    const hiringTeam = 'Hiring Team';

    // Generate opening
    const opening = this.generateOpening(job);

    // Generate body highlighting relevant experience
    const body = this.generateBody(job, experiences, requirements);

    // Generate closing
    const closing = `I'm excited about the opportunity to bring my product leadership expertise to ${job.company}, and I'd welcome the chance to discuss how my background aligns with your needs. Thank you for considering my application.`;

    return `${dateStr}

Dear ${hiringTeam},

${opening}

${body}

${closing}

Sincerely,
${this.candidateName}
${this.candidateEmail}`;
  }

  private generateOpening(job: NormalizedJob): string {
    const openings = [
      `I'm writing to express my strong interest in the ${job.title} position at ${job.company}. With my background in product management and deep understanding of ${this.extractDomain(job.description || '')}, I'm confident I can make significant contributions to your team.`,
      `The ${job.title} role at ${job.company} presents an exciting opportunity to apply my product leadership experience. I'm particularly drawn to your work in ${this.extractDomain(job.description || '')}, and I'm eager to contribute to your vision.`,
      `I'm interested in the ${job.title} position at ${job.company}. Your focus on ${this.extractDomain(job.description || '')} aligns perfectly with my professional experience and career goals.`,
    ];

    return openings[Math.floor(Math.random() * openings.length)];
  }

  private generateBody(
    job: NormalizedJob,
    experiences: ExperienceEntry[],
    requirements: string[]
  ): string {
    const paragraphs: string[] = [];

    // Paragraph 1: Why the company and role
    if (experiences.length > 0) {
      const topExp = experiences[0];
      paragraphs.push(
        `My experience at ${topExp.employer} leading ${topExp.title} work has prepared me well for this role. ` +
          `I've successfully managed cross-functional teams, driven product strategy, and delivered impact at scale. ` +
          `These experiences have deepened my understanding of the skills required for success in this position.`
      );
    }

    // Paragraph 2: Specific skills/experience
    if (experiences.length > 1) {
      const secondExp = experiences[1];
      paragraphs.push(
        `In addition to my direct product management background, my time at ${secondExp.employer} ` +
          `provided me with technical depth and the ability to communicate effectively with engineering teams. ` +
          `I'm skilled at bridging product vision with technical execution—a key requirement for your team.`
      );
    }

    // Paragraph 3: Product philosophy
    paragraphs.push(
      `I believe in product-led growth, user-centered design, and data-informed decision making. ` +
        `I'm committed to understanding user needs deeply, iterating rapidly, and measuring what matters. ` +
        `I'd bring this mindset to ${job.company} and work collaboratively to build products users love.`
    );

    return paragraphs.join('\n\n');
  }

  private extractDomain(description: string): string {
    const domains: Record<string, string[]> = {
      'AI/ML': ['ai', 'machine learning', 'artificial intelligence', 'deep learning', 'llm'],
      'Creator economy': ['creator', 'creator economy', 'creator monetization', 'creatives'],
      'Marketplace': ['marketplace', 'marketplace platform', 'supply-demand'],
      'B2B': ['b2b', 'enterprise', 'saas', 'business'],
      'Data': ['data', 'analytics', 'analytics platform', 'insights'],
      'Platform': ['platform', 'infrastructure', 'developer platform'],
    };

    const descLower = description.toLowerCase();

    for (const [domain, keywords] of Object.entries(domains)) {
      for (const keyword of keywords) {
        if (descLower.includes(keyword)) {
          return domain;
        }
      }
    }

    return 'technology';
  }

  private wrapInLatex(content: string): string {
    return `\\documentclass[11pt,letterpaper]{article}

\\usepackage[margin=1in]{geometry}
\\usepackage{fontspec}
\\usepackage[hidelinks]{hyperref}

\\setmainfont{Calibri}
\\raggedbottom
\\raggedright

\\begin{document}

\\begin{flushleft}
${this.escapeLatex(content).replace(/\n\n/g, '\n\n\\vspace{6pt}\\noindent ')}
\\end{flushleft}

\\end{document}`;
  }

  private escapeLatex(text: string): string {
    return text
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/[&%$#_{}~^]/g, (char) => `\\${char}`)
      .replace(/</g, '\\textless{}')
      .replace(/>/g, '\\textgreater{}');
  }

  private createJobHandle(job: NormalizedJob): string {
    const company = job.normalizedCompany.replace(/\s+/g, '-').slice(0, 15);
    const hash = createHash('md5').update(job.sourceJobId).digest('hex').slice(0, 8);
    return `${company}-${hash}`;
  }
}
