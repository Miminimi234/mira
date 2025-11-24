export interface AIAgent {
  id: string;
  name: "GROK" | "OPENAI" | "DEEPSEEK" | "GEMINI";
  displayName: string;
  color: string;
  accuracy: number;
  totalTrades: number;
  profitLoss: number;
  isActive: boolean;
  lastTrade?: string;
}

export interface AgentTrade {
  agentId: string;
  predictionId: string;
  timestamp: Date;
  position: "YES" | "NO";
  price: number;
}
