import { listenToAgentBalances, listenToAgentPredictions, listenToMarkets } from '@/lib/firebase/listeners';
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ChevronDown, ChevronUp, Globe, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TypewriterText } from "./TypewriterText";



const cardVariants = {
  hidden: { opacity: 0, y: -12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: "easeOut" },
  },
};

const DEFAULT_AGENT_OPTIONS = [
  { id: "grok", name: "GROK 4", emoji: "🔥" },
  { id: "gpt5", name: "GPT-5", emoji: "✨" },
  { id: "deepseek", name: "DEEPSEEK V3", emoji: "🔮" },
  { id: "gemini", name: "GEMINI 2.5", emoji: "♊" },
  { id: "claude", name: "CLAUDE 4.5", emoji: "🧠" },
  { id: "qwen", name: "QWEN 2.5", emoji: "🤖" },
];

const BACKEND_TO_FRONTEND_AGENT_ID: Record<string, string> = {
  "GROK_4": "grok",
  "GPT_5": "gpt5",
  "DEEPSEEK_V3": "deepseek",
  "GEMINI_2_5": "gemini",
  "CLAUDE_4_5": "claude",
  "QWEN_2_5": "qwen",
};

// Normalize agent IDs when processing summary data
const normalizeAgentId = (agentId: string) => BACKEND_TO_FRONTEND_AGENT_ID[agentId.toUpperCase()] || agentId.toLowerCase();

// Normalize keys used in maps/dropdowns: lowercase and remove non-alphanumeric
const normalizeAgentKey = (id: any) => {
  if (!id && id !== 0) return '';
  try {
    return String(id).toLowerCase().replace(/[^a-z0-9]/g, '');
  } catch (e) {
    return String(id).toLowerCase();
  }
};

const getAgentLogo = (agentName: string): string => {
  const agentUpper = agentName.toUpperCase();
  if (agentUpper.includes("GROK")) return "/grok.png";
  if (agentUpper.includes("GEMINI")) return "/GEMENI.png";
  if (agentUpper.includes("DEEPSEEK")) return "/deepseek.png";
  if (agentUpper.includes("CLAUDE")) return "/Claude_AI_symbol.svg";
  if (agentUpper.includes("GPT") || agentUpper.includes("OPENAI")) return "/GPT.png";
  if (agentUpper.includes("QWEN")) return "/Qwen_logo.svg";
  return "/placeholder.svg";
};

const MAX_DECISIONS = 50;

interface AIDecision {
  id: string;
  agentId?: string;
  agentName: string;
  agentEmoji: string;
  timestamp: Date;
  action: string;
  market: string;
  marketId?: string; // Add marketId for finding the prediction
  imageUrl?: string;
  decision: string;
  confidence: number;
  reasoning: string; // Truncated for display
  fullReasoning?: string[]; // Full reasoning for expansion
  investmentUsd?: number; // Investment amount
  bet_amount?: number;
  expected_payout_display?: number;
  expected_payout?: number;
  webResearchSummary?: Array<{
    title: string;
    snippet: string;
    url: string;
    source: string;
  }>;
  decisionHistory?: Array<{
    id: string;
    timestamp: Date;
    market: string;
    decision: string;
    confidence: number;
    reasoning: string;
  }>;
  positionStatus?: string;
  pnl?: number;
  marketResolution?: string;
}

interface AISummaryPanelProps {
  onTradeClick?: (marketId: string) => void;
  onDecisionsUpdate?: (decisions: AIDecision[]) => void;
  selectedAgentFilter?: string | null;
  // Optional global search string coming from parent (dashboard header).
  // When provided, the summary panel will filter displayed decisions by market title.
  globalSearch?: string;
  // Optional top-level decision filter: 'all' | 'yes' | 'no'
  decisionFilter?: 'all' | 'yes' | 'no';
}

const mockDecisions: AIDecision[] = [
  {
    id: "1",
    agentName: "GPT-5",
    agentEmoji: "✨",
    timestamp: new Date(Date.now() - 120000),
    action: "TRADE",
    market: "ETH $3,500",
    decision: "YES",
    confidence: 72,
    reasoning: "Strong bullish signals in market momentum. On-chain metrics show increasing network activity.",
    decisionHistory: [
      {
        id: "1-1",
        timestamp: new Date(Date.now() - 120000),
        market: "ETH $3,500",
        decision: "YES",
        confidence: 72,
        reasoning: "Strong bullish signals in market momentum. On-chain metrics show increasing network activity."
      },
      {
        id: "1-2",
        timestamp: new Date(Date.now() - 600000),
        market: "BTC $45,000",
        decision: "NO",
        confidence: 58,
        reasoning: "Mixed signals from institutional flows. Waiting for clearer direction."
      },
      {
        id: "1-3",
        timestamp: new Date(Date.now() - 900000),
        market: "SOL $120",
        decision: "YES",
        confidence: 65,
        reasoning: "Positive developments in DeFi ecosystem driving adoption."
      },
    ]
  },
  {
    id: "2",
    agentName: "GROK 4",
    agentEmoji: "🔥",
    timestamp: new Date(Date.now() - 180000),
    action: "TRADE",
    market: "Trump 2024",
    decision: "YES",
    confidence: 67,
    reasoning: "Current polling data and swing state dynamics indicate favorable conditions.",
    decisionHistory: [
      {
        id: "2-1",
        timestamp: new Date(Date.now() - 180000),
        market: "Trump 2024",
        decision: "YES",
        confidence: 67,
        reasoning: "Current polling data and swing state dynamics indicate favorable conditions."
      },
      {
        id: "2-2",
        timestamp: new Date(Date.now() - 720000),
        market: "Biden Approval",
        decision: "NO",
        confidence: 71,
        reasoning: "Declining approval ratings in key demographics suggest unfavorable outcome."
      },
      {
        id: "2-3",
        timestamp: new Date(Date.now() - 1080000),
        market: "2024 Election Turnout",
        decision: "YES",
        confidence: 63,
        reasoning: "Early voting patterns show high engagement levels."
      },
    ]
  },
  {
    id: "3",
    agentName: "DEEPSEEK V3",
    agentEmoji: "🔮",
    timestamp: new Date(Date.now() - 240000),
    action: "ANALYZING",
    market: "AI Sentience",
    decision: "NO",
    confidence: 45,
    reasoning: "Evaluating technical indicators and market sentiment patterns...",
    decisionHistory: [
      {
        id: "3-1",
        timestamp: new Date(Date.now() - 240000),
        market: "AI Sentience",
        decision: "NO",
        confidence: 45,
        reasoning: "Evaluating technical indicators and market sentiment patterns. Current evidence insufficient for definitive conclusion."
      },
      {
        id: "3-2",
        timestamp: new Date(Date.now() - 840000),
        market: "AGI Timeline",
        decision: "YES",
        confidence: 52,
        reasoning: "Accelerating progress in large language models suggests earlier timeline than previously estimated."
      },
      {
        id: "3-3",
        timestamp: new Date(Date.now() - 1200000),
        market: "AI Regulation",
        decision: "YES",
        confidence: 78,
        reasoning: "Bipartisan support for AI safety frameworks indicates regulatory action likely."
      },
    ]
  },
  {
    id: "4",
    agentName: "CLAUDE 4.5",
    agentEmoji: "🧠",
    timestamp: new Date(Date.now() - 300000),
    action: "TRADE",
    market: "Fed Rate Cut",
    decision: "YES",
    confidence: 66,
    reasoning: "Economic indicators suggest policy shift likely in next quarter.",
    decisionHistory: [
      {
        id: "4-1",
        timestamp: new Date(Date.now() - 300000),
        market: "Fed Rate Cut",
        decision: "YES",
        confidence: 66,
        reasoning: "Economic indicators suggest policy shift likely in next quarter."
      },
      {
        id: "4-2",
        timestamp: new Date(Date.now() - 960000),
        market: "Inflation Target",
        decision: "YES",
        confidence: 59,
        reasoning: "Recent CPI data trending towards 2% target suggests easing cycle beginning."
      },
      {
        id: "4-3",
        timestamp: new Date(Date.now() - 1320000),
        market: "Unemployment Rate",
        decision: "NO",
        confidence: 64,
        reasoning: "Labor market remains tight despite cooling signals, may delay rate cuts."
      },
    ]
  },
  {
    id: "5",
    agentName: "GEMINI 2.5",
    agentEmoji: "♊",
    timestamp: new Date(Date.now() - 360000),
    action: "TRADE",
    market: "Thunderbolts 2025",
    decision: "NO",
    confidence: 7,
    reasoning: "Historical patterns in superhero films show market saturation.",
    decisionHistory: [
      {
        id: "5-1",
        timestamp: new Date(Date.now() - 360000),
        market: "Thunderbolts 2025",
        decision: "NO",
        confidence: 7,
        reasoning: "Historical patterns in superhero films show market saturation. Low box office potential."
      },
      {
        id: "5-2",
        timestamp: new Date(Date.now() - 1080000),
        market: "Avengers 5",
        decision: "YES",
        confidence: 82,
        reasoning: "Strong franchise history and built-in audience suggest high success probability."
      },
      {
        id: "5-3",
        timestamp: new Date(Date.now() - 1440000),
        market: "Deadpool 3",
        decision: "YES",
        confidence: 75,
        reasoning: "R-rated superhero genre has proven track record. Strong pre-release buzz."
      },
    ]
  },
  {
    id: "6",
    agentName: "QWEN 2.5",
    agentEmoji: "🤖",
    timestamp: new Date(Date.now() - 420000),
    action: "TRADE",
    market: "US CPI below 3%",
    decision: "NO",
    confidence: 61,
    reasoning: "Macro signals and recent trend suggest inflation remains sticky above target in near term.",
    decisionHistory: [
      {
        id: "6-1",
        timestamp: new Date(Date.now() - 420000),
        market: "US CPI below 3%",
        decision: "NO",
        confidence: 61,
        reasoning: "Shelter and services inflation prints indicate slower disinflation path."
      },
      {
        id: "6-2",
        timestamp: new Date(Date.now() - 1020000),
        market: "ETH > $3,800",
        decision: "YES",
        confidence: 64,
        reasoning: "On-chain velocity and options skew point to upside continuation."
      },
      {
        id: "6-3",
        timestamp: new Date(Date.now() - 1380000),
        market: "Eurozone rate cut Q2",
        decision: "YES",
        confidence: 58,
        reasoning: "ECB guidance and swaps pricing imply elevated probability of near-term easing."
      }
    ]
  },
];

const formatTimeAgo = (date: Date) => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

export const AISummaryPanel = ({ onTradeClick, onDecisionsUpdate, selectedAgentFilter: selectedAgentProp, globalSearch, decisionFilter = 'all' }: AISummaryPanelProps = {}) => {
  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [marketsMap, setMarketsMap] = useState<Record<string, any>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string | null>(null); // null = all agents
  const [agentBalancesMap, setAgentBalancesMap] = useState<Record<string, any>>({});
  const [agents, setAgents] = useState<Array<{ id: string; name: string; emoji: string }>>(DEFAULT_AGENT_OPTIONS);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const hasLoadedRef = useRef(false);
  const decisionsRef = useRef<AIDecision[]>([]);
  const newDecisionIdsRef = useRef<Set<string>>(new Set());
  const newDecisionOrderRef = useRef<Map<string, number>>(new Map());

  // Sync local filter state when parent passes a selectedAgentFilter prop (agent pill click)
  useEffect(() => {
    setSelectedAgentFilter(selectedAgentProp ?? null);
  }, [selectedAgentProp]);

  // Keep decisions ref in sync with state (no client-side caching)
  useEffect(() => {
    decisionsRef.current = decisions;
  }, [decisions]);

  // Emit decisions to parent when they change (if parent requested updates)
  useEffect(() => {
    try {
      onDecisionsUpdate?.(decisionsRef.current.slice());
    } catch (e) { }
  }, [decisions, onDecisionsUpdate]);

  // Automatically clear the "new" highlight once items have animated in
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (newDecisionIdsRef.current.size === 0) return;
    const timeout = window.setTimeout(() => {
      newDecisionIdsRef.current.clear();
      newDecisionOrderRef.current.clear();
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [decisions]);


  // Process summary data (used by both WebSocket and fallback polling)
  const processSummaryData = (data: any, isMounted: boolean) => {
    if (!isMounted) return;

    // Convert API data to AIDecision format
    const newDecisions: AIDecision[] = [];

    if (Array.isArray(data.agents)) {
      setAgents(prevAgents => {
        const merged = new Map<string, { id: string; name: string; emoji: string }>();
        // seed with defaults but ensure keys are normalized
        DEFAULT_AGENT_OPTIONS.forEach(agent => merged.set(normalizeAgentKey(agent.id), { ...agent, id: normalizeAgentKey(agent.id) }));
        data.agents.forEach((agent: any) => {
          if (!agent?.id) return;
          const rawId = agent.id;
          const normalizedId = normalizeAgentKey(rawId);
          const rawName = agent.name || agent.displayName || String(rawId);
          const cleanedName = String(rawName).replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
          merged.set(normalizedId, {
            id: normalizedId,
            name: cleanedName,
            emoji: agent.emoji || agent.avatar || merged.get(normalizedId)?.emoji || '🤖',
          });
        });
        return Array.from(merged.values());
      });
    }

    if (data.summary?.agentSummaries) {
      for (const agentSummary of data.summary.agentSummaries) {
        const agentId = agentSummary.agentId;
        const trades = data.tradesByAgent?.[agentId] || [];

        // Get all recent trades (OPEN and CLOSED) and research decisions
        const uniqueDecisions = new Map<string, any>();

        // Process trades
        trades
          .sort((a: any, b: any) => {
            const timeA = a.openedAt ? new Date(a.openedAt).getTime() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
            const timeB = b.openedAt ? new Date(b.openedAt).getTime() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
            return timeB - timeA;
          })
          .forEach((trade: any) => {
            const marketKey = trade.marketQuestion || trade.market || trade.marketId;
            if (!uniqueDecisions.has(marketKey)) {
              uniqueDecisions.set(marketKey, { ...trade, type: 'TRADE' });
            }
          });

        // Process research decisions
        const researchDecisions = data.researchByAgent?.[agentId] || [];
        researchDecisions
          .sort((a: any, b: any) => {
            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return timeB - timeA;
          })
          .forEach((research: any) => {
            const marketKey = research.marketQuestion || research.market || research.marketId;
            if (!uniqueDecisions.has(marketKey)) {
              uniqueDecisions.set(marketKey, { ...research, type: 'RESEARCH', action: 'RESEARCH' });
            }
          });

        const uniqueDecisionsArray = Array.from(uniqueDecisions.values()).slice(0, 8);

        // Helper to resolve a human-friendly market question from various candidate fields
        const resolveMarketQuestion = (decision: any) => {
          if (!decision) return null;
          // 1) direct lookup by marketId
          if (decision.marketId && marketsMap?.[decision.marketId]?.question) return marketsMap[decision.marketId].question;
          // 2) prefer explicit fields if present
          if (decision.marketQuestion) return decision.marketQuestion;
          if (decision.market) return decision.market;
          // 3) attempt to match provided ids/slugs against markets entries
          const candidates = [decision.marketId, decision.market, decision.marketQuestion].filter(Boolean).map(String);
          for (const c of candidates) {
            for (const [mk, mv] of Object.entries(marketsMap || {})) {
              if (mk === c) return (mv as any).question || c;
              const maybe = mv as any;
              if (maybe?.slug === c || String(maybe?.id) === c || String(maybe?.marketId) === c) return maybe.question || c;
            }
          }
          return null;
        };

        // Resolve image URL for a decision by checking common fields and fallback to marketsMap
        const resolveImageUrl = (decision: any) => {
          if (!decision) return null;
          // Accept many common variants including image_Url (underscore + capital U)
          const cand = decision.imageUrl || decision.image || decision.image_Url || decision.imageURL || decision.image_url || decision.thumb || decision.icon || null;
          if (cand) return cand;
          // If marketId maps to a marketsMap entry, prefer its image/thumb fields
          const mid = decision.marketId || decision.predictionId || decision.marketId;
          if (mid && marketsMap && marketsMap[mid]) {
            const m = marketsMap[mid] as any;
            return m.image || m.imageUrl || m.image_Url || m.thumb || m.logo || null;
          }
          // Try to find a marketsMap entry by matching question text
          const resolved = resolveMarketQuestion(decision);
          if (resolved) {
            for (const [, mv] of Object.entries(marketsMap || {})) {
              const maybe = mv as any;
              if ((maybe.question || '').toLowerCase() === String(resolved).toLowerCase()) {
                return maybe.image || maybe.imageUrl || maybe.image_Url || maybe.thumb || maybe.logo || null;
              }
            }
          }
          return null;
        };

        uniqueDecisionsArray.forEach((decision: any, index: number) => {
          const frontendAgentId = BACKEND_TO_FRONTEND_AGENT_ID[agentId] || agentId.toLowerCase();
          const agentMeta =
            data.agents?.find((a: any) => a?.id && String(a.id).toLowerCase() === frontendAgentId) ||
            DEFAULT_AGENT_OPTIONS.find(agent => agent.id === frontendAgentId);

          const action = decision.action || decision.type || 'TRADE';

          // Build reasoning text: prefer fullReasoning array, fall back to reasoning string
          const reasoningArray: string[] = Array.isArray(decision.fullReasoning)
            ? decision.fullReasoning
            : Array.isArray(decision.reasoning)
              ? decision.reasoning
              : (decision.reasoning ? [String(decision.reasoning)] : []);

          let reasoningText = '';
          if (reasoningArray.length > 0) {
            const bullets = reasoningArray.slice(0, 3).map(String).filter(Boolean);
            reasoningText = bullets.join(' ').substring(0, 150);
            if (reasoningText.length === 150) reasoningText += '...';
          } else if (decision.reasoning && typeof decision.reasoning === 'string') {
            reasoningText = decision.reasoning.substring(0, 150);
            if (reasoningText.length === 150) reasoningText += '...';
          } else {
            reasoningText = action === 'RESEARCH' ? 'Web research and market analysis' : 'Analysis based on market data';
          }

          const parseDecisionTimestamp = (d: any) => {
            if (!d) return new Date();
            // Prefer canonical createdAt variants if present (ISO string or ms)
            if (d.createdAt) {
              const parsed = Date.parse(d.createdAt);
              if (!isNaN(parsed)) return new Date(parsed);
            }
            if (typeof d.createdAtMs === 'number') return new Date(d.createdAtMs);
            if (typeof d.created_at_ms === 'number') return new Date(d.created_at_ms);
            if (d.created_at) {
              const parsed2 = Date.parse(d.created_at);
              if (!isNaN(parsed2)) return new Date(parsed2);
            }
            // fallbacks
            if (d.openedAt) return new Date(d.openedAt);
            if (d.timestamp) return new Date(d.timestamp);
            return new Date();
          };

          const decisionTimestamp = parseDecisionTimestamp(decision);

          // Extract position status and PnL for display
          const rawPos = decision.position_status ?? decision.positionStatus ?? decision.raw?.position_status ?? decision.raw?.positionStatus ?? decision.status ?? decision.state ?? undefined;
          const positionStatus = rawPos !== undefined && rawPos !== null ? String(rawPos).toUpperCase() : undefined;

          let pnlVal: number | undefined = undefined;
          if (typeof decision.agent_balance_after === 'number' && typeof decision.agent_balance_before === 'number') {
            pnlVal = Number(decision.agent_balance_after) - Number(decision.agent_balance_before);
          } else if (typeof decision.pnl === 'number') {
            pnlVal = decision.pnl;
          } else if (typeof decision.profit === 'number') {
            pnlVal = decision.profit;
          } else if (typeof decision.realized_pnl === 'number') {
            pnlVal = decision.realized_pnl;
          }
          const rawDecision = decision.decision || decision.side || '';
          let decisionValue: string = String(rawDecision || '').toUpperCase();

          // Normalize confidence: backend may send 0-1 floats or 0-100 ints or strings
          const parseConfidence = (c: any) => {
            const num = typeof c === 'number' ? c : (c ? Number(c) : 0);
            if (isNaN(num)) return 0;
            if (num <= 1) return Math.round(num * 100);
            return Math.round(num);
          };

          const resolvedImg = resolveImageUrl(decision) || undefined;
          // Normalize bet/investment fields from many possible aliases
          const rawBet = decision.investmentUsd ?? decision.investment ?? decision.bet_amount ?? decision.betAmount ?? decision.bet ?? decision.amount ?? decision.invested ?? decision.volume ?? undefined;
          const normalizedInvestment = (rawBet !== undefined && rawBet !== null) ? (typeof rawBet === 'number' ? rawBet : (isFinite(Number(rawBet)) ? Number(rawBet) : undefined)) : undefined;
          const normalizedBetAmount = decision.bet_amount ?? decision.betAmount ?? decision.bet ?? decision.amount ?? decision.investment ?? undefined;
          // Normalize expected payout fields (authoritative and display-friendly)
          const rawExpectedDisplay = decision.expected_payout_display ?? decision.expectedPayoutDisplay ?? decision.expectedPayoutDisplay ?? decision.expected_payout ?? decision.expectedPayout ?? null;
          const expectedPayoutDisplay = rawExpectedDisplay !== null && rawExpectedDisplay !== undefined && !isNaN(Number(rawExpectedDisplay)) ? Number(rawExpectedDisplay) : undefined;
          const rawExpectedAuth = decision.expected_payout ?? decision.expectedPayout ?? null;
          const expectedPayoutAuth = rawExpectedAuth !== null && rawExpectedAuth !== undefined && !isNaN(Number(rawExpectedAuth)) ? Number(rawExpectedAuth) : undefined;

          // Determine market resolution from marketsMap or decision/raw fields
          const extractMarketResolution = (dec: any) => {
            // 1) Try marketsMap by marketId
            try {
              const mid = dec.marketId || dec.predictionId || dec.market || null;
              if (mid && marketsMap && marketsMap[mid]) {
                const m = marketsMap[mid] as any;
                const candidates = [m.resolution, m.resolution_result, m.resolved_result, m.result, m.outcome, m.winner, m.resolved_outcome, m.resolution_value, m.winner_name];
                for (const c of candidates) if (c !== undefined && c !== null) return String(c);
                if (m.resolved === true) return 'YES';
                if (m.resolved === false) return 'NO';
              }
            } catch (e) { /* ignore */ }
            // 2) fallback to decision raw fields
            const fallbacks = [dec.resolved_result, dec.resolution, dec.resolved_outcome, dec.outcome, dec.result, dec.winner, dec.resolved];
            for (const f of fallbacks) if (f !== undefined && f !== null) return String(f);
            return undefined;
          };

          const marketResolution = extractMarketResolution(decision);

          newDecisions.push({
            id: decision.id || `${agentId}-${decision.marketId}-${index}`,
            agentId: frontendAgentId,
            agentName: agentMeta?.name || agentSummary.agentName || agentId,
            agentEmoji: agentMeta?.emoji || '🤖',
            timestamp: decisionTimestamp,
            action: action,
            // Prefer to display the market question from the canonical markets path when available
            market: resolveMarketQuestion(decision) || 'Unknown Market',
            marketId: decision.marketId || decision.predictionId || decision.marketId,
            imageUrl: resolvedImg,
            decision: String(decisionValue).toUpperCase(),
            confidence: parseConfidence(decision.confidence),
            reasoning: reasoningText,
            fullReasoning: reasoningArray,
            // Always include normalized investment / bet fields so downstream consumers (MarketDetailsPanel) see them
            investmentUsd: normalizedInvestment ?? (action === 'TRADE' ? 0 : undefined),
            bet_amount: normalizedBetAmount,
            expected_payout_display: expectedPayoutDisplay,
            expected_payout: expectedPayoutAuth,
            raw: decision,
            positionStatus,
            pnl: pnlVal,
            marketResolution: marketResolution,
            webResearchSummary: Array.isArray(decision.webResearchSummary) ? decision.webResearchSummary : [],
            decisionHistory: [],
          });
          // Debug: log resolved image URL for this decision (helps verify image field name and marketsMap)
          try {
            if (resolvedImg) console.debug('[AISummaryPanel] Resolved imageUrl for decision', { id: decision.id, marketId: decision.marketId, imageUrl: resolvedImg });
          } catch (e) { }
        });
      }
    }

    // Sort by timestamp
    newDecisions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Track new decisions
    const previousMap = new Map(decisionsRef.current.map(decision => [decision.id, decision]));
    const freshIds = new Set<string>();
    const freshOrder = new Map<string, number>();
    newDecisions.forEach(decision => {
      const existing = previousMap.get(decision.id);
      if (!existing || existing.timestamp.getTime() !== decision.timestamp.getTime() || existing.reasoning !== decision.reasoning) {
        freshOrder.set(decision.id, freshOrder.size);
        freshIds.add(decision.id);
      }
    });
    newDecisionIdsRef.current = freshIds;
    newDecisionOrderRef.current = freshOrder;

    // Merge new decisions
    setDecisions(prev => {
      if (!isMounted) return prev;
      if (newDecisions.length === 0) return prev;

      const merged = [...newDecisions];
      const seenIds = new Set(newDecisions.map(d => d.id));
      const remaining = prev.filter(d => !seenIds.has(d.id));
      merged.push(...remaining);
      merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      return merged.slice(0, MAX_DECISIONS);
    });

    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  };

  // Subscribe to RTDB agent predictions (replaces server WebSocket/REST)
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    // subscribe to markets so we can map marketId -> human-friendly question
    const unsubMarkets = listenToMarkets((m) => {
      try {
        console.debug('[AISummaryPanel] listenToMarkets received keys:', Object.keys(m || {}).slice(0, 6));
      } catch (e) { }
      setMarketsMap(m || {});
    });

    const unsubscribe = listenToAgentPredictions((items) => {
      if (!isMounted) return;
      console.debug('[AISummaryPanel] RTDB listener items:', items?.length);
      // items are agent_prediction records; group by agentId
      const data: any = { agents: [], tradesByAgent: {}, researchByAgent: {}, summary: { agentSummaries: [] } };

      const agentsMap = new Map<string, any>();
      const tradesByAgent: Record<string, any[]> = {};

      for (const item of items) {
        const rawAgentId = (item.agentId || item.agent || 'unknown');
        // Use canonical frontend id mapping (maps backend ids like GROK_4 -> 'grok')
        const agentId = normalizeAgentId(rawAgentId);
        if (!agentsMap.has(agentId)) {
          const rawName = item.agentName || String(rawAgentId);
          const cleanedName = String(rawName).replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
          agentsMap.set(agentId, { id: agentId, name: cleanedName, emoji: item.agentEmoji || '🤖' });
        }
        tradesByAgent[agentId] = tradesByAgent[agentId] || [];
        tradesByAgent[agentId].push(item);
      }

      data.agents = Array.from(agentsMap.values());
      data.tradesByAgent = tradesByAgent;
      data.researchByAgent = {}; // not present in RTDB for now
      data.summary.agentSummaries = data.agents.map((a: any) => ({ agentId: a.id }));

      processSummaryData(data, isMounted);
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
      if (unsubMarkets) unsubMarkets();
    };
  }, []);

  // Debug: when decisions appear, log runtime agents for inspection (temporary)
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (decisions.length > 0 && agents && agents.length > 0) {
        // Log a compact map of id -> name so we can spot duplicates at runtime
        console.debug('[AISummaryPanel][DEBUG] runtime agents:', agents.map(a => ({ id: a.id, name: a.name })));
      }
    } catch (e) { /* ignore */ }
  }, [agents, decisions.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Subscribe to agent balances so we can show ExNET (gross balance) for the selected agent
  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      unsub = listenToAgentBalances((items: any[]) => {
        try {
          const map: Record<string, any> = {};
          (items || []).forEach((it: any) => {
            const backendId = String(it.agentId || it.agent_id || it.agent || '').toUpperCase();
            const frontendId = normalizeAgentId(backendId);
            // it.balance contains the stored AgentBalance object
            map[frontendId] = it.balance || it;
          });
          setAgentBalancesMap(map);
        } catch (e) {
          // ignore
        }
      });
    } catch (e) {
      // ignore
    }
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Apply agent filter first (if present)
  let baseDecisions = selectedAgentFilter
    ? decisions.filter(d => {
      const normalizeForCompare = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const selectedNorm = normalizeForCompare(selectedAgentFilter);
      const agentIdNorm = normalizeForCompare(d.agentId);
      if (agentIdNorm && agentIdNorm === selectedNorm) return true;
      const agentNameNorm = normalizeForCompare(d.agentName);
      if (agentNameNorm && agentNameNorm.includes(selectedNorm)) return true;
      // also check raw agentName with spaces (fallback)
      return String(d.agentName || '').toLowerCase().includes(String(selectedAgentFilter).toLowerCase());
    })
    : decisions.slice();

  // Apply top-level decision filter (yes/no/all)
  if (decisionFilter === 'yes' || decisionFilter === 'no') {
    const want = decisionFilter === 'yes' ? 'YES' : 'NO';
    baseDecisions = baseDecisions.filter(d => {
      // Normalize decision from multiple possible fields to avoid mismatches
      const fromTop = (d.decision || d.raw?.decision || d.raw?.side || (d.decisionHistory && d.decisionHistory[0]?.decision) || '').toString().toUpperCase();
      return fromTop === want;
    });
    try {
      // Debug: log how many decisions passed the filter (helps diagnose UX mismatch)
      console.debug('[AISummaryPanel] decisionFilter=', decisionFilter, 'initialCount=', decisions.length, 'afterAgentFilter=', baseDecisions.length);
    } catch (e) { }
  }

  // Apply global header search (title-only) when provided by parent
  const filteredDecisions = baseDecisions.filter(d => {
    if (!globalSearch || !String(globalSearch).trim()) return true;
    const q = String(globalSearch).trim().toLowerCase();
    const title = String(d.market || '').toLowerCase();
    return title.includes(q);
  });
  const selectedAgentMeta = selectedAgentFilter
    ? agents.find(agent => agent.id === selectedAgentFilter)
    : null;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="h-10 px-4 border-b border-border flex items-center justify-between bg-bg-elevated flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-[13px] text-terminal-accent font-mono leading-none flex items-center flex-shrink-0">
            &gt; SUMMARY
          </span>

          {/* ExNET: show expected networth for selected agent (hover shows explanation) */}
          {selectedAgentFilter && (
            <div className="ml-3 flex items-center gap-2">
              <div title="Expected networth if market resolves correctly" className="text-[10px] text-muted-foreground font-mono uppercase">ExNET</div>
              <div className="text-[13px] font-mono text-foreground" style={{ fontWeight: 700 }}>
                {(() => {
                  try {
                    const bal = agentBalancesMap[selectedAgentFilter];
                    if (!bal) return '$—';

                    const parseNum = (v: any) => {
                      if (v === undefined || v === null) return NaN;
                      if (typeof v === 'number') return v;
                      const n = Number(v);
                      return isNaN(n) ? NaN : n;
                    };

                    const currentBalance = parseNum(bal?.current_balance ?? bal?.currentBalance ?? bal?.balance?.current_balance ?? bal?.balance?.currentBalance ?? bal?.gross_balance ?? bal?.balance?.gross_balance ?? bal?.balance ?? bal?.starting_balance ?? 0);
                    const currentPnl = parseNum(bal?.current_pnl ?? bal?.currentPnl ?? bal?.currentPnlValue ?? bal?.pnl ?? bal?.profit ?? 0);

                    const balanceVal = isNaN(currentBalance) ? 0 : currentBalance;
                    const pnlVal = isNaN(currentPnl) ? 0 : currentPnl;

                    const sum = balanceVal + pnlVal;
                    if (sum == null || isNaN(Number(sum))) return '$—';
                    return `$${(Math.round(Number(sum) * 100) / 100).toFixed(2)}`;
                  } catch (e) { return '$—'; }
                })()}
              </div>
            </div>
          )}

          {/* Agent Filter Dropdown */}
          <div className="relative flex-shrink-0 agent-dropdown-container">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-bg-elevated hover:bg-muted/50 transition-colors text-[11px] font-mono text-foreground"
            >
              {selectedAgentMeta ? (
                <img
                  src={getAgentLogo(selectedAgentMeta.name)}
                  alt={selectedAgentMeta.name}
                  className="w-4 h-4 rounded-full object-contain"
                />
              ) : (
                <span className="text-[11px]">ALL</span>
              )}
              <span className="text-[10px] text-muted-foreground max-w-[80px] truncate">
                {selectedAgentMeta?.name || 'All Agents'}
              </span>
              {dropdownOpen ? (
                <ChevronUp className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              )}
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 min-w-[140px] max-h-[300px] overflow-y-auto">
                <button
                  onClick={() => {
                    setSelectedAgentFilter(null);
                    setDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-[11px] font-mono hover:bg-muted/50 transition-colors ${selectedAgentFilter === null ? 'bg-terminal-accent/10 text-terminal-accent' : 'text-foreground'
                    }`}
                >
                  <span className="text-[10px]">All Agents</span>
                </button>
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      setSelectedAgentFilter(agent.id);
                      setDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-[11px] font-mono hover:bg-muted/50 transition-colors flex items-center gap-2 ${selectedAgentFilter === agent.id ? 'bg-terminal-accent/10 text-terminal-accent' : 'text-foreground'
                      }`}
                  >
                    <img
                      src={getAgentLogo(agent.name)}
                      alt={agent.name}
                      className="w-4 h-4 rounded-full object-contain"
                    />
                    <span className="text-[10px]">{agent.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <motion.div
            className="w-2 h-2 rounded-full bg-trade-yes"
            animate={{
              opacity: [1, 0.5, 1],
            }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="text-[12px] text-muted-foreground font-mono">LIVE</span>
        </div>
      </div>

      {/* Activity Feed - ALWAYS show content, never disappear */}
      <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {/* Show loading ONLY on very first load when there are no decisions */}
        {loading && decisions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[13px] text-muted-foreground font-mono">Loading research...</div>
          </div>
        ) : decisions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-[13px] text-muted-foreground font-mono mb-2">No research yet</div>
              <div className="text-[11px] text-muted-foreground font-mono">Agents are analyzing markets...</div>
            </div>
          </div>
        ) : filteredDecisions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              {globalSearch && String(globalSearch).trim() ? (
                <>
                  <div className="text-[13px] text-muted-foreground font-mono mb-2">{`No agents have predicted on "${String(globalSearch).trim()}" market`}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">Try a different search or clear the query</div>
                </>
              ) : (
                <>
                  <div className="text-[13px] text-muted-foreground font-mono mb-2">No research for selected agent</div>
                  <div className="text-[11px] text-muted-foreground font-mono">Try selecting a different agent or "All Agents"</div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {/* CRITICAL: Use AnimatePresence with popLayout so entries push the rest down smoothly */}
            {/* initial={false} prevents the whole list from replaying entrance animations on mount */}
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredDecisions.map((decision, index) => {
                const isExpanded = expandedId === decision.id;
                const hasHistory = decision.decisionHistory && decision.decisionHistory.length > 0;

                // Track only decisions that truly just arrived for entrance animation
                const isNewDecision = newDecisionIdsRef.current.has(decision.id);
                const orderPosition = newDecisionOrderRef.current.get(decision.id) ?? 0;
                const animationDelay = isNewDecision ? Math.min(orderPosition * 0.35, 1.4) : 0;

                return (
                  <motion.div
                    key={decision.id}
                    variants={cardVariants}
                    initial={isNewDecision ? "hidden" : "visible"}
                    animate="visible"
                    exit="hidden"
                    transition={{
                      duration: isNewDecision ? 0.3 : 0.2,
                      delay: animationDelay,
                      ease: "easeOut",
                    }}
                    className="bg-bg-elevated border border-border rounded-xl overflow-hidden hover:border-terminal-accent/50 transition-colors will-change-transform"
                  >
                    {/* Clickable Header - Always expandable to show decision details */}
                    <div
                      onClick={(e) => {
                        // Always allow expansion to show decision details
                        toggleExpand(decision.id);
                      }}
                      className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      {/* Agent Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={getAgentLogo(decision.agentName)}
                            alt={decision.agentName}
                            className="w-5 h-5 object-contain flex-shrink-0 rounded-full"
                            style={{ borderRadius: '50%' }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "/placeholder.svg";
                            }}
                          />
                          <span className="text-[13px] font-mono text-foreground" style={{ fontWeight: 600 }}>
                            {decision.agentName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {!decision.marketResolution && decision.positionStatus && (
                            <div className={`px-2 py-0.5 rounded-lg text-[11px] font-mono uppercase ${decision.positionStatus === 'CLOSED'
                              ? 'bg-trade-no/20 text-trade-no border border-trade-no/30'
                              : 'bg-trade-yes/20 text-trade-yes border border-trade-yes/30'
                              }`}>
                              {decision.positionStatus === 'CLOSED' ? 'CLOSED' : 'OPEN'}
                            </div>
                          )}

                          {/* When closed, show an explicit labeled payout next to the status badge */}
                          {decision.positionStatus === 'CLOSED' && (decision.expected_payout ?? decision.expected_payout_display) !== undefined && (decision.expected_payout ?? decision.expected_payout_display) !== null && (
                            <div className="ml-2 flex items-baseline gap-2">
                              <div className="text-[10px] text-muted-foreground font-mono uppercase" style={{ fontWeight: 700 }}>Payout</div>
                              <div className={`text-[12px] font-mono text-trade-yes`} style={{ fontWeight: 600 }}>
                                ${Number(decision.expected_payout ?? decision.expected_payout_display).toFixed(2)}
                              </div>
                            </div>
                          )}

                          {/* Only show PnL on header when CLOSED and no expected payout is available */}
                          {(decision.positionStatus === 'CLOSED' && (decision.expected_payout === undefined || decision.expected_payout === null) && typeof decision.pnl === 'number') ? (
                            <div className={`text-[12px] font-mono ${decision.pnl >= 0 ? 'text-trade-yes' : 'text-trade-no'}`} style={{ fontWeight: 600 }}>
                              {decision.pnl >= 0 ? '+' : '-'}${Math.abs(Math.round((decision.pnl ?? 0) * 100) / 100).toFixed(2)}
                            </div>
                          ) : null}

                          {decision.marketResolution && (
                            <div className={`px-2 py-0.5 rounded-lg text-[11px] font-mono uppercase bg-muted/10 text-muted-foreground border border-border/20`}>
                              {`Closed on ${String(decision.marketResolution)}`}
                            </div>
                          )}

                          <span className="text-[11px] text-muted-foreground font-mono">
                            {formatTimeAgo(decision.timestamp)}
                          </span>
                          {hasHistory && (
                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronDown className="w-3 h-3 text-muted-foreground" />
                            </motion.div>
                          )}
                        </div>
                      </div>

                      {/* Action Badge */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`px-2 py-0.5 rounded-lg text-[11px] font-mono uppercase ${decision.action === "TRADE"
                          ? "bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/30"
                          : "bg-muted text-muted-foreground border border-border"
                          }`}>
                          {decision.action}
                        </div>
                        {decision.action === "TRADE" && (() => {
                          const dec = (decision.decision || '').toString().toUpperCase();
                          const isYes = dec === 'YES';
                          const isNo = dec === 'NO';
                          const isUp = dec === 'UP';
                          const isDown = dec === 'DOWN';

                          let badgeClass = 'bg-trade-other/20 text-trade-other border border-trade-other/30';
                          if (isYes) badgeClass = 'bg-trade-yes/20 text-trade-yes border border-trade-yes/30';
                          else if (isNo) badgeClass = 'bg-trade-no/20 text-trade-no border border-trade-no/30';
                          else if (isUp) badgeClass = 'bg-trade-up/20 text-trade-up border border-trade-up/30';
                          else if (isDown) badgeClass = 'bg-trade-down/20 text-trade-down border border-trade-down/30';

                          const Icon = isYes || isUp ? TrendingUp : (isNo || isDown ? TrendingDown : Globe);

                          return (
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold ${badgeClass}`}>
                              <Icon className="w-2.5 h-2.5" />
                              {decision.decision}
                              {(decision.positionStatus !== 'OPEN') && (decision.bet_amount || decision.investmentUsd) && (
                                <span className="ml-2 text-[11px] font-mono text-muted-foreground" style={{ fontWeight: 600 }}>
                                  ${Number(decision.bet_amount ?? decision.investmentUsd).toFixed(0)}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Market - Clickable to open market details */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (decision.marketId) {
                            try {
                              if (onTradeClick) onTradeClick(decision.marketId);
                            } catch (err) { /* ignore */ }
                            try {
                              if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('mira-open-market', { detail: { prediction: decision, predictionId: decision.marketId, marketId: decision.marketId } }));
                              }
                            } catch (err) { /* ignore */ }
                          }
                        }}
                        className={`text-[13px] font-mono mb-2 ${decision.marketId && onTradeClick ? 'text-terminal-accent cursor-pointer hover:underline' : 'text-foreground'}`}
                        style={{ fontWeight: 500, pointerEvents: decision.marketId && onTradeClick ? 'auto' : 'none' }}
                      >
                        {decision.market}
                        {decision.marketId && onTradeClick && (
                          <span className="ml-2 text-[10px] text-muted-foreground">(click to view)</span>
                        )}
                      </div>

                      {/* Confidence & Reasoning */}
                      {decision.action === "TRADE" && (
                        <div className="mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-muted-foreground font-mono">CONFIDENCE</span>
                            <span className="text-[12px] font-mono text-terminal-accent" style={{ fontWeight: 600 }}>
                              {decision.confidence}%
                            </span>
                          </div>
                          <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-terminal-accent"
                              initial={{ width: 0 }}
                              animate={{ width: `${decision.confidence}%` }}
                              transition={{ duration: 0.5, delay: index * 0.1 }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Reasoning (truncated) - Typewriter effect */}
                      <div className="text-[12px] text-text-secondary leading-relaxed" style={{ fontWeight: 400 }}>
                        <TypewriterText
                          text={decision.reasoning}
                          speed={25}
                          className="inline"
                        />
                      </div>
                      {decision.webResearchSummary && decision.webResearchSummary.length > 0 && (
                        <div className="mt-2 p-2 bg-terminal-accent/5 border border-terminal-accent/30 rounded-lg">
                          <div className="flex items-center gap-1 text-terminal-accent text-[10px] font-mono uppercase tracking-[0.1em] mb-1">
                            <Globe className="w-3 h-3" />
                            Web Signals
                          </div>
                          <div className="text-[11px] text-foreground leading-relaxed">
                            <span className="font-semibold">{decision.webResearchSummary[0].source}:</span>{" "}
                            {decision.webResearchSummary[0].snippet || decision.webResearchSummary[0].title}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Expanded Decision Details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden border-t border-border"
                        >
                          <div className="px-3 pb-3 pt-3 space-y-3">
                            {/* Decision - Whether to take the trade */}
                            <div>
                              <div className="text-[11px] text-muted-foreground font-mono uppercase mb-2" style={{ fontWeight: 600 }}>
                                Decision
                              </div>
                              <div className="bg-bg-elevated border border-terminal-accent/30 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  {(() => {
                                    const dec = (decision.decision || '').toString().toUpperCase();
                                    const isYes = dec === 'YES';
                                    const isNo = dec === 'NO';
                                    const isUp = dec === 'UP';
                                    const isDown = dec === 'DOWN';

                                    let badgeClass = 'bg-trade-other/20 text-trade-other border border-trade-other/30';
                                    if (isYes) badgeClass = 'bg-trade-yes/20 text-trade-yes border border-trade-yes/30';
                                    if (isNo) badgeClass = 'bg-trade-no/20 text-trade-no border border-trade-no/30';
                                    if (isUp) badgeClass = 'bg-trade-up/20 text-trade-up border border-trade-up/30';
                                    if (isDown) badgeClass = 'bg-trade-down/20 text-trade-down border border-trade-down/30';

                                    const Icon = isYes || isUp ? TrendingUp : TrendingDown;

                                    return (
                                      <div className={`px-2 py-1 rounded-lg text-[12px] font-mono font-bold ${badgeClass}`}>
                                        <Icon className="w-3 h-3 inline mr-1" />
                                        {decision.decision} @ {decision.confidence}% confidence
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div className="text-[12px] text-text-secondary leading-relaxed">
                                  {decision.fullReasoning && decision.fullReasoning.length > 0 ? (
                                    <div className="space-y-1.5">
                                      {decision.fullReasoning.map((reason, idx) => (
                                        <div key={idx} className="pl-2 border-l-2 border-terminal-accent/30">
                                          {reason}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-muted-foreground italic">
                                      {decision.reasoning || 'Analysis based on market data'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {decision.webResearchSummary && decision.webResearchSummary.length > 0 && (
                              <div>
                                <div className="text-[11px] text-muted-foreground font-mono uppercase mb-2" style={{ fontWeight: 600 }}>
                                  Web Research Highlights
                                </div>
                                <div className="space-y-1.5">
                                  {decision.webResearchSummary.map((source, idx) => (
                                    <div key={`${decision.id}-expanded-web-${idx}`} className="bg-bg-elevated border border-terminal-accent/20 rounded-lg p-2">
                                      <div className="flex items-center justify-between gap-2 text-[12px] font-semibold text-foreground">
                                        <span>{source.source}</span>
                                        {source.url && (
                                          <a
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] font-mono uppercase text-terminal-accent hover:underline"
                                          >
                                            View
                                          </a>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                        {source.snippet || source.title}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Investment Amount */}
                            {decision.investmentUsd !== undefined && decision.investmentUsd > 0 && (
                              <div className="flex items-center justify-between py-2 border-t border-border/50">
                                <span className="text-[11px] text-muted-foreground font-mono uppercase">Investment</span>
                                <span className="text-[13px] font-mono text-foreground" style={{ fontWeight: 600 }}>
                                  ${decision.investmentUsd.toFixed(0)}
                                </span>
                              </div>
                            )}

                            {/* Market Details Link */}
                            {decision.marketId && onTradeClick && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  console.log('[AISummaryPanel] View Market Details clicked:', decision.marketId);
                                  try { if (onTradeClick) onTradeClick(decision.marketId); } catch (err) { }
                                  try {
                                    if (typeof window !== 'undefined') {
                                      window.dispatchEvent(new CustomEvent('mira-open-market', { detail: { prediction: decision, predictionId: decision.marketId, marketId: decision.marketId } }));
                                    }
                                  } catch (err) { }
                                }}
                                className="w-full px-3 py-2 bg-terminal-accent/10 hover:bg-terminal-accent/20 text-terminal-accent rounded-lg transition-colors text-[11px] font-mono border border-terminal-accent/30 cursor-pointer"
                                style={{ pointerEvents: 'auto' }}
                              >
                                View Market →
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="h-12 border-t border-border bg-bg-elevated flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-terminal-accent" />
            <span className="text-[11px] text-muted-foreground font-mono">
              {decisions.filter(d => d.action === "TRADE").length} ACTIVE
            </span>
          </div>
          <div className="w-px h-4 bg-border" />
          <span className="text-[11px] text-muted-foreground font-mono">
            {decisions.length} TOTAL
          </span>
        </div>
      </div>
    </div>
  );
};
