import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGreenhouse } from "./sources/greenhouse.mjs";
import { fetchLever } from "./sources/lever.mjs";
import { fetchAshby } from "./sources/ashby.mjs";
import { fetchHimalayas, fetchRemotive, fetchJobicy } from "./sources/aggregators.mjs";
import { buildTitleMatcher, rejectReason, dedupeKey } from "./filter.mjs";
import { Scorer, scoreJobs } from "./score.mjs";
import { log, mapLimit } from "./util.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "web", "data", "jobs.json");
const args = new Set(process.argv.slice(2));

const readJson = async (p, fallback) => (existsSync(p) ? JSON.parse(await readFile(p, "utf8")) : fallback);

async function loadResume() {
  if (process.env.RESUME_TEXT?.trim()) return process.env.RESUME_TEXT.trim();
  for (const name of ["resume.md", "resume.txt"]) {
    const p = path.join(ROOT, "resume", name);
    if (existsSync(p)) return (await readFile(p, "utf8")).trim();
  }
  return null;
}

async function collect(profile, companies) {
  const titleMatches = buildTitleMatcher(profile);
  const tasks = [
    ...companies.greenhouse.map((s) => ({ name: `greenhouse:${s}`, run: () => fetchGreenhouse(s, titleMatches) })),
    ...companies.lever.map((s) => ({ name: `lever:${s}`, run: () => fetchLever(s, titleMatches) })),
    ...companies.ashby.map((s) => ({ name: `ashby:${s}`, run: () => fetchAshby(s, titleMatches) })),
    ...profile.searchQueries.flatMap((q) => [
      { name: `himalayas:${q}`, run: () => fetchHimalayas(q, titleMatches) },
      { name: `remotive:${q}`, run: () => fetchRemotive(q, titleMatches) },
    ]),
    // Jobicy only accepts single-word tags.
    ...profile.jobicyTags.map((t) => ({ name: `jobicy:${t}`, run: () => fetchJobicy(t, titleMatches) })),
  ];

  const sourceErrors = [];
  const results = await mapLimit(tasks, 6, async (t) => {
    try {
      return await t.run();
    } catch (err) {
      sourceErrors.push(`${t.name}: ${err.message}`);
      return [];
    }
  });
  return { found: results.flat(), sourceErrors, sourcesChecked: tasks.length };
}

async function main() {
  const profile = await readJson(path.join(ROOT, "config", "profile.json"));
  const companies = await readJson(path.join(ROOT, "config", "companies.json"));
  const previous = await readJson(OUT, { jobs: [] });
  const now = new Date().toISOString();

  log("Fetching job boards…");
  const { found, sourceErrors, sourcesChecked } = await collect(profile, companies);
  log(`Title matches: ${found.length} across ${sourcesChecked} source queries (${sourceErrors.length} errors)`);
  for (const e of sourceErrors) log(`  warn ${e}`);

  const filteredOut = {};
  const fresh = new Map();
  for (const job of found) {
    const why = rejectReason(job, profile);
    if (why) {
      const bucket = why.split(":")[0];
      filteredOut[bucket] = (filteredOut[bucket] || 0) + 1;
      continue;
    }
    const key = dedupeKey(job);
    if (!fresh.has(key)) fresh.set(key, job);
  }
  log(`Passed filters: ${fresh.size}  (filtered out: ${JSON.stringify(filteredOut)})`);

  // Merge with what we already know so scores, cover letters, and first-seen dates persist.
  const byKey = new Map(previous.jobs.map((j) => [dedupeKey(j), j]));
  const merged = [];
  for (const [key, job] of fresh) {
    const old = byKey.get(key);
    merged.push({
      ...job,
      firstSeen: old?.firstSeen || now,
      lastSeen: now,
      active: true,
      fit: old?.fit,
      scoredAt: old?.scoredAt,
      coverLetter: old?.coverLetter,
    });
    byKey.delete(key);
  }
  // Jobs that disappeared from their board: keep a while (marked closed) so his tracking history survives.
  const cutoff = Date.now() - profile.retentionDays * 864e5;
  for (const old of byKey.values()) {
    if (new Date(old.lastSeen).getTime() > cutoff) merged.push({ ...old, active: false });
  }

  const newCount = merged.filter((j) => j.firstSeen === now).length;
  log(`New since last run: ${newCount}`);

  const resume = await loadResume();
  const aiOff = args.has("--no-ai") || !profile.scoring.enabled;
  if (aiOff) log("AI scoring disabled for this run.");
  else if (!process.env.ANTHROPIC_API_KEY) log("ANTHROPIC_API_KEY not set: skipping AI scoring.");
  else if (!resume) log("No resume found (RESUME_TEXT secret or resume/resume.md): skipping AI scoring.");
  else {
    const scorer = new Scorer({ resume, profile });
    await scoreJobs(scorer, merged.filter((j) => j.active), {
      maxNew: profile.scoring.maxNewScoresPerRun,
      letterMin: profile.scoring.coverLetterMinScore,
      maxLetters: profile.scoring.maxCoverLettersPerRun,
    });
  }

  merged.sort((a, b) => (b.fit?.fit_score ?? -1) - (a.fit?.fit_score ?? -1) || b.firstSeen.localeCompare(a.firstSeen));

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: now,
        criteria: {
          minSalary: profile.salary.minAnnualUSD,
          targetRoles: profile.targetRoles,
          cities: profile.location.cities,
        },
        stats: {
          sourcesChecked,
          sourceErrors: sourceErrors.length,
          titleMatches: found.length,
          filteredOut,
          active: merged.filter((j) => j.active).length,
          newThisRun: newCount,
          scored: merged.filter((j) => j.fit).length,
        },
        jobs: merged,
      },
      null,
      1
    )
  );
  log(`Wrote ${merged.length} jobs to ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
