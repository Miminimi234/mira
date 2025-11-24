import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";
import { useState, useEffect } from "react";
import { API_BASE_URL } from "@/lib/apiConfig";

const AGENT_LOGO: Record<string, string> = {
  deepseek: "/deepseek.png",
  claude: "/Claude_AI_symbol.svg",
  qwen: "/Qwen_logo.svg",
  gemini: "/GEMENI.png",
  grok: "/grok.png",
  gpt5: "/GPT.png",
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

const mockAgentStats: AgentStats[] = [
  {
    id: "deepseek",
    name: "DeepSeek V3",
    emoji: "🔮",
    color: "#8b91a8",
    cash: 1047.22,
    total: 1316.41,
    pnl: 216.41,
    winRate: 37.5,
    wins: 9,
    losses: 14,
    exposure: 269.01,
    maxExposure: 32.05,
    calls: 1169,
    minConf: 0.60,
  },
  {
    id: "claude",
    name: "Claude 4.5",
    emoji: "🧠",
    color: "#9d8b6b",
    cash: 875.85,
    total: 1311.80,
    pnl: 211.90,
    winRate: 45.78,
    wins: 76,
    losses: 82,
    exposure: 435.90,
    maxExposure: 63.33,
    calls: 1161,
    minConf: 0.60,
  },
  {
    id: "qwen",
    name: "Qwen 2.5",
    emoji: "🤖",
    color: "#6b9e7d",
    cash: 823.28,
    total: 1193.75,
    pnl: 93.75,
    winRate: 34.32,
    wins: 81,
    losses: 138,
    exposure: 370.45,
    maxExposure: 31.50,
    calls: 1160,
    minConf: 0.60,
  },
  {
    id: "gemini",
    name: "Gemini 2.5",
    emoji: "♊",
    color: "#9ca3af",
    cash: 766.94,
    total: 768.59,
    pnl: -333.41,
    winRate: 39.25,
    wins: 42,
    losses: 59,
    exposure: 0.00,
    maxExposure: 50.00,
    calls: 1160,
    minConf: 0.60,
  },
  {
    id: "grok",
    name: "Grok 4",
    emoji: "🔥",
    color: "#ba6b6b",
    cash: 407.84,
    total: 407.46,
    pnl: -692.54,
    winRate: 40.89,
    wins: 59,
    losses: 80,
    exposure: 0.00,
    maxExposure: 40.00,
    calls: 1161,
    minConf: 0.60,
  },
  {
    id: "gpt5",
    name: "GPT-5",
    emoji: "✨",
    color: "#8b7aa8",
    cash: 175.86,
    total: 175.86,
    pnl: -924.14,
    winRate: 24.19,
    wins: 15,
    losses: 45,
    exposure: 0.01,
    maxExposure: 56.25,
    calls: 1160,
    minConf: 0.60,
  },
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

const AgentCard = ({ agent, index }: { agent: AgentStats; index: number }) => (
  <div className="bg-card border border-border p-3 rounded-2xl h-full flex flex-col">
    {/* Header */}
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-terminal-accent font-mono text-xs">#{index + 1}</span>
      <img 
        src={`/${agent.id === 'grok' ? 'grok.png' : agent.id === 'gpt5' ? 'GPT.png' : agent.id === 'gemini' ? 'GEMENI.png' : agent.id === 'deepseek' ? 'deepseek.png' : agent.id === 'claude' ? 'Claude_AI_symbol.svg' : agent.id === 'qwen' ? 'Qwen_logo.svg' : 'placeholder.svg'}`}
        alt={agent.name}
        className={`object-contain ${agent.id === 'gemini' ? 'w-7 h-7' : 'w-6 h-6'}`}
      />
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

      <div className="text-muted-foreground">Win%</div>
      <div className="text-right text-foreground">{agent.winRate.toFixed(2)}%</div>

      <div className="text-muted-foreground">Wins</div>
      <div className="text-right text-foreground">{agent.wins}</div>

      <div className="text-muted-foreground">Losses</div>
      <div className="text-right text-trade-no">{agent.losses}</div>

      <div className="text-muted-foreground">Exposure</div>
      <div className="text-right text-foreground">${agent.exposure.toFixed(2)}</div>

      <div className="text-muted-foreground">MaxExp%</div>
      <div className="text-right text-foreground">{agent.maxExposure.toFixed(2)}%</div>

      <div className="text-muted-foreground">Calls</div>
      <div className="text-right text-foreground">{agent.calls}</div>

      <div className="text-muted-foreground">MinConf</div>
      <div className="text-right text-foreground">{agent.minConf.toFixed(2)}</div>
    </div>
  </div>
);

export const TechnicalView = () => {
  const [agentStats, setAgentStats] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Fetch real agent stats from API
  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/api/agents/stats`);
        if (response.ok) {
          const data = await response.json();
          if (data.agents && Array.isArray(data.agents)) {
            setAgentStats(data.agents);
          }
        }
      } catch (error) {
        console.error('Failed to fetch agent stats:', error);
        // Keep empty array on error - don't show mock data
      } finally {
        setLoading(false);
      }
    };
    
    loadStats();
    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30 * 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Sort by P&L (descending) to get top/bottom agents
  // Only sort if we have real data (not empty)
  const sortedStats = agentStats.length > 0 
    ? [...agentStats].sort((a, b) => b.pnl - a.pnl)
    : [];
  const topAgents = sortedStats.slice(0, 3); // Top 3 by P&L
  const bottomAgents = sortedStats.slice(3, 6); // Bottom 3 by P&L
  
  // Get all agents for charts (not just top/bottom)
  const allAgents = sortedStats.length > 0 ? sortedStats : [];
  
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
            <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={performanceData}>
              <PolarGrid stroke="#2d3748" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 9 }} />
              <Radar name="DeepSeek" dataKey="deepseek" stroke="#8b91a8" fill="#8b91a8" fillOpacity={0.15} />
              <Radar name="Claude" dataKey="claude" stroke="#9d8b6b" fill="#9d8b6b" fillOpacity={0.15} />
              <Radar name="Qwen" dataKey="qwen" stroke="#6b9e7d" fill="#6b9e7d" fillOpacity={0.15} />
            </RadarChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* Trading Activity */}
        <div className="bg-card border border-border p-3 rounded-2xl flex flex-col min-h-0">
          <div className="text-[10px] text-center text-foreground mb-2 font-mono flex-shrink-0">Trading Activity</div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={tradingActivityData}>
              <PolarGrid stroke="#2d3748" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 9 }} />
              <Radar name="DeepSeek" dataKey="deepseek" stroke="#8b91a8" fill="#8b91a8" fillOpacity={0.15} />
              <Radar name="Claude" dataKey="claude" stroke="#9d8b6b" fill="#9d8b6b" fillOpacity={0.15} />
              <Radar name="Qwen" dataKey="qwen" stroke="#6b9e7d" fill="#6b9e7d" fillOpacity={0.15} />
            </RadarChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Metrics */}
        <div className="bg-card border border-border p-3 rounded-2xl flex flex-col min-h-0">
          <div className="text-[10px] text-center text-foreground mb-2 font-mono flex-shrink-0">Risk Metrics</div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={riskMetricsData}>
              <PolarGrid stroke="#2d3748" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 9 }} />
              <Radar name="DeepSeek" dataKey="deepseek" stroke="#8b91a8" fill="#8b91a8" fillOpacity={0.15} />
              <Radar name="Claude" dataKey="claude" stroke="#9d8b6b" fill="#9d8b6b" fillOpacity={0.15} />
              <Radar name="Qwen" dataKey="qwen" stroke="#6b9e7d" fill="#6b9e7d" fillOpacity={0.15} />
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
