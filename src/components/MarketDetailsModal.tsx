import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Clock, DollarSign, ExternalLink, Info, Tag, TrendingDown, TrendingUp, X } from "lucide-react";
import { PredictionNodeData } from "./PredictionTypes";

interface Outcome {
  tokenId: string;
  name: string;
  price: number;
  buyPrice?: number;
  sellPrice?: number;
  probability: number;
}

interface MarketDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
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
}

export const MarketDetailsModal = ({ isOpen, onClose, market }: MarketDetailsModalProps) => {
  if (!market) return null;

  const formatCurrency = (value?: number) => {
    if (!value) return "N/A";
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
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
  const yesPrice = market.yesPrice ?? (isYes ? market.price : 1 - market.price);
  const noPrice = market.noPrice ?? (isYes ? 1 - market.price : market.price);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-bg-elevated border border-border rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/50">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {market.imageUrl && (
                    <img
                      src={market.imageUrl}
                      alt={market.question}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-foreground truncate">{market.question}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      {market.category && (
                        <span className="text-xs px-2 py-0.5 bg-terminal-accent/20 text-terminal-accent rounded font-mono">
                          {market.category}
                        </span>
                      )}
                      {market.subcategory && (
                        <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded font-mono">
                          {market.subcategory}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center border border-border hover:bg-muted rounded transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Position & Probability */}
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 rounded-lg border-2 ${isYes
                    ? 'bg-trade-yes/10 border-trade-yes/40'
                    : 'bg-trade-no/10 border-trade-no/40'
                    }`}>
                    <div className="text-xs text-muted-foreground font-mono mb-1">POSITION</div>
                    <div className={`text-2xl font-bold ${isYes ? 'text-trade-yes' : 'text-trade-no'
                      }`}>
                      {market.position}
                    </div>
                    <div className="text-sm text-foreground mt-1">
                      Probability: <span className="font-bold">{market.probability}%</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-border bg-secondary/30">
                    <div className="text-xs text-muted-foreground font-mono mb-1">PRICE</div>
                    <div className="text-2xl font-bold text-foreground">
                      ${market.price.toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {market.change !== undefined && (
                        <span className={`flex items-center gap-1 ${market.change >= 0 ? 'text-trade-yes' : 'text-trade-no'
                          }`}>
                          {market.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {market.change >= 0 ? '+' : ''}{market.change.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Outcomes Section */}
                <div className="p-3 rounded-lg border border-border bg-secondary/30">
                  <div className="text-xs text-muted-foreground font-mono mb-2">OUTCOMES & PRICES</div>

                  {market.outcomes && market.outcomes.length > 0 ? (
                    <div className="space-y-2">
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
                            className={`p-2.5 rounded-lg border-2 ${bgClass} ${borderClass}`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                                <span className={`text-xs font-bold ${textClass} uppercase tracking-wider truncate`}>
                                  {outcome.name}
                                </span>
                              </div>
                              <div className="text-right flex-shrink-0 ml-2">
                                <div className={`text-base font-bold ${textClass}`}>
                                  ${outcome.price.toFixed(3)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">Probability</span>
                              <span className={`text-xs font-bold ${textClass}`}>
                                {outcome.probability.toFixed(1)}%
                              </span>
                            </div>
                            {outcome.buyPrice !== undefined && outcome.sellPrice !== undefined && (
                              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                <span>Buy: ${outcome.buyPrice.toFixed(3)}</span>
                                <span>Sell: ${outcome.sellPrice.toFixed(3)}</span>
                              </div>
                            )}
                            {/* Progress bar */}
                            <div className={`mt-1.5 h-1.5 ${barBgClass} rounded-full overflow-hidden`}>
                              <div
                                className={`h-full ${barFillClass} rounded-full transition-all duration-300`}
                                style={{ width: `${outcome.probability}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}

                      {/* Summary */}
                      <div className="mt-2 pt-2 border-t border-border">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground font-mono">Total Probability</span>
                          <span className="font-bold text-foreground">
                            {market.outcomes.reduce((sum, o) => sum + o.probability, 0).toFixed(1)}%
                          </span>
                        </div>
                        {Math.abs(market.outcomes.reduce((sum, o) => sum + o.probability, 0) - 100) > 1 && (
                          <div className="mt-0.5 text-xs text-muted-foreground italic">
                            Note: Prices may not sum to 100% due to market spread
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Fallback to YES/NO display if no outcomes array
                    <div className="space-y-2">
                      {/* YES Outcome */}
                      <div className={`p-2.5 rounded-lg border-2 ${isYes
                        ? 'bg-trade-yes/20 border-trade-yes/50'
                        : 'bg-trade-yes/5 border-trade-yes/20'
                        }`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${isYes ? 'bg-trade-yes' : 'bg-trade-yes/50'
                              }`} />
                            <span className="text-xs font-bold text-trade-yes uppercase tracking-wider">
                              YES Outcome
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-base font-bold text-trade-yes">
                              ${yesPrice.toFixed(3)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Probability</span>
                          <span className="text-xs font-bold text-trade-yes">
                            {(yesPrice * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 bg-trade-yes/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-trade-yes rounded-full transition-all duration-300"
                            style={{ width: `${yesPrice * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* NO Outcome */}
                      <div className={`p-2.5 rounded-lg border-2 ${!isYes
                        ? 'bg-trade-no/20 border-trade-no/50'
                        : 'bg-trade-no/5 border-trade-no/20'
                        }`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${!isYes ? 'bg-trade-no' : 'bg-trade-no/50'
                              }`} />
                            <span className="text-xs font-bold text-trade-no uppercase tracking-wider">
                              NO Outcome
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-base font-bold text-trade-no">
                              ${noPrice.toFixed(3)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Probability</span>
                          <span className="text-xs font-bold text-trade-no">
                            {(noPrice * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 bg-trade-no/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-trade-no rounded-full transition-all duration-300"
                            style={{ width: `${noPrice * 100}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-border">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground font-mono">Total Probability</span>
                          <span className="font-bold text-foreground">
                            {((yesPrice + noPrice) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Trading Metrics */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
                      <DollarSign className="w-3 h-3" />
                      VOLUME 24H
                    </div>
                    <div className="text-xl font-bold text-foreground">
                      {formatCurrency(market.volume24h || market.volume)}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
                      <BarChart3 className="w-3 h-3" />
                      LIQUIDITY
                    </div>
                    <div className="text-xl font-bold text-foreground">
                      {formatCurrency(market.liquidity)}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
                      <DollarSign className="w-3 h-3" />
                      TOTAL VOLUME
                    </div>
                    <div className="text-xl font-bold text-foreground">
                      {formatCurrency(market.volume)}
                    </div>
                  </div>
                </div>

                {/* Volume Breakdown */}
                {(market.volume24h || market.volume7d) && (
                  <div className="p-4 rounded-lg border border-border bg-secondary/30">
                    <div className="text-xs text-muted-foreground font-mono mb-3">VOLUME BREAKDOWN</div>
                    <div className="space-y-2">
                      {market.volume24h && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">24 Hours</span>
                          <span className="text-sm font-bold text-foreground">{formatCurrency(market.volume24h)}</span>
                        </div>
                      )}
                      {market.volume7d && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">7 Days</span>
                          <span className="text-sm font-bold text-foreground">{formatCurrency(market.volume7d)}</span>
                        </div>
                      )}
                      {market.volume && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">All Time</span>
                          <span className="text-sm font-bold text-foreground">{formatCurrency(market.volume)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Market Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
                      <Clock className="w-3 h-3" />
                      END DATE
                    </div>
                    <div className="text-sm font-bold text-foreground">{formatDate(market.endDate)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {getTimeRemaining(market.endDate)} remaining
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
                      <Clock className="w-3 h-3" />
                      CREATED
                    </div>
                    <div className="text-sm font-bold text-foreground">{formatDate(market.createdAt)}</div>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap gap-2">
                  {market.active && (
                    <span className="px-2 py-1 text-xs bg-trade-yes/20 text-trade-yes rounded font-mono border border-trade-yes/40">
                      ACTIVE
                    </span>
                  )}
                  {market.closed && (
                    <span className="px-2 py-1 text-xs bg-trade-no/20 text-trade-no rounded font-mono border border-trade-no/40">
                      CLOSED
                    </span>
                  )}
                  {market.archived && (
                    <span className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded font-mono border border-border">
                      ARCHIVED
                    </span>
                  )}
                  {market.new && (
                    <span className="px-2 py-1 text-xs bg-terminal-accent/20 text-terminal-accent rounded font-mono border border-terminal-accent/40">
                      NEW
                    </span>
                  )}
                  {market.featured && (
                    <span className="px-2 py-1 text-xs bg-terminal-accent/20 text-terminal-accent rounded font-mono border border-terminal-accent/40">
                      FEATURED
                    </span>
                  )}
                </div>

                {/* Tags */}
                {market.tags && market.tags.length > 0 && (
                  <div className="p-4 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
                      <Tag className="w-3 h-3" />
                      TAGS
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {market.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded font-mono border border-border"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                {market.reasoning && (
                  <div className="p-4 rounded-lg border border-border bg-secondary/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono mb-2">
                      <Info className="w-3 h-3" />
                      DESCRIPTION
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{market.reasoning}</p>
                  </div>
                )}

                {/* Agent Info */}
                <div className="p-4 rounded-lg border border-border bg-secondary/30">
                  <div className="text-xs text-muted-foreground font-mono mb-2">AGENT</div>
                  <div className="flex items-center gap-2">
                    <img
                      src={((): string => {
                        const agentUpper = market.agentName.toUpperCase();
                        if (agentUpper.includes("GROK")) return "/grok.png";
                        if (agentUpper.includes("GEMINI")) return "/GEMENI.png";
                        if (agentUpper.includes("DEEPSEEK")) return "/deepseek.png";
                        if (agentUpper.includes("CLAUDE")) return "/Claude_AI_symbol.svg";
                        if (agentUpper.includes("GPT") || agentUpper.includes("OPENAI")) return "/GPT.png";
                        if (agentUpper.includes("QWEN")) return "/Qwen_logo.svg";
                        return "/placeholder.svg";
                      })()}
                      alt={market.agentName}
                      className="w-6 h-6 object-contain rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholder.svg";
                      }}
                    />
                    <span className="text-sm font-bold text-foreground">{market.agentName}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-border bg-secondary/50 flex items-center justify-between">
                <div className="text-xs text-muted-foreground font-mono">
                  Market ID: {market.id}
                </div>
                <a
                  href={
                    // Prefer search query — more reliable than direct event slug paths
                    market.marketSlug
                      ? `https://polymarket.com/search?q=${encodeURIComponent(market.question)}`
                      : market.conditionId
                        ? `https://polymarket.com/condition/${market.conditionId}`
                        : `https://polymarket.com/search?q=${encodeURIComponent(market.question)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-terminal-accent text-black rounded hover:bg-terminal-accent/90 transition-colors text-sm font-semibold"
                >
                  <ExternalLink className="w-4 h-4" />
                  View on Polymarket
                </a>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

