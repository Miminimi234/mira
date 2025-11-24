// Polymarket API Service
// SECURITY: This file should NOT contain API credentials
// All API calls should go through the backend proxy to keep secrets server-side
// Client-side code should only call the backend API endpoints

// Using Polymarket's API endpoints (for reference only - not used client-side)
// Note: Polymarket's public API structure - trying multiple known endpoints
const POLYMARKET_API_BASE = 'https://clob.polymarket.com';
const POLYMARKET_DATA_API = 'https://data-api.polymarket.com';
const POLYMARKET_GRAPHQL = 'https://data-api.polymarket.com/graphql';
// Polymarket's public frontend API (used by their website)
const POLYMARKET_PUBLIC_API = 'https://api.polymarket.com';
const POLYMARKET_WEBSITE_API = 'https://polymarket.com';

// SECURITY: Removed API credentials from client-side code
// All authenticated API calls must go through backend proxy (/api/predictions)
// Client-side code should only use public endpoints or backend proxy
export const POLYMARKET_CONFIG = {
  apiKey: null, // SECURITY: Never expose API keys in client-side code
  secret: null, // SECURITY: Never expose secrets in client-side code
  passphrase: null, // SECURITY: Never expose passphrases in client-side code
};

export interface PolymarketMarket {
  condition_id: string;
  question: string;
  slug: string;
  resolution_source: string;
  end_date_iso: string;
  image?: string;
  description?: string;
  icon?: string;
  active: boolean;
  closed: boolean;
  new?: boolean;
  featured?: boolean;
  liquidity?: number;
  volume?: number;
  volume_24h?: number;
  volume_7d?: number;
  current_price?: number;
  outcome_prices?: {
    '0': string; // YES price
    '1': string; // NO price
  };
  tags?: string[];
  category?: string;
  subcategory?: string;
  token_id?: string;
  end_date?: string;
  start_date?: string;
  created_at?: string;
}

export interface PolymarketMarketsResponse {
  markets?: PolymarketMarket[];
  data?: PolymarketMarket[];
  count?: number;
  cursor?: string;
}

// Helper function to map Polymarket category to our categories
export const mapPolymarketCategory = (category: string | undefined, tags: string[] = [], question?: string): string => {
  const categoryLower = category?.toLowerCase() || '';
  const tagsLower = tags?.map(t => t.toLowerCase()) || [];
  const questionLower = question?.toLowerCase() || '';

  // Check for specific categories - more comprehensive mapping
  // Also check question text if category/tags are missing
  if (categoryLower.includes('politics') || categoryLower.includes('election') ||
    categoryLower.includes('elections') ||
    tagsLower.some(t => t.includes('politics') || t.includes('election') || t.includes('trump') || t.includes('biden')) ||
    questionLower.includes('election') || questionLower.includes('president') || questionLower.includes('trump') || questionLower.includes('biden')) {
    return 'Politics';
  }
  if (categoryLower === 'elections' || tagsLower.some(t => t.includes('election') && !t.includes('politics'))) {
    return 'Elections';
  }
  // Sports - check question text for sports keywords
  if (categoryLower.includes('sports') ||
    tagsLower.some(t => t.includes('sports') || t.includes('football') || t.includes('basketball') || t.includes('soccer') || t.includes('nfl') || t.includes('nba')) ||
    questionLower.includes('super bowl') || questionLower.includes('nfl') || questionLower.includes('nba') ||
    questionLower.includes('football') || questionLower.includes('basketball') || questionLower.includes('soccer') ||
    questionLower.includes('baseball') || questionLower.includes('hockey') || questionLower.includes('tennis') ||
    questionLower.includes('championship') || questionLower.includes('playoff') || questionLower.includes('world cup') ||
    questionLower.includes('olympics') || questionLower.includes('ncaa') || questionLower.includes('ufc') ||
    questionLower.includes('boxing') || questionLower.includes('golf') || questionLower.includes('racing')) {
    return 'Sports';
  }
  if (categoryLower.includes('crypto') || categoryLower.includes('cryptocurrency') ||
    tagsLower.some(t => t.includes('crypto') || t.includes('bitcoin') || t.includes('ethereum') || t.includes('btc') || t.includes('eth') || t.includes('solana')) ||
    questionLower.includes('bitcoin') || questionLower.includes('ethereum') || questionLower.includes('crypto') ||
    questionLower.includes('btc') || questionLower.includes('eth') || questionLower.includes('solana') ||
    questionLower.includes('blockchain') || questionLower.includes('defi') || questionLower.includes('nft')) {
    return 'Crypto';
  }
  if (categoryLower.includes('finance') || categoryLower.includes('earnings') || categoryLower.includes('stocks') ||
    tagsLower.some(t => t.includes('finance') || t.includes('earnings') || t.includes('stock') || t.includes('trading')) ||
    questionLower.includes('stock') || questionLower.includes('earnings') || questionLower.includes('revenue') ||
    questionLower.includes('profit') || questionLower.includes('dow') || questionLower.includes('s&p') ||
    questionLower.includes('nasdaq') || questionLower.includes('fed') || questionLower.includes('interest rate')) {
    return 'Finance';
  }
  if (categoryLower.includes('earnings') || tagsLower.some(t => t.includes('earnings') && !t.includes('finance'))) {
    return 'Earnings';
  }
  // Tech category - be more specific to avoid false positives
  // Only categorize as Tech if it's clearly about technology/AI, not just mentioning tech companies
  if (categoryLower.includes('tech') || categoryLower.includes('technology') ||
    tagsLower.some(t => t.includes('tech') || t.includes('ai') || t.includes('artificial intelligence') || t.includes('software'))) {
    return 'Tech';
  }
  // Only check question text for tech if it's clearly about tech/AI, not just company names
  if (questionLower.includes('artificial intelligence') || questionLower.includes('chatgpt') ||
    questionLower.includes('gpt') || questionLower.includes('openai') ||
    questionLower.includes('software') || questionLower.includes('algorithm') ||
    questionLower.includes('machine learning') || questionLower.includes('neural network')) {
    return 'Tech';
  }
  // Don't categorize as Tech just because it mentions Google/Apple/Microsoft - those could be politics/finance
  if (categoryLower.includes('geopolitics') || categoryLower.includes('geopolitical') ||
    tagsLower.some(t => t.includes('geopolitics') || t.includes('war') || t.includes('conflict') || t.includes('ukraine') || t.includes('russia'))) {
    return 'Geopolitics';
  }
  if (tagsLower.some(t => t.includes('trending'))) {
    return 'Trending';
  }
  if (tagsLower.some(t => t.includes('breaking'))) {
    return 'Breaking';
  }
  if (categoryLower.includes('entertainment') || categoryLower.includes('movies') || categoryLower.includes('tv') ||
    tagsLower.some(t => t.includes('movie') || t.includes('tv') || t.includes('film') || t.includes('entertainment'))) {
    return 'Breaking';
  }
  // Default to World for everything else
  return 'World';
};

// Use local proxy server to avoid CORS issues
// In production, use relative URLs; in development, use localhost
const getProxyBase = async (): Promise<string> => {
  const { API_BASE_URL } = await import('./apiConfig');
  return API_BASE_URL;
};

// For backwards compatibility, export a function that gets the base URL
export const getProxyBaseUrl = getProxyBase;

// Check if proxy server is running
export const checkServerHealth = async (): Promise<boolean> => {
  try {
    const proxyBase = await getProxyBaseUrl();
    const response = await fetch(`${proxyBase}/api/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    return response.ok;
  } catch (error) {
    return false;
  }
};

// Fetch markets from Polymarket via proxy server
export const fetchPolymarketMarkets = async (
  limit: number = 50,
  cursor?: string,
  category?: string,
  active: boolean = false, // Default to false to get ALL markets
  offset: number = 0 // Add offset for pagination
): Promise<PolymarketMarketsResponse> => {
  try {
    const proxyBase = await getProxyBaseUrl();
    // Check if server is running first
    const isServerRunning = await checkServerHealth();
    if (!isServerRunning) {
      throw new Error(`Proxy server is not running at ${proxyBase}. Please start it with: npm run server`);
    }
    const params = new URLSearchParams({
      limit: limit.toString(),
      active: active.toString(),
      offset: offset.toString(),
      ...(cursor && { cursor }),
      ...(category && { category: category.toLowerCase() }),
    });

    // Call our proxy server
    const response = await fetch(`${proxyBase}/api/polymarket/markets?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Proxy server error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();

    // Check if server returned an error in the response body
    if (data.error) {
      throw new Error(`API Error: ${data.error}`);
    }

    if (data.markets && Array.isArray(data.markets)) {
      return { markets: data.markets, count: data.markets.length };
    }

    // If markets is empty array, that's valid - return it
    if (Array.isArray(data.markets) && data.markets.length === 0) {
      return { markets: [], count: 0 };
    }

    throw new Error(`Invalid response format from proxy: ${JSON.stringify(data).substring(0, 200)}`);
  } catch (error) {
    // Throw error instead of returning empty - let caller handle it
    throw error;
  }
};

// Fetch featured/trending markets via proxy
export const fetchFeaturedMarkets = async (): Promise<PolymarketMarket[]> => {
  try {
    const proxyBase = await getProxyBaseUrl();
    const response = await fetch(`${proxyBase}/api/polymarket/markets?featured=true&limit=20&active=true`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Proxy server error: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.markets) ? data.markets : [];
  } catch (error) {
    throw error;
  }
};

// Fetch markets by category via proxy
export const fetchMarketsByCategory = async (category: string): Promise<PolymarketMarket[]> => {
  try {
    // Request MORE markets for category searches - fetch with pagination to get ALL markets
    let allMarkets: any[] = [];
    const limitPerPage = 1000;
    const maxPages = 20; // Fetch up to 20,000 markets for category

    const proxyBase = await getProxyBaseUrl();
    for (let page = 0; page < maxPages; page++) {
      const offset = page * limitPerPage;
      const response = await fetch(`${proxyBase}/api/polymarket/markets?category=${encodeURIComponent(category)}&limit=${limitPerPage}&active=true&offset=${offset}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (page === 0) {
          throw new Error(`Proxy server error: ${response.status}`);
        }
        // If later pages fail, just break and return what we have
        break;
      }

      const data = await response.json();
      const pageMarkets = Array.isArray(data.markets) ? data.markets : [];

      if (pageMarkets.length === 0) {
        break;
      }

      allMarkets = allMarkets.concat(pageMarkets);

      // If we got fewer than requested, we've reached the end
      if (pageMarkets.length < limitPerPage) {
        break;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return allMarkets;
  } catch (error) {
    throw error;
  }
};

// Helper to transform Polymarket market to PredictionNodeData format
export const transformPolymarketToPrediction = (
  market: any, // Using any to handle different Polymarket API response structures
  agentName: string
): import('@/components/PredictionTypes').PredictionNodeData | null => {
  try {
    // Handle different market structures - Gamma API might return events with markets inside
    let actualMarket = market;

    // If market is an event with markets array, use the first market
    if (market.markets && Array.isArray(market.markets) && market.markets.length > 0) {
      actualMarket = market.markets[0];
    }

    // FILTER OUT CLOSED/FINISHED MARKETS - Only show active markets
    // Check multiple possible field names and formats
    const closedValue = actualMarket.closed ??
      actualMarket.isClosed ??
      actualMarket.market?.closed ??
      actualMarket.event?.closed;

    const archivedValue = actualMarket.archived ??
      actualMarket.isArchived ??
      actualMarket.market?.archived;

    const activeValue = actualMarket.active ??
      actualMarket.isActive ??
      actualMarket.market?.active;

    const statusValue = actualMarket.status ??
      actualMarket.market?.status ??
      actualMarket.event?.status;

    // Check if closed (be strict - only skip if explicitly closed)
    const isClosed = closedValue === true ||
      closedValue === 'true' ||
      closedValue === 1 ||
      statusValue === 'closed' ||
      statusValue === 'resolved' ||
      statusValue === 'finished' ||
      statusValue === 'settled';

    // Check if archived
    const isArchived = archivedValue === true ||
      archivedValue === 'true' ||
      archivedValue === 1;

    // Only skip if EXPLICITLY closed or archived
    if (isClosed || isArchived) {
      return null; // Don't show finished markets
    }

    // CRITICAL: Filter out expired markets (end date in the past)
    const endDate = actualMarket.end_date_iso ||
      actualMarket.end_date ||
      actualMarket.event?.end_date_iso ||
      actualMarket.market?.end_date_iso;

    if (endDate) {
      try {
        const endDateObj = new Date(endDate);
        const now = new Date();
        if (endDateObj < now) {
          // Market has expired - don't show it
          return null;
        }
      } catch (e) {
        // Invalid date format - skip this check
      }
    }

    // Filter out inactive markets when we're looking for active ones
    // The server should have filtered, but double-check
    if (activeValue === false || activeValue === 'false' || activeValue === 0) {
      // Only skip if we're sure it's inactive AND we have no other indicators
      // But trust the server filtering for now
    }

    // Skip if no question (required field) - try multiple field names
    const question = actualMarket.question ||
      actualMarket.title ||
      actualMarket.name ||
      actualMarket.event?.title ||
      actualMarket.market?.question ||
      '';

    if (!question || question.trim() === '') {
      return null;
    }

    // Handle different Polymarket API response structures
    let yesPrice = 0.5;
    let noPrice = 0.5;
    let priceSource = 'default';

    // Check if market has tokens array (newer API structure) - this is the most common format
    if (actualMarket.tokens && Array.isArray(actualMarket.tokens) && actualMarket.tokens.length >= 2) {
      // Find YES token (usually "Yes" or first token)
      const yesToken = actualMarket.tokens.find((t: any) =>
        t.outcome === 'Yes' || t.outcome === 'YES' ||
        t.outcome?.toLowerCase().includes('yes')
      ) || actualMarket.tokens[0];

      // Find NO token (usually "No" or second token)
      const noToken = actualMarket.tokens.find((t: any) =>
        t.outcome === 'No' || t.outcome === 'NO' ||
        (t.outcome?.toLowerCase().includes('no') && t !== yesToken)
      ) || actualMarket.tokens[1];

      // Try multiple price field names in token
      const yesTokenPrice = yesToken?.price ??
        yesToken?.lastPrice ??
        yesToken?.currentPrice ??
        yesToken?.last_price ??
        yesToken?.current_price;

      const noTokenPrice = noToken?.price ??
        noToken?.lastPrice ??
        noToken?.currentPrice ??
        noToken?.last_price ??
        noToken?.current_price;

      if (yesTokenPrice !== undefined && yesTokenPrice !== null) {
        yesPrice = parseFloat(String(yesTokenPrice));
        priceSource = 'tokens[yes].price';
      }
      if (noTokenPrice !== undefined && noTokenPrice !== null) {
        noPrice = parseFloat(String(noTokenPrice));
        priceSource = 'tokens[no].price';
      } else if (yesPrice !== 0.5) {
        noPrice = 1 - yesPrice;
      }
    }
    // Check if market has tokens array with only one token (use it as YES, calculate NO)
    else if (actualMarket.tokens && Array.isArray(actualMarket.tokens) && actualMarket.tokens.length === 1) {
      const token = actualMarket.tokens[0];
      const tokenPrice = token?.price ??
        token?.lastPrice ??
        token?.currentPrice ??
        token?.last_price ??
        token?.current_price;
      if (tokenPrice !== undefined && tokenPrice !== null) {
        yesPrice = parseFloat(String(tokenPrice));
        noPrice = 1 - yesPrice;
        priceSource = 'tokens[0].price';
      }
    }
    // Check if market has outcome_prices (older API structure)
    else if (actualMarket.outcome_prices) {
      if (actualMarket.outcome_prices['0'] !== undefined) {
        yesPrice = parseFloat(String(actualMarket.outcome_prices['0']));
        priceSource = 'outcome_prices[0]';
      }
      if (actualMarket.outcome_prices['1'] !== undefined) {
        noPrice = parseFloat(String(actualMarket.outcome_prices['1']));
      } else if (yesPrice !== 0.5) {
        noPrice = 1 - yesPrice;
      }
    }
    // Check if market has current_price
    else if (actualMarket.current_price !== undefined && actualMarket.current_price !== null) {
      yesPrice = parseFloat(String(actualMarket.current_price));
      noPrice = 1 - yesPrice;
      priceSource = 'current_price';
    }
    // Check if market has price directly
    else if (actualMarket.price !== undefined && actualMarket.price !== null) {
      yesPrice = parseFloat(String(actualMarket.price));
      noPrice = 1 - yesPrice;
      priceSource = 'price';
    }
    // Check if market has lastPrice
    else if (actualMarket.lastPrice !== undefined && actualMarket.lastPrice !== null) {
      yesPrice = parseFloat(String(actualMarket.lastPrice));
      noPrice = 1 - yesPrice;
      priceSource = 'lastPrice';
    }

    // Ensure prices are valid
    if (isNaN(yesPrice) || yesPrice < 0) yesPrice = 0.5;
    if (isNaN(noPrice) || noPrice < 0) noPrice = 0.5;

    // Normalize if they don't sum to 1
    const total = yesPrice + noPrice;
    if (total > 0) {
      yesPrice = yesPrice / total;
      noPrice = noPrice / total;
    }

    // Determine position based on which price is higher
    const position: 'YES' | 'NO' = yesPrice >= noPrice ? 'YES' : 'NO';
    const currentPrice = position === 'YES' ? yesPrice : noPrice;
    const probability = Math.max(1, Math.min(99, Math.round(currentPrice * 100)));

    // Calculate change (mock for now, would need historical data)
    const change = parseFloat((Math.random() * 10 - 5).toFixed(1)); // Random change between -5 and +5

    // Get market ID - use multiple fallbacks, ensure uniqueness
    // Try to get a unique identifier from Polymarket first
    let marketId = actualMarket.condition_id ||
      actualMarket.question_id ||
      actualMarket.slug ||
      actualMarket.id ||
      actualMarket.market_id ||
      actualMarket.event?.condition_id ||
      actualMarket.event?.id;

    // If no unique ID found, generate one from question + a hash
    if (!marketId) {
      const questionHash = question.split('').reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0);
      }, 0);
      marketId = `market-${question.substring(0, 30).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}-${Math.abs(questionHash).toString(36)}`;
    }

    // Ensure ID is a string
    marketId = String(marketId);

    // Get market slug for Polymarket URL - try multiple field names
    // Check the actual market object first, then nested structures
    let marketSlug = actualMarket.market_slug ||
      actualMarket.slug ||
      actualMarket.event?.slug ||
      actualMarket.market?.slug ||
      actualMarket.event?.market_slug;

    // If still no slug, check if we're dealing with an event structure
    if (!marketSlug && actualMarket.event) {
      marketSlug = actualMarket.event.market_slug || actualMarket.event.slug;
    }

    // Log for debugging (only first few to avoid spam)
    if (!marketSlug) {
    }

    // Get condition_id for alternative URL construction
    const conditionId = actualMarket.condition_id ||
      actualMarket.event?.condition_id;

    // Map Polymarket category to our category system
    // Pass the question text so we can detect categories from question content when category/tags are missing
    const marketCategory = mapPolymarketCategory(actualMarket.category, actualMarket.tags || [], question);

    return {
      id: marketId,
      question: question.trim(),
      probability,
      position,
      price: currentPrice,
      change,
      agentName,
      agentEmoji: '', // Will be replaced with logo
      reasoning: actualMarket.description || actualMarket.summary || `Market analysis based on ${actualMarket.category || actualMarket.tags?.[0] || 'general'} category.`,
      category: marketCategory, // Store the mapped category
      marketSlug: marketSlug ? String(marketSlug) : undefined, // Store slug for Polymarket link
      conditionId: conditionId ? String(conditionId) : undefined, // Store condition_id as fallback
    };
  } catch (error) {
    return null;
  }
};

