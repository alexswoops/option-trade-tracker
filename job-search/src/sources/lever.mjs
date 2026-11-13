import { fetchJson, parseSalary, stableId, clip, annualize } from "../util.mjs";

// Lever public Postings API: https://github.com/lever/postings-api
export async function fetchLever(slug, titleMatches) {
  const list = await fetchJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  return list
    .filter((j) => titleMatches(j.text))
    .map((j) => {
      const text = [j.descriptionPlain, ...(j.lists || []).map((l) => `${l.text}\n${l.content}`), j.additionalPlain]
        .filter(Boolean)
        .join("\n\n")
        .replace(/<[^>]+>/g, " ");
      const sr = j.salaryRange;
      const salary =
        sr && (sr.currency || "USD") === "USD"
          ? annualize(sr.min, sr.max, (sr.interval || "per-year-salary").replace("per-", "").replace("-salary", ""))
          : parseSalary(text);
      const location = j.categories?.location || "";
      return {
        id: stableId("lever", slug, j.id),
        source: "Lever",
        company: slug.charAt(0).toUpperCase() + slug.slice(1),
        title: j.text,
        location,
        remote: j.workplaceType === "remote" || /remote/i.test(location) || null,
        url: j.hostedUrl,
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        salaryMin: salary?.min ?? null,
        salaryMax: salary?.max ?? null,
        description: clip(text),
      };
    });
}
