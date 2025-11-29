import { ActivePositions } from "@/components/ActivePositions";
import { AgentTradesPanel } from "@/components/AgentTradesPanel";
import { AISummaryPanel } from "@/components/AISummaryPanel";
import { MarketDetailsPanel } from "@/components/MarketDetailsPanel";
import { NewsFeed } from "@/components/NewsFeed";
import { PerformanceChart } from "@/components/PerformanceChart";
import PredictionBubbleCanvas from "@/components/PredictionBubbleCanvas";
import { PredictionNodeData } from "@/components/PredictionTypes";
import { SystemStatusBar } from "@/components/SystemStatusBar";
import { Input } from '@/components/ui/input';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Waitlist } from "@/components/Waitlist";
import { Watchlist } from "@/components/Watchlist";
import { listenToAgentPredictions, listenToMarkets, listenToPredictions } from '@/lib/firebase/listeners';
import { getCustodialWallet, getOrCreateWallet, storeCustodialWallet } from "@/lib/wallet";
import { getWatchlist, removeFromWatchlist } from "@/lib/watchlist";
import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from "react";
// All market fetching is now done server-side via /api/predictions

interface Agent {
  id: string;
  name: string;
  emoji: string;
  isActive: boolean;
  pnl: number;
  openMarkets: number;
  lastTrade: string;
}

// Initial agent data - will be replaced by API call
const initialAgents: Agent[] = [
  { id: "grok", name: "GROK 4", emoji: "🔥", isActive: false, pnl: 0, openMarkets: 0, lastTrade: "Loading..." },
  { id: "gpt5", name: "GPT-5", emoji: "✨", isActive: false, pnl: 0, openMarkets: 0, lastTrade: "Loading..." },
  { id: "deepseek", name: "DEEPSEEK V3", emoji: "🔮", isActive: false, pnl: 0, openMarkets: 0, lastTrade: "Loading..." },
  { id: "gemini", name: "GEMINI 2.5", emoji: "♊", isActive: false, pnl: 0, openMarkets: 0, lastTrade: "Loading..." },
  { id: "claude", name: "CLAUDE 4.5", emoji: "🧠", isActive: false, pnl: 0, openMarkets: 0, lastTrade: "Loading..." },
  { id: "qwen", name: "QWEN 2.5", emoji: "🤖", isActive: false, pnl: 0, openMarkets: 0, lastTrade: "Loading..." },
];

// Agent trading system - uses API to fetch real trades
interface Trade {
  id: string;
  timestamp: Date;
  market: string;
  marketSlug?: string;
  conditionId?: string;
  decision: "YES" | "NO";
  confidence: number;
  reasoning: string;
  reasoningBullets?: string[];
  summaryDecision?: string;
  entryProbability?: number;
  currentProbability?: number;
  webResearchSummary?: Array<{
    title: string;
    snippet: string;
    url: string;
    source: string;
  }>;
  pnl?: number;
  investmentUsd?: number;
  status: "OPEN" | "CLOSED" | "PENDING";
  predictionId: string; // Always link to actual prediction ID
}

interface NewsArticle {
  title: string;
  description?: string;
  content?: string;
  publishedAt: string;
  url: string;
  sourceApi?: string;
}

// Fetch trades from API instead of generating locally
const fetchAgentTrades = async (agentId: string): Promise<Trade[]> => {
  try {
    const { API_BASE_URL } = await import('@/lib/apiConfig');
    const url = `${API_BASE_URL}/api/agents/${agentId}/trades`;
    console.log(`[fetchAgentTrades] Fetching trades for ${agentId} from ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[fetchAgentTrades] Failed to fetch trades for ${agentId}:`, response.status, response.statusText, errorText);
      return [];
    }

    const data = await response.json();
    console.log(`[fetchAgentTrades] Received data for ${agentId}:`, {
      hasTrades: !!data.trades,
      tradesCount: data.trades?.length || 0,
      dataKeys: Object.keys(data)
    });

    if (!data.trades || !Array.isArray(data.trades)) {
      console.warn(`[fetchAgentTrades] Invalid trades data for ${agentId}:`, data);
      return [];
    }

    const mappedTrades = (data.trades || []).map((trade: any) => ({
      id: trade.id,
      timestamp: new Date(trade.timestamp || trade.openedAt),
      market: trade.marketQuestion || trade.market || trade.marketId, // Use marketQuestion if available
      marketSlug: trade.marketSlug,
      conditionId: trade.conditionId,
      decision: trade.decision || trade.side,
      confidence: typeof trade.confidence === 'number' ? trade.confidence : parseInt(trade.confidence) || 0,
      reasoning: typeof trade.reasoning === 'string' ? trade.reasoning : (Array.isArray(trade.reasoning) ? trade.reasoning.join(' ') : ''),
      reasoningBullets: Array.isArray(trade.reasoningBullets)
        ? trade.reasoningBullets
        : typeof trade.reasoning === 'string'
          ? trade.reasoning.split(/(?<=\.)\s+/).filter(Boolean).slice(0, 4)
          : [],
      summaryDecision: trade.summaryDecision || trade.summary || '',
      entryProbability: typeof trade.entryProbability === 'number' ? trade.entryProbability : undefined,
      currentProbability: typeof trade.currentProbability === 'number' ? trade.currentProbability : undefined,
      webResearchSummary: Array.isArray(trade.webResearchSummary)
        ? trade.webResearchSummary
        : [],
      pnl: trade.pnl,
      investmentUsd: trade.investmentUsd || 0, // Amount invested
      status: trade.status || 'OPEN',
      predictionId: trade.predictionId || trade.marketId,
    }));

    console.log(`[fetchAgentTrades] Mapped ${mappedTrades.length} trades for ${agentId}`);
    return mappedTrades;
  } catch (error) {
    console.error(`[fetchAgentTrades] Error fetching trades for ${agentId}:`, error);
    return [];
  }
};

// Legacy function - DEPRECATED: All trades now come from API via fetchAgentTrades
// This function is kept for type compatibility but always returns empty array
const generateAgentTrades = (
  agentId: string,
  predictions: PredictionNodeData[],
  newsArticles: NewsArticle[] = []
): Trade[] => {
  // All trades should come from API - this is just for type compatibility
  return [];
};

// Cache for agent trades from API
const agentTradesCache = new Map<string, { trades: Trade[]; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Get trades for a specific agent (fetches from API with caching)
const getAgentTrades = async (agentId: string): Promise<Trade[]> => {
  const cacheKey = agentId;
  const now = Date.now();
  const cached = agentTradesCache.get(cacheKey);

  // Check if cache is valid
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    return cached.trades; // Return cached trades
  }

  // Fetch new trades from API
  const trades = await fetchAgentTrades(agentId);

  // Cache the trades
  agentTradesCache.set(cacheKey, {
    trades,
    timestamp: now,
  });

  return trades;
};

// Mock predictions removed - all data comes from server

const Index = () => {
  // Check if coming from landing page to trigger animations
  const [isAnimatingIn, setIsAnimatingIn] = useState(() => {
    // Check immediately on mount to avoid flash
    if (typeof window !== 'undefined') {
      const fromLanding = sessionStorage.getItem('fromLanding');
      return fromLanding === 'true';
    }
    return false;
  });

  useEffect(() => {
    const fromLanding = sessionStorage.getItem('fromLanding');
    if (fromLanding === 'true') {
      sessionStorage.removeItem('fromLanding');
      // Disable animations for better performance - just show immediately
      setIsAnimatingIn(false);
    }
  }, []);

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [agents, setAgents] = useState(initialAgents);
  const [agentTrades, setAgentTrades] = useState<Record<string, Trade[]>>({});
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  // Track if performance panel was auto-opened from a bubble click (when both panels were closed)
  const performancePanelAutoOpenedRef = useRef(false);
  const [marketModalOpen, setMarketModalOpen] = useState(false);
  const [selectedPrediction, setSelectedPrediction] = useState<PredictionNodeData | null>(null);
  // Removed zoom/pan - bubbles now fill full screen and can only be dragged individually
  const [selectedCategory, setSelectedCategory] = useState<string>("All Markets");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("");
  const [bubbleViewMode, setBubbleViewMode] = useState<'predictions' | 'markets'>('predictions');
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [predictions, setPredictions] = useState<PredictionNodeData[]>(() => {
    // Load from cache immediately for instant display
    try {
      const cached = sessionStorage.getItem('app_predictions_cache');
      const cacheTime = sessionStorage.getItem('app_predictions_cache_time');
      const cacheCategory = sessionStorage.getItem('app_predictions_cache_category');
      if (cached && cacheTime && cacheCategory === "All Markets") {
        const age = Date.now() - parseInt(cacheTime);
        // Use cache if less than 2 minutes old
        if (age < 120000) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch (e) {
      // Ignore cache errors
    }
    return [];
  });
  const [loadingMarkets, setLoadingMarkets] = useState(() => {
    // Only show loading if we don't have cached data
    try {
      const cached = sessionStorage.getItem('app_predictions_cache');
      const cacheTime = sessionStorage.getItem('app_predictions_cache_time');
      const cacheCategory = sessionStorage.getItem('app_predictions_cache_category');
      if (cached && cacheTime && cacheCategory === "All Markets") {
        const age = Date.now() - parseInt(cacheTime);
        if (age < 120000) {
          return false; // We have valid cache, don't show loading
        }
      }
    } catch (e) {
      // Ignore
    }
    return true;
  });
  const [bubbleLimit, setBubbleLimit] = useState<number>(100);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [summaryDecisions, setSummaryDecisions] = useState<any[]>([]);

  // Debounce search query to prevent glitching during typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200); // 200ms delay after user stops typing - faster response

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter state
  const DEFAULT_FILTERS = {
    minVolume: '',
    maxVolume: '',
    minLiquidity: '',
    maxLiquidity: '',
    minPrice: '',
    maxPrice: '',
    minProbability: '',
    maxProbability: '',
    sortBy: 'volume' as 'volume' | 'liquidity' | 'price' | 'probability' | 'none',
    sortOrder: 'desc' as 'asc' | 'desc',
  } as const;

  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS }));
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showAgentTrades, setShowAgentTrades] = useState(false);
  const [watchlist, setWatchlist] = useState<PredictionNodeData[]>([]);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [custodialWallet, setCustodialWallet] = useState<{ publicKey: string; privateKey: string } | null>(null);
  // Panel visibility state - both open by default
  const [isPerformanceOpen, setIsPerformanceOpen] = useState(true);
  const [isSummaryOpen, setIsSummaryOpen] = useState(true);
  // Track if we're transitioning for animations
  const [isTransitioning, setIsTransitioning] = useState(false);
  // isResizing no longer needed - panels are overlays, dashboard never resizes
  // News feed toggle state
  const [showNewsFeed, setShowNewsFeed] = useState(false);
  // Store saved panel sizes to restore when reopened
  // Load from localStorage on mount, default to 30/40/30 (dashboard gets most space)
  // Initialize all panel sizes together to ensure they add up to 100%
  const getInitialPanelSizes = () => {
    const savedLeft = localStorage.getItem('savedLeftPanelSize');
    const savedRight = localStorage.getItem('savedRightPanelSize');
    let left = savedLeft ? parseFloat(savedLeft) : 30;
    let right = savedRight ? parseFloat(savedRight) : 30;

    // Validate: if saved values don't make sense, reset to defaults (30/40/30)
    const middle = 100 - left - right;
    if (left < 15 || left > 50 || right < 15 || right > 50 || middle < 30 || middle > 70) {
      // Reset to default: 30/40/30 (dashboard gets most space)
      left = 30;
      right = 30;
      localStorage.setItem('savedLeftPanelSize', '30');
      localStorage.setItem('savedRightPanelSize', '30');
    }

    return { left, right, middle: 100 - left - right };
  };

  const initialSizes = getInitialPanelSizes();
  const [savedLeftPanelSize, setSavedLeftPanelSize] = useState(initialSizes.left);
  const [savedRightPanelSize, setSavedRightPanelSize] = useState(initialSizes.right);
  // Current panel sizes - initialize from saved values
  const [leftPanelSize, setLeftPanelSize] = useState(initialSizes.left);
  const [rightPanelSize, setRightPanelSize] = useState(initialSizes.right);
  // Middle panel size - no longer needed (dashboard is always 100%)

  // Clear any conflicting localStorage from autoSaveId on mount
  useEffect(() => {
    // Clear the autoSaveId localStorage that might have bad values
    localStorage.removeItem('react-resizable-panels:panel-layout');
  }, []);

  // Persist saved panel sizes to localStorage
  useEffect(() => {
    localStorage.setItem('savedLeftPanelSize', savedLeftPanelSize.toString());
  }, [savedLeftPanelSize]);

  useEffect(() => {
    localStorage.setItem('savedRightPanelSize', savedRightPanelSize.toString());
  }, [savedRightPanelSize]);

  // Fetch news articles for agent trading decisions
  useEffect(() => {
    const loadNews = async () => {
      try {
        const { API_BASE_URL } = await import('@/lib/apiConfig');
        const response = await fetch(`${API_BASE_URL}/api/news?source=all`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'ok' && data.articles) {
            const articles: NewsArticle[] = data.articles.map((article: any) => ({
              title: article.title || '',
              description: article.description || undefined,
              content: article.content || undefined,
              publishedAt: article.publishedAt || new Date().toISOString(),
              url: article.url || '',
              sourceApi: article.sourceApi || undefined,
            }));
            setNewsArticles(articles);
          }
        }
      } catch (error) {
        console.debug('Failed to fetch news for trading:', error);
      }
    };

    loadNews();
    // Refresh news every 5 minutes for trading decisions
    const newsInterval = setInterval(loadNews, 5 * 60 * 1000);
    return () => clearInterval(newsInterval);
  }, []);

  // Subscribe to Firebase RTDB predictions (use predictions feed rather than markets)
  useEffect(() => {
    setLoadingMarkets(true);
    let isMounted = true;
    const predictedMarketIdsRef = { current: new Set<string>() } as { current: Set<string> };
    const updatePredictedIds = (ids: Set<string>) => {
      predictedMarketIdsRef.current = ids;
    };

    const unsubscribe = listenToPredictions((items) => {
      if (!isMounted) return;
      try {
        const preds: PredictionNodeData[] = (items || []).map((val: any) => {
          const id = val?.id ?? val?.predictionId ?? val?._id ?? '';
          const imageUrl = val?.image || val?.imageUrl || val?.image_url || val?.thumb || undefined;
          const probRaw = typeof val?.probability === 'number' ? val.probability : (typeof val?.price === 'number' ? val.price : val?.probability);
          const prob = isFinite(Number(probRaw)) ? Math.round(Number(probRaw)) : 0;
          return {
            id: id,
            question: val?.question || val?.title || val?.market_question || '',
            probability: prob,
            position: prob >= 50 ? 'YES' : 'NO',
            price: prob,
            change: typeof val?.change === 'number' ? val.change : 0,
            agentName: val?.agentName || val?.agent || '',
            agentEmoji: val?.agentEmoji || val?.agent_emoji || '',
            reasoning: val?.reasoning || val?.description || '',
            category: val?.category || val?.tags || undefined,
            marketSlug: val?.marketSlug || val?.slug || undefined,
            conditionId: val?.conditionId || undefined,
            imageUrl: imageUrl,
            createdAt: val?.createdAt || val?.created_at || val?.created || undefined,
            endDate: val?.endDate || val?.end_date || val?.ends_at || undefined,
            startDate: val?.startDate || val?.start_date || val?.starts_at || undefined,
            volume: val?.volume || val?.investmentUsd || 0,
            liquidity: val?.liquidity || 0,
            predicted: predictedMarketIdsRef.current.has(id),
          } as PredictionNodeData;
        });

        let filtered = preds;
        if (predictedMarketIdsRef.current && predictedMarketIdsRef.current.size > 0) {
          filtered = preds.filter(p => predictedMarketIdsRef.current.has(p.id));
        }
        filtered.sort((a, b) => (b.volume ? Number(b.volume) : 0) - (a.volume ? Number(a.volume) : 0));
        setPredictions(filtered);
      } catch (e) {
        console.error('[Index] Failed to map predictions feed:', e);
      } finally {
        setLoadingMarkets(false);
      }
    });

    // Also subscribe to agent_predictions so we know which predictions are from agents
    const unsubAgentPreds = listenToAgentPredictions((items) => {
      try {
        const ids = new Set<string>();
        (items || []).forEach((it: any) => {
          const candidate = it.marketId || it.predictionId || it.market || it.marketSlug || it.id;
          if (candidate) ids.add(String(candidate));
        });
        updatePredictedIds(ids);
        // Trigger a refresh by filtering current predictions state
        setPredictions(prev => {
          if (!prev || prev.length === 0) return prev;
          const next = prev.filter(p => ids.has(p.id));
          return next;
        });
      } catch (err) {
        console.warn('[Index] Failed to process agent_predictions for predicted ids', err);
      }
    });

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
      if (unsubAgentPreds) unsubAgentPreds();
    };
  }, [selectedCategory]);



  // Load watchlist from localStorage on mount and when userEmail changes
  useEffect(() => {
    const loadWatchlist = () => {
      const stored = getWatchlist(userEmail);
      setWatchlist(stored);
    };

    // Only load watchlist if user is logged in
    if (userEmail) {
      loadWatchlist();

      // Listen for storage changes (from other tabs/windows)
      const handleStorageChange = (e: StorageEvent) => {
        const watchlistKey = `mira_watchlist_${userEmail}`;
        if (e.key === watchlistKey) {
          loadWatchlist();
        }
      };

      window.addEventListener('storage', handleStorageChange);

      // Also check periodically in case localStorage was updated in same tab
      // Optimized: Reduced from 1s to 5s to reduce API calls (80% reduction)
      const interval = setInterval(loadWatchlist, 5000);

      return () => {
        window.removeEventListener('storage', handleStorageChange);
        clearInterval(interval);
      };
    } else {
      // Clear watchlist if not logged in
      setWatchlist([]);
    }
  }, [userEmail]);

  // Check login status and get userEmail
  useEffect(() => {
    // Temporarily disable server-side auth checks to avoid excess failing requests.
    // Use localStorage fallback only.
    const storedEmail = localStorage.getItem('userEmail');
    if (storedEmail) {
      setIsLoggedIn(true);
      setUserEmail(storedEmail);
    } else {
      setIsLoggedIn(false);
      setUserEmail(undefined);
    }
    // No polling or network auth checks here.
    return;
  }, []);

  // Fetch agent summary data via WebSocket - real-time updates
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let fallbackTimeout: NodeJS.Timeout | null = null;

    // CRITICAL: Fetch summary immediately (don't wait for WebSocket)
    const loadAgentsSummary = async () => {
      try {
        const { API_BASE_URL } = await import('@/lib/apiConfig');
        const response = await fetch(`${API_BASE_URL}/api/agents/summary`, {
          cache: 'no-store',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.agents) {
            setAgents(data.agents.map((agent: any) => ({
              id: agent.id,
              name: agent.name,
              emoji: agent.emoji,
              isActive: false,
              pnl: agent.pnl || 0,
              openMarkets: agent.openMarkets || 0,
              lastTrade: agent.lastTrade || 'No trades',
            })));
          }

          if (data.tradesByAgent) {
            const tradesMap: Record<string, Trade[]> = {};
            Object.keys(data.tradesByAgent).forEach(agentId => {
              const rawTrades = data.tradesByAgent[agentId] || [];
              tradesMap[agentId] = rawTrades.map((trade: any) => ({
                id: trade.id,
                timestamp: new Date(trade.timestamp || trade.openedAt),
                market: trade.market || trade.marketQuestion || trade.marketId,
                marketSlug: trade.marketSlug,
                conditionId: trade.conditionId,
                decision: trade.decision || trade.side,
                confidence: typeof trade.confidence === 'number' ? trade.confidence : parseInt(trade.confidence) || 0,
                reasoning: typeof trade.reasoning === 'string' ? trade.reasoning : (Array.isArray(trade.reasoning) ? trade.reasoning.join(' ') : ''),
                reasoningBullets: Array.isArray(trade.reasoningBullets) ? trade.reasoningBullets : [],
                summaryDecision: trade.summaryDecision || trade.summary || '',
                entryProbability: trade.entryProbability,
                currentProbability: trade.currentProbability,
                webResearchSummary: Array.isArray(trade.webResearchSummary) ? trade.webResearchSummary : [],
                pnl: trade.pnl,
                investmentUsd: trade.investmentUsd || 0,
                status: trade.status || 'OPEN',
                predictionId: trade.predictionId || trade.marketId,
              }));
            });
            setAgentTrades(prev => ({ ...prev, ...tradesMap }));
          }
        }
      } catch (err) {
        console.error('[Index] Failed to fetch agents summary:', err);
      }
    };

    // Fetch immediately (don't wait for WebSocket)
    loadAgentsSummary();

    const setupWebSocket = async () => {
      try {
        const { subscribe } = await import('@/lib/websocket');

        unsubscribe = await subscribe('agents:summary', (data: any) => {
          if (data.agents) {
            setAgents(data.agents.map((agent: any) => ({
              id: agent.id,
              name: agent.name,
              emoji: agent.emoji,
              isActive: false, // Will be set by activity simulation
              pnl: agent.pnl || 0,
              openMarkets: agent.openMarkets || 0,
              lastTrade: agent.lastTrade || 'No trades',
            })));
          }

          // CRITICAL: Pre-load trades from summary to avoid separate API calls
          if (data.tradesByAgent) {
            const tradesMap: Record<string, Trade[]> = {};
            Object.keys(data.tradesByAgent).forEach(agentId => {
              const rawTrades = data.tradesByAgent[agentId] || [];
              tradesMap[agentId] = rawTrades.map((trade: any) => ({
                id: trade.id,
                timestamp: new Date(trade.timestamp || trade.openedAt),
                market: trade.market || trade.marketQuestion || trade.marketId,
                marketSlug: trade.marketSlug,
                conditionId: trade.conditionId,
                decision: trade.decision || trade.side,
                confidence: typeof trade.confidence === 'number' ? trade.confidence : parseInt(trade.confidence) || 0,
                reasoning: typeof trade.reasoning === 'string' ? trade.reasoning : (Array.isArray(trade.reasoning) ? trade.reasoning.join(' ') : ''),
                reasoningBullets: Array.isArray(trade.reasoningBullets) ? trade.reasoningBullets : [],
                summaryDecision: trade.summaryDecision || trade.summary || '',
                entryProbability: trade.entryProbability,
                currentProbability: trade.currentProbability,
                webResearchSummary: Array.isArray(trade.webResearchSummary) ? trade.webResearchSummary : [],
                pnl: trade.pnl,
                investmentUsd: trade.investmentUsd || 0,
                status: trade.status || 'OPEN',
                predictionId: trade.predictionId || trade.marketId,
              }));
            });
            setAgentTrades(prev => ({ ...prev, ...tradesMap }));
          }
        });

        console.log('[Index] ✅ WebSocket connected for agents:summary');
      } catch (error) {
        console.warn('[Index] ⚠️  WebSocket failed, falling back to polling:', error);
        // Fallback to polling if WebSocket fails (already fetched once above)
        fallbackTimeout = setInterval(loadAgentsSummary, 30 * 1000);
      }
    };

    setupWebSocket();

    return () => {
      if (unsubscribe) unsubscribe();
      if (fallbackTimeout) clearInterval(fallbackTimeout);
    };
  }, []);

  // Simulate AI trading activity (visual indicator only)
  useEffect(() => {
    const interval = setInterval(() => {
      const randomAgentIndex = Math.floor(Math.random() * agents.length);

      setAgents(prev => prev.map((agent, idx) => ({
        ...agent,
        isActive: idx === randomAgentIndex
      })));

      setTimeout(() => {
        setAgents(prev => prev.map(agent => ({
          ...agent,
          isActive: false
        })));
      }, 1500);
    }, 8000);

    return () => clearInterval(interval);
  }, [agents.length]);

  const handleAgentClick = async (agentId: string) => {
    // NOTE: QWEN is selectable like other agents — removed previous exclusion

    // Toggle behavior: If clicking the same agent that's already selected and summary is showing, close the filter
    if (selectedAgent === agentId && isSummaryOpen && !showAgentTrades) {
      // Clear selection and close summary if no other view is active
      setSelectedAgent(null);
      setIsSummaryOpen(false);
      setRightPanelSize(0);
      return;
    }

    // Set selected agent and open the Summary panel with the agent filter active.
    // Keep other side views closed so Summary is visible.
    setSelectedAgent(agentId);
    setShowAgentTrades(false);
    setShowWaitlist(false);
    setShowWatchlist(false);
    setShowNewsFeed(false);
    if (!isSummaryOpen) {
      setIsSummaryOpen(true);
    }

    try {
      console.log(`[handleAgentClick] Fetching trades for ${agentId}...`);
      const trades = await getAgentTrades(agentId);
      console.log(`[handleAgentClick] Received ${trades.length} trades for ${agentId}:`, trades);
      setAgentTrades(prev => ({ ...prev, [agentId]: trades }));
      console.log(`[handleAgentClick] Updated agentTrades state for ${agentId}`);
    } catch (error) {
      console.error(`[handleAgentClick] Failed to load trades for ${agentId}:`, error);
    }
  };

  const handleCloseAgentTrades = () => {
    setShowAgentTrades(false);
    setSelectedAgent(null);
  };

  const handleNodeClick = (nodeId: string) => {
    const clickedPrediction = predictions.find(p => p.id === nodeId);
    if (selectedNode === nodeId) {
      // Deselect if clicking the same node
      setSelectedNode(null);
      setSelectedPrediction(null);
    } else {
      // Select the clicked node
      setSelectedNode(nodeId);
      setSelectedPrediction(clickedPrediction || null);
    }
  };

  // Track if we're currently transitioning to prevent unwanted panel opens
  const isTransitioningRef = useRef(false);
  const bubbleClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleBubbleClick = (prediction: PredictionNodeData) => {
    // CRITICAL: Clear any pending click timeout
    if (bubbleClickTimeoutRef.current) {
      clearTimeout(bubbleClickTimeoutRef.current);
      bubbleClickTimeoutRef.current = null;
    }

    // CRITICAL: Don't open panel if we're transitioning - prevents glitching
    if (isTransitioningRef.current || isTransitioning) {
      return;
    }

    // CRITICAL: Add a small delay to ensure this wasn't triggered by a drag
    // This prevents the panel from opening when dragging bubbles
    bubbleClickTimeoutRef.current = setTimeout(() => {
      // Double-check we're still not transitioning
      if (isTransitioningRef.current || isTransitioning) {
        return;
      }

      setSelectedPrediction(prediction);
      // Show in side panel instead of modal
      // Ensure performance panel is open to show the details
      // CRITICAL: Only open if it's a genuine click, not after a drag
      if (!isPerformanceOpen) {
        // CRITICAL: Mark that panel was auto-opened from bubble click
        performancePanelAutoOpenedRef.current = true;

        // CRITICAL: Set transition state to prevent bubble layout recalculation
        setIsTransitioning(true);
        isTransitioningRef.current = true;

        // CRITICAL: Set panel size to default (30%) when opening from bubble click
        // This ensures the panel opens at the correct size, not smaller
        const defaultSize = 30;
        setIsPerformanceOpen(true);
        setLeftPanelSize(defaultSize);
        setSavedLeftPanelSize(defaultSize);
        // Update localStorage
        localStorage.setItem('savedLeftPanelSize', '30');
        localStorage.removeItem('react-resizable-panels:panel-layout');
        // Dashboard stays 100% - no size updates needed

        // Clear transition state after animation completes
        setTimeout(() => {
          setIsTransitioning(false);
          isTransitioningRef.current = false;
        }, 200);
      } else {
        // Panel was already open (manually opened), so don't mark as auto-opened
        performancePanelAutoOpenedRef.current = false;
      }
      bubbleClickTimeoutRef.current = null;
    }, 100); // Longer delay to catch drag events
  };

  const handleCloseMarketDetails = () => {
    setSelectedPrediction(null);
    setSelectedNode(null);
    // CRITICAL: If performance panel was auto-opened from a bubble click (when both panels were closed),
    // close it when user clicks X to return to dashboard view
    if (isPerformanceOpen && performancePanelAutoOpenedRef.current) {
      // Reset the auto-opened flag
      performancePanelAutoOpenedRef.current = false;

      // Set transition state to prevent bubble layout recalculation
      setIsTransitioning(true);
      isTransitioningRef.current = true;

      // Close the performance panel
      setIsPerformanceOpen(false);
      setLeftPanelSize(0);
      setSavedLeftPanelSize(0);

      // Dashboard stays 100% - no size updates needed

      // Clear transition state after animation completes
      setTimeout(() => {
        setIsTransitioning(false);
        isTransitioningRef.current = false;
      }, 200);
    }
  };

  // Global listener so other parts of the app can open market details (e.g. summary cards)
  useEffect(() => {
    const handler = async (e: any) => {
      try {
        const detail = e?.detail || {};
        const providedPrediction = detail?.prediction;
        const marketId = detail?.marketId || detail?.predictionId || (providedPrediction && (providedPrediction.id || providedPrediction.marketId));
        const marketName = detail?.marketName || (providedPrediction && (providedPrediction.question || providedPrediction.market));

        if (!marketId && !marketName && !providedPrediction) return;

        // If a full prediction object was provided, normalize it into a PredictionNodeData
        let matchingPrediction: any = undefined;
        if (providedPrediction) {
          const sd: any = providedPrediction;
          // Normalize various possible bet/volume fields so MarketDetailsPanel can read them
          const betAmount = sd.investmentUsd ?? sd.volume ?? sd.bet_amount ?? sd.betAmount ?? sd.bet ?? sd.investment ?? undefined;
          const confidenceVal = sd.confidence ?? sd.probability ?? sd.price ?? undefined;
          const explicitMarketVolume = sd.volume ?? sd.marketVolume ?? sd.market_volume ?? sd.volume24h ?? undefined;
          const constructed: PredictionNodeData = {
            id: sd.marketId || sd.id || String(marketId),
            question: sd.market || sd.marketQuestion || sd.marketName || sd.title || sd.question || 'Unknown Market',
            probability: (typeof confidenceVal === 'number' && isFinite(confidenceVal)) ? confidenceVal : (confidenceVal ? Number(confidenceVal) : 0),
            position: (sd.decision === 'YES' || sd.position === 'YES') ? 'YES' : ((sd.decision === 'NO' || sd.position === 'NO') ? 'NO' : (sd.position || 'YES')),
            price: (typeof confidenceVal === 'number' && isFinite(confidenceVal)) ? confidenceVal : (confidenceVal ? Number(confidenceVal) : 0),
            change: sd.change ?? 0,
            agentName: sd.agentName || sd.agent || '',
            agentEmoji: sd.agentEmoji || sd.agent_emoji || '',
            reasoning: sd.reasoning || (Array.isArray(sd.fullReasoning) ? sd.fullReasoning.join(' ') : '') || '',
            category: sd.category || undefined,
            marketSlug: sd.marketSlug || sd.slug || undefined,
            conditionId: sd.conditionId || undefined,
            imageUrl: sd.imageUrl || sd.image || undefined,
            createdAt: sd.createdAt || sd.created_at || undefined,
            endDate: sd.endDate || sd.ends_at || undefined,
            startDate: sd.startDate || sd.starts_at || undefined,
            // Do NOT set the market-level `volume` to the agent's bet amount. Only use explicit market volume fields
            // so MarketDetailsPanel can prefer canonical market data (or the predictions feed) instead of showing the bet as volume.
            volume: explicitMarketVolume as any,
            liquidity: sd.liquidity ?? 0,
            predicted: true,
          } as PredictionNodeData;
          // Attach raw agent-style bet fields separately so MarketDetailsPanel can show the bet placed.
          (constructed as any).bet_amount = sd.bet_amount ?? sd.betAmount ?? sd.bet ?? sd.investment ?? undefined;
          (constructed as any).investmentUsd = sd.investmentUsd ?? sd.betAmount ?? sd.bet ?? sd.investment ?? undefined;
          (constructed as any).decision = sd.decision ?? sd.position ?? undefined;
          // If possible, resolve the canonical market entry and copy its canonical field names
          try {
            const marketsMap: Record<string, any> = await new Promise((resolve) => {
              try {
                const unsub = listenToMarkets((m: any) => {
                  try { if (unsub) unsub(); } catch (e) { }
                  resolve(m || {});
                });
                setTimeout(() => resolve({}), 500);
              } catch (e) { resolve({}); }
            });

            const entries = Object.entries(marketsMap || {});
            const found = entries.find(([k, v]: any) => {
              const maybe = v as any;
              if (!maybe) return false;
              const idMatches = String(k) === String(constructed.id) || String(maybe.id) === String(constructed.id);
              const slugMatches = maybe.slug && String(maybe.slug) === String(constructed.id);
              const condMatches = maybe.conditionId && String(maybe.conditionId) === String(constructed.id);
              return idMatches || slugMatches || condMatches;
            });

            if (found) {
              const val = found[1] as any;
              // Copy canonical labels so MarketDetailsPanel finds them directly on the prediction object
              (constructed as any).volume = (constructed as any).volume ?? val.volume ?? val.total_volume ?? val.volume_all_time ?? undefined;
              (constructed as any).volume24h = val.volume24h ?? val.volume_24hr ?? val.volume_24h ?? (constructed as any).volume24h ?? undefined;
              (constructed as any).liquidity = (constructed as any).liquidity ?? val.liquidity ?? val.liquidity_amount ?? undefined;
              (constructed as any).yes_price = (constructed as any).yes_price ?? val.yes_price ?? val.yesPrice ?? undefined;
              (constructed as any).no_price = (constructed as any).no_price ?? val.no_price ?? val.noPrice ?? undefined;
              (constructed as any).createdAt = (constructed as any).createdAt ?? val.created_at ?? val.createdAt ?? val.updated_at ?? undefined;
              (constructed as any).endDate = (constructed as any).endDate ?? val.end_date ?? val.ends_at ?? undefined;
              (constructed as any).outcomes = (constructed as any).outcomes ?? val.outcomes ?? undefined;
              (constructed as any).marketSlug = (constructed as any).marketSlug ?? val.slug ?? val.marketSlug ?? undefined;
              // Mark this constructed object as originating from the canonical markets map
              (constructed as any).isMarket = true;
            }
          } catch (e) {
            // ignore resolution errors - fallback logic later will still query markets
          }

          matchingPrediction = constructed as any;
        }

        // Otherwise try to find in main predictions list first
        if (!matchingPrediction) matchingPrediction = predictions.find(p => p.id === marketId || (p as any).predictionId === marketId || p.marketSlug === marketId || String(p.id) === String(marketId));

        // If not found, try to find in summaryDecisions (incoming agent decisions)
        if (!matchingPrediction && summaryDecisions && summaryDecisions.length > 0) {
          const sd = summaryDecisions.find((s: any) => String(s.marketId) === String(marketId) || String(s.id) === String(marketId) || (marketName && String(s.market || s.marketQuestion || s.marketName || '').toLowerCase().includes(String(marketName).toLowerCase())));
          if (sd) {
            // Create a minimal PredictionNodeData from the summary decision so the MarketDetailsPanel can render
            const constructed: PredictionNodeData = {
              id: sd.marketId || sd.id || String(marketId),
              question: sd.market || sd.marketQuestion || sd.marketName || sd.market || 'Unknown Market',
              probability: (typeof sd.confidence === 'number' && isFinite(sd.confidence)) ? sd.confidence : (sd.confidence ? Number(sd.confidence) : 0),
              position: (sd.decision === 'YES') ? 'YES' : 'NO',
              price: (typeof sd.confidence === 'number' && isFinite(sd.confidence)) ? sd.confidence : (sd.confidence ? Number(sd.confidence) : 0),
              change: sd.change ?? 0,
              agentName: sd.agentName || '',
              agentEmoji: sd.agentEmoji || '',
              reasoning: sd.reasoning || sd.fullReasoning?.join(' ') || '',
              category: sd.category || undefined,
              marketSlug: sd.marketSlug || undefined,
              conditionId: sd.conditionId || undefined,
              imageUrl: sd.imageUrl || undefined,
              createdAt: sd.createdAt || undefined,
              endDate: sd.endDate || undefined,
              startDate: sd.startDate || undefined,
              volume: sd.investmentUsd || sd.volume || 0,
              liquidity: sd.liquidity || 0,
              predicted: true,
            } as PredictionNodeData;
            matchingPrediction = constructed as any;
          }
        }

        // If still not found, try to query the canonical markets map (RTDB) so we can construct a proper prediction
        if (!matchingPrediction) {
          try {
            const marketsMap: Record<string, any> = await new Promise((resolve) => {
              try {
                const unsub = listenToMarkets((m: any) => {
                  try { if (unsub) unsub(); } catch (e) { }
                  resolve(m || {});
                });
                // Safety timeout in case listener doesn't call back
                setTimeout(() => resolve({}), 500);
              } catch (e) { resolve({}); }
            });

            // Search marketsMap by several keys
            const entries = Object.entries(marketsMap || {});
            const found = entries.find(([k, v]: any) => {
              const maybe = v as any;
              if (!maybe) return false;
              const idMatches = String(k) === String(marketId) || String(maybe.id) === String(marketId);
              const slugMatches = maybe.slug && String(maybe.slug) === String(marketId);
              const condMatches = maybe.conditionId && String(maybe.conditionId) === String(marketId);
              return idMatches || slugMatches || condMatches;
            });

            if (found) {
              const val = found[1] as any;
              const constructedFromMarket: PredictionNodeData = {
                id: String(val.id || found[0] || marketId),
                question: val.question || val.title || val.market || val.marketQuestion || String(marketName) || 'Unknown Market',
                probability: (typeof val.yes_price === 'number' ? Math.round(val.yes_price * 100) : (typeof val.probability === 'number' ? val.probability : 0)),
                position: (val.yes_price && val.yes_price >= 0.5) ? 'YES' : 'NO',
                price: typeof val.yes_price === 'number' ? Math.round(val.yes_price * 100) : (typeof val.probability === 'number' ? val.probability : 0),
                change: val.change ?? 0,
                agentName: val.agentName || '',
                agentEmoji: val.agentEmoji || '',
                reasoning: val.reasoning || val.description || '',
                category: val.category || val.tags || undefined,
                marketSlug: val.slug || val.marketSlug || undefined,
                conditionId: val.conditionId || undefined,
                imageUrl: val.image || val.imageUrl || val.thumb || undefined,
                createdAt: val.createdAt || val.created_at || undefined,
                endDate: val.endDate || val.end_date || val.ends_at || undefined,
                startDate: val.startDate || val.start_date || val.starts_at || undefined,
                volume: val.volume ?? 0,
                liquidity: val.liquidity ?? 0,
                predicted: true,
              } as PredictionNodeData;
              // Mark constructed object as a market-origin object so downstream panels hide prediction-only UI
              (constructedFromMarket as any).isMarket = true;
              matchingPrediction = constructedFromMarket as any;
            }
          } catch (e) {
            // ignore
          }
        }

        if (matchingPrediction) {
          setSelectedPrediction(matchingPrediction as PredictionNodeData);
          setSelectedNode((matchingPrediction as any).id || String(marketId));
          if (!isPerformanceOpen) {
            performancePanelAutoOpenedRef.current = true;
            setIsPerformanceOpen(true);
            setLeftPanelSize(30);
            setSavedLeftPanelSize(30);
            localStorage.setItem('savedLeftPanelSize', '30');
          }
        } else {
          console.warn('[mira-open-market] prediction not found for id/name:', marketId, marketName);
        }
      } catch (err) {
        console.warn('[mira-open-market] handler error', err);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('mira-open-market', handler as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mira-open-market', handler as EventListener);
      }
    };
  }, [predictions, summaryDecisions, isPerformanceOpen]);

  // Pan/zoom handlers removed - bubbles now fill full screen and can only be dragged individually

  const marketCategories = [
    "All Markets",
    "Trending",
    "Breaking",
    "New",
    "Politics",
    "Sports",
    "Finance",
    "Crypto",
    "Geopolitics",
    "Earnings",
    "Tech",
    "World",
    "Elections"
  ];

  // Filter predictions by search query and filters
  const filteredPredictions = useMemo(() => {
    let filtered = predictions;

    // Apply search query filter: match only against the visible bubble title (prediction.question)
    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.trim().toLowerCase();
      filtered = filtered.filter(prediction => {
        const title = (prediction.question || '').toLowerCase();
        return title.includes(q);
      });
    }

    // Apply volume filters
    if (filters.minVolume) {
      const minVol = parseFloat(filters.minVolume);
      if (!isNaN(minVol)) {
        filtered = filtered.filter(p => {
          const vol = typeof p.volume === 'string' ? parseFloat(p.volume) : (p.volume || 0);
          return vol >= minVol;
        });
      }
    }
    if (filters.maxVolume) {
      const maxVol = parseFloat(filters.maxVolume);
      if (!isNaN(maxVol)) {
        filtered = filtered.filter(p => {
          const vol = typeof p.volume === 'string' ? parseFloat(p.volume) : (p.volume || 0);
          return vol <= maxVol;
        });
      }
    }

    // Apply liquidity filters
    if (filters.minLiquidity) {
      const minLiq = parseFloat(filters.minLiquidity);
      if (!isNaN(minLiq)) {
        filtered = filtered.filter(p => {
          const liq = typeof p.liquidity === 'string' ? parseFloat(p.liquidity) : (p.liquidity || 0);
          return liq >= minLiq;
        });
      }
    }
    if (filters.maxLiquidity) {
      const maxLiq = parseFloat(filters.maxLiquidity);
      if (!isNaN(maxLiq)) {
        filtered = filtered.filter(p => {
          const liq = typeof p.liquidity === 'string' ? parseFloat(p.liquidity) : (p.liquidity || 0);
          return liq <= maxLiq;
        });
      }
    }

    // Apply price filters
    if (filters.minPrice) {
      const minPrice = parseFloat(filters.minPrice);
      if (!isNaN(minPrice)) {
        filtered = filtered.filter(p => (p.price || 0) >= minPrice);
      }
    }
    if (filters.maxPrice) {
      const maxPrice = parseFloat(filters.maxPrice);
      if (!isNaN(maxPrice)) {
        filtered = filtered.filter(p => (p.price || 0) <= maxPrice);
      }
    }

    // Apply probability filters
    if (filters.minProbability) {
      const minProb = parseFloat(filters.minProbability);
      if (!isNaN(minProb)) {
        filtered = filtered.filter(p => (p.probability || 0) >= minProb);
      }
    }
    if (filters.maxProbability) {
      const maxProb = parseFloat(filters.maxProbability);
      if (!isNaN(maxProb)) {
        filtered = filtered.filter(p => (p.probability || 0) <= maxProb);
      }
    }

    // Apply sorting
    if (filters.sortBy !== 'none') {
      filtered = [...filtered].sort((a, b) => {
        let aVal = 0;
        let bVal = 0;

        switch (filters.sortBy) {
          case 'volume':
            aVal = typeof a.volume === 'string' ? parseFloat(a.volume) : (a.volume || 0);
            bVal = typeof b.volume === 'string' ? parseFloat(b.volume) : (b.volume || 0);
            break;
          case 'liquidity':
            aVal = typeof a.liquidity === 'string' ? parseFloat(a.liquidity) : (a.liquidity || 0);
            bVal = typeof b.liquidity === 'string' ? parseFloat(b.liquidity) : (b.liquidity || 0);
            break;
          case 'price':
            aVal = a.price || 0;
            bVal = b.price || 0;
            break;
          case 'probability':
            aVal = a.probability || 0;
            bVal = b.probability || 0;
            break;
        }

        if (filters.sortOrder === 'asc') {
          return aVal - bVal;
        } else {
          return bVal - aVal;
        }
      });
    }

    // Top-level decision filter removed — no Yes/No tab filtering applied here

    return filtered;
  }, [predictions, debouncedSearchQuery, filters]);

  // Apply bubble limit to filtered predictions
  const limitedPredictions = useMemo(() => {
    // Apply the selected bubble limit (0 means show all)
    if (bubbleLimit > 0 && bubbleLimit < filteredPredictions.length) {
      return filteredPredictions.slice(0, bubbleLimit);
    }
    return filteredPredictions;
  }, [filteredPredictions, bubbleLimit]);

  // If `summaryDecisions` is present we previously bypassed the header search;
  // compute a `displayPredictions` that applies the same title-only search to
  // summary decisions so the search input consistently filters the visible bubbles.
  const displayPredictions = useMemo(() => {
    try {
      let source: any[] = (summaryDecisions && summaryDecisions.length > 0) ? summaryDecisions.slice() : limitedPredictions.slice();

      // Apply top-level decision filter (yes/no/all) so bubbles mirror the summary panel
      if (decisionFilter && decisionFilter !== 'all') {
        const want = decisionFilter === 'yes' ? 'YES' : 'NO';
        source = source.filter((p: any) => {
          try {
            const candidate = (p.position || p.decision || p.raw?.decision || p.raw?.side || (typeof p.price === 'number' ? (p.price >= 50 ? 'YES' : 'NO') : undefined) || (typeof p.probability === 'number' ? (p.probability >= 50 ? 'YES' : 'NO') : undefined) || '').toString().toUpperCase();
            return candidate === want;
          } catch (e) { return false; }
        });
      }

      if (!debouncedSearchQuery.trim()) return source;
      const q = debouncedSearchQuery.trim().toLowerCase();
      return (source || []).filter((p: any) => {
        const title = String(p.question || p.marketQuestion || p.market || p.title || '').toLowerCase();
        return title.includes(q);
      });
    } catch (e) {
      // If anything goes wrong while filtering for search, return empty results
      // to avoid accidentally showing the unfiltered set when the user expected no matches.
      console.debug('[Index] displayPredictions filter error', e);
      return [];
    }
  }, [summaryDecisions, limitedPredictions, debouncedSearchQuery, decisionFilter]);

  // Signature used to force remount of the bubble field when the displayed predictions change
  const predictionsSignature = useMemo(() => {
    try {
      return displayPredictions.map((p: any) => (p.id || '')).join('|');
    } catch (e) {
      return String((displayPredictions || []).length);
    }
  }, [displayPredictions]);


  // Get custodial wallet from localStorage when logged in
  useEffect(() => {
    const checkWallet = async () => {
      // First, try to get stored custodial wallet directly
      let wallet = getCustodialWallet();

      // If no custodial wallet, check if user is logged in and create/get one
      if (!wallet) {
        const storedEmail = localStorage.getItem('userEmail');
        const storedWallet = localStorage.getItem('walletAddress');
        if (storedEmail || storedWallet) {
          const userId = storedEmail || storedWallet || 'default';
          wallet = await getOrCreateWallet(userId);
          // Store it as the main custodial wallet
          storeCustodialWallet(wallet);
        }
      }

      if (wallet) {
        setCustodialWallet({
          publicKey: wallet.publicKey,
          privateKey: wallet.privateKey,
        });
      } else {
        setCustodialWallet(null);
      }
    };
    checkWallet();
    // Check periodically - reduced frequency to prevent performance issues
    const interval = setInterval(() => {
      checkWallet().catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Panels are now overlays - dashboard never changes size, no resize logic needed


  const handleTogglePerformance = () => {
    const newState = !isPerformanceOpen;
    // CRITICAL: Reset auto-opened flag when manually toggling
    performancePanelAutoOpenedRef.current = false;

    setIsTransitioning(true);
    isTransitioningRef.current = true; // Set ref to prevent bubble clicks from opening panel
    setIsPerformanceOpen(newState);
    if (newState) {
      // Opening Performance - always restore to default size (30%)
      const defaultSize = 30;
      setLeftPanelSize(defaultSize);
      setSavedLeftPanelSize(defaultSize);
      // Update localStorage immediately to override any saved values
      localStorage.setItem('savedLeftPanelSize', '30');
      // Clear react-resizable-panels localStorage to prevent interference
      localStorage.removeItem('react-resizable-panels:panel-layout');
      // Dashboard stays 100% - no size updates needed
      // DO NOT touch Summary refs - keep panels independent
    } else {
      // Closing Performance - collapse to 0
      setLeftPanelSize(0);
      // Dashboard stays 100% - no size updates needed
      // DO NOT touch Summary refs - keep panels independent
    }
    // Clear transitioning state after animation completes - faster transition
    setTimeout(() => {
      setIsTransitioning(false);
      isTransitioningRef.current = false; // Clear ref after transition
    }, 0); // No transition delay for instant response
  };

  const handleToggleSummary = () => {
    setIsTransitioning(true);
    // If Summary is already showing (and no other view is active), close the panel
    if (isSummaryOpen && !showNewsFeed && !showWaitlist && !showWatchlist && !showAgentTrades) {
      setIsSummaryOpen(false);
      setRightPanelSize(0);
      // Dashboard stays 100% - no size updates needed
      setTimeout(() => {
        setIsTransitioning(false);
        isTransitioningRef.current = false;
      }, 150); // Faster transition for better responsiveness
      return;
    }

    // Opening Summary - switch to Summary view (close other views)
    setShowNewsFeed(false);
    setShowWaitlist(false);
    setShowWatchlist(false); // Close watchlist when opening summary
    setShowAgentTrades(false); // Close agent trades when opening summary
    setSelectedAgent(null); // Deselect agent
    setIsSummaryOpen(true);
    const defaultSize = 30;
    setRightPanelSize(defaultSize);
    setSavedRightPanelSize(defaultSize);
    localStorage.setItem('savedRightPanelSize', '30');
    localStorage.removeItem('react-resizable-panels:panel-layout');
    // Dashboard stays 100% - no size updates needed
    setTimeout(() => {
      setIsTransitioning(false);
      isTransitioningRef.current = false;
    }, 150); // Faster transition for better responsiveness
  };

  const handleToggleWaitlist = () => {
    setIsTransitioning(true);
    // If Waitlist is already showing, close the panel
    if (showWaitlist && isSummaryOpen && !showNewsFeed && !showAgentTrades) {
      setShowWaitlist(false);
      setIsSummaryOpen(false);
      setRightPanelSize(0);
      // Dashboard stays 100% - no size updates needed
      setTimeout(() => {
        setIsTransitioning(false);
        isTransitioningRef.current = false;
      }, 150); // Faster transition for better responsiveness
      return;
    }

    // Opening Waitlist - switch to Waitlist view (close other views)
    setShowNewsFeed(false);
    setShowWatchlist(false); // Close watchlist when opening waitlist
    setShowAgentTrades(false); // Close agent trades when opening waitlist
    setSelectedAgent(null); // Deselect agent
    setShowWaitlist(true);
    setIsSummaryOpen(true); // Always open summary panel when showing waitlist
    const defaultSize = 30;
    setRightPanelSize(defaultSize);
    setSavedRightPanelSize(defaultSize);
    localStorage.setItem('savedRightPanelSize', '30');
    localStorage.removeItem('react-resizable-panels:panel-layout');
    // Dashboard stays 100% - no size updates needed
    setTimeout(() => {
      setIsTransitioning(false);
      isTransitioningRef.current = false;
    }, 150); // Faster transition for better responsiveness
  };

  const handleToggleWatchlist = () => {
    setIsTransitioning(true);
    // If Watchlist is already showing, close the panel
    if (showWatchlist && isSummaryOpen && !showNewsFeed && !showWaitlist && !showAgentTrades) {
      setShowWatchlist(false);
      setIsSummaryOpen(false);
      setRightPanelSize(0);
      setTimeout(() => {
        setIsTransitioning(false);
        isTransitioningRef.current = false;
      }, 150);
      return;
    }

    // Opening Watchlist - switch to Watchlist view (close other views)
    setShowNewsFeed(false);
    setShowWaitlist(false);
    setShowAgentTrades(false); // Close agent trades when opening watchlist
    setSelectedAgent(null); // Deselect agent
    setShowWatchlist(true);
    setIsSummaryOpen(true); // Always open summary panel when showing watchlist
    const defaultSize = 30;
    setRightPanelSize(defaultSize);
    setSavedRightPanelSize(defaultSize);
    localStorage.setItem('savedRightPanelSize', '30');
    localStorage.removeItem('react-resizable-panels:panel-layout');
    setTimeout(() => {
      setIsTransitioning(false);
      isTransitioningRef.current = false;
    }, 150);
  };

  const handleToggleNewsFeed = () => {
    setIsTransitioning(true);
    // If News Feed is already showing and panel is open, close it
    if (showNewsFeed && isSummaryOpen && !showAgentTrades) {
      setIsSummaryOpen(false);
      setShowNewsFeed(false);
      setShowWaitlist(false);
      setShowWatchlist(false);
      setRightPanelSize(0);
      // Dashboard stays 100% - no size updates needed
      setTimeout(() => {
        setIsTransitioning(false);
        isTransitioningRef.current = false;
      }, 150); // Faster transition for better responsiveness
      return;
    }

    // Opening News Feed - switch to News Feed view (close other views)
    setShowNewsFeed(true);
    setShowWaitlist(false);
    setShowWatchlist(false); // Close watchlist when opening news feed
    setIsSummaryOpen(true); // Always open summary panel when showing news feed
    const defaultSize = 30;
    setRightPanelSize(defaultSize);
    setSavedRightPanelSize(defaultSize);
    localStorage.setItem('savedRightPanelSize', '30');
    localStorage.removeItem('react-resizable-panels:panel-layout');
    // Dashboard stays 100% - no size updates needed
    setTimeout(() => {
      setIsTransitioning(false);
      isTransitioningRef.current = false;
    }, 150); // Faster transition for better responsiveness
  };

  return (
    <div className="h-screen w-full bg-background flex flex-col overflow-hidden">
      {/* Global styles - transitions disabled for performance */}
      <style>{`
        [data-panel-id] {
          transition: none !important;
        }
        [data-panel-group] {
          transition: none !important;
        }
      `}</style>
      {/* Top Status Bar - Animate in from top */}
      <div>
        <SystemStatusBar
          onToggleWaitlist={handleToggleWaitlist}
          onTogglePerformance={handleTogglePerformance}
          onToggleSummary={handleToggleSummary}
          onToggleNewsFeed={handleToggleNewsFeed}
          onToggleWatchlist={handleToggleWatchlist}
          onLogout={() => {
            // Close waitlist panel when user logs out
            if (showWaitlist) {
              setShowWaitlist(false);
              setIsSummaryOpen(false);
              setRightPanelSize(0);
            }
          }}
          isPerformanceOpen={isPerformanceOpen}
          isSummaryOpen={isSummaryOpen}
          showNewsFeed={showNewsFeed}
          showWaitlist={showWaitlist}
          showWatchlist={showWatchlist}
        />
      </div>


      {/* Main Content Area - Dashboard is always 100% width/height */}
      <div className="flex-1 flex overflow-hidden w-full relative" style={{ margin: 0, padding: 0 }}>
        {/* Dashboard - Always full width/height, never changes */}
        <div
          className="flex-1 flex flex-col w-full h-full relative"
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            margin: 0,
            padding: 0,
          }}
        >
          {/* Market Category Dropdown - EDGE TO EDGE - NO MARGINS OR PADDING ON CONTAINER - Animate in from top */}
          <div
            className="border-b border-border flex flex-col bg-bg-elevated" style={{ width: '100%', margin: 0, padding: 0, marginLeft: 0, marginRight: 0 }}
          >
            <div className="h-10 flex items-center justify-center px-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-terminal-accent font-mono leading-none flex items-center">
                  &gt; DASHBOARD
                  {loadingMarkets && <span className="ml-2 text-[10px] text-muted-foreground">(Loading markets...)</span>}
                </span>
                <div className="flex items-center gap-3">
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      onClick={() => setBubbleViewMode('predictions')}
                      aria-pressed={bubbleViewMode === 'predictions'}
                      className="text-xs px-2 py-1 rounded-full"
                      style={{
                        background: bubbleViewMode === 'predictions' ? 'white' : 'transparent',
                        color: bubbleViewMode === 'predictions' ? '#000' : '#fff',
                        fontWeight: 700,
                        border: bubbleViewMode === 'predictions' ? 'none' : '1px solid rgba(255,255,255,0.06)'
                      }}
                    >Predictions</button>
                    <button
                      onClick={() => setBubbleViewMode('markets')}
                      aria-pressed={bubbleViewMode === 'markets'}
                      className="text-xs px-2 py-1 rounded-full"
                      style={{
                        background: bubbleViewMode === 'markets' ? 'white' : 'transparent',
                        color: bubbleViewMode === 'markets' ? '#000' : '#fff',
                        fontWeight: 700,
                        border: bubbleViewMode === 'markets' ? 'none' : '1px solid rgba(255,255,255,0.06)'
                      }}
                    >Markets</button>
                  </div>
                  {/* Dashboard decision filter controls */}
                  {/* Decision filter buttons removed (All / YES / NO) */}

                  {/* Filters removed per request - replaced markets dropdown above with Yes/No tabs */}

                  {/* Search Bar - filters & search in dashboard header */}
                  <div className="relative max-w-xs w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      type="text"
                      aria-label="Search markets"
                      placeholder="Search markets..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 pl-9 pr-10 text-xs bg-background border-border focus:border-terminal-accent transition-colors rounded-full"
                    />
                    {/* Clear button appears when any top-level filter is active */}
                    {(decisionFilter !== 'all' || selectedAgent !== null || (searchQuery && searchQuery.trim() !== '') || JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)) && (
                      <button
                        onClick={() => {
                          // Reset top-level filters and search
                          setDecisionFilter('all');
                          setSelectedAgent(null);
                          setSearchQuery('');
                          setDebouncedSearchQuery('');
                          setFilters({ ...DEFAULT_FILTERS });
                        }}
                        className="absolute right-10 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground bg-[rgba(255,255,255,0.02)] px-2 py-0.5 rounded hover:bg-[rgba(255,255,255,0.04)]"
                      >
                        Clear
                      </button>
                    )}


                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Prediction Map Container - FULL SPACE - CLIP TO BOUNDS */}
          <div
            className="flex-1 relative"
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              overflow: 'hidden', // CRITICAL: Clip bubbles to prevent navbar overlap
              willChange: 'auto',
              // OPTIMIZATION: Prevent layout thrashing during resize
              contain: 'layout style paint',
            }}
          >
            {/* Subtle grid background */}
            <div
              className="absolute inset-0 opacity-5 pointer-events-none"
              style={{
                backgroundImage: `
                  linear-gradient(hsl(var(--border)) 1px, transparent 1px),
                  linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px',
              }}
            />

            {/* Prediction Bubble Field - FULL SPACE - NO ZOOM/PAN */}
            {/* OPTIMIZATION: Disable interactions during resize but keep bubbles visible */}
            <div
              style={{
                width: '100%',
                height: '100%',
                pointerEvents: 'auto',
                willChange: 'auto',
                position: 'relative',
                zIndex: 10,
              }}
            >
              <div
                className="w-full h-full"
                style={{ pointerEvents: 'auto', zIndex: 10 }}
              >
                <PredictionBubbleCanvas
                  key={predictionsSignature}
                  viewMode={bubbleViewMode}
                  items={bubbleViewMode === 'predictions' ? displayPredictions : undefined}
                  searchQuery={debouncedSearchQuery}
                  onBubbleClick={(market) => handleBubbleClick(market)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* LEFT: Performance Chart - Overlay */}
        {/* CRITICAL: Always keep chart mounted - never unmount it, just hide/show */}
        {/* Use visibility instead of display to keep component rendered in DOM */}
        {isPerformanceOpen && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none', // Don't block clicks - let them pass through to bubbles
              zIndex: 100
            }}
          >
            <ResizablePanelGroup
              direction="horizontal"
              className="absolute inset-0"
              style={{
                pointerEvents: 'none', // Don't block clicks - only panels capture events
                zIndex: 100,
                height: '100%'
              }}
            >
              <ResizablePanel
                defaultSize={leftPanelSize}
                minSize={15}
                maxSize={30}
                onResize={(size) => {
                  setLeftPanelSize(size);
                  setSavedLeftPanelSize(size);
                }}
                className="border-r border-border bg-background"
                style={{
                  pointerEvents: 'auto', // Only the actual panel captures clicks
                  boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
                  zIndex: 100,
                  height: '100%'
                }}
              >
                <div className="flex flex-col h-full">
                  {/* When market is selected, hide chart and show full market details */}
                  {selectedPrediction ? (
                    <div className="h-full overflow-hidden bg-background">
                      <MarketDetailsPanel
                        market={selectedPrediction}
                        onClose={handleCloseMarketDetails}
                        onWatchlistChange={() => {
                          setWatchlist(getWatchlist(userEmail));
                        }}
                        watchlist={watchlist}
                        userEmail={userEmail}
                      />
                    </div>
                  ) : (
                    <div className="h-full">
                      <PerformanceChart
                        predictions={predictions}
                        selectedMarketId={selectedNode}
                        selectedAgentId={selectedAgent} // Pass selected agent to update chart
                      />
                    </div>
                  )}
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle style={{ pointerEvents: 'auto', zIndex: 50 }} />
              <ResizablePanel defaultSize={100 - leftPanelSize} minSize={70} maxSize={85} style={{ pointerEvents: 'none', height: '100%' }} />
            </ResizablePanelGroup>
          </div>
        )}

        {/* RIGHT: AI Summary Panel - Overlay */}
        {isSummaryOpen && (
          <div
            className="absolute inset-0"
            style={{
              pointerEvents: 'none', // Don't block clicks - let them pass through to bubbles
              zIndex: 100
            }}
          >
            <ResizablePanelGroup
              direction="horizontal"
              className="absolute inset-0"
              style={{
                pointerEvents: 'none', // Don't block clicks - only panels capture events
                zIndex: 100,
                height: '100%'
              }}
            >
              <ResizablePanel defaultSize={100 - rightPanelSize} minSize={70} maxSize={85} style={{ pointerEvents: 'none', height: '100%' }} />
              <ResizableHandle withHandle style={{ pointerEvents: 'auto', zIndex: 50 }} />
              <ResizablePanel
                defaultSize={rightPanelSize}
                minSize={15}
                maxSize={30}
                onResize={(size) => {
                  setRightPanelSize(size);
                  setSavedRightPanelSize(size);
                }}
                className="border-l border-border bg-background"
                style={{
                  pointerEvents: 'auto', // Only the actual panel captures clicks
                  boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
                  height: '100%'
                }}
              >
                {showWaitlist ? (
                  <Waitlist />
                ) : showWatchlist ? (
                  <Watchlist
                    watchlist={watchlist}
                    onRemove={(id) => {
                      removeFromWatchlist(id, userEmail);
                      setWatchlist(getWatchlist(userEmail));
                    }}
                    onMarketClick={(market) => {
                      setSelectedPrediction(market);
                      setSelectedNode(market.id);
                      // Keep watchlist open - don't close it
                      // Also ensure left panel (market details) is open
                      if (!isPerformanceOpen) {
                        setIsPerformanceOpen(true);
                        setLeftPanelSize(30);
                      }
                    }}
                  />
                ) : showNewsFeed ? (
                  <NewsFeed />
                ) : showAgentTrades && selectedAgent ? (
                  <AgentTradesPanel
                    agentId={selectedAgent}
                    agentName={agents.find(a => a.id === selectedAgent)?.name || 'Unknown'}
                    agentEmoji={agents.find(a => a.id === selectedAgent)?.emoji || '🤖'}
                    trades={agentTrades[selectedAgent] || []}
                    onClose={handleCloseAgentTrades}
                    onTradeClick={(marketName, predictionId) => {
                      console.log('[TradeClick] Clicked trade:', { marketName, predictionId, totalPredictions: predictions.length });
                      // Always use predictionId - trades are generated from actual predictions
                      if (predictionId) {
                        const matchingPrediction = predictions.find(p => p.id === predictionId);
                        if (matchingPrediction) {
                          console.log('[TradeClick] Found matching prediction:', matchingPrediction.id);
                          setSelectedPrediction(matchingPrediction);
                          setSelectedNode(matchingPrediction.id);
                          if (!isPerformanceOpen) {
                            setIsPerformanceOpen(true);
                            setLeftPanelSize(30);
                          }
                        } else {
                          console.warn('[TradeClick] Prediction not found for ID:', predictionId);
                          console.warn('[TradeClick] Available prediction IDs (first 10):', predictions.slice(0, 10).map(p => p.id));
                          // Try to find by market name as fallback
                          const byName = predictions.find(p => p.question?.toLowerCase().includes(marketName.toLowerCase()));
                          if (byName) {
                            console.log('[TradeClick] Found by name fallback:', byName.id);
                            setSelectedPrediction(byName);
                            setSelectedNode(byName.id);
                            if (!isPerformanceOpen) {
                              setIsPerformanceOpen(true);
                              setLeftPanelSize(30);
                            }
                          }
                        }
                      } else {
                        console.warn('[TradeClick] No prediction ID provided for trade:', marketName);
                      }
                    }}
                  />
                ) : (
                  <div className="h-full">
                    <AISummaryPanel
                      selectedAgentFilter={selectedAgent || undefined}
                      globalSearch={debouncedSearchQuery}
                      decisionFilter={decisionFilter}
                      onTradeClick={(marketId) => {
                        // Find the prediction by marketId and open it
                        const matchingPrediction = predictions.find(p => p.id === marketId);
                        if (matchingPrediction) {
                          setSelectedPrediction(matchingPrediction);
                          setSelectedNode(matchingPrediction.id);
                          if (!isPerformanceOpen) {
                            setIsPerformanceOpen(true);
                            setLeftPanelSize(30);
                          }
                        } else {
                          console.warn('Prediction not found for market ID:', marketId);
                        }
                      }}
                      onDecisionsUpdate={(decisions) => {
                        try {
                          setSummaryDecisions(decisions || []);
                        } catch (e) { }
                      }}
                    />
                  </div>
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        )}
      </div>

      {/* Bottom Active Positions */}
      <div>
        <ActivePositions
          agents={agents}
          selectedAgent={selectedAgent}
          onAgentClick={handleAgentClick}
        />
      </div>

      {/* Market Details Modal - Replaced by side panel */}
      {/* Modal removed - details now show in left side panel */}
    </div>
  );
};

export default Index;
