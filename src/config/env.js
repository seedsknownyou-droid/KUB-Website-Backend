require("dotenv").config();

const list = (value) =>
  String(value || "")
    .split(",")
    .map((v) => v.trim().replace(/\/+$/, ""))
    .filter(Boolean);

module.exports = {
  port: Number(process.env.PORT) || 5000,
  allowedOrigins: list(process.env.FRONTEND_URLS),
  // Development: also trust localhost and private-network addresses (192.168.x.x, 10.x.x.x ...).
  // Set ALLOW_LAN_ORIGINS=false (or NODE_ENV=production) to trust only FRONTEND_URLS.
  allowLanOrigins:
    process.env.ALLOW_LAN_ORIGINS !== undefined
      ? process.env.ALLOW_LAN_ORIGINS.toLowerCase() === "true"
      : process.env.NODE_ENV !== "production",
  frontendPublicUrl: (process.env.FRONTEND_PUBLIC_URL || "").replace(/\/+$/, ""),

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  },

  sms: {
    apiKey: process.env.FAST2SMS_API_KEY,
  },

  // Printed in the customer emails. The "Access Your Account" link opens the Sign In (login) page of the website:
  // <FRONTEND_PUBLIC_URL>/signin, or the full address in ACCOUNT_URL if you set one.
  company: {
    supportEmail: process.env.SUPPORT_EMAIL,
    supportPhone: process.env.SUPPORT_PHONE,
    accountUrl: process.env.ACCOUNT_URL || (process.env.FRONTEND_PUBLIC_URL ? `${process.env.FRONTEND_PUBLIC_URL.replace(/\/+$/, "")}/signin` : ""),
  },

  // Brevo is the only email provider. The key and sender details are read from the environment (see mailer.js).
  email: {
    brevoApiKey: process.env.BREVO_API_KEY,
    senderEmail: process.env.BREVO_SENDER_EMAIL,
    senderName: process.env.BREVO_SENDER_NAME || "Known-You Seed",
    replyTo: process.env.REPLY_TO_EMAIL,
    feedbackTo: process.env.FEEDBACK_TO_EMAIL,
    incidentTo: process.env.INCIDENT_TO_EMAIL || process.env.FEEDBACK_TO_EMAIL,
  },
};