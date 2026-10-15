# AutoApply — Daily Job Research

AutoApply scans Product Manager, Technical Product Manager, Associate PM, and select Senior PM jobs nationwide across industries. It also refreshes selected roles from official employer boards. It ranks relevant roles and writes an Excel workbook for manual review.

It does **not** fill or submit job applications, and it does not require a dashboard.

## Daily output

The workbook is saved as:

```text
runs/excel-sheets/AutoApply_Jobs_YYYY-MM-DD.xlsx
```

`PM Picks` is the first tab and contains only roles that pass the pay, experience, employer, and fit filters, with direct application links. `All Scanned` contains every evaluated role and the reason it was excluded or held back. Pinned leads appear first, followed by preferred employers.

## What the daily flow does

1. Searches configured PM terms nationwide, collecting up to 20 relevant cards per term each day. Internship, graduate, program, project, marketing, and executive titles are excluded before detailed review.
2. Keeps LinkedIn jobs posted within the prior 24 hours and refreshes selected official employer postings while they remain open.
3. Reads the full posting and external application destination.
4. Scores actual PM fit and classifies sponsorship/F-1 language, with deterministic checks for explicit restrictions.
5. Rejects roles requiring more than four total years or more than two PM-specific years, incompatible graduation dates, explicit no-sponsorship language, citizenship/clearance restrictions, or a posted base range entirely below $100k.
6. Shortlists up to eight strong roles per run when the posted base range starts at $100k or above. Roles with missing or overlapping pay ranges remain visible as `REVIEW PAY`; senior roles with no stated experience minimum remain `REVIEW SENIORITY`. A mandatory qualification absent from the profile is a requirement mismatch, while industry alone does not restrict the search. Postings for an unnamed hiring company stay out of the picks.
7. Exports every evaluated job to Excel and sends a macOS completion notification.

The daily workflow does not generate or tailor résumés, fill forms, or submit applications. A preferred-company list raises ranking priority; companies outside it remain eligible.

`NO RESTRICTION STATED` means the posting did not disclose a restriction; it is not a promise that the employer will sponsor later.

Search settings are in `config/linkedin-search.json`; verified official postings are in `config/official-leads.json`; salary, shortlist size, experience gate, and preferred companies are in `config/pm-search-policy.json`. Candidate facts are in `private-data/profile.json` and `private-data/experience-inventory.json`.

## Commands

```bash
# Run the complete 24-hour scan now
npm run daily

# Small end-to-end verification run
npm run daily -- --smoke --limit 2

# Limited but balanced scan across every configured PM search term
npm run daily -- --per-term-limit 10

# Focused catch-up scan for one role family
npm run daily -- --term "Associate Product Manager" --days 7 --per-term-limit 20 --stamp 2026-09-23_to_2026-09-29

# Catch up a missed date range (example: three days)
npm run daily -- --days 3 --stamp 2026-07-18_to_2026-07-20

# Install or refresh the automatic 9:00 AM local-time schedule
npm run daily:install

# Remove the automatic schedule
npm run daily:uninstall
```

See [HOW_TO_APPLY.md](HOW_TO_APPLY.md) for configuration, work-authorization classifications, logs, and troubleshooting.
