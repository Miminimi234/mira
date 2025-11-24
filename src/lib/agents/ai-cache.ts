/**
 * AI API Response Cache
 * 
 * Caches AI API responses to minimize costs and improve performance.
 * Cache key: `${agentId}:${marketId}`
 * TTL: 5 minutes (AI decisions should be relatively stable)
 */

import type { AgentId } from './domain.js';
import type { AITradeDecision } from './ai-clients.js';

interface AICacheEntry {
  decision: AITradeDecision;
  cachedAt: number;
}

const AI_CACHE_TTL = 30 * 1000; // 30 seconds (much shorter for fresh AI decisions)
const aiCache = new Map<string, AICacheEntry>();

/**
 * Get cached AI decision
 */
export function getCachedAIDecision(agentId: AgentId, marketId: string): AITradeDecision | null {
  const key = `${agentId}:${marketId}`;
  const entry = aiCache.get(key);
  
  if (!entry) {
    return null;
  }
  
  const age = Date.now() - entry.cachedAt;
  if (age >= AI_CACHE_TTL) {
    aiCache.delete(key);
    return null;
  }
  
  return entry.decision;
}

/**
 * Cache AI decision
 */
export function setCachedAIDecision(
  agentId: AgentId,
  marketId: string,
  decision: AITradeDecision
): void {
  const key = `${agentId}:${marketId}`;
  aiCache.set(key, {
    decision,
    cachedAt: Date.now(),
  });
}

/**
 * Clear AI cache (useful for testing)
 */
export function clearAICache(): void {
  aiCache.clear();
}
