interface ScrollingTextProps {
  text: string;
  speed?: number; // seconds per cycle
  className?: string;
}

export const ScrollingText = ({ 
  text, 
  speed = 20,
  className = '' 
}: ScrollingTextProps) => {
  // Create many repetitions to fill the entire navbar width
  const repeatedText = Array(50).fill(`${text}  ↗  `).join(' ⍟  ');
  
  return (
    <div 
      className={`overflow-hidden whitespace-nowrap ${className}`}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        className="inline-block"
        style={{
          fontFamily: 'monospace',
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#FFC94A',
          whiteSpace: 'nowrap',
          animation: `scroll-left ${speed}s linear infinite`,
          willChange: 'transform',
        }}
      >
        {repeatedText}
        {repeatedText}
      </div>
      <style>{`
        @keyframes scroll-left {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
};

