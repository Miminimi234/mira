/**
 * Market scoring engine
 *
 * Pure functions for scoring markets based on multiple factors.
 * Each market is scored 0-100 based on volume, liquidity, price movement,
 * news relevance, and probability.
 */
/**
 * Compute news relevance for a market
 *
 * Extracts keywords from market question and matches against news articles.
 * Pure function - no side effects, deterministic.
 *
 * @param market - Market to analyze
 * @param articles - Pool of news articles
 * @returns News relevance result with count and matched titles
 */
export function computeNewsRelevance(market, articles) {
    // Extract keywords from market question
    const question = market.question.toLowerCase();
    const words = question
        .split(/[\s\-_.,;:!?()]+/)
        .filter(w => w.length >= 4)
        .filter(w => !['will', 'the', 'this', 'that', 'and', '2024', '2025', '2026', '2027', '2028'].includes(w));
    const matchedTitles = [];
    for (const article of articles) {
        // Build text blob from article
        const text = [
            article.title || '',
            article.description || '',
            article.content || '',
        ]
            .join(' ')
            .toLowerCase();
        // Check if any keyword appears in article
        const hasMatch = words.some(word => text.includes(word));
        if (hasMatch) {
            matchedTitles.push(article.title);
        }
    }
    return {
        count: matchedTitles.length,
        matchedTitles: matchedTitles.slice(0, 5), // Limit to first 5 for display
    };
}
/**
 * Score a single market component by volume
 *
 * @param volumeUsd - Market volume in USD
 * @returns Score 0-30
 */
export function scoreVolume(volumeUsd) {
    const volumeFactor = Math.min(volumeUsd / 100000, 1);
    return volumeFactor * 30;
}
/**
 * Score a single market component by liquidity
 *
 * @param liquidityUsd - Market liquidity in USD
 * @returns Score 0-20
 */
export function scoreLiquidity(liquidityUsd) {
    const liqFactor = Math.min(liquidityUsd / 50000, 1);
    return liqFactor * 20;
}
/**
 * Score a single market component by price movement
 *
 * @param priceChange24h - 24h price change as decimal (-1 to +1)
 * @returns Score 0-15
 */
export function scorePriceMovement(priceChange24h) {
    const movementFactor = Math.min(Math.abs(priceChange24h) * 10, 1);
    return movementFactor * 15;
}
/**
 * Source quality weights
 */
export const SOURCE_QUALITY_WEIGHT = {
    TOP_TIER: 1.0, // e.g. major global outlets
    MAJOR: 0.8, // big regional / finance outlets
    LONG_TAIL: 0.5, // small blogs etc.
};
/**
 * Compute recency weight for a news article
 *
 * @param publishedAt - Article publication timestamp (ISO)
 * @param now - Current timestamp
 * @returns Recency weight (0-1)
 */
export function recencyWeight(publishedAt, now) {
    const ageMinutes = (now.getTime() - new Date(publishedAt).getTime()) / 60000;
    if (ageMinutes <= 60)
        return 1.0; // Last hour = max impact
    if (ageMinutes <= 360)
        return 0.7; // 1-6 hours
    if (ageMinutes <= 1440)
        return 0.4; // 6-24 hours
    if (ageMinutes <= 4320)
        return 0.25; // 1-3 days
    return 0.1; // Older = weak impact
}
/**
 * Determine source quality from article
 *
 * @param article - News article
 * @returns Source quality
 */
export function getSourceQuality(article) {
    // TODO: Implement source quality mapping based on source name
    // For now, default to MAJOR
    const source = (article.source || '').toLowerCase();
    // Top tier sources (example - expand based on actual sources)
    const topTierSources = ['reuters', 'bloomberg', 'financial times', 'wall street journal', 'the economist'];
    if (topTierSources.some(tier => source.includes(tier))) {
        return 'TOP_TIER';
    }
    // Major sources (example)
    const majorSources = ['cnn', 'bbc', 'cnbc', 'forbes', 'techcrunch'];
    if (majorSources.some(major => source.includes(major))) {
        return 'MAJOR';
    }
    return 'LONG_TAIL';
}
/**
 * Compute recency-weighted news intensity for a market
 *
 * @param market - Market to analyze
 * @param articles - News articles
 * @param now - Current timestamp
 * @returns News score (0-25)
 */
export function computeRecencyWeightedNewsScore(market, articles, now = new Date()) {
    const RAW_NEWS_CAP = 6.0;
    // Extract keywords from market question
    const question = market.question.toLowerCase();
    const words = question
        .split(/[\s\-_.,;:!?()]+/)
        .filter(w => w.length >= 4)
        .filter(w => !['will', 'the', 'this', 'that', 'and', '2024', '2025', '2026', '2027', '2028'].includes(w));
    let rawNewsIntensity = 0;
    for (const article of articles) {
        // Build text blob from article
        const text = [
            article.title || '',
            article.description || '',
            article.content || '',
        ]
            .join(' ')
            .toLowerCase();
        // Check if any keyword appears in article
        const hasMatch = words.some(word => text.includes(word));
        if (hasMatch) {
            // Compute recency weight
            const recency = recencyWeight(article.publishedAt, now);
            // Compute source weight
            const sourceQuality = getSourceQuality(article);
            const sourceW = SOURCE_QUALITY_WEIGHT[sourceQuality];
            // Contribution
            const contrib = recency * sourceW;
            rawNewsIntensity += contrib;
        }
    }
    // Apply soft cap
    rawNewsIntensity = Math.min(rawNewsIntensity, RAW_NEWS_CAP);
    // Convert to score in [0, 25]
    const newsScore = (rawNewsIntensity / RAW_NEWS_CAP) * 25;
    return newsScore;
}
/**
 * Score a single market component by news relevance (legacy - uses simple count)
 *
 * @param newsCount - Number of relevant news articles
 * @returns Score 0-25
 *
 * @deprecated Use computeRecencyWeightedNewsScore instead
 */
export function scoreNewsRelevance(newsCount) {
    // Max score at 5+ articles: Math.min(newsCount * 5, 5) * 5 = 25
    const cappedCount = Math.min(newsCount, 5);
    return cappedCount * 5;
}
/**
 * Score a single market component by probability
 *
 * Markets near 50% get highest score (most tradeable).
 *
 * @param probability - Current probability (0-1)
 * @returns Score 0-10
 */
export function scoreProbability(probability) {
    const probScore = (1 - Math.abs(probability - 0.5) * 2) * 10;
    return Math.max(0, probScore); // Ensure non-negative
}
/**
 * Score a market with all components (unweighted)
 *
 * @param market - Market to score
 * @param newsRelevance - News relevance result
 * @returns Scored market with component breakdown
 */
export function scoreMarket(market, newsRelevance) {
    const volumeScore = scoreVolume(market.volumeUsd);
    const liquidityScore = scoreLiquidity(market.liquidityUsd);
    const priceMovementScore = scorePriceMovement(market.priceChange24h);
    const newsScore = scoreNewsRelevance(newsRelevance.count);
    const probScore = scoreProbability(market.currentProbability);
    const totalScore = volumeScore + liquidityScore + priceMovementScore + newsScore + probScore;
    return {
        ...market,
        score: totalScore,
        components: {
            volumeScore,
            liquidityScore,
            priceMovementScore,
            newsScore,
            probScore,
        },
    };
}
/**
 * Compute weighted total score for an agent
 *
 * Uses agent-specific weights to compute personalized score.
 * Optionally applies adaptive category bias.
 *
 * @param scored - Scored market with components
 * @param agent - Agent profile with weights
 * @param adaptiveConfig - Optional adaptive configuration
 * @returns Weighted total score (roughly 0-100)
 */
export function computeWeightedTotalScore(scored, agent, adaptiveConfig) {
    const c = scored.components;
    const w = agent.weights;
    const weighted = c.volumeScore * w.volumeWeight +
        c.liquidityScore * w.liquidityWeight +
        c.priceMovementScore * w.priceMovementWeight +
        c.newsScore * w.newsWeight +
        c.probScore * w.probWeight;
    // Normalize by sum of weights for readability
    const weightSum = w.volumeWeight +
        w.liquidityWeight +
        w.priceMovementWeight +
        w.newsWeight +
        w.probWeight;
    let finalScore = weighted / weightSum; // Still roughly in 0-100 range
    // Apply adaptive category bias if available
    if (adaptiveConfig) {
        const category = scored.category;
        if (category && category !== 'Other') {
            const categoryMultiplier = adaptiveConfig.categoryBias[category] ?? 1.0;
            finalScore = finalScore * categoryMultiplier;
        }
    }
    return finalScore;
}
/**
 * Score a market with agent-specific weighted scoring
 *
 * @param market - Market to score
 * @param articles - News articles for recency-weighted scoring
 * @param agent - Agent profile with weights
 * @param now - Current timestamp (for recency)
 * @param adaptiveConfig - Optional adaptive configuration
 * @returns Scored market with weighted total score
 */
export function scoreMarketForAgent(market, articles, agent, now = new Date(), adaptiveConfig) {
    // Compute base component scores
    const volumeScore = scoreVolume(market.volumeUsd);
    const liquidityScore = scoreLiquidity(market.liquidityUsd);
    const priceMovementScore = scorePriceMovement(market.priceChange24h);
    // Use recency-weighted news scoring
    const newsScore = computeRecencyWeightedNewsScore(market, articles, now);
    const probScore = scoreProbability(market.currentProbability);
    // Create scored market with components
    const scored = {
        ...market,
        score: 0, // Will be computed with weights
        components: {
            volumeScore,
            liquidityScore,
            priceMovementScore,
            newsScore,
            probScore,
        },
    };
    // Compute weighted total score (with optional adaptive category bias)
    scored.score = computeWeightedTotalScore(scored, agent, adaptiveConfig);
    return scored;
}
/**
 * Filter candidate markets for an agent
 *
 * Filters by volume, liquidity, and optionally category preferences.
 * If too few markets match focus categories, falls back to all categories.
 *
 * @param agent - Agent profile
 * @param markets - All available markets
 * @returns Filtered candidate markets
 */
export function filterCandidateMarkets(agent, markets) {
    // First filter by volume and liquidity
    let candidates = markets.filter(m => {
        return m.volumeUsd >= agent.minVolume && m.liquidityUsd >= agent.minLiquidity;
    });
    // If agent has focus categories, prefer those
    if (agent.focusCategories.length > 0) {
        const focusMarkets = candidates.filter(m => agent.focusCategories.includes(m.category));
        // If we have enough focus markets, use only those
        // Otherwise fall back to all categories
        if (focusMarkets.length >= agent.maxTrades * 2) {
            candidates = focusMarkets;
        }
        // Otherwise keep all candidates (fallback)
    }
    return candidates;
}
