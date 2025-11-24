import { motion } from "framer-motion";

interface ConnectionLineProps {
  startPos: { x: number; y: number };
  endPos: { x: number; y: number };
  color?: string;
  isAnimatingIn?: boolean;
}

export const ConnectionLine = ({ startPos, endPos, color = "hsl(220, 78%, 72%)", isAnimatingIn = false }: ConnectionLineProps) => {
  return (
    <svg className="fixed inset-0 pointer-events-none z-10" style={{ width: '100%', height: '100%' }}>
      <motion.line
        x1={startPos.x}
        y1={startPos.y}
        x2={endPos.x}
        y2={endPos.y}
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.6"
        initial={isAnimatingIn ? { pathLength: 0, opacity: 0 } : { pathLength: 0, opacity: 0 }}
        animate={isAnimatingIn ? { pathLength: 1, opacity: [0, 0.6, 0] } : { pathLength: 1, opacity: [0, 0.6, 0] }}
        transition={isAnimatingIn ? { duration: 1.2, delay: 0.6, ease: "easeInOut" } : { duration: 1.2, ease: "easeInOut" }}
      />
      <motion.circle
        cx={endPos.x}
        cy={endPos.y}
        r="2"
        fill={color}
        initial={isAnimatingIn ? { scale: 0, opacity: 0 } : { scale: 0, opacity: 0 }}
        animate={isAnimatingIn ? { scale: [0, 1.2, 0.8], opacity: [0, 0.8, 0] } : { scale: [0, 1.2, 0.8], opacity: [0, 0.8, 0] }}
        transition={isAnimatingIn ? { duration: 1.2, delay: 0.6, ease: "easeOut" } : { duration: 1.2, ease: "easeOut" }}
      />
    </svg>
  );
};
