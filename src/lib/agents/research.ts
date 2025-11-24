/**
 * Research decision generation
 * 
 * Generates research decisions for markets that agents analyze but don't trade on.
 * These show up in the summary as "RESEARCH" actions (not "TRADE").
 */

import type { AgentProfile, ScoredMarket, NewsArticle, NewsRelevance, WebResearchSnippet } from './domain.js';
import { deterministicSeed, getDeterministicSide, getDeterministicConfidence, getDeterministicReasoning } from './engine.js';
import { getAITradeDecision, isAIConfigured } from './ai-clients.js';
import { searchWebForMarket, buildMarketSearchQuery, type WebSearchResult } from './web-search.js';

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

function buildWebResearchSummary(results: WebSearchResult[]): WebResearchSnippet[] {
  return (results || []).slice(0, 3).map((result, idx) => ({
    title: result?.title || `Source ${idx + 1}`,
    snippet: result?.snippet || '',
    url: result?.url || '',
    source: resolveSourceName(result?.source, result?.url),
  }));
}

/**
 * Research decision (similar to trade but without investment/status)
 */
export interface ResearchDecision {
  id: string; // `${agentId}:${marketId}:research`
  agentId: string;
  marketId: string;
  marketQuestion: string;
  side: 'YES' | 'NO' | 'NEUTRAL'; // Can be neutral for research
  confidence: number; // 0-1
  score: number; // Market score
  reasoning: string[];
  timestamp: string; // ISO timestamp
  summaryDecision: string;
  webResearchSummary?: WebResearchSnippet[];
  webResearchCount?: number;
}

/**
 * Generate a research decision for a market
 * 
 * Similar to trade generation but:
 * - No investment amount
 * - Can be NEUTRAL (not just YES/NO)
 * - Lower confidence threshold
 * - Focus on analysis rather than trading
 */
export async function generateResearchForMarket(
  agent: AgentProfile,
  scored: ScoredMarket,
  newsRelevance: NewsRelevance,
  newsArticles: NewsArticle[],
  index: number,
  now: number
): Promise<ResearchDecision | null> {
  // Skip extremely low score markets
  if (scored.score < 5) {
    return null;
  }
  
  // Create deterministic seed
  const seed = deterministicSeed(agent.id, scored.id, index);
  
  // Search web for market-specific information (concise search)
  let webSearchResults: WebSearchResult[] = [];
  try {
    const searchQuery = buildMarketSearchQuery(scored.question, scored.category);
    console.log(`[Research:${agent.id}] 🔍 Searching web for: "${searchQuery}"`);
    webSearchResults = await searchWebForMarket(searchQuery);
    if (webSearchResults.length > 0) {
      console.log(`[Research:${agent.id}] ✅ Found ${webSearchResults.length} web results`);
    }
  } catch (error) {
    console.warn(`[Research:${agent.id}] ⚠️ Web search failed (using news/articles only):`, error);
    // Continue without web search - use news/articles instead
  }
  
  const webResearchSummary = buildWebResearchSummary(webSearchResults);
  const webResearchCount = webSearchResults.length;
  
  let side: 'YES' | 'NO' | 'NEUTRAL';
  let confidence: number;
  let reasoning: string[];
  
  // Try AI API if configured - include web search results in context
  if (isAIConfigured(agent.id)) {
    try {
      // Combine news articles with web search results for richer context
      const combinedContext = [...newsArticles];
      
      // Add web search results as "articles" for AI analysis
      if (webSearchResults.length > 0) {
        const webArticles: NewsArticle[] = webSearchResults.map((result, idx) => ({
          id: `web-search-${Date.now()}-${idx}`,
          title: result.title,
          description: result.snippet,
          content: result.snippet,
          source: result.source || 'web-search',
          publishedAt: new Date().toISOString(),
          url: result.url,
          sourceApi: 'web-search',
        }));
        combinedContext.push(...webArticles);
      }
      
      const aiDecision = await getAITradeDecision(agent.id, scored, combinedContext, webSearchResults);
      // For research, allow NEUTRAL if confidence is low
      if (aiDecision.confidence < 0.5) {
        side = 'NEUTRAL';
        confidence = aiDecision.confidence;
      } else {
        side = aiDecision.side;
        confidence = aiDecision.confidence;
      }
      
      // AI already includes web search in reasoning via prompt
      reasoning = aiDecision.reasoning;
    } catch (error) {
      // Fallback to deterministic
      const deterministicSide = getDeterministicSide(scored, seed);
      // For research, sometimes be neutral
      const marketHash = scored.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      if (marketHash % 5 === 0) {
        side = 'NEUTRAL';
        confidence = 0.45; // Low confidence for neutral
      } else {
        side = deterministicSide;
        confidence = getDeterministicConfidence(scored, agent, seed);
      }
      
      // Include web search in reasoning if available
      reasoning = getDeterministicReasoning(scored, newsRelevance, agent);
      if (webSearchResults.length > 0) {
        const webInsight = `Web research found ${webSearchResults.length} source${webSearchResults.length > 1 ? 's' : ''} - ${webSearchResults[0]?.snippet?.substring(0, 80) || 'relevant information'}...`;
        reasoning = [webInsight, ...reasoning].slice(0, 4);
      }
    }
  } else {
    // Use deterministic logic
    const deterministicSide = getDeterministicSide(scored, seed);
    const marketHash = scored.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    if (marketHash % 5 === 0) {
      side = 'NEUTRAL';
      confidence = 0.45;
    } else {
      side = deterministicSide;
      confidence = getDeterministicConfidence(scored, agent, seed);
    }
    reasoning = getDeterministicReasoning(scored, newsRelevance, agent);
    if (webSearchResults.length > 0) {
      const webInsight = `Web research found ${webSearchResults.length} source${webSearchResults.length > 1 ? 's' : ''} - ${webSearchResults[0]?.snippet?.substring(0, 80) || 'relevant information'}...`;
      reasoning = [webInsight, ...reasoning].slice(0, 4);
    }
  }
  
  // Generate timestamp
  const timestamp = new Date(now - (index * 1000)).toISOString();
  
  // Generate summary decision
  const sideText = side === 'NEUTRAL' ? 'analyzed' : `leaning ${side}`;
  const probPercent = Math.round(scored.currentProbability * 100);
  const trimmedQuestion = scored.question.length > 110 ? `${scored.question.substring(0, 107)}...` : scored.question;
  const leadReason = reasoning[0] || 'the qualitative signals met expectations';
  const formattedLeadReason = leadReason.charAt(0).toLowerCase() + leadReason.slice(1);
  const webNote = webSearchResults.length > 0
    ? `Incorporated ${webSearchResults.length} targeted web sources plus ${newsRelevance.count} news hits.`
    : `${newsRelevance.count} directly-related news item${newsRelevance.count === 1 ? '' : 's'} reviewed.`;
  const summaryDecision =
    `${agent.displayName} ${sideText} on "${trimmedQuestion}" at ${probPercent}% reading because ${formattedLeadReason}. ${webNote}`;
  
  // Create research decision
  const research: ResearchDecision = {
    id: `${agent.id}:${scored.id}:research`,
    agentId: agent.id,
    marketId: scored.id,
    marketQuestion: scored.question,
    side,
    confidence,
    score: scored.score,
    reasoning,
    timestamp,
    summaryDecision,
    webResearchSummary,
    webResearchCount,
  };
  
  console.log(`[Research:${agent.id}] 🔍 Analyzed market "${scored.question.substring(0, 50)}..." (score: ${scored.score.toFixed(1)}, side: ${side})`);
  
  return research;
}
