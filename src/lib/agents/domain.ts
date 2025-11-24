/**
 * Domain types for AI agent trading system
 * 
 * All types are strongly typed with no `any` to ensure type safety
 * throughout the trading engine.
 */

/**
 * Agent identifiers - must match exactly
 */
export type AgentId = 
  | 'GROK_4' 
  | 'GPT_5' 
  | 'DEEPSEEK_V3' 
  | 'GEMINI_2_5' 
  | 'CLAUDE_4_5' 
  | 'QWEN_2_5';

/**
 * Risk tolerance levels
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Market categories from Polymarket
 */
export type Category = 
  | 'Crypto' 
  | 'Tech' 
  | 'Finance' 
  | 'Politics' 
  | 'Elections' 
  | 'Sports' 
  | 'Entertainment' 
  | 'World' 
  | 'Geopolitics';

/**
 * Agent factor weights
 * Defines how much each agent cares about each scoring component
 */
export interface AgentWeights {
  volumeWeight: number;        // Importance of volumeScore
  liquidityWeight: number;     // Importance of liquidityScore
  priceMovementWeight: number; // Importance of priceMovementScore
  newsWeight: number;          // Importance of newsScore
  probWeight: number;          // Importance of probScore
}

/**
 * Agent profile configuration
 * Defines trading strategy parameters for each agent
 */
export interface AgentProfile {
  id: AgentId;
  displayName: string;
  avatar: string; // URL or icon key
  minVolume: number; // Minimum USD volume required
  minLiquidity: number; // Minimum USD liquidity required
  maxTrades: number; // Maximum number of trades to generate
  risk: RiskLevel;
  focusCategories: Category[];
  weights: AgentWeights; // Factor weights for scoring
}

/**
 * Market data from Polymarket
 * Maps to actual Polymarket API response structure
 */
export interface Market {
  id: string;
  question: string;
  category: Category | 'Other';
  volumeUsd: number;
  liquidityUsd: number;
  currentProbability: number; // 0-1
  priceChange24h: number; // -1 to +1 (percentage change as decimal)
  raw?: unknown; // Store raw Polymarket response for debugging
  endDate?: string; // ISO date string when market ends/resolves
  closed?: boolean; // Whether market is closed/resolved
  archived?: boolean; // Whether market is archived
  active?: boolean; // Whether market is currently active
}

/**
 * Trade side (YES or NO)
 */
export type TradeSide = 'YES' | 'NO';

/**
 * Trade status
 */
export type TradeStatus = 'OPEN' | 'CLOSED';

/**
 * Agent trade record
 * Represents a single trade decision by an agent
 */
export interface WebResearchSnippet {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

export interface AgentTrade {
  id: string; // Deterministic: `${agentId}:${marketId}`
  agentId: AgentId;
  marketId: string;
  marketQuestion: string; // Market question/title for display
  entryProbability: number; // Probability when trade was opened (0-1)
  currentProbability: number; // Last known probability (0-1)
  side: TradeSide;
  confidence: number; // 0-1
  score: number; // 0-100 from scoring engine
  reasoning: string[]; // Array of bullet point strings
  status: TradeStatus;
  pnl: number | null; // null for OPEN trades
  investmentUsd: number; // Amount invested in this trade
  openedAt: string; // ISO timestamp
  closedAt?: string; // ISO timestamp (only for CLOSED)
  summaryDecision: string; // 1-2 sentence explanation
  seed: string; // Hash basis for determinism
  webResearchSummary?: WebResearchSnippet[];
}

/**
 * News article from aggregated sources
 */
export interface NewsArticle {
  id: string;
  title: string;
  description?: string;
  content?: string;
  source: string;
  publishedAt: string; // ISO timestamp
  url?: string;
  sourceApi?: string;
}

/**
 * Scored market with component breakdown
 */
export interface ScoredMarket extends Market {
  score: number; // 0-100 total score
  components: {
    volumeScore: number;
    liquidityScore: number;
    priceMovementScore: number;
    newsScore: number;
    probScore: number;
  };
}

/**
 * News relevance result
 */
export interface NewsRelevance {
  count: number;
  matchedTitles: string[];
}

/**
 * Agent profiles configuration
 * 
 * Each agent has unique risk profile and category preferences
 */
export const AGENT_PROFILES: Record<AgentId, AgentProfile> = {
  GROK_4: {
    id: 'GROK_4',
    displayName: 'GROK 4',
    avatar: '🔥',
    minVolume: 30000,  // Lowered from 50000 to allow more markets
    minLiquidity: 5000, // Lowered from 10000 to allow more markets
    maxTrades: 5,
    risk: 'HIGH',
    focusCategories: ['Crypto', 'Tech', 'Politics'],
    weights: {
      volumeWeight: 1.3,
      liquidityWeight: 1.0,
      priceMovementWeight: 1.4,
      newsWeight: 0.9,
      probWeight: 1.0,
    },
  },
  GPT_5: {
    id: 'GPT_5',
    displayName: 'GPT-5',
    avatar: '✨',
    minVolume: 100000,
    minLiquidity: 20000,
    maxTrades: 4,
    risk: 'MEDIUM',
    focusCategories: ['Tech', 'Finance', 'Crypto'],
    weights: {
      volumeWeight: 1.1,
      liquidityWeight: 1.2,
      priceMovementWeight: 1.0,
      newsWeight: 1.1,
      probWeight: 1.1,
    },
  },
  DEEPSEEK_V3: {
    id: 'DEEPSEEK_V3',
    displayName: 'DEEPSEEK V3',
    avatar: '🔮',
    minVolume: 75000,
    minLiquidity: 15000,
    maxTrades: 6,
    risk: 'MEDIUM',
    focusCategories: ['Crypto', 'Finance', 'Elections'],
    weights: {
      volumeWeight: 1.0,
      liquidityWeight: 1.0,
      priceMovementWeight: 1.1,
      newsWeight: 1.3,
      probWeight: 1.0,
    },
  },
  GEMINI_2_5: {
    id: 'GEMINI_2_5',
    displayName: 'GEMINI 2.5',
    avatar: '♊',
    minVolume: 20000,  // Lowered from 30000 to allow more markets
    minLiquidity: 3000, // Lowered from 5000 to allow more markets
    maxTrades: 7,
    risk: 'HIGH',
    focusCategories: ['Sports', 'Entertainment', 'World'],
    weights: {
      volumeWeight: 0.9,
      liquidityWeight: 0.9,
      priceMovementWeight: 1.3,
      newsWeight: 1.4,
      probWeight: 1.0,
    },
  },
  CLAUDE_4_5: {
    id: 'CLAUDE_4_5',
    displayName: 'CLAUDE 4.5',
    avatar: '🧠',
    minVolume: 80000,
    minLiquidity: 18000,
    maxTrades: 5,
    risk: 'LOW',
    focusCategories: ['Finance', 'Politics', 'Elections'],
    weights: {
      volumeWeight: 1.0,
      liquidityWeight: 1.3,
      priceMovementWeight: 0.9,
      newsWeight: 1.4,
      probWeight: 1.2,
    },
  },
  QWEN_2_5: {
    id: 'QWEN_2_5',
    displayName: 'QWEN 2.5',
    avatar: '🤖',
    minVolume: 60000,
    minLiquidity: 12000,
    maxTrades: 6,
    risk: 'MEDIUM',
    focusCategories: ['Finance', 'Geopolitics', 'World'],
    weights: {
      volumeWeight: 1.1,
      liquidityWeight: 1.0,
      priceMovementWeight: 1.0,
      newsWeight: 1.2,
      probWeight: 1.1,
    },
  },
};

/**
 * All agent IDs
 */
export const ALL_AGENT_IDS: AgentId[] = Object.keys(AGENT_PROFILES) as AgentId[];

/**
 * Get agent profile by ID
 */
export function getAgentProfile(agentId: AgentId): AgentProfile {
  const profile = AGENT_PROFILES[agentId];
  if (!profile) {
    throw new Error(`Unknown agent ID: ${agentId}`);
  }
  return profile;
}

/**
 * Validate agent ID
 */
export function isValidAgentId(id: string): id is AgentId {
  return id in AGENT_PROFILES;
}



