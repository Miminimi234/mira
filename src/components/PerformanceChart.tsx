import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getDb } from '@/lib/firebase/client';
import { get as dbGet, off as dbOff, query as dbQuery, ref as dbRef, limitToLast, onChildAdded, orderByChild, startAt } from 'firebase/database';
import { ChevronDown, DollarSign, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, ComposedChart, Customized, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TechnicalView } from "./TechnicalView";

interface ChartDataPoint {
  time: string;
  timestamp?: number; // Full timestamp for sorting
  DEEPSEEK: number;
  CLAUDE: number;
  QWEN: number;
  GEMINI: number;
  GROK: number;
  GPT5: number;
}

// All agents start with $3,000 USD
const STARTING_CAPITAL = 3000;

// Initial chart data - all agents start at $3,000
// This will be replaced with real data from the API
const getInitialChartData = (): ChartDataPoint[] => {
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  return [
    {
      time: timeStr,
      timestamp: now.getTime(),
      DEEPSEEK: STARTING_CAPITAL,
      CLAUDE: STARTING_CAPITAL,
      QWEN: STARTING_CAPITAL,
      GEMINI: STARTING_CAPITAL,
      GROK: STARTING_CAPITAL,
      GPT5: STARTING_CAPITAL
    },
  ];
};

const AGENT_LOGO: Record<string, string> = {
  GROK: "/grok.png",
  GEMINI: "/GEMENI.png",
  DEEPSEEK: "/deepseek.png",
  CLAUDE: "/Claude_AI_symbol.svg",
  GPT5: "/GPT.png",
  QWEN: "/Qwen_logo.svg",
};

const agents = [
  { id: "GROK", name: "GROK", shortName: "GROK", color: "#F4E6A6", logoKey: "GROK" },
  { id: "GEMINI", name: "Gemini 2.5", shortName: "GEMINI", color: "#8AA4FF", logoKey: "GEMINI" },
  { id: "DEEPSEEK", name: "DeepSeek V3", shortName: "DEEPSEEK", color: "#4BD2A4", logoKey: "DEEPSEEK" },
  { id: "CLAUDE", name: "Claude 4.5", shortName: "CLAUDE", color: "#F79A4F", logoKey: "CLAUDE" },
  { id: "GPT5", name: "GPT-5", shortName: "GPT-5", color: "#C8C8FF", logoKey: "GPT5" },
  { id: "QWEN", name: "Qwen 2.5", shortName: "QWEN", color: "#6b9e7d", logoKey: "QWEN" },
];

const BACKEND_TO_CHART_ID: Record<string, keyof ChartDataPoint> = {
  'GROK_4': 'GROK',
  'GEMINI_2_5': 'GEMINI',
  'DEEPSEEK_V3': 'DEEPSEEK',
  'CLAUDE_4_5': 'CLAUDE',
  'GPT_5': 'GPT5',
  'QWEN_2_5': 'QWEN',
};

const BACKEND_TO_FRONTEND_ID: Record<string, string> = {
  'GROK_4': 'grok',
  'GEMINI_2_5': 'gemini',
  'DEEPSEEK_V3': 'deepseek',
  'CLAUDE_4_5': 'claude',
  'GPT_5': 'gpt5',
  'QWEN_2_5': 'qwen',
};

// Custom Tooltip Component
const MultiAgentTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  // Deduplicate payload entries by dataKey (Area and Line both contribute, so we get duplicates)
  const seen = new Set<string>();
  const uniquePayload = payload.filter((entry: any) => {
    if (seen.has(entry.dataKey)) {
      return false;
    }
    seen.add(entry.dataKey);
    return true;
  });

  return (
    <div
      style={{
        backgroundColor: "#0B0F17",
        border: "1px solid #262933",
        borderRadius: "8px",
        padding: "10px 12px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
      }}
    >
      <div style={{ color: "#C6CBD9", fontSize: "12px", marginBottom: "8px", fontWeight: 500 }}>
        {label}
      </div>
      {uniquePayload.map((entry: any, index: number) => {
        const agent = agents.find(a => a.id === entry.dataKey);
        if (!agent) return null;
        // Use agent color from agents array (more reliable than entry.color)
        const agentColor = agent.color || entry.color;
        return (
          <div
            key={entry.dataKey}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: index < uniquePayload.length - 1 ? "6px" : "0",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                backgroundColor: agentColor,
                borderRadius: "3px",
                flexShrink: 0,
                border: `1px solid ${agentColor}`,
                boxShadow: `0 0 4px ${agentColor}40`,
              }}
            />
            <span style={{ color: "#C6CBD9", fontSize: "12px", minWidth: "80px" }}>
              {agent.shortName}
            </span>
            <span style={{ color: "#FFFFFF", fontSize: "13px", fontWeight: 600 }}>
              ${entry.value.toFixed(0)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// Line Endpoints Component - Agents positioned at end of each line
const createLineEndpoints = (selectedAgent: string | null, chartData: ChartDataPoint[]) => (props: any) => {
  const { xAxisMap, yAxisMap, offset, width, height } = props;
  const xAxis = xAxisMap?.[Object.keys(xAxisMap || {})[0]];
  const yAxis = yAxisMap?.[Object.keys(yAxisMap || {})[0]];

  if (!xAxis || !yAxis || !chartData || chartData.length === 0) return null;

  const lastDataPoint = chartData[chartData.length - 1];
  const chartWidth = xAxis.width || width - offset.left - offset.right;
  const chartLeft = offset.left;
  const chartTop = offset.top;

  // Get Y domain from axis or calculate from data
  const yDomain = yAxis.domain || (() => {
    let min = Infinity;
    let max = -Infinity;
    chartData.forEach((point) => {
      agents.forEach((agent) => {
        const value = point[agent.id as keyof ChartDataPoint] as number;
        if (value !== undefined && value !== null) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      });
    });
    const padding = (max - min) * 0.1;
    return [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
  })();

  const chartHeight = yAxis.height || height - offset.top - offset.bottom;

  // Manual scale calculation
  const scaleY = (value: number) => {
    const [min, max] = yDomain;
    if (max === min) return chartTop + chartHeight / 2;
    const ratio = (max - value) / (max - min);
    return chartTop + ratio * chartHeight;
  };

  return (
    <g>
      {agents.map((agent) => {
        // Only show endpoint if agent is visible (all agents or selected agent)
        const isVisible = selectedAgent === null || selectedAgent === agent.id;
        if (!isVisible) return null;
        const value = lastDataPoint[agent.id as keyof ChartDataPoint] as number;
        if (value === undefined || value === null) return null;

        // Calculate X position (right edge of chart)
        const xPos = chartLeft + chartWidth;

        // Calculate Y position based on value
        const yPos = scaleY(value);

        // Pill dimensions - much larger logo and pill for higher visibility per request
        const connectorLength = 14;
        const pillX = xPos + connectorLength;
        const pillHeight = 40;
        const logoSize = 36; // significantly larger logo
        const pillPadding = { left: 10, right: 12, top: 6, bottom: 6 };

        // Calculate pill width based on content
        // Logo + gap + text width estimate + padding
        const textWidth = `${value.toFixed(2)}`.length * 9 + 32; // larger estimate for clearer text
        const pillWidth = logoSize + 10 + textWidth + pillPadding.left + pillPadding.right;

        // Clamp pill to not overflow
        const maxX = chartLeft + chartWidth + 220; // margin.right (increased)
        const clampedPillX = Math.min(pillX, maxX - pillWidth);

        return (
          <g key={agent.id}>
            {/* Tiny horizontal connector line */}
            <line
              x1={xPos}
              y1={yPos}
              x2={xPos + connectorLength}
              y2={yPos}
              stroke={agent.color}
              strokeWidth={1}
            />

            {/* Pill using foreignObject for HTML rendering */}
            <foreignObject
              x={clampedPillX}
              y={yPos - pillHeight / 2}
              width={pillWidth}
              height={pillHeight}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: `${pillPadding.top}px ${pillPadding.right}px ${pillPadding.bottom}px ${pillPadding.left}px`,
                  background: "rgba(5, 6, 8, 0.9)",
                  border: "none",
                  borderRadius: "4px",
                  height: `${pillHeight}px`,
                  fontSize: "11px",
                  fontWeight: 400,
                  color: "#ffffff",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  whiteSpace: "nowrap",
                }}
              >
                {/* Agent Logo */}
                <img
                  src={AGENT_LOGO[agent.logoKey]}
                  alt={agent.name}
                  width={logoSize}
                  height={logoSize}
                  style={{
                    borderRadius: "50%",
                    flexShrink: 0,
                  }}
                  onError={(e) => {
                    // Fallback if image doesn't load
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                {/* Latest Value */}
                <span>${value.toFixed(2)}</span>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </g>
  );
};

interface PerformanceChartProps {
  predictions?: Array<{ id: string; agentName?: string; probability?: number }>;
  selectedMarketId?: string | null;
  selectedAgentId?: string | null; // Agent selected from bottom navbar
}

export const PerformanceChart = ({ predictions = [], selectedMarketId = null, selectedAgentId = null }: PerformanceChartProps = {}) => {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const predictionProbabilityMap = useMemo(() => {
    const map = new Map<string, number>();
    if (Array.isArray(predictions)) {
      predictions.forEach((prediction) => {
        if (!prediction || !prediction.id) return;
        const rawProb = typeof prediction.probability === 'number' ? prediction.probability : 0;
        const normalized = rawProb > 1 ? rawProb / 100 : rawProb;
        const clamped = Math.max(0, Math.min(1, normalized));
        map.set(prediction.id, clamped);
      });
    }
    return map;
  }, [predictions]);

  // Update selectedAgent when selectedAgentId prop changes (from bottom navbar)
  useEffect(() => {
    if (selectedAgentId !== null) {
      // Map frontend agent IDs to chart agent IDs
      const agentIdMap: Record<string, string> = {
        'grok': 'GROK',
        'gpt5': 'GPT5',
        'deepseek': 'DEEPSEEK',
        'gemini': 'GEMINI',
        'claude': 'CLAUDE',
        'qwen': 'QWEN',
      };
      const chartAgentId = agentIdMap[selectedAgentId.toLowerCase()] || selectedAgentId.toUpperCase();
      setSelectedAgent(chartAgentId);
    } else {
      setSelectedAgent(null);
    }
  }, [selectedAgentId]);
  const [viewMode, setViewMode] = useState<"chart" | "technical">("chart");
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = normal, >1 = zoomed in, <1 = zoomed out

  // PERSISTENT chart data - use ref to maintain across unmounts, state for rendering
  // CRITICAL: Use module-level ref to persist across ALL component instances
  const MAX_POINTS = Number((import.meta.env.VITE_PERF_CHART_POINTS as string) || 240);
  const chartDataRef = useRef<ChartDataPoint[]>(getInitialChartData());
  const [chartData, setChartData] = useState<ChartDataPoint[]>(() => {
    // Initialize from ref if available, otherwise use initial data
    const refData = chartDataRef.current;
    if (refData.length > 0 && refData[0].DEEPSEEK !== STARTING_CAPITAL) {
      // We have real data, use it
      return [...refData];
    }
    return getInitialChartData();
  });
  const [isLoading, setIsLoading] = useState(() => {
    // Only show loading if we don't have real data
    return chartDataRef.current.length === 0 || chartDataRef.current[0].DEEPSEEK === STARTING_CAPITAL;
  });
  const lastAgentPnlRef = useRef<Map<string, number>>(new Map());
  const animationDisabled = true;

  // CRITICAL: Restore chart data from ref whenever component mounts or becomes visible
  // This ensures data persists even if component was unmounted
  useEffect(() => {
    const refData = chartDataRef.current;
    // Only restore if we have real data (not just initial data)
    if (refData.length > 0 && refData[0].DEEPSEEK !== STARTING_CAPITAL) {
      if (chartData.length === 0 || chartData[0].DEEPSEEK === STARTING_CAPITAL) {
        console.log('[Chart] Restoring chart data from ref:', refData.length, 'points');
        setChartData([...refData]);
        setIsLoading(false);
      }
    }
  }, [chartData.length]);

  // Fetch historical snapshots from Firebase RTDB (preferred) and subscribe to new snapshots.
  // If Firebase is not configured or fails, fall back to the previous API polling approach.
  useEffect(() => {
    let isMounted = true;
    let childHandler: any = null;
    let childQuery: any = null;

    const fallbackApiLoader = async () => {
      // fallback to original API polling behavior
      try {
        const { API_BASE_URL } = await import('@/lib/apiConfig');
        const response = await fetch(`${API_BASE_URL}/api/agents/summary`);
        if (!response.ok) {
          console.error('Failed to fetch agent summary:', response.status, response.statusText);
          return;
        }
        const data = await response.json();
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const newDataPoint: ChartDataPoint = {
          time: timeStr,
          timestamp: now.getTime(),
          DEEPSEEK: STARTING_CAPITAL,
          CLAUDE: STARTING_CAPITAL,
          QWEN: STARTING_CAPITAL,
          GEMINI: STARTING_CAPITAL,
          GROK: STARTING_CAPITAL,
          GPT5: STARTING_CAPITAL,
        };

        const tradesByAgent: Record<string, any[]> = data.tradesByAgent || {};
        const agentsByFrontendId = new Map<string, any>();
        if (Array.isArray(data.agents)) {
          data.agents.forEach((agent: any) => {
            if (agent?.id) agentsByFrontendId.set(agent.id.toLowerCase(), agent);
          });
        }

        const getProbabilityForTrade = (trade: any): number => {
          const fallback = typeof trade.currentProbability === 'number'
            ? trade.currentProbability
            : typeof trade.entryProbability === 'number'
              ? trade.entryProbability
              : typeof trade.confidence === 'number'
                ? Math.max(0, Math.min(1, trade.confidence / 100))
                : 0.5;
          if (!trade) return fallback;
          const liveProb = (trade.predictionId && predictionProbabilityMap.get(trade.predictionId)) ?? (trade.marketId && predictionProbabilityMap.get(trade.marketId)) ?? fallback;
          return liveProb;
        };

        const computeAgentCapital = (backendId: string) => {
          const trades = tradesByAgent[backendId] || [];
          if (!Array.isArray(trades) || trades.length === 0) {
            const frontendId = BACKEND_TO_FRONTEND_ID[backendId] || backendId.toLowerCase();
            const fallbackAgent = agentsByFrontendId.get(frontendId);
            const fallbackPnl = fallbackAgent?.pnl || 0;
            return STARTING_CAPITAL + fallbackPnl;
          }
          let realizedPnl = 0;
          let unrealizedPnl = 0;
          trades.forEach((trade: any) => {
            const decision = trade.decision || trade.side;
            const investment = trade.investmentUsd || 0;
            if (trade.status === 'CLOSED') {
              if (typeof trade.pnl === 'number') realizedPnl += trade.pnl;
              return;
            }
            if (!decision || !investment) return;
            const entryProb = typeof trade.entryProbability === 'number' ? trade.entryProbability : typeof trade.confidence === 'number' ? Math.max(0, Math.min(1, trade.confidence / 100)) : 0.5;
            const currentProb = getProbabilityForTrade(trade);
            const probDelta = decision === 'YES' ? (currentProb - entryProb) : (entryProb - currentProb);
            unrealizedPnl += probDelta * investment;
          });
          return STARTING_CAPITAL + realizedPnl + unrealizedPnl;
        };

        let hasChanges = false;
        Object.entries(BACKEND_TO_CHART_ID).forEach(([backendId, chartKey]) => {
          const capital = computeAgentCapital(backendId);
          if (typeof capital === 'number' && !isNaN(capital) && isFinite(capital)) {
            (newDataPoint as any)[chartKey] = Math.max(0, capital);
            const prevPnl = lastAgentPnlRef.current.get(chartKey);
            const currentPnl = capital - STARTING_CAPITAL;
            const changed = prevPnl === undefined || Math.abs(prevPnl - currentPnl) > 0.01;
            if (changed) hasChanges = true;
            lastAgentPnlRef.current.set(chartKey, currentPnl);
          } else {
            const lastPnl = lastAgentPnlRef.current.get(chartKey);
            (newDataPoint as any)[chartKey] = lastPnl !== undefined ? STARTING_CAPITAL + lastPnl : STARTING_CAPITAL;
          }
        });

        if (!isMounted) return;

        setChartData(prev => {
          if (!isMounted) return prev;
          if (!hasChanges && prev.length > 0) return prev;
          if (isLoading) {
            setIsLoading(false);
            if (chartDataRef.current.length === 0 || chartDataRef.current[0].DEEPSEEK === STARTING_CAPITAL) {
              const firstData = [newDataPoint];
              chartDataRef.current = firstData;
              return firstData;
            } else return prev;
          }

          const lastPoint = prev[prev.length - 1];
          const timeSinceLastPoint = newDataPoint.timestamp && lastPoint?.timestamp ? newDataPoint.timestamp - lastPoint.timestamp : Infinity;
          let updated: ChartDataPoint[];
          if (timeSinceLastPoint < 5000 && prev.length > 0) {
            updated = [...prev.slice(0, -1), newDataPoint];
          } else {
            updated = [...prev, newDataPoint];
          }
          updated.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          const finalData = updated.slice(-MAX_POINTS);
          chartDataRef.current = finalData;
          return finalData;
        });
      } catch (error) {
        console.error('Failed to fetch chart data:', error);
      }
    };

    (async () => {
      try {
        const db = getDb();
        if (!db) throw new Error('no-firebase-db');
        // Path to agent history can be configured via Vite env var, default '/agent_history'
        const AGENT_HISTORY_PATH = import.meta.env.VITE_FIREBASE_AGENT_HISTORY_PATH || '/agent_history';

        // Initial load - last N snapshots
        const q = dbQuery(dbRef(db, AGENT_HISTORY_PATH), orderByChild('timestamp'), limitToLast(MAX_POINTS));
        const snap = await dbGet(q as any);
        const points: ChartDataPoint[] = [];
        let lastTs = 0;
        snap.forEach((child: any) => {
          const val = child.val();
          if (!val) return;
          const ts = Number(val.timestamp) || Date.now();
          lastTs = Math.max(lastTs, ts);
          const pt: ChartDataPoint = {
            time: new Date(ts).getHours().toString().padStart(2, '0') + ':' + new Date(ts).getMinutes().toString().padStart(2, '0'),
            timestamp: ts,
            DEEPSEEK: typeof val.DEEPSEEK === 'number' ? val.DEEPSEEK : STARTING_CAPITAL,
            CLAUDE: typeof val.CLAUDE === 'number' ? val.CLAUDE : STARTING_CAPITAL,
            QWEN: typeof val.QWEN === 'number' ? val.QWEN : STARTING_CAPITAL,
            GEMINI: typeof val.GEMINI === 'number' ? val.GEMINI : STARTING_CAPITAL,
            GROK: typeof val.GROK === 'number' ? val.GROK : STARTING_CAPITAL,
            GPT5: typeof val.GPT5 === 'number' ? val.GPT5 : STARTING_CAPITAL,
          };
          points.push(pt);
        });
        points.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        if (points.length > 0) {
          if (isMounted) {
            // Debug: log loaded snapshots when enabled via env
            if (import.meta.env.VITE_DEBUG_PERF_CHART === 'true') console.debug('[PerformanceChart] loaded snapshots', points);
            chartDataRef.current = points.slice(-MAX_POINTS);
            setChartData([...chartDataRef.current]);
            setIsLoading(false);
          }
        }

        // Subscribe for new snapshots only (start after lastTs)
        const start = lastTs > 0 ? startAt(lastTs + 1) : undefined;
        childQuery = start ? dbQuery(dbRef(db, AGENT_HISTORY_PATH), orderByChild('timestamp'), start) : dbRef(db, AGENT_HISTORY_PATH);
        childHandler = (childSnap: any) => {
          const val = childSnap.val();
          if (!val) return;
          if (import.meta.env.VITE_DEBUG_PERF_CHART === 'true') console.debug('[PerformanceChart] child_added', val);
          const ts = Number(val.timestamp) || Date.now();
          const pt: ChartDataPoint = {
            time: new Date(ts).getHours().toString().padStart(2, '0') + ':' + new Date(ts).getMinutes().toString().padStart(2, '0'),
            timestamp: ts,
            DEEPSEEK: typeof val.DEEPSEEK === 'number' ? val.DEEPSEEK : STARTING_CAPITAL,
            CLAUDE: typeof val.CLAUDE === 'number' ? val.CLAUDE : STARTING_CAPITAL,
            QWEN: typeof val.QWEN === 'number' ? val.QWEN : STARTING_CAPITAL,
            GEMINI: typeof val.GEMINI === 'number' ? val.GEMINI : STARTING_CAPITAL,
            GROK: typeof val.GROK === 'number' ? val.GROK : STARTING_CAPITAL,
            GPT5: typeof val.GPT5 === 'number' ? val.GPT5 : STARTING_CAPITAL,
          };
          setChartData(prev => {
            const last = prev[prev.length - 1];
            if (last && last.timestamp === pt.timestamp) {
              const updated = [...prev.slice(0, -1), pt];
              chartDataRef.current = updated.slice(-MAX_POINTS);
              return updated;
            }
            const updated = [...prev, pt].slice(-MAX_POINTS);
            chartDataRef.current = updated;
            return updated;
          });
        };

        // attach onChildAdded
        onChildAdded(childQuery as any, childHandler as any);

        return;
      } catch (err) {
        console.warn('[PerformanceChart] Firebase history load failed, falling back to API:', err?.message || err);
        // If firebase fails, use API fallback and poll every 30s
        await fallbackApiLoader();
        const interval = setInterval(() => {
          if (isMounted) fallbackApiLoader();
        }, 30 * 1000);
        // cleanup will clear interval below by capturing it in closure
        (window as any).__perfChartApiInterval = (window as any).__perfChartApiInterval || interval;
      }
    })();

    return () => {
      isMounted = false;
      try {
        if (childQuery && childHandler) dbOff(childQuery as any, 'child_added', childHandler as any);
      } catch (e) { /* ignore */ }
    };
    // Remove isLoading from deps - we want this to run continuously
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictionProbabilityMap]);

  // Filter agents to only show those trading the selected market
  const filteredAgents = useMemo(() => {
    if (!selectedMarketId || !predictions || predictions.length === 0) {
      // If no market selected, show all agents
      return agents;
    }

    // Find the selected market
    const selectedMarket = predictions.find(p => p.id === selectedMarketId);
    if (!selectedMarket || !selectedMarket.agentName) {
      // If market not found or has no agent, show all agents
      return agents;
    }

    // Only show agents that are trading this specific market
    const tradingAgentName = selectedMarket.agentName.toUpperCase();
    return agents.filter(agent => {
      // Match agent names (case-insensitive)
      // Agent names in predictions are like "GROK 4", "QWEN 2.5", "DEEPSEEK V3", etc.
      const agentNameUpper = agent.name.toUpperCase();
      const agentIdUpper = agent.id.toUpperCase();
      const shortNameUpper = agent.shortName?.toUpperCase() || '';

      // Check if trading agent name contains agent identifier
      return tradingAgentName.includes(agentIdUpper) ||
        tradingAgentName.includes(shortNameUpper) ||
        tradingAgentName.includes(agentNameUpper.split(' ')[0]) || // Match first word (e.g., "GROK" from "GROK 4")
        agentNameUpper.includes(tradingAgentName.split(' ')[0]); // Match first word of trading agent
    });
  }, [selectedMarketId, predictions]);

  // Calculate base Y-axis domain for proper scaling
  const { baseMinValue, baseMaxValue } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    chartData.forEach((point) => {
      agents.forEach((agent) => {
        const value = point[agent.id as keyof ChartDataPoint] as number;
        if (value !== undefined && value !== null) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      });
    });
    // Add some padding
    const padding = (max - min) * 0.1;
    return {
      baseMinValue: Math.max(0, Math.floor(min - padding)),
      baseMaxValue: Math.ceil(max + padding),
    };
  }, [chartData]);

  // Calculate zoomed Y-axis domain
  const { minValue, maxValue } = useMemo(() => {
    const range = baseMaxValue - baseMinValue;
    const center = (baseMaxValue + baseMinValue) / 2;
    const zoomedRange = range / zoomLevel;

    // Compute a sensible min (keep existing padding/zoom behavior)
    const computedMin = Math.max(0, Math.floor(center - zoomedRange / 2));

    // Compute raw maximum from the most recent data point (avoid old spikes inflating scale)
    let rawMax = -Infinity;
    const lastPoint = chartData && chartData.length ? chartData[chartData.length - 1] : null;
    if (lastPoint) {
      agents.forEach((agent) => {
        const v = Number((lastPoint as any)[agent.id]);
        if (!isNaN(v)) rawMax = Math.max(rawMax, v);
      });
    }
    if (!isFinite(rawMax) || rawMax <= 0) {
      // fallback to the computed base max (with padding) if no recent point available
      rawMax = baseMaxValue;
    }

    // Choose step based on the raw highest value
    const step = rawMax >= 4000 ? 250 : 500;
    const displayedMax = (Math.ceil(rawMax / step) + 1) * step;

    return {
      minValue: computedMin,
      maxValue: displayedMax,
    };
  }, [baseMinValue, baseMaxValue, zoomLevel, chartData]);

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev * 1.5, 5)); // Max 5x zoom
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev / 1.5, 0.5)); // Min 0.5x zoom (zoom out)
  };

  // Generate Y-axis ticks (ensure unique values)
  const yAxisTicks = useMemo(() => {
    const numTicks = 5;

    // Handle edge case where min === max (all values same)
    if (minValue === maxValue) {
      // Return a few ticks around the single value
      return [Math.max(0, minValue - 100), minValue, minValue + 100];
    }

    const step = (maxValue - minValue) / (numTicks - 1);
    const ticks = Array.from({ length: numTicks }, (_, i) => {
      const value = minValue + step * i;
      // Round to avoid floating point precision issues
      return Math.round(value * 100) / 100;
    });

    // Deduplicate ticks (in case of rounding creating duplicates)
    const uniqueTicks = Array.from(new Set(ticks));

    // Ensure we have at least 2 ticks
    if (uniqueTicks.length < 2) {
      return [minValue, maxValue];
    }

    return uniqueTicks;
  }, [minValue, maxValue]);

  // Store domain values for LineEndpoints
  const yDomain = [minValue, maxValue];

  // Compute inner chart width to allow horizontal scrolling when there are many points
  const chartInnerWidth = Math.max(900, chartData.length * 90);
  // Chart visual sizing
  // Compute a stable pixel chart height so Recharts' ResponsiveContainer has a concrete height.
  const [chartHeightPx, setChartHeightPx] = useState<number>(() => Math.max(320, Math.floor((typeof window !== 'undefined' ? window.innerHeight : 800) - 160)));
  const chartHeight = chartHeightPx;
  const chartMargin = { top: 20, right: 160, bottom: 30, left: 0 };
  const axisWidth = 80; // reserved left axis column width (wider to better fill sidebar)
  const chartInnerHeight = Math.max(120, chartHeight - chartMargin.top - chartMargin.bottom);

  // Previous height (for toggling collapse/restore)
  const prevHeightRef = useRef<number | null>(null);

  // Update pixel height on resize (debounced) so the chart has a concrete pixel height
  useLayoutEffect(() => {
    let t: any = null;
    const handleResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const newH = Math.max(240, Math.floor(window.innerHeight - 160));
        setChartHeightPx(newH);
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    // run once
    handleResize();
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Allow interactive resizing (vertical collapse/expand and horizontal width change)
  const draggingVerRef = useRef(false);
  const dragStartYRef = useRef(0);
  const startHeightRef = useRef(0);

  const draggingHorRef = useRef(false);
  const dragStartXRef = useRef(0);
  const startInnerWidthRef = useRef(0);

  const [userInnerWidthPx, setUserInnerWidthPx] = useState<number | null>(null);

  // Scroll-drag refs (drag inside chart to pan horizontally)
  const draggingScrollRef = useRef(false);
  const scrollStartXRef = useRef(0);
  const startScrollLeftRef = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingVerRef.current) {
        const clientY = e.clientY;
        const dy = clientY - dragStartYRef.current;
        const newH = Math.max(120, Math.min(window.innerHeight - 80, startHeightRef.current + dy));
        setChartHeightPx(newH);
      }
      if (draggingHorRef.current) {
        const clientX = e.clientX;
        const dx = clientX - dragStartXRef.current;
        const newW = Math.max(400, startInnerWidthRef.current + dx);
        setUserInnerWidthPx(newW);
      }
      if (draggingScrollRef.current) {
        const clientX = e.clientX;
        const dx = clientX - scrollStartXRef.current;
        const el = scrollRef.current;
        if (el) {
          // dragging left (dx < 0) should scroll right (increase scrollLeft)
          const next = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, startScrollLeftRef.current - dx));
          el.scrollLeft = next;
        }
      }
    };
    const onUp = () => {
      draggingVerRef.current = false;
      draggingHorRef.current = false;
      draggingScrollRef.current = false;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mouseleave', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mouseleave', onUp);
    };
  }, []);

  // Scroll handling
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to right (latest) when new data arrives, unless user scrolled manually
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Always scroll to rightmost position after layout when data updates
    try {
      el.scrollTo({ left: Math.max(0, el.scrollWidth - el.clientWidth), behavior: 'smooth' });
    } catch (e) {
      // fallback
      el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    }
  }, [chartData.length]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Component-local styles to hide native scrollbars for the chart scroll container */}
      <style>{`
        /* Show a thin, dark horizontal scrollbar while keeping vertical overflow hidden */
        .perf-chart-scroll { -ms-overflow-style: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.10) rgba(0,0,0,0.06); }
        .perf-chart-scroll { background: transparent; }

        /* WebKit scrollbar styling (Chrome, Edge) */
        .perf-chart-scroll::-webkit-scrollbar { height: 10px; }
        .perf-chart-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.10); border-radius: 10px; }
        .perf-chart-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 10px; border: 2px solid rgba(0,0,0,0.05); }
        .perf-chart-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.12); }

        /* Splitter bar between header and chart */
        .chart-splitter { transition: background 120ms ease; }
        .chart-splitter:hover { background: rgba(255,255,255,0.03); }
      `}</style>
      {/* Chart Header */}
      <div className="h-10 flex items-center justify-between px-2 sm:px-4 border-b border-border bg-background min-w-0 overflow-hidden">
        <span className="text-[10px] sm:text-xs text-terminal-accent font-mono leading-none flex items-center flex-shrink-0 whitespace-nowrap">
          <span className="hidden sm:inline">&gt; PERFORMANCE_INDEX</span>
          <span className="sm:hidden">&gt; PERF</span>
        </span>
        <div className="flex gap-1 sm:gap-2 items-center min-w-0 flex-shrink">
          {/* Zoom Controls - only show in chart view */}
          {viewMode === "chart" && (
            <div className="flex gap-0.5 sm:gap-1 items-center border-r border-border pr-1 sm:pr-2 mr-1 sm:mr-2 flex-shrink-0">
              <button
                onClick={handleZoomOut}
                className="text-[9px] sm:text-xs px-1 sm:px-1.5 py-0.5 sm:py-1 border border-border rounded-full hover:bg-muted transition-colors flex items-center justify-center"
                title="Zoom Out"
              >
                <ZoomOut className="h-2.5 sm:h-3 w-2.5 sm:w-3" />
              </button>
              <button
                onClick={handleZoomIn}
                className="text-[9px] sm:text-xs px-1 sm:px-1.5 py-0.5 sm:py-1 border border-border rounded-full hover:bg-muted transition-colors flex items-center justify-center"
                title="Zoom In"
              >
                <ZoomIn className="h-2.5 sm:h-3 w-2.5 sm:w-3" />
              </button>
            </div>
          )}
          {/* View Mode Toggle */}
          <div className="flex gap-0.5 sm:gap-1 flex-shrink-0">
            <button
              onClick={() => setViewMode("chart")}
              className={`text-[9px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 border border-border rounded-full whitespace-nowrap ${viewMode === "chart" ? 'bg-muted' : 'hover:bg-muted'
                } transition-colors`}
            >
              CHART
            </button>
            <button
              onClick={() => setViewMode("technical")}
              className={`text-[9px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 border border-border rounded-full whitespace-nowrap ${viewMode === "technical" ? 'bg-muted' : 'hover:bg-muted'
                } transition-colors`}
            >
              TECH
            </button>
          </div>

          {/* Agent Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-0.5 sm:py-1 text-[9px] sm:text-xs font-medium text-foreground hover:bg-muted/50 transition-colors border border-border bg-background rounded-full min-w-0 overflow-hidden">
              <span className="truncate max-w-[60px] sm:max-w-none">{selectedAgent || "All"}</span>
              <ChevronDown className="h-2.5 sm:h-3 w-2.5 sm:w-3 opacity-50 flex-shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-background border-border rounded-xl">
              <DropdownMenuItem
                onClick={() => setSelectedAgent(null)}
                className={`cursor-pointer text-sm ${!selectedAgent ? 'bg-muted text-primary font-medium' : ''}`}
              >
                All Agents
              </DropdownMenuItem>
              {filteredAgents.map((agent) => (
                <DropdownMenuItem
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
                  className={`cursor-pointer text-sm ${selectedAgent === agent.id ? 'bg-muted text-primary font-medium' : ''}`}
                >
                  {agent.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content Area */}
      {viewMode === "chart" ? (
        <div className="flex-1 relative" style={{ backgroundColor: "#050608" }}>
          {/* Horizontal splitter: drag to resize chart height, double-click to collapse/restore */}
          <div
            className="chart-splitter"
            onMouseDown={(e) => {
              e.preventDefault();
              draggingVerRef.current = true;
              dragStartYRef.current = e.clientY;
              startHeightRef.current = chartHeightPx;
              document.body.style.cursor = 'row-resize';
            }}
            onDoubleClick={() => {
              // toggle collapse/restore
              if (chartHeightPx > 140) {
                prevHeightRef.current = chartHeightPx;
                setChartHeightPx(120);
              } else {
                setChartHeightPx(prevHeightRef.current ?? Math.max(320, Math.floor(window.innerHeight - 160)));
              }
            }}
            style={{ position: 'absolute', left: 0, right: 0, height: 8, top: -4, zIndex: 90, cursor: 'row-resize' }}
          />
          {/* Dollar Sign Icon - Top Right */}
          <div className="absolute top-4 right-4 z-10 pointer-events-none">
            <DollarSign className="w-5 h-5 text-muted-foreground opacity-50" />
          </div>

          <div style={{ padding: '8px 12px' }}>
            <div className="chart-area" style={{ display: 'flex', alignItems: 'stretch', height: chartHeight, position: 'relative' }}>
              {/* (Removed vertical hover handle; use full-width splitter instead) */}
              {/* Fixed Y-axis column (labels remain visible while chart scrolls) */}
              <div style={{ width: axisWidth, paddingTop: chartMargin.top, paddingBottom: chartMargin.bottom, boxSizing: 'border-box', color: '#C6CBD9', fontSize: 11, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                <div style={{ position: 'relative', height: chartInnerHeight }}>
                  {yAxisTicks.map((tick) => {
                    // position tick vertically as a percentage so we don't need pixel measurements
                    const ratio = maxValue === minValue ? 0.5 : (maxValue - tick) / (maxValue - minValue);
                    const topPercent = Math.min(Math.max(0, ratio * 100), 100);
                    return (
                      <div key={String(tick)} style={{ position: 'absolute', left: 0, right: 0, top: `${topPercent}%`, transform: 'translateY(-50%)', display: 'flex', justifyContent: 'flex-end', paddingRight: 12 }}>
                        <span style={{ color: '#C6CBD9', whiteSpace: 'nowrap' }}>${Number(tick).toFixed(0)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Scrollable chart area */}
              <div
                ref={scrollRef}
                onScroll={() => { /* noop: auto-snap occurs on data update */ }}
                className="perf-chart-scroll"
                style={{ height: chartHeight, overflowX: 'auto', overflowY: 'hidden', flex: 1, position: 'relative' }}
              >
                <div style={{ width: userInnerWidthPx ?? chartInnerWidth, height: '100%', position: 'relative' }}>
                  {/* Right-edge handle remains for large drags (kept simple) */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      draggingHorRef.current = true;
                      dragStartXRef.current = e.clientX;
                      startInnerWidthRef.current = userInnerWidthPx ?? chartInnerWidth;
                      document.body.style.cursor = 'col-resize';
                    }}
                    style={{ position: 'absolute', right: 0, top: 0, width: 12, height: '100%', cursor: 'col-resize', zIndex: 60, opacity: 0.06 }}
                  />
                  <ResponsiveContainer width={chartInnerWidth} height="100%">
                    <ComposedChart
                      data={chartData}
                      margin={{ top: chartMargin.top, right: chartMargin.right, bottom: chartMargin.bottom, left: 0 }}
                      style={{ backgroundColor: "transparent" }}
                    >
                      <CartesianGrid
                        stroke="#242935"
                        strokeWidth={1}
                        vertical={false}
                        horizontal={true}
                      />

                      {/* Reference Line - Faint white dashed */}
                      <ReferenceLine
                        y={STARTING_CAPITAL}
                        stroke="rgba(255, 255, 255, 0.2)"
                        strokeWidth={1}
                        strokeDasharray="5 5"
                      />

                      <XAxis
                        dataKey="time"
                        axisLine={false}
                        tickLine={false}
                        interval={Math.max(0, Math.floor(chartData.length / 8))}
                        tick={{
                          fill: "#C6CBD9",
                          fontSize: 11,
                          fontFamily: "system-ui, -apple-system, sans-serif",
                        }}
                      />

                      {/* Keep an invisible YAxis so Recharts retains correct scaling */}
                      <YAxis domain={[minValue, maxValue]} axisLine={false} tick={false} tickLine={false} />

                      <Tooltip
                        content={<MultiAgentTooltip />}
                        cursor={{ stroke: "#3A404B", strokeWidth: 1, strokeDasharray: "none" }}
                      />

                      {/* Clean Lines Only - No Areas */}
                      {agents.map((agent) => {
                        const isVisible = selectedAgent === null || selectedAgent === agent.id;

                        if (!isVisible) return null;

                        return (
                          <Line
                            key={agent.id}
                            type="linear"
                            connectNulls
                            dataKey={agent.id}
                            stroke={agent.color}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{
                              r: 4,
                              fill: agent.color,
                              strokeWidth: 2,
                              stroke: "#050608",
                            }}
                            isAnimationActive={false}
                          />
                        );
                      })}

                      {/* Brush for horizontal navigation (removed to declutter UI) */}

                      {/* Agents at End of Lines */}
                      <Customized component={createLineEndpoints(selectedAgent, chartData)} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <TechnicalView />
      )}
    </div>
  );
};
