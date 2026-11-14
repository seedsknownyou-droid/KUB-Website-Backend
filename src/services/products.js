const { toIso, toDocId, fromDocId, normalizeSerial } = require("../utils/validate");

const COLLECTION = "qr_codes";

/**
 * Data access for product serial numbers.
 * Collection `qr_codes`, one document per serial number.
 * The document id is the serial number with a fixed "SN:" in front (SN:PRI01331001); everywhere else in the
 * app the plain serial number (PRI01331001) is used, and this is the only place that adds the prefix.
 */
function createProductStore(db) {
  const ref = (serial) => {
    const docId = toDocId(serial); // accepts PRI01331001 and SN:PRI01331001
    if (!docId) throw new Error(`Invalid serial number: ${String(serial).slice(0, 40)}`);
    return db.collection(COLLECTION).doc(docId);
  };

  /**
   * Some documents were created by hand in the Firebase console with the plain serial as id (ML81101844),
   * others by the admin panel with the "SN:" prefix (SN:PRI01331001). Look for both.
   */
  const plainRef = (serial) => {
    const plain = normalizeSerial(serial);
    if (!plain) throw new Error(`Invalid serial number: ${String(serial).slice(0, 40)}`);
    return db.collection(COLLECTION).doc(plain);
  };

  async function resolveRef(serial, reader) {
    const prefixed = ref(serial);
    const snap = await (reader || prefixed).get(...(reader ? [prefixed] : []));
    if (snap.exists) return { docRef: prefixed, snap };
    const plain = plainRef(serial);
    const snap2 = await (reader || plain).get(...(reader ? [plain] : []));
    if (snap2.exists) return { docRef: plain, snap: snap2 };
    // Documents saved with a lower-case id (ml81101843)
    const lower = db.collection(COLLECTION).doc(normalizeSerial(serial).toLowerCase());
    const snap3 = await (reader || lower).get(...(reader ? [lower] : []));
    return snap3.exists ? { docRef: lower, snap: snap3 } : { docRef: prefixed, snap };
  }

  /** Public view of a product. Never exposes the customer's personal details. */
  function toPublic(serial, data) {
    return {
      serialNumber: fromDocId(data.serialNumber) || serial,
      productName: data.productName || "",
      isRegistered: data.isRegistered === true,
      registeredAt: toIso(data.registeredAt),
    };
  }

  async function find(serial) {
    const { snap } = await resolveRef(serial);
    return snap.exists ? snap.data() : null;
  }

  /** Hash mapping: finds the product that owns this QR hash. Returns { serial, data } or null. */
  async function findByHash(hash) {
    const snap = await db.collection(COLLECTION).where("qrHash", "==", hash).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { serial: fromDocId(doc.id), data: doc.data() };
  }

  /**
   * Atomically registers a product. Using a transaction means two people scanning
   * the same QR at the same moment can never both register it.
   * Returns { status: "registered" | "not_found" | "already_registered", product }.
   */
  async function register(serial, customer) {
    return db.runTransaction(async (tx) => {
      const { docRef, snap } = await resolveRef(serial, tx);

      if (!snap.exists) return { status: "not_found" };

      const data = snap.data();
      if (data.isRegistered === true) {
        return { status: "already_registered", product: toPublic(serial, data) };
      }

      const registeredAt = new Date();
      tx.update(docRef, {
        customerName: customer.customerName,
        email: customer.email,
        phone: customer.phone,
        isRegistered: true,
        status: "registered",
        registeredAt,
        agreedToPolicy: true,
      });

      return {
        status: "registered",
        product: toPublic(serial, { ...data, isRegistered: true, registeredAt }),
      };
    });
  }

  /**
   * All registered products that belong to a phone number (10 digits), newest first.
   * Only product details are returned - never the customer's own details.
   */
  async function listByPhone(phone) {
    const snap = await db
      .collection(COLLECTION)
      .where("phone", "==", phone)
      .where("isRegistered", "==", true)
      .limit(100)
      .get();

    return snap.docs
      .map((doc) => toPublic(doc.id, doc.data()))
      .sort((a, b) => String(b.registeredAt || "").localeCompare(String(a.registeredAt || "")));
  }

  /** Name and email of the customer who registered a product with this phone number (or null). */
  async function findCustomerByPhone(phone) {
    const snap = await db
      .collection(COLLECTION)
      .where("phone", "==", phone)
      .where("isRegistered", "==", true)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const data = snap.docs[0].data();
    return { name: data.customerName || "", email: data.email || "", phone };
  }

  /** Stores the outcome of the SMS / email so failed notifications can be followed up. */
  async function saveNotificationStatus(serial, notifications) {
    try {
      const { docRef } = await resolveRef(serial);
      await docRef.update({ notifications });
    } catch (err) {
      console.error("Could not save notification status:", err.message);
    }
  }

  return { find, findByHash, register, listByPhone, findCustomerByPhone, toPublic, saveNotificationStatus };
}

module.exports = { createProductStore, COLLECTION };