// config.js — single place to tune the engine.
export const CONFIG = {
  region:   { country: "in", languages: ["en", "hi"] }, // India, multi-language
  runSize:  5,            // stories pulled per run
  rePollMinutes: 5,       // re-poll if the hour's set shows no engagement signal
  confidenceThreshold: 70, // < this  => flag for human review (HOLD)
  twoSourceMinForBreaking: 2, // major breaking needs >= this many distinct sources
  staleHours: 6,          // a story unchanged for longer than this gets a decay penalty
  staleDecay: 0.85,       // multiply intensities by this when stale & not materially developed

  // 9 evidence variables. Weights sum to 110 and are normalized to 100.
  weights: {
    breaking: 15, emotion: 15, political: 12, celebrity: 10, money: 12,
    safety: 15, visual: 8, unexpected: 8, search: 15
  },

  // Source priority: try in order, stop at first that returns results.
  sources: ["newsdata", "serpapi", "googlerss"],
};

export const WEIGHT_SUM = Object.values(CONFIG.weights).reduce((a, b) => a + b, 0); // 110
