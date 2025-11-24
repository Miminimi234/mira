export interface PredictionNodeData {
    id: string;
    question: string;
    probability: number;
    position: "YES" | "NO";
    price: number;
    change: number;
    agentName: string;
    agentEmoji: string;
    reasoning: string;
    category?: string;
    marketSlug?: string;
    conditionId?: string;
    imageUrl?: string;
    volume?: number | string;
    liquidity?: number | string;
    volume24h?: number;
    volume7d?: number;
    predicted?: boolean;
}
