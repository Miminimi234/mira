// Persistence adapter removed for the new flow.
// Provide a minimal no-op adapter to keep any remaining imports safe during transition.
export async function getPersistenceAdapter() {
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
export function portfolioToRecord(portfolio) {
    return {
        agentId: portfolio.agentId || 'unknown',
        portfolio,
        updatedAt: portfolio.lastUpdated || new Date().toISOString(),
    };
}
