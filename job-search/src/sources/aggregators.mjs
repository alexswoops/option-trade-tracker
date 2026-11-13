import { fetchJson, htmlToText, parseSalary, stableId, clip, annualize } from "../util.mjs";

// Himalayas (remote jobs): https://himalayas.app/api
export async function fetchHimalayas(query, titleMatches, pages = 2) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const data = await fetchJson(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(query)}&page=${page}`);
    for (const j of data.jobs || []) {
      if (!titleMatches(j.title)) continue;
      const usd = !j.currency || j.currency === "USD";
      const salary = usd ? annualize(j.minSalary, j.maxSalary, j.salaryPeriod) : null;
      out.push({
        id: stableId("himalayas", j.guid),
        source: "Himalayas",
        company: j.companyName,
        title: j.title,
        location: (j.locationRestrictions || []).join(", ") || "Remote (anywhere)",
        remote: true,
        url: j.applicationLink || j.guid,
        postedAt: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : null,
        salaryMin: salary?.min ?? null,
        salaryMax: salary?.max ?? null,
        description: clip(htmlToText(j.description || j.excerpt || "")),
      });
    }
    if ((data.jobs || []).length < 20) break;
  }
  return out;
}

// Remotive (remote jobs): https://remotive.com/api-documentation
export async function fetchRemotive(query, titleMatches) {
  const data = await fetchJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}`);
  return (data.jobs || [])
    .filter((j) => titleMatches(j.title))
    .map((j) => {
      const description = htmlToText(j.description || "");
      const salary = parseSalary(j.salary || "") || parseSalary(description);
      return {
        id: stableId("remotive", j.id),
        source: "Remotive",
        company: j.company_name,
        title: j.title,
        location: j.candidate_required_location || "Remote",
        remote: true,
        url: j.url,
        postedAt: j.publication_date ? new Date(j.publication_date + "Z").toISOString() : null,
        salaryMin: salary?.min ?? null,
        salaryMax: salary?.max ?? null,
        description: clip(description),
      };
    });
}

// Jobicy (remote jobs): https://jobicy.com/jobs-rss-feed  (API docs: https://jobi.cy/apidocs)
export async function fetchJobicy(query, titleMatches) {
  const data = await fetchJson(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(query)}`);
  return (data.jobs || [])
    .filter((j) => titleMatches(decode(j.jobTitle)))
    .map((j) => {
      const usd = !j.salaryCurrency || j.salaryCurrency === "USD";
      const salary = usd ? annualize(j.salaryMin, j.salaryMax, j.salaryPeriod) : null;
      return {
        id: stableId("jobicy", j.id),
        source: "Jobicy",
        company: decode(j.companyName),
        title: decode(j.jobTitle),
        location: j.jobGeo || "Remote",
        remote: true,
        url: j.url,
        postedAt: j.pubDate ? new Date(j.pubDate).toISOString() : null,
        salaryMin: salary?.min ?? null,
        salaryMax: salary?.max ?? null,
        description: clip(htmlToText(j.jobDescription || j.jobExcerpt || "")),
      };
    });
}

const decode = (s = "") => htmlToText(s);
