// Supported serial number formats:
// PRI followed by 8 digits: PRI01331001
// MI followed by 8 digits: MI81105001

const SERIAL_PATTERN = /^(PRI\d{8}|MI\d{8})$/;

// Existing PRI Firestore documents use fixed "SN:" prefix.
// MI Firestore documents use plain serial numbers.
const SERIAL_DOC_PREFIX = "SN:";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Accepts:
 * "PRI01331001"
 * "SN:PRI01331001"
 * "MI81105001"
 * "SN:MI81105001"
 *
 * Any letter case and spaces around are ignored.
 *
 * Returns plain serial number or null when invalid.
 */
function normalizeSerial(value) {
  if (typeof value !== "string") return null;

  let serial = value.trim().toUpperCase();

  if (serial.startsWith(SERIAL_DOC_PREFIX)) {
    serial = serial.slice(SERIAL_DOC_PREFIX.length).trim();
  }

  return SERIAL_PATTERN.test(serial) ? serial : null;
}

/**
 * Firestore document ID mapping:
 *
 * PRI01331001 -> SN:PRI01331001
 * SN:PRI01331001 -> SN:PRI01331001
 *
 * MI81105001 -> MI81105001
 * SN:MI81105001 -> MI81105001
 *
 * Returns null if serial number is invalid.
 */
function toDocId(value) {
  const serial = normalizeSerial(value);

  if (!serial) return null;

  // MI documents use plain serial number without SN: prefix.
  if (serial.startsWith("MI")) {
    return serial;
  }

  // Existing PRI documents retain SN: prefix.
  return `${SERIAL_DOC_PREFIX}${serial}`;
}

/**
 * Document ID back to plain serial:
 *
 * SN:PRI01331001 -> PRI01331001
 * PRI01331001 -> PRI01331001
 * MI81105001 -> MI81105001
 *
 * No validation.
 */
function fromDocId(value) {
  const text = String(value || "").trim().toUpperCase();

  return text.startsWith(SERIAL_DOC_PREFIX)
    ? text.slice(SERIAL_DOC_PREFIX.length)
    : text;
}

/**
 * Accepts 10 digits, or 91 / +91 / 0 prefixed numbers.
 * Returns 10 digits or null.
 */
function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/**
 * Returns:
 * "" when empty
 * null when invalid
 * Lower-cased email when valid
 */
function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();

  if (!email) return "";

  return EMAIL_PATTERN.test(email) && email.length <= 254
    ? email
    : null;
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Keeps line breaks (feedback / incident messages)
 * but trims and limits length.
 */
function cleanMessage(value, maxLength = 2000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Firestore Timestamp | Date | string -> ISO string (or null).
 */
function toIso(value) {
  if (!value) return null;

  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
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