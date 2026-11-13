# Setup: your own private copy

About 15 minutes, one time. After that it runs on its own twice a day (around 6am and 4pm Denver time), and new roles show up scored and ranked.

## What you need

- A GitHub account
- An Anthropic API key: https://console.anthropic.com, then **Settings → API keys**. Add billing, and set a monthly spend limit (Settings → Limits). $20/month is plenty: the first run costs a dollar or two, and after that each run only scores new postings.
- Node.js 20+ on your computer, so you can view the dashboard (https://nodejs.org)

## 1. Create a private repo

On GitHub: **New repository**, name it something like `job-search`, set it to **Private**, and leave "Add a README" unchecked.

> It must be private. The scoring output (pitches and cover letters) is written from your resume, and the workflow refuses to run in a public repo.

## 2. Copy the project into it

In a terminal (replace `YOUR-USERNAME`):

```bash
git clone --depth 1 --branch claude/job-search-automation-n0vbzm \
  https://github.com/alexswoops/option-trade-tracker.git tmp-source
cp -r tmp-source/job-search job-search
rm -rf tmp-source
cd job-search
git init -b main
git add .
git commit -m "Job search setup"
git remote add origin https://github.com/YOUR-USERNAME/job-search.git
git push -u origin main
```

## 3. Add two secrets

In your new repo: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key (starts with `sk-ant-`) |
| `RESUME_TEXT` | your resume as plain text. Paste the contents of `RESUME_TEXT.txt` that came with these instructions, or copy it from your resume doc. Contact details are optional; scoring doesn't use them. |

## 4. Run it once by hand

**Actions** tab → **Job search (twice daily)** → **Run workflow**. It takes a few minutes. When it turns green, it has committed `web/data/jobs.json` with scored jobs. From then on it runs on schedule.

## 5. Open the dashboard

```bash
cd job-search
git pull          # grab the latest results (do this whenever you check)
npm install       # first time only
npm run serve     # then open http://localhost:8080
```

Daily routine: `git pull`, refresh the page, triage the new ones.

## Using the dashboard

- Jobs are sorted best fit first. The default view hides anything under 70. Change the filter to see more.
- Set a status on each job (**Interested**, **Applied**, **Interviewing**, etc.) and add notes. These save in your browser. Use **Export tracking** now and then as a backup.
- Open **Pitch & resume emphasis** for a tailored opener and which bullets to lead with. Jobs scoring 75+ also get a **cover letter draft**. Treat these as first drafts: check every claim before sending.
- Nothing is ever submitted for you. Apply through the posting link.

## Tuning (edit, commit, push)

- `config/profile.json`: target titles, the $160K floor, locations (currently Denver/Boulder/Colorado plus US remote), and how many jobs to score per run.
- `config/companies.json`: companies to watch. To add one, find their careers page. If it's on `boards.greenhouse.io/<name>`, `jobs.lever.co/<name>` or `jobs.ashbyhq.com/<name>`, add `<name>` to that list.
