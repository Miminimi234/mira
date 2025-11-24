/**
 * Web search integration for agent market research
 * 
 * Agents can search the web for market-specific information to make better decisions.
 * Uses SerpAPI or Google Custom Search API for web search.
 * Results are kept concise to minimize API costs.
 */

/**
 * Web search result (concise format)
 */
export interface WebSearchResult {
  title: string;
  snippet: string; // Brief snippet (max 150 chars)
  url: string;
  source: string; // e.g., "Reuters", "Bloomberg", etc.
}

/**
 * Search the web for market information
 * 
 * @param query - Search query (market question + keywords)
 * @returns Array of search results (max 5 to save credits)
 */
export async function searchWebForMarket(query: string): Promise<WebSearchResult[]> {
  let lastError: unknown = null;

  // Try Google Custom Search API first (cheaper, higher quota)
  const googleSearchApiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleSearchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (googleSearchApiKey && googleSearchEngineId) {
    try {
      return await searchWithGoogleCustomSearch(query, googleSearchApiKey, googleSearchEngineId);
    } catch (error) {
      lastError = error;
      console.warn('[WebSearch] Google Custom Search failed, falling back:', (error as Error)?.message || error);
    }
  }

  // Try SerpAPI second (limited monthly quota)
  const serpApiKey = process.env.SERP_API_KEY;
  if (serpApiKey) {
    try {
      return await searchWithSerpAPI(query, serpApiKey);
    } catch (error) {
      lastError = error;
      console.warn('[WebSearch] SerpAPI failed, falling back:', (error as Error)?.message || error);
    }
  }
  
  // Fallback: DuckDuckGo (no key required)
  try {
    const duckResults = await searchWithDuckDuckGo(query);
    if (duckResults.length > 0) {
      return duckResults;
    }
  } catch (error) {
    lastError = error;
    console.warn('[WebSearch] DuckDuckGo search failed:', (error as Error)?.message || error);
  }
  
  if (lastError) {
    console.error('[WebSearch] All search providers failed:', lastError);
  } else {
    console.log('[WebSearch] No search API configured - using news/articles only');
  }
  return [];
}

/**
 * Search using SerpAPI
 */
async function searchWithSerpAPI(query: string, apiKey: string): Promise<WebSearchResult[]> {
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${apiKey}&num=5`;
  
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000), // 5 second timeout
  });
  
  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status}`);
  }
  
    const data = await response.json() as any;
  const results = data.organic_results || [];
  
  return results.slice(0, 5).map((result: any) => ({
    title: result.title || '',
    snippet: (result.snippet || '').substring(0, 150), // Keep snippets short
    url: result.link || '',
    source: extractSourceFromUrl(result.link || ''),
  }));
}

/**
 * Search using Google Custom Search API
 */
async function searchWithGoogleCustomSearch(
  query: string,
  apiKey: string,
  engineId: string
): Promise<WebSearchResult[]> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${encodeURIComponent(query)}&num=5`;
  
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000), // 5 second timeout
  });
  
  if (!response.ok) {
    throw new Error(`Google Custom Search error: ${response.status}`);
  }
  
    const data = await response.json() as any;
  const results = data.items || [];
  
  return results.slice(0, 5).map((result: any) => ({
    title: result.title || '',
    snippet: (result.snippet || '').substring(0, 150), // Keep snippets short
    url: result.link || '',
    source: extractSourceFromUrl(result.link || ''),
  }));
}


/**
 * Search using DuckDuckGo Instant Answer API (no key required)
 */
async function searchWithDuckDuckGo(query: string): Promise<WebSearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo error: ${response.status}`);
  }
  const data = await response.json() as any;
  const results: WebSearchResult[] = [];

  const addResult = (item: any) => {
    if (!item) return;
    const title = item.Text || item.Result || item.FirstURL || '';
    const snippet = (item.Text || '').substring(0, 150);
    const urlResult = item.FirstURL || item.URL || '';
    if (title && urlResult) {
      results.push({
        title,
        snippet,
        url: urlResult,
        source: extractSourceFromUrl(urlResult),
      });
    }
  };

  if (Array.isArray(data.RelatedTopics)) {
    data.RelatedTopics.forEach((topic: any) => {
      if (Array.isArray(topic.Topics)) {
        topic.Topics.forEach(addResult);
      } else {
        addResult(topic);
      }
    });
  }

  if (results.length === 0 && data.AbstractURL) {
    results.push({
      title: data.Heading || query,
      snippet: (data.Abstract || '').substring(0, 150),
      url: data.AbstractURL,
      source: extractSourceFromUrl(data.AbstractURL),
    });
  }

  return results.slice(0, 5);
}

/**
 * Extract source name from URL
 */
function extractSourceFromUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    const parts = domain.replace(/^www\./, '').split('.');
    if (parts.length >= 2) {
      const base = parts[parts.length - 2];
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
    return domain;
  } catch {
    return 'Web';
  }
}

/**
 * Build search query from market question
 *
 * Extracts key terms from market question for focused search
 */
export function buildMarketSearchQuery(marketQuestion: string, category?: string): string {
  const stopWords = ['will', 'the', 'be', 'by', 'in', 'on', 'at', 'to', 'for', 'of', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were'];
  const words = marketQuestion
    .toLowerCase()
    .split(/[\s\-_.,;:!?()]+/)
    .filter(w => w.length >= 3 && !stopWords.includes(w))
    .slice(0, 5);

  let query = words.join(' ');
  if (category && category !== 'Other') {
    query = `${query} ${category}`;
  }
  query = `${query} news prediction`;
  return query.trim();
}
