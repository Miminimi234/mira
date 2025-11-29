import React from 'react';
import { Legend, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';

type RadarVisualizerProps = {
    data: any[];
    agentKeys: string[]; // keys present in data objects
    agentNames?: Record<string, string>;
    agentColors?: Record<string, string>;
    height?: number;
    showLegend?: boolean;
};

export const RadarVisualizer: React.FC<RadarVisualizerProps> = ({ data, agentKeys, agentNames = {}, agentColors = {}, height = 220, showLegend = true }) => {
    if (!Array.isArray(data) || data.length === 0) {
        // Render an empty placeholder SVG that matches size to avoid layout jumps
        return (
            <div style={{ width: '100%', height }} className="flex items-center justify-center">
                <div style={{ color: 'rgba(255,255,255,0.06)', fontSize: 12 }}>No data</div>
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={height}>
            <RadarChart data={data} outerRadius={90}>
                <PolarGrid stroke="#26313a" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#7f95a6', fontSize: 11 }} />
                {agentKeys.map((key) => (
                    <Radar
                        key={key}
                        name={agentNames[key] ?? key}
                        dataKey={key}
                        stroke={agentColors[key.toUpperCase()] ?? agentColors[key] ?? '#8b91a8'}
                        fill={agentColors[key.toUpperCase()] ?? agentColors[key] ?? '#8b91a8'}
                        fillOpacity={0.08}
                        strokeWidth={1.5}
                        dot={false}
                    />
                ))}
                <Tooltip
                    formatter={(value: any) => (typeof value === 'number' ? value.toFixed ? value.toFixed(2) : value : value)}
                    // Style tooltip to have a dark background and light text to match app theme
                    contentStyle={{ backgroundColor: '#000000', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 12px rgba(0,0,0,0.6)', padding: '8px' }}
                    itemStyle={{ color: '#ffffff', fontSize: 13, padding: '4px 0' }}
                    labelStyle={{ color: '#9fb0c6', fontSize: 12 }}
                    wrapperStyle={{ zIndex: 40 }}
                />
                {showLegend && <Legend verticalAlign="bottom" wrapperStyle={{ bottom: -8, fontSize: 10 }} />}
            </RadarChart>
        </ResponsiveContainer>
    );
};

export default RadarVisualizer;
