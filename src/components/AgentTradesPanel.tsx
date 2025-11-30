// Removed framer-motion - no animations wanted
import { Button } from "@/components/ui/button";
import { ExternalLink, TrendingDown, TrendingUp, X } from "lucide-react";
import { MouseEvent, useEffect, useState } from "react";

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
  predictionId?: string;
}

interface AgentTradesPanelProps {
  agentId: string;
  agentName: string;
  agentEmoji: string;
  trades: Trade[];
  onClose: () => void;
  onTradeClick?: (market: string, predictionId?: string) => void;
}

const getAgentLogo = (agentId: string): string => {
  if (agentId === 'grok') return "/grok.png";
  if (agentId === 'gpt5') return "/GPT.png";
  if (agentId === 'gemini') return "/GEMENI.png";
  if (agentId === 'deepseek') return "/deepseek.png";
  if (agentId === 'claude') return "/Claude_AI_symbol.svg";
  if (agentId === 'qwen') return "/Qwen_logo.svg";
  return "/placeholder.svg";
};

const formatTimeAgo = (date: Date) => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const AgentTradesPanel = ({ agentId, agentName, agentEmoji, trades, onClose, onTradeClick }: AgentTradesPanelProps) => {
  console.log(`[AgentTradesPanel] Rendering for ${agentId}:`, {
    tradesCount: trades.length,
    trades: trades,
    agentName
  });

  const sortedTrades = [...trades].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const openTrades = sortedTrades.filter(t => t.status === "OPEN");
  const closedTrades = sortedTrades.filter(t => t.status === "CLOSED");

  console.log(`[AgentTradesPanel] ${agentId} - Open: ${openTrades.length}, Closed: ${closedTrades.length}`);
  const totalPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(trades[0]?.id ?? null);

  useEffect(() => {
    if (trades.length === 0) {
      setExpandedTradeId(null);
      return;
    }
    setExpandedTradeId(prev => {
      if (!prev || !trades.some(t => t.id === prev)) {
        return trades[0].id;
      }
      return prev;
    });
  }, [trades]);

  const handleTradeSelect = (trade: Trade, event?: MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (onTradeClick) {
      onTradeClick(trade.market, trade.predictionId);
    }
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mira-open-market', { detail: { marketId: trade.predictionId, marketName: trade.market } }));
      }
    } catch (err) { }
  };

  const renderTradeCard = (trade: Trade, section: "OPEN" | "CLOSED") => {
    const isExpanded = expandedTradeId === trade.id;
    const decisionPill = (
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${trade.decision === "YES"
        ? "bg-trade-yes/15 text-trade-yes border border-trade-yes/30"
        : "bg-trade-no/15 text-trade-no border border-trade-no/30"
        }`}>
        {trade.decision === "YES" ? (
          <TrendingUp className="w-2.5 h-2.5" />
        ) : (
          <TrendingDown className="w-2.5 h-2.5" />
        )}
        {trade.decision}
      </div>
    );

    return (
      <div
        key={trade.id}
        onClick={() => setExpandedTradeId(prev => prev === trade.id ? null : trade.id)}
        className={`border rounded-2xl px-3 py-2.5 cursor-pointer ${isExpanded
          ? "border-terminal-accent/40 bg-bg-elevated shadow-glow"
          : "border-border bg-bg-card/80 hover:border-terminal-accent/40"
          }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-[0.08em]" style={{ fontWeight: 600 }}>
              {section === "OPEN" ? "Open Position" : "Closed Position"}
            </div>
            <div className="text-[13px] font-mono text-foreground truncate" style={{ fontWeight: 600 }}>
              {trade.market}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
            {formatTimeAgo(trade.timestamp)}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {decisionPill}
          <div className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-border bg-muted/40">
            {trade.confidence}% CONF
          </div>
          {section === "CLOSED" && typeof trade.pnl === 'number' && (
            <div className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${trade.pnl >= 0
              ? "bg-trade-yes/15 text-trade-yes border border-trade-yes/30"
              : "bg-trade-no/15 text-trade-no border border-trade-no/30"
              }`}>
              {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
            </div>
          )}
          {trade.investmentUsd !== undefined && trade.investmentUsd > 0 && (
            <div className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-border text-muted-foreground">
              ${trade.investmentUsd.toFixed(0)}
            </div>
          )}
          {typeof trade.entryProbability === 'number' && section === "OPEN" && (
            <div className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-border text-muted-foreground">
              Entry ${(trade.entryProbability > 1 ? trade.entryProbability / 100 : trade.entryProbability).toFixed(2)}
            </div>
          )}
        </div>

        {isExpanded && (
          <div
            key={`${trade.id}-details`}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              {trade.summaryDecision && (
                <div className="text-[12px] text-foreground leading-relaxed font-mono" style={{ fontWeight: 500 }}>
                  {trade.summaryDecision}
                </div>
              )}
              {trade.reasoningBullets && trade.reasoningBullets.length > 0 ? (
                <ul className="text-[12px] text-text-secondary leading-relaxed space-y-1 pl-4 list-disc">
                  {trade.reasoningBullets.map((reason, idx) => (
                    <li key={`${trade.id}-reason-${idx}`}>{reason}</li>
                  ))}
                </ul>
              ) : trade.reasoning ? (
                <div className="text-[12px] text-text-secondary leading-relaxed">
                  {trade.reasoning}
                </div>
              ) : null}
              {trade.webResearchSummary && trade.webResearchSummary.length > 0 && (
                <div className="text-[11px] text-muted-foreground font-mono border border-terminal-accent/30 rounded-lg p-2 bg-terminal-accent/5">
                  <div className="uppercase tracking-[0.1em] mb-1 text-terminal-accent">Web Research</div>
                  {trade.webResearchSummary.slice(0, 2).map((source, idx) => (
                    <div key={`${trade.id}-web-${idx}`} className="text-[11px] text-foreground mb-1">
                      <span className="font-semibold text-terminal-accent">{source.source}:</span> {source.snippet || source.title}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={(event) => handleTradeSelect(trade, event)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono rounded-lg border border-terminal-accent/40 text-terminal-accent hover:bg-terminal-accent/10 transition-colors"
                >
                  View Market →
                </button>
                {(trade.marketSlug || trade.conditionId) && (
                  <a
                    href={
                      // Use the search URL which is more reliable than direct event slug paths
                      trade.marketSlug
                        ? `https://polymarket.com/search?q=${encodeURIComponent(String(trade.market))}`
                        : `https://polymarket.com/condition/${trade.conditionId}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-terminal-accent/10 text-terminal-accent rounded hover:bg-terminal-accent/20 transition-colors text-[11px] font-mono"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View Market
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="h-12 px-4 border-b border-border flex items-center justify-between bg-bg-elevated flex-shrink-0">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <img
            src={getAgentLogo(agentId)}
            alt={agentName}
            className="w-6 h-6 object-contain flex-shrink-0 rounded-full"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/placeholder.svg";
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-mono text-terminal-accent leading-none" style={{ fontWeight: 600 }}>
              {agentName} TRADES
            </div>
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
              {trades.length} total • {openTrades.length} open
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 w-7 p-0 hover:bg-muted rounded-full flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="px-4 py-2.5 border-b border-border bg-bg-elevated flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground font-mono uppercase">Total PnL</span>
            <span className={`text-[14px] font-mono ${totalPnl >= 0 ? 'text-trade-yes' : 'text-trade-no'}`} style={{ fontWeight: 600 }}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </span>
          </div>
          <div className="w-px h-6 bg-border" />
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground font-mono uppercase">Win Rate</span>
            <span className="text-[14px] font-mono text-terminal-accent" style={{ fontWeight: 600 }}>
              {closedTrades.length > 0
                ? `${Math.round((closedTrades.filter(t => (t.pnl || 0) > 0).length / closedTrades.length) * 100)}%`
                : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div className="p-3 space-y-3">
          {openTrades.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] text-muted-foreground font-mono uppercase px-1" style={{ fontWeight: 600 }}>
                Open Positions ({openTrades.length})
              </div>
              {openTrades.map(trade => renderTradeCard(trade, "OPEN"))}
            </div>
          )}

          {closedTrades.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] text-muted-foreground font-mono uppercase px-1 mt-1" style={{ fontWeight: 600 }}>
                Closed Positions ({closedTrades.length})
              </div>
              {closedTrades.map(trade => renderTradeCard(trade, "CLOSED"))}
            </div>
          )}

          {trades.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="text-[13px] font-mono mb-1">No trades yet</div>
              <div className="text-[11px] font-mono">This agent hasn't made any trades</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
