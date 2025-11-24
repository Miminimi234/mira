// Deprecated: cache implementation removed in new flow.
// Kept as a minimal shim to avoid breaking imports during transition.

export async function getCachedAgentTrades(): Promise<null> { return null; }
export async function getCachedTradesQuick(): Promise<null> { return null; }
export async function setCachedAgentTrades(): Promise<void> { return; }
export function clearAgentCache(): void { return; }

