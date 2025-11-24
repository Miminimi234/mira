/**
 * Leaderboard and competition metrics
 *
 * Computes performance metrics from persisted trade history
 * and portfolio snapshots.
 */
/**
 * Calculate metrics for an agent
 *
 * @param agentId - Agent identifier
 * @param portfolio - Portfolio snapshot
 * @param trades - All trades for agent
 * @param window - Time window filter
 * @returns Computed metrics
 */
export function calculateAgentMetrics(agentId, portfolio, trades, window = 'all-time') {
    // Filter trades by time window
    const now = Date.now();
    const filteredTrades = filterTradesByWindow(trades, window, now);
    // Closed trades only for win rate
    const closedTrades = filteredTrades.filter(t => t.status === 'CLOSED' && t.pnlUsd !== null);
    // Calculate wins/losses
    const wins = closedTrades.filter(t => (t.pnlUsd || 0) > 0).length;
    const losses = closedTrades.filter(t => (t.pnlUsd || 0) <= 0).length;
    const winRate = wins + losses > 0 ? wins / (wins + losses) : 0;
    // Calculate total PnL
    const totalPnlUsd = closedTrades.reduce((sum, t) => sum + (t.pnlUsd || 0), 0);
    // Calculate PnL percentage
    const pnlPct = portfolio.portfolio.startingCapitalUsd > 0
        ? (portfolio.portfolio.currentCapitalUsd - portfolio.portfolio.startingCapitalUsd) / portfolio.portfolio.startingCapitalUsd
        : 0;
    // Calculate average holding time
    const holdingTimes = closedTrades
        .filter(t => t.openedAt && t.closedAt)
        .map(t => {
        const opened = new Date(t.openedAt).getTime();
        const closed = new Date(t.closedAt).getTime();
        return (closed - opened) / 60000; // minutes
    });
    const avgHoldingTimeMinutes = holdingTimes.length > 0
        ? holdingTimes.reduce((sum, t) => sum + t, 0) / holdingTimes.length
        : 0;
    // Calculate trades in last 24h
    const tradesCount24h = filteredTrades.filter(t => {
        const opened = new Date(t.openedAt).getTime();
        return (now - opened) < 24 * 60 * 60 * 1000;
    }).length;
    // Calculate PnL by category
    const categoryPnL = {};
    for (const trade of closedTrades) {
        const category = trade.category || 'Other';
        categoryPnL[category] = (categoryPnL[category] || 0) + (trade.pnlUsd || 0);
    }
    // Find best/worst category
    let bestCategory = null;
    let worstCategory = null;
    let bestPnl = -Infinity;
    let worstPnl = Infinity;
    for (const [category, pnl] of Object.entries(categoryPnL)) {
        if (pnl > bestPnl) {
            bestPnl = pnl;
            bestCategory = category;
        }
        if (pnl < worstPnl) {
            worstPnl = pnl;
            worstCategory = category;
        }
    }
    return {
        agentId,
        currentCapitalUsd: portfolio.portfolio.currentCapitalUsd,
        pnlPct,
        totalPnlUsd,
        winRate,
        tradesCount: filteredTrades.length,
        tradesCount24h,
        avgHoldingTimeMinutes,
        bestCategory,
        worstCategory,
        categoryPnL,
        openPositions: Object.keys(portfolio.portfolio.openPositions || {}).length,
        maxDrawdownPct: portfolio.portfolio.maxDrawdownPct,
    };
}
/**
 * Filter trades by time window
 */
function filterTradesByWindow(trades, window, now) {
    if (window === 'all-time') {
        return trades;
    }
    let cutoffMs;
    switch (window) {
        case '30d':
            cutoffMs = 30 * 24 * 60 * 60 * 1000;
            break;
        case '7d':
            cutoffMs = 7 * 24 * 60 * 60 * 1000;
            break;
        case '24h':
            cutoffMs = 24 * 60 * 60 * 1000;
            break;
        default:
            return trades;
    }
    const cutoff = now - cutoffMs;
    return trades.filter(trade => {
        const opened = new Date(trade.openedAt).getTime();
        return opened >= cutoff;
    });
}
/**
 * Find markets with consensus (multiple agents agree)
 */
export function findConsensusMarkets(allTrades) {
    // Group trades by market
    const marketMap = new Map();
    for (const [agentId, trades] of Object.entries(allTrades)) {
        for (const trade of trades) {
            if (trade.status !== 'OPEN')
                continue;
            const market = marketMap.get(trade.marketId) || { yes: [], no: [] };
            if (trade.side === 'YES') {
                market.yes.push(agentId);
            }
            else {
                market.no.push(agentId);
            }
            if (trade.marketId && !market.question) {
                // Store question if available (would need market data)
                market.question = trade.marketId;
            }
            marketMap.set(trade.marketId, market);
        }
    }
    // Build consensus metrics
    const consensus = [];
    for (const [marketId, data] of marketMap.entries()) {
        const totalAgents = data.yes.length + data.no.length;
        if (totalAgents < 2)
            continue; // Need at least 2 agents
        const consensusSide = data.yes.length > data.no.length ? 'YES' :
            data.no.length > data.yes.length ? 'NO' : 'NONE';
        const consensusStrength = totalAgents > 0
            ? Math.max(data.yes.length, data.no.length) / totalAgents
            : 0;
        consensus.push({
            marketId,
            marketQuestion: data.question || marketId,
            yesCount: data.yes.length,
            noCount: data.no.length,
            agents: [...data.yes, ...data.no],
            consensusSide,
            consensusStrength,
        });
    }
    return consensus.sort((a, b) => b.consensusStrength - a.consensusStrength);
}
/**
 * Find conflicts (agents on opposite sides)
 */
export function findConflicts(allTrades) {
    const marketMap = new Map();
    for (const [agentId, trades] of Object.entries(allTrades)) {
        for (const trade of trades) {
            if (trade.status !== 'OPEN')
                continue;
            const market = marketMap.get(trade.marketId) || { yes: [], no: [] };
            if (trade.side === 'YES') {
                market.yes.push(agentId);
            }
            else {
                market.no.push(agentId);
            }
            marketMap.set(trade.marketId, market);
        }
    }
    const conflicts = [];
    for (const [marketId, data] of marketMap.entries()) {
        if (data.yes.length > 0 && data.no.length > 0) {
            conflicts.push({
                marketId,
                yesAgents: data.yes,
                noAgents: data.no,
            });
        }
    }
    return conflicts;
}
export function computeMarketConsensus(_tradesByAgent) {
    return [];
}
export function getTopConsensusMarkets(_consensus) {
    return [];
}
export function getTopConflictMarkets(_consensus) {
    return [];
}
