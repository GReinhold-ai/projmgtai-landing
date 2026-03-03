// src/firebase/index.ts
// Minimal Firebase client bootstrap for the browser (Next.js).

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

// Read public config from NEXT_PUBLIC_* vars (safe for frontend).
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

/**
 * Returns the singleton Firebase app instance.
 * Throws with a clear message if any required env var is missing.
 */
export function getFirebaseApp(): FirebaseApp {
  for (const [k, v] of Object.entries(firebaseConfig)) {
    if (!v || typeof v !== "string") {
      throw new Error(
        `[firebase] Missing public env: ${k}. Did you set NEXT_PUBLIC_* in your .env.local?`
      );
    }
  }
  if (getApps().length) return getApps()[0]!;
  return initializeApp(firebaseConfig);
}

// Optional convenience re-exports
export { getAuth } from "firebase/auth";
export { getFirestore } from "firebase/firestore";
export type { FirebaseApp as TFirebaseApp } from "firebase/app";
