// email.js — send the hourly brief.
// Priority: Resend API (recommended, no 2FA) -> Gmail SMTP app password -> dry run.
// Resend env:  RESEND_API_KEY, MAIL_FROM (e.g. "Newsroom <onboarding@resend.dev>"), MAIL_TO
// Gmail  env:  SMTP_USER, SMTP_PASS (16-char app password), MAIL_TO

export async function sendBrief({ subject, text, html }) {
  const { RESEND_API_KEY, MAIL_FROM, MAIL_TO, SMTP_USER, SMTP_PASS } = process.env;
  const to = MAIL_TO || SMTP_USER;

  // ---- 1) Resend (preferred) ----
  if (RESEND_API_KEY) {
    // NOTE: until you verify a domain in Resend, "from" must be onboarding@resend.dev
    // and it can ONLY deliver to the email you signed up to Resend with.
    const from = MAIL_FROM || "Newsroom Engine <onboarding@resend.dev>";
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    console.log(`[email] sent via Resend to ${to}`);
    return { sent: true, via: "resend" };
  }

  // ---- 2) Gmail SMTP (fallback) ----
  if (SMTP_USER && SMTP_PASS) {
    const { default: nodemailer } = await import("nodemailer"); // dynamic so Resend path needs no dep
    const transport = nodemailer.createTransport({ service: "gmail", auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await transport.sendMail({ from: `Newsroom Engine <${SMTP_USER}>`, to, subject, text, html });
    console.log(`[email] sent via Gmail SMTP to ${to}`);
    return { sent: true, via: "gmail" };
  }

  console.log("[email] no email creds set — skipping send (dry run).");
  return { sent: false };
}
