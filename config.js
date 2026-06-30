// config.js — single place to tune the engine.
export const CONFIG = {
  region:   { country: "in", languages: ["en", "hi"] }, // India, multi-language
  runSize:  5,            // stories SHOWN per run (the top-scoring 5 of the pool)
  candidatePool: 60,      // how many fresh stories to fetch & score before picking the top runSize
  freshnessHours: 1,      // only consider stories published within this many hours (relaxes if too few)
  rePollMinutes: 5,       // re-poll if the hour's set shows no engagement signal
  confidenceThreshold: 70, // < this  => flag for human review (HOLD)
  twoSourceMinForBreaking: 2, // major breaking needs >= this many distinct sources
  staleHours: 6,          // a story unchanged for longer than this gets a decay penalty
  staleDecay: 0.85,       // multiply intensities by this when stale & not materially developed

  // 9 evidence variables. Weights sum to 110.
  weights: {
    breaking: 15, emotion: 15, political: 12, celebrity: 10, money: 12,
    safety: 15, visual: 8, unexpected: 8, search: 15
  },

  // Calibrated editorial display scale. The raw score (intensity x weight) rarely
  // lights up all 9 dims, so a strong lead only reaches ~35/110 raw. This curve maps
  // raw -> an intuitive 0-100 where a strong lead reads ~70-90. Ranking is unchanged
  // (monotonic); the per-variable breakdown still shows the raw contributions.
  calibration: { ref: 62, gamma: 0.72 },

  // ALL keyed sources + free no-key sources are queried in parallel and MERGED.
  // More sources => more corroboration => higher confidence => better ranking.
  sources: [
    // free, no signup, real-time:
    "gdelt", "rssfeeds", "googlerss",
    // keyed (added automatically when the env var is set):
    "newsdata", "newsapiorg", "newsapiai", "worldnews", "thenewsapi", "webz", "serpapi",
  ],

  // Direct Indian-publisher RSS feeds (free, real-time, no key). Each is a distinct
  // publisher, so when the same event appears across several, corroboration rises.
  indiaFeeds: [
    { name: "Times of India",   url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms" },
    { name: "NDTV",             url: "https://feeds.feedburner.com/ndtvnews-top-stories" },
    { name: "The Hindu",        url: "https://www.thehindu.com/news/national/feeder/default.rss" },
    { name: "Hindustan Times",  url: "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml" },
    { name: "Indian Express",   url: "https://indianexpress.com/section/india/feed/" },
    { name: "News18",           url: "https://www.news18.com/rss/india.xml" },
  ],
};

export const WEIGHT_SUM = Object.values(CONFIG.weights).reduce((a, b) => a + b, 0); // 110
