import { X } from "lucide-react";

interface Trade {
  id: string;
  timestamp: string;
  agent: string;
  agentEmoji: string;
  position: "YES" | "NO";
  price: number;
  quantity: number;
  pnl: number;
}

interface TradesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  predictionTitle: string;
  trades: Trade[];
}

const mockTrades: Trade[] = [
  {
    id: "1",
    timestamp: "2H AGO",
    agent: "GROK",
    agentEmoji: "GROK",
    position: "YES",
    price: 0.67,
    quantity: 100,
    pnl: 12.5,
  },
  {
    id: "2",
    timestamp: "5H AGO",
    agent: "OPENAI",
    agentEmoji: "GPT-5",
    position: "NO",
    price: 0.33,
    quantity: 150,
    pnl: -8.2,
  },
  {
    id: "3",
    timestamp: "1D AGO",
    agent: "GEMINI",
    agentEmoji: "GEMINI",
    position: "YES",
    price: 0.65,
    quantity: 200,
    pnl: 18.7,
  },
  {
    id: "4",
    timestamp: "2D AGO",
    agent: "DEEPSEEK",
    agentEmoji: "DEEPSEEK",
    position: "NO",
    price: 0.35,
    quantity: 80,
    pnl: -5.3,
  },
];

// Helper function to get logo path based on agent name
const getAgentLogo = (agent: string): string => {
  const agentUpper = agent.toUpperCase();
  if (agentUpper.includes('GROK')) return '/grok.png';
  if (agentUpper.includes('GPT') || agentUpper.includes('OPENAI')) return '/GPT.png';
  if (agentUpper.includes('GEMINI')) return '/GEMENI.png';
  if (agentUpper.includes('DEEPSEEK')) return '/deepseek.png';
  if (agentUpper.includes('CLAUDE')) return '/Claude_AI_symbol.svg';
  if (agentUpper.includes('QWEN')) return '/Qwen_logo.svg';
  return '/placeholder.svg';
};

export const TradesPanel = ({ isOpen, onClose, predictionTitle }: TradesPanelProps) => {
  return (
    <div className="w-full h-full bg-bg-elevated flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div>
              <div className="text-xs text-terminal-accent font-mono mb-1">&gt; TRADE_HISTORY</div>
              <div className="text-sm text-foreground">{predictionTitle}</div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center border border-border hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Trades Table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-secondary sticky top-0">
                <tr className="border-b border-border">
                  <th className="text-left p-2 text-muted-foreground font-normal">TIME</th>
                  <th className="text-left p-2 text-muted-foreground font-normal">AGENT</th>
                  <th className="text-left p-2 text-muted-foreground font-normal">POSITION</th>
                  <th className="text-right p-2 text-muted-foreground font-normal">PRICE</th>
                  <th className="text-right p-2 text-muted-foreground font-normal">QTY</th>
                  <th className="text-right p-2 text-muted-foreground font-normal">P&L</th>
                </tr>
              </thead>
              <tbody>
                {mockTrades.map((trade) => (
                  <tr key={trade.id} className="border-b border-border hover:bg-muted/30">
                    <td className="p-2 text-muted-foreground">{trade.timestamp}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <img 
                          src={getAgentLogo(trade.agent)}
                          alt={trade.agent}
                          className={`object-contain ${trade.agent.toUpperCase().includes('GEMINI') ? 'w-6 h-6' : 'w-5 h-5'}`}
                        />
                        <span className="text-foreground">{trade.agent}</span>
                      </div>
                    </td>
                    <td className="p-2">
                      <span
                        className={`px-2 py-0.5 border rounded-full ${
                          trade.position === "YES"
                            ? "border-trade-yes text-trade-yes"
                            : "border-trade-no text-trade-no"
                        }`}
                      >
                        {trade.position}
                      </span>
                    </td>
                    <td className="p-2 text-right text-foreground">${trade.price.toFixed(2)}</td>
                    <td className="p-2 text-right text-foreground">{trade.quantity}</td>
                    <td
                      className={`p-2 text-right font-bold ${
                        trade.pnl >= 0 ? "text-trade-yes" : "text-trade-no"
                      }`}
                    >
                      {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Footer */}
          <div className="px-4 py-3 border-t border-border bg-secondary">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground">Total Trades: {mockTrades.length}</span>
              <span className="text-foreground">
                Net P&L:{" "}
                <span
                  className={`font-bold ${
                    mockTrades.reduce((sum, t) => sum + t.pnl, 0) >= 0
                      ? "text-trade-yes"
                      : "text-trade-no"
                  }`}
                >
                  {mockTrades.reduce((sum, t) => sum + t.pnl, 0) >= 0 ? "+" : ""}$
                  {mockTrades.reduce((sum, t) => sum + t.pnl, 0).toFixed(2)}
                </span>
              </span>
            </div>
          </div>
    </div>
  );
};
