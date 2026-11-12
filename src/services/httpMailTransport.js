/**
 * Sends email through the Brevo transactional API (HTTPS, port 443).
 *
 * HTTPS is used instead of SMTP because many hosting services (Render, Railway, DigitalOcean ...) block the
 * SMTP ports 25 / 465 / 587. The object has a nodemailer-like sendMail() so mailer.js stays simple.
 *
 * Brevo is the only provider. Resend / Gmail SMTP have been removed.
 */
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 800;

/** '"Known-You Seed" <support@site.com>'  ->  { name, email } */
function parseAddress(value) {
  const text = String(value || "").trim();
  const match = /^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(text);
  return match ? { name: match[1].trim(), email: match[2].trim() } : { name: "", email: text };
}

const list = (value) =>
  (Array.isArray(value) ? value : String(value || "").split(","))
    .map((item) => String(item).trim())
    .filter(Boolean);

function buildBody(msg) {
  const sender = parseAddress(msg.from);
  const replyTo = msg.replyTo ? parseAddress(msg.replyTo) : null;
  return {
    sender: { ...(sender.name ? { name: sender.name } : {}), email: sender.email },
    to: list(msg.to).map((email) => ({ email })),
    subject: msg.subject,
    htmlContent: msg.html,
    textContent: msg.text,
    ...(replyTo && replyTo.email ? { replyTo: { email: replyTo.email, ...(replyTo.name ? { name: replyTo.name } : {}) } } : {}),
    ...(msg.tags && msg.tags.length ? { tags: msg.tags } : {}),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Network problems, timeouts, rate limiting and Brevo server errors are worth one more try. */
const isRetryable = (err) => err.retryable === true;

function createBrevoTransport(apiKey, fetchImpl = (...args) => fetch(...args)) {
  async function attempt(msg) {
    let response;
    try {
      response = await fetchImpl(BREVO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json", "api-key": apiKey },
        body: JSON.stringify(buildBody(msg)),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      const timedOut = cause && (cause.name === "TimeoutError" || cause.name === "AbortError");
      const err = new Error(timedOut ? "Brevo did not answer in time" : `Could not reach Brevo: ${cause && cause.message}`);
      err.code = timedOut ? "TIMEOUT" : "NETWORK_ERROR";
      err.retryable = true;
      throw err;
    }

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      /* not JSON */
    }

    if (!response.ok) {
      const reason = data.message || data.error || raw.slice(0, 200) || response.statusText;
      const err = new Error(`Brevo rejected the email (HTTP ${response.status}${data.code ? `, ${data.code}` : ""}): ${reason}`);
      err.code = `HTTP_${response.status}`;
      err.brevoCode = data.code || "";
      err.retryable = response.status === 429 || response.status >= 500;
      throw err;
    }
    return { messageId: data.messageId || "", provider: "Brevo" };
  }

  return {
    async sendMail(msg) {
      try {
        return await attempt(msg);
      } catch (err) {
        if (!isRetryable(err)) throw err;
        console.warn(`Brevo send failed (${err.code}), trying once more: ${err.message}`);
        await sleep(RETRY_DELAY_MS);
        return attempt(msg);
      }
    },
  };
}

module.exports = { createBrevoTransport, parseAddress, buildBody };