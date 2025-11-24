import { motion } from "framer-motion";
import { Brain } from "lucide-react";

interface AIAvatarProps {
  isActive?: boolean;
}

export const AIAvatar = ({ isActive = false }: AIAvatarProps) => {
  return (
    <motion.div
      className="fixed bottom-8 left-8 z-50"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div className="relative">
        {/* Outer glow rings */}
        <motion.div
          className="absolute inset-0 rounded-full bg-accent/20 blur-xl"
          animate={{
            scale: isActive ? [1, 1.3, 1] : 1,
            opacity: isActive ? [0.5, 0.8, 0.5] : 0.3,
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        
        <motion.div
          className="absolute inset-0 rounded-full bg-accent/30 blur-lg"
          animate={{
            scale: isActive ? [1, 1.2, 1] : 1,
            opacity: isActive ? [0.6, 0.9, 0.6] : 0.4,
          }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
        />

        {/* Main avatar circle */}
        <motion.div
          className="relative w-24 h-24 rounded-full bg-gradient-to-br from-accent to-primary border-2 border-accent/50 shadow-glow flex items-center justify-center"
          animate={{
            boxShadow: isActive 
              ? ["0 0 20px rgba(133, 238, 170, 0.4)", "0 0 40px rgba(133, 238, 170, 0.8)", "0 0 20px rgba(133, 238, 170, 0.4)"]
              : "0 0 20px rgba(133, 238, 170, 0.4)"
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <motion.div
            animate={{ rotate: isActive ? 360 : 0 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          >
            <Brain className="w-10 h-10 text-foreground" />
          </motion.div>
        </motion.div>

        {/* Status indicator */}
        <motion.div
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent border-2 border-background"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [1, 0.8, 1],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>

      {/* Label */}
      <motion.div
        className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          AI AGENT {isActive && <span className="text-accent">● TRADING</span>}
        </span>
      </motion.div>
    </motion.div>
  );
};
