# AutoApply — daily job research

This project only researches and shortlists jobs. Its daily output is an Excel workbook; it does not tailor résumés, fill forms, or submit applications.

## What the daily run does

1. Searches LinkedIn nationwide for PM, Technical PM, Compliance/Platform PM, Associate PM, and select Senior PM terms using the native **past 24 hours** filter.
2. Paginates each search until it has 20 relevant cards or LinkedIn returns two empty pages. This keeps the daily scan selective while covering each PM search term.
3. Opens every discovered listing and reads its full description and application destination.
4. Uses Claude to score fit, extract required experience, and classify work-authorization language for every role.
5. Checks title relevance, experience, work authorization, and posted base pay. A role must have a posted base range starting at $100k to be automatically shortlisted; unknown or overlapping ranges are flagged for pay review. Senior PM roles without explicit required years are flagged for seniority review.
6. Shortlists at most eight roles per scan and writes an Excel workbook with a focused `PM Picks` tab and a separate `All Scanned` tab.

It performs **zero résumé tailoring, zero application filling, and zero submissions**.

## Run it now

```bash
npm run daily
```

For a missed multi-day window, run one deduplicated catch-up scan:

```bash
npm run daily -- --days 3 --stamp 2026-07-18_to_2026-07-20
```

The workbook is written to:

```text
runs/excel-sheets/AutoApply_Jobs_YYYY-MM-DD.xlsx
```

Open **PM Picks** first for roles that meet the posting, pay, and experience filters. **All Scanned** shows the remaining roles and their verdicts. The scanner also rechecks selected roles on official employer boards, including Morgan & Morgan.

## Work-authorization classifications

Every row gets a non-empty value:

- `INELIGIBLE — explicitly no sponsorship / OPT support`
- `INELIGIBLE — citizenship, permanent residency, or clearance required`
- `SPONSORSHIP STATED — H-1B offered for exceptional candidates`
- `POLICY UNCLEAR — verify future sponsorship with employer`
- `NO RESTRICTION STATED — future sponsorship unconfirmed`

“No restriction stated” does not claim that an employer sponsors. Akash is recorded accurately as currently authorized through F-1 OPT, STEM OPT eligible, and requiring future H-1B sponsorship.

## Daily scheduling

Install the included macOS LaunchAgent:

```bash
npm run daily:install
```

It runs at **9:00 AM local time every day**. Logs are written to:

```text
logs/launchd-daily.out.log
logs/launchd-daily.err.log
```

To remove the schedule:

```bash
npm run daily:uninstall
```

## Configuration

- Search terms and locations: `config/linkedin-search.json`
- Verified official postings: `config/official-leads.json`
- Pay threshold, selectivity, and preferred companies: `config/pm-search-policy.json`
- Browser pacing: `config/automation-safety.json`
- Candidate facts: `private-data/profile.json`

The scheduled LinkedIn session is retained in `.browser-profile-daily/` and runs headlessly. If LinkedIn asks for login or a checkpoint, run `npm run linkedin:discover` without `HEADLESS=1` and complete the prompt in the visible Chrome window. The system does not bypass security checks.
