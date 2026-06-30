// sources.js — fetch the top stories, normalize to one common shape.
// Priority: NewsData.io (primary)  ->  SerpAPI Google News  ->  Google News RSS (free, no key).
// Every story is normalized to:
//   { id, title, description, publisher, url, publishedAt(Date),
//     imageUrl, videoUrl, sourceIds:Set, category, country, language }
import { CONFIG } from "./config.js";

const ts = (s) => { const d = new Date(s); return isNaN(d) ? new Date() : d; };
const idOf = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);

// ---------- 1) NewsData.io (primary) ----------
// Docs: https://newsdata.io/documentation  | key -> env NEWSDATA_KEY
async function fromNewsData() {
  const key = process.env.NEWSDATA_KEY;
  if (!key) return [];
  const { country, languages } = CONFIG.region;
  const url = new URL("https://newsdata.io/api/1/latest");
  url.searchParams.set("apikey", key);
  url.searchParams.set("country", country);
  url.searchParams.set("language", languages.join(","));
  url.searchParams.set("image", "1");      // prefer stories that carry an image
  url.searchParams.set("removeduplicate", "1");
  const r = await fetch(url);
  if (!r.ok) throw new Error(`NewsData ${r.status}`);
  const j = await r.json();
  return (j.results || []).map((a) => ({
    id: idOf(a.title),
    title: a.title,
    description: a.description || a.content || "",
    publisher: a.source_name || a.source_id || "Unknown",
    url: a.link,
    publishedAt: ts(a.pubDate),
    imageUrl: a.image_url || null,
    videoUrl: a.video_url || null,
    sourceIds: new Set([a.source_id].filter(Boolean)),
    category: (a.category || ["top"])[0],
    country, language: (a.language || languages[0]),
  }));
}

// ---------- 2) SerpAPI – Google News engine (backup) ----------
// Docs: https://serpapi.com/google-news-api | key -> env SERPAPI_KEY
async function fromSerpApi() {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_news");
  url.searchParams.set("gl", CONFIG.region.country);
  url.searchParams.set("hl", CONFIG.region.languages[0]);
  url.searchParams.set("api_key", key);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`SerpAPI ${r.status}`);
  const j = await r.json();
  const items = (j.news_results || []).flatMap((n) => (n.stories ? n.stories : [n]));
  return items.map((a) => ({
    id: idOf(a.title),
    title: a.title,
    description: a.snippet || "",
    publisher: a.source?.name || "Google News",
    url: a.link,
    publishedAt: ts(a.date),
    imageUrl: a.thumbnail || a.thumbnail_small || null,
    videoUrl: null,
    sourceIds: new Set([a.source?.name].filter(Boolean)),
    category: "top",
    country: CONFIG.region.country, language: CONFIG.region.languages[0],
  }));
}

// ---------- 3) Google News RSS (free fallback; no images) ----------
// We fetch the article's og:image afterwards so cards still have a picture.
async function fromGoogleRss() {
  const { country, languages } = CONFIG.region;
  const u = `https://news.google.com/rss?hl=${languages[0]}-${country.toUpperCase()}` +
            `&gl=${country.toUpperCase()}&ceid=${country.toUpperCase()}:${languages[0]}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`GoogleRSS ${r.status}`);
  const xml = await r.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15);
  const pick = (b, tag) => (b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [, ""])[1]
    .replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  const out = items.map((m) => {
    const b = m[1];
    const rawTitle = pick(b, "title");
    const source = pick(b, "source") || (rawTitle.split(" - ").pop() || "Google News");
    return {
      id: idOf(rawTitle),
      title: rawTitle.replace(new RegExp(`\\s-\\s${source}$`), ""),
      description: pick(b, "description").replace(/<[^>]+>/g, " ").slice(0, 400),
      publisher: source,
      url: pick(b, "link"),
      publishedAt: ts(pick(b, "pubDate")),
      imageUrl: null, videoUrl: null,
      sourceIds: new Set([source]),
      category: "top", country, language: languages[0],
    };
  });
  // Enrich the top few with og:image so the dashboard has real pictures.
  await Promise.all(out.slice(0, CONFIG.runSize + 3).map(async (s) => {
    try {
      const res = await fetch(s.url, { redirect: "follow" });
      const html = await res.text();
      const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (og) s.imageUrl = og[1];
    } catch { /* leave imageUrl null -> publisher-logo fallback in render */ }
  }));
  return out;
}

const PROVIDERS = { newsdata: fromNewsData, serpapi: fromSerpApi, googlerss: fromGoogleRss };

// Try sources in configured priority order; return {stories, provider}.
export async function fetchTopStories() {
  for (const name of CONFIG.sources) {
    try {
      const stories = await PROVIDERS[name]();
      if (stories && stories.length) {
        return { provider: name, stories: dedupe(stories) };
      }
    } catch (e) {
      console.warn(`[sources] ${name} failed: ${e.message} -> trying next`);
    }
  }
  return { provider: "none", stories: [] };
}

// Merge near-duplicate stories across sources; union their sourceIds (used for the 2-source rule).
function dedupe(stories) {
  const map = new Map();
  for (const s of stories) {
    const key = s.id.split("-").slice(0, 6).join("-");
    if (map.has(key)) {
      const e = map.get(key);
      s.sourceIds.forEach((x) => e.sourceIds.add(x));
      if (!e.imageUrl && s.imageUrl) e.imageUrl = s.imageUrl;
    } else map.set(key, s);
  }
  return [...map.values()];
}
