/**
 * Adaptive Agent Tuning
 * 
 * Lightweight adaptive layer that adjusts agent risk and category preferences
 * based on historical performance. Runs on a slower cadence (e.g. once per day).
 */

import type { AgentId, Category } from './domain.js';
import { RISK_BUDGET, type RiskLevel } from './portfolio.js';

// AgentTradeRecord type (if persistence.ts doesn't exist, define it here)
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
 * Adaptive configuration for an agent
 */
export interface AgentAdaptiveConfig {
  agentId: AgentId;
  riskMultiplier: number;                 // Scales RISK_BUDGET for this agent (0.5-1.5)
  categoryBias: Partial<Record<Category, number>>; // Weights for scoring, 0.7-1.3
  computedAt: string;                     // ISO timestamp
}

/**
 * Agent performance snapshot (30-day window)
 */
export interface AgentPerformanceSnapshot {
  agentId: AgentId;
  pnlPct30d: number;                    // 30-day PnL %
  maxDrawdownPct30d: number;            // Max drawdown over last 30 days
  categoryPnl30d: Record<Category | 'Other', number>;  // Total PnL per category
  categoryTrades30d: Record<Category | 'Other', number>;
}

/**
 * Compute risk multiplier based on performance
 * 
 * @param snapshot - Performance snapshot
 * @returns Risk multiplier (0.5-1.5)
 */
export function computeRiskMultiplier(snapshot: AgentPerformanceSnapshot): number {
  let multiplier = 1.0;
  
  // Reduce risk if drawdown big or losing badly
  if (snapshot.maxDrawdownPct30d > 0.35 || snapshot.pnlPct30d < -10) {
    multiplier *= 0.75;
  }
  // Cautiously increase risk if performing well
  else if (snapshot.pnlPct30d > 25 && snapshot.maxDrawdownPct30d < 0.25) {
    multiplier *= 1.1;
  }
  
  return Math.min(Math.max(multiplier, 0.5), 1.5); // Clamp 0.5-1.5
}

/**
 * Compute category bias based on performance
 * 
 * @param snapshot - Performance snapshot
 * @returns Category bias multipliers (0.7-1.3)
 */
export function computeCategoryBias(
  snapshot: AgentPerformanceSnapshot
): Partial<Record<Category, number>> {
  const bias: Partial<Record<Category, number>> = {};
  
  for (const category of Object.keys(snapshot.categoryPnl30d) as Array<Category | 'Other'>) {
    if (category === 'Other') continue;
    
    const pnl = snapshot.categoryPnl30d[category] || 0;
    const trades = snapshot.categoryTrades30d[category] || 1;
    
    // Average PnL per trade
    const avgPnl = pnl / trades;
    
    // Normalize: assume +/- 50 USD per trade is "big"
    const normalized = Math.max(Math.min(avgPnl / 50, 1), -1); // -1 to +1
    
    // Convert to multiplier: range ~0.7-1.3
    const multiplier = 1 + normalized * 0.3;
    
    bias[category] = Math.min(Math.max(multiplier, 0.7), 1.3);
  }
  
  return bias;
}

/**
 * Compute performance snapshot from trade history
 * 
 * @param agentId - Agent identifier
 * @param trades - All trades for agent (last 30 days)
 * @param startingCapital - Starting capital (default 3000)
 * @returns Performance snapshot
 */
export function computePerformanceSnapshot(
  agentId: AgentId,
  trades: AgentTradeRecord[],
  startingCapital: number = 3000
): AgentPerformanceSnapshot {
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  
  // Filter to last 30 days
  const recentTrades = trades.filter(t => {
    const opened = new Date(t.openedAt).getTime();
    return opened >= thirtyDaysAgo;
  });
  
  // Only closed trades for PnL calculation
  const closedTrades = recentTrades.filter(t => t.status === 'CLOSED' && t.pnlUsd !== null);
  
  // Calculate total PnL
  const totalPnlUsd = closedTrades.reduce((sum, t) => sum + (t.pnlUsd || 0), 0);
  const pnlPct30d = startingCapital > 0 ? (totalPnlUsd / startingCapital) * 100 : 0;
  
  // Calculate max drawdown (simplified - would need portfolio history)
  // For now, estimate from worst losing streak
  let maxDrawdownPct30d = 0;
  let runningPnL = 0;
  let peakPnL = 0;
  
  for (const trade of closedTrades.sort((a, b) => 
    new Date(a.closedAt || a.openedAt).getTime() - new Date(b.closedAt || b.openedAt).getTime()
  )) {
    runningPnL += trade.pnlUsd || 0;
    peakPnL = Math.max(peakPnL, runningPnL);
    const drawdown = peakPnL > 0 ? (peakPnL - runningPnL) / (startingCapital + peakPnL) : 0;
    maxDrawdownPct30d = Math.max(maxDrawdownPct30d, drawdown);
  }
  
  // Calculate category PnL and trade counts
  const categoryPnl30d: Record<Category | 'Other', number> = {} as any;
  const categoryTrades30d: Record<Category | 'Other', number> = {} as any;
  
  for (const trade of closedTrades) {
    const category = (trade.category || 'Other') as Category | 'Other';
    categoryPnl30d[category] = (categoryPnl30d[category] || 0) + (trade.pnlUsd || 0);
    categoryTrades30d[category] = (categoryTrades30d[category] || 0) + 1;
  }
  
  return {
    agentId,
    pnlPct30d,
    maxDrawdownPct30d,
    categoryPnl30d,
    categoryTrades30d,
  };
}

/**
 * Compute adaptive config for an agent
 * 
 * @param agentId - Agent identifier
 * @param trades - Trade history
 * @param startingCapital - Starting capital
 * @returns Adaptive configuration
 */
export function computeAdaptiveConfig(
  agentId: AgentId,
  trades: AgentTradeRecord[],
  startingCapital: number = 3000
): AgentAdaptiveConfig {
  const snapshot = computePerformanceSnapshot(agentId, trades, startingCapital);
  
  const riskMultiplier = computeRiskMultiplier(snapshot);
  const categoryBias = computeCategoryBias(snapshot);
  
  return {
    agentId,
    riskMultiplier,
    categoryBias,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Get effective risk budget with adaptive multiplier
 * 
 * @param baseRisk - Base risk level
 * @param adaptiveConfig - Adaptive configuration
 * @returns Effective risk budget
 */
export function getEffectiveRiskBudget(
  baseRisk: RiskLevel,
  adaptiveConfig: AgentAdaptiveConfig
): number {
  const baseBudget = RISK_BUDGET[baseRisk];
  return baseBudget * adaptiveConfig.riskMultiplier;
}

/**
 * Get category weight multiplier
 * 
 * @param category - Market category
 * @param adaptiveConfig - Adaptive configuration
 * @returns Category weight multiplier (0.7-1.3 or 1.0 default)
 */
export function getCategoryWeightMultiplier(
  category: Category | 'Other',
  adaptiveConfig: AgentAdaptiveConfig
): number {
  if (category === 'Other') return 1.0;
  return adaptiveConfig.categoryBias[category] ?? 1.0;
}



