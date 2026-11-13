import { fetchJson, parseSalary, stableId, clip, annualize } from "../util.mjs";

// Ashby public Job Posting API: https://developers.ashbyhq.com/docs/public-job-posting-api
export async function fetchAshby(slug, titleMatches) {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  return (data.jobs || [])
    .filter((j) => j.isListed !== false && titleMatches(j.title))
    .map((j) => {
      const comp = j.compensation || {};
      const salaryPart = (comp.summaryComponents || []).find(
        (c) => c.compensationType === "Salary" && (c.currencyCode || "USD") === "USD"
      );
      const salary =
        (salaryPart && annualize(salaryPart.minValue, salaryPart.maxValue, intervalOf(salaryPart.interval))) ||
        parseSalary(comp.scrapeableCompensationSalarySummary || comp.compensationTierSummary || "") ||
        parseSalary(j.descriptionPlain || "");
      const locs = [j.location, ...(j.secondaryLocations || []).map((l) => l.location)].filter(Boolean);
      return {
        id: stableId("ashby", slug, j.id),
        source: "Ashby",
        company: slug.charAt(0).toUpperCase() + slug.slice(1),
        title: j.title,
        location: locs.join(" / "),
        remote: j.isRemote || j.workplaceType === "Remote" || null,
        url: j.jobUrl,
        postedAt: j.publishedAt,
        salaryMin: salary?.min ?? null,
        salaryMax: salary?.max ?? null,
        description: clip(j.descriptionPlain || ""),
      };
    });
}

function intervalOf(interval = "") {
  // Ashby uses values like "1 YEAR", "1 HOUR", "1 MONTH"
  return interval.split(" ").pop() || "year";
}
