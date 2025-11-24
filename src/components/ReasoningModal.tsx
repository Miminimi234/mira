import { motion } from "framer-motion";
import { Prediction } from "./PredictionBubble";
import { Brain } from "lucide-react";

interface ReasoningModalProps {
  prediction: Prediction;
  position: { x: number; y: number };
}

export const ReasoningModal = ({ prediction, position }: ReasoningModalProps) => {
  return (
    <motion.div
      className="absolute z-50 w-96"
      style={{ left: position.x, top: position.y }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bg-card border-2 border-accent/40 rounded-2xl p-6 shadow-glow">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wider">AI Reasoning</h3>
            <p className="text-xs text-muted-foreground">Model: Gemini-Pro</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-foreground/90">
            {prediction.reasoning}
          </p>

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div className="text-xs text-muted-foreground">
              Confidence Level
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-32 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${prediction.confidence}%` }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                />
              </div>
              <span className="text-xs font-bold">{prediction.confidence}%</span>
            </div>
          </div>

          <motion.button
            className="w-full mt-4 px-4 py-2 bg-accent hover:bg-accent/90 text-foreground font-medium rounded-lg text-sm transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            View Trade Dashboard
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};
