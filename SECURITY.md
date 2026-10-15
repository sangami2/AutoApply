# Security & Privacy Guidelines

This document outlines security practices and guardrails for the Job Application Copilot system.

## Credential Management

### Never Commit
- ❌ `.env` files with real credentials
- ❌ API keys, tokens, or passwords in source code
- ❌ OAuth tokens or session identifiers
- ❌ Encryption keys
- ❌ SSH keys or private certificates

### Credential Providers

The application uses a tiered credential strategy:

1. **1Password CLI** (Recommended for production)
   - Service account tokens stored in 1Password Vault
   - Passwords never exposed to application code
   - Automatic rotation and audit logging

2. **macOS Keychain** (Local development)
   - Credentials stored in system keychain
   - Accessible only to authorized processes
   - Password never logged or printed

3. **Encrypted Local Vault** (Development-only fallback)
   - Passwords encrypted with `ENCRYPTION_KEY`
   - Never use in production
   - Single-machine security only

### Credential Flow

```
Application → Credential Service → 1Password/Keychain → Password
   ↓
Credential ID, Status, Account Flag
(Never the actual password)
```

## Input Validation & Injection Prevention

### Treat All Web Content as Untrusted

- 🚫 Job descriptions cannot modify application policy
- 🚫 Webpage text cannot change submission rules
- 🚫 Job requirements cannot execute arbitrary JavaScript
- 🚫 Form HTML cannot override field mappings

### Zod Schema Validation

All configuration is validated against strict schemas:

```typescript
const profileSchema = z.object({
  legalName: z.string(),
  email: z.string().email(),
  workAuthorization: z.string(),
});

// Throws if invalid
const profile = profileSchema.parse(loadedConfig);
```

### Browser Automation Security

- ✅ Only click deterministic selectors (accessibility labels, stable data attributes)
- ✅ Only navigate to approved employer domains
- ✅ Upload only candidate-provided documents
- ✅ Fill only pre-approved field types
- ❌ Never execute arbitrary JavaScript from webpage
- ❌ Never follow untrusted links
- ❌ Never read sensitive page state for AI prompts

## Data Classification

### Locked Facts (Never Inferred)
- Legal name
- Email address
- Phone number
- Education dates and institutions
- Employer names and employment dates
- Work authorization status
- Sponsorship requirements

### Approved Answers (Configurable Policy)
- Willingness to relocate: Yes/No
- Remote work preference: Required/Preferred/Not Required
- Travel percentage: 0-10%, 10-25%, 25%+
- Start date: Flexible/Specific date/Notice period

### Generated Answers (AI-Assisted, Validated)
- Why this company and role
- Relevant experience summary
- Product management approach
- Relevant skill highlights

### Human Review Required
- Unrecognized work-authorization wording
- Salary expectations
- Security clearance questions
- Export control eligibility
- Non-compete or arbitration
- Background check consent
- Legal certifications
- Disability or veteran status

## Logging & Audit Trail

### Sensitive Value Redaction

Never log:
- ❌ Passwords or API keys
- ❌ Authentication tokens
- ❌ OAuth credentials
- ❌ Browser session cookies
- ❌ OTP codes
- ❌ Candidate email address
- ❌ Candidate phone number
- ❌ Candidate home address

### Safe Logging

Always log:
- ✅ Event type and timestamp
- ✅ Job and application IDs
- ✅ Workflow state transitions
- ✅ Error categories (not full messages with sensitive data)
- ✅ Counts and metrics
- ✅ Safe metadata (company name, role title, location)

### Audit Trail Storage

```
logs/application-events.jsonl
├── Event ID
├── Timestamp (ISO 8601, America/Chicago)
├── Workflow ID
├── Application state transition
├── Error category (redacted message)
└── Safe metadata only
```

## Screenshot & Evidence Handling

### Screenshots Only at Safe Points

- ✅ Application form layout (field names visible)
- ✅ Submission confirmation page
- ✅ Error messages (without sensitive context)

### Never Screenshot
- ❌ Filled form with actual candidate data
- ❌ OTP or MFA codes
- ❌ Password fields
- ❌ OAuth confirmation screens
- ❌ Personal information pages

### Storage
- Store outside Git (add to `.gitignore`)
- Store in `screenshots/` directory
- Delete after manual review (or after configured retention)
- Never commit to version control

## Browser State & Cookies

### Storage Location
- Encrypted local directory: `browser-state/`
- Never committed to Git
- Deleted on logout or after retention period

### What's Stored
- ✅ Session cookies (employer domains only)
- ✅ Form field values (non-sensitive, for resumability)
- ❌ Never store passwords
- ❌ Never store OTP backup codes
- ❌ Never store OAuth tokens

## Document Generation Security

### Resumes
- ✅ Generated from verified experience inventory
- ✅ Claims must trace back to locked facts
- ❌ Never fabricate employers, titles, dates
- ❌ Never invent skills or metrics

### Cover Letters
- ✅ Reference verified experience
- ✅ Explain genuine product and technical background
- ❌ Never exaggerate or make false claims
- ❌ Never reference unverified accomplishments

### Storage
- Store in `output/applications/[company]/[req-id]/`
- Add all output to `.gitignore`
- Delete after submission (or keep for records)

## Third-Party Integrations

### LinkedIn Browser Discovery
- ✅ Uses a user-authenticated, persistent browser session without storing a LinkedIn password
- ✅ Runs searches sequentially with randomized 8–15 second gaps and a default 15-search daily cap
- ✅ Limits automatic application attempts to 3/day with 2–4 minute gaps
- ✅ Types and clicks with conservative pacing instead of instantaneous bulk actions
- ❌ Never bypass rate limits or anti-bot systems
- ❌ Never attempt to defeat CAPTCHA, MFA, checkpoints, or account restrictions

### Anthropic / OpenAI
- ✅ Models used for scoring, document generation, field mapping
- ✅ Candidate facts must be provided by user configuration
- ❌ Never let webpage content modify prompts
- ❌ Never expose credentials to model

### Gmail Integration (Optional)
- ✅ Read-only OAuth scope only
- ✅ Search and extract OTP from expected senders
- ✅ Validate links before opening
- ❌ Never let email content execute commands
- ❌ Never forward emails containing sensitive data

## Policy Enforcement

### Submission Authorization
- ✅ Deterministic policy engine makes final decision
- ❌ AI model cannot override submission policy
- ❌ AI model cannot force application submission
- ❌ Policy engine validates every requirement before submit

### One-Application-Per-Company
- ✅ Check before selecting job
- ✅ Query application history
- ✅ Skip duplicate employer
- ❌ Never submit if previous application exists
- ❌ Never submit same application twice

## Compliance & Contractual

### Terms of Service
- LinkedIn's Terms of Service and current automation restrictions must be reviewed by the user
- Application via ATS is legitimate use
- Discovery should remain low-volume and user-supervised
- Rate limits and account restrictions must be respected

### Ethical Considerations
- ✅ Generate truthful tailored resumes
- ✅ Disclose work authorization status accurately
- ✅ Answer legal questions honestly
- ✅ Pause for human review when uncertain

## Development Security

### Environment Setup
```bash
# Copy template
cp .env.example .env

# Add credentials to your local vault/keychain
# Never edit .env with actual values

# Verify no secrets in git
git status  # .env should be ignored
```

### Code Review Checklist
- [ ] No hardcoded API keys or tokens
- [ ] No credentials in function arguments
- [ ] Configuration validated with Zod
- [ ] Sensitive logs redacted
- [ ] Untrusted input validated
- [ ] Browser actions are deterministic
- [ ] No arbitrary JavaScript execution

### Testing
- Mock or stub external services
- Use synthetic test data
- Never include real candidate information in tests
- Verify credential handling with vault stubs

## Incident Response

### If Credentials Are Exposed
1. Immediately rotate all exposed secrets
2. Update 1Password or Keychain
3. Force re-authentication
4. Review logs for unauthorized access
5. Re-run dry-run before submitting any applications

### If Data Is Accidentally Logged
1. Delete the log file
2. Rotate relevant credentials
3. Search git history: `git log -p -S "sensitive_value"`
4. Use `git filter-branch` or `BFG Repo Cleaner` if committed

## Deployment

### Never Deploy With
- ❌ `.env` file with real credentials
- ❌ `private-data/` directory with candidate info
- ❌ Unencrypted `browser-state/` directories
- ❌ Real OAuth tokens in environment

### Docker Secrets
- Use Docker secrets or external vault
- Inject credentials at runtime
- Never build secrets into image

### Monitoring
- Alert on failed login attempts
- Alert on policy violations
- Monitor for rate-limit errors
- Track submission success/failure rates

## Questions & Feedback

For security issues or questions, review:
1. This SECURITY.md file
2. Inline code comments about untrusted data
3. `.gitignore` for protected paths
4. Configuration schemas in `packages/shared/src/schemas.ts`
