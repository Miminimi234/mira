/**
 * Persistence layer for agent trades and portfolios
 * 
 * Placeholder implementation - can be extended with database integration
 */

import type { AgentId, Category } from './domain.js';
import type { AgentPortfolio } from './portfolio.js';

/**
 * Agent trade record for persistence
 */
export interface AgentTradeRecord {
  id: string;
  agentId: AgentId;
  marketId: string;
  category?: Category | 'Other';
  side: 'YES' | 'NO';
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
  pnlUsd: number | null;
}

/**
 * Agent portfolio record for persistence
 */
export interface AgentPortfolioRecord {
  agentId: AgentId;
  portfolio: AgentPortfolio;
  updatedAt: string;
}

/**
 * Get persistence adapter (placeholder)
 */
export async function getPersistenceAdapter() {
  // Try to use server-side Firebase persistence when available (Node runtime)
  try {
    // Lazy dynamic import to avoid bundling server-only code into client bundles
    const firebaseClient = await import('../../../server/firebaseClient.js');

    return {
      savePortfolio: async (_portfolio: AgentPortfolio) => { },
      loadPortfolio: async (_agentId: AgentId): Promise<AgentPortfolio | null> => null,
      getPortfolio: async (_agentId: AgentId): Promise<AgentPortfolio | null> => null,
      // Save trade into Firebase under `trade:{tradeId}` and index `marketTrade:{marketId}`
      saveTrade: async (trade: AgentTradeRecord) => {
        try {
          const tradeKey = `trade:${trade.id}`;
          await firebaseClient.setCache(tradeKey, trade, 60 * 60 * 24 * 30); // 30 days
          const marketIndexKey = `marketTrade:${trade.marketId}`;
          await firebaseClient.setCache(marketIndexKey, { tradeId: trade.id, agentId: trade.agentId, status: trade.status }, 60 * 60 * 24 * 30);
        } catch (err) {
          console.warn('[PERSISTENCE] Failed to save trade to Firebase:', (err as Error).message);
        }
      },
      loadTrades: async (_agentId: AgentId): Promise<AgentTradeRecord[]> => {
        // Basic implementation: try to load trades by agentId via per-trade keys is expensive.
        // For now, return empty list (not used heavily elsewhere). A better implementation
        // would maintain an index like `tradesByAgent:{agentId}`.
        return [];
      },
      updatePortfolio: async (_portfolio: AgentPortfolio) => { },
      // Check whether a market already has a trade recorded
      marketHasTrade: async (marketId: string): Promise<boolean> => {
        try {
          const marketIndexKey = `marketTrade:${marketId}`;
          const existing = await firebaseClient.getCache(marketIndexKey);
          if (!existing) return false;
          // If status is OPEN, consider it an active trade
          return existing.status === 'OPEN';
        } catch (err) {
          console.warn('[PERSISTENCE] marketHasTrade check failed:', (err as Error).message);
          return false; // Fail-safe: don't block generation if check fails
        }
      },
    };
  } catch (err) {
    // Fallback placeholder (no persistence available)
    return {
      savePortfolio: async (_portfolio: AgentPortfolio) => { },
      loadPortfolio: async (_agentId: AgentId): Promise<AgentPortfolio | null> => null,
      getPortfolio: async (_agentId: AgentId): Promise<AgentPortfolio | null> => null,
      saveTrade: async (_trade: AgentTradeRecord) => { },
      loadTrades: async (_agentId: AgentId): Promise<AgentTradeRecord[]> => [],
      updatePortfolio: async (_portfolio: AgentPortfolio) => { },
      marketHasTrade: async (_marketId: string): Promise<boolean> => false,
    };
  }
}

/**
 * Convert portfolio to record
 */
export function portfolioToRecord(portfolio: AgentPortfolio): AgentPortfolioRecord {
  return {
    agentId: portfolio.agentId,
    portfolio,
    updatedAt: portfolio.lastUpdated,
  };
}

