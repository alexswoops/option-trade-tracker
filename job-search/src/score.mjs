import Anthropic from "@anthropic-ai/sdk";
import { log } from "./util.mjs";

const FIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fit_score", "verdict", "summary", "why_fit", "gaps", "red_flags", "salary_note", "pitch", "resume_emphasis"],
  properties: {
    fit_score: { type: "integer", description: "0-100. 85+ = apply today, 70-84 = worth applying, 50-69 = stretch, <50 = skip." },
    verdict: { type: "string", enum: ["strong", "good", "stretch", "skip"] },
    summary: { type: "string", description: "One sentence: what the role actually is." },
    why_fit: { type: "array", items: { type: "string" }, description: "2-4 specific overlaps between his experience and the role." },
    gaps: { type: "array", items: { type: "string" }, description: "Requirements he does not clearly meet. Empty if none." },
    red_flags: { type: "array", items: { type: "string" }, description: "Title inflation, pay mismatch, scope problems, etc. Empty if none." },
    salary_note: { type: "string", description: "Posted range vs his floor, or an estimate if unposted." },
    pitch: { type: "string", description: "2-3 sentence opener for a cover note or recruiter message, in first person, grounded only in the resume." },
    resume_emphasis: { type: "array", items: { type: "string" }, description: "2-4 resume bullets or achievements to move to the top for this application." },
  },
};

const LETTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cover_letter"],
  properties: { cover_letter: { type: "string" } },
};

export class Scorer {
  constructor({ resume, profile }) {
    this.client = new Anthropic();
    this.model = profile.scoring.model;
    // Frozen system prompt: resume + criteria. Identical every call, so it is prompt-cached.
    this.system = [
      {
        type: "text",
        text: [
          "You evaluate job postings for one specific candidate and help him apply.",
          "Be candid. A wrong 'strong' wastes his time; a missed fit costs him an opportunity.",
          "Never invent experience, employers, metrics, or credentials that are not in the resume.",
          "",
          "<search_criteria>",
          `Target: Director-level (or above) editorial, content strategy, and adjacent leadership roles.`,
          `Target titles: ${profile.targetRoles.join("; ")}.`,
          `Minimum base salary: $${profile.salary.minAnnualUSD.toLocaleString()} USD/year. If a posting lists no pay, estimate whether it plausibly clears that bar given company and level.`,
          `Location: remote in the US${profile.location.cities.length ? `, or on-site/hybrid in ${profile.location.cities.join(", ")}` : ""}.`,
          "</search_criteria>",
          "",
          "<resume>",
          resume,
          "</resume>",
        ].join("\n"),
        cache_control: { type: "ephemeral" },
      },
    ];
  }

  async #call(userText, schema, maxTokens) {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      // If a safety classifier declines (rare false positives), retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: this.system,
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: userText }],
    });
    if (response.stop_reason === "refusal") throw new Error(`declined (${response.stop_details?.category ?? "unknown"})`);
    if (response.stop_reason === "max_tokens") throw new Error("output truncated (max_tokens)");
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return JSON.parse(text);
  }

  async score(job) {
    const pay =
      job.salaryMin || job.salaryMax
        ? `$${fmtK(job.salaryMin)} to $${fmtK(job.salaryMax)}`
        : "not posted";
    return this.#call(
      [
        "Evaluate this posting for the candidate.",
        "",
        `<job>`,
        `Company: ${job.company}`,
        `Title: ${job.title}`,
        `Location: ${job.location}${job.remote ? " (remote)" : ""}`,
        `Posted pay: ${pay}`,
        `Source: ${job.source}`,
        "",
        job.description || "(no description available; judge from title and company)",
        `</job>`,
      ].join("\n"),
      FIT_SCHEMA,
      8000
    );
  }

  async coverLetter(job) {
    const out = await this.#call(
      [
        "Write a cover letter for this application, 220-300 words, plain text, no placeholders like [Company].",
        "Confident and specific, not generic. Open with why this role at this company, then 2 concrete proof points from the resume, then a short close.",
        "Sign off with just 'Best,' and leave the name line blank for him to fill in.",
        "",
        `<job>`,
        `Company: ${job.company}`,
        `Title: ${job.title}`,
        job.description,
        `</job>`,
        "",
        `Notes from the fit review: ${job.fit.why_fit.join(" | ")}`,
      ].join("\n"),
      LETTER_SCHEMA,
      8000
    );
    return out.cover_letter;
  }
}

const fmtK = (n) => (n == null ? "?" : `${Math.round(n / 1000)}K`);

export async function scoreJobs(scorer, jobs, { maxNew, letterMin, maxLetters }) {
  const toScore = jobs.filter((j) => !j.fit).slice(0, maxNew);
  log(`Scoring ${toScore.length} new job(s) with Claude (${jobs.filter((j) => !j.fit).length} unscored total)`);
  for (const job of toScore) {
    try {
      job.fit = await scorer.score(job);
      job.scoredAt = new Date().toISOString();
      log(`  ${job.fit.fit_score.toString().padStart(3)}  ${job.company} | ${job.title}`);
    } catch (err) {
      logApiError(`  score failed: ${job.company} | ${job.title}`, err);
      if (err instanceof Anthropic.AuthenticationError) break;
    }
  }

  const needLetters = jobs
    .filter((j) => j.active && j.fit && j.fit.fit_score >= letterMin && !j.coverLetter)
    .sort((a, b) => b.fit.fit_score - a.fit.fit_score)
    .slice(0, maxLetters);
  for (const job of needLetters) {
    try {
      job.coverLetter = await scorer.coverLetter(job);
      log(`  drafted cover letter: ${job.company} | ${job.title}`);
    } catch (err) {
      logApiError(`  cover letter failed: ${job.company}`, err);
    }
  }
}

function logApiError(prefix, err) {
  if (err instanceof Anthropic.AuthenticationError) log(`${prefix}: invalid ANTHROPIC_API_KEY`);
  else if (err instanceof Anthropic.RateLimitError) log(`${prefix}: rate limited`);
  else if (err instanceof Anthropic.APIError) log(`${prefix}: API ${err.status} ${err.message}`);
  else log(`${prefix}: ${err.message}`);
}
