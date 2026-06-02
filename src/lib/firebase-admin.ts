import admin from "firebase-admin";

function initAdmin(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not set. Add a Firebase service account JSON to Vercel env vars."
    );
  }

  const serviceAccount = JSON.parse(raw) as admin.ServiceAccount;
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export function getAdminFirestore(): admin.firestore.Firestore {
  initAdmin();
  return admin.firestore();
}

export function getAdminAuth(): admin.auth.Auth {
  initAdmin();
  return admin.auth();
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
}
