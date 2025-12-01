import { listenToAgentBalances, listenToAgentPredictions } from '@/lib/firebase/listeners';
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface AgentPosition {
  id: string;
  name: string;
  emoji: string;
  pnl: number;
  openMarkets: number;
  lastTrade: string;
  isActive: boolean;
  pnlPerc?: number;
}

interface ActivePositionsProps {
  agents?: AgentPosition[]; // optional: if not provided, component will subscribe to Firebase
  selectedAgent: string | null;
  onAgentClick: (agentId: string) => void;
}

type MetricView = 'overview' | 'performance' | 'prediction' | 'behavior';

export const ActivePositions = ({ agents, selectedAgent, onAgentClick }: ActivePositionsProps) => {
  const [metricView, setMetricView] = useState<MetricView>('overview');

  // If no `agents` prop is provided, subscribe to agent predictions and derive lightweight agent list
  const [internalAgents, setInternalAgents] = useState<AgentPosition[]>([]);
  const [agentPnlPercMap, setAgentPnlPercMap] = useState<Record<string, number>>({});
  const [footerTotalPercent, setFooterTotalPercent] = useState<number | null>(null);
  const [footerTotalPnL, setFooterTotalPnL] = useState<number | null>(null);

  useEffect(() => {
    // Don't subscribe when parent supplies agents for the lightweight agent list mapping
    // but still compute overall totals from agent_predictions regardless of `agents` prop.
    if (agents && agents.length > 0) {
      // we still want to compute footer totals below, so fall through to set up that listener
    }

    let isMounted = true;
    let unsub: (() => void) | null = null;
    try {
      unsub = listenToAgentPredictions((items: any[]) => {
        if (!isMounted) return;
        try {
          const map = new Map<string, { id: string; name: string; emoji: string; openMarkets: Set<string>; lastTrade: number; pnl: number; isActive: boolean }>();
          (items || []).forEach(it => {
            const agentId = String(it.agentId || it.agent || it.agentName || 'unknown').toLowerCase();
            const agentName = it.agentName || it.agent || agentId;
            const emoji = it.agentEmoji || it.agent_emoji || '🤖';
            const m = map.get(agentId) || { id: agentId, name: agentName, emoji, openMarkets: new Set<string>(), lastTrade: 0, pnl: 0, isActive: false };
            const marketKey = (it.marketId || it.predictionId || it.market || it.marketSlug || it.conditionId || '').toString();
            if (marketKey) m.openMarkets.add(marketKey);
            // Use createdAt / timestamp as lastTrade indicator when available
            const t = (it.createdAt && Date.parse(it.createdAt)) || (it.timestamp && Date.parse(it.timestamp)) || Date.now();
            if (t && t > (m.lastTrade || 0)) m.lastTrade = t;
            m.isActive = true; // mark active when we receive a recent prediction
            map.set(agentId, m);
          });

          const out: AgentPosition[] = Array.from(map.values()).map(v => ({
            id: v.id,
            name: v.name,
            emoji: v.emoji,
            pnl: v.pnl || 0,
            openMarkets: v.openMarkets.size,
            lastTrade: new Date(v.lastTrade).toISOString(),
            isActive: v.isActive,
          }));

          // If no items, keep empty list
          setInternalAgents(out);
        } catch (e) {
          // ignore mapping errors
        }
      });
    } catch (e) {
      // failed to subscribe - leave internalAgents empty
    }

    return () => {
      isMounted = false;
      if (unsub) try { unsub(); } catch (_) { }
    };
  }, [agents]);

  // Subscribe to agent_predictions to compute global total PnL and total wagered (same logic as footer)
  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      unsub = listenToAgentPredictions((preds: any[]) => {
        try {
          let totalPnL = 0;
          let totalWagered = 0;

          (preds || []).forEach((p: any, idx: number) => {
            const bet = Number(p.bet_amount ?? p.betAmount ?? p.investmentUsd ?? p.investment ?? 0) || 0;

            const entryOdds = p.entry_odds || p.entryOdds || {};
            const currentOdds = p.current_market_odds || p.current_odds || p.currentMarketOdds || p.currentOdds || {};

            const entryPrice = p.prediction === 'YES'
              ? (entryOdds?.yes_price ?? entryOdds?.yesPrice ?? entryOdds?.yes ?? 0)
              : (entryOdds?.no_price ?? entryOdds?.noPrice ?? entryOdds?.no ?? 0);

            const currentPrice = p.prediction === 'YES'
              ? (currentOdds?.yes_price ?? currentOdds?.yesPrice ?? currentOdds?.yes ?? entryPrice)
              : (currentOdds?.no_price ?? currentOdds?.noPrice ?? currentOdds?.no ?? entryPrice);

            if (!entryPrice || bet <= 0) return;

            const priceChange = currentPrice - entryPrice;
            const unrealized = (priceChange / entryPrice) * bet;

            totalPnL += unrealized;
            totalWagered += bet;
          });

          const percent = totalWagered > 0 ? (totalPnL / totalWagered) * 100 : 0;
          const rounded = Math.round(percent * 10) / 10;

          setFooterTotalPercent(rounded);
          setFooterTotalPnL(totalPnL);
        } catch (e) {
          // ignore per-pred compute errors
        }
      });
    } catch (e) {
      // ignore listener setup failures
    }

    return () => {
      if (unsub) try { unsub(); } catch (_) { }
    };
  }, []);

  // Subscribe to agent balances to pick up `current_pnl_perc` for each agent
  useEffect(() => {
    let isMounted = true;
    const unsub = listenToAgentBalances((items: any[]) => {
      if (!isMounted) return;
      try {
        const map: Record<string, number> = {};
        const normalize = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        (items || []).forEach(it => {
          const agentIdRaw = it.agentId || it.agent_id || it.agent || '';
          const bal = it.balance || {};
          const v = Number(bal.current_pnl_perc ?? bal.current_pnl_percent ?? bal.currentPnlPerc ?? 0) || 0;

          // primary normalized key (keep letters+digits)
          const keyFull = normalize(agentIdRaw);
          map[keyFull] = v;

          // derive base aliases:
          // 1) remove trailing 'v' + digits (e.g., deepseekv3 -> deepseek)
          // 2) then remove any remaining trailing digits (e.g., gpt5 -> gpt)
          let keyBase = keyFull.replace(/v\d+$/g, '').replace(/\d+$/g, '');
          if (keyBase && keyBase !== keyFull) map[keyBase] = v;
        });

        setAgentPnlPercMap(map);
      } catch (e) {
        // ignore
      }
    });
    return () => { isMounted = false; if (unsub) try { unsub(); } catch (_) { } };
  }, []);

  const displayAgents = (agents && agents.length > 0) ? agents : internalAgents;

  // Sum of agent PnL percentages from balances (preferred) or fallback to agent.pnl
  const normalizeKey = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const totalPnlPercFromAgents = displayAgents.reduce((sum, agent) => {
    const key = normalizeKey(agent.id);
    const v = (agentPnlPercMap && agentPnlPercMap[key] != null) ? Number(agentPnlPercMap[key]) : Number(agent.pnl || 0);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
  const roundedTotalPnlPercFromAgents = Math.round(totalPnlPercFromAgents * 10) / 10; // one decimal place

  // Calculate metrics
  const totalPnL = displayAgents.reduce((sum, agent) => sum + (agent.pnl || 0), 0);
  const totalMarkets = displayAgents.reduce((sum, agent) => sum + (agent.openMarkets || 0), 0);
  const activeAgents = displayAgents.filter(agent => agent.isActive).length;
  const profitableAgents = displayAgents.filter(agent => (agent.pnl || 0) > 0).length;
  const winRate = displayAgents.length > 0 ? (profitableAgents / displayAgents.length) * 100 : 0;

  // Advanced metrics (mock data - would come from real calculations)
  const realizedPnL = totalPnL * 0.75; // 75% realized
  const unrealizedPnL = totalPnL * 0.25; // 25% unrealized
  const maxDrawdown = -18.4;
  const sharpeRatio = 1.8;
  const avgHoldTime = 3.4;
  const calibrationScore = 0.92;
  const brierScore = 0.17;
  const avgEdge = 6.3;
  const tradeFrequency = 37;
  const divergenceIndex = 32;
  const consensusLevel = 18;
  const capitalUtilization = 74;

  const cycleMetricView = () => {
    const views: MetricView[] = ['overview', 'performance', 'prediction', 'behavior'];
    const currentIndex = views.indexOf(metricView);
    const nextIndex = (currentIndex + 1) % views.length;
    setMetricView(views[nextIndex]);
  };

  const renderMetrics = () => {
    switch (metricView) {
      case 'overview':
        return (
          <>
            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                TOTAL P&L
              </div>
              <div className={`text-lg font-bold ${roundedTotalPnlPercFromAgents >= 0 ? 'text-trade-yes' : 'text-trade-no'}`} style={{ fontWeight: 700 }}>
                {(roundedTotalPnlPercFromAgents >= 0 ? '+' : '') + roundedTotalPnlPercFromAgents.toFixed(1) + '%'}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                MARKETS
              </div>
              <div className="text-lg font-bold text-foreground" style={{ fontWeight: 700 }}>
                {totalMarkets}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                WIN RATE
              </div>
              <div className="text-lg font-bold text-terminal-accent" style={{ fontWeight: 700 }}>
                {winRate.toFixed(0)}%
              </div>
            </div>
          </>
        );

      case 'performance':
        return (
          <>
            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                REALIZED
              </div>
              <div className={`text-lg font-bold ${realizedPnL >= 0 ? 'text-trade-yes' : 'text-trade-no'}`} style={{ fontWeight: 700 }}>
                {realizedPnL >= 0 ? '+' : ''}{realizedPnL.toFixed(1)}%
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                DRAWDOWN
              </div>
              <div className="text-lg font-bold text-trade-no" style={{ fontWeight: 700 }}>
                {maxDrawdown.toFixed(1)}%
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                R/V RATIO
              </div>
              <div className="text-lg font-bold text-terminal-accent" style={{ fontWeight: 700 }}>
                {sharpeRatio.toFixed(1)}
              </div>
            </div>
          </>
        );

      case 'prediction':
        return (
          <>
            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                CALIBRATION
              </div>
              <div className="text-lg font-bold text-trade-yes" style={{ fontWeight: 700 }}>
                {calibrationScore.toFixed(2)}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                BRIER SCORE
              </div>
              <div className="text-lg font-bold text-terminal-accent" style={{ fontWeight: 700 }}>
                {brierScore.toFixed(2)}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                AVG EDGE
              </div>
              <div className="text-lg font-bold text-trade-yes" style={{ fontWeight: 700 }}>
                +{avgEdge.toFixed(1)} pts
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                WIN RATE
              </div>
              <div className="text-lg font-bold text-foreground" style={{ fontWeight: 700 }}>
                {winRate.toFixed(0)}%
              </div>
            </div>
          </>
        );

      case 'behavior':
        return (
          <>
            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                TRADES/24H
              </div>
              <div className="text-lg font-bold text-foreground" style={{ fontWeight: 700 }}>
                {tradeFrequency}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                DIVERGENCE
              </div>
              <div className="text-lg font-bold text-terminal-accent" style={{ fontWeight: 700 }}>
                {divergenceIndex}%
              </div>
            </div>

            <div className="flex flex-col">
              <div className="text-[9px] text-text-muted font-mono uppercase tracking-[0.08em] mb-0.5" style={{ fontWeight: 600 }}>
                CAPITAL
              </div>
              <div className="text-lg font-bold text-trade-yes" style={{ fontWeight: 700 }}>
                {capitalUtilization}%
              </div>
            </div>
          </>
        );
    }
  };

  const getViewLabel = () => {
    switch (metricView) {
      case 'overview': return 'OVERVIEW';
      case 'performance': return 'PERFORMANCE & RISK';
      case 'prediction': return 'PREDICTION QUALITY';
      case 'behavior': return 'AGENT BEHAVIOR';
    }
  };

  return (
    <div className="h-16 bg-bg-card border-t border-border">
      <div className="flex items-center h-full px-2 gap-2">
        {/* AI Agents Section */}
        <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
          {displayAgents.map((agent, index) => (
            <motion.button
              key={agent.id}
              onClick={() => onAgentClick(agent.id)}
              className={`flex-shrink-0 w-[200px] h-12 p-2.5 flex items-center gap-2.5 border rounded-full transition-colors ${selectedAgent === agent.id
                ? 'border-terminal-accent bg-muted'
                : 'border-border bg-bg-elevated hover:bg-muted'
                }`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Agent Icon with Status */}
              <div className="relative">
                <img
                  src={`/${agent.id === 'grok' ? 'grok.png' : agent.id === 'gpt5' ? 'GPT.png' : agent.id === 'gemini' ? 'GEMENI.png' : agent.id === 'deepseek' ? 'deepseek.png' : agent.id === 'claude' ? 'Claude_AI_symbol.svg' : agent.id === 'qwen' ? 'Qwen_logo.svg' : 'placeholder.svg'}`}
                  alt={agent.name}
                  className={`object-contain ${agent.id === 'gemini' ? 'w-14 h-14' : 'w-10 h-10'}`}
                />
                {agent.isActive && (
                  <motion.div
                    className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-trade-yes border-2 border-bg-elevated"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono text-foreground" style={{ fontWeight: 500 }}>{agent.name}</span>
                  </div>
                  {/* Show agent PnL percent from agent_balances when available, fallback to agent.pnl */}
                  {(() => {
                    const normalize = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const key = normalize(agent.id);
                    const pct = (agentPnlPercMap[key] != null) ? agentPnlPercMap[key] : (agent.pnl ?? 0);
                    const isPos = pct >= 0;
                    return (
                      <span className={`text-sm ${isPos ? 'text-trade-yes' : 'text-trade-no'}`} style={{ fontWeight: 600 }}>
                        {isPos ? '+' : ''}{Number(pct).toFixed(2)}%
                      </span>
                    );
                  })()}
                </div>
                {/* status line removed per request */}
              </div>
            </motion.button>
          ))}
        </div>

        {/* Vertical Separator */}
        <div className="h-8 w-px bg-border flex-shrink-0" />

        {/* Metrics Section - Clickable */}
        <motion.button
          onClick={cycleMetricView}
          className="flex items-center gap-2 flex-shrink-0 px-1.5 py-1.5 hover:bg-muted/30 transition-colors rounded-xl border border-transparent hover:border-border group"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          {renderMetrics()}

          {/* View Indicator */}
          <div className="ml-1 flex flex-col items-center gap-0.5">
            <div className="flex gap-0.5">
              {(['overview', 'performance', 'prediction', 'behavior'] as MetricView[]).map((view) => (
                <div
                  key={view}
                  className={`w-1 h-1 rounded-full transition-all ${view === metricView ? 'bg-terminal-accent' : 'bg-border'
                    }`}
                />
              ))}
            </div>
          </div>
        </motion.button>
      </div>
    </div>
  );
};
