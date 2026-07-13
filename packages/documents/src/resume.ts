import { createLogger, ExperienceEntry, EducationEntry } from '@job-copilot/shared';
import { NormalizedJob } from '@job-copilot/discovery';
import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

const logger = createLogger('documents:resume');

export interface ResumeTailoringOptions {
  maxBullets?: number;
  targetKeywords?: string[];
  emphasisOnMetrics?: boolean;
}

export interface ResumeValidationReport {
  isValid: boolean;
  pageCount: number;
  wordCount: number;
  warnings: string[];
  errors: string[];
  claimsTraceability: Array<{
    claim: string;
    traceable: boolean;
    source?: string;
  }>;
  keywordCoverage: {
    matched: string[];
    unmatched: string[];
    coveragePercentage: number;
  };
}

export class ResumeGenerator {
  constructor(
    private masterTemplatePath: string,
    private experiences: ExperienceEntry[],
    private education: EducationEntry[],
    private skills: string[]
  ) {}

  /**
   * Generate a tailored resume for a specific job
   */
  async generateTailoredResume(
    job: NormalizedJob,
    outputDir: string,
    options: ResumeTailoringOptions = {}
  ): Promise<{
    texPath: string;
    pdfPath: string;
    validation: ResumeValidationReport;
  }> {
    logger.info(
      { company: job.company, title: job.title },
      'Generating tailored resume'
    );

    // Extract keywords from job description
    const keywords = this.extractKeywords(job.description || '', options.targetKeywords);
    logger.debug({ keywordCount: keywords.length }, 'Extracted keywords');

    // Select and tailor experiences
    const tailoredExperiences = this.selectRelevantExperiences(job, keywords, options);
    logger.debug(
      { selected: tailoredExperiences.length, total: this.experiences.length },
      'Selected experiences'
    );

    // Load and parse master template
    const templateContent = fs.readFileSync(this.masterTemplatePath, 'utf-8');

    // Generate LaTeX
    const resumeLatex = this.generateLatex(
      templateContent,
      tailoredExperiences,
      this.education,
      this.skills,
      keywords
    );

    // Create output directory if needed
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write .tex file
    const jobHandle = this.createJobHandle(job);
    const texPath = path.join(outputDir, `${jobHandle}-resume.tex`);
    fs.writeFileSync(texPath, resumeLatex);
    logger.info({ texPath }, 'Wrote LaTeX file');

    // Compile to PDF
    const pdfPath = path.join(outputDir, `${jobHandle}-resume.pdf`);
    await this.compilePdf(texPath, pdfPath);
    logger.info({ pdfPath }, 'Compiled PDF');

    // Validate
    const validation = await this.validateResume(
      pdfPath,
      resumeLatex,
      tailoredExperiences,
      keywords
    );
    logger.info({ valid: validation.isValid, warnings: validation.warnings.length }, 'Validation complete');

    if (!validation.isValid) {
      logger.warn({ errors: validation.errors }, 'Resume validation failed');
    }

    return { texPath, pdfPath, validation };
  }

  private extractKeywords(description: string, customKeywords?: string[]): string[] {
    const keywords = new Set<string>();

    // Add custom keywords
    if (customKeywords) {
      customKeywords.forEach((kw) => keywords.add(kw.toLowerCase()));
    }

    // Extract job-specific keywords
    const patterns = [
      /\b(product|roadmap|strategy|vision|planning|analytics|metrics|data|api|system|architecture|engineering|design|user|customer|feature|launch|release|cross-functional|stakeholder|requirement|specification|competitive|market|growth|retention|engagement|monetization)\b/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(description)) !== null) {
        keywords.add(match[1].toLowerCase());
      }
    }

    return Array.from(keywords).slice(0, 20); // Limit to top 20
  }

  private selectRelevantExperiences(
    job: NormalizedJob,
    keywords: string[],
    options: ResumeTailoringOptions
  ): ExperienceEntry[] {
    const keywordSet = new Set(keywords.map((k) => k.toLowerCase()));
    const jobDescLower = job.description?.toLowerCase() || '';

    // Score each experience for relevance
    const scored = this.experiences.map((exp) => {
      let score = 0;

      // Check if experience mentions any keywords
      const expText = `${exp.employer} ${exp.title} ${exp.description} ${(exp.responsibilities || []).join(' ')} ${(exp.skills || []).join(' ')}`.toLowerCase();

      for (const keyword of keywordSet) {
        if (expText.includes(keyword)) {
          score += 2;
        }
      }

      // Boost current or recent roles
      if (exp.current) score += 3;

      // Check for specific skill/responsibility matches
      for (const resp of exp.responsibilities || []) {
        if (keywordSet.has(resp.toLowerCase())) {
          score += 1;
        }
      }

      return { exp, score };
    });

    // Sort by relevance and take top experiences
    const maxBullets = options.maxBullets || 4;
    const selected = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxBullets)
      .map((s) => s.exp);

    return selected;
  }

  private generateLatex(
    masterTemplate: string,
    experiences: ExperienceEntry[],
    education: EducationEntry[],
    skills: string[],
    jobKeywords: string[]
  ): string {
    let latex = masterTemplate;

    // Replace experience section
    const experienceLatex = experiences
      .map((exp) => {
        const tailoredBullets = this.tailorBullets(
          exp.responsibilities || [],
          exp.skills || [],
          jobKeywords
        );

        return `\\resumeSubheading{${this.escapeLatex(exp.title)}}{${this.escapeLatex(exp.startDate)} - ${this.escapeLatex(exp.endDate || 'Present')}}
  {${this.escapeLatex(exp.employer)}}{}
\\begin{itemize}
${tailoredBullets.map((bullet) => `  \\resumeItem{${this.escapeLatex(bullet)}}`).join('\n')}
\\end{itemize}`;
      })
      .join('\n\n');

    latex = latex.replace(
      /% EXPERIENCE SECTION PLACEHOLDER[\s\S]*?% END EXPERIENCE SECTION/,
      `\\section{Experience}\n\\begin{itemize}[leftmargin=0.15in, label={}]\n${experienceLatex}\n\\end{itemize}`
    );

    // Replace skills section
    const skillsLatex = skills.slice(0, 15).join(', ');
    latex = latex.replace(
      /% SKILLS PLACEHOLDER/,
      `\\textbf{Key Skills}{: ${this.escapeLatex(skillsLatex)}}`
    );

    return latex;
  }

  private tailorBullets(
    originalBullets: string[],
    availableSkills: string[],
    jobKeywords: string[]
  ): string[] {
    const jobKeywordSet = new Set(jobKeywords.map((k) => k.toLowerCase()));

    // Score and reorder bullets based on keyword match
    const scored = originalBullets.map((bullet) => {
      let score = 0;
      const bulletLower = bullet.toLowerCase();

      for (const keyword of jobKeywordSet) {
        if (bulletLower.includes(keyword)) {
          score += 1;
        }
      }

      // Keep metrics visible
      if (/\d+%|\+\d+/.test(bullet)) {
        score += 2;
      }

      return { bullet, score };
    });

    // Sort by relevance and return top 4
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((s) => s.bullet);
  }

  private async compilePdf(texPath: string, pdfPath: string): Promise<void> {
    const texDir = path.dirname(texPath);
    const texFile = path.basename(texPath);

    try {
      // Try xelatex first (supports modern fonts)
      await execa('xelatex', ['-interaction=nonstopmode', texFile], {
        cwd: texDir,
      });

      // Rename output
      const auxName = texFile.replace(/\.tex$/, '.pdf');
      const auxPath = path.join(texDir, auxName);
      if (fs.existsSync(auxPath)) {
        fs.copyFileSync(auxPath, pdfPath);
      }

      logger.debug({ texPath, pdfPath }, 'PDF compiled with xelatex');
    } catch (xerror) {
      logger.debug('xelatex not available, trying pdflatex');

      try {
        // Fall back to pdflatex
        await execa('pdflatex', ['-interaction=nonstopmode', texFile], {
          cwd: texDir,
        });

        const auxName = texFile.replace(/\.tex$/, '.pdf');
        const auxPath = path.join(texDir, auxName);
        if (fs.existsSync(auxPath)) {
          fs.copyFileSync(auxPath, pdfPath);
        }

        logger.debug({ texPath, pdfPath }, 'PDF compiled with pdflatex');
      } catch (perror) {
        throw new Error(`Failed to compile LaTeX: ${String(xerror)} / ${String(perror)}`);
      }
    }

    // Clean up temporary files
    this.cleanupLatexArtifacts(texDir, texFile);
  }

  private cleanupLatexArtifacts(dir: string, baseFile: string): void {
    const baseName = baseFile.replace(/\.tex$/, '');
    const artifacts = ['.aux', '.log', '.out'];

    for (const ext of artifacts) {
      const filePath = path.join(dir, baseName + ext);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }

  private async validateResume(
    pdfPath: string,
    latexContent: string,
    selectedExperiences: ExperienceEntry[],
    jobKeywords: string[]
  ): Promise<ResumeValidationReport> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const claimsTraceability: ResumeValidationReport['claimsTraceability'] = [];

    // Check PDF exists
    if (!fs.existsSync(pdfPath)) {
      errors.push('PDF file not created');
      return {
        isValid: false,
        pageCount: 0,
        wordCount: 0,
        warnings,
        errors,
        claimsTraceability,
        keywordCoverage: { matched: [], unmatched: [], coveragePercentage: 0 },
      };
    }

    // Count pages (basic check - look for page breaks in LaTeX)
    const pageCount = (latexContent.match(/\\newpage|\\pagebreak/g) || []).length + 1;
    if (pageCount > 1) {
      errors.push(`Resume is ${pageCount} pages (must be 1 page)`);
    }

    // Count approximate words
    const wordCount = latexContent.split(/\s+/).length;
    if (wordCount > 600) {
      warnings.push(`Resume is approximately ${wordCount} words (consider condensing)`);
    }

    // Check claims traceability
    for (const exp of selectedExperiences) {
      for (const bullet of exp.responsibilities || []) {
        claimsTraceability.push({
          claim: bullet,
          traceable: true,
          source: `${exp.employer} - ${exp.title}`,
        });
      }
    }

    // Check keyword coverage
    const jobKeywordSet = new Set(jobKeywords.map((k) => k.toLowerCase()));
    const contentLower = latexContent.toLowerCase();
    const matched: string[] = [];
    const unmatched: string[] = [];

    for (const keyword of jobKeywordSet) {
      if (contentLower.includes(keyword)) {
        matched.push(keyword);
      } else {
        unmatched.push(keyword);
      }
    }

    const coveragePercentage = jobKeywords.length > 0
      ? Math.round((matched.length / jobKeywords.length) * 100)
      : 100;

    if (coveragePercentage < 50) {
      warnings.push(`Low keyword coverage: ${coveragePercentage}% (${matched.length}/${jobKeywords.length})`);
    }

    return {
      isValid: errors.length === 0,
      pageCount,
      wordCount,
      warnings,
      errors,
      claimsTraceability,
      keywordCoverage: {
        matched,
        unmatched,
        coveragePercentage,
      },
    };
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
