import { logger } from "./logger";

export interface SupportEmailInput {
  name: string;
  email: string;
  topic: string;
  message: string;
  ref: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Sends a contact-form submission to the configured support inbox via the
 * Resend HTTP API. Returns `true` on success, `false` if the integration is
 * not configured or the call failed (callers should keep the audit log as
 * the source of truth in that case so no message is lost).
 *
 * Requires:
 *   - `RESEND_API_KEY`
 *   - `SUPPORT_INBOX_EMAIL`
 *   - `SUPPORT_FROM_EMAIL` (a verified Resend sender)
 */
export async function sendSupportEmail(input: SupportEmailInput): Promise<boolean> {
  const apiKey = process.env["RESEND_API_KEY"];
  const inbox = process.env["SUPPORT_INBOX_EMAIL"];
  const from = process.env["SUPPORT_FROM_EMAIL"];

  if (!apiKey || !inbox || !from) {
    logger.info(
      { ref: input.ref, configured: false },
      "support email skipped: RESEND_API_KEY / SUPPORT_INBOX_EMAIL / SUPPORT_FROM_EMAIL not set",
    );
    return false;
  }

  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.email);
  const safeTopic = escapeHtml(input.topic);
  const safeMessage = escapeHtml(input.message).replace(/\n/g, "<br>");

  const subject = `[contact:${input.topic}] ${input.name} — ${input.ref}`;
  const html = `
    <h2>New contact-form submission</h2>
    <p><strong>Reference:</strong> ${escapeHtml(input.ref)}</p>
    <p><strong>Topic:</strong> ${safeTopic}</p>
    <p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p>
    <hr>
    <p>${safeMessage}</p>
  `;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [inbox],
        reply_to: input.email,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn(
        { ref: input.ref, status: res.status, body: body.slice(0, 500) },
        "resend email failed",
      );
      return false;
    }
    logger.info({ ref: input.ref }, "support email sent");
    return true;
  } catch (err) {
    logger.warn({ err, ref: input.ref }, "resend email threw");
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
