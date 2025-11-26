import PredictionBubbleCanvas from "@/components/PredictionBubbleCanvas";
import { PredictionNodeData } from "@/components/PredictionTypes";
import { ScrollingText } from "@/components/ScrollingText";
import { Terminal } from "@/components/Terminal";
import { TypewriterText } from "@/components/TypewriterText";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const Landing = () => {
  const navigate = useNavigate();
  const [predictions, setPredictions] = useState<PredictionNodeData[]>(() => {
    // Load from cache immediately for instant display
    try {
      const cached = sessionStorage.getItem('landing_predictions_cache');
      const cacheTime = sessionStorage.getItem('landing_predictions_cache_time');
      if (cached && cacheTime) {
        const age = Date.now() - parseInt(cacheTime);
        // Use cache if less than 2 minutes old
        if (age < 120000) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.slice(0, 50);
          }
        }
      }
    } catch (e) {
      // Ignore cache errors
    }
    // Development helper: allow forcing demo bubbles via URL ?simulate_bubbles=1
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('simulate_bubbles') === '1') {
        return [
          { id: 'mock-1', marketQuestion: 'Will BTC > 80k?', image_url: '/mira.png', bet_amount: 45, probability: 62, agent: 'GROK' },
          { id: 'mock-2', marketQuestion: 'Will AI pass exam?', image_url: '/mira.png', bet_amount: 12, probability: 74, agent: 'CLAUDE' },
          { id: 'mock-3', marketQuestion: 'Will X go viral?', image_url: '/mira.png', bet_amount: 3, probability: 40, agent: 'GROK' },
          { id: 'mock-4', marketQuestion: 'Will Y be acquired?', image_url: '/mira.png', bet_amount: 90, probability: 58, agent: 'CLAUDE' },
          { id: 'mock-5', marketQuestion: 'Will Z ship v2?', image_url: '/mira.png', bet_amount: 7, probability: 35, agent: 'GROK' },
        ];
      }
    } catch (e) {
      // ignore URL parsing errors
    }
    return [];
  });
  // Read URL params once: allow forcing demo or API-driven bubbles.
  let urlParams: URLSearchParams;
  try {
    urlParams = new URLSearchParams(window.location.search);
  } catch (e) {
    urlParams = new URLSearchParams();
  }
  const useMockParam = urlParams.get('simulate_bubbles') === '1';
  // If `disable_rtdb=1` is provided, keep using API/cache items (legacy behaviour).
  const disableRtdb = urlParams.get('disable_rtdb') === '1';
  // Fetch predictions for frosted bubbles - non-blocking
  useEffect(() => {
    const loadPredictions = async () => {
      try {
        const { API_BASE_URL } = await import('@/lib/apiConfig');

        // Create abort controller for timeout - reduced to 5 seconds for faster failure
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout (faster failure)

        const response = await fetch(`${API_BASE_URL}/api/predictions?category=All Markets&limit=50`, {
          signal: controller.signal,
          cache: 'no-store', // Bypass browser cache, use server Redis cache
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.predictions)) {
            // Limit to first 50 for performance
            const limited = data.predictions.slice(0, 50);
            setPredictions(limited);
            // Cache for next time
            try {
              sessionStorage.setItem('landing_predictions_cache', JSON.stringify(data.predictions));
              sessionStorage.setItem('landing_predictions_cache_time', Date.now().toString());
            } catch (e) {
              // Ignore storage errors
            }
          }
        }
      } catch (error) {
        // Silently fail - use cache if available
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Failed to fetch predictions:', error);
        }
      }
    };

    // Always fetch in background - don't block rendering
    // If we have cache, show it immediately, then update when fetch completes
    loadPredictions();
  }, []);

  const handleEnterApp = () => {
    // Store flag to trigger animations in Index page
    sessionStorage.setItem('fromLanding', 'true');
    navigate("/app");
  };

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      {/* Bubbles Background - NO CLICKS ALLOWED */}
      <div className="absolute inset-0 z-0" style={{ pointerEvents: 'none' }}>
        {useMockParam ? (
          // Dev demo override: pass mocked items
          <PredictionBubbleCanvas items={predictions} onBubbleClick={undefined} />
        ) : disableRtdb ? (
          // Legacy mode: use API/cache payload if available
          predictions.length > 0 ? <PredictionBubbleCanvas items={predictions} onBubbleClick={undefined} /> : null
        ) : (
          // Default: let the canvas subscribe to Firebase `/agent_predictions` itself
          <PredictionBubbleCanvas onBubbleClick={undefined} />
        )}
      </div>

      {/* Frosted Glass Overlay - Full Page */}
      <div
        className="absolute inset-0 z-30 pointer-events-none"
        style={{
          // Reduced blur and opacity for a clearer background while keeping the frosted look
          backdropFilter: 'blur(8px) saturate(140%)',
          WebkitBackdropFilter: 'blur(8px) saturate(140%)',
          backgroundColor: 'rgba(0, 0, 0, 0.12)',
        }}
      />

      {/* Enter App Button - Top Right Corner */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="absolute top-6 right-6 z-50"
      >
        <Button
          onClick={handleEnterApp}
          className="flex items-center gap-2 px-6 py-2.5 font-medium transition-colors shadow-lg button-shine"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'rgba(255, 255, 255, 0.9)',
            borderRadius: '16px',
          }}
        >
          Enter App
          <ArrowRight className="w-4 h-4" />
        </Button>
      </motion.div>

      {/* MIRA Image - Bottom Aligned */}
      <img
        src="/mira.png"
        alt="MIRA"
        className="fixed"
        style={{
          height: '80vh',
          width: 'auto',
          bottom: 0,
          left: 'calc(50% + 50px)',
          transform: 'translateX(-100%)',
          filter: 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.3))',
          imageRendering: 'high-quality',
          objectFit: 'contain',
          zIndex: 40,
          pointerEvents: 'none',
        }}
      />

      {/* Main Content - MIRA Text with Frosted Effect */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="absolute top-8 left-16 z-40 pointer-events-none"
      >
        <h1
          className="font-bold tracking-tight"
          style={{
            fontFamily: "'Boge', sans-serif",
            color: '#FFFFFF',
            fontSize: '9rem',
          }}
        >
          {'MIRA'.split('').map((letter, index) => (
            <span key={index} className="mira-letter">
              {letter === ' ' ? '\u00A0' : letter}
            </span>
          ))}
        </h1>
        <div
          style={{
            fontFamily: "'Arial Black', 'Arial', sans-serif",
            fontWeight: 'bold',
            color: '#FFFFFF',
            fontSize: '1.5rem',
            marginTop: '-1rem',
            marginLeft: '1rem',
            opacity: 0.8,
          }}
        >
          AI PREDICTION TERMINAL
        </div>
        <div
          style={{
            fontFamily: "'Arial Black', 'Arial', sans-serif",
            fontWeight: 'bold',
            color: '#FFFFFF',
            fontSize: '1rem',
            marginTop: '0.5rem',
            marginLeft: '1rem',
            opacity: 0.8,
          }}
        >
          <TypewriterText
            text="REAL TIME AI-POWERED PREDICTION MARKET INTERFACE"
            speed={40}
          />
        </div>
      </motion.div>

      {/* Terminal Component - Center of Screen */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1 }}
        className="fixed z-40"
        style={{
          width: '650px',
          maxWidth: 'calc(100vw - 4rem)',
          top: '50%',
          left: 'calc(50% + 5cm)',
          transform: 'translate(-50%, -50%)'
        }}
      >
        <Terminal />
      </motion.div>

      {/* Bottom Navbar */}
      <div
        className="fixed bottom-0 left-0 right-0 flex items-center"
        style={{
          height: '40px',
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 -2px 10px rgba(255, 255, 255, 0.05)',
          zIndex: 30,
        }}
      >
        <ScrollingText
          text="$MIRA"
          speed={30}
          className="flex-1"
        />
      </div>
    </div>
  );
};

export default Landing;
