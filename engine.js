// engine.js — the editorial brain.
// Auto-derives the 9 evidence intensities from each article via transparent
// lexicons (every score records the exact words that produced it), then applies
// the guardrails: two-source rule, confidence floor, stale-decay, celebrity cap.
import fs from "node:fs";
import path from "node:path";
import { CONFIG, WEIGHT_SUM } from "./config.js";

/* ----------------------------- LEXICONS ----------------------------------- */
// Editing these is how you tune editorial judgement. Each match is traceable.
const LEX = {
  emotion:   ["killed","dead","death","grief","mourning","tragedy","tragic","outrage","fury","anger",
              "fear","panic","horror","shock","terror","dread","heartbreak","devastat","trauma","cry"],
  political: ["prime minister","modi","chief minister","president","supreme court","high court",
              "election commission","parliament","lok sabha","rajya sabha","cabinet","minister",
              "governor","cji","army","defence","verdict","ruling","policy","bill","ordinance"],
  celebrity: ["actor","actress","bollywood","star","singer","cricketer","captain","film","movie",
              "box office","kohli","gavaskar","sharma","ambani","khan","celebrity","wedding","fan"],
  money:     ["crore","lakh","billion","rupee","sensex","nifty","market","fpi","gdp","inflation",
              "jobs","layoff","tax","budget","ipo","fund","economy","price","fuel","investor","stocks"],
  safety:    ["fire","flood","blast","explosion","attack","accident","crash","collapse","outbreak",
              "evacuat","landslide","earthquake","cyclone","rescue","killed","injured","toll","derail",
              "stampede","hospital","alert","warning","disaster","rain","storm"],
  visual:    ["drone","footage","video","viral","caught on camera","cctv","fire","flood","explosion",
              "crowd","rescue","clash","rally","protest","blaze","smoke","collapse"],
  unexpected:["sudden","unexpected","shock","surprise","freak","unprecedented","first-ever","record",
              "earthquake","collapse","mystery","stuns","upset"],
  // search-trend PROXY: India over-indexes on cricket / film / big-name events.
  search:    ["cricket","ipl","world cup","match","bollywood","viral","trending","election","result",
              "weather","gold","petrol","exam","recruitment"],
};

// saturating intensity from a hit count: 0->0, 1->0.40, 2->0.64, 3->0.78, 4->0.87
const sat = (hits) => +(1 - Math.pow(0.6, hits)).toFixed(3);

function lexHits(text, terms) {
  const t = (text || "").toLowerCase();
  const hits = terms.filter((w) => t.includes(w));
  return { hits, intensity: sat(hits.length) };
}

/* --------------------------- PER-STORY SCORING ---------------------------- */
export function scoreStory(s, now = new Date()) {
  const text = `${s.title} ${s.description}`;
  const minutesOld = Math.max(0, (now - s.publishedAt) / 60000);

  // breaking = recency + explicit "breaking/just in/live" cue
  let recency = minutesOld < 60 ? 0.9 : minutesOld < 180 ? 0.7 : minutesOld < 360 ? 0.5
              : minutesOld < 720 ? 0.35 : minutesOld < 1440 ? 0.2 : 0.1;
  const cue = /breaking|just in|live updates?/i.test(text) ? 0.1 : 0;
  const breaking = Math.min(1, recency + cue);

  const E = lexHits(text, LEX.emotion);
  const P = lexHits(text, LEX.political);
  const C = lexHits(text, LEX.celebrity);
  const M = lexHits(text, LEX.money);
  const S = lexHits(text, LEX.safety);
  const U = lexHits(text, LEX.unexpected);
  const SR = lexHits(text, LEX.search);
  const V = lexHits(text, LEX.visual);

  // visual gets a hard boost from real assets returned by the source
  const visual = Math.min(1, V.intensity + (s.imageUrl ? 0.25 : 0) + (s.videoUrl ? 0.35 : 0));

  const intensities = {
    breaking, emotion: E.intensity, political: P.intensity, celebrity: C.intensity,
    money: M.intensity, safety: S.intensity, visual, unexpected: U.intensity, search: SR.intensity,
  };

  // human-readable, evidence-based justification per variable
  const j = {
    breaking: `${Math.round(minutesOld)} min old${cue ? " + explicit 'breaking' cue" : ""}.`,
    emotion:  E.hits.length ? `Arousal words: ${E.hits.join(", ")}.` : "No high-arousal language.",
    political:P.hits.length ? `Power/policy signals: ${P.hits.join(", ")}.` : "No power figures.",
    celebrity:C.hits.length ? `Celebrity signals: ${C.hits.join(", ")}.` : "No celebrity draw.",
    money:    M.hits.length ? `Money signals: ${M.hits.join(", ")}.` : "No direct money impact.",
    safety:   S.hits.length ? `Public-safety signals: ${S.hits.join(", ")}.` : "No safety stakes.",
    visual:   `${V.hits.length ? "Visual words: " + V.hits.join(", ") + ". " : ""}${s.videoUrl ? "Video asset present. " : ""}${s.imageUrl ? "Image asset present." : "No image from source."}`,
    unexpected:U.hits.length ? `Surprise signals: ${U.hits.join(", ")}.` : "Expected / routine.",
    search:   SR.hits.length ? `Trend proxy hits: ${SR.hits.join(", ")} (proxy — wire Google Trends for real velocity).` : "Low trend proxy.",
  };

  const { raw, norm } = totals(intensities);
  const signature = [E, P, C, M, S, U, SR, V].flatMap((x) => x.hits).sort().join("|");
  const distinctSources = s.sourceIds ? s.sourceIds.size : 1;

  return { ...s, intensities, justify: j, raw, norm, signature, distinctSources,
           dominant: dominantVar(intensities) };
}

function totals(intensities) {
  let raw = 0;
  for (const k in CONFIG.weights) raw += intensities[k] * CONFIG.weights[k];
  raw = +raw.toFixed(2);
  return { raw, norm: +((raw / WEIGHT_SUM) * 100).toFixed(1) };
}
const dominantVar = (i) => Object.entries(i).sort((a, b) => b[1] - a[1])[0][0];

/* ------------------------------ STALENESS --------------------------------- */
const STATE = path.resolve("state/seen.json");
function loadSeen() { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; } }
function saveSeen(seen) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(seen, null, 2));
}

/* ------------------------------ GUARDRAILS -------------------------------- */
// Confidence from source corroboration, recency, image, and signal clarity.
function confidence(st, now) {
  const minutesOld = (now - st.publishedAt) / 60000;
  let c = 45;
  c += st.distinctSources >= 3 ? 32 : st.distinctSources === 2 ? 22 : 8;
  c += st.imageUrl ? 5 : 0;
  c += minutesOld < 360 ? 8 : 2;
  const vals = Object.values(st.intensities).sort((a, b) => b - a);
  c += (vals[0] - vals[1] > 0.25) ? 6 : 0; // decisive top signal => more confident
  return Math.max(20, Math.min(95, Math.round(c)));
}

export function rankRun(stories, now = new Date()) {
  const seen = loadSeen();
  let scored = stories.map((s) => scoreStory(s, now));

  // ---- stale-decay: seen before, aged past staleHours, signature unchanged ----
  for (const st of scored) {
    const prev = seen[st.id];
    const ageH = prev ? (now - new Date(prev.firstSeen)) / 3.6e6 : 0;
    st.stale = !!(prev && prev.signature === st.signature && ageH > CONFIG.staleHours);
    if (st.stale) {
      for (const k in st.intensities) st.intensities[k] = +(st.intensities[k] * CONFIG.staleDecay).toFixed(3);
      const t = totals(st.intensities); st.raw = t.raw; st.norm = t.norm;
    }
    st.firstSeen = prev ? prev.firstSeen : now.toISOString();
  }

  // ---- confidence + status ----
  for (const st of scored) {
    st.confidence = confidence(st, now);
    const majorBreaking = (st.intensities.safety >= 0.5 || st.intensities.breaking >= 0.7);
    if (majorBreaking && st.distinctSources < CONFIG.twoSourceMinForBreaking) {
      st.status = "HOLD";
      st.confidence = Math.min(st.confidence, 55); // unverified major claim -> below threshold
      st.guard = `Single source on a major breaking claim — fails the ${CONFIG.twoSourceMinForBreaking}-source rule. Do NOT lead/publish until corroborated.`;
    } else if (st.confidence < CONFIG.confidenceThreshold) {
      st.status = "HOLD";
      st.guard = `Confidence ${st.confidence}% < ${CONFIG.confidenceThreshold}% threshold — flagged for human review.`;
    } else if (st.stale) {
      st.status = "DOWNGRADE";
      st.guard = `Not materially developed for >${CONFIG.staleHours}h — downgraded to avoid a repetitive bulletin.`;
    } else {
      st.status = "RUN";
      st.guard = `Verified enough to run (${st.distinctSources} source${st.distinctSources > 1 ? "s" : ""}, conf ${st.confidence}%).`;
    }
  }

  // ---- rank by normalized score ----
  scored.sort((a, b) => b.norm - a.norm);

  // ---- pick LEAD with celebrity cap ----
  const eligible = scored.filter((s) => s.status === "RUN");
  let lead = eligible[0];
  if (lead && lead.dominant === "celebrity") {
    const safer = eligible.find((s) => s.intensities.safety >= 0.5);
    if (safer) lead = safer; // never let a celebrity item top a real public-safety story
  }
  if (lead) {
    lead.status = "LEAD";
    lead.guard = `Top verified, public-interest story — recommended lead. ${lead.guard}`;
  }

  // ---- persist signatures for next hour's staleness check ----
  const next = {};
  for (const st of scored) next[st.id] = { firstSeen: st.firstSeen, signature: st.signature, norm: st.norm };
  saveSeen(next);

  return scored;
}

// any engagement signal at all? (used by the +5min re-poll logic)
export const hasSignal = (scored) =>
  scored.some((s) => s.norm >= 35 || s.intensities.safety >= 0.5 || s.intensities.breaking >= 0.7);
