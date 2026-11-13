export function buildTitleMatcher(profile) {
  const seniority = new RegExp(profile.titleRules.seniority, "i");
  const domain = new RegExp(profile.titleRules.domain, "i");
  const exclude = new RegExp(profile.titleRules.exclude, "i");
  return (title = "") => seniority.test(title) && domain.test(title) && !exclude.test(title);
}

/** Returns null if the job passes, or a short reason string if it is filtered out. */
export function rejectReason(job, profile) {
  const min = profile.salary.minAnnualUSD;
  if (job.salaryMax != null && job.salaryMax < min) {
    return `pay tops out at $${Math.round(job.salaryMax / 1000)}K`;
  }
  if (!locationOk(job, profile.location)) return `location: ${job.location || "unknown"}`;
  return null;
}

function locationOk(job, loc) {
  const text = (job.location || "").toLowerCase();
  const mentionsRemote = job.remote || /remote|anywhere|distributed/.test(text);
  const cityHit = loc.cities.some((c) => text.includes(c.toLowerCase()));
  if (cityHit) return true;
  if (!mentionsRemote || !loc.remoteOK) return false;
  // Remote: allow if no region is named, or a named region is one he can work from.
  const stripped = text.replace(/remote|hybrid|[()\-–,/;|]/g, " ").trim();
  if (!stripped) return true;
  return loc.remoteRegions.some((r) => new RegExp(`\\b${escapeRe(r)}\\b`, "i").test(text));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Same role cross-posted on several boards collapses to one entry (first source wins). */
export function dedupeKey(job) {
  const norm = (s = "") =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(of|the|and|inc|llc|ltd|co)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return `${norm(job.company)}::${norm(job.title)}`;
}
