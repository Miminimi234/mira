/**
 * Trade lifecycle management
 *
 * Handles trade exit conditions, position closing, and position management.
 * Manages the lifecycle states: NONE → OPEN → CLOSING → CLOSED
 */
/**
 * Exit condition thresholds
 */
const EXIT_THRESHOLDS = {
    TAKE_PROFIT_YES: 0.8, // Close YES position if probability >= 0.8
    TAKE_PROFIT_NO: 0.2, // Close NO position if probability <= 0.2
    STOP_LOSS_YES: 0.3, // Close YES position if probability <= 0.3
    STOP_LOSS_NO: 0.7, // Close NO position if probability >= 0.7
    MAX_HOLDING_DAYS: 30, // Close position after 30 days
    MIN_SCORE_THRESHOLD: 20, // Close if market score drops below this
};
/**
 * Check if a position should be closed based on exit conditions
 *
 * @param position - Open position
 * @param market - Current market data
 * @param score - Current market score (optional)
 * @returns True if position should be closed
 */
export function shouldClosePosition(position, market, score) {
    const currentProb = market.currentProbability;
    const entryProb = position.entryProbability;
    const openedAt = new Date(position.openedAt);
    const daysOpen = (Date.now() - openedAt.getTime()) / (1000 * 60 * 60 * 24);
    // Take-profit conditions
    if (position.side === 'YES' && currentProb >= EXIT_THRESHOLDS.TAKE_PROFIT_YES) {
        return true;
    }
    if (position.side === 'NO' && currentProb <= EXIT_THRESHOLDS.TAKE_PROFIT_NO) {
        return true;
    }
    // Stop-loss conditions
    if (position.side === 'YES' && currentProb <= EXIT_THRESHOLDS.STOP_LOSS_YES) {
        return true;
    }
    if (position.side === 'NO' && currentProb >= EXIT_THRESHOLDS.STOP_LOSS_NO) {
        return true;
    }
    // Time-based exit
    if (daysOpen >= EXIT_THRESHOLDS.MAX_HOLDING_DAYS) {
        return true;
    }
    // Score decay exit
    if (score !== undefined && score < EXIT_THRESHOLDS.MIN_SCORE_THRESHOLD) {
        return true;
    }
    return false;
}
/**
 * Calculate realized PnL for a closed position
 *
 * @param position - Position being closed
 * @param exitProbability - Market probability at exit
 * @returns Realized PnL in USD
 */
export function calculateRealizedPnl(position, exitProbability) {
    const entryProb = position.entryProbability;
    const sizeUsd = position.sizeUsd;
    if (position.side === 'YES') {
        // YES position: profit if probability increases
        return (exitProbability - entryProb) * sizeUsd;
    }
    else {
        // NO position: profit if probability decreases
        return (entryProb - exitProbability) * sizeUsd;
    }
}
/**
 * Check if position should be flipped (close and reopen opposite side)
 *
 * @param position - Current position
 * @param market - Current market data
 * @param agent - Agent profile
 * @param newConfidence - Confidence for opposite side
 * @returns True if should flip
 */
export function shouldFlipPosition(position, market, agent, newConfidence) {
    // Only flip if:
    // 1. Current position is losing (unrealized PnL < 0)
    // 2. New confidence is high enough (> 0.7)
    // 3. Market probability has moved significantly
    const currentProb = market.currentProbability;
    const entryProb = position.entryProbability;
    // Check if position is losing
    const isLosing = position.side === 'YES'
        ? currentProb < entryProb
        : currentProb > entryProb;
    if (!isLosing) {
        return false; // Don't flip winning positions
    }
    // Check confidence threshold
    if (newConfidence < 0.7) {
        return false; // Need high confidence to flip
    }
    // Check if probability has moved significantly (at least 10%)
    const probChange = Math.abs(currentProb - entryProb);
    if (probChange < 0.1) {
        return false; // Not enough movement
    }
    return true;
}
/**
 * Process lifecycle for all open positions in a portfolio
 *
 * @param portfolio - Agent portfolio
 * @param marketsMap - Map of market ID to Market
 * @param scoresMap - Optional map of market ID to score
 * @returns Array of closed positions with realized PnL
 */
export function processPositionLifecycle(portfolio, marketsMap, scoresMap) {
    const closedPositions = [];
    for (const [marketId, position] of Object.entries(portfolio.openPositions)) {
        const market = marketsMap.get(marketId);
        if (!market) {
            // Market no longer available - close position
            const realizedPnl = position.unrealizedPnl; // Use last known unrealized PnL
            closedPositions.push({ position, realizedPnl });
            delete portfolio.openPositions[marketId];
            continue;
        }
        const score = scoresMap?.get(marketId);
        // Check exit conditions
        if (shouldClosePosition(position, market, score)) {
            const realizedPnl = calculateRealizedPnl(position, market.currentProbability);
            closedPositions.push({ position, realizedPnl });
            delete portfolio.openPositions[marketId];
            // Update portfolio
            portfolio.realizedPnlUsd += realizedPnl;
            portfolio.currentCapitalUsd += realizedPnl;
        }
    }
    return closedPositions;
}
