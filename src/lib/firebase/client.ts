import { getApps, initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

let db: ReturnType<typeof getDatabase> | null = null;

export function initFirebase() {
    const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

    if (!databaseURL || !projectId) {
        console.warn('[firebase] init skipped - missing VITE_FIREBASE_DATABASE_URL or VITE_FIREBASE_PROJECT_ID');
        return null;
    }

    try {
        if (!getApps().length) {
            const cfg: any = { databaseURL };
            if (import.meta.env.VITE_FIREBASE_API_KEY) cfg.apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
            if (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) cfg.authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
            if (import.meta.env.VITE_FIREBASE_PROJECT_ID) cfg.projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
            if (import.meta.env.VITE_FIREBASE_APP_ID) cfg.appId = import.meta.env.VITE_FIREBASE_APP_ID;
            if (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) cfg.measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
            initializeApp(cfg as any);
        }
        db = getDatabase();
        return db;
    } catch (err) {
        console.warn('[firebase] init failed', err);
        return null;
    }
}

export function getDb() {
    if (!db) initFirebase();
    return db;
}

export default getDb;
