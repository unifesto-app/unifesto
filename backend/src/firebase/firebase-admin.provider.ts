import * as admin from 'firebase-admin';

let initialized = false;

/**
 * Lazily initializes the Firebase Admin SDK using the existing
 * FIREBASE_PROPERTY_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 * env vars. FIREBASE_PROPERTY_ID is treated as the service account's
 * projectId (the env var name predates this implementation).
 *
 * The private key is stored in .env with literal \n sequences instead of
 * real newlines (confirmed by inspection) — must be unescaped before use,
 * or the SDK will fail to parse the PEM key.
 */
export function getFirebaseAdmin(): admin.app.App {
  if (!initialized) {
    const projectId = process.env.FIREBASE_PROPERTY_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKeyRaw) {
      throw new Error(
        'Firebase env vars missing: FIREBASE_PROPERTY_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY must all be set.',
      );
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    initialized = true;
  }
  return admin.app();
}
