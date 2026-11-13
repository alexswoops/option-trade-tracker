# Job Search Pipeline

Automated job discovery for Director-level editorial, content strategy, audience, and SEO leadership roles, $160K+ base, US remote or Denver area.

**Setting up your own copy? Start with [SETUP.md](SETUP.md).**

Each run:

1. **Fetches** open roles from ~70 company job boards (Greenhouse, Lever, Ashby) plus three remote-job aggregators (Himalayas, Remotive, Jobicy). All are public APIs, so no scraping and no ToS issues.
2. **Filters** by title (Director-or-above *and* editorial/content in the title), location (US remote or listed cities), and pay (drops anything whose posted max is under $160K; keeps unposted pay and flags it).
3. **Dedupes** cross-posted roles and remembers what it has seen, so each job is scored once.
4. **Scores** new jobs against the resume with Claude: a 0 to 100 fit score, why it fits, gaps, red flags, a salary read, a tailored pitch, and which resume bullets to lead with.
5. **Drafts cover letters** for the best matches (score 75+, up to 8 per run).
6. **Writes** `web/data/jobs.json`, which the dashboard in `web/` reads.

The dashboard tracks status (New, Interested, Applied, Interviewing, Offer, Rejected, Not for me) and notes per job in the browser, with Export/Import for backup. Nothing is ever submitted automatically. He reviews, tailors, and applies himself.

## Layout

```
config/profile.json     search criteria: titles, title regexes, salary floor, locations, queries, scoring limits
config/companies.json   company job boards to watch (all slugs verified live)
resume/                 put resume.md here locally (git-ignored)
src/run.mjs             the pipeline
src/sources/            one fetcher per job board API
src/filter.mjs          title / location / salary rules and dedupe
src/score.mjs           Claude fit scoring and cover letters
web/                    static dashboard (index.html, app.js, styles.css, data/jobs.json)
```

## Run it locally

```bash
cd job-search
npm install
cp ~/path/to/resume.md resume/resume.md      # plain text or markdown
export ANTHROPIC_API_KEY=sk-ant-...          # from console.anthropic.com
npm run run                                   # fetch + score  (npm run run:no-ai to skip Claude)
npm run serve                                 # dashboard at http://localhost:8080
```

## Tuning

- **More companies:** add slugs to `config/companies.json`. The slug is the path segment in the company's careers URL (`boards.greenhouse.io/<slug>`, `jobs.lever.co/<slug>`, `jobs.ashbyhq.com/<slug>`). A dead slug only logs a warning.
- **Titles:** `titleRules` in `profile.json`. A title must match `seniority` and `domain`, and must not match `exclude`.
- **Location:** set `location.cities` to where he would go on-site or hybrid.
- **Cost:** each scored job is one Claude call (roughly 3 to 5 cents); cover letters are one more. The first run scores up to 40; after that only new jobs get scored, usually a handful per run. Lower `maxNewScoresPerRun` to cap spend.

## Privacy

The resume never goes in git: locally it lives in the git-ignored `resume/` folder, and in Actions it comes from the `RESUME_TEXT` secret. But **`web/data/jobs.json` contains Claude's output** (pitches, resume emphasis, cover letters), which is written from the resume. That is why the scheduled workflow (`.github/workflows/job-search.yml`) only runs in a **private** repo and refuses to run in a public one, and why the dashboard is viewed locally rather than published.
