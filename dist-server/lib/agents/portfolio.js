/**
 * Portfolio management
 *
 * Handles agent portfolio initialization, position sizing, and PnL tracking.
 * All agents start with $3,000 USD.
 */
/**
 * Starting capital for all agents (USD)
 */
export const STARTING_CAPITAL_USD = 3000;
/**
 * Risk budget per trade by risk level (USD)
 */
export const RISK_BUDGET = {
    LOW: 50,
    MEDIUM: 100,
    HIGH: 150,
};
/**
 * Create initial portfolio for an agent
 *
 * @param agentId - Agent identifier
 * @returns Initial portfolio with $3,000 starting capital
 */
export function createInitialPortfolio(agentId) {
    return {
        agentId,
        startingCapitalUsd: STARTING_CAPITAL_USD,
        currentCapitalUsd: STARTING_CAPITAL_USD,
        realizedPnlUsd: 0,
        unrealizedPnlUsd: 0,
        maxEquityUsd: STARTING_CAPITAL_USD,
        maxDrawdownPct: 0,
        openPositions: {},
        lastUpdated: new Date().toISOString(),
    };
}
/**
 * Update portfolio metrics with current market data
 *
 * Calculates unrealized PnL for open positions based on current market prices.
 *
 * @param portfolio - Portfolio to update
 * @param marketsMap - Map of market ID to Market for quick lookup
 */
export function updatePortfolioMetrics(portfolio, marketsMap) {
    let totalUnrealizedPnl = 0;
    // Calculate unrealized PnL for each open position
    for (const [marketId, position] of Object.entries(portfolio.openPositions)) {
        const market = marketsMap.get(marketId);
        if (!market) {
            continue; // Market no longer available
        }
        const currentProb = market.currentProbability;
        const entryProb = position.entryProbability;
        // Calculate unrealized PnL
        let unrealizedPnl = 0;
        if (position.side === 'YES') {
            // YES position: profit if probability increases
            unrealizedPnl = (currentProb - entryProb) * position.sizeUsd;
        }
        else {
            // NO position: profit if probability decreases
            unrealizedPnl = (entryProb - currentProb) * position.sizeUsd;
        }
        // Update position
        position.currentProbability = currentProb;
        position.unrealizedPnl = unrealizedPnl;
        totalUnrealizedPnl += unrealizedPnl;
    }
    // Update portfolio
    portfolio.unrealizedPnlUsd = totalUnrealizedPnl;
    portfolio.currentCapitalUsd = portfolio.startingCapitalUsd + portfolio.realizedPnlUsd + totalUnrealizedPnl;
    // Update max equity
    if (portfolio.currentCapitalUsd > portfolio.maxEquityUsd) {
        portfolio.maxEquityUsd = portfolio.currentCapitalUsd;
    }
    // Calculate max drawdown
    if (portfolio.maxEquityUsd > 0) {
        const drawdown = (portfolio.maxEquityUsd - portfolio.currentCapitalUsd) / portfolio.maxEquityUsd;
        portfolio.maxDrawdownPct = Math.max(portfolio.maxDrawdownPct, drawdown);
    }
    portfolio.lastUpdated = new Date().toISOString();
}
/**
 * Calculate position size based on risk budget and confidence
 *
 * @param agentRisk - Agent risk level
 * @param confidence - Trade confidence (0-1)
 * @param currentCapital - Current capital available
 * @returns Position size in USD
 */
export function calculatePositionSize(agentRisk, confidence, currentCapital) {
    const baseRisk = RISK_BUDGET[agentRisk];
    const confidenceMultiplier = Math.max(0.5, Math.min(1.5, confidence));
    const baseSize = baseRisk * confidenceMultiplier;
    // Apply hard caps
    const maxSingleMarketExposure = currentCapital * 0.20; // 20% max per market
    const maxSize = Math.min(baseSize, maxSingleMarketExposure);
    return Math.max(0, Math.min(maxSize, currentCapital * 0.1)); // At least 10% of capital available
}
