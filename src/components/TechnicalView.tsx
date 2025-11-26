import { listenToAgentBalances } from '@/lib/firebase/listeners';
import { useEffect, useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";

type AgentCard = {
  id: string;
  title: string;
  cash: number;
  total: number;
  pnl: number;
  winPct: number;
  wins: number;
  losses: number;
  exposure: number;
  maxExp: number;
  calls: number;
  minConf: number;
  color?: string;
  logo?: string;
};

// RTDB is the single source of truth for agent balances; no local SAMPLE fallback.
// const SAMPLE_AGENTS: AgentCard[] = [
//   { id: 'deepseek', title: 'DeepSeek V3.1', cash: 1319.86, total: 1565.48, pnl: 465.48, winPct: 37.5, wins: 9, losses: 14, exposure: 245.26, maxExp: 32.95, calls: 1295, minConf: 0.6, color: '#4BD2A4', logo: '/deepseek.png' },
//   { id: 'gemini', title: 'Gemini 3', cash: 593.47, total: 738.46, pnl: -381.54, winPct: 43.78, wins: 84, losses: 94, exposure: 144.99, maxExp: 19.08, calls: 1295, minConf: 0.6, color: '#8AA4FF', logo: '/GEMENI.png' },
//   { id: 'claude', title: 'Claude 4.5', cash: 272.34, total: 613.29, pnl: -586.71, winPct: 39.11, wins: 106, losses: 147, exposure: 240.93, maxExp: 51.31, calls: 1295, minConf: 0.6, color: '#F79A4F', logo: '/Claude_AI_symbol.svg' },
//   { id: 'qwen', title: 'Qwen 3', cash: 138.03, total: 354.04, pnl: -745.60, winPct: 32.81, wins: 125, losses: 223, exposure: 215.44, maxExp: 70.41, calls: 1295, minConf: 0.6, color: '#6b9e7d', logo: '/Qwen_logo.svg' },
//   { id: 'grok', title: 'Grok 4.1', cash: 276.69, total: 276.60, pnl: -823.40, winPct: 43.82, wins: 110, losses: 132, exposure: 0, maxExp: 45.0, calls: 1295, minConf: 0.6, color: '#F4E6A6', logo: '/grok.png' },
//   { id: 'gpt5', title: 'GPT-5.1', cash: 161.39, total: 161.33, pnl: -938.67, winPct: 24.62, wins: 16, losses: 47, exposure: 0, maxExp: 85.12, calls: 1295, minConf: 0.6, color: '#C8C8FF', logo: '/GPT.png' },
// ];

const formatCurrency = (v: number) => {
  if (!isFinite(v)) return '$0.00';
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
};

function MiniRadarSVG({ values = [0.4, 0.6, 0.3], size = 120, color = '#888' }: { values?: number[]; size?: number; color?: string }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = Math.min(size, size) / 2 - 6;
  const points = values.map((v, i) => {
    const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
    const px = cx + Math.cos(angle) * r * v;
    const py = cy + Math.sin(angle) * r * v;
    return `${px},${py}`;
  }).join(' ');

  // Outer polygon grid
  const grid = [0.25, 0.5, 0.75, 1].map((p, idx) => {
    const pts = values.map((_, i) => {
      const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
      const px = cx + Math.cos(angle) * r * p;
      const py = cy + Math.sin(angle) * r * p;
      return `${px},${py}`;
    }).join(' ');
    return <polygon key={idx} points={pts} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1} />;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="radGrad" x1="0" x2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.85} />
          <stop offset="100%" stopColor={color} stopOpacity={0.4} />
        </linearGradient>
      </defs>
      {grid}
      <polygon points={points} fill="url(#radGrad)" stroke={color} strokeWidth={1.5} fillOpacity={0.55} />
    </svg>
  );
}

const AGENT_LOGO: Record<string, string> = {
  GROK: "/grok.png",
  GEMINI: "/GEMENI.png",
  DEEPSEEK: "/deepseek.png",
  CLAUDE: "/Claude_AI_symbol.svg",
  GPT5: "/GPT.png",
  QWEN: "/Qwen_logo.svg",
};

const AGENT_COLORS: Record<string, string> = {
  GROK: '#F4E6A6',
  GEMINI: '#8AA4FF',
  DEEPSEEK: '#4BD2A4',
  CLAUDE: '#F79A4F',
  GPT5: '#C8C8FF',
  QWEN: '#6b9e7d',
};

const getAgentLogoKey = (nameOrId?: string) => {
  if (!nameOrId) return undefined;
  const n = String(nameOrId).toUpperCase();
  if (n.includes('GROK')) return 'GROK';
  if (n.includes('CLAUDE')) return 'CLAUDE';
  if (n.includes('DEEPSEEK')) return 'DEEPSEEK';
  if (n.includes('GEMINI')) return 'GEMINI';
  if (n.includes('QWEN')) return 'QWEN';
  if (n.includes('GPT')) return 'GPT5';
  return undefined;
};

interface AgentStats {
  id: string;
  name: string;
  emoji: string;
  color: string;
  cash: number;
  total: number;
  pnl: number;
  winRate: number;
  wins: number;
  losses: number;
  exposure: number;
  maxExposure: number;
  calls: number;
  minConf: number;
}

// RTDB is the single source of truth; but we allow a mock mode for local simulation.
const DEFAULT_MOCK_AGENTS: AgentStats[] = [
  { id: 'deepseek', name: 'DeepSeek V3', emoji: '', color: '#4BD2A4', cash: 1565.48, total: 1565.48, pnl: 565.48, winRate: 37.5, wins: 9, losses: 14, exposure: 245.26, maxExposure: 32.95, calls: 1295, minConf: 0.6 },
  { id: 'gemini', name: 'Gemini 2.5', emoji: '', color: '#8AA4FF', cash: 738.46, total: 738.46, pnl: -381.54, winRate: 43.78, wins: 84, losses: 94, exposure: 144.99, maxExposure: 19.08, calls: 1295, minConf: 0.6 },
  { id: 'grok', name: 'Grok 4', emoji: '', color: '#F4E6A6', cash: 276.60, total: 276.60, pnl: -823.40, winRate: 40.89, wins: 110, losses: 132, exposure: 0, maxExposure: 45.0, calls: 1295, minConf: 0.6 },
  { id: 'claude', name: 'Claude 4.5', emoji: '', color: '#F79A4F', cash: 613.29, total: 613.29, pnl: -586.71, winRate: 39.11, wins: 106, losses: 147, exposure: 240.93, maxExposure: 51.31, calls: 1295, minConf: 0.6 },
  { id: 'qwen', name: 'Qwen 2.5', emoji: '', color: '#6b9e7d', cash: 354.04, total: 354.04, pnl: -745.6, winRate: 32.81, wins: 125, losses: 223, exposure: 215.44, maxExposure: 70.41, calls: 1295, minConf: 0.6 },
  { id: 'gpt5', name: 'GPT-5', emoji: '', color: '#C8C8FF', cash: 161.33, total: 161.33, pnl: -938.67, winRate: 24.62, wins: 16, losses: 47, exposure: 0, maxExposure: 85.12, calls: 1295, minConf: 0.6 },
];

const performanceData = [
  { metric: "Win Rate", deepseek: 37.5, claude: 45.78, qwen: 34.32, gemini: 39.25, grok: 40.89, gpt5: 24.19 },
  { metric: "ROI", deepseek: 16.4, claude: 16.15, qwen: 7.85, gemini: -30.24, grok: -63, gpt5: -83.74 },
  { metric: "Balance %", deepseek: 79.54, claude: 66.82, qwen: 68.96, gemini: 99.78, grok: 100, gpt5: 100 },
];

const tradingActivityData = [
  { metric: "Total Trades", deepseek: 23, claude: 158, qwen: 219, gemini: 101, grok: 139, gpt5: 60 },
  { metric: "Losses", deepseek: 14, claude: 82, qwen: 138, gemini: 59, grok: 80, gpt5: 45 },
  { metric: "Wins", deepseek: 9, claude: 76, qwen: 81, gemini: 42, grok: 59, gpt5: 15 },
];

const riskMetricsData = [
  { metric: "Max Exposure", deepseek: 32.05, claude: 63.33, qwen: 31.50, gemini: 50, grok: 40, gpt5: 56.25 },
  { metric: "P&L Norm.", deepseek: 70, claude: 75, qwen: 45, gemini: 20, grok: 15, gpt5: 5 },
  { metric: "W/L Ratio", deepseek: 39.13, claude: 48.1, qween: 37.0, gemini: 41.58, grok: 42.45, gpt5: 25.0 },
];

const AgentCard = ({ agent, index }: { agent: AgentStats; index: number }) => {
  const logoKey = getAgentLogoKey(agent.id ?? agent.name);
  const logoSrc = logoKey ? AGENT_LOGO[logoKey] : undefined;

  return (
    <div className="bg-card border border-border p-3 rounded-2xl h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-terminal-accent font-mono text-xs">#{index + 1}</span>
        {logoSrc ? (
          <svg
            className={`object-contain ${agent.id === 'gemini' ? 'w-7 h-7' : 'w-6 h-6'}`}
            width={agent.id === 'gemini' ? 28 : 24}
            height={agent.id === 'gemini' ? 28 : 24}
            viewBox={`0 0 ${agent.id === 'gemini' ? 28 : 24} ${agent.id === 'gemini' ? 28 : 24}`}
          >
            <image href={logoSrc} x={0} y={0} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
          </svg>
        ) : (
          <img src="/placeholder.svg" alt={agent.name} className={`object-contain ${agent.id === 'gemini' ? 'w-7 h-7' : 'w-6 h-6'}`} />
        )}
        <span className="text-xs font-mono truncate" style={{ color: agent.color }}>
          {agent.name}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono flex-1">
        <div className="text-muted-foreground">Cash</div>
        <div className="text-right text-foreground">${agent.cash.toFixed(2)}</div>

        <div className="text-muted-foreground">Total</div>
        <div className="text-right text-foreground">${agent.total.toFixed(2)}</div>

        <div className="text-muted-foreground">P&L</div>
        <div className={`text-right font-bold ${agent.pnl >= 0 ? 'text-trade-yes' : 'text-trade-no'}`}>
          {agent.pnl >= 0 ? '+' : ''}${agent.pnl.toFixed(2)}
        </div>



        <div className="text-muted-foreground">Exposure</div>
        <div className="text-right text-foreground">${agent.exposure.toFixed(2)}</div>


        <div className="text-muted-foreground">Calls</div>
        <div className="text-right text-foreground">{agent.calls}</div>


      </div>
    </div>
  );
};

export const TechnicalView = ({ mockAgents, simulate = false }: { mockAgents?: AgentStats[]; simulate?: boolean } = {}) => {
  const [agentStats, setAgentStats] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to RTDB `/agent_balances` as single source of truth, unless simulate/mock is provided
  useEffect(() => {
    setLoading(true);
    if (simulate || (mockAgents && mockAgents.length > 0)) {
      setAgentStats(mockAgents ?? DEFAULT_MOCK_AGENTS);
      setLoading(false);
      return;
    }

    let unsub: (() => void) | null = null;
    try {
      unsub = listenToAgentBalances((items: any[]) => {
        // items: [{ agentId, balance }]
        const mapped: AgentStats[] = (items || []).map(it => {
          const id = it.agentId || it.id || 'unknown';
          const b = it.balance || {};
          const current = Number(b.current_balance ?? b.currentBalance ?? b.current ?? b.current_balance_usd ?? 0);
          const gross = Number(b.gross_balance ?? b.grossBalance ?? b.gross ?? current);
          const initial = Number(b.initial_balance ?? b.initialBalance ?? b.initial ?? 0);
          const pnl = Number(b.current_pnl ?? b.currentPnl ?? b.current_pnl_usd ?? (gross - initial));
          const winCount = Number(b.win_count ?? b.winCount ?? b.wins ?? 0);
          const lossCount = Number(b.loss_count ?? b.lossCount ?? b.losses ?? 0);
          const winRate = (winCount + lossCount) > 0 ? (winCount / Math.max(1, winCount + lossCount)) * 100 : Number(b.win_rate ?? b.winRate ?? 0);
          const exposure = Number(b.total_wagered ?? b.totalWagered ?? b.exposure ?? 0);
          const maxExposure = Number(b.max_exposure ?? b.maxExposure ?? b.biggest_win ?? 0);
          const calls = Number(b.prediction_count ?? b.calls ?? 0);
          const minConf = Number(b.min_conf ?? b.minConf ?? b.minConfidence ?? 0);
          return {
            id,
            name: b.agent_name ?? b.agentName ?? id,
            emoji: b.emoji ?? '',
            color: b.color ?? '',
            cash: current,
            total: gross,
            pnl,
            winRate,
            wins: winCount,
            losses: lossCount,
            exposure,
            maxExposure,
            calls,
            minConf,
          } as AgentStats;
        });
        setAgentStats(mapped);
        setLoading(false);
      });
    } catch (e) {
      console.warn('listenToAgentBalances failed', e);
      setLoading(false);
    }
    return () => { if (unsub) try { unsub(); } catch (_) { } };
  }, [mockAgents, simulate]);

  // Use RTDB-provided `agentStats` only (single source); sort for display
  const displayAgents = [...agentStats].sort((a, b) => b.pnl - a.pnl);
  const topAgents = displayAgents.slice(0, 3);
  const bottomAgents = displayAgents.slice(3, 6);
  const allAgents = displayAgents;

  // Calculate performance data for charts (using all agents from real data)
  const performanceData = [
    {
      metric: "Win Rate",
      deepseek: allAgents.find(a => a.id === 'deepseek')?.winRate || 0,
      claude: allAgents.find(a => a.id === 'claude')?.winRate || 0,
      qwen: allAgents.find(a => a.id === 'qwen')?.winRate || 0,
      gemini: allAgents.find(a => a.id === 'gemini')?.winRate || 0,
      grok: allAgents.find(a => a.id === 'grok')?.winRate || 0,
      gpt5: allAgents.find(a => a.id === 'gpt5')?.winRate || 0,
    },
    {
      metric: "ROI",
      deepseek: allAgents.find(a => a.id === 'deepseek')?.pnl || 0,
      claude: allAgents.find(a => a.id === 'claude')?.pnl || 0,
      qwen: allAgents.find(a => a.id === 'qwen')?.pnl || 0,
      gemini: allAgents.find(a => a.id === 'gemini')?.pnl || 0,
      grok: allAgents.find(a => a.id === 'grok')?.pnl || 0,
      gpt5: allAgents.find(a => a.id === 'gpt5')?.pnl || 0,
    },
    {
      metric: "Balance %",
      deepseek: allAgents.find(a => a.id === 'deepseek') ? (allAgents.find(a => a.id === 'deepseek')!.total / 3000) * 100 : 0,
      claude: allAgents.find(a => a.id === 'claude') ? (allAgents.find(a => a.id === 'claude')!.total / 3000) * 100 : 0,
      qwen: allAgents.find(a => a.id === 'qwen') ? (allAgents.find(a => a.id === 'qwen')!.total / 3000) * 100 : 0,
      gemini: allAgents.find(a => a.id === 'gemini') ? (allAgents.find(a => a.id === 'gemini')!.total / 3000) * 100 : 0,
      grok: allAgents.find(a => a.id === 'grok') ? (allAgents.find(a => a.id === 'grok')!.total / 3000) * 100 : 0,
      gpt5: allAgents.find(a => a.id === 'gpt5') ? (allAgents.find(a => a.id === 'gpt5')!.total / 3000) * 100 : 0,
    },
  ];

  const tradingActivityData = [
    {
      metric: "Total Trades",
      deepseek: allAgents.find(a => a.id === 'deepseek')?.calls || 0,
      claude: allAgents.find(a => a.id === 'claude')?.calls || 0,
      qwen: allAgents.find(a => a.id === 'qwen')?.calls || 0,
      gemini: allAgents.find(a => a.id === 'gemini')?.calls || 0,
      grok: allAgents.find(a => a.id === 'grok')?.calls || 0,
      gpt5: allAgents.find(a => a.id === 'gpt5')?.calls || 0,
    },
    {
      metric: "Losses",
      deepseek: allAgents.find(a => a.id === 'deepseek')?.losses || 0,
      claude: allAgents.find(a => a.id === 'claude')?.losses || 0,
      qwen: allAgents.find(a => a.id === 'qwen')?.losses || 0,
      gemini: allAgents.find(a => a.id === 'gemini')?.losses || 0,
      grok: allAgents.find(a => a.id === 'grok')?.losses || 0,
      gpt5: allAgents.find(a => a.id === 'gpt5')?.losses || 0,
    },
    {
      metric: "Wins",
      deepseek: allAgents.find(a => a.id === 'deepseek')?.wins || 0,
      claude: allAgents.find(a => a.id === 'claude')?.wins || 0,
      qwen: allAgents.find(a => a.id === 'qwen')?.wins || 0,
      gemini: allAgents.find(a => a.id === 'gemini')?.wins || 0,
      grok: allAgents.find(a => a.id === 'grok')?.wins || 0,
      gpt5: allAgents.find(a => a.id === 'gpt5')?.wins || 0,
    },
  ];

  const riskMetricsData = [
    {
      metric: "Max Exposure",
      deepseek: allAgents.find(a => a.id === 'deepseek')?.maxExposure || 0,
      claude: allAgents.find(a => a.id === 'claude')?.maxExposure || 0,
      qwen: allAgents.find(a => a.id === 'qwen')?.maxExposure || 0,
      gemini: allAgents.find(a => a.id === 'gemini')?.maxExposure || 0,
      grok: allAgents.find(a => a.id === 'grok')?.maxExposure || 0,
      gpt5: allAgents.find(a => a.id === 'gpt5')?.maxExposure || 0,
    },
    {
      metric: "P&L Norm.",
      deepseek: allAgents.find(a => a.id === 'deepseek')?.pnl || 0,
      claude: allAgents.find(a => a.id === 'claude')?.pnl || 0,
      qwen: allAgents.find(a => a.id === 'qwen')?.pnl || 0,
      gemini: allAgents.find(a => a.id === 'gemini')?.pnl || 0,
      grok: allAgents.find(a => a.id === 'grok')?.pnl || 0,
      gpt5: allAgents.find(a => a.id === 'gpt5')?.pnl || 0,
    },
    {
      metric: "W/L Ratio",
      deepseek: allAgents.find(a => a.id === 'deepseek') ? (allAgents.find(a => a.id === 'deepseek')!.wins / Math.max(1, allAgents.find(a => a.id === 'deepseek')!.losses)) * 100 : 0,
      claude: allAgents.find(a => a.id === 'claude') ? (allAgents.find(a => a.id === 'claude')!.wins / Math.max(1, allAgents.find(a => a.id === 'claude')!.losses)) * 100 : 0,
      qwen: allAgents.find(a => a.id === 'qwen') ? (allAgents.find(a => a.id === 'qwen')!.wins / Math.max(1, allAgents.find(a => a.id === 'qwen')!.losses)) * 100 : 0,
      gemini: allAgents.find(a => a.id === 'gemini') ? (allAgents.find(a => a.id === 'gemini')!.wins / Math.max(1, allAgents.find(a => a.id === 'gemini')!.losses)) * 100 : 0,
      grok: allAgents.find(a => a.id === 'grok') ? (allAgents.find(a => a.id === 'grok')!.wins / Math.max(1, allAgents.find(a => a.id === 'grok')!.losses)) * 100 : 0,
      gpt5: allAgents.find(a => a.id === 'gpt5') ? (allAgents.find(a => a.id === 'gpt5')!.wins / Math.max(1, allAgents.find(a => a.id === 'gpt5')!.losses)) * 100 : 0,
    },
  ];

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Top 3 Agents */}
      <div className="grid grid-cols-3 gap-3 px-3 pt-3 pb-1.5 flex-shrink-0">
        {topAgents.map((agent, index) => (
          <AgentCard key={agent.id} agent={agent} index={index} />
        ))}
      </div>

      {/* Radar Charts Grid - Metrics in the middle */}
      <div className="grid grid-cols-3 gap-2.5 px-2.5 pt-1.5 pb-2.5 flex-1 min-h-0">
        {/* Performance Metrics */}
        <div className="bg-card border border-border p-3 rounded-2xl flex flex-col min-h-0">
          <div className="text-[10px] text-center text-foreground mb-2 font-mono flex-shrink-0">Performance Metrics</div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={performanceData} outerRadius={90}>
                <PolarGrid stroke="#26313a" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#7f95a6', fontSize: 11 }} />
                {/* Render radars for each known agent so they overlap like the reference */}
                {['DEEPSEEK', 'CLAUDE', 'QWEN', 'GEMINI', 'GROK', 'GPT5'].map((key, i) => {
                  const color = AGENT_COLORS[key] ?? '#8b91a8';
                  return (
                    <Radar
                      key={key}
                      name={key}
                      dataKey={key.toLowerCase()}
                      stroke={color}
                      fill={color}
                      fillOpacity={0.08}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  );
                })}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Trading Activity */}
        <div className="bg-card border border-border p-3 rounded-2xl flex flex-col min-h-0">
          <div className="text-[10px] text-center text-foreground mb-2 font-mono flex-shrink-0">Trading Activity</div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={tradingActivityData} outerRadius={90}>
                <PolarGrid stroke="#26313a" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#7f95a6', fontSize: 11 }} />
                {['DEEPSEEK', 'CLAUDE', 'QWEN', 'GEMINI', 'GROK', 'GPT5'].map((key) => (
                  <Radar key={key} name={key} dataKey={key.toLowerCase()} stroke={AGENT_COLORS[key] ?? '#8b91a8'} fill={AGENT_COLORS[key] ?? '#8b91a8'} fillOpacity={0.08} strokeWidth={1.5} dot={false} />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Metrics */}
        <div className="bg-card border border-border p-3 rounded-2xl flex flex-col min-h-0">
          <div className="text-[10px] text-center text-foreground mb-2 font-mono flex-shrink-0">Risk Metrics</div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={riskMetricsData} outerRadius={90}>
                <PolarGrid stroke="#26313a" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#7f95a6', fontSize: 11 }} />
                {['DEEPSEEK', 'CLAUDE', 'QWEN', 'GEMINI', 'GROK', 'GPT5'].map((key) => (
                  <Radar key={key} name={key} dataKey={key.toLowerCase()} stroke={AGENT_COLORS[key] ?? '#8b91a8'} fill={AGENT_COLORS[key] ?? '#8b91a8'} fillOpacity={0.08} strokeWidth={1.5} dot={false} />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom 3 Agents */}
      <div className="grid grid-cols-3 gap-3 px-3 pb-3 flex-shrink-0">
        {bottomAgents.map((agent, index) => (
          <AgentCard key={agent.id} agent={agent} index={index + 3} />
        ))}
      </div>
    </div>
  );
};
