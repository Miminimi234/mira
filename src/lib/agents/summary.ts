/**
 * Agent summary generation
 * 
 * Helper functions to build human-readable summaries of agent trades and performance.
 */

import type { AgentId, AgentTrade, AgentProfile } from './domain.js';

/**
 * Build a human-readable summary for an agent
 * 
 * @param trades - Array of agent trades
 * @param agent - Agent profile
 * @returns Summary string
 */
export function buildAgentSummary(trades: AgentTrade[], agent: AgentProfile): string {
  if (trades.length === 0) {
    return `${agent.displayName} has no active trades.`;
  }
  
  const openTrades = trades.filter(t => t.status === 'OPEN');
  const closedTrades = trades.filter(t => t.status === 'CLOSED');
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  
  const parts: string[] = [];
  
  if (openTrades.length > 0) {
    parts.push(`${openTrades.length} open position${openTrades.length > 1 ? 's' : ''}`);
  }
  
  if (closedTrades.length > 0) {
    parts.push(`${closedTrades.length} closed trade${closedTrades.length > 1 ? 's' : ''}`);
    if (totalPnl !== 0) {
      const pnlSign = totalPnl > 0 ? '+' : '';
      parts.push(`${pnlSign}$${totalPnl.toFixed(2)} realized PnL`);
    }
  }
  
  if (parts.length === 0) {
    return `${agent.displayName} has ${trades.length} trade${trades.length > 1 ? 's' : ''}.`;
  }
  
  return `${agent.displayName} has ${parts.join(', ')}.`;
}

/**
 * Compute summary statistics across all agents
 * 
 * @param tradesByAgent - Trades grouped by agent ID
 * @returns Summary statistics
 */
export function computeSummaryStats(
  tradesByAgent: Record<AgentId, AgentTrade[]>
): {
  totalPnl: number;
  openTradesCount: number;
  closedTradesCount: number;
  bestAgentByPnl: AgentId | null;
} {
  let totalPnl = 0;
  let openTradesCount = 0;
  let closedTradesCount = 0;
  let bestAgentByPnl: AgentId | null = null;
  let bestPnl = -Infinity;
  
  for (const [agentId, trades] of Object.entries(tradesByAgent)) {
    const closedTrades = trades.filter(t => t.status === 'CLOSED');
    const agentPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    
    totalPnl += agentPnl;
    openTradesCount += trades.filter(t => t.status === 'OPEN').length;
    closedTradesCount += closedTrades.length;
    
    if (agentPnl > bestPnl) {
      bestPnl = agentPnl;
      bestAgentByPnl = agentId as AgentId;
    }
  }
  
  return {
    totalPnl,
    openTradesCount,
    closedTradesCount,
    bestAgentByPnl: bestPnl > -Infinity ? bestAgentByPnl : null,
  };
}

