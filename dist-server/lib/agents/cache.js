// Deprecated: cache implementation removed in new flow.
// Kept as a minimal shim to avoid breaking imports during transition.
export async function getCachedAgentTrades() { return null; }
export async function getCachedTradesQuick() { return null; }
export async function setCachedAgentTrades() { return; }
export function clearAgentCache() { return; }
