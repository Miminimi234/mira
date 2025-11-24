import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import React from "react";

interface FeedItem {
  id: string;
  text: string;
  type: 'live' | 'completed';
}

interface LiveFeedBarProps {
  items: FeedItem[];
}

// Simple placeholder: no bubble logic, only container and header
const BubblePlaceholder: React.FC = () => {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#000' }}>
      <div style={{ position: 'absolute', top: 16, left: 20, fontSize: 20, fontWeight: 800, color: '#fff' }}>BUBBLE MAP</div>
    </div>
  );
};

export const LiveFeedBar = ({ items }: LiveFeedBarProps) => {
  return (
    <>
      <BubblePlaceholder />
      <div className="fixed top-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-lg border-b border-border z-40">
        <div className="h-full flex items-center px-6 gap-6">
          {/* Logo/Title */}
          <div className="flex items-center gap-3 border-r border-border pr-6">
            <motion.div
              className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center"
              animate={{
                boxShadow: [
                  "0 0 10px rgba(133, 238, 170, 0.3)",
                  "0 0 20px rgba(133, 238, 170, 0.6)",
                  "0 0 10px rgba(133, 238, 170, 0.3)",
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Activity className="w-4 h-4 text-accent" />
            </motion.div>
            <div>
              <h1 className="text-sm font-bold uppercase tracking-wider">Live Predictions Feed</h1>
            </div>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <motion.div
                className="w-2 h-2 rounded-full bg-trade-yes"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [1, 0.7, 1],
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Live
              </span>
            </div>

            <div className="flex items-center gap-2">
              <motion.div
                className="w-2 h-2 rounded-full bg-trade-no"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [1, 0.7, 1],
                }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
              />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Analyzing
              </span>
            </div>
          </div>

          {/* Scrolling feed */}
          <div className="flex-1 overflow-hidden">
            <motion.div
              className="flex gap-8"
              animate={{ x: [0, -1000] }}
              transition={{
                duration: 20,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              {[...items, ...items].map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  className="flex items-center gap-2 whitespace-nowrap"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${item.type === 'live' ? 'bg-trade-yes' : 'bg-muted-foreground'
                    }`} />
                  <span className="text-sm text-muted-foreground">{item.text}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Time */}
          <div className="text-xs text-muted-foreground font-mono border-l border-border pl-6">
            {new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </div>
        </div>
      </div>
    </>
  );
};
