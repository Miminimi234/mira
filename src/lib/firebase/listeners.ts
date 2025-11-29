import { limitToLast, off, onValue, orderByChild, query, ref } from 'firebase/database';
import { getDb, initFirebase } from './client';

initFirebase();

function snapshotToArray(snapshot: any) {
    const val = snapshot?.val();
    if (!val) return [];
    return Object.keys(val).map(key => ({ id: key, ...val[key] }));
}

export function listenToAgentPredictions(callback: (items: any[]) => void) {
    const db = getDb();
    if (!db) {
        console.warn('[listenToAgentPredictions] no db');
        return () => { };
    }
    // Subscribe to the full `/agent_predictions` node so callers receive all historical
    // agent prediction records (not limited to the most recent N). This ensures counts
    // and max-bet calculations reflect the complete dataset.
    const r = ref(db, '/agent_predictions');
    const handler = (snap: any) => {
        const arr = snapshotToArray(snap);
        callback(arr);
    };
    onValue(r, handler);
    return () => off(r, 'value', handler as any);
}

export function listenToPredictions(callback: (items: any[]) => void, limit = 200) {
    const db = getDb();
    if (!db) return () => { };
    const r = query(ref(db, '/predictions'), orderByChild('createdAt'), limitToLast(limit));
    const handler = (snap: any) => {
        const arr = snapshotToArray(snap);
        callback(arr);
    };
    onValue(r, handler);
    return () => off(r, 'value', handler as any);
}

export function listenToAgentBalances(callback: (items: any[]) => void) {
    const db = getDb();
    if (!db) return () => { };
    const r = ref(db, '/agent_balances');
    const handler = (snap: any) => {
        const val = snap?.val() || {};
        // convert to array of { agentId, balance }
        const arr = Object.keys(val).map(k => ({ agentId: k, balance: val[k] }));
        callback(arr);
    };
    onValue(r, handler);
    return () => off(r, 'value', handler as any);
}

export function listenToMarkets(callback: (map: Record<string, any>) => void) {
    const db = getDb();
    if (!db) return () => { };
    const r = ref(db, '/markets');
    const handler = (snap: any) => {
        const val = snap?.val() || {};
        callback(val);
    };
    onValue(r, handler);
    return () => off(r, 'value', handler as any);
}
