import { fetchJson, htmlToText, parseSalary, stableId, clip, mapLimit } from "../util.mjs";

// Greenhouse public Job Board API: https://developers.greenhouse.io/job-board.html
export async function fetchGreenhouse(slug, titleMatches) {
  const list = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  const hits = (list.jobs || []).filter((j) => titleMatches(j.title));
  // Only pull full descriptions for jobs whose title already matched (keeps requests small).
  return mapLimit(hits, 4, async (j) => {
    let content = "";
    let pay = null;
    try {
      const d = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${j.id}?pay_transparency=true`);
      content = htmlToText(d.content || "");
      const range = d.pay_input_ranges?.[0];
      if (range && (range.currency_type || "USD") === "USD") {
        pay = { min: range.min_cents / 100, max: range.max_cents / 100 };
      }
    } catch {
      /* description is optional */
    }
    const salary = pay || parseSalary(content);
    const location = j.location?.name || "";
    return {
      id: stableId("greenhouse", slug, j.id),
      source: "Greenhouse",
      company: j.company_name || slug,
      title: j.title,
      location,
      remote: /remote/i.test(location) || null,
      url: j.absolute_url,
      postedAt: j.first_published || j.updated_at,
      salaryMin: salary?.min ?? null,
      salaryMax: salary?.max ?? null,
      description: clip(content),
    };
  });
}
