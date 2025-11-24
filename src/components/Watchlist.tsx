import { Star, X } from "lucide-react";
import { PredictionNodeData } from "./PredictionTypes";

interface WatchlistProps {
  watchlist: PredictionNodeData[];
  onRemove: (id: string) => void;
  onMarketClick?: (market: PredictionNodeData) => void;
}

export const Watchlist = ({ watchlist, onRemove, onMarketClick }: WatchlistProps) => {
  if (watchlist.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background p-6">
        <div className="text-center">
          <Star className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-mono text-foreground mb-2">Your Watchlist is Empty</h3>
          <p className="text-sm text-muted-foreground font-mono">
            Click the star icon on any market to add it to your watchlist
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-secondary/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-terminal-accent fill-terminal-accent" />
          <h2 className="text-sm font-bold text-foreground">Watchlist ({watchlist.length})</h2>
        </div>
      </div>

      {/* Watchlist Items - Scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-2">
        {watchlist.map((market) => {
          const yesPrice = market.yesPrice || market.price || 0;
          const noPrice = market.noPrice || (1 - yesPrice);
          const isYes = yesPrice > noPrice;

          return (
            <div
              key={market.id}
              className="group relative p-3 border border-border rounded-lg bg-bg-elevated hover:bg-muted transition-colors cursor-pointer"
              onClick={() => onMarketClick?.(market)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {market.imageUrl && (
                      <img
                        src={market.imageUrl}
                        alt={market.question}
                        className="w-6 h-6 rounded object-cover flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <h3 className="text-xs font-semibold text-foreground truncate flex-1">
                      {market.question}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 mt-1.5">
                    {market.category && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-terminal-accent/20 text-terminal-accent rounded font-mono">
                        {market.category}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-mono ${isYes ? 'text-trade-yes' : 'text-trade-no'}`}>
                        YES: ${yesPrice.toFixed(3)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">•</span>
                      <span className={`text-[10px] font-mono ${!isYes ? 'text-trade-yes' : 'text-trade-no'}`}>
                        NO: ${noPrice.toFixed(3)}
                      </span>
                    </div>
                  </div>

                  {market.volume && (
                    <div className="mt-1.5 text-[10px] text-muted-foreground font-mono">
                      Vol: {typeof market.volume === 'string' ? market.volume : `$${market.volume.toLocaleString()}`}
                    </div>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(market.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                  title="Remove from watchlist"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

