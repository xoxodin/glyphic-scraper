import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DATA_DIR = join(REPO_ROOT, "data");
const OUTPUT_FILE = join(DATA_DIR, "unicode-styles.json");

function normalizeUrl(url, base) {
  try { return new URL(url, base).toString(); } catch { return null; }
}

function isInScope(url) {
  try {
    const source = new URL(process.env.SOURCE_URL || "https://example.com");
    const target = new URL(url);
    return source.origin === target.origin;
  } catch { return false; }
}

function looksSpecial(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 220) return false;
  const hasUnicode = /[^\x00-\x7F]/.test(trimmed);
  const hasCombining = /[\u0300-\u036f]/.test(trimmed);
  const hasKaomojiMarks = /[()_\uFF3E\u25CF\u25D5\u0910\u0920\u0925\u72B9\u2570\u2572\u30C4\u30CE\u30FC\u309A\u2727\u2665\u2661]/.test(trimmed);
  const symbolHeavy = (trimmed.match(/[\p{S}\p{P}]/gu) || []).length >= Math.max(3, Math.floor(trimmed.length * 0.25));
  return hasUnicode || hasCombining || hasKaomojiMarks || symbolHeavy;
}

function scoreCandidate(sample, name) {
  const s = (sample || "").trim();
  const n = (name || "").trim();
  let score = 0;
  if (looksSpecial(s)) score += 3;
  if (s.length >= 2 && s.length <= 120) score += 1;
  if (n) score += 1;
  if (/copy/i.test(n)) score -= 2;
  if (/^(home|about|menu|search|login|sign in|sign up)$/i.test(n)) score -= 5;
  return score;
}

function deriveId(name, sample, index) {
  const base = (name || sample || "style-" + (index + 1)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "style-" + (index + 1);
}

function extractStyles(html, sourceUrl) {
  const $ = cheerio.load(html);
  const out = [];
  const seen = new Set();
  const candidates = [];
  $("[class*=\"FontCard\"]").each((_, el) => candidates.push(el));
  $("[class*=\"FontList_item\"]").each((_, el) => candidates.push(el));
  $("li, article, section").each((_, el) => candidates.push(el));
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    const $el = $(el);
    const title = [
      $el.find("[class*=\"FontCard_title\"]").first().text().trim(),
      $el.find("h1, h2, h3").first().text().trim(),
      $el.find("strong, b").first().text().trim(),
    ].find(Boolean) || "";
    const sample = [
      $el.find("[class*=\"FontCard_text\"]").first().text().trim(),
      $el.find("button").length ? $el.find("button").prevAll().first().text().trim() : "",
      $el.clone().children("button, h1, h2, h3, strong, b").remove().end().text().replace(/\s+/g, " ").trim(),
    ].find(t => looksSpecial(t) && t.length) || "";
    const nearestCopyButton = $el.find("button").length > 0;
    const score = scoreCandidate(sample, title) + (nearestCopyButton ? 2 : 0);
    if (score < 3) continue;
    const key = (title + "|||" + sample).trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const safeName = title || sample || ("Style " + (out.length + 1));
    out.push({ id: deriveId(safeName, sample, out.length), name: safeName, sample, category: null, sourceUrl });
  }
  const uniq = [];
  const ids = new Set();
  for (const item of out) { if (!ids.has(item.id)) { ids.add(item.id); uniq.push(item); } }
  return uniq;
}

async function fetchStaticHtml(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch " + url + ": " + res.status + " " + res.statusText);
  return res.text();
}

async function fetchRenderedHtml(url) {
  const browser = await puppeteer.launch({ headless: "new" });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 1200));
    return await page.content();
  } finally { await browser.close(); }
}

async function fetchHtmlByMode(url, mode) {
  if (mode === "fetch") return fetchStaticHtml(url);
  if (mode === "puppeteer") return fetchRenderedHtml(url);
  try { return await fetchStaticHtml(url); } catch { return await fetchRenderedHtml(url); }
}

async function mergeIntoRepo(newStyles) {
  await mkdir(DATA_DIR, { recursive: true });
  let existing = [];
  try { existing = JSON.parse(await readFile(OUTPUT_FILE, "utf8")); } catch {}
  const byId = new Map(existing.map(s => [s.id, s]));
  let added = 0, updated = 0;
  for (const s of newStyles) {
    if (!s.id) continue;
    if (byId.has(s.id)) { byId.set(s.id, Object.assign({}, byId.get(s.id), s)); updated += 1; }
    else { byId.set(s.id, s); added += 1; }
  }
  const merged = [...byId.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  await writeFile(OUTPUT_FILE, JSON.stringify(merged, null, 2), "utf8");
  return { added, updated, total: merged.length };
}

async function crawl(startUrl, mode, maxPages) {
  const visited = new Set();
  const queue = [startUrl];
  const styles = [];
  let pages = 0;
  while (queue.length && pages < maxPages) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    pages += 1;
    let html;
    try { html = await fetchHtmlByMode(url, mode); } catch (e) { console.error("FETCH_FAIL", url, e.message || e); continue; }
    const found = extractStyles(html, url);
    styles.push(...found);
    const $ = cheerio.load(html);
    $("a[href]").each((_, el) => {
      const abs = normalizeUrl($(el).attr("href"), url);
      if (!abs) return;
      if (isInScope(abs) && !visited.has(abs) && !queue.includes(abs)) queue.push(abs);
    });
  }
  return styles;
}

export async function runScraper(urls, mode, maxPages) {
  const allStyles = [];
  for (const url of urls) {
    console.log("Crawling:", url);
    const styles = await crawl(url, mode, maxPages);
    console.log("Extracted " + styles.length + " styles from " + url);
    allStyles.push(...styles);
  }
  const res = await mergeIntoRepo(allStyles);
  console.log("Merge complete. Added " + res.added + ", updated " + res.updated + ", total " + res.total);
  return { message: "Done", results: res, styles: allStyles };
}
