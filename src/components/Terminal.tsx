import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface TerminalProps {
  commands?: string[];
  className?: string;
}

export const Terminal = ({ 
  commands = [
    '$ npm start mira',
    '> Starting MIRA prediction engine...',
    '> Loading market data from Polymarket API...',
    '$ mira --connect --realtime',
    '> Connected to real-time data feeds',
    '$ mira --agents --status',
    '> AI agents ready: GROK, GPT-5, Claude, DeepSeek, Gemini, Qwen',
    '$ mira --analyze --markets 5000+',
    '> Analyzing 5000+ prediction markets...',
    '> System operational. All systems green.',
    '$ mira --status',
    '> MIRA is running and ready for predictions',
  ],
  className = ''
}: TerminalProps) => {
  const [displayedLines, setDisplayedLines] = useState<string[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    if (currentLineIndex >= commands.length) {
      setIsTyping(false);
      return;
    }

    const currentCommand = commands[currentLineIndex];
    if (currentCharIndex < currentCommand.length) {
      const timer = setTimeout(() => {
        setCurrentCharIndex(prev => prev + 1);
      }, 30); // Typing speed: 30ms per character

      return () => clearTimeout(timer);
    } else {
      // Move to next line after a short delay
      const timer = setTimeout(() => {
        setDisplayedLines(prev => [...prev, currentCommand]);
        setCurrentLineIndex(prev => prev + 1);
        setCurrentCharIndex(0);
      }, 500); // Delay before next line

      return () => clearTimeout(timer);
    }
  }, [currentLineIndex, currentCharIndex, commands]);

  const currentLine = currentLineIndex < commands.length 
    ? commands[currentLineIndex].substring(0, currentCharIndex)
    : '';

  return (
    <div 
      className={`relative overflow-hidden border ${className}`}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 -2px 10px rgba(255, 255, 255, 0.05)',
        borderRadius: '16px',
      }}
    >
      {/* Terminal Header */}
      <div 
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{
          borderColor: 'rgba(255, 255, 255, 0.1)',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        }}
      >
        <div className="flex gap-1.5">
          <div 
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: '#ff5f56' }}
          />
          <div 
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: '#ffbd2e' }}
          />
          <div 
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: '#27c93f' }}
          />
        </div>
        <span 
          className="text-[10px] font-mono ml-2"
          style={{ color: 'rgba(255, 255, 255, 0.7)' }}
        >
          terminal
        </span>
      </div>

      {/* Terminal Content */}
      <div 
        className="p-4 font-mono text-xs overflow-y-auto"
        style={{
          color: 'rgba(255, 255, 255, 0.9)',
          fontFamily: 'Monaco, Menlo, "Courier New", monospace',
          minHeight: '200px',
          maxHeight: '300px',
          backgroundColor: 'transparent',
        }}
      >
        {displayedLines.map((line, index) => (
          <div key={index} className="mb-1">
            <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{line}</span>
          </div>
        ))}
        {currentLine && (
          <div className="mb-1">
            <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{currentLine}</span>
            {isTyping && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
                className="inline-block w-0.5 h-3 ml-0.5 align-middle"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)' }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

