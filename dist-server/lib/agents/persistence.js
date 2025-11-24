/**
 * Persistence layer for agent trades and portfolios
 *
 * Placeholder implementation - can be extended with database integration
 */
/**
 * Get persistence adapter (placeholder)
 */
export async function getPersistenceAdapter() {
    // Try to use server-side Firebase persistence when available (Node runtime)
    try {
        // Lazy dynamic import to avoid bundling server-only code into client bundles
        const firebaseClient = await import('../../../server/firebaseClient.js');
        return {
            savePortfolio: async (_portfolio) => { },
            loadPortfolio: async (_agentId) => null,
            getPortfolio: async (_agentId) => null,
            // Save trade into Firebase under `trade:{tradeId}` and index `marketTrade:{marketId}`
            saveTrade: async (trade) => {
                try {
                    const tradeKey = `trade:${trade.id}`;
                    await firebaseClient.setCache(tradeKey, trade, 60 * 60 * 24 * 30); // 30 days
                    const marketIndexKey = `marketTrade:${trade.marketId}`;
                    await firebaseClient.setCache(marketIndexKey, { tradeId: trade.id, agentId: trade.agentId, status: trade.status }, 60 * 60 * 24 * 30);
                }
                catch (err) {
                    console.warn('[PERSISTENCE] Failed to save trade to Firebase:', err.message);
                }
            },
            loadTrades: async (_agentId) => {
                // Basic implementation: try to load trades by agentId via per-trade keys is expensive.
                // For now, return empty list (not used heavily elsewhere). A better implementation
                // would maintain an index like `tradesByAgent:{agentId}`.
                return [];
            },
            updatePortfolio: async (_portfolio) => { },
            // Check whether a market already has a trade recorded
            marketHasTrade: async (marketId) => {
                try {
                    const marketIndexKey = `marketTrade:${marketId}`;
                    const existing = await firebaseClient.getCache(marketIndexKey);
                    if (!existing)
                        return false;
                    // If status is OPEN, consider it an active trade
                    return existing.status === 'OPEN';
                }
                catch (err) {
                    console.warn('[PERSISTENCE] marketHasTrade check failed:', err.message);
                    return false; // Fail-safe: don't block generation if check fails
                }
            },
        };
    }
    catch (err) {
        // Fallback placeholder (no persistence available)
        return {
            savePortfolio: async (_portfolio) => { },
            loadPortfolio: async (_agentId) => null,
            getPortfolio: async (_agentId) => null,
            saveTrade: async (_trade) => { },
            loadTrades: async (_agentId) => [],
            updatePortfolio: async (_portfolio) => { },
            marketHasTrade: async (_marketId) => false,
        };
    }
}
/**
 * Convert portfolio to record
 */
export function portfolioToRecord(portfolio) {
    return {
        agentId: portfolio.agentId,
        portfolio,
        updatedAt: portfolio.lastUpdated,
    };
}
