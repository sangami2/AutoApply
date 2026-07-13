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

Milestone 1 includes:
- ✅ Repository structure
- ✅ Docker Compose setup
- ✅ Prisma schema
- ✅ Configuration schemas (Zod)
- ✅ Candidate profile templates
- ✅ Queue infrastructure (Redis/BullMQ)
- ✅ Logging framework (Pino)
- ✅ Dashboard shell (Next.js)

## Implementation Roadmap

### Milestone 2: Job Discovery & Normalization
- Apify client implementation
- LinkedIn and Indeed adapters
- Job normalization and deduplication
- Job enrichment and ATS detection
- Excel workbook export

### Milestone 3: Eligibility & Scoring
- Evidence-based eligibility engine
- Scoring rubric implementation
- Model provider abstraction
- Dashboard job details page

### Milestone 4: Documents
- Experience inventory integration
- LaTeX resume generation and compilation
- One-page validation
- Cover letter generation

### Milestone 5: Browser Automation
- Playwright browser manager
- ATS detection engine
- Greenhouse, Lever, Ashby, Workday adapters
- Dry-run workflow implementation

### Milestone 6: Account & Credential Management
- Account registry and lifecycle
- Credential provider integrations
- Persistent browser sessions
- Human intervention queue

### Milestone 7: Submission & Validation
- Form inspection and field mapping
- Resume parsing correction
- Application validation
- Submission policy enforcement

### Milestone 8: Reliability & Polish
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

### Initial Milestone 1 Implementation
- 🔲 Apify integration not yet implemented
- 🔲 Job discovery workflow not implemented
- 🔲 Scoring engine not implemented
- 🔲 Document generation not implemented
- 🔲 Browser automation not implemented
- 🔲 API endpoints not yet implemented

This is normal for Milestone 1. Each subsequent milestone implements working vertical slices with full functionality.

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
