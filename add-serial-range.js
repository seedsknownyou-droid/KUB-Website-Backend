const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

// Serial Number Range
const prefix = "MI";
const start = 81105001;
const end = 81105005;

async function addSerialNumbers() {
    try {
        const batch = db.batch();

        const serialNumbers = [];

        for (let i = start; i <= end; i++) {
            serialNumbers.push(`${prefix}${i}`);
        }

        const refs = serialNumbers.map(serial =>
            db.collection("qr_codes").doc(serial)
        );

        const existingDocs = await db.getAll(...refs);

        let addedCount = 0;

        existingDocs.forEach((doc, index) => {

            if (doc.exists) {
                console.log("Already Exists:", serialNumbers[index]);
                return;
            }

            batch.set(doc.ref, {
                agreedToPolicy: false,
                createdAt: FieldValue.serverTimestamp(),
                customerName: "",
                email: "",
                isRegistered: false,
                notifications: {
                    email: {
                        error: null,
                        sent: false
                    },
                    sms: {
                        error: null,
                        sent: false
                    }
                }
            });

            console.log("Adding:", serialNumbers[index]);
            addedCount++;
        });

        if (addedCount > 0) {
            await batch.commit();
        }

        console.log("\n----------------------------");
        console.log("Total Added:", addedCount);
        console.log("Already Existing:", 5 - addedCount);
        console.log("Process Completed Successfully!");
        console.log("----------------------------");

    } catch (error) {
        console.error("Error:", error);
    }
}

addSerialNumbers();