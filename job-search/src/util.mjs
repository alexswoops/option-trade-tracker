import { createHash } from "node:crypto";

const UA = "job-search-pipeline/1.0 (personal job search tool)";

export async function fetchJson(url, { timeoutMs = 20000, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) throw Object.assign(new Error(`404 ${url}`), { fatal: true });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (err.fatal) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

/** Run async fn over items with limited concurrency. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

export function decodeEntities(s = "") {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z#0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function htmlToText(html = "") {
  // Greenhouse double-encodes its HTML, so decode first, then strip tags.
  const decoded = decodeEntities(decodeEntities(html));
  return decodeEntities(
    decoded
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h\d|br)>|<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export function stableId(...parts) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

/**
 * Pull an annual USD salary range out of free text such as
 * "$160,000 - $200,000", "$160K–$210K", "USD 175000 to 220000 per year".
 * Hourly figures are annualized at 2080 hours. Returns null if nothing credible is found.
 */
export function parseSalary(text = "") {
  if (!text) return null;
  const t = text.replace(/–|—|\bto\b/gi, "-");
  const re = /\$\s?(\d{2,3}(?:[,.]\d{3})*(?:\.\d+)?)\s*(k|K)?\s*(?:USD)?\s*-\s*\$?\s?(\d{2,3}(?:[,.]\d{3})*(?:\.\d+)?)\s*(k|K)?(\s*(?:\/|per)\s*(?:hour|hr))?/g;
  let best = null;
  for (const m of t.matchAll(re)) {
    let lo = toNumber(m[1], m[2] || m[4]);
    let hi = toNumber(m[3], m[4] || m[2]);
    if (m[5]) {
      lo *= 2080;
      hi *= 2080;
    }
    if (lo < 30000 || hi > 2000000 || hi < lo) continue;
    if (!best || hi > best.max) best = { min: Math.round(lo), max: Math.round(hi) };
  }
  return best;
}

function toNumber(raw, kSuffix) {
  const n = Number(raw.replace(/,/g, ""));
  return kSuffix || n < 1000 ? n * 1000 : n;
}

export function annualize(min, max, period) {
  if (min == null && max == null) return null;
  const p = (period || "year").toLowerCase();
  const mult = p.startsWith("hour") ? 2080 : p.startsWith("month") ? 12 : p.startsWith("week") ? 52 : 1;
  return {
    min: min != null ? Math.round(min * mult) : null,
    max: max != null ? Math.round(max * mult) : null,
  };
}

export function clip(s = "", n = 7000) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
