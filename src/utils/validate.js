// Serial number format: 2-5 letters followed by 4-12 digits, e.g. PRI01331001 (Papaya), ML81101844 / MI81105001 (Muskmelon).
const SERIAL_PATTERN = /^[A-Z]{2,5}\d{4,12}$/;
// Firestore document ids in `qr_codes` are the serial number with a fixed "SN:" in front, e.g. SN:PRI01331001.
const SERIAL_DOC_PREFIX = "SN:";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Accepts "PRI01331001" or "SN:PRI01331001" (any letter case, spaces around are ignored).
 * Returns the plain serial number "PRI01331001", or null when the format is not valid.
 * The plain serial is what the app uses everywhere (QR links, emails, logs).
 */
function normalizeSerial(value) {
  if (typeof value !== "string") return null;
  let serial = value.trim().toUpperCase();
  if (serial.startsWith(SERIAL_DOC_PREFIX)) serial = serial.slice(SERIAL_DOC_PREFIX.length).trim();
  return SERIAL_PATTERN.test(serial) ? serial : null;
}

/** Firestore document id of a serial number: "PRI01331001" or "SN:PRI01331001" -> "SN:PRI01331001" (null if invalid). */
function toDocId(value) {
  const serial = normalizeSerial(value);
  return serial ? `${SERIAL_DOC_PREFIX}${serial}` : null;
}

/** Document id (or a stored serial value) back to the plain serial: "SN:PRI01331001" -> "PRI01331001". No validation. */
function fromDocId(value) {
  const text = String(value || "").trim();
  return text.toUpperCase().startsWith(SERIAL_DOC_PREFIX) ? text.slice(SERIAL_DOC_PREFIX.length) : text;
}

/** Accepts 10 digits, or 91 / +91 / 0 prefixed numbers. Returns 10 digits or null. */
function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** Returns "" when empty (email is optional), null when invalid, otherwise the lower-cased email. */
function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return "";
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** Keeps line breaks (feedback / incident messages) but trims and limits length. */
function cleanMessage(value, maxLength = 2000) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Firestore Timestamp | Date | string -> ISO string (or null). */
function toIso(value) {
  if (!value) return null;
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = {
  normalizeSerial,
  toDocId,
  fromDocId,
  SERIAL_DOC_PREFIX,
  normalizePhone,
  normalizeEmail,
  cleanText,
  cleanMessage,
  escapeHtml,
  toIso,
};