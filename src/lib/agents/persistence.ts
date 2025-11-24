// Persistence adapter removed for the new flow.
// Provide a minimal no-op adapter to keep any remaining imports safe during transition.

export interface AgentTradeRecord {
  id: string;
  agentId: string;
  marketId: string;
  category?: string;
  side: 'YES' | 'NO';
  status: 'OPEN' | 'CLOSED' | 'PENDING';
  openedAt: string;
  closedAt?: string;
  pnlUsd: number | null;
}

export interface AgentPortfolioRecord {
  agentId: string;
  portfolio: any;
  updatedAt: string;
}

export async function getPersistenceAdapter() {
  return {
    savePortfolio: async (_portfolio: any) => { /* noop */ },
    loadPortfolio: async (_agentId: string) => null,
    getPortfolio: async (_agentId: string) => null,
    saveTrade: async (_trade: AgentTradeRecord) => { /* noop */ },
    loadTrades: async (_agentId: string) => [] as AgentTradeRecord[],
    updatePortfolio: async (_portfolio: any) => { /* noop */ },
    marketHasTrade: async (_marketId: string) => false,
  };
}

export function portfolioToRecord(portfolio: any): AgentPortfolioRecord {
  return {
    agentId: portfolio.agentId || 'unknown',
    portfolio,
    updatedAt: portfolio.lastUpdated || new Date().toISOString(),
  };
}

