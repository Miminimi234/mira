import { listenToMarkets } from '@/lib/firebase/listeners';
import { addToWatchlist, isInWatchlist, removeFromWatchlist } from "@/lib/watchlist";
import { BarChart3, Clock, DollarSign, ExternalLink, Info, Star, Tag, TrendingDown, TrendingUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PredictionNodeData } from "./PredictionTypes";

interface Outcome {
  tokenId: string;
  name: string;
  price: number;
  buyPrice?: number;
  sellPrice?: number;
  probability: number;
}

interface MarketDetailsPanelProps {
  market: PredictionNodeData & {
    // Additional fields from Polymarket API
    volume?: number | string;
    volume24h?: number;
    volume7d?: number;
    liquidity?: number | string;
    yesPrice?: number;
    noPrice?: number;
    outcomes?: Outcome[]; // All outcomes with prices
    endDate?: string;
    startDate?: string;
    createdAt?: string;
    tags?: string[];
    subcategory?: string;
    active?: boolean;
    closed?: boolean;
    archived?: boolean;
    new?: boolean;
    featured?: boolean;
  };
  onClose: () => void;
  onWatchlistChange?: () => void;
  watchlist?: PredictionNodeData[]; // Pass watchlist to check if market is in it
  userEmail?: string; // User email for watchlist operations
}

export const MarketDetailsPanel = ({ market, onClose, onWatchlistChange, watchlist, userEmail }: MarketDetailsPanelProps) => {
  const [isWatched, setIsWatched] = useState(false);

  useEffect(() => {
    if (market) {
      // Check if market is in watchlist (use prop if provided, otherwise check localStorage)
      if (watchlist) {
        setIsWatched(watchlist.some(m => m.id === market.id));
      } else {
        setIsWatched(isInWatchlist(market.id, userEmail));
      }
    }
  }, [market, watchlist, userEmail]);

  const handleToggleWatchlist = () => {
    if (!market || !userEmail) return; // Only allow if logged in

    if (isWatched) {
      removeFromWatchlist(market.id, userEmail);
      setIsWatched(false);
    } else {
      addToWatchlist(market, userEmail);
      setIsWatched(true);
    }

    // Notify parent to refresh watchlist
    onWatchlistChange?.();
  };

  if (!market) return null;

  // Prefer agent-provided title fields when available
  const marketTitle = (market as any).marketQuestion || (market as any).title || market.question || (market as any).market || market.marketSlug || market.id;

  // Agent metadata (from /agent_predictions entries)
  const agentName = (market as any).agentName || (market as any).agent || (market as any).agentId || (market as any).agent_id || '';
  const agentEmoji = (market as any).agentEmoji || (market as any).agent_emoji || '';
  // Agent logo mapping (reuse same public assets used by PerformanceChart)
  const AGENT_LOGO: Record<string, string> = {
    GROK: "/grok.png",
    GEMINI: "/GEMENI.png",
    DEEPSEEK: "/deepseek.png",
    CLAUDE: "/Claude_AI_symbol.svg",
    GPT5: "/GPT.png",
    QWEN: "/Qwen_logo.svg",
  };

  const getAgentLogoKey = (name?: string) => {
    if (!name) return undefined;
    const n = String(name).toUpperCase();
    if (n.includes('GROK')) return 'GROK';
    if (n.includes('CLAUDE')) return 'CLAUDE';
    if (n.includes('DEEPSEEK')) return 'DEEPSEEK';
    if (n.includes('GEMINI')) return 'GEMINI';
    if (n.includes('QWEN')) return 'QWEN';
    if (n.includes('GPT')) return 'GPT5';
    return undefined;
  };
  const agentLogoKey = getAgentLogoKey(agentName);
  const agentLogoSrc = agentLogoKey ? AGENT_LOGO[agentLogoKey] : undefined;

  const formatCurrency = (value?: number) => {
    // Treat only null/undefined as missing. Allow 0 values.
    if (value === undefined || value === null || !isFinite(value)) return "N/A";
    if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatPrice = (v?: number, digits = 3) => {
    if (v === undefined || v === null || !isFinite(v)) return "N/A";
    return `$${v.toFixed(digits)}`;
  };

  const formatPercent = (v?: number, digits = 1) => {
    if (v === undefined || v === null || !isFinite(v)) return "N/A";
    return `${v.toFixed(digits)}%`;
  };

  const formatChange = (v?: number, digits = 2) => {
    if (v === undefined || v === null || !isFinite(v)) return "N/A";
    const sign = v > 0 ? '+' : v < 0 ? '' : '';
    return `${sign}${v.toFixed(digits)}%`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const getTimeRemaining = (endDate?: string) => {
    if (!endDate) return "N/A";
    try {
      const end = new Date(endDate);
      const now = new Date();
      const diff = end.getTime() - now.getTime();

      if (diff < 0) return "Ended";

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    } catch {
      return "N/A";
    }
  };

  const isYes = market.position === "YES";
  // Subscribe to markets map so we can resolve market-level fields by market id
  const [marketsMap, setMarketsMap] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    const unsub = listenToMarkets((m) => {
      try {
        setMarketsMap(m || null);
      } catch (e) {
        setMarketsMap(null);
      }
    });
    return () => {
      try { if (unsub) unsub(); } catch (e) { }
    };
  }, []);

  // Resolve market entry by market id coming from the agent prediction
  const marketIdCandidate = (
    (market as any).marketId ??
    (market as any).market_id ??
    (market as any).marketIdStr ??
    (market as any).marketIdString ??
    (market as any).marketIdRaw ??
    (market as any).market
  );
  const marketIdStr = marketIdCandidate !== undefined && marketIdCandidate !== null ? String(marketIdCandidate) : undefined;
  const resolvedMarketEntry = marketsMap && marketIdStr ? (marketsMap[marketIdStr] || (marketsMap.markets && marketsMap.markets[marketIdStr])) : undefined;

  // Derive prices: prefer explicit fields on prediction, else fall back to resolved market fields
  const yesPrice = (market as any).yesPrice ?? resolvedMarketEntry?.yes_price ?? (isYes ? (market.price ?? resolvedMarketEntry?.yes_price) : (1 - (market.price ?? resolvedMarketEntry?.yes_price ?? 0)));
  const noPrice = (market as any).noPrice ?? resolvedMarketEntry?.no_price ?? (isYes ? (1 - (market.price ?? resolvedMarketEntry?.yes_price ?? 0)) : (market.price ?? resolvedMarketEntry?.no_price ?? 0));

  // Agent-provided bet fields (prefer agent data if present)
  const agentBetRaw = (market as any).bet_amount ?? (market as any).betAmount ?? (market as any).investmentUsd ?? market.volume ?? (market as any).bet;
  const agentDecision = (market as any).decision ?? market.position;
  const tryNumber = (v: any) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'number' && isFinite(v)) return v;
    const n = Number(v);
    return isFinite(n) ? n : undefined;
  };

  // Search for confidence in multiple possible agent-prediction locations
  const confidenceCandidates = [
    (market as any).confidence_pct,
    (market as any).confidencePct,
    (market as any).confidence_percent,
    (market as any).confidence,
    (market as any).confidence_pct_raw,
    (market as any).confidencePctRaw,
    // nested places commonly used
    (market as any).raw?.confidence_pct,
    (market as any).raw?.confidencePct,
    (market as any).payload?.confidence_pct,
    (market as any).payload?.confidencePct,
    (market as any).prediction?.confidence_pct,
    (market as any).agentPrediction?.confidence_pct,
    (market as any).agent?.confidence_pct,
    market.probability,
  ];

  let confidenceRaw: number | undefined = undefined;
  for (const c of confidenceCandidates) {
    const n = tryNumber(c);
    if (n !== undefined) {
      confidenceRaw = n;
      break;
    }
  }

  // Resolve common market-level fields (prefer prediction -> resolved market entry)
  const resolvedVolume24h = tryNumber(
    (market as any).volume24h ??
    (market as any).volume_24hr ??
    (market as any).volume_24h ??
    resolvedMarketEntry?.volume_24hr ??
    resolvedMarketEntry?.volume24h ??
    resolvedMarketEntry?.volume_24h ??
    resolvedMarketEntry?.volume
  );

  const resolvedTotalVolume = tryNumber(
    (market as any).volume ??
    resolvedMarketEntry?.volume ??
    resolvedMarketEntry?.volume_all_time ??
    resolvedMarketEntry?.total_volume
  );

  const resolvedVolume7d = tryNumber(
    (market as any).volume7d ??
    (market as any).volume_7d ??
    resolvedMarketEntry?.volume7d ??
    resolvedMarketEntry?.volume_7d
  );

  const resolvedEndDate = (
    (market as any).endDate ??
    (market as any).end_date ??
    resolvedMarketEntry?.end_date ??
    resolvedMarketEntry?.endDate ??
    resolvedMarketEntry?.ends_at
  );

  const resolvedCreatedAt = (
    (market as any).createdAt ??
    (market as any).created_at ??
    resolvedMarketEntry?.created_at ??
    resolvedMarketEntry?.createdAt ??
    resolvedMarketEntry?.updated_at ??
    resolvedMarketEntry?.cached_at
  );

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-secondary/50 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {(market.imageUrl || resolvedMarketEntry?.image_url || resolvedMarketEntry?.imageUrl) && (
            <img
              src={market.imageUrl ?? resolvedMarketEntry?.image_url ?? resolvedMarketEntry?.imageUrl}
              alt={marketTitle}
              className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex flex-col min-w-0">
                <div className="text-xs text-muted-foreground truncate">Market</div>
                <h2 className="text-sm font-bold text-foreground truncate">{marketTitle}</h2>
              </div>
              {agentName ? (
                <div className="ml-3 flex items-center gap-2 flex-shrink-0">
                  {agentLogoSrc ? (
                    <img src={agentLogoSrc} alt={agentName} className="w-6 h-6 rounded-full object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : agentEmoji ? (
                    <span className="text-lg leading-none">{agentEmoji}</span>
                  ) : null}
                  <span className="text-[11px] px-2 py-0.5 bg-muted text-muted-foreground rounded font-mono truncate max-w-[160px]">{agentName}</span>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {market.category && (
                <span className="text-[10px] px-1.5 py-0.5 bg-terminal-accent/20 text-terminal-accent rounded font-mono">
                  {market.category}
                </span>
              )}
              {market.subcategory && (
                <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-mono">
                  {market.subcategory}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {userEmail && (
            <button
              onClick={handleToggleWatchlist}
              className={`w-7 h-7 flex items-center justify-center border border-border hover:bg-muted rounded transition-colors flex-shrink-0 ${isWatched ? 'bg-terminal-accent/20 border-terminal-accent text-terminal-accent' : ''
                }`}
              title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
            >
              <Star className={`w-3.5 h-3.5 ${isWatched ? 'fill-terminal-accent' : ''}`} />
            </button>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center border border-border hover:bg-muted rounded transition-colors flex-shrink-0"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {/* Decision & Bet Placed (uses existing Probability/Price card layout) */}
        {!((market as any).isMarket) && (
          <div className="grid grid-cols-2 gap-2">
            <div className={`p-3 rounded-lg border-2 ${isYes
              ? 'bg-trade-yes/10 border-trade-yes/40'
              : 'bg-trade-no/10 border-trade-no/40'
              }`}>
              <div className="text-[10px] text-muted-foreground font-mono mb-1">DECISION</div>
              <div className={`text-lg font-bold ${isYes ? 'text-trade-yes' : 'text-trade-no'
                }`}>
                {String(agentDecision || market.position)}
              </div>
              <div className="text-xs text-foreground mt-0.5">
                Confidence: <span className="font-bold">{formatPercent(confidenceRaw, 1)}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-secondary/30">
              <div className="text-[10px] text-muted-foreground font-mono mb-1">BET PLACED</div>
              <div className="text-lg font-bold text-foreground">
                {formatCurrency(typeof agentBetRaw === 'number' ? agentBetRaw : Number(agentBetRaw))}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {market.change !== undefined && (
                  <span className={`flex items-center gap-1 ${market.change >= 0 ? 'text-trade-yes' : 'text-trade-no'
                    }`}>
                    {market.change >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {formatChange(market.change, 2)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Outcomes Section */}
        <div className="p-2.5 rounded-lg border border-border bg-secondary/30">
          <div className="text-[10px] text-muted-foreground font-mono mb-2">OUTCOMES & PRICES</div>

          {market.outcomes && market.outcomes.length > 0 ? (
            <div className="space-y-1.5">
              {market.outcomes.map((outcome, idx) => {
                const isSelected = market.position === outcome.name.toUpperCase() ||
                  (market.position === 'YES' && outcome.name.toUpperCase() === 'YES') ||
                  (market.position === 'NO' && outcome.name.toUpperCase() === 'NO');
                const isYesOutcome = outcome.name.toUpperCase() === 'YES';
                const isNoOutcome = outcome.name.toUpperCase() === 'NO';

                // Determine color classes
                const bgClass = isYesOutcome
                  ? (isSelected ? 'bg-trade-yes/20' : 'bg-trade-yes/5')
                  : isNoOutcome
                    ? (isSelected ? 'bg-trade-no/20' : 'bg-trade-no/5')
                    : (isSelected ? 'bg-terminal-accent/20' : 'bg-terminal-accent/5');

                const borderClass = isYesOutcome
                  ? (isSelected ? 'border-trade-yes/50' : 'border-trade-yes/20')
                  : isNoOutcome
                    ? (isSelected ? 'border-trade-no/50' : 'border-trade-no/20')
                    : (isSelected ? 'border-terminal-accent/50' : 'border-terminal-accent/20');

                const textClass = isYesOutcome
                  ? 'text-trade-yes'
                  : isNoOutcome
                    ? 'text-trade-no'
                    : 'text-terminal-accent';

                const dotClass = isYesOutcome
                  ? (isSelected ? 'bg-trade-yes' : 'bg-trade-yes/50')
                  : isNoOutcome
                    ? (isSelected ? 'bg-trade-no' : 'bg-trade-no/50')
                    : (isSelected ? 'bg-terminal-accent' : 'bg-terminal-accent/50');

                const barBgClass = isYesOutcome
                  ? 'bg-trade-yes/10'
                  : isNoOutcome
                    ? 'bg-trade-no/10'
                    : 'bg-terminal-accent/10';

                const barFillClass = isYesOutcome
                  ? 'bg-trade-yes'
                  : isNoOutcome
                    ? 'bg-trade-no'
                    : 'bg-terminal-accent';

                return (
                  <div
                    key={outcome.tokenId || idx}
                    className={`p-2 rounded-lg border-2 ${bgClass} ${borderClass}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
                        <span className={`text-[10px] font-bold ${textClass} uppercase tracking-wider truncate`}>
                          {outcome.name}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className={`text-sm font-bold ${textClass}`}>
                          {formatPrice(outcome.price, 3)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-muted-foreground">Probability</span>
                      <span className={`text-[10px] font-bold ${textClass}`}>
                        {formatPercent(outcome.probability, 1)}
                      </span>
                    </div>
                    {outcome.buyPrice !== undefined && outcome.sellPrice !== undefined && (
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>Buy: {formatPrice(outcome.buyPrice, 3)}</span>
                        <span>Sell: {formatPrice(outcome.sellPrice, 3)}</span>
                      </div>
                    )}
                    {/* Progress bar */}
                    <div className={`mt-1 h-1 ${barBgClass} rounded-full overflow-hidden`}>
                      <div
                        className={`h-full ${barFillClass} rounded-full transition-all duration-300`}
                        style={{ width: `${outcome.probability}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Summary */}
              <div className="mt-1.5 pt-1.5 border-t border-border">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground font-mono">Total Probability</span>
                  <span className="font-bold text-foreground">
                    {formatPercent(market.outcomes.reduce((sum, o) => sum + (o.probability || 0), 0), 1)}
                  </span>
                </div>
                {Math.abs(market.outcomes.reduce((sum, o) => sum + (o.probability || 0), 0) - 100) > 1 && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground italic">
                    Note: Prices may not sum to 100% due to market spread
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Fallback to YES/NO display if no outcomes array
            <div className="space-y-1.5">
              {/* YES Outcome */}
              <div className={`p-2 rounded-lg border-2 ${isYes
                ? 'bg-trade-yes/20 border-trade-yes/50'
                : 'bg-trade-yes/5 border-trade-yes/20'
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${isYes ? 'bg-trade-yes' : 'bg-trade-yes/50'
                      }`} />
                    <span className="text-[10px] font-bold text-trade-yes uppercase tracking-wider">
                      YES
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-trade-yes">
                      {formatPrice(yesPrice, 3)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Probability</span>
                  <span className="text-[10px] font-bold text-trade-yes">
                    {formatPercent(isFinite(yesPrice) ? yesPrice * 100 : undefined, 1)}
                  </span>
                </div>
                <div className="mt-1 h-1 bg-trade-yes/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-trade-yes rounded-full transition-all duration-300"
                    style={{ width: `${isFinite(yesPrice) ? yesPrice * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* NO Outcome */}
              <div className={`p-2 rounded-lg border-2 ${!isYes
                ? 'bg-trade-no/20 border-trade-no/50'
                : 'bg-trade-no/5 border-trade-no/20'
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${!isYes ? 'bg-trade-no' : 'bg-trade-no/50'
                      }`} />
                    <span className="text-[10px] font-bold text-trade-no uppercase tracking-wider">
                      NO
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-trade-no">
                      {formatPrice(noPrice, 3)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Probability</span>
                  <span className="text-[10px] font-bold text-trade-no">
                    {formatPercent(isFinite(noPrice) ? noPrice * 100 : undefined, 1)}
                  </span>
                </div>
                <div className="mt-1 h-1 bg-trade-no/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-trade-no rounded-full transition-all duration-300"
                    style={{ width: `${isFinite(noPrice) ? noPrice * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="mt-1.5 pt-1.5 border-t border-border">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground font-mono">Total Probability</span>
                  <span className="font-bold text-foreground">
                    {formatPercent(isFinite(yesPrice) && isFinite(noPrice) ? (yesPrice + noPrice) * 100 : undefined, 1)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Trading Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono mb-1.5">
              <DollarSign className="w-2.5 h-2.5" />
              VOL 24H
            </div>
            <div className="text-base font-bold text-foreground">
              {formatCurrency(resolvedVolume24h ?? resolvedTotalVolume)}
            </div>
          </div>

          <div className="p-2.5 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono mb-1.5">
              <BarChart3 className="w-2.5 h-2.5" />
              LIQUIDITY
            </div>
            <div className="text-base font-bold text-foreground">
              {formatCurrency(market.liquidity ?? resolvedMarketEntry?.liquidity ?? resolvedMarketEntry?.liquidity_amount)}
            </div>
          </div>

          <div className="p-2.5 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono mb-1.5">
              <DollarSign className="w-2.5 h-2.5" />
              TOTAL VOL
            </div>
            <div className="text-base font-bold text-foreground">
              {formatCurrency(resolvedTotalVolume)}
            </div>
          </div>
        </div>

        {/* Volume Breakdown */}
        {(resolvedVolume24h || resolvedVolume7d || resolvedTotalVolume) && (
          <div className="p-2.5 rounded-lg border border-border bg-secondary/30">
            <div className="text-[10px] text-muted-foreground font-mono mb-2">VOLUME BREAKDOWN</div>
            <div className="space-y-1.5">
              {resolvedVolume24h !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">24 Hours</span>
                  <span className="text-xs font-bold text-foreground">{formatCurrency(resolvedVolume24h)}</span>
                </div>
              )}
              {resolvedVolume7d !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">7 Days</span>
                  <span className="text-xs font-bold text-foreground">{formatCurrency(resolvedVolume7d)}</span>
                </div>
              )}
              {resolvedTotalVolume !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">All Time</span>
                  <span className="text-xs font-bold text-foreground">{formatCurrency(resolvedTotalVolume)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Market Info */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono mb-1.5">
              <Clock className="w-2.5 h-2.5" />
              END DATE
            </div>
            <div className="text-xs font-bold text-foreground">{formatDate(resolvedEndDate ?? market.endDate)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {getTimeRemaining(resolvedEndDate ?? market.endDate)} remaining
            </div>
          </div>

          <div className="p-2.5 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono mb-1.5">
              <Clock className="w-2.5 h-2.5" />
              CREATED
            </div>
            <div className="text-xs font-bold text-foreground">{formatDate(resolvedCreatedAt ?? market.createdAt)}</div>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap gap-1.5">
          {market.active && (
            <span className="px-1.5 py-0.5 text-[10px] bg-trade-yes/20 text-trade-yes rounded font-mono border border-trade-yes/40">
              ACTIVE
            </span>
          )}
          {market.closed && (
            <span className="px-1.5 py-0.5 text-[10px] bg-trade-no/20 text-trade-no rounded font-mono border border-trade-no/40">
              CLOSED
            </span>
          )}
          {market.archived && (
            <span className="px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded font-mono border border-border">
              ARCHIVED
            </span>
          )}
          {market.new && (
            <span className="px-1.5 py-0.5 text-[10px] bg-terminal-accent/20 text-terminal-accent rounded font-mono border border-terminal-accent/40">
              NEW
            </span>
          )}
          {market.featured && (
            <span className="px-1.5 py-0.5 text-[10px] bg-terminal-accent/20 text-terminal-accent rounded font-mono border border-terminal-accent/40">
              FEATURED
            </span>
          )}
        </div>

        {/* Tags */}
        {market.tags && market.tags.length > 0 && (
          <div className="p-2.5 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono mb-1.5">
              <Tag className="w-2.5 h-2.5" />
              TAGS
            </div>
            <div className="flex flex-wrap gap-1.5">
              {market.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded font-mono border border-border"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {market.reasoning && (
          <div className="p-2.5 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono mb-1.5">
              <Info className="w-2.5 h-2.5" />
              DESCRIPTION
            </div>
            <p className="text-xs text-foreground leading-relaxed">{market.reasoning}</p>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="p-2.5 border-t border-border bg-secondary/50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="text-[10px] text-muted-foreground font-mono truncate">ID: {market.id}</div>
          {/* Agent unrealized P&L */}
          {(() => {
            try {
              const entryOdds = (market as any).entry_odds || (market as any).entryOdds || (market as any).entry || undefined;
              const entryPriceRaw = (agentDecision === 'YES') ? (entryOdds?.yes_price ?? entryOdds?.yesPrice) : (entryOdds?.no_price ?? entryOdds?.noPrice);
              const entryPrice = tryNumber(entryPriceRaw);
              const currentPrice = tryNumber((agentDecision === 'YES') ? yesPrice : noPrice);
              const betAmt = tryNumber(typeof agentBetRaw === 'number' ? agentBetRaw : Number(agentBetRaw));
              if (entryPrice === undefined || currentPrice === undefined || betAmt === undefined || entryPrice === 0) {
                return null;
              }
              const priceChange = currentPrice - entryPrice;
              const unrealizedPnl = (priceChange / entryPrice) * betAmt; // dollars
              const profitPct = (priceChange / entryPrice) * 100; // percent
              const positive = profitPct > 0;
              return (
                <div className={`text-xs font-medium ${positive ? 'text-trade-yes' : 'text-trade-no'}`}>
                  P&L: <span className="font-bold">{profitPct.toFixed(2)}%</span> ({formatCurrency(unrealizedPnl)})
                </div>
              );
            } catch (e) {
              return null;
            }
          })()}
        </div>
        <a
          href={
            market.marketSlug
              ? `https://polymarket.com/event/${market.marketSlug}`
              : market.conditionId
                ? `https://polymarket.com/condition/${market.conditionId}`
                : `https://polymarket.com/search?q=${encodeURIComponent(String(marketTitle))}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-terminal-accent text-black rounded hover:bg-terminal-accent/90 transition-colors text-xs font-semibold flex-shrink-0"
        >
          <ExternalLink className="w-3 h-3" />
          View on Polymarket
        </a>
      </div>
    </div>
  );
};
