/**
 * Read-only check: why is a serial number not found?
 * Run from the backend folder (the one that has package.json and .env), using the SAME Firebase values as Render:
 *
 *   node scripts/check-serial.js PRI01331001
 *
 * It changes nothing in the database.
 */
const env = require("../src/config/env");
const { getDb } = require("../src/config/firebase");
const { normalizeSerial, toDocId } = require("../src/utils/validate");

const serial = normalizeSerial(String(process.argv[2] || ""));
if (!serial) {
  console.error("Usage: node scripts/check-serial.js PRI01331001   (PRI + 8 digits, with or without SN:)");
  process.exit(1);
}

(async () => {
  const db = getDb(env.firebase);
  console.log("Firebase project used by this backend:", env.firebase.projectId || "(from service account file)");

  const collections = await db.listCollections();
  console.log("Collections in this project:", collections.map((c) => c.id).join(", ") || "(none)");

  const col = db.collection("qr_codes");
  const sample = await col.limit(5).get();
  console.log(`\nqr_codes: ${sample.empty ? "EMPTY or missing" : "has documents"}`);
  sample.docs.forEach((d) => console.log("  example id:", JSON.stringify(d.id), "| serialNumber field:", JSON.stringify(d.data().serialNumber)));

  const direct = await col.doc(toDocId(serial)).get();
  console.log(`\nDocument with id ${toDocId(serial)}:`, direct.exists ? "FOUND" : "not found");

  const byField = await col.where("serialNumber", "==", serial).limit(3).get();
  console.log(`Documents with serialNumber == ${serial}:`, byField.size);
  byField.docs.forEach((d) => console.log("  id:", JSON.stringify(d.id)));

  const prefix = `SN:${serial.slice(0, serial.length - 3)}`;
  const near = await col.where("__name__", ">=", prefix).where("__name__", "<", prefix + "\uf8ff").limit(10).get();
  console.log(`\nSimilar ids starting with ${prefix}:`, near.size ? near.docs.map((d) => d.id).join(", ") : "none");

  if (!direct.exists && byField.empty) {
    console.log("\nRESULT: this serial is not in this database. Add it with the /admin page, or check FIREBASE_PROJECT_ID.");
  } else {
    console.log("\nRESULT: the serial exists. If the website still says invalid, the deployed backend is not using this project or the new products.js.");
  }
  process.exit(0);
})().catch((err) => {
  console.error("Check failed:", err.message);
  process.exit(1);
});