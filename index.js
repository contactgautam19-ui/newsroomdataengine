// index.js — orchestrate one hourly run:
//   fetch (many sources + trends) -> score+guardrails -> (re-poll if no signal)
//   -> render -> publish -> email brief -> push breaking alert
// Outputs: public/index.html (dashboard) + public/brief-<hour>.html + state/*.json
import fs from "node:fs";
import { CONFIG } from "./config.js";
import { fetchTopStories, fetchTrends } from "./sources.js";
import { rankRun, hasSignal } from "./engine.js";
import { buildDashboard, buildBrief } from "./render.js";
import { sendBrief } from "./email.js";
import { sendAlerts } from "./notify.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const istNow = () => new Date(Date.now() + (5.5 * 60 - new Date().getTimezoneOffset()) * 60000);
const selftest = process.argv.includes("--selftest");

async function pull(trends) {
  const { provider, counts, stories } = await fetchTopStories();
  const sorted = [...stories].sort((a, b) => b.publishedAt - a.publishedAt);   // newest first
  const cutoff = Date.now() - CONFIG.freshnessHours * 3600 * 1000;
  const fresh = sorted.filter((s) => s.publishedAt.getTime() >= cutoff);        // last-hour only
  const pool = (fresh.length >= CONFIG.runSize ? fresh : sorted).slice(0, CONFIG.candidatePool);
  const ranked = rankRun(pool, new Date(), trends);            // score + guardrails ALL, sorted by norm
  console.log(`[run] pool ${pool.length} (fresh ${fresh.length}/${stories.length}) -> top ${CONFIG.runSize}`);
  return { provider, counts, scored: ranked.slice(0, CONFIG.runSize) };
}

async function run() {
  const trends = await fetchTrends();
  console.log(`[run] ${trends.length} live Google Trends pulled`);

  let { provider, counts, scored } = await pull(trends);

  // re-poll once after rePollMinutes if the hour's set shows no engagement signal
  if (scored.length && !hasSignal(scored) && !selftest) {
    console.log(`[run] no engagement signal — re-polling in ${CONFIG.rePollMinutes} min`);
    await sleep(CONFIG.rePollMinutes * 60000);
    ({ provider, counts, scored } = await pull(trends));
  }

  if (!scored.length) { console.error("[run] no stories from any source — aborting."); process.exit(1); }

  const meta = { provider, counts, trends, runTime: istNow().toISOString().slice(0, 16).replace("T", " ") };
  const dash = buildDashboard(scored, meta);
  const brief = buildBrief(scored, meta);

  fs.mkdirSync("public", { recursive: true });
  fs.writeFileSync("public/index.html", dash);
  fs.writeFileSync(`public/brief-${istNow().toISOString().slice(0,13)}.html`, brief.html);

  console.log("\n" + brief.text + "\n");

  if (!selftest) { await sendBrief(brief); await sendAlerts(scored, meta); }
  console.log(`[run] done · sources=${provider} · stories=${scored.length} · lead=${(scored.find(s=>s.status==='LEAD')||scored[0]).title.slice(0,50)}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
