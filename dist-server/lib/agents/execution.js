/**
 * Trading cycle execution model
 *
 * Runs agents on a fixed cadence, independent of UI calls.
 * Separates heavy computation from API endpoints.
 */
import { AGENT_PROFILES, getAgentProfile } from './domain.js';
const ALL_AGENT_IDS = Object.keys(AGENT_PROFILES);
// Use the same market fetching as bubble maps
import { fetchAllMarkets } from '../markets/polymarket.js';
import { fetchLatestNews } from '../news/aggregator.js';
import { generateAgentTrades } from './generator.js';
import { createInitialPortfolio, updatePortfolioMetrics } from './portfolio.js';
// No-op persistence adapter (replaces old persistence.js usage)
async function getNoopPersistenceAdapter() {
    return {
        getPortfolio: async (_agentId) => null,
        savePortfolio: async (_portfolio) => { },
        marketHasTrade: async (_marketId) => false,
        saveTrade: async (_trade) => { },
    };
}
/**
 * Run trading cycle for a single agent
 *
 * @param agentId - Agent identifier
 * @param markets - Current market data
 * @param marketsMap - Markets as Map for quick lookup
 * @returns Cycle result
 */
export async function runAgentCycle(agentId, markets, marketsMap) {
    const startTime = Date.now();
    const agent = getAgentProfile(agentId);
    const persistence = await getNoopPersistenceAdapter();
    try {
        // Load portfolio from persistence if available, otherwise create an initial portfolio.
        // Persistence is optional in the new flow; treat any returned record as untyped and
        // fall back to defaults to keep the execution path simple.
        let portfolio = createInitialPortfolio(agentId);
        try {
            const portfolioRecordAny = await persistence.getPortfolio(agentId);
            if (portfolioRecordAny && (portfolioRecordAny.portfolio || Object.keys(portfolioRecordAny).length > 0)) {
                const pr = portfolioRecordAny.portfolio || portfolioRecordAny;
                portfolio = {
                    agentId,
                    startingCapitalUsd: pr.startingCapitalUsd ?? pr.startingCapital ?? 0,
                    currentCapitalUsd: pr.currentCapitalUsd ?? pr.currentCapital ?? pr.current ?? 0,
                    realizedPnlUsd: pr.realizedPnlUsd ?? 0,
                    unrealizedPnlUsd: pr.unrealizedPnlUsd ?? 0,
                    maxEquityUsd: pr.maxEquityUsd ?? 0,
                    maxDrawdownPct: pr.maxDrawdownPct ?? 0,
                    openPositions: pr.openPositions ?? {},
                    lastUpdated: pr.lastUpdated ?? new Date().toISOString(),
                };
            }
        }
        catch (err) {
            // Ignore persistence mapping errors and use initial portfolio
        }
        // Update portfolio metrics with current market data
        updatePortfolioMetrics(portfolio, marketsMap);
        // Generate desired trades (existing logic)
        const trades = await generateAgentTrades(agentId);
        // TODO: Apply lifecycle logic:
        // 1. Check exit conditions for open positions
        // 2. Close positions that meet exit criteria
        // 3. Open new positions (subject to risk caps)
        // 4. Handle flips (close + reopen opposite side)
        // For now, just count candidate markets
        const candidateMarkets = markets.filter(m => {
            const volume = m.volumeUsd >= agent.minVolume;
            const liquidity = m.liquidityUsd >= agent.minLiquidity;
            return volume && liquidity;
        }).length;
        // Persist portfolio
        await persistence.savePortfolio(portfolio);
        const cycleMs = Date.now() - startTime;
        return {
            agentId,
            success: true,
            candidateMarkets,
            newTrades: trades.filter(t => t.status === 'OPEN').length,
            closedTrades: trades.filter(t => t.status === 'CLOSED').length,
            openPositions: Object.keys(portfolio.openPositions).length,
            cycleMs,
        };
    }
    catch (error) {
        const cycleMs = Date.now() - startTime;
        return {
            agentId,
            success: false,
            candidateMarkets: 0,
            newTrades: 0,
            closedTrades: 0,
            openPositions: 0,
            cycleMs,
            error: error.message,
        };
    }
}
/**
 * Run trading cycle for all agents
 *
 * @param config - Cycle configuration
 * @returns Results for all agents
 */
export async function runTradingCycle(config = { enabled: true, intervalMs: 60000 }) {
    if (!config.enabled) {
        return [];
    }
    // Fetch data sources (uses caches)
    const [markets, news] = await Promise.all([
        fetchAllMarkets(),
        fetchLatestNews(),
    ]);
    // Create markets map for quick lookup
    const marketsMap = new Map();
    for (const market of markets) {
        marketsMap.set(market.id, market);
    }
    // Run cycles for all agents in parallel
    const results = await Promise.allSettled(ALL_AGENT_IDS.map(agentId => runAgentCycle(agentId, markets, marketsMap)));
    // Convert to results array
    const cycleResults = [];
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
            cycleResults.push(result.value);
        }
        else {
            // Failed agent cycle
            cycleResults.push({
                agentId: ALL_AGENT_IDS[i],
                success: false,
                candidateMarkets: 0,
                newTrades: 0,
                closedTrades: 0,
                openPositions: 0,
                cycleMs: 0,
                error: result.reason?.message || 'Unknown error',
            });
        }
    }
    return cycleResults;
}
/**
 * Start scheduled trading cycles
 *
 * @param intervalMs - Interval between cycles
 * @returns Function to stop the scheduler
 */
export function startScheduler(intervalMs = 60000) {
    let intervalId = null;
    let isRunning = false;
    const runCycle = async () => {
        if (isRunning) {
            return; // Skip if previous cycle still running
        }
        isRunning = true;
        try {
            await runTradingCycle({ enabled: true, intervalMs });
        }
        catch (error) {
            console.error('[Scheduler] Cycle failed:', error);
        }
        finally {
            isRunning = false;
        }
    };
    // Run immediately, then on interval
    runCycle();
    intervalId = setInterval(runCycle, intervalMs);
    // Return stop function
    return () => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };
}
