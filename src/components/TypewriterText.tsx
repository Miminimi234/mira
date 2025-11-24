import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface TypewriterTextProps {
  text: string;
  speed?: number; // Characters per second
  className?: string;
  onComplete?: () => void;
}

export const TypewriterText = ({ 
  text, 
  speed = 30, 
  className = '',
  onComplete 
}: TypewriterTextProps) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!text) {
      setDisplayedText('');
      setIsComplete(false);
      return;
    }

    // Reset when text changes
    setDisplayedText('');
    setIsComplete(false);

    let currentIndex = 0;
    const delay = 1000 / speed; // Convert chars/sec to ms per char

    const typeInterval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.substring(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(typeInterval);
        setIsComplete(true);
        if (onComplete) {
          onComplete();
        }
      }
    }, delay);

    return () => clearInterval(typeInterval);
  }, [text, speed, onComplete]);

  return (
    <span className={className}>
      {displayedText}
      {!isComplete && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
          className="inline-block w-0.5 h-4 bg-terminal-accent ml-0.5 align-middle"
        />
      )}
    </span>
  );
};

