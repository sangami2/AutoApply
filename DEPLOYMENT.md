# Production Deployment Guide

This guide covers deploying Job Application Copilot to production.

## Pre-Deployment Checklist

### Security
- [ ] All secrets removed from code (use `.env` only)
- [ ] API keys stored in secure credential manager
- [ ] Database credentials rotated
- [ ] HTTPS enabled for all connections
- [ ] Firewall rules configured
- [ ] VPN access for development database disabled
- [ ] Security headers configured

### Configuration
- [ ] `.env.production` created with production values
- [ ] Database URL points to production database
- [ ] Redis URL points to production Redis
- [ ] API keys for Apify, Anthropic/OpenAI configured
- [ ] Credential provider configured (1Password recommended)
- [ ] Application policy set appropriately (manual mode recommended initially)
- [ ] Logging level set to info (not debug)
- [ ] CORS configured correctly

### Database
- [ ] PostgreSQL 13+ installed and running
- [ ] Database created and accessible
- [ ] Migrations applied: `npm run db:migrate`
- [ ] Backup strategy in place
- [ ] Connection pooling configured (PgBouncer recommended for production)
- [ ] Encryption at rest enabled

### Dependencies
- [ ] Node.js 18+ installed
- [ ] All packages installed: `npm install`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Tests pass: `npm test`
- [ ] LaTeX installed: `brew install basictex` (macOS) or equivalent
- [ ] Playwright browsers installed: `npx playwright install`

### Monitoring
- [ ] Logging destination configured
- [ ] Error tracking service connected (Sentry recommended)
- [ ] Metrics collection configured
- [ ] Health check endpoints set up
- [ ] Uptime monitoring configured
- [ ] Alert thresholds defined

## Installation Steps

### 1. Clone Repository
```bash
git clone https://github.com/your-org/job-application-copilot.git
cd job-application-copilot
```

### 2. Install Dependencies
```bash
npm install
npm run typecheck
npm test
```

### 3. Configure Environment
```bash
cp .env.example .env.production
# Edit .env.production with production values
```

### 4. Setup Database
```bash
# Create database
createdb job_copilot_prod

# Run migrations
DATABASE_URL="postgresql://..." npm run db:migrate
```

### 5. Setup Redis
```bash
# Verify Redis is running on production server
redis-cli ping
```

### 6. Configure Credentials
```bash
# Set up 1Password service account
export ONEPASSWORD_SERVICE_ACCOUNT_TOKEN="<your-token>"
export CREDENTIAL_PROVIDER="1password"
```

### 7. Configure Models
```bash
# Set up Anthropic
export ANTHROPIC_API_KEY="<your-key>"
export MODEL_PROVIDER="anthropic"
export MODEL_NAME="claude-opus-4-8"

# OR set up OpenAI
export OPENAI_API_KEY="<your-key>"
export MODEL_PROVIDER="openai"
export MODEL_NAME="gpt-4-turbo"
```

### 8. Configure Apify
```bash
export APIFY_TOKEN="<your-token>"
# Configure Actors in config/actor-config.json
```

### 9. Configure Private Data
```bash
# Create private data directory
mkdir -p private-data

# Copy candidate profile
cp private-data/profile.example.json private-data/profile.json
# Edit with actual candidate data

# Copy experience inventory
cp private-data/experience-inventory.example.json private-data/experience-inventory.json
# Edit with actual experience

# Copy resume template
cp private-data/master-resume.example.tex private-data/master-resume.tex
# Customize template
```

### 10. Build Applications
```bash
npm run build
```

## Running in Production

### Dashboard
```bash
npm run --workspace=apps/dashboard start
# Runs on http://localhost:3000
```

### Worker (Background Tasks)
```bash
npm run --workspace=apps/worker start
# Starts BullMQ workers for job processing
```

### Full Pipeline
```bash
npm run pipeline
# Discovers → Scores → Generates → Exports
```

### Manual Commands
```bash
npm run discovery         # Run job discovery
npm run score            # Score discovered jobs
npm run generate-documents  # Generate resumes/cover letters
npm run applications:dry-run  # Test application filling
npm run applications:start    # Submit applications
npm run export           # Export to Excel workbook
```

## Monitoring & Health Checks

### Application Health
```bash
# Check if dashboard is responding
curl http://localhost:3000/health

# Check if worker is processing jobs
curl http://localhost:3001/health

# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# Check Redis connection
redis-cli ping
```

### Logs
```bash
# View application logs
tail -f logs/application.log

# View submission log
tail -f logs/submissions.jsonl

# View failure log
tail -f logs/failures.jsonl
```

### Metrics to Monitor
- Application submission success rate
- Average submission duration
- Number of pending interventions
- Form validation error rate
- Policy rejection rate
- Database connection pool usage
- Redis memory usage
- Browser process memory

## Error Recovery

### Transient Errors (Automatically Retried)
- Network timeouts
- Connection resets
- Service unavailable (503)
- Rate limit errors (with backoff)
- DNS errors

### Non-Transient Errors (Require Manual Review)
- Invalid credentials
- Job closed
- Duplicate application
- Form validation failed
- Unsupported ATS

### Recovery Procedures

**If database connection fails:**
```bash
# Check database
psql $DATABASE_URL -c "SELECT 1"

# Restart dashboard
npm run --workspace=apps/dashboard start
```

**If Redis connection fails:**
```bash
# Check Redis
redis-cli ping

# Restart worker
npm run --workspace=apps/worker start
```

**If application is stuck:**
1. Check intervention queue
2. Resolve pending intervention
3. Or skip application
4. Restart worker

**If discovery fails:**
1. Verify Apify token
2. Check actor configuration
3. Retry discovery
4. Check Apify dashboard

## Maintenance

### Daily
- Monitor success rate
- Check for new interventions
- Verify no abnormal errors

### Weekly
- Review application logs
- Check policy effectiveness
- Audit credential usage

### Monthly
- Backup database
- Rotate API keys
- Review security settings
- Test disaster recovery

## Scaling Considerations

### Increase Browser Workers
```bash
export MAX_BROWSER_WORKERS=5
# More concurrent applications (default: 3)
```

### Increase Database Connections
```bash
# In .env
DATABASE_CONNECTION_LIMIT=20
```

### Increase Redis Memory
```bash
# Configure Redis maxmemory
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

## Security Best Practices

1. **Credentials**
   - Always use 1Password for production
   - Never store passwords in `.env`
   - Rotate credentials quarterly

2. **Logs**
   - Never log full credentials
   - Redact sensitive data
   - Archive logs after 30 days

3. **Database**
   - Use connection pooling (PgBouncer)
   - Enable SSL/TLS
   - Regular backups
   - No direct access from development

4. **API Keys**
   - Use environment variables only
   - Rotate quarterly
   - Monitor usage patterns
   - Disable unused keys

5. **Monitoring**
   - Set up error alerts
   - Monitor rate limit usage
   - Track failed submissions
   - Alert on high error rates

## Troubleshooting

### High Memory Usage
- Check browser process count
- Reduce MAX_BROWSER_WORKERS if needed
- Restart worker daemon

### Slow Application Filling
- Check network latency
- Verify ATS response times
- Increase timeouts if needed

### Interventions Stuck Pending
- Check application status
- Resolve or skip intervention
- Restart affected application

### Database Connection Pool Exhausted
- Increase connection limit
- Check for connection leaks
- Restart application

## Disaster Recovery

### Backup & Restore
```bash
# Daily backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore from backup
psql $DATABASE_URL < backup-20260713.sql
```

### Reprocessing Failed Applications
```bash
# Mark failed applications as retryable
UPDATE application SET state='DOCUMENTS_READY' WHERE state='FAILED';

# Restart applications
npm run applications:start
```

## Compliance & Audit

### Audit Trail
- JSONL logs in `logs/submissions.jsonl`
- Database events in `WorkflowEvent` table
- Application state history in `Application` table

### Retention Policy
- Keep submission logs: 90 days
- Keep failure logs: 30 days
- Keep screenshots: until completion + 7 days
- Keep credentials: encrypted indefinitely

### Compliance Checklist
- [ ] Credentials encrypted at rest
- [ ] HTTPS enabled
- [ ] Audit logging enabled
- [ ] Data retention policy defined
- [ ] Backup strategy in place
- [ ] Disaster recovery tested

## Support & Contact

For production issues:
1. Check logs first
2. Consult troubleshooting guide
3. Review recent changes
4. Contact development team

For security issues:
- Do NOT commit to public repository
- Report through security channel
- Include full context and logs
