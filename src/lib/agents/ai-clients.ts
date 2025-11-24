/**
 * AI API Clients
 * 
 * Integrates with actual AI APIs for each agent:
 * - OpenAI (GPT-5)
 * - Anthropic (Claude 4.5)
 * - xAI (GROK 4)
 * - Google AI (Gemini 2.5)
 * - DeepSeek (DEEPSEEK V3)
 * - Qwen (QWEN 2.5)
 */

import type { AgentId, Market, NewsArticle } from './domain.js';
import { getCachedAIDecision, setCachedAIDecision } from './ai-cache.js';

/**
 * AI API response for trade decision
 */
export interface AITradeDecision {
  side: 'YES' | 'NO';
  confidence: number; // 0-1
  reasoning: string[]; // Array of reasoning bullets
}

/**
 * Market context for AI decision
 */
interface MarketContext {
  question: string;
  category: string;
  currentProbability: number;
  volumeUsd: number;
  liquidityUsd: number;
  priceChange24h: number;
  relevantNews: Array<{
    title: string;
    source: string;
    publishedAt: string;
  }>;
}

/**
 * OpenAI API (GPT-5)
 */
async function callOpenAI(context: MarketContext): Promise<AITradeDecision> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const prompt = buildTradePrompt(context, 'GPT-5');
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are GPT-5, an expert prediction market trader. Analyze markets and make trading decisions. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(error)}`);
  }

  const data = await response.json() as any;
  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return parseAIResponse(content);
}

/**
 * Anthropic API (Claude 4.5)
 */
async function callAnthropic(context: MarketContext, webSearchResults?: any[]): Promise<AITradeDecision> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = buildTradePrompt(context, 'Claude 4.5', webSearchResults);
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-opus-20240229',
      max_tokens: 1000,
      system: 'You are an analytical assistant helping analyze prediction market data. You evaluate market information and provide structured analysis in JSON format. This is for data analysis purposes, not financial advice.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Anthropic API error: ${response.status} - ${JSON.stringify(error)}`);
  }

  const data = await response.json() as any;
  const content = data.content[0]?.text;
  if (!content) {
    throw new Error('No response from Anthropic');
  }

  // Check if Claude refused the request
  const refusalIndicators = [
    'do not feel comfortable',
    'cannot',
    'unable to',
    'not comfortable',
    'refuse',
    'decline',
    'outside of my',
  ];
  const isRefusal = refusalIndicators.some(indicator => 
    content.toLowerCase().includes(indicator.toLowerCase())
  );

  if (isRefusal) {
    console.warn('[AI] Claude refused the request, using fallback');
    throw new Error('Claude refused to provide analysis');
  }

  return parseAIResponse(content);
}

/**
 * xAI GROK API (GROK 4)
 */
async function callGroq(context: MarketContext, webSearchResults?: any[]): Promise<AITradeDecision> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new Error('GROK_API_KEY not configured');
  }

  const prompt = buildTradePrompt(context, 'GROK 4', webSearchResults);
  
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-3',
      messages: [
        {
          role: 'system',
          content: 'You are GROK 4, an aggressive prediction market trader. Make bold, high-conviction trades. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`xAI GROK API error: ${response.status} - ${JSON.stringify(error)}`);
  }

  const data = await response.json() as any;
  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from xAI GROK');
  }

  return parseAIResponse(content);
}

/**
 * Google AI API (Gemini 2.5)
 */
async function callGoogleAI(context: MarketContext, webSearchResults?: any[]): Promise<AITradeDecision> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY not configured');
  }

  const prompt = buildTradePrompt(context, 'Gemini 2.5', webSearchResults);
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `You are Gemini 2.5, an expert prediction market trader specializing in sports and entertainment. ${prompt}`,
        }],
      }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Google AI API error: ${response.status} - ${JSON.stringify(error)}`);
  }

  const data = await response.json() as any;
  const content = data.candidates[0]?.content?.parts[0]?.text;
  if (!content) {
    throw new Error('No response from Google AI');
  }

  return parseAIResponse(content);
}

/**
 * DeepSeek API (DEEPSEEK V3)
 */
async function callDeepSeek(context: MarketContext, webSearchResults?: any[]): Promise<AITradeDecision> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const prompt = buildTradePrompt(context, 'DEEPSEEK V3', webSearchResults);
  
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'You are DEEPSEEK V3, a strategic prediction market trader. Analyze markets deeply and make well-reasoned trades. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`DeepSeek API error: ${response.status} - ${JSON.stringify(error)}`);
  }

  const data = await response.json() as any;
  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from DeepSeek');
  }

  return parseAIResponse(content);
}

/**
 * Qwen API (QWEN 2.5)
 */
async function callQwen(context: MarketContext, webSearchResults?: any[]): Promise<AITradeDecision> {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    throw new Error('QWEN_API_KEY not configured');
  }

  const prompt = buildTradePrompt(context, 'QWEN 2.5', webSearchResults);
  
  const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'qwen-turbo',
      input: {
        messages: [
          {
            role: 'system',
            content: 'You are QWEN 2.5, an expert prediction market trader specializing in finance and geopolitics. Always respond with valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      parameters: {
        temperature: 0.7,
        result_format: 'message',
      },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' })) as any;
    
    // Handle access denied errors gracefully (403 = account not eligible)
    if (response.status === 403 && error?.code === 'AccessDenied.Unpurchased') {
      // This is an account eligibility issue, not a code error
      // Throw a specific error that can be handled quietly
      const accessError = new Error('Qwen API access denied - account not eligible');
      (accessError as any).isAccessDenied = true;
      throw accessError;
    }
    
    throw new Error(`Qwen API error: ${response.status} - ${JSON.stringify(error)}`);
  }

  const data = await response.json() as any;
  const content = data.output?.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from Qwen');
  }

  return parseAIResponse(content);
}

/**
 * Build prompt for AI decision
 */
function buildTradePrompt(context: MarketContext, agentName: string, webSearchResults?: any[]): string {
  // Build detailed news summary with snippets
  const newsSummary = context.relevantNews.length > 0
    ? `\n\nRelevant News Articles:\n${context.relevantNews.slice(0, 5).map((n, idx) => {
        const date = new Date(n.publishedAt);
        return `${idx + 1}. "${n.title}" - ${n.source} (${date.toLocaleDateString()})`;
      }).join('\n')}`
    : '\n\nNo recent relevant news articles found.';

  // Build web search summary if available
  const webSearchSummary = webSearchResults && webSearchResults.length > 0
    ? `\n\nWeb Research Findings:\n${webSearchResults.slice(0, 3).map((result, idx) => {
        return `${idx + 1}. ${result.title || 'Source'} (${result.source || 'Web'}): ${(result.snippet || '').substring(0, 200)}`;
      }).join('\n\n')}`
    : '';

  // Calculate key metrics for context
  const probPercent = (context.currentProbability * 100).toFixed(1);
  const volumeK = (context.volumeUsd / 1000).toFixed(1);
  const liquidityK = (context.liquidityUsd / 1000).toFixed(1);
  const priceChange = (context.priceChange24h * 100).toFixed(1);
  const priceChangeNum = parseFloat(priceChange);
  
  // Determine market sentiment from probability
  const marketSentiment = context.currentProbability > 0.6 
    ? 'bullish (leaning YES)' 
    : context.currentProbability < 0.4 
    ? 'bearish (leaning NO)' 
    : 'neutral (near 50/50)';

  return `You are ${agentName}, an expert prediction market trader. Analyze this market and make a trading decision.

MARKET DETAILS:
Question: "${context.question}"
Category: ${context.category}
Current Probability: ${probPercent}% (${marketSentiment})
Trading Volume: $${volumeK}k
Liquidity: $${liquidityK}k
24h Price Change: ${priceChangeNum > 0 ? '+' : ''}${priceChange}%${newsSummary}${webSearchSummary}

YOUR TASK:
1. Analyze WHY this market is worth trading (or not)
2. Explain SPECIFIC factors that support your decision
3. Reference actual data points (probability, volume, news, web research)
4. Be specific about what convinced you to trade ${context.currentProbability > 0.5 ? 'YES' : 'NO'}

IMPORTANT: Your reasoning must be SPECIFIC to this market. Do NOT use generic phrases like "high volume indicates interest" or "good liquidity". Instead, explain:
- What specific probability level makes this attractive (e.g., "56% is undervalued because...")
- What news/web findings directly relate to the outcome
- Why the volume/liquidity/price movement matters FOR THIS SPECIFIC MARKET
- What unique factors make this trade worth the investment

Respond in JSON format:
{
  "side": "YES" or "NO",
  "confidence": 0.0 to 1.0,
  "reasoning": [
    "Specific reason 1 that explains WHY you're trading this direction (reference actual data)",
    "Specific reason 2 with concrete details from news/web research",
    "Specific reason 3 explaining what makes this market unique and worth the trade"
  ]
}

Each reasoning point should be 1-2 sentences and reference specific data from the market, news, or web research above.`;
}

/**
 * Parse AI response JSON
 */
function parseAIResponse(content: string): AITradeDecision {
  try {
    let jsonStr = content.trim();
    
    // Check for refusal responses first
    const refusalIndicators = [
      'do not feel comfortable',
      'cannot',
      'unable to',
      'not comfortable',
      'refuse',
      'decline',
      'outside of my',
      'apologize',
    ];
    const isRefusal = refusalIndicators.some(indicator => 
      jsonStr.toLowerCase().includes(indicator.toLowerCase())
    );

    if (isRefusal) {
      throw new Error('AI refused to provide analysis');
    }
    
    // Try to extract JSON from markdown code blocks
    let jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      // Try to find JSON object in the text (for Anthropic which adds text before JSON)
      jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      } else {
        // If no JSON found and it's not a refusal, it's a parsing error
        throw new Error('No JSON found in response');
      }
    }

    const parsed = JSON.parse(jsonStr);
    
    const side = parsed.side === 'YES' || parsed.side === 'yes' ? 'YES' : 'NO';
    const confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));
    const reasoning = Array.isArray(parsed.reasoning)
      ? parsed.reasoning.map((r: any) => String(r))
      : parsed.reasoning
        ? [String(parsed.reasoning)]
        : ['AI analysis based on market data'];

    return { side, confidence, reasoning };
  } catch (error) {
    console.error('[AI] Failed to parse AI response:', error);
    console.error('[AI] Raw response:', content.substring(0, 200)); // Log first 200 chars only
    throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get AI decision for an agent
 */
export async function getAITradeDecision(
  agentId: AgentId,
  market: Market,
  newsArticles: NewsArticle[],
  webSearchResults?: any[]
): Promise<AITradeDecision> {
  const cached = getCachedAIDecision(agentId, market.id);
  if (cached) {
    return cached;
  }
  
  const relevantNews = newsArticles
    .filter(article => {
      const text = `${article.title} ${article.description || ''}`.toLowerCase();
      const question = market.question.toLowerCase();
      const keywords = question.split(/\s+/).filter(w => w.length > 4);
      return keywords.some(keyword => text.includes(keyword));
    })
    .slice(0, 5)
    .map(article => ({
      title: article.title,
      source: article.source || 'Unknown',
      publishedAt: article.publishedAt,
    }));

  const context: MarketContext = {
    question: market.question,
    category: market.category,
    currentProbability: market.currentProbability,
    volumeUsd: market.volumeUsd,
    liquidityUsd: market.liquidityUsd,
    priceChange24h: market.priceChange24h,
    relevantNews,
  };

  try {
    let decision: AITradeDecision;
    
    switch (agentId) {
      case 'GPT_5':
        decision = await callOpenAI(context);
        break;
      case 'CLAUDE_4_5':
        decision = await callAnthropic(context);
        break;
      case 'GROK_4':
        decision = await callGroq(context);
        break;
      case 'GEMINI_2_5':
        decision = await callGoogleAI(context);
        break;
      case 'DEEPSEEK_V3':
        decision = await callDeepSeek(context);
        break;
      case 'QWEN_2_5':
        decision = await callQwen(context);
        break;
      default:
        throw new Error(`Unknown agent ID: ${agentId}`);
    }
    
    setCachedAIDecision(agentId, market.id, decision);
    return decision;
  } catch (error) {
    // Only log non-access-denied errors (access denied is expected if account not eligible)
    const isAccessDenied = (error as any)?.isAccessDenied || 
                            (error instanceof Error && error.message.includes('access denied'));
    
    if (!isAccessDenied) {
      console.error(`[AI] Failed to get AI decision for ${agentId}:`, error);
    }
    throw error;
  }
}

/**
 * Check if AI API is configured for an agent
 */
export function isAIConfigured(agentId: AgentId): boolean {
  switch (agentId) {
    case 'GPT_5':
      return !!process.env.OPENAI_API_KEY;
    case 'CLAUDE_4_5':
      return !!process.env.ANTHROPIC_API_KEY;
    case 'GROK_4':
      return !!process.env.GROK_API_KEY;
    case 'GEMINI_2_5':
      return !!process.env.GOOGLE_AI_API_KEY;
    case 'DEEPSEEK_V3':
      return !!process.env.DEEPSEEK_API_KEY;
    case 'QWEN_2_5':
      return !!process.env.QWEN_API_KEY;
    default:
      return false;
  }
}

