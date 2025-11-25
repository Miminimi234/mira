import { motion } from "framer-motion";
import { ArrowUpDown, TrendingDown, TrendingUp, X } from "lucide-react";
import { useState } from "react";

export interface TradeHistory {
  id: string;
  question: string;
  position: "YES" | "NO";
  buyPrice: number;
  currentPrice: number;
  profitLoss: number;
  timestamp: string;
  confidence: number;
}

interface TradeDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  trades: TradeHistory[];
}

export const TradeDashboard = ({ isOpen, onClose, trades }: TradeDashboardProps) => {
  const [sortBy, setSortBy] = useState<'date' | 'profit' | 'confidence'>('date');
  const [decisionFilterLocal, setDecisionFilterLocal] = useState<'all' | 'yes' | 'no'>('all');

  const sortedTrades = [...trades].sort((a, b) => {
    switch (sortBy) {
      case 'profit':
        return b.profitLoss - a.profitLoss;
      case 'confidence':
        return b.confidence - a.confidence;
      case 'date':
      default:
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    }
  });

  const totalProfitLoss = trades.reduce((sum, trade) => sum + trade.profitLoss, 0);

  return (
    <motion.div
      className="fixed right-0 top-0 h-full w-[500px] bg-card border-l-2 border-border shadow-2xl z-50 overflow-hidden"
      initial={{ x: '100%' }}
      animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border bg-muted/30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold">Trade Dashboard</h2>
                <div className="flex items-center gap-2">
                  {(['all', 'yes', 'no'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => { setDecisionFilterLocal(f); window.dispatchEvent(new CustomEvent('mira-decision-filter', { detail: f })); }}
                      className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${decisionFilterLocal === f ? 'bg-accent text-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >{f.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Live trading history</p>
            </div>
            <motion.button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-muted hover:bg-accent/20 flex items-center justify-center transition-colors"
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
            >
              <X className="w-5 h-5" />
            </motion.button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card rounded-lg p-3 border border-border">
              <div className="text-xs text-muted-foreground mb-1">Total Trades</div>
              <div className="text-xl font-bold">{trades.length}</div>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
              <div className="text-xl font-bold text-trade-yes">
                {((trades.filter(t => t.profitLoss > 0).length / trades.length) * 100).toFixed(0)}%
              </div>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <div className="text-xs text-muted-foreground mb-1">Net P/L</div>
              <div className={`text-xl font-bold ${totalProfitLoss >= 0 ? 'text-trade-yes' : 'text-trade-no'}`}>
                {totalProfitLoss >= 0 ? '+' : ''}${totalProfitLoss.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Sort controls */}
        <div className="px-6 py-3 border-b border-border bg-background/50 flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Sort by:</span>
          <div className="flex gap-2">
            {(['date', 'profit', 'confidence'] as const).map((sort) => (
              <button
                key={sort}
                onClick={() => setSortBy(sort)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${sortBy === sort
                    ? 'bg-accent text-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
              >
                {sort.charAt(0).toUpperCase() + sort.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Trade list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {sortedTrades.map((trade, index) => (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-card border border-border rounded-xl p-4 hover:border-accent/40 transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${trade.position === 'YES'
                        ? 'bg-trade-yes/20 text-foreground border border-trade-yes'
                        : 'bg-trade-no/20 text-foreground border border-trade-no'
                      }`}>
                      {trade.position}
                    </span>
                    <span className="text-xs text-muted-foreground">{trade.timestamp}</span>
                  </div>
                  <h4 className="font-medium text-sm leading-tight mb-2">{trade.question}</h4>
                </div>
                <div className={`flex items-center gap-1 font-bold ${trade.profitLoss >= 0 ? 'text-trade-yes' : 'text-trade-no'
                  }`}>
                  {trade.profitLoss >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span>{trade.profitLoss >= 0 ? '+' : ''}${trade.profitLoss.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground mb-0.5">Buy Price</div>
                  <div className="font-medium">${trade.buyPrice.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Current</div>
                  <div className="font-medium">${trade.currentPrice.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Confidence</div>
                  <div className="font-medium">{trade.confidence}%</div>
                </div>
              </div>

              {/* Mini sparkline effect */}
              <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity">
                <motion.div
                  className={`h-full ${trade.profitLoss >= 0 ? 'bg-trade-yes' : 'bg-trade-no'}`}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${Math.abs(trade.profitLoss) * 10}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
