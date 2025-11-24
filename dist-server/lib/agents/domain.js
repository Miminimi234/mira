/**
 * Domain types for AI agent trading system
 *
 * All types are strongly typed with no `any` to ensure type safety
 * throughout the trading engine.
 */
/**
 * Agent profiles configuration
 *
 * Each agent has unique risk profile and category preferences
 */
export const AGENT_PROFILES = {
    GROK_4: {
        id: 'GROK_4',
        displayName: 'GROK 4',
        avatar: '🔥',
        minVolume: 30000, // Lowered from 50000 to allow more markets
        minLiquidity: 5000, // Lowered from 10000 to allow more markets
        maxTrades: 5,
        risk: 'HIGH',
        focusCategories: ['Crypto', 'Tech', 'Politics'],
        weights: {
            volumeWeight: 1.3,
            liquidityWeight: 1.0,
            priceMovementWeight: 1.4,
            newsWeight: 0.9,
            probWeight: 1.0,
        },
    },
    GPT_5: {
        id: 'GPT_5',
        displayName: 'GPT-5',
        avatar: '✨',
        minVolume: 100000,
        minLiquidity: 20000,
        maxTrades: 4,
        risk: 'MEDIUM',
        focusCategories: ['Tech', 'Finance', 'Crypto'],
        weights: {
            volumeWeight: 1.1,
            liquidityWeight: 1.2,
            priceMovementWeight: 1.0,
            newsWeight: 1.1,
            probWeight: 1.1,
        },
    },
    DEEPSEEK_V3: {
        id: 'DEEPSEEK_V3',
        displayName: 'DEEPSEEK V3',
        avatar: '🔮',
        minVolume: 75000,
        minLiquidity: 15000,
        maxTrades: 6,
        risk: 'MEDIUM',
        focusCategories: ['Crypto', 'Finance', 'Elections'],
        weights: {
            volumeWeight: 1.0,
            liquidityWeight: 1.0,
            priceMovementWeight: 1.1,
            newsWeight: 1.3,
            probWeight: 1.0,
        },
    },
    GEMINI_2_5: {
        id: 'GEMINI_2_5',
        displayName: 'GEMINI 2.5',
        avatar: '♊',
        minVolume: 20000, // Lowered from 30000 to allow more markets
        minLiquidity: 3000, // Lowered from 5000 to allow more markets
        maxTrades: 7,
        risk: 'HIGH',
        focusCategories: ['Sports', 'Entertainment', 'World'],
        weights: {
            volumeWeight: 0.9,
            liquidityWeight: 0.9,
            priceMovementWeight: 1.3,
            newsWeight: 1.4,
            probWeight: 1.0,
        },
    },
    CLAUDE_4_5: {
        id: 'CLAUDE_4_5',
        displayName: 'CLAUDE 4.5',
        avatar: '🧠',
        minVolume: 80000,
        minLiquidity: 18000,
        maxTrades: 5,
        risk: 'LOW',
        focusCategories: ['Finance', 'Politics', 'Elections'],
        weights: {
            volumeWeight: 1.0,
            liquidityWeight: 1.3,
            priceMovementWeight: 0.9,
            newsWeight: 1.4,
            probWeight: 1.2,
        },
    },
    QWEN_2_5: {
        id: 'QWEN_2_5',
        displayName: 'QWEN 2.5',
        avatar: '🤖',
        minVolume: 60000,
        minLiquidity: 12000,
        maxTrades: 6,
        risk: 'MEDIUM',
        focusCategories: ['Finance', 'Geopolitics', 'World'],
        weights: {
            volumeWeight: 1.1,
            liquidityWeight: 1.0,
            priceMovementWeight: 1.0,
            newsWeight: 1.2,
            probWeight: 1.1,
        },
    },
};
/**
 * All agent IDs
 */
export const ALL_AGENT_IDS = Object.keys(AGENT_PROFILES);
/**
 * Get agent profile by ID
 */
export function getAgentProfile(agentId) {
    const profile = AGENT_PROFILES[agentId];
    if (!profile) {
        throw new Error(`Unknown agent ID: ${agentId}`);
    }
    return profile;
}
/**
 * Validate agent ID
 */
export function isValidAgentId(id) {
    return id in AGENT_PROFILES;
}
