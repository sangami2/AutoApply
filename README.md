# Job Application Copilot

A production-quality, local-first application for discovering, evaluating, tailoring, and submitting job applications intelligently. Built with TypeScript, Node.js, Next.js, Playwright, PostgreSQL, and Redis.

## Features

✅ **Job Discovery**: Apify integration for LinkedIn and Indeed job discovery with configurable search criteria

✅ **Intelligent Scoring**: Evidence-based job matching against verified candidate experience with detailed rubric

✅ **Document Generation**: Tailored one-page LaTeX resumes and cover letters for each target job

✅ **Smart Application**: Browser automation with multiple ATS support (Greenhouse, Lever, Ashby, Workday)

✅ **Human-in-the-Loop**: Pause for OTP, MFA, CAPTCHA, unknown questions with resumable workflows

✅ **Audit Logging**: Complete application history with timestamps, screenshots, and confirmations

✅ **Policy-Driven Submission**: Configurable submission modes (manual, reviewed-auto, automatic)

✅ **Credential Security**: 1Password integration with fallback to macOS Keychain or encrypted vault

✅ **Controlled Parallelism**: BullMQ-based work queues with configurable concurrency per stage

✅ **Resume-Parsing Correction**: Automatic detection and correction of ATS parsing errors

✅ **Duplicate Prevention**: Multi-strategy deduplication and one-application-per-company enforcement

## Architecture

```
job-application-copilot/
├── apps/
│   ├── dashboard/          # Next.js dashboard UI
│   └── worker/             # Job orchestration & CLI commands
├── packages/
│   ├── database/           # Prisma ORM & schema
│   ├── shared/             # Shared types, schemas, logging
│   ├── ai/                 # LLM abstraction (TODO)
│   ├── discovery/          # Apify integration (TODO)
│   ├── evaluation/         # Eligibility & scoring (TODO)
│   ├── documents/          # Resume & cover letter generation (TODO)
│   ├── browser/            # Playwright wrapper (TODO)
│   ├── ats-adapters/       # ATS-specific implementations (TODO)
│   ├── credentials/        # Credential management (TODO)
│   ├── interventions/      # Human intervention queue (TODO)
│   └── workbook/           # Excel export (TODO)
├── config/                 # Configuration examples
├── private-data/           # Candidate profile & resume template (gitignored)
└── scripts/                # Setup & utility scripts
```

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js 18+
- **Web**: Next.js 14
- **Browser**: Playwright
- **Database**: PostgreSQL + Prisma
- **Queues**: Redis + BullMQ
- **Validation**: Zod
- **Logging**: Pino
- **Documents**: LaTeX (xelatex/pdflatex)
- **Excel**: ExcelJS (TODO)
- **Testing**: Vitest, Playwright Test (TODO)

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- LaTeX installation (xelatex or pdflatex)
- Apify Token (for job discovery)
- Anthropic or OpenAI API key

### Installation

```bash
# Clone and enter directory
cd job-application-copilot

# Copy environment template
cp .env.example .env

# Install dependencies
npm install

# Start PostgreSQL and Redis
npm run docker:up

# Initialize database
npm run db:migrate

# Copy and customize configuration
cp config/searches.example.json config/searches.json
cp config/actor-config.example.json config/actor-config.json
cp config/scoring.example.json config/scoring.json
cp config/application-policy.example.json config/application-policy.json
cp config/answer-policy.example.json config/answer-policy.json

# Copy and customize private candidate data
cp private-data/profile.example.json private-data/profile.json
cp private-data/experience-inventory.example.json private-data/experience-inventory.json
cp private-data/master-resume.example.tex private-data/master-resume.tex
```

### Configuration

1. **Environment** (`.env`)
   - `APIFY_TOKEN`: Your Apify account token
   - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`: Your AI model provider credentials
   - `CREDENTIAL_PROVIDER`: Choose `1password`, `keychain`, or `vault`
   - `DATABASE_URL`, `REDIS_URL`: Auto-configured for Docker Compose

2. **Searches** (`config/searches.json`)
   - Define job titles, locations, and search criteria
   - Configure date windows and result limits

3. **Actor Configuration** (`config/actor-config.json`)
   - Set up LinkedIn and Indeed Apify Actor IDs
   - Configure input mappings for each source

4. **Scoring** (`config/scoring.json`)
   - Define rubric weights for different match categories
   - Adjust experience vs. viability scoring balance

5. **Application Policy** (`config/application-policy.json`)
   - Choose submission mode: `manual`, `reviewed-auto`, or `automatic`
   - Set minimum score thresholds and application limits

6. **Candidate Profile** (`private-data/profile.json`)
   - Define legal name, contact, work authorization, target roles
   - Specify location preferences and excluded companies

7. **Experience Inventory** (`private-data/experience-inventory.json`)
   - Add verified employment history with dates and achievements
   - List education, skills, and certifications

8. **Resume Template** (`private-data/master-resume.tex`)
   - Customize LaTeX resume template
   - Maintain one-page constraint for tailored resumes

## Running the Application

### Development

```bash
# Start Next.js dashboard (port 3000)
npm run dev

# In another terminal, start worker server
npm run worker
```

Visit `http://localhost:3000` to access the dashboard.

### CLI Commands

```bash
# Run job discovery with Apify
npm run discovery

# Score all discovered jobs
npm run score

# Generate resumes and cover letters for selected jobs
npm run generate-documents

# Dry-run: test application workflow without submitting
npm run applications:dry-run

# Submit applications (respects submission policy)
npm run applications:start

# Export scored jobs to Excel workbook
npm run export

# Run full pipeline: discover → score → select → generate → apply
npm run pipeline
```

## Dashboard Features

### Main Dashboard (`/dashboard`)
- Live metrics for discovered, eligible, and scored jobs
- Application status summary
- Quick actions: start discovery, view jobs

### Jobs (`/jobs`)
- Browse all discovered jobs with filtering
- View detailed scoring evidence
- Inspect enrichment data and ATS detection

### Applications (`/applications`)
- Track application progress through workflow states
- View attached documents and answered questions
- Monitor submission status and confirmations

### Interventions (`/interventions`)
- Queue of applications waiting for user input
- OTP, MFA, CAPTCHA, and unknown question handling
- Resume browser sessions and continue workflows

### Logs (`/logs`)
- Complete audit trail of all application events
- Searchable event history with timestamps
- Detailed error messages and diagnostics

## Workflow States

Applications progress through a defined state machine:

```
DISCOVERED → ENRICHMENT_PENDING → ENRICHED → ELIGIBILITY_PENDING
→ ELIGIBILITY_PASSED/FAILED → SCORING_PENDING → SCORED → SELECTED
→ DOCUMENTS_PENDING → DOCUMENTS_READY → APPLICATION_QUEUED
→ APPLICATION_OPENED → ACCOUNT_REQUIRED/READY → FORM_INSPECTION_PENDING
→ FORM_FILLING → WAITING_FOR_OTP/MFA/CAPTCHA/ANSWER/REVIEW
→ VALIDATION_PENDING → VALIDATION_FAILED/READY_TO_SUBMIT
→ SUBMITTING → SUBMITTED → CONFIRMED/FAILED
```

## Credential Management

The system securely stores and manages credentials for ATS accounts without exposing them to the AI model.

### Credential Providers (Tiered)

**1. 1Password CLI** (Recommended for production)
- Secure credential storage via 1Password service account
- Automatic credential rotation
- Audit logging in 1Password vault
- No passwords in logs or code

```bash
export ONEPASSWORD_SERVICE_ACCOUNT_TOKEN=<token>
# System automatically uses 1Password CLI
```

**2. macOS Keychain** (Local development)
- System keychain integration
- No configuration needed on macOS
- Automatically used as fallback

**3. Encrypted Local Vault** (Development only)
- AES-256 encryption with configurable key
- Single-machine security only
- Never use in production

```bash
export ENCRYPTION_KEY=<your-key>
export CREDENTIAL_PROVIDER=vault
```

### Account Management

```typescript
const accountManager = new AccountManager('vault');

// Get or create account
const result = await accountManager.getOrCreateAccount(
  page,
  'greenhouse.io',      // employer domain
  'acme-careers',       // ATS tenant
  'greenhouse',         // ATS provider
  'candidate@test.com'  // email
);

// Handle OTP
await accountManager.handleOTP(page, accountId, '123456');
```

## Human Intervention System

When the system encounters challenges it cannot automatically resolve, it creates an intervention request and pauses the workflow while continuing with other applications.

### Intervention Types

| Type | Trigger | Resolution |
|------|---------|-----------|
| **OTP** | One-time password required | User provides code |
| **MFA** | Multi-factor authentication | User completes MFA |
| **CAPTCHA** | CAPTCHA verification | User solves CAPTCHA |
| **EMAIL_VERIFICATION** | Email verification needed | User clicks verification link |
| **UNKNOWN_QUESTION** | Unrecognized application question | User provides answer |
| **LEGAL_QUESTION** | Legal/compliance question | User confirms answer |
| **WORK_AUTHORIZATION** | Work authorization question | User verifies answer |
| **SALARY_QUESTION** | Salary expectation question | User provides range |
| **PORTAL_MISMATCH** | Unsupported ATS platform | User manually applies |
| **FINAL_REVIEW** | Form validation failed | User reviews and corrects |

### Intervention Workflow

```
Application → Encounter Challenge
↓
Create Intervention Request (pause this application)
↓
Continue with Other Applications
↓
User Resolves Intervention (via dashboard or CLI)
↓
Resume Application from Pause Point
↓
Complete & Submit
```

### Intervention API

```typescript
const interventionManager = new InterventionManager();

// Create intervention
await interventionManager.createIntervention({
  type: InterventionType.OTP,
  applicationId: app.id,
  description: 'OTP code required for account login',
  screenshotPath: 'screenshots/otp-screen.png',
});

// Get pending interventions
const pending = await interventionManager.getPendingInterventions();

// Resolve intervention
await interventionManager.respondToIntervention(
  interventionId,
  '123456' // user response
);

// Check if waiting
const waiting = await interventionManager.isWaitingForIntervention(appId);
```

## Browser Automation

The system supports end-to-end application automation with intelligent ATS detection and adaptation.

### Supported ATS Platforms
- ✅ Greenhouse (full adapter)
- ✅ Lever (form filling)
- ✅ Ashby (form filling)
- ✅ Workday (profile and documents)
- 🔲 iCIMS, Phenom, Taleo, SmartRecruiters, Jobvite, SuccessFactors (detection only)

### Browser Manager Features
- **State Persistence**: Save and restore browser context across sessions
- **Screenshot Capture**: Automatic screenshots at key workflow points
- **Headless & Visual Modes**: Run headless or with visible browser for testing
- **Session Management**: Maintain separate browser contexts per application
- **Accessibility**: Handle modern web applications with JavaScript rendering

### ATS Adapter System
```typescript
interface BaseATSAdapter {
  canHandle(page: Page): Promise<boolean>;
  openApplication(page: Page, jobUrl: string): Promise<boolean>;
  inspectForm(page: Page): Promise<FormInspectionResult>;
  fillProfile(page: Page, data: ProfileData): Promise<FillResult>;
  fillEmployment(page: Page, experiences: ExperienceData[]): Promise<FillResult>;
  fillEducation(page: Page, education: EducationData[]): Promise<FillResult>;
  uploadDocuments(page: Page, documents: DocumentData): Promise<FillResult>;
  answerQuestions(page: Page, answers: Record<string, string>): Promise<FillResult>;
  validate(page: Page): Promise<{ valid: boolean; errors: string[] }>;
  submit(page: Page): Promise<SubmissionResult>;
}
```

### Dry-Run Workflow
```bash
npm run applications:dry-run
```
1. Launches browser (visible for debugging)
2. Navigates to application URLs
3. Detects ATS provider
4. Inspects form structure
5. Captures screenshots
6. Saves form configuration
7. Pauses for human review

### ATS Detection
Detects ATS provider by:
1. URL pattern matching (fastest)
2. DOM marker detection (class/id patterns)
3. Script source detection
4. Generic portal detection (fallback)

Example:
```
job-listing.html → detect URL patterns →
→ Find "greenhouse.io" → return AtsProvider.GREENHOUSE →
→ Route to GreenhouseAdapter
```

## Security & Privacy

🔒 **No Credential Exposure**
- Passwords never exposed to AI models
- Secure credential injection via 1Password CLI or Keychain
- Encrypted browser state storage

🔒 **Input Validation**
- Webpage content treated as untrusted
- Zod schema validation on all configuration
- No arbitrary JavaScript execution from web pages

🔒 **Audit Logging**
- Sensitive values redacted from logs
- JSONL event stream for complete audit trail
- Screenshots stored outside Git

🔒 **Private Data**
- Candidate data isolated in `private-data/` directory
- All generated documents in `.gitignore`
- Credentials managed via secure vault

## Testing

```bash
# Run unit tests
npm test

# Run type checking
npm run typecheck

# Run linting
npm run lint
```

### Completed Milestones

**Milestone 1**: Repository structure, infrastructure, and configuration ✅
- ✅ Repository structure with npm workspaces
- ✅ Docker Compose setup for PostgreSQL and Redis
- ✅ Comprehensive Prisma schema (14 models, 26 application states)
- ✅ Configuration schemas (Zod) for all configuration files
- ✅ Candidate profile and experience inventory templates
- ✅ Queue infrastructure (Redis/BullMQ) setup
- ✅ Logging framework (Pino) with structured logs
- ✅ Dashboard shell (Next.js) with navigation and stats

**Milestone 2**: Job Discovery & Normalization ✅
- ✅ Apify client for job discovery (LinkedIn/Indeed)
- ✅ Job normalization from multiple sources
- ✅ 4-strategy deduplication engine
- ✅ Job enrichment with ATS detection
- ✅ Excel workbook export with formatting
- ✅ Eligibility evaluation engine
- ✅ Evidence-based scoring system
- ✅ Sponsorship status detection

## Implementation Roadmap

### Milestone 2: Job Discovery & Normalization ✅
- ✅ Apify client implementation
- ✅ LinkedIn and Indeed job normalizers
- ✅ Multi-strategy job deduplication
- ✅ Job enrichment with ATS detection
- ✅ Excel workbook export with hidden data sheet
- ✅ Discovery command with synthetic job generation for demo
- ✅ Score command with eligibility evaluation
- ✅ Export command to generate Excel workbook

### Milestone 3: Document Generation ✅
- ✅ Evidence-based eligibility engine
- ✅ Sponsorship status detection
- ✅ Scoring rubric implementation
- ✅ LaTeX resume tailoring with keyword matching
- ✅ Resume PDF compilation (xelatex/pdflatex)
- ✅ One-page validation and word count checking
- ✅ Resume-to-experience claim traceability
- ✅ Keyword coverage analysis
- ✅ Cover letter generation with domain extraction
- ✅ Job selection with one-per-company constraint
- ✅ Full pipeline orchestration

### Milestone 4: Browser Automation & ATS Adapters ✅
- ✅ Playwright browser manager with state persistence
- ✅ ATS provider detection (10+ ATS systems)
- ✅ Base ATS adapter interface with common patterns
- ✅ Greenhouse adapter (full implementation)
- ✅ Lever adapter (form filling)
- ✅ Ashby adapter (form filling)
- ✅ Workday adapter (profile and file upload)
- ✅ Dry-run application workflow
- ✅ Form inspection and field detection
- ✅ Screenshot capture for debugging

### Milestone 5: Account & Credential Management ✅
- ✅ Secure credential storage (1Password, Keychain, Vault)
- ✅ Account creation and login workflows
- ✅ Account registry with ATS tenant isolation
- ✅ OTP/MFA handling with user pause
- ✅ Human intervention queue system
- ✅ Intervention types: OTP, MFA, CAPTCHA, unknown questions, legal questions
- ✅ Email verification detection
- ✅ Credential generation and rotation

### Milestone 6: Submission & Validation
- Form inspection and field mapping
- Resume parsing correction
- Application validation
- Submission policy enforcement

### Milestone 7: Reliability & Polish
- Error recovery mechanisms
- Rate limit handling
- Security review
- Production readiness tests

## Contribution Guidelines

This is a personal productivity tool. All code should be:

- ✅ Type-safe (strict TypeScript)
- ✅ Well-tested (unit + integration tests)
- ✅ Deterministic (no flaky tests)
- ✅ Secure (no credential leaks)
- ✅ Observable (structured logging)
- ✅ Documented (README + inline comments where non-obvious)

## Known Limitations

### Completed Implementation
- ✅ Repository structure and infrastructure
- ✅ Job discovery (with synthetic demo data for testing)
- ✅ Job normalization and deduplication
- ✅ Eligibility evaluation and scoring
- ✅ Resume generation and validation
- ✅ Cover letter generation
- ✅ Job selection and ranking
- ✅ Excel export

### In Development
- 🔄 Browser automation (Playwright)
- 🔄 ATS adapters (Greenhouse, Lever, Ashby, Workday)
- 🔄 Application form filling
- 🔄 Human intervention system

### Future Work
- 🔲 Model provider abstraction (Anthropic/OpenAI integration)
- 🔲 Credential management integration (1Password, Keychain)
- 🔲 API endpoints and advanced dashboard features
- 🔲 Production deployment guides

## Support & Troubleshooting

### Database Issues
```bash
# Reset database (careful - destructive!)
npm run docker:reset
npm run db:migrate

# View database with Prisma Studio
npm run db:studio
```

### Missing Configuration
All `.example` files must be copied and customized:
```bash
find . -name "*.example.json" -o -name "*.example.tex" | \
  while read f; do cp "$f" "${f%.example*}"; done
```

### LaTeX Issues
Ensure LaTeX is installed:
```bash
# macOS
brew install basictex

# Linux
apt-get install texlive-latex-base texlive-fonts-recommended

# Windows
Download from https://miktex.org/download
```

## License

Private tool - not for public distribution.

## Deployment Notes

**Never commit**:
- `.env` files with real credentials
- `private-data/` with actual candidate information
- `output/` with generated documents
- `browser-state/` with session tokens
- Any files containing API keys, passwords, or OAuth tokens

Use `.gitignore` to protect sensitive data and generated artifacts.

## Next Steps

1. Copy and customize `.env` from `.env.example`
2. Copy and customize configuration files from `config/` examples
3. Copy and customize candidate data from `private-data/` examples
4. Run `npm install && npm run docker:up && npm run db:migrate`
5. Start development: `npm run dev` (dashboard) and `npm run worker` (background tasks)
6. Navigate to `http://localhost:3000` to see the dashboard

Milestone 1 complete. Ready for Milestone 2: Job Discovery & Normalization.
