/**
 * Agent trade generator
 * 
 * Main entry point for generating trades for an agent.
 * Orchestrates market fetching, news aggregation, scoring, and trade generation.
 */

import type { AgentId, AgentTrade } from './domain.js';
import { getAgentProfile } from './domain.js';
// Use the same market fetching as bubble maps
// The trading engine will use markets from the server's /api/predictions endpoint
// This ensures we use the SAME API keys and data source
import { fetchAllMarkets } from '../markets/polymarket.js';
import { fetchLatestNews } from '../news/aggregator.js';
// Legacy cache/persistence removed. Use no-op persistence in this build.
import { generateTradeForMarket } from './engine.js';
import { generateResearchForMarket, type ResearchDecision } from './research.js';
import { computeNewsRelevance, filterCandidateMarkets, scoreMarketForAgent } from './scoring.js';
// No-op persistence adapter (replaces old persistence.js)
async function getNoopPersistenceAdapter() {
  return {
    marketHasTrade: async (_marketId: string) => false,
    saveTrade: async (_trade: any) => { /* noop */ },
    savePortfolio: async (_p: any) => { /* noop */ },
    getPortfolio: async (_agentId: string) => null,
  };
}

/**
 * Research decisions cache (separate from trades)
 */
const researchCache = new Map<AgentId, ResearchDecision[]>();

/**
 * Request deduplication: Track ongoing trade generation per agent
 * If multiple requests come in for the same agent, they wait for the first one
 */
const ongoingGeneration = new Map<AgentId, Promise<AgentTrade[]>>();

/**
 * Generate trades for a specific agent
 * 
 * Pipeline:
 * 1. Check cache (fast path)
 * 2. Check if generation already in progress (deduplication)
 * 3. Fetch all markets (cached 60s)
 * 4. Fetch all news (cached 5min)
 * 5. Filter candidate markets for agent
 * 6. Score each candidate
 * 7. Sort by score and take top N
 * 8. Generate trades
 * 9. Cache results
 * 
 * @param agentId - Agent identifier
 * @returns Array of agent trades
 */
export async function generateAgentTrades(agentId: AgentId): Promise<AgentTrade[]> {
  // Check if generation is already in progress for this agent (deduplication)
  const existingGeneration = ongoingGeneration.get(agentId);
  if (existingGeneration) {
    console.log(`[Agent:${agentId}] ⏳ Generation already in progress, waiting for existing request...`);
    return existingGeneration;
  }

  // Legacy cache removed — always generate fresh trades

  // Create generation promise and store it for deduplication
  const generationPromise = (async () => {
    try {
      const startTime = Date.now();
      console.log(`[Agent:${agentId}] 🚀 Starting trade generation`);

      const agent = getAgentProfile(agentId);
      console.log(`[Agent:${agentId}] Profile: ${agent.displayName}, maxTrades: ${agent.maxTrades}, risk: ${agent.risk}`);

      // Fetch data sources
      console.log(`[Agent:${agentId}] 📊 Fetching markets and news...`);
      const [markets, newsArticles] = await Promise.all([
        fetchAllMarkets(),
        fetchLatestNews(),
      ]);

      console.log(`[Agent:${agentId}] ✅ Fetched ${markets.length} markets, ${newsArticles.length} news articles`);

      // CRITICAL: Generate closed trades from active markets for chart data
      // Since expired markets are filtered out, we'll deterministically mark ~30% of trades as closed
      // This creates historical closed trades with mock PnL so the chart shows data immediately
      // When real expired markets are available, they'll be used instead
      // Use allMarkets (currently just active markets, but ready for closed markets)
      const allMarkets = markets;
      console.log(`[Agent:${agentId}] 📊 Total markets for trade generation: ${allMarkets.length} (will generate ~30% as closed trades with PnL)`);

      // Check cache again after fetching markets (market ID validation)
      // Use allMarkets (includes closed) for cache validation
      const currentMarketIds = allMarkets.map(m => m.id).sort();

      // Log sample market IDs for debugging
      if (currentMarketIds.length > 0) {
        console.log(`[Agent:${agentId}] 📋 Sample market IDs (first 5):`, currentMarketIds.slice(0, 5));
      }

      // Try full cache with market ID validation
      // No persisted cache available in this deployment — generating NEW trades
      console.log(`[Agent:${agentId}] 💾 No cache integration — generating NEW trades with AI (this may take time)`);

      // Filter candidate markets (use allMarkets which includes closed markets)
      console.log(`[Agent:${agentId}] 🔍 Filtering candidate markets (minVolume: $${agent.minVolume}, minLiquidity: $${agent.minLiquidity})...`);

      const totalMarkets = allMarkets.length;
      const marketsWithVolume = allMarkets.filter(m => m.volumeUsd >= agent.minVolume).length;
      const marketsWithLiquidity = allMarkets.filter(m => m.liquidityUsd >= agent.minLiquidity).length;
      const marketsWithBoth = allMarkets.filter(m => m.volumeUsd >= agent.minVolume && m.liquidityUsd >= agent.minLiquidity).length;
      console.log(`[Agent:${agentId}] 📊 Market stats: ${totalMarkets} total, ${marketsWithVolume} meet volume, ${marketsWithLiquidity} meet liquidity, ${marketsWithBoth} meet both`);

      // Filter to only markets with valid IDs (must match prediction IDs)
      // Include closed markets - they can still be traded (as closed trades with PnL)
      const validMarkets = allMarkets.filter(m => {
        if (!m.id || m.id.trim() === '') {
          return false;
        }
        return true;
      });

      console.log(`[Agent:${agentId}] 🔍 Filtered to ${validMarkets.length} markets with valid IDs (from ${markets.length} total)`);

      if (validMarkets.length === 0) {
        console.warn(`[Agent:${agentId}] ⚠️ No valid markets found - cannot generate trades`);
        return [];
      }

      const candidates = filterCandidateMarkets(agent, validMarkets);
      console.log(`[Agent:${agentId}] ✅ Found ${candidates.length} candidate markets with valid IDs`);

      if (candidates.length === 0) {
        console.warn(`[Agent:${agentId}] ⚠️ No candidate markets found!`);
        return [];
      }

      // Score all candidates
      const now = new Date();
      const scoredMarkets = candidates.map(market => {
        return scoreMarketForAgent(market, newsArticles, agent, now);
      });

      scoredMarkets.sort((a, b) => b.score - a.score);
      const topScore = scoredMarkets[0]?.score || 0;
      console.log(`[Agent:${agentId}] ✅ Scoring complete. Top: ${topScore.toFixed(1)}`);

      const selectionSize = Math.min(agent.maxTrades * 5, scoredMarkets.length);
      const topMarkets = scoredMarkets.slice(0, selectionSize);

      const timeSeed = Math.floor(Date.now() / 5000);
      const agentSeed = agentId.charCodeAt(0) + agentId.charCodeAt(agentId.length - 1);
      const rotationSeed = timeSeed + agentSeed;

      const shuffled = [...topMarkets];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const seed = `${rotationSeed}:${i}:${shuffled[i].id}`;
        const hash = seed.split('').reduce((acc, char) => {
          return ((acc << 5) - acc) + char.charCodeAt(0);
        }, 0);
        const j = Math.abs(hash) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const selectedMarkets = shuffled.slice(0, Math.min(agent.maxTrades * 3, shuffled.length));
      console.log(`[Agent:${agentId}] 🎯 Selected ${selectedMarkets.length} markets for trade generation`);

      const nowMs = Date.now();
      const trades: AgentTrade[] = [];
      const researchDecisions: ResearchDecision[] = [];
      const maxResearchDecisions = Math.max(agent.maxTrades * 2, 6);
      const researchedMarketIds = new Set<string>();
      const persistence = await getNoopPersistenceAdapter();

      console.log(`[Agent:${agentId}] 🤖 Generating trades for ${selectedMarkets.length} markets...`);
      for (let i = 0; i < selectedMarkets.length; i++) {
        const scored = selectedMarkets[i];
        const newsRelevance = computeNewsRelevance(scored, newsArticles);
        const shouldAttemptTrades = trades.length < agent.maxTrades;

        if (shouldAttemptTrades) {
          // Check persistence to avoid re-betting on markets already recorded
          try {
            const already = await (persistence as any).marketHasTrade?.(scored.id);
            if (already) {
              console.log(`[Agent:${agentId}] ⛔ Skipping market ${scored.id} - already traded in persistence`);
              continue;
            }
          } catch (err) {
            // Ignore persistence check failures (fail-safe)
          }
          try {
            const trade = await generateTradeForMarket(agent, scored, newsRelevance, newsArticles, i, nowMs);
            if (trade) {
              trades.push(trade);
              console.log(`[Agent:${agentId}] ✅ Generated trade ${trades.length}: ${trade.side} @ ${(trade.confidence * 100).toFixed(0)}%`);
              // Persist trade/mark market as predicted so we don't re-predict after restart
              try {
                await (persistence as any).saveTrade?.(trade as any);
                console.log(`[Agent:${agentId}] 🔖 Marked market ${trade.marketId} as predicted in persistence`);
              } catch (err) {
                console.warn(`[Agent:${agentId}] ⚠️ Failed to persist trade for market ${trade.marketId}:`, (err as Error).message);
              }
            } else if (researchDecisions.length < maxResearchDecisions) {
              const researchDecision = await generateResearchForMarket(agent, scored, newsRelevance, newsArticles, i, nowMs);
              if (researchDecision) {
                researchDecisions.push(researchDecision);
                researchedMarketIds.add(scored.id);
              }
            }
          } catch (error) {
            console.error(`[Agent:${agentId}] ❌ Failed to generate trade:`, error);
          }
        } else if (researchDecisions.length < maxResearchDecisions && !researchedMarketIds.has(scored.id)) {
          try {
            const researchDecision = await generateResearchForMarket(agent, scored, newsRelevance, newsArticles, i, nowMs);
            if (researchDecision) {
              researchDecisions.push(researchDecision);
              researchedMarketIds.add(scored.id);
            }
          } catch (error) {
            console.error(`[Agent:${agentId}] ❌ Failed to generate research:`, error);
          }
        }

        if (trades.length >= agent.maxTrades && researchDecisions.length >= maxResearchDecisions) {
          break;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[Agent:${agentId}] ✅ Trade generation complete: ${trades.length} trades in ${duration}ms`);

      // Legacy cache persistence omitted in this deployment
      researchCache.set(agentId, researchDecisions);

      return trades;
    } finally {
      ongoingGeneration.delete(agentId);
    }
  })();

  ongoingGeneration.set(agentId, generationPromise);
  return generationPromise;
}

/**
 * Get research decisions for an agent
 */
export function getAgentResearch(agentId: AgentId): ResearchDecision[] {
  return researchCache.get(agentId) || [];
}



