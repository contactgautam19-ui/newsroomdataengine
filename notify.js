// notify.js — push a breaking-news alert the moment the top story crosses the
// score threshold, into Telegram and/or Slack (whichever credential is set).
// De-dupes via state/lastalert.json so the same story doesn't re-alert every hour.
// Env: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID  and/or  SLACK_WEBHOOK_URL
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";

const STATE = path.resolve("state/lastalert.json");
const lastAlerted = () => { try { return JSON.parse(fs.readFileSync(STATE, "utf8")).id; } catch { return null; } };
const remember = (id) => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify({ id, at: new Date().toISOString() })); };

export async function sendAlerts(stories, meta) {
  const top = stories[0];
  if (!top || top.norm < CONFIG.alertThreshold) return { sent: false, reason: "below-threshold" };
  if (top.id === lastAlerted()) return { sent: false, reason: "already-alerted" };

  const flag = top.status === "HOLD" ? " ⏸ HOLD — VERIFY before publishing" : top.status === "LEAD" ? " ★ RECOMMENDED LEAD" : "";
  const text = `🚨 NEWSROOM ALERT · ${meta.runTime} IST\n` +
    `${top.norm}/100${flag}\n\n${top.title}\n${top.publisher} · ${top.distinctSources} source(s) · conf ${top.confidence}%\n${top.url}`;

  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, SLACK_WEBHOOK_URL } = process.env;
  const jobs = [];
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    jobs.push(fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: false }),
    }).then((r) => console.log(`[alert] telegram ${r.status}`)).catch((e) => console.warn("[alert] telegram failed", e.message)));
  }
  if (SLACK_WEBHOOK_URL) {
    jobs.push(fetch(SLACK_WEBHOOK_URL, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    }).then((r) => console.log(`[alert] slack ${r.status}`)).catch((e) => console.warn("[alert] slack failed", e.message)));
  }
  if (!jobs.length) { console.log("[alert] would fire, but no Telegram/Slack credential set."); return { sent: false, reason: "no-channel" }; }

  await Promise.all(jobs);
  remember(top.id);
  return { sent: true };
}
