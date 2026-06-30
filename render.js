// render.js — turns scored stories into (a) the live dashboard HTML and
// (b) the hourly email brief (text + html). Distribution strategy is generated
// from each story's dominant signal + status, so it is never boilerplate.
import { CONFIG, WEIGHT_SUM } from "./config.js";

const LABEL = {
  breaking:"Breaking", emotion:"Emotion", political:"Political imp.", celebrity:"Celebrity",
  money:"Money impact", safety:"Public safety", visual:"Visual potential",
  unexpected:"Unexpectedness", search:"Search trend",
};
const COLOR = {
  breaking:"#d6333a", emotion:"#7c3aed", political:"#2563eb", celebrity:"#bd7d12",
  money:"#1f9d4d", safety:"#d6333a", visual:"#0e9aa7", unexpected:"#bd7d12", search:"#2563eb",
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const badge = (st) => ({ LEAD:"★ RECOMMEND LEAD", HOLD:"⏸ HOLD — VERIFY",
  DOWNGRADE:"↓ DOWNGRADE (STALE)", RUN:"● RUN IN BODY" }[st] || "● RUN");
const tier = (n) => n >= 80 ? "Top of bulletin" : n >= 65 ? "Strong" : n >= 50 ? "Solid" : n >= 35 ? "Moderate" : "Low";

/* ----------------------- distribution strategy rules ---------------------- */
export function distribution(s) {
  if (s.status === "HOLD")
    return { x:"HOLD all platforms until a 2nd credible source confirms. Prep a neutral holding line; never lead a post with unverified figures or imagery.",
             i:"No Story/Reel until confirmed; pre-clear a verified-source card. Avoid graphic imagery.",
             f:"Hold; when verified, lead with verified facts + any official helpline for the affected audience." };
  if (s.dominant === "safety")
    return { x:"LEAD live thread: official alert/map + helpline pinned, refresh every 30 min; post visuals natively.",
             i:"Reel of the strongest footage + a 'what to do / who's affected' carousel; Story poll to drive shares.",
             f:"Safety-advisory post + helpline — Facebook's regional base over-indexes on weather/safety utility." };
  if (s.dominant === "money")
    return { x:"Thread with one clean chart + a crisp 'what it means for you'. Finance X rewards data + takeaway.",
             i:"Single explainer carousel, calm framing (no alarmism).",
             f:"Lower priority; a measured explainer for the personal-finance segment." };
  if (s.dominant === "celebrity")
    return { x:"Quote-card + clip; lean into the debate to farm replies/quote-tweets.",
             i:"Reel of the key soundbite/clip — high completion-rate with this fan audience.",
             f:"Standard post; engagement skews to dedicated fan pages." };
  if (s.dominant === "political")
    return { x:"Factual thread: who said/did what + the document/verdict, sourced. Avoid editorializing.",
             i:"Explainer carousel: decision + why it matters; neutral tone.",
             f:"Context post for an older, politically-engaged base." };
  return { x:"Standard news post with the lead image and a one-line hook.",
           i:"Single card or short Reel if visuals allow.",
           f:"Standard post; monitor and boost only if engagement builds." };
}

/* image fallback when a source returns no picture */
const imgFor = (s) => s.imageUrl
  ? esc(s.imageUrl)
  : "data:image/svg+xml;utf8," + encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='240'><rect width='400' height='240' fill='#e6ebf2'/><text x='200' y='128' font-size='15' fill='#69748a' text-anchor='middle' font-family='Arial'>${esc((s.publisher||"No image").slice(0,28))}</text></svg>`);

/* ------------------------------ DASHBOARD --------------------------------- */
export function buildDashboard(scored, meta) {
  const lead = scored.find((s) => s.status === "LEAD") || scored[0];
  const hold = scored.find((s) => s.status === "HOLD");
  const cards = scored.map((s, i) => {
    const d = distribution(s);
    const bars = Object.keys(CONFIG.weights).map((k) => {
      const pts = (s.intensities[k] * CONFIG.weights[k]).toFixed(1);
      return `<div class="bar"><div class="nm">${LABEL[k]} <i>wt ${CONFIG.weights[k]}</i></div>
        <div class="track"><div class="fill" style="width:${s.intensities[k]*100}%;background:${COLOR[k]}"></div></div>
        <div class="val"><b>${pts}</b>/${CONFIG.weights[k]}</div>
        <div class="just">${esc(s.justify[k])}</div></div>`;
    }).join("");
    const conf = s.confidence>=75?"#1f9d4d":s.confidence>=70?"#bd7d12":"#d6333a";
    return `<div class="card ${s.status==='LEAD'?'lead':s.status==='HOLD'?'hold':''}" onclick="this.classList.toggle('open')">
      <div class="chead">
        <div class="thumb"><img src="${imgFor(s)}" alt="">${s.videoUrl?'<span class="av">🎥</span>':''}</div>
        <div class="rank"><span class="n">${i+1}</span><span class="l">RANK</span></div>
        <div class="ctitle"><h3>${esc(s.title)}</h3>
          <div class="meta"><span class="src">${esc(s.publisher)}</span><span>· ${new Date(s.publishedAt).toLocaleString("en-IN")}</span><span>· ${s.distinctSources} src</span></div></div>
        <div class="score"><div class="big">${s.norm}</div><div class="out">/100 · ${tier(s.norm)}</div>
          <span class="b ${s.status}">${badge(s.status)}</span></div><span class="chev">▶</span>
      </div>
      <div class="cbody">
        <div class="visual"><img src="${imgFor(s)}" alt=""><div class="vcap">📷 ${s.imageUrl?'Source image':'No source image — publisher fallback'} · <a href="${esc(s.url)}" target="_blank" rel="noopener">open article ↗</a></div></div>
        <div class="bars">${bars}</div>
        <div class="rawline"><span>Raw <b>${s.raw}</b>/${WEIGHT_SUM} → calibrated <b>${s.norm}</b>/100</span>
          <span>Confidence <b style="color:${conf}">${s.confidence}%</b>${s.confidence<CONFIG.confidenceThreshold?' ⚑ review':''}</span></div>
        <div class="guard"><b>Guardrail:</b> ${esc(s.guard)}</div>
        <div class="dist"><h4>Distribution</h4>
          <div class="p"><b class="px">𝕏</b> ${esc(d.x)}</div>
          <div class="p"><b class="pi">IG</b> ${esc(d.i)}</div>
          <div class="p"><b class="pf">FB</b> ${esc(d.f)}</div></div>
      </div></div>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Newsroom Rundown — ${esc(meta.runTime)}</title><style>
:root{--bg:#eef1f6;--panel:#fff;--panel2:#f3f6fa;--line:#dde3ec;--ink:#16202e;--muted:#69748a;--soft:#3c485a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:20px 16px 60px}
header{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:16px}
h1{font-size:18px;margin:0}.sub{color:var(--muted);font-size:12px;margin-top:3px}
.banner{background:#fdf6e3;border:1px solid #ecd49a;border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:13px;color:#6e5414}
.health{background:#eef4ff;border:1px solid #cfe0fb;border-radius:8px;padding:8px 12px;margin-bottom:16px;font-size:12px;color:#33507e}.health b{color:#1d3a6b}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;margin-bottom:12px;overflow:hidden;box-shadow:0 1px 3px rgba(20,30,50,.05)}
.card.lead{border-color:#f0b4b6}.card.hold{border-color:#ecd49a}
.chead{display:flex;gap:12px;align-items:center;padding:12px 14px;cursor:pointer}
.thumb{position:relative;width:84px;height:60px;border-radius:8px;overflow:hidden;border:1px solid var(--line);flex-shrink:0;background:#e9eef4}
.thumb img{width:100%;height:100%;object-fit:cover}.thumb .av{position:absolute;right:3px;bottom:3px;font-size:11px}
.rank{width:30px;text-align:center;flex-shrink:0}.rank .n{font-size:17px;font-weight:800}.rank .l{font-size:8px;color:var(--muted);display:block}
.ctitle{flex:1;min-width:0}.ctitle h3{margin:0 0 4px;font-size:14.5px;line-height:1.3}
.meta{font-size:11px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap}.meta .src{color:var(--soft);font-weight:600}
.score{width:70px;text-align:center;flex-shrink:0}.score .big{font-size:24px;font-weight:800}.score .out{font-size:10px;color:var(--muted)}
.b{display:inline-block;font-size:9px;font-weight:700;padding:3px 6px;border-radius:5px;margin-top:5px}
.b.LEAD{background:#fdecec;color:#c0282e;border:1px solid #f3b9bb}.b.HOLD{background:#fbf3e0;color:#8a6312;border:1px solid #ecd49a}
.b.DOWNGRADE{background:#eef1f5;color:#69748a;border:1px solid #d8dee6}.b.RUN{background:#e7f6ec;color:#1f7a3d;border:1px solid #b8e3c4}
.chev{color:var(--muted);transition:.15s}.card.open .chev{transform:rotate(90deg)}
.cbody{display:none;border-top:1px solid var(--line);padding:10px 14px 14px}.card.open .cbody{display:block}
.visual{border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:10px}.visual img{width:100%;height:180px;object-fit:cover;display:block}
.vcap{font-size:11px;color:var(--muted);padding:7px 10px;background:var(--panel2);border-top:1px solid var(--line)}
.bar{display:grid;grid-template-columns:120px 1fr 70px;gap:9px;align-items:center;padding:5px 0;border-bottom:1px solid #eef1f6}
.bar .nm{font-size:11px;color:var(--soft)}.bar .nm i{font-style:normal;color:var(--muted);font-size:9px}
.track{height:8px;background:#e6ebf2;border-radius:5px;overflow:hidden}.fill{height:100%}
.val{font-size:11px;text-align:right;color:var(--soft)}.val b{color:var(--ink)}
.just{grid-column:1/-1;font-size:10.5px;color:var(--muted);padding:1px 0 3px 129px}
@media(max-width:560px){.just{padding-left:0}.bar{grid-template-columns:90px 1fr 60px}}
.rawline{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-top:9px;padding-top:8px;border-top:1px dashed var(--line)}.rawline b{color:var(--ink)}
.guard{font-size:12px;background:#fdf6e3;border:1px solid #ecd49a;color:#6e5414;border-radius:8px;padding:9px 11px;margin:10px 0}
.dist h4{font-size:11px;text-transform:uppercase;color:var(--muted);margin:8px 0 6px}
.dist .p{font-size:12px;color:var(--soft);padding:4px 0;line-height:1.4}.px{color:#111}.pi{color:#c2389a}.pf{color:#2563eb}
footer{margin-top:20px;font-size:11px;color:var(--muted);line-height:1.6;border-top:1px solid var(--line);padding-top:12px}
</style></head><body><div class="wrap">
<header><div><h1>Newsroom Rundown Engine</h1><div class="sub">Google News · India (multi-lang) · source: ${esc(meta.provider)} · ${esc(meta.runTime)} IST · 24/7 hourly</div></div></header>
<div class="banner"><b>Recommended lead:</b> ${esc(lead?lead.title:"—")} (${lead?lead.norm:"-"}/100).${hold?` <b>Held for verification:</b> ${esc(hold.title)} — single source, do not lead until confirmed.`:""} Final rundown call is the editor's.</div>
<div class="health">📡 <b>Sources this run:</b> ${Object.entries(meta.counts||{}).map(([k,v])=>`${esc(k)} <b>${v}</b>`).join(" · ")||"none"} &nbsp;|&nbsp; 🔥 <b>${(meta.trends||[]).length}</b> live Google Trends</div>
${cards}
<footer>Headline score is a <b>calibrated 0–100 editorial scale</b> (a strong lead reads ~70–90); the per-variable bars show the raw intensity(0–1) × weight contributions that sum to the Raw/${WEIGHT_SUM} figure. Calibration changes the displayed number, not the ranking or the evidence. Images load from the news-API <code>image_url</code> / <code>og:image</code> — never AI-generated. Recommendations only; the editor owns the final rundown. Generated ${esc(meta.runTime)} IST.</footer>
</div></body></html>`;
}

/* -------------------------------- BRIEF ----------------------------------- */
export function buildBrief(scored, meta) {
  const lead = scored.find((s) => s.status === "LEAD") || scored[0];
  const hold = scored.find((s) => s.status === "HOLD");
  const rows = scored.map((s, i) => ` ${i+1}. ${String(s.norm).padStart(4)}  ${s.status.padEnd(9)} ${s.title.slice(0,46)}`).join("\n");
  const text =
`NEWSROOM HOURLY BRIEF — ${meta.runTime} IST (24/7)
Source: ${meta.provider} · Google News India · ${scored.length} stories
──────────────────────────────────────────
RECOMMENDED LEAD ▸ ${lead?lead.title:"—"}
  ${lead?`Score ${lead.norm}/100 · Conf ${lead.confidence}% · ${lead.distinctSources} source(s)`:""}
${hold?`\n⚑ HOLD ▸ ${hold.title}\n  ${hold.norm}/100 · single source — do NOT lead until confirmed.\n`:""}
RUNDOWN
${rows}

DISTRIBUTION (lead)
${lead?` X : ${distribution(lead).x}\n IG: ${distribution(lead).i}\n FB: ${distribution(lead).f}`:" —"}

GUARDRAILS: ${scored.filter(s=>s.status==='HOLD').length} held · ${scored.filter(s=>s.stale).length} stale · ${scored.filter(s=>s.confidence<CONFIG.confidenceThreshold).length} below confidence bar.
Recommendations only — the editor owns the final rundown.
──────────────────────────────────────────`;

  const html = `<pre style="font:12px ui-monospace,Menlo,monospace;background:#f6f8fb;border:1px solid #dde3ec;border-radius:8px;padding:14px;white-space:pre-wrap;color:#2a3340">${esc(text)}</pre>`;
  return { text, html, subject: `📰 Rundown ${meta.runTime} IST — lead: ${lead?lead.title.slice(0,48):"n/a"}` };
}
