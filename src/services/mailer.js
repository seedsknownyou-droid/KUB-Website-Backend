const dns = require("dns");
const { escapeHtml } = require("../utils/validate");
const { createBrevoTransport } = require("./httpMailTransport");

// Cloud servers often have no working IPv6 route; prefer IPv4 so the call to Brevo never fails with ENETUNREACH
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* very old Node version */
}

const { welcomeEmail, acknowledgementEmail, DEFAULT_COMPANY } = require("./emailTemplates");

const BRAND = "Known-You Seed";

function layout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:30px auto;background:#ffffff;padding:30px;border-radius:10px;">
    ${bodyHtml}
  </div>
</body></html>`;
}

function detailsTable(rows) {
  const tr = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;color:#111;font-weight:bold;">${escapeHtml(value || "-")}</td></tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;font-size:15px;">${tr}</table>`;
}

/**
 * Brevo is the only email provider. Everything comes from environment variables:
 *   BREVO_API_KEY       Brevo API key (starts with xkeysib-)
 *   BREVO_SENDER_EMAIL  verified sender address (From)
 *   BREVO_SENDER_NAME   name shown in From (default "Known-You Seed")
 *   REPLY_TO_EMAIL      Reply-To address of the emails
 */
/** Removes spaces, line breaks and quotes that often get pasted around a value (e.g. KEY="abc"). */
const clean = (value) => String(value || "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();

function readBrevoConfig() {
  return {
    apiKey: clean(process.env.BREVO_API_KEY),
    senderEmail: clean(process.env.BREVO_SENDER_EMAIL),
    senderName: clean(process.env.BREVO_SENDER_NAME) || BRAND,
    replyTo: clean(process.env.REPLY_TO_EMAIL),
  };
}

/** Only the start and the last 4 characters are printed, enough to compare with the key list in Brevo. */
const keyHint = (key) => `${key.slice(0, key.indexOf("-") + 1 || 4)}...${key.slice(-4)} (${key.length} characters)`;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Prints every configuration problem once at start-up (the server still starts; sending then fails with a clear error). */
function checkConfig(config) {
  const problems = [];
  if (!config.apiKey) problems.push("BREVO_API_KEY is not set");
  else if (config.apiKey.startsWith("xsmtpsib-")) {
    problems.push("BREVO_API_KEY is an SMTP key (xsmtpsib-). The email API needs an API key: Brevo > SMTP & API > API Keys (xkeysib-)");
  } else if (!config.apiKey.startsWith("xkeysib-")) {
    problems.push(`BREVO_API_KEY starts with "${config.apiKey.slice(0, 9)}" but a Brevo API key starts with xkeysib-`);
  }
  if (!EMAIL_PATTERN.test(config.senderEmail)) problems.push("BREVO_SENDER_EMAIL is missing or not a valid address");
  if (config.replyTo && !EMAIL_PATTERN.test(config.replyTo)) problems.push("REPLY_TO_EMAIL is not a valid address");
  if (!config.replyTo) problems.push("REPLY_TO_EMAIL is not set (customers will not be able to reply to the sender mailbox)");

  // Old providers are no longer used; point out variables that can now be deleted
  const old = ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_USER", "EMAIL_APP_PASSWORD"].filter((name) => process.env[name]);
  if (old.length) console.warn(`Email: ${old.join(", ")} ${old.length > 1 ? "are" : "is"} no longer used - you can delete ${old.length > 1 ? "them" : "it"} from the server environment.`);
  problems.forEach((p) => console.warn(`Email WARNING: ${p}`));
  return problems;
}

function createMailer({ feedbackTo, incidentTo, transport, company = {} } = {}) {
  // Priority: values passed in by the server > environment variables > built-in defaults.
  // "Access Your Account" opens the Sign In (login) page of the website: ACCOUNT_URL, or <FRONTEND_PUBLIC_URL>/signin.
  const frontendUrl = clean(process.env.FRONTEND_PUBLIC_URL).replace(/\/+$/, "");
  const fromEnv = {
    supportEmail: clean(process.env.SUPPORT_EMAIL),
    supportPhone: clean(process.env.SUPPORT_PHONE),
    accountUrl: clean(process.env.ACCOUNT_URL) || (frontendUrl ? `${frontendUrl}/signin` : ""),
  };
  const notEmpty = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v));
  const companyInfo = { ...DEFAULT_COMPANY, ...notEmpty(fromEnv), ...notEmpty(company) };
  const config = readBrevoConfig();
  const transporter = transport || (config.apiKey ? createBrevoTransport(config.apiKey) : null);

  if (!transport) {
    const problems = checkConfig(config);
    console.log(
      `Email: sending through Brevo API (HTTPS) as "${config.senderName}" <${config.senderEmail || "NOT SET"}>, ` +
        `reply-to ${config.replyTo || "NOT SET"}, key ${config.apiKey ? keyHint(config.apiKey) : "NOT SET"}` +
        (problems.length ? ` - ${problems.length} problem(s) above` : "")
    );
  }

  function ensureConfigured() {
    if (transport) return;
    if (!config.apiKey || !transporter) throw new Error("BREVO_API_KEY is not configured");
    if (!EMAIL_PATTERN.test(config.senderEmail)) throw new Error("BREVO_SENDER_EMAIL is not configured (use the sender verified in Brevo)");
  }

  /** Every email goes through here: sender and Reply-To come from the environment, result and errors are logged. */
  async function send(options) {
    ensureConfigured();
    const started = Date.now();
    const message = {
      from: `"${config.senderName}" <${config.senderEmail}>`,
      ...options,
      // The company notifications set the customer as Reply-To; everything else falls back to REPLY_TO_EMAIL
      replyTo: options.replyTo || config.replyTo || undefined,
    };
    try {
      const info = await transporter.sendMail(message);
      console.log(
        `Email sent through Brevo: "${options.subject}" to ${options.to} ` +
          `(messageId ${(info && info.messageId) || "-"}, ${Date.now() - started} ms)`
      );
      return info;
    } catch (err) {
      console.error(`Email FAILED: "${options.subject}" to ${options.to} (${err.code || "error"}): ${err.message}`);
      if (err.code === "HTTP_401" || err.code === "HTTP_403") {
        console.error(
          "Hint: Brevo did not accept the key. Check that BREVO_API_KEY is an API key (xkeysib-...), copied completely, " +
            "not deleted, and that Brevo > Security > Authorised IPs is switched off (the server IP changes on Render)."
        );
      } else if (err.code === "HTTP_400" && /sender/i.test(err.message)) {
        console.error(
          `Hint: Brevo does not accept the sender ${config.senderEmail}. Add and verify it under Brevo > Senders, ` +
            "and make sure its domain is authenticated."
        );
      } else if (err.code === "NETWORK_ERROR" || err.code === "TIMEOUT") {
        console.error("Hint: the server could not reach api.brevo.com. Check the server's internet access and try again.");
      }
      throw err;
    }
  }

  /** 1) Welcome email to the customer right after registration. */
  async function sendWelcomeEmail({ to, customerName }) {
    return send({ to, ...welcomeEmail({ customerName, company: companyInfo }) });
  }

  /** 2) / 3) "We received your request" email for the feedback and support forms. */
  async function sendAcknowledgementEmail({ to, kind, customerName, productName, incidentNumber }) {
    return send({
      to,
      ...acknowledgementEmail({ kind, customerName, productName, incidentNumber, company: companyInfo }),
    });
  }

  function customerRows({ customerName, email, phone, serialNumber, productName, incidentNumber }) {
    return [
      ...(incidentNumber ? [["Incident No.", incidentNumber]] : []),
      ["Name", customerName],
      ["Email", email],
      ["Mobile", phone],
      ["Product", productName],
      ["Serial No.", serialNumber],
    ];
  }

  /** Feedback goes to the configured company mailbox; Reply goes straight to the customer. */
  async function sendFeedbackEmail(data) {
    if (!feedbackTo) throw new Error("FEEDBACK_TO_EMAIL is not configured");
    return send({
      to: feedbackTo,
      replyTo: data.email || undefined,
      subject: `New customer feedback ${data.incidentNumber ? data.incidentNumber + " - " : "- "}${data.serialNumber}`,
      text:
        `New feedback received\n\nName: ${data.customerName}\nEmail: ${data.email || "-"}\n` +
        `Mobile: ${data.phone}\nProduct: ${data.productName || "-"}\nSerial No.: ${data.serialNumber}\n\n` +
        `Message:\n${data.message}`,
      html: layout(
        "New customer feedback",
        `<p style="margin:0 0 20px 0;font-size:18px;font-weight:bold;">New customer feedback</p>
         ${detailsTable(customerRows(data))}
         <p style="margin:20px 0 6px 0;font-size:15px;color:#555;">Message</p>
         <div style="font-size:16px;line-height:1.6;white-space:pre-wrap;background:#f8f9fa;padding:14px;border-radius:8px;">${escapeHtml(data.message)}</div>`
      ),
    });
  }

  async function sendIncidentEmail(data) {
    if (!incidentTo) throw new Error("INCIDENT_TO_EMAIL / FEEDBACK_TO_EMAIL is not configured");
    return send({
      to: incidentTo,
      replyTo: data.email || undefined,
      subject: `INCIDENT REPORT ${data.incidentNumber ? data.incidentNumber + " - " : "- "}${data.serialNumber}`,
      text:
        `New incident reported\n\nName: ${data.customerName}\nEmail: ${data.email || "-"}\n` +
        `Mobile: ${data.phone}\nProduct: ${data.productName || "-"}\nSerial No.: ${data.serialNumber}\n\n` +
        `Incident details:\n${data.message}`,
      html: layout(
        "Incident report",
        `<p style="margin:0 0 20px 0;font-size:18px;font-weight:bold;color:#b00020;">Incident report</p>
         ${detailsTable(customerRows(data))}
         <p style="margin:20px 0 6px 0;font-size:15px;color:#555;">Incident details</p>
         <div style="font-size:16px;line-height:1.6;white-space:pre-wrap;background:#fff5f5;padding:14px;border-radius:8px;">${escapeHtml(data.message)}</div>`
      ),
    });
  }

  return { sendWelcomeEmail, sendAcknowledgementEmail, sendFeedbackEmail, sendIncidentEmail };
}

module.exports = { createMailer };