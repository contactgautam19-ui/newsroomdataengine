// sources.js — fetch top India stories from MANY providers in parallel and merge.
// More providers => the same event shows up from multiple publishers => higher
// corroboration (distinctSources) => higher confidence => better ranking.
// Each provider is skipped automatically if its key (env var) is not set or it errors.
// Normalized story shape:
//   { id, title, description, publisher, url, publishedAt(Date),
//     imageUrl, videoUrl, sourceIds:Set<publisher>, category, country, language }
import { CONFIG } from "./config.js";

const ts = (s) => { const d = new Date(s); return isNaN(d) ? new Date() : d; };
const idOf = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
const mk = (o) => ({ videoUrl: null, imageUrl: null, category: "top",
  country: CONFIG.region.country, language: CONFIG.region.languages[0],
  sourceIds: new Set([o.publisher].filter(Boolean)), ...o, id: idOf(o.title) });
const J = async (url, opt) => { const r = await fetch(url, opt); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };

/* ----------------------------- PROVIDERS ---------------------------------- */
// 1) NewsData.io  — env NEWSDATA_KEY   (docs: newsdata.io/documentation)
async function newsdata() {
  const key = process.env.NEWSDATA_KEY; if (!key) return [];
  const u = new URL("https://newsdata.io/api/1/latest");
  u.searchParams.set("apikey", key);
  u.searchParams.set("country", CONFIG.region.country);
  u.searchParams.set("language", CONFIG.region.languages.join(","));
  u.searchParams.set("removeduplicate", "1");
  const j = await J(u);
  return (j.results || []).map((a) => mk({
    title: a.title, description: a.description || a.content || "", publisher: a.source_name || a.source_id || "NewsData",
    url: a.link, publishedAt: ts(a.pubDate), imageUrl: a.image_url || null, videoUrl: a.video_url || null,
    category: (a.category || ["top"])[0],
  }));
}
// 2) NewsAPI.org — env NEWSAPI_ORG_KEY (docs: newsapi.org/docs)
async function newsapiorg() {
  const key = process.env.NEWSAPI_ORG_KEY; if (!key) return [];
  const u = new URL("https://newsapi.org/v2/top-headlines");
  u.searchParams.set("country", CONFIG.region.country);
  u.searchParams.set("pageSize", "40");
  u.searchParams.set("apiKey", key);
  const j = await J(u, { headers: { "User-Agent": "newsroom-engine" } });
  return (j.articles || []).map((a) => mk({
    title: a.title, description: a.description || "", publisher: a.source?.name || "NewsAPI.org",
    url: a.url, publishedAt: ts(a.publishedAt), imageUrl: a.urlToImage || null,
  }));
}
// 3) NewsAPI.ai / Event Registry — env NEWSAPI_AI_KEY (docs: newsapi.ai/documentation)
async function newsapiai() {
  const key = process.env.NEWSAPI_AI_KEY; if (!key) return [];
  const body = { action: "getArticles", resultType: "articles", articlesSortBy: "date",
    articlesCount: 40, includeArticleImage: true, dataType: ["news"],
    lang: ["eng", "hin"], sourceLocationUri: ["http://en.wikipedia.org/wiki/India"], apiKey: key };
  const j = await J("https://eventregistry.org/api/v1/article/getArticles",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return ((j.articles && j.articles.results) || []).map((a) => mk({
    title: a.title, description: (a.body || "").slice(0, 400), publisher: a.source?.title || "NewsAPI.ai",
    url: a.url, publishedAt: ts(a.dateTimePub || a.dateTime), imageUrl: a.image || null,
  }));
}
// 4) World News API — env WORLDNEWS_KEY (docs: worldnewsapi.com/docs)
async function worldnews() {
  const key = process.env.WORLDNEWS_KEY; if (!key) return [];
  const u = new URL("https://api.worldnewsapi.com/search-news");
  u.searchParams.set("source-country", CONFIG.region.country);
  u.searchParams.set("language", "en");
  u.searchParams.set("sort", "publish-time");
  u.searchParams.set("sort-direction", "DESC");
  u.searchParams.set("number", "40");
  u.searchParams.set("api-key", key);
  const j = await J(u);
  return (j.news || []).map((a) => mk({
    title: a.title, description: (a.text || "").slice(0, 400),
    publisher: (a.authors && a.authors[0]) || a.source_country?.toUpperCase() || "WorldNews",
    url: a.url, publishedAt: ts(a.publish_date), imageUrl: a.image || null,
  }));
}
// 5) The News API — env THENEWSAPI_KEY (docs: thenewsapi.com/documentation)
async function thenewsapi() {
  const key = process.env.THENEWSAPI_KEY; if (!key) return [];
  const u = new URL("https://api.thenewsapi.com/v1/news/top");
  u.searchParams.set("locale", CONFIG.region.country);
  u.searchParams.set("language", "en");
  u.searchParams.set("limit", "25");
  u.searchParams.set("api_token", key);
  const j = await J(u);
  return (j.data || []).map((a) => mk({
    title: a.title, description: a.description || a.snippet || "", publisher: a.source || "TheNewsAPI",
    url: a.url, publishedAt: ts(a.published_at), imageUrl: a.image_url || null,
  }));
}
// 6) Webz.io News API Lite — env WEBZ_KEY (docs: docs.webz.io/reference/news-api-lite)
async function webz() {
  const key = process.env.WEBZ_KEY; if (!key) return [];
  const u = new URL("https://api.webz.io/newsApiLite");
  u.searchParams.set("token", key);
  u.searchParams.set("q", "site.country:IN language:english");
  const j = await J(u);
  return (j.posts || []).map((p) => mk({
    title: p.title, description: (p.text || "").slice(0, 400), publisher: p.thread?.site || "Webz.io",
    url: p.url, publishedAt: ts(p.published), imageUrl: p.thread?.main_image || null,
  }));
}
// 7) SerpAPI Google News — env SERPAPI_KEY (fallback)
async function serpapi() {
  const key = process.env.SERPAPI_KEY; if (!key) return [];
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google_news");
  u.searchParams.set("gl", CONFIG.region.country);
  u.searchParams.set("hl", CONFIG.region.languages[0]);
  u.searchParams.set("api_key", key);
  const j = await J(u);
  const items = (j.news_results || []).flatMap((n) => (n.stories ? n.stories : [n]));
  return items.map((a) => mk({
    title: a.title, description: a.snippet || "", publisher: a.source?.name || "Google News",
    url: a.link, publishedAt: ts(a.date), imageUrl: a.thumbnail || null,
  }));
}
// 8) Google News RSS — no key, always-on baseline. Pulls the last-hour search feed + top stories.
async function googlerss() {
  const { country, languages } = CONFIG.region; const C = country.toUpperCase(), L = languages[0];
  const feeds = [
    `https://news.google.com/rss/search?q=when:${CONFIG.freshnessHours}h&hl=${L}-${C}&gl=${C}&ceid=${C}:${L}`,
    `https://news.google.com/rss?hl=${L}-${C}&gl=${C}&ceid=${C}:${L}`,
  ];
  const pick = (b, tag) => (b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [, ""])[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  const out = [];
  for (const f of feeds) {
    try {
      const xml = await (await fetch(f)).text();
      for (const m of [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 25)) {
        const b = m[1], rawTitle = pick(b, "title");
        const source = pick(b, "source") || (rawTitle.split(" - ").pop() || "Google News");
        out.push(mk({
          title: rawTitle.replace(new RegExp(`\\s-\\s${source}$`), ""),
          description: pick(b, "description").replace(/<[^>]+>/g, " ").slice(0, 300),
          publisher: source, url: pick(b, "link"), publishedAt: ts(pick(b, "pubDate")),
        }));
      }
    } catch { /* skip this feed */ }
  }
  return out;
}

// 9) GDELT DOC 2.0 — FREE, no key, real-time (15-min latency), India filter via FIPS "IN".
async function gdelt() {
  const u = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  u.searchParams.set("query", "sourcecountry:IN sourcelang:english");
  u.searchParams.set("mode", "ArtList");
  u.searchParams.set("format", "json");
  u.searchParams.set("timespan", `${Math.max(1, CONFIG.freshnessHours)}h`);
  u.searchParams.set("sort", "DateDesc");
  u.searchParams.set("maxrecords", "75");
  const j = await J(u);
  return (j.articles || []).map((a) => mk({
    title: a.title, description: "", publisher: a.domain || "GDELT",
    url: a.url, imageUrl: a.socialimage || null,
    publishedAt: ts((a.seendate || "").replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z")),
  }));
}
// 10) Direct Indian-publisher RSS feeds — FREE, no key, real-time, distinct publishers.
async function rssfeeds() {
  const pick = (b, tag) => (b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [, ""])[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  const out = [];
  await Promise.all((CONFIG.indiaFeeds || []).map(async (feed) => {
    try {
      const xml = await (await fetch(feed.url)).text();
      for (const m of [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)].slice(0, 20)) {
        const b = m[1], title = pick(b, "title");
        if (!title) continue;
        out.push(mk({
          title, description: pick(b, "description").replace(/<[^>]+>/g, " ").slice(0, 300),
          publisher: feed.name, url: pick(b, "link"), publishedAt: ts(pick(b, "pubDate")),
        }));
      }
    } catch { /* skip a dead feed */ }
  }));
  return out;
}

const PROVIDERS = { newsdata, newsapiorg, newsapiai, worldnews, thenewsapi, webz, serpapi, googlerss, gdelt, rssfeeds };

/* --------------------- fetch ALL, then merge + dedupe --------------------- */
export async function fetchTopStories() {
  const names = CONFIG.sources.filter((n) => PROVIDERS[n]);
  const results = await Promise.allSettled(names.map((n) => PROVIDERS[n]()));
  const used = [], all = [], counts = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length) { used.push(names[i]); counts[names[i]] = r.value.length; all.push(...r.value); }
    else if (r.status === "rejected") console.warn(`[sources] ${names[i]} failed: ${r.reason?.message}`);
  });
  return { provider: used.join("+") || "none", providers: used, counts, stories: dedupe(all) };
}

// Google Trends — real-time daily trending searches for the region (free, no key).
// Returns a list of currently-trending query terms used to boost the search variable.
export async function fetchTrends() {
  try {
    const u = `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${CONFIG.trendsGeo}`;
    const xml = await (await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
    return items.map((m) => (m[1].match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1]
      .replace(/<!\[CDATA\[|\]\]>/g, "").trim().toLowerCase()).filter(Boolean).slice(0, 30);
  } catch { return []; }
}

// Merge near-duplicate stories across providers; union their publisher sourceIds.
function dedupe(stories) {
  const sig = (t) => (t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/).filter((w) => w.length >= 4).slice(0, 6).join("-");
  const map = new Map();
  for (const s of stories) {
    const key = sig(s.title) || s.id;
    if (map.has(key)) {
      const e = map.get(key);
      s.sourceIds.forEach((x) => e.sourceIds.add(x));
      if (!e.imageUrl && s.imageUrl) e.imageUrl = s.imageUrl;
      if (s.publishedAt > e.publishedAt) e.publishedAt = s.publishedAt; // keep freshest timestamp
    } else map.set(key, s);
  }
  return [...map.values()];
}
