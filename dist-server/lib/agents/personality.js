/**
 * Agent personality rules
 *
 * Deterministic rules that nudge trading decisions based on agent personality.
 * Applied after base side, confidence, and size are computed.
 */
/**
 * GROK 4 - Loves momentum in Crypto/Tech
 *
 * Boosts confidence and size for momentum markets in Crypto/Tech near 50% probability
 */
export function grokMomentumRule(ctx) {
    const { market, baseSide, baseConfidence, baseSizeUsd } = ctx;
    const isMomentumMarket = (market.category === 'Crypto' || market.category === 'Tech') &&
        market.components.priceMovementScore >= 0.7 * 15 && // High movement
        market.currentProbability >= 0.45 &&
        market.currentProbability <= 0.55;
    if (!isMomentumMarket) {
        return { side: baseSide, confidence: baseConfidence, sizeUsd: baseSizeUsd, notes: [] };
    }
    const boostedConfidence = Math.min(baseConfidence + 0.05, 0.95);
    const boostedSize = baseSizeUsd * 1.15;
    return {
        side: baseSide,
        confidence: boostedConfidence,
        sizeUsd: boostedSize,
        notes: ['Aggressive momentum bias in Crypto/Tech near 50% probability.'],
    };
}
/**
 * CLAUDE 4.5 - Skeptical of crowded, one-sided politics
 *
 * Reduces confidence and size for extremely one-sided political markets with high news coverage
 */
export function claudeCrowdRule(ctx) {
    const { market, baseSide, baseConfidence, baseSizeUsd } = ctx;
    const isCrowdedPolitical = (market.category === 'Politics' || market.category === 'Elections') &&
        market.components.newsScore >= 0.7 * 25 &&
        (market.currentProbability >= 0.9 || market.currentProbability <= 0.1);
    if (!isCrowdedPolitical) {
        return { side: baseSide, confidence: baseConfidence, sizeUsd: baseSizeUsd, notes: [] };
    }
    const reducedConfidence = Math.max(baseConfidence - 0.05, 0.4);
    const reducedSize = baseSizeUsd * 0.75;
    return {
        side: baseSide,
        confidence: reducedConfidence,
        sizeUsd: reducedSize,
        notes: ['Conservative stance in extremely crowded political markets.'],
    };
}
/**
 * GEMINI 2.5 - Loves "game time" sports
 *
 * Boosts confidence and size for near-term sports events
 */
export function geminiSportsRule(ctx) {
    const { market, baseSide, baseConfidence, baseSizeUsd } = ctx;
    if (market.category !== 'Sports') {
        return { side: baseSide, confidence: baseConfidence, sizeUsd: baseSizeUsd, notes: [] };
    }
    // Heuristic: if market question contains a date or "today", treat as near-event
    const q = market.question.toLowerCase();
    const nearEvent = q.includes('today') || q.includes('tonight') || /\b202[4-9]\b/.test(q);
    if (!nearEvent) {
        return { side: baseSide, confidence: baseConfidence, sizeUsd: baseSizeUsd, notes: [] };
    }
    const boostedConfidence = Math.min(baseConfidence + 0.03, 0.95);
    const boostedSize = baseSizeUsd * 1.1;
    return {
        side: baseSide,
        confidence: boostedConfidence,
        sizeUsd: boostedSize,
        notes: ['Increased conviction in near-term sports event.'],
    };
}
/**
 * Get personality rules for an agent
 *
 * @param agentId - Agent identifier
 * @returns Array of personality rules
 */
export function getPersonalityRules(agentId) {
    const rules = {
        GROK_4: [grokMomentumRule],
        GPT_5: [], // No special rules yet
        DEEPSEEK_V3: [], // No special rules yet
        GEMINI_2_5: [geminiSportsRule],
        CLAUDE_4_5: [claudeCrowdRule],
        QWEN_2_5: [], // No special rules yet
    };
    return rules[agentId] || [];
}
/**
 * Apply all personality rules for an agent
 *
 * Rules are executed in order; later rules can override earlier changes.
 *
 * @param ctx - Personality context
 * @param rules - Array of personality rules
 * @returns Final personality result
 */
export function applyPersonalityRules(ctx, rules) {
    let result = {
        side: ctx.baseSide,
        confidence: ctx.baseConfidence,
        sizeUsd: ctx.baseSizeUsd,
        notes: [],
    };
    for (const rule of rules) {
        const ruleResult = rule(ctx);
        // Apply rule result (can override previous rules)
        result = {
            side: ruleResult.side,
            confidence: ruleResult.confidence,
            sizeUsd: ruleResult.sizeUsd,
            notes: [...result.notes, ...ruleResult.notes],
        };
        // Update context for next rule
        ctx = {
            ...ctx,
            baseSide: result.side,
            baseConfidence: result.confidence,
            baseSizeUsd: result.sizeUsd,
        };
    }
    return result;
}
