# Newsroom Rundown Engine

Scrapes the top India headlines from **NewsData.io** (falling back to **SerpAPI Google News**,
then free **Google News RSS**) every hour, **24/7**, scores each story on a 9-variable
evidence-weighted framework, writes a live dashboard, and emails a formatted brief.
Runs entirely on **GitHub Actions** — your laptop does not need to be on.

---

## 1. Put these files into this folder layout

All code files live in the repo **root** (flat — easy to drag-upload). Only the
workflow file goes in a subfolder:

```
newsroomdataengine/
├─ package.json
├─ config.js
├─ sources.js
├─ engine.js
├─ render.js
├─ email.js
├─ index.js
├─ README.md
├─ .gitignore             ← rename from "gitignore.txt"
├─ .env.example           ← rename from "env.example"
└─ .github/
   └─ workflows/
      └─ hourly.yml        ← create this one with path .github/workflows/hourly.yml
```

`state/seen.json` and `public/index.html` are created automatically on the first run.

---

## 2. Do you need to do anything on GitHub? — Yes, two things

I can't create a GitHub account or push for you (that needs your login). You need to:

**A. Create a free GitHub account** (if you don't have one): <https://github.com/join>

**B. Make a repo and upload these files.** Easiest, no command line:
1. <https://github.com/new> → name it `newsroom-engine` → **Private** is fine → Create.
2. On the repo page click **"uploading an existing file"**, drag the files in the
   layout above (GitHub lets you type `src/config.js` etc. to create folders), Commit.

Prefer the terminal? From the `newsroom-engine/` folder:
```bash
git init && git add . && git commit -m "newsroom engine"
git branch -M main
git remote add origin https://github.com/<you>/newsroom-engine.git
git push -u origin main
```

---

## 3. Get your API keys (step by step)

### NewsData.io (primary news source — required)
1. Go to <https://newsdata.io/register> and sign up (free plan = 200 credits/day).
2. Verify your email and log in.
3. Open the **Dashboard** → top-right → **API Key** section.
4. Copy the key. That's your `NEWSDATA_KEY`.

> Free-plan note: articles are delayed ~12h and full content is limited. Fine for an MVP;
> upgrade later for real-time. The engine works on title + description, which the free plan returns.

### SerpAPI (optional backup — closest to literal Google News)
1. Sign up at <https://serpapi.com/users/sign_up> (free tier ~100 searches/month).
2. Dashboard → **Your Account / API Key** → copy it. That's `SERPAPI_KEY`.
3. Leave it blank and the engine simply skips to Google News RSS (free, no key).

### Resend for sending the brief (recommended — no 2FA)
1. Sign up at <https://resend.com/signup> (free: 3,000 emails/mo, 100/day — plenty for 24/day).
2. Go to **API Keys**: <https://resend.com/api-keys> → **Create API Key** → copy it. That's `RESEND_API_KEY`.
3. Set `MAIL_FROM` = `Newsroom Engine <onboarding@resend.dev>` (Resend's test sender — works with no domain setup).
4. Set `MAIL_TO` = the email you **signed up to Resend with**. ⚠️ With the test sender, Resend only
   delivers to your own account email until you verify a domain. To send to any address (e.g.
   gautam.news9@gmail.com), add & verify a domain at <https://resend.com/domains>, then set
   `MAIL_FROM` to an address on that domain.

### Gmail SMTP (only a fallback — used if `RESEND_API_KEY` is empty)
Turn on 2-Step Verification, create a 16-char **App Password** at
<https://myaccount.google.com/apppasswords>, then set `SMTP_USER` (your Gmail) and `SMTP_PASS`
(the app password). The engine uses Gmail only when no Resend key is present.

---

## 4. Add the keys as GitHub Secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Secret name      | Value                                              |
|------------------|----------------------------------------------------|
| `NEWSDATA_KEY`   | your NewsData.io key                               |
| `RESEND_API_KEY` | your Resend API key                                |
| `MAIL_FROM`      | `Newsroom Engine <onboarding@resend.dev>`         |
| `MAIL_TO`        | your Resend signup email (or a verified-domain to) |
| `SERPAPI_KEY`    | optional — SerpAPI fallback                        |
| `SMTP_USER` / `SMTP_PASS` | optional — Gmail fallback only            |

Never commit real keys. `.env` is git-ignored; on GitHub only Secrets are used.

---

## 5. Turn on the schedule + dashboard
1. Repo → **Settings → Pages** → Source: **GitHub Actions** (so the dashboard publishes).
2. Repo → **Actions** tab → enable workflows if prompted.
3. Click **hourly-rundown → Run workflow** to test immediately (don't wait for the hour).
4. After it runs: the brief lands in your inbox, and the dashboard is at
   `https://<you>.github.io/newsroom-engine/`. It then runs every hour automatically.

---

## 6. Run locally first (optional sanity check)
```bash
npm install
cp .env.example .env      # fill in your keys
npm run selftest          # fetches + scores + prints brief, no email sent
npm start                 # full run incl. email
```

---

## How the score works (so every number is defensible)
- 9 variables — Breaking, Emotion, Political, Celebrity, Money, Public safety, Visual,
  Unexpectedness, Search trend — each scored **0–1 intensity × weight**.
- Intensities are derived from **transparent keyword lexicons in `engine.js`**; every score
  stores the exact words it matched, shown as the per-variable justification.
- Weights sum to **110** and are normalized to a **100-point** scale.
- **Guardrails** (in `engine.js`): a major breaking story with **< 2 sources** is `HOLD`;
  **confidence < 70%** is flagged for review; a story **unchanged > 6h** is stale-decayed and
  `DOWNGRADE`d; a celebrity-dominant item can **never** outrank a real public-safety story.
- The engine **recommends**; the editor owns the final rundown.

Tune everything (region, weights, thresholds, lexicons) in `src/config.js` and `src/engine.js`.

> ⚠️ `search` is currently a **proxy** (cricket/film/event keywords). For real query velocity,
> wire a Google Trends source into `engine.js` — left as a clearly-marked next step.
