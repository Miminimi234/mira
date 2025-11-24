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
import { getPersistenceAdapter } from './persistence.js';
import { createInitialPortfolio, updatePortfolioMetrics } from './portfolio.js';
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
    const persistence = await getPersistenceAdapter();
    try {
        // Load portfolio from persistence
        let portfolioRecord = await persistence.getPortfolio(agentId);
        let portfolio;
        if (portfolioRecord) {
            // Rebuild portfolio from record (simplified - in production would load open positions)
            portfolio = {
                agentId,
                startingCapitalUsd: portfolioRecord.startingCapitalUsd,
                currentCapitalUsd: portfolioRecord.currentCapitalUsd,
                realizedPnlUsd: portfolioRecord.realizedPnlUsd,
                unrealizedPnlUsd: portfolioRecord.unrealizedPnlUsd,
                maxEquityUsd: portfolioRecord.maxEquityUsd,
                maxDrawdownPct: portfolioRecord.maxDrawdownPct,
                openPositions: {}, // TODO: Load from persistence
                lastUpdated: portfolioRecord.lastUpdated,
            };
        }
        else {
            // Create initial portfolio
            portfolio = createInitialPortfolio(agentId);
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
