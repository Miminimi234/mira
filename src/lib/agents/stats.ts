/**
 * Agent statistics calculation
 * 
 * Calculates real-time agent performance metrics from trades.
 */

import type { AgentId, AgentTrade } from './domain.js';
import { getAgentProfile } from './domain.js';
import { STARTING_CAPITAL_USD } from './portfolio.js';

/**
 * Agent statistics for display
 */
export interface AgentStats {
  id: string; // Frontend ID (e.g., 'deepseek')
  name: string;
  emoji: string;
  color: string;
  cash: number; // Available cash (starting - open investments)
  total: number; // Total capital (cash + unrealized PnL)
  pnl: number; // Total P&L (realized + unrealized)
  winRate: number; // Win rate percentage
  wins: number; // Number of winning closed trades
  losses: number; // Number of losing closed trades
  exposure: number; // Total exposure in open positions
  maxExposure: number; // Max exposure percentage
  calls: number; // Total number of trades
  minConf: number; // Minimum confidence (from agent profile)
}

/**
 * Agent color mapping
 */
const AGENT_COLORS: Record<string, string> = {
  'deepseek': '#8b91a8',
  'claude': '#9d8b6b',
  'qwen': '#6b9e7d',
  'gemini': '#9ca3af',
  'grok': '#ba6b6b',
  'gpt5': '#8b7aa8',
};

/**
 * Frontend ID mapping
 */
const FRONTEND_ID_MAP: Record<string, string> = {
  'DEEPSEEK_V3': 'deepseek',
  'CLAUDE_4_5': 'claude',
  'QWEN_2_5': 'qwen',
  'GEMINI_2_5': 'gemini',
  'GROK_4': 'grok',
  'GPT_5': 'gpt5',
};

/**
 * Calculate agent statistics from trades
 * 
 * @param agentId - Backend agent ID
 * @param trades - All trades for this agent
 * @returns Agent statistics
 */
export function calculateAgentStats(
  agentId: AgentId,
  trades: AgentTrade[]
): AgentStats {
  const agent = getAgentProfile(agentId);
  const frontendId = FRONTEND_ID_MAP[agentId] || agentId.toLowerCase();
  
  // Separate open and closed trades
  const openTrades = trades.filter(t => t.status === 'OPEN');
  const closedTrades = trades.filter(t => t.status === 'CLOSED' && t.pnl !== null);
  
  // Calculate realized PnL from closed trades
  const realizedPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  
  // Calculate exposure (total investment in open positions)
  const exposure = openTrades.reduce((sum, t) => sum + (t.investmentUsd || 0), 0);
  
  // Calculate unrealized PnL (simplified - would need current market prices)
  // For now, estimate as 0 (would need market data to calculate properly)
  const unrealizedPnl = 0; // TODO: Calculate from current market prices
  
  // Calculate total capital
  const totalCapital = STARTING_CAPITAL_USD + realizedPnl + unrealizedPnl;
  
  // Calculate cash (available capital)
  const cash = totalCapital - exposure;
  
  // Calculate wins/losses
  const wins = closedTrades.filter(t => (t.pnl || 0) > 0).length;
  const losses = closedTrades.filter(t => (t.pnl || 0) <= 0).length;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  
  // Calculate total P&L
  const totalPnl = realizedPnl + unrealizedPnl;
  
  // Calculate max exposure percentage
  const maxExposurePct = STARTING_CAPITAL_USD > 0 
    ? (exposure / STARTING_CAPITAL_USD) * 100 
    : 0;
  
  // Total calls (trades)
  const calls = trades.length;
  
  // Minimum confidence (from agent profile - could also calculate from actual trades)
  const minConf = 0.60; // Default, could be calculated from trades
  
  return {
    id: frontendId,
    name: agent.displayName,
    emoji: agent.avatar,
    color: AGENT_COLORS[frontendId] || '#64748b',
    cash: Math.max(0, cash), // Ensure non-negative
    total: Math.max(0, totalCapital),
    pnl: totalPnl,
    winRate,
    wins,
    losses,
    exposure,
    maxExposure: maxExposurePct,
    calls,
    minConf,
  };
}

/**
 * Calculate stats for all agents
 * 
 * @param tradesByAgent - Trades grouped by agent ID
 * @returns Array of agent stats, sorted by total P&L (descending)
 */
export function calculateAllAgentStats(
  tradesByAgent: Record<AgentId, AgentTrade[]>
): AgentStats[] {
  const stats: AgentStats[] = [];
  
  for (const [agentId, trades] of Object.entries(tradesByAgent)) {
    stats.push(calculateAgentStats(agentId as AgentId, trades));
  }
  
  // Sort by total P&L (descending)
  stats.sort((a, b) => b.pnl - a.pnl);
  
  return stats;
}

