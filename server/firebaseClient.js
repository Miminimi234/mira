// Lightweight stub for firebaseClient used during frontend/server build
// Provides no-op implementations so imports like '../server/firebaseClient.js'
// can be resolved at build-time. The real server runtime uses the
// separate `mira-server` package which contains the production firebase client.

export function isEnabled() {
    return false;
}

export async function getCache(_key) {
    return null;
}

export async function setCache(_key, _value, _ttlSec) {
    // noop
}

export async function getConfig() {
    return null;
}

export default {
    isEnabled,
    getCache,
    setCache,
    getConfig,
};
