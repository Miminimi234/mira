import { getDb } from '@/lib/firebase/client';
import { get as dbGet, off as dbOff, query as dbQuery, ref as dbRef, limitToLast, onChildAdded, orderByChild, startAt } from 'firebase/database';
import { DollarSign, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Customized, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

// In-memory storage for chart snapshots (replaces previous localStorage usage)
let __inMemoryChartStorage: ChartDataPoint[] | null = null;
function loadStoredChartData(): ChartDataPoint[] | null {
  return __inMemoryChartStorage;
}
function saveStoredChartData(data: ChartDataPoint[]) {
  __inMemoryChartStorage = Array.isArray(data) ? [...data] : null;
}

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

  const scaleY = (value: number) => {
    const [min, max] = yDomain;
    if (max === min) return chartTop + chartHeight / 2;
    const ratio = (max - value) / (max - min);
    return chartTop + ratio * chartHeight;
  };

  return (
    <g>
      {agents.map((agent, idx) => {
        const isVisible = selectedAgent === null || selectedAgent === agent.id;
        if (!isVisible) return null;
        const value = lastDataPoint[agent.id as keyof ChartDataPoint] as number;
        if (value === undefined || value === null) return null;

        const xPos = chartLeft + chartWidth;
        const yPos = scaleY(value);

        const connectorLength = 12;
        const circleR = 14;
        const boxHeight = 28;
        const text = `$${Number(value).toFixed(0)}`;
        const textWidthEstimate = Math.max(56, text.length * 9 + 8);
        const gap = 8;
        const badgeX = xPos + connectorLength + 8; // starting point for badge group

        // clamp so badges don't overflow the container
        const maxRight = chartLeft + chartWidth + 200; // works with chartMargin.right
        const totalWidth = circleR * 2 + gap + textWidthEstimate + 8;
        const clampedBadgeX = Math.min(badgeX, maxRight - totalWidth);

        const circleCX = clampedBadgeX + circleR;
        const circleCY = yPos;
        const boxX = clampedBadgeX + circleR * 2 + gap;
        const boxY = yPos - boxHeight / 2;

        return (
          <g key={agent.id} style={{ pointerEvents: 'none' }}>
            <line x1={xPos} y1={yPos} x2={xPos + connectorLength} y2={yPos} stroke={agent.color} strokeWidth={1} opacity={0.9} />

            {/* Circle with logo */}
            <circle cx={circleCX} cy={circleCY} r={circleR} fill="#0B0F17" stroke={agent.color} strokeWidth={1.5} />
            {AGENT_LOGO[agent.logoKey] && (
              <image href={AGENT_LOGO[agent.logoKey]} x={circleCX - (circleR - 2)} y={circleCY - (circleR - 2)} width={(circleR - 2) * 2} height={(circleR - 2) * 2} preserveAspectRatio="xMidYMid slice" />
            )}

            {/* Value rounded box */}
            <g>
              <rect x={boxX} y={boxY} rx={8} ry={8} width={textWidthEstimate + 8} height={boxHeight} fill="#0B0F17" stroke="rgba(255,255,255,0.06)" />
              <text x={boxX + 12} y={boxY + boxHeight / 2 + 5} fill="#FFFFFF" fontSize={12} fontWeight={700} fontFamily="system-ui, -apple-system, sans-serif">{text}</text>
            </g>
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
  // Horizontal zoom (controls width per data point)
  const [horizontalZoom, setHorizontalZoom] = useState<number>(1);
  const BASE_POINT_WIDTH = Number((import.meta.env.VITE_PERF_CHART_POINT_WIDTH as string) || 90);

  // PERSISTENT chart data - switched off localStorage: chart will be built from
  // Firebase history on initial load and then updated via realtime child_added.
  const MAX_POINTS = Number((import.meta.env.VITE_PERF_CHART_POINTS as string) || 240);

  // Start empty; we'll populate from Firebase (or fallback API) when data arrives.
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);

  // Active data source for the chart (real data)
  const activeData = chartData;

  // Anchor start tie to the first provided tick timestamp (not mount time).
  // The chart X domain will start at the timestamp of the first data point we have
  // and grow to the latest data point (`dataMax`). We initialize to `null` and set
  // this value once the initial data load provides the first timestamp.
  const startTimeMsRef = useRef<number | null>(null);

  const formatTime = (ms: number) => {
    try {
      const d = new Date(ms);
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0') + ':' + d.getSeconds().toString().padStart(2, '0');
    } catch (e) {
      return String(ms);
    }
  };

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const lastAgentPnlRef = useRef<Map<string, number>>(new Map());
  const animationDisabled = true;

  // No in-memory module-level ref: we use localStorage for persistence.

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
            const stored = loadStoredChartData();
            if (!stored || stored[0].DEEPSEEK === STARTING_CAPITAL) {
              const firstData = [newDataPoint];
              saveStoredChartData(firstData);
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
          saveStoredChartData(finalData);
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
            const finalPoints = points.slice(-MAX_POINTS);
            setChartData([...finalPoints]);
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
              return updated;
            }
            const updated = [...prev, pt].slice(-MAX_POINTS);
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
    // Center the Y domain around the STARTING_CAPITAL so that the baseline
    // always appears visually in the middle of the chart.
    // Compute the maximum absolute deviation from STARTING_CAPITAL across
    // all points, then create a symmetric domain around STARTING_CAPITAL.
    let maxDeviation = 0;
    activeData.forEach((point) => {
      agents.forEach((agent) => {
        const value = point[agent.id as keyof ChartDataPoint] as number;
        if (value !== undefined && value !== null && !isNaN(value)) {
          const dev = Math.abs(value - STARTING_CAPITAL);
          if (dev > maxDeviation) maxDeviation = dev;
        }
      });
    });

    // If no meaningful data, provide a larger default range so all models
    // appear separated on the chart by default.
    if (!isFinite(maxDeviation) || maxDeviation <= 0) maxDeviation = 2000; // default deviation

    // Add a small padding to make the curves breathe visually
    const padding = Math.max(200, Math.round(maxDeviation * 0.12));
    const halfRange = Math.ceil(maxDeviation + padding);

    const computedMin = Math.max(0, STARTING_CAPITAL - halfRange);
    const computedMax = STARTING_CAPITAL + halfRange;

    return {
      baseMinValue: computedMin,
      baseMaxValue: computedMax,
    };
  }, [activeData]);

  // (debug logging removed)

  // Calculate zoomed Y-axis domain
  const { minValue, maxValue } = useMemo(() => {
    const range = baseMaxValue - baseMinValue;
    const center = (baseMaxValue + baseMinValue) / 2;
    const zoomedRange = range / zoomLevel;

    // Compute a sensible min (keep existing padding/zoom behavior)
    const computedMin = Math.max(0, Math.floor(center - zoomedRange / 2));

    // Compute raw maximum from the most recent data point (avoid old spikes inflating scale)
    let rawMax = -Infinity;
    const lastPoint = activeData && activeData.length ? activeData[activeData.length - 1] : null;
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
  }, [baseMinValue, baseMaxValue, zoomLevel, activeData]);

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev * 1.5, 5)); // Max 5x zoom
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev / 1.5, 0.5)); // Min 0.5x zoom (zoom out)
  };

  const handleHZoomIn = () => {
    setHorizontalZoom(prev => {
      const next = Math.min(prev * 1.5, 6);
      setUserInnerWidthPx(Math.ceil(activeData.length * BASE_POINT_WIDTH * next));
      // after zoom, snap to rightmost so latest data stays visible
      setTimeout(() => {
        const el = scrollRef.current;
        if (el) {
          try { el.scrollTo({ left: Math.max(0, el.scrollWidth - el.clientWidth), behavior: 'smooth' }); } catch (e) { el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth); }
        }
      }, 50);
      return next;
    });
  };

  const handleHZoomOut = () => {
    setHorizontalZoom(prev => {
      const next = Math.max(prev / 1.5, 0.25);
      setUserInnerWidthPx(Math.ceil(activeData.length * BASE_POINT_WIDTH * next));
      setTimeout(() => {
        const el = scrollRef.current;
        if (el) {
          try { el.scrollTo({ left: Math.max(0, el.scrollWidth - el.clientWidth), behavior: 'smooth' }); } catch (e) { el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth); }
        }
      }, 50);
      return next;
    });
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
  // user-controlled inner width (may be set by drag-resize); declare early to avoid TDZ
  const [userInnerWidthPx, setUserInnerWidthPx] = useState<number | null>(null);

  // Compute inner chart width to allow horizontal scrolling when there are many points
  const computedChartInnerWidth = Math.max(900, Math.ceil(activeData.length * BASE_POINT_WIDTH * horizontalZoom));
  const chartInnerWidth = userInnerWidthPx ?? computedChartInnerWidth;
  // Chart visual sizing
  // Compute a stable pixel chart height so Recharts' ResponsiveContainer has a concrete height.
  const [chartHeightPx, setChartHeightPx] = useState<number>(() => Math.max(320, Math.floor((typeof window !== 'undefined' ? window.innerHeight : 800) - 160)));
  const chartHeight = chartHeightPx;
  const chartMargin = { top: 20, right: 120, bottom: 30, left: 0 };
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

  // Mouse-wheel handler on the chart area:
  // - Ctrl/Cmd + wheel => horizontal zoom
  // - wheel only (no mod) => horizontal pan (scroll)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      if (isMod) {
        // Zoom horizontally
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        setHorizontalZoom(prev => {
          const next = Math.min(6, Math.max(0.25, +(prev * factor).toFixed(4)));
          const nextWidth = Math.ceil(activeData.length * BASE_POINT_WIDTH * next);
          setUserInnerWidthPx(nextWidth);
          return next;
        });
        return;
      }

      // No modifier: perform horizontal panning inside the chart container
      // Only hijack the wheel if horizontal scrolling is possible
      const canScrollHorizontally = el.scrollWidth > el.clientWidth + 1;
      if (!canScrollHorizontally) return;

      // Prevent vertical page scrolling while panning the chart
      e.preventDefault();

      // Move scrollLeft by deltaY (invert as needed) and clamp
      // Use a multiplier to make panning feel natural
      const multiplier = 1; // adjust sensitivity if needed
      const next = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + e.deltaY * multiplier));
      el.scrollLeft = next;
    };

    const opts = { passive: false, capture: true } as AddEventListenerOptions;
    el.addEventListener('wheel', onWheel as any, opts);
    return () => el.removeEventListener('wheel', onWheel as any, opts as any);
  }, [activeData.length, BASE_POINT_WIDTH]);

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
  }, [activeData.length]);

  // Ensure `startTimeMsRef` is set to the first data point timestamp we have.
  // We only set it once (when null) so the visible window anchors to the first
  // provided tick rather than the component mount time.
  useEffect(() => {
    if (startTimeMsRef.current != null) return;
    if (activeData && activeData.length > 0) {
      const firstTs = activeData[0].timestamp ?? null;
      if (firstTs && typeof firstTs === 'number') {
        startTimeMsRef.current = firstTs;
      } else {
        // Fallback: use the earliest numeric timestamp found in the array
        const earliest = activeData.reduce((acc, p) => Math.min(acc, p.timestamp ?? acc), Infinity);
        if (isFinite(earliest)) startTimeMsRef.current = earliest;
      }
    }
  }, [activeData]);

  // Compute X axis ticks at 5 second (5000ms) intervals starting from the first
  // provided tick (startTimeMsRef) up to the latest data point timestamp.
  const ticksForXAxis = useMemo(() => {
    const start = startTimeMsRef.current ?? (activeData && activeData[0]?.timestamp) ?? Date.now();
    const end = (activeData && activeData.length ? activeData[activeData.length - 1].timestamp : start) ?? start;
    if (end <= start) return [start];
    const ticks: number[] = [];
    // Use exact 5000ms steps from the first tick timestamp
    const STEP = 5000;
    // Prevent extremely large arrays in degenerate cases
    const maxSteps = 1000;
    let steps = 0;
    for (let t = start; t <= end && steps < maxSteps; t += STEP, steps++) {
      ticks.push(t);
    }
    // Ensure last tick includes end if it wasn't hit exactly
    if (ticks.length === 0 || ticks[ticks.length - 1] < end) ticks.push(end);
    return ticks;
  }, [activeData]);

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
          {/* (sample toggle removed) */}
          {/* Zoom controls moved to bottom-left of chart area for easier access */}
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
          {/* Agent filter (dropdown) - allows showing only one agent or all */}
          <div className="flex items-center ml-2">
            <label htmlFor="agent-filter" className="sr-only">Agent Filter</label>
            <select
              id="agent-filter"
              value={selectedAgent ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedAgent(v === '' ? null : v);
              }}
              className="text-[10px] sm:text-xs border rounded px-2 py-1 text-white outline-none focus:ring-0 appearance-none"
              title="Show only selected agent"
              style={{ backgroundColor: '#050608', borderColor: 'rgba(255,255,255,0.06)', color: '#FFFFFF' }}
            >
              <option value="" style={{ backgroundColor: '#050608', color: '#FFFFFF' }}>All agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id} style={{ backgroundColor: '#050608', color: '#FFFFFF' }}>{a.name}</option>
              ))}
            </select>
          </div>
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
              {/* Bottom-left zoom controls (moved from header) */}
              {viewMode === 'chart' && (
                <div style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 120, display: 'flex', gap: 6 }}>
                  <div className="flex gap-0.5 items-center bg-[rgba(0,0,0,0.35)] p-1 rounded-md border border-[rgba(255,255,255,0.04)]">
                    <button
                      onClick={handleZoomOut}
                      className="text-[10px] px-2 py-1 border border-border rounded-full hover:bg-muted transition-colors flex items-center justify-center"
                      title="Zoom Out"
                      aria-label="Zoom Out"
                    >
                      <ZoomOut className="h-3 w-3" />
                    </button>
                    <button
                      onClick={handleZoomIn}
                      className="text-[10px] px-2 py-1 border border-border rounded-full hover:bg-muted transition-colors flex items-center justify-center"
                      title="Zoom In"
                      aria-label="Zoom In"
                    >
                      <ZoomIn className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="flex gap-0.5 items-center bg-[rgba(0,0,0,0.35)] p-1 rounded-md border border-[rgba(255,255,255,0.04)]">
                    <button
                      onClick={handleHZoomOut}
                      className="text-[10px] px-2 py-1 border border-border rounded-full hover:bg-muted transition-colors flex items-center justify-center"
                      title="Horizontal Zoom Out"
                      aria-label="Horizontal Zoom Out"
                    >
                      <span style={{ fontSize: 12, lineHeight: 1 }}>H-</span>
                    </button>
                    <button
                      onClick={handleHZoomIn}
                      className="text-[10px] px-2 py-1 border border-border rounded-full hover:bg-muted transition-colors flex items-center justify-center"
                      title="Horizontal Zoom In"
                      aria-label="Horizontal Zoom In"
                    >
                      <span style={{ fontSize: 12, lineHeight: 1 }}>H+</span>
                    </button>
                  </div>
                </div>
              )}
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
                  {/* debug overlay removed */}
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
                      data={activeData}
                      margin={{ top: chartMargin.top, right: chartMargin.right, bottom: chartMargin.bottom, left: 0 }}
                      style={{ backgroundColor: "transparent" }}
                    >
                      <defs>
                        {/* Soft blur filter used for drip areas only (reduced blur so lines stay crisp) */}
                        <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
                          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                          <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                        {agents.map((agent) => (
                          <>
                            <linearGradient key={`main-${agent.id}`} id={`grad-${agent.id}`} x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor={agent.color} stopOpacity={0.9} />
                              <stop offset="18%" stopColor={agent.color} stopOpacity={0.6} />
                              <stop offset="45%" stopColor={agent.color} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={agent.color} stopOpacity={0.12} />
                            </linearGradient>

                            {/* Drip gradient: stronger near the line, long fade to transparent */}
                            <linearGradient key={`drip-${agent.id}`} id={`grad-drip-${agent.id}`} x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor={agent.color} stopOpacity={0.7} />
                              <stop offset="20%" stopColor={agent.color} stopOpacity={0.46} />
                              <stop offset="50%" stopColor={agent.color} stopOpacity={0.22} />
                              <stop offset="100%" stopColor={agent.color} stopOpacity={0.06} />
                            </linearGradient>
                          </>
                        ))}
                      </defs>

                      {/* Additional styles for drip effect via SVG filter and CSS */}
                      <style>{`
                        .drip-area { filter: url(#softGlow); opacity: 0.85; mix-blend-mode: multiply; }
                      `}</style>

                      <CartesianGrid stroke="#1b1e23" strokeWidth={1} vertical={false} horizontal={true} />

                      {/* Reference Line - Faint white dashed */}
                      {/* subtle baseline */}
                      <ReferenceLine y={STARTING_CAPITAL} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

                      <XAxis
                        dataKey="timestamp"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        ticks={ticksForXAxis}
                        axisLine={false}
                        tickLine={false}
                        tickCount={8}
                        tick={{
                          fill: "#C6CBD9",
                          fontSize: 11,
                          fontFamily: "system-ui, -apple-system, sans-serif",
                        }}
                        tickFormatter={(val: any) => formatTime(Number(val))}
                      />

                      {/* Keep an invisible YAxis so Recharts retains correct scaling */}
                      <YAxis domain={[minValue, maxValue]} axisLine={false} tick={false} tickLine={false} />

                      <Tooltip
                        content={<MultiAgentTooltip />}
                        cursor={{ stroke: "#3A404B", strokeWidth: 1, strokeDasharray: "none" }}
                      />

                      {/* Smooth Areas (all agents) - render first so Lines appear on top */}
                      {agents.map((agent) => {
                        const isVisible = selectedAgent === null || selectedAgent === agent.id;
                        if (!isVisible) return null;

                        // Use gradient fills (drip + main) and moderate opacity so color appears clearly
                        const dripFillOpacity = 0.65;
                        const mainFillOpacity = 0.6;

                        return (
                          <g key={`areas-${agent.id}`}>
                            <Area
                              type="monotone"
                              connectNulls
                              dataKey={agent.id}
                              stroke="none"
                              fill={`url(#grad-drip-${agent.id})`}
                              fillOpacity={dripFillOpacity}
                              dot={false}
                              activeDot={false}
                              isAnimationActive={false}
                              className="drip-area"
                              style={{ mixBlendMode: 'normal' }}
                            />
                            <Area
                              type="monotone"
                              connectNulls
                              dataKey={agent.id}
                              stroke={agent.color}
                              strokeWidth={0}
                              strokeOpacity={0}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill={`url(#grad-${agent.id})`}
                              fillOpacity={mainFillOpacity}
                              dot={false}
                              activeDot={false}
                              isAnimationActive={false}
                              style={{ mixBlendMode: 'multiply' }}
                            />
                          </g>
                        );
                      })}

                      {/* Lines (render after Areas so strokes sit on top) */}
                      {agents.map((agent) => {
                        const isVisible = selectedAgent === null || selectedAgent === agent.id;
                        if (!isVisible) return null;

                        // Use agent color for sample-mode too; slightly thicker strokes for readability
                        return (
                          <Line
                            key={`line-${agent.id}`}
                            type="monotone"
                            connectNulls
                            dataKey={agent.id}
                            stroke={agent.color}
                            strokeWidth={2}
                            strokeOpacity={1}
                            dot={false}
                            activeDot={{
                              r: 4,
                              fill: agent.color,
                              strokeWidth: 2,
                              stroke: "#050608",
                            }}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            isAnimationActive={false}
                          />
                        );
                      })}



                      {/* Brush for horizontal navigation (removed to declutter UI) */}

                      {/* Agents at End of Lines */}
                      <Customized component={createLineEndpoints(selectedAgent, activeData)} />
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
