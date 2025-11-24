import { motion, useDragControls } from "framer-motion";
import { useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { ReasoningModal } from "./ReasoningModal";

export interface Prediction {
  id: string;
  question: string;
  confidence: number;
  position: "YES" | "NO";
  price: number;
  change: number;
  reasoning: string;
  volume24h: number;
  timestamp: string;
}

interface PredictionBubbleProps {
  prediction: Prediction;
  position: { x: number; y: number };
  onTradeConnect?: () => void;
}

export const PredictionBubble = ({ prediction, position, onTradeConnect }: PredictionBubbleProps) => {
  const [showReasoning, setShowReasoning] = useState(false);
  const dragControls = useDragControls();

  const isYes = prediction.position === "YES";
  const bubbleColor = isYes ? "trade-yes" : "trade-no";

  return (
    <>
      <motion.div
        drag
        dragControls={dragControls}
        dragMomentum={false}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
        className="absolute cursor-grab active:cursor-grabbing"
        style={{ left: position.x, top: position.y }}
        onHoverStart={() => setShowReasoning(true)}
        onHoverEnd={() => setShowReasoning(false)}
      >
        {/* Glow effect */}
        <motion.div
          className={`absolute inset-0 rounded-full bg-${bubbleColor}/20 blur-xl`}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        />

        {/* Main bubble */}
        <motion.div
          className={`relative w-64 h-64 rounded-full bg-card border-2 border-${bubbleColor}/40 shadow-soft overflow-hidden`}
          animate={{
            boxShadow: [
              `0 0 20px rgba(${isYes ? '133, 238, 170' : '239, 68, 68'}, 0.2)`,
              `0 0 30px rgba(${isYes ? '133, 238, 170' : '239, 68, 68'}, 0.4)`,
              `0 0 20px rgba(${isYes ? '133, 238, 170' : '239, 68, 68'}, 0.2)`,
            ]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="p-6 h-full flex flex-col items-center justify-center text-center space-y-4">
            {/* Position badge */}
            <motion.div
              className={`px-4 py-1.5 rounded-full font-bold text-sm border-2 ${
                isYes 
                  ? 'bg-trade-yes/20 border-trade-yes text-foreground' 
                  : 'bg-trade-no/20 border-trade-no text-foreground'
              }`}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {prediction.position}
            </motion.div>

            {/* Confidence */}
            <motion.div
              className="text-5xl font-bold"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring" }}
            >
              {prediction.confidence}%
            </motion.div>

            {/* Question */}
            <p className="text-sm font-medium leading-tight line-clamp-3">
              {prediction.question}
            </p>

            {/* Market data */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Price:</span>
                <span className="font-bold">${prediction.price.toFixed(3)}</span>
              </div>
              <div className={`flex items-center gap-1 ${prediction.change >= 0 ? 'text-trade-yes' : 'text-trade-no'}`}>
                {prediction.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span className="font-bold">{prediction.change >= 0 ? '+' : ''}{prediction.change.toFixed(2)}%</span>
              </div>
            </div>

            {/* Volume indicator */}
            <div className="text-xs text-muted-foreground">
              24h Vol: ${prediction.volume24h.toLocaleString()}
            </div>

            {/* Timestamp */}
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              {prediction.timestamp}
            </div>
          </div>

          {/* Animated border pulse */}
          <motion.div
            className={`absolute inset-0 rounded-full border-2 border-${bubbleColor}`}
            animate={{
              scale: [1, 1.05, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.div>
      </motion.div>

      {showReasoning && (
        <ReasoningModal
          prediction={prediction}
          position={{ x: position.x + 280, y: position.y }}
        />
      )}
    </>
  );
};
