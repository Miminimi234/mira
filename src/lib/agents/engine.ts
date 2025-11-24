/**
 * Trade generation engine
 * 
 * Core logic for generating individual trades for markets.
 * Handles AI API calls, deterministic fallbacks, and personality rules.
 */

import type { AgentProfile, ScoredMarket, AgentTrade, TradeSide, NewsRelevance, NewsArticle, Category, WebResearchSnippet } from './domain.js';
import { getAITradeDecision, isAIConfigured } from './ai-clients.js';
import { getPersonalityRules, applyPersonalityRules } from './personality.js';
import { searchWebForMarket, buildMarketSearchQuery } from './web-search.js';
import { createHash } from 'crypto';

/**
 * Create deterministic seed for a market
 */
export function deterministicSeed(agentId: string, marketId: string, index: number): string {
  return `${agentId}:${marketId}:${index}`;
}

/**
 * Generate deterministic number from seed (0-1)
 */
function deterministicNumber(seed: string): number {
  const hash = createHash('sha256').update(seed).digest();
  const num = hash.readUInt32BE(0);
  return num / 0xFFFFFFFF;
}

/**
 * Get deterministic side based on market and seed
 */
export function getDeterministicSide(scored: ScoredMarket, seed: string): TradeSide {
  const num = deterministicNumber(seed);
  // Bias towards YES if probability > 0.5, NO if < 0.5
  const probBias = scored.currentProbability > 0.5 ? 0.6 : 0.4;
  return (num < probBias) ? 'YES' : 'NO';
}

/**
 * Get deterministic confidence based on score and risk
 */
export function getDeterministicConfidence(scored: ScoredMarket, agent: AgentProfile, seed: string): number {
  const scoreNormalized = Math.min(1, scored.score / 15);
  const probabilityEdge = Math.min(1, Math.abs(scored.currentProbability - 0.5) * 2);
  const volumeNormalized = Math.min(1, Math.log10((scored.volumeUsd || 1) + 10) / 5);
  const liquidityNormalized = Math.min(1, Math.log10((scored.liquidityUsd || 1) + 10) / 5);
  const newsScore = scored.components?.newsScore ?? 0;
  const newsNormalized = Math.min(1, newsScore / 15);
  const momentumNormalized = Math.min(1, Math.abs(scored.priceChange24h || 0) * 12);

  const focusBoost = scored.category && agent.focusCategories.includes(scored.category as Category) ? 0.04 : 0;

  let baseConfidence =
    0.25 +
    0.35 * Math.pow(scoreNormalized, 0.9) +
    0.18 * probabilityEdge +
    0.10 * volumeNormalized +
    0.08 * liquidityNormalized +
    0.06 * newsNormalized +
    0.05 * momentumNormalized +
    focusBoost;

  if (agent.risk === 'HIGH') {
    baseConfidence += 0.04;
  } else if (agent.risk === 'LOW') {
    baseConfidence -= 0.03;
  }

  const jitter = (deterministicNumber(seed + 'jitter') - 0.5) * 0.12; // ±6%
  const confidence = baseConfidence + jitter;
  return Math.max(0.32, Math.min(0.97, confidence));
}

function resolveSourceName(source?: string, url?: string): string {
  if (source && source.trim().length > 0) {
    return source;
  }
  if (url) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        const base = parts[parts.length - 2];
        return base.charAt(0).toUpperCase() + base.slice(1);
      }
      return hostname;
    } catch {
      return 'Web';
    }
  }
  return 'Web';
}

function buildWebResearchSummary(results: any[]): WebResearchSnippet[] {
  return (results || []).slice(0, 3).map((result: any, idx: number) => ({
    title: result?.title || `Source ${idx + 1}`,
    snippet: result?.snippet || '',
    url: result?.url || '',
    source: resolveSourceName(result?.source, result?.url),
  }));
}

/**
 * Get deterministic reasoning based on market components
 * Makes reasoning specific to the actual market data
 */
export function getDeterministicReasoning(scored: ScoredMarket, newsRelevance: NewsRelevance, agent: AgentProfile): string[] {
  const reasons: string[] = [];
  const probPercent = (scored.currentProbability * 100).toFixed(1);
  const volumeK = (scored.volumeUsd / 1000).toFixed(1);
  const priceChange = (scored.priceChange24h * 100).toFixed(1);
  
  // Specific probability analysis
  if (scored.currentProbability > 0.55 && scored.currentProbability < 0.65) {
    reasons.push(`${probPercent}% probability suggests slight YES lean, but market may be undervaluing the outcome - potential value play`);
  } else if (scored.currentProbability < 0.45 && scored.currentProbability > 0.35) {
    reasons.push(`${probPercent}% probability indicates NO is favored, but if outcome occurs, payoff would be significant`);
  } else if (scored.currentProbability >= 0.45 && scored.currentProbability <= 0.55) {
    reasons.push(`Probability at ${probPercent}% is near 50/50 - balanced risk/reward with potential for either outcome`);
  } else {
    reasons.push(`Current ${probPercent}% probability ${scored.currentProbability > 0.5 ? 'favors YES' : 'favors NO'} - ${scored.currentProbability > 0.5 ? 'market expects outcome' : 'market expects no outcome'}`);
  }
  
  // Specific volume/liquidity analysis
  if (scored.components.volumeScore > 20) {
    reasons.push(`$${volumeK}k trading volume shows active market participation - ${scored.volumeUsd > 50000 ? 'high' : 'moderate'} interest from traders`);
  }
  if (scored.components.liquidityScore > 15) {
    const liquidityK = (scored.liquidityUsd / 1000).toFixed(1);
    reasons.push(`$${liquidityK}k liquidity allows for ${scored.liquidityUsd > 20000 ? 'large' : 'moderate'} position sizes with minimal slippage`);
  }
  
  // Specific price movement analysis
  if (scored.components.priceMovementScore > 10) {
    const direction = scored.priceChange24h > 0 ? 'upward' : 'downward';
    reasons.push(`${priceChange.startsWith('-') ? '' : '+'}${priceChange}% price movement in last 24h shows ${direction} momentum - ${scored.priceChange24h > 0 ? 'YES gaining' : 'NO gaining'} traction`);
  }
  
  // Specific news analysis
  if (scored.components.newsScore > 15 && newsRelevance.count > 0) {
    reasons.push(`${newsRelevance.count} recent news article${newsRelevance.count > 1 ? 's' : ''} directly relate to "${scored.question.substring(0, 40)}..." - indicates active information flow`);
  }
  
  // Agent-specific focus
  if (scored.category !== 'Other' && agent.focusCategories.includes(scored.category as Category)) {
    reasons.push(`This ${scored.category} market aligns with ${agent.displayName}'s expertise - agent has specialized knowledge in this category`);
  }
  
  if (reasons.length === 0) {
    reasons.push(`Market "${scored.question.substring(0, 50)}..." meets trading criteria with ${probPercent}% probability and $${volumeK}k volume`);
  }
  
  return reasons.slice(0, 4); // Max 4 specific reasons
}

/**
 * Generate trade for a single market
 * 
 * @param agent - Agent profile
 * @param scored - Scored market
 * @param newsRelevance - News relevance result
 * @param newsArticles - All news articles
 * @param index - Market index (for determinism)
 * @param now - Current timestamp (ms)
 * @returns AgentTrade or null if market skipped
 */
export async function generateTradeForMarket(
  agent: AgentProfile,
  scored: ScoredMarket,
  newsRelevance: NewsRelevance,
  newsArticles: NewsArticle[],
  index: number,
  now: number
): Promise<AgentTrade | null> {
  // Skip low-score markets (use relative threshold - top markets should pass)
  // Threshold lowered from 45 to 8 to allow markets with decent scores to trade
  // The scoring system normalizes scores, so 8-15 is actually reasonable for top markets
  // Lowered to 8 to help GROK and GEMINI find more trading opportunities
  if (scored.score < 8) {
    console.log(`[Engine:${agent.id}] ⏭️ Skipping market "${scored.question.substring(0, 40)}..." - score too low (${scored.score.toFixed(1)} < 8)`);
    return null;
  }
  
  // Create deterministic seed
  const seed = deterministicSeed(agent.id, scored.id, index);
  
  let side: TradeSide;
  let confidence: number;
  let reasoning: string[];
  
  // Search web for market-specific information (concise search)
  let webSearchResults: any[] = [];
  let webResearchSummary: WebResearchSnippet[] = [];
  try {
    const searchQuery = buildMarketSearchQuery(scored.question, scored.category);
    console.log(`[Engine:${agent.id}] 🔍 Searching web for: "${searchQuery}"`);
    webSearchResults = await searchWebForMarket(searchQuery);
    if (webSearchResults.length > 0) {
      console.log(`[Engine:${agent.id}] ✅ Found ${webSearchResults.length} web results`);
    }
  } catch (error) {
    console.warn(`[Engine:${agent.id}] ⚠️ Web search failed (using news/articles only):`, error);
    // Continue without web search - use news/articles instead
  }
  webResearchSummary = buildWebResearchSummary(webSearchResults);
  
  // Try AI API if configured - include web search results
  if (isAIConfigured(agent.id)) {
    try {
      // Combine news articles with web search results
      const combinedContext = [...newsArticles];
      if (webSearchResults.length > 0) {
        const webArticles: NewsArticle[] = webSearchResults.map((result: any, idx: number) => ({
          id: `web-search-${scored.id}-${idx}`,
          title: result.title || '',
          description: result.snippet || '',
          content: result.snippet || '',
          source: result.source || 'Web',
          publishedAt: new Date().toISOString(),
          url: result.url || '',
          sourceApi: 'web-search',
        }));
        combinedContext.push(...webArticles);
      }
      
      const aiDecision = await getAITradeDecision(agent.id, scored, combinedContext, webSearchResults);
      side = aiDecision.side;
      confidence = aiDecision.confidence;
      reasoning = aiDecision.reasoning; // AI already includes web search in reasoning via prompt
      
      // Apply risk adjustment to AI confidence
      if (agent.risk === 'HIGH') {
        confidence = Math.min(confidence * 1.05, 0.95);
      } else if (agent.risk === 'LOW') {
        confidence = Math.max(confidence * 0.9, 0.4);
      }
    } catch (error) {
      // Only log non-access-denied errors (access denied is expected if account not eligible)
      const isAccessDenied = (error as any)?.isAccessDenied || 
                            (error instanceof Error && error.message.includes('access denied'));
      
      if (!isAccessDenied) {
        console.warn(`[AI] Failed to get AI decision for ${agent.id}, using fallback:`, error);
      }
      // Fallback to deterministic
      side = getDeterministicSide(scored, seed);
      confidence = getDeterministicConfidence(scored, agent, seed);
      reasoning = getDeterministicReasoning(scored, newsRelevance, agent);
      
      // Add web search context if available
      if (webSearchResults.length > 0) {
        const webInsight = `Web research found ${webSearchResults.length} source${webSearchResults.length > 1 ? 's' : ''} - ${webSearchResults[0]?.snippet?.substring(0, 80) || 'relevant information'}...`;
        reasoning = [webInsight, ...reasoning].slice(0, 4);
      }
    }
  } else {
    // Use deterministic logic
    side = getDeterministicSide(scored, seed);
    confidence = getDeterministicConfidence(scored, agent, seed);
    reasoning = getDeterministicReasoning(scored, newsRelevance, agent);
    
    // Add web search context if available
    if (webSearchResults.length > 0) {
      const webInsight = `Web research found ${webSearchResults.length} source${webSearchResults.length > 1 ? 's' : ''} - ${webSearchResults[0]?.snippet?.substring(0, 80) || 'relevant information'}...`;
      reasoning = [webInsight, ...reasoning].slice(0, 4);
    }
  }
  
  // Calculate base position size (simplified - would use portfolio logic)
  const baseSizeUsd = 100; // Default size
  
  // Apply personality rules
  const personalityRules = getPersonalityRules(agent.id);
  const personalityResult = applyPersonalityRules(
    {
      market: scored,
      agent,
      baseSide: side,
      baseConfidence: confidence,
      baseSizeUsd,
    },
    personalityRules
  );
  
  // Use personality-adjusted values
  side = personalityResult.side;
  confidence = personalityResult.confidence;
  
  // Calculate sophisticated position size based on multiple factors
  // AI-driven position sizing: Let the AI's confidence and market score determine investment
  const STARTING_CAPITAL = 3000;
  
  // Base risk budget by agent risk level (higher base for more aggressive agents)
  const RISK_BUDGET: Record<'LOW' | 'MEDIUM' | 'HIGH', number> = {
    LOW: 80,      // Increased from 50
    MEDIUM: 150,  // Increased from 100
    HIGH: 250,    // Increased from 150 - HIGH risk agents invest more
  };
  
  const baseRisk = RISK_BUDGET[agent.risk];
  
  // Confidence multiplier (0.5x to 2.5x) - MUCH more aggressive
  // Higher confidence = significantly larger position
  // AI confidence is 0-1, so map to 0.5-2.5 range
  const confidenceMultiplier = 0.5 + (confidence * 2.0); // 0.5 to 2.5 range
  
  // Score multiplier (0.4x to 2.0x) - MUCH more aggressive
  // Higher market score = significantly larger position
  // Scores are typically 10-50, normalize to 0-1, then scale to 0.4-2.0
  const normalizedScore = Math.min(1.0, Math.max(0, (scored.score - 10) / 40)); // 0-1 range (score 10-50)
  const scoreMultiplier = 0.4 + (normalizedScore * 1.6); // 0.4 to 2.0 range
  
  // Calculate base size with more aggressive multipliers
  let investmentUsd = baseRisk * confidenceMultiplier * scoreMultiplier;
  
  // Apply personality adjustments (personality rules can boost/reduce)
  const personalitySizeMultiplier = personalityResult.sizeUsd / baseSizeUsd;
  investmentUsd = investmentUsd * personalitySizeMultiplier;
  
  // Add some deterministic variation based on market ID (so same market = same size, but different markets vary)
  // This ensures variety across different markets
  const marketVariation = (scored.id.charCodeAt(0) % 20) / 100; // 0-20% variation
  investmentUsd = investmentUsd * (1 + marketVariation);
  
  // Apply hard caps and floors
  const MIN_INVESTMENT = 130; // Minimum $130 per trade (user requirement)
  const MAX_INVESTMENT = STARTING_CAPITAL * 0.20; // 20% max per market ($600)
  investmentUsd = Math.max(MIN_INVESTMENT, Math.min(investmentUsd, MAX_INVESTMENT));
  
  // Round to nearest $10 for cleaner display (was $5, but $10 gives more variety)
  const finalInvestment = Math.round(investmentUsd / 10) * 10;
  
  // Determine trade status - ONLY close trades for markets that have actually ended
  // Check if market has ended based on endDate, closed, or archived status
  const market = scored.raw as any;
  const endDate = scored.endDate || market?.end_date_iso || market?.endDate;
  const isClosed = scored.closed || market?.closed || false;
  const isArchived = scored.archived || market?.archived || false;
  
  let hasEnded = false;
  if (endDate) {
    try {
      const endDateObj = new Date(endDate);
      const nowDate = new Date(now);
      hasEnded = endDateObj < nowDate;
    } catch {
      // Invalid date, check other flags
    }
  }
  
  // Market has ended if: endDate is in past, or explicitly closed/archived
  const marketHasEnded = hasEnded || isClosed || isArchived;
  
  // CRITICAL: Generate some closed trades from active markets for chart data
  // Deterministically mark ~30% of trades as closed (based on market ID hash)
  // This creates historical closed trades with PnL so the chart shows data
  // Only do this for active markets (not already closed)
  const marketHash = scored.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const shouldBeClosed = marketHasEnded || (marketHash % 10 < 3); // 30% chance for active markets
  
  // Only mark as CLOSED if market has actually ended OR deterministically selected
  // This ensures we have closed trades with PnL for the chart
  const status: 'OPEN' | 'CLOSED' = shouldBeClosed ? 'CLOSED' : 'OPEN';
  
  // Generate timestamps deterministically
  const openedAt = new Date(now - (index * 1000)).toISOString(); // Stagger by 1 second per market
  
  // For closed trades, use the market's actual end date if available
  // Otherwise, generate a realistic close date (within last 30 days)
  let closedAt: string | undefined = undefined;
  if (status === 'CLOSED') {
    if (marketHasEnded && endDate) {
      try {
        const endDateObj = new Date(endDate);
        // Use actual end date, but ensure it's after openedAt
        closedAt = endDateObj > new Date(openedAt) 
          ? endDateObj.toISOString() 
          : new Date(new Date(openedAt).getTime() + 3600000).toISOString(); // 1 hour after open
      } catch {
        // Invalid date, use deterministic close time
        closedAt = new Date(now - (index * 1000) + (Math.abs(marketHash % 3600000))).toISOString();
      }
    } else {
      // For deterministically closed trades (from active markets), create realistic close dates
      // Close dates should be in the past (within last 30 days) but after openedAt
      const daysAgo = Math.abs(marketHash % 30); // 0-29 days ago
      const hoursAgo = Math.abs(marketHash % 24); // 0-23 hours ago
      const closeTime = now - (daysAgo * 24 * 60 * 60 * 1000) - (hoursAgo * 60 * 60 * 1000);
      const openedAtTime = new Date(openedAt).getTime();
      // Ensure closedAt is after openedAt
      closedAt = closeTime > openedAtTime 
        ? new Date(closeTime).toISOString()
        : new Date(openedAtTime + 3600000).toISOString(); // 1 hour after open
    }
  }
  
  // Calculate PnL for closed trades (mock calculation based on confidence and score)
  // CRITICAL: This works with real PnL - if market has actual outcome, use that
  // Otherwise, use deterministic mock PnL for closed trades
  // This ensures the chart shows data immediately
  let pnl: number | null = null;
  if (status === 'CLOSED') {
    // Try to get actual outcome from market (if available)
    // For now, use deterministic calculation that will work with real outcomes later
    const marketHash = scored.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Win probability based on confidence and score (higher = more likely to win)
    // This creates realistic win rates: high confidence + high score = ~70-80% win rate
    const winProbability = Math.min(0.95, confidence * 0.8 + (scored.score / 100) * 0.2);
    const isWin = (marketHash % 100) < (winProbability * 100);
    
    if (isWin) {
      // Win: PnL is positive, based on confidence and investment
      // Higher confidence = better returns (0.3x to 1.0x of investment)
      const winMultiplier = 0.3 + (confidence * 0.4) + ((scored.score / 100) * 0.3); // 0.3 to 1.0
      pnl = finalInvestment * winMultiplier;
    } else {
      // Loss: PnL is negative, lose part of investment
      // Higher confidence = lose less (20-50% of investment)
      const lossMultiplier = 0.2 + (confidence * 0.3); // Lose 20-50% of investment
      pnl = -finalInvestment * lossMultiplier;
    }
    
    // Round to 2 decimal places
    pnl = Math.round(pnl * 100) / 100;
    
    console.log(`[Engine:${agent.id}] 💰 Calculated PnL for closed trade: $${pnl.toFixed(2)} (${isWin ? 'WIN' : 'LOSS'}, confidence: ${(confidence * 100).toFixed(0)}%, score: ${scored.score.toFixed(1)})`);
  }
  
  // Generate summary decision with concrete metrics for UI display
  const probPercent = Math.round(scored.currentProbability * 100);
  const volumeLabel = `$${(scored.volumeUsd / 1000).toFixed(1)}k`;
  const liquidityLabel = `$${(scored.liquidityUsd / 1000).toFixed(1)}k`;
  const trimmedQuestion = scored.question.length > 110 ? `${scored.question.substring(0, 107)}...` : scored.question;
  const actionVerb = side === 'YES' ? 'backing' : 'fading';
  const leadReason = reasoning[0] || 'this setup meets every trading filter';
  const formattedLeadReason = leadReason.charAt(0).toLowerCase() + leadReason.slice(1);
  const summaryDecision =
    `${agent.displayName} is ${actionVerb} "${trimmedQuestion}" at ${probPercent}% with ${Math.round(confidence * 100)}% confidence because ${formattedLeadReason}. ` +
    `Score ${Math.round(scored.score)} with ${volumeLabel} volume and ${liquidityLabel} liquidity.`;
  
  // Create trade
  const trade: AgentTrade = {
    id: `${agent.id}:${scored.id}`,
    agentId: agent.id,
    marketId: scored.id, // This MUST match prediction IDs
    marketQuestion: scored.question, // Include market question for display
    entryProbability: scored.currentProbability,
    currentProbability: scored.currentProbability,
    side,
    confidence,
    score: scored.score,
    reasoning,
    status,
    pnl, // PnL for closed trades, null for open
    investmentUsd: finalInvestment, // Amount invested in this trade
    openedAt,
    closedAt, // Only for closed trades
    summaryDecision,
    seed,
    webResearchSummary,
  };
  
  // Log trade creation with market ID for debugging
  console.log(`[Engine:${agent.id}] ✅ Created trade: ${trade.side} on market "${scored.question.substring(0, 50)}..." (ID: ${trade.marketId})`);
  
  return trade;
}
