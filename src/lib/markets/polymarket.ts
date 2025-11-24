/**
 * Polymarket market data fetching
 * 
 * Fetches all markets from Polymarket API with in-memory caching.
 * Cache TTL: 60 seconds to balance freshness with API rate limits.
 */

import type { Market } from '../agents/domain.js';

/**
 * In-memory cache for Polymarket markets
 */
interface MarketCache {
  markets: Market[];
  cachedAt: number;
}

const MARKET_CACHE_TTL = 60 * 1000; // 60 seconds
let marketCache: MarketCache | null = null;

/**
 * Map Polymarket API response to our Market type
 * 
 * TODO: Adapt this to actual Polymarket API response structure
 * The interface is designed to make this mapping trivial once we have
 * the real API response format.
 * 
 * @param rawMarket - Raw market data from Polymarket API
 * @returns Market object
 */
function mapPolymarketMarket(rawMarket: any): Market {
  // TODO: Replace with actual Polymarket response mapping
  // This is a placeholder structure - adjust based on real API
  
  return {
    id: rawMarket.id || rawMarket.conditionId || String(rawMarket.slug),
    question: rawMarket.question || rawMarket.title || '',
    category: mapCategory(rawMarket.category || rawMarket.tags?.[0] || 'Other'),
    volumeUsd: parseFloat(rawMarket.volume || rawMarket.volume24h || '0'),
    liquidityUsd: parseFloat(rawMarket.liquidity || rawMarket.liquidityUsd || '0'),
    currentProbability: parseFloat(rawMarket.probability || rawMarket.currentPrice || '0.5'),
    priceChange24h: parseFloat(rawMarket.priceChange24h || rawMarket.change24h || '0'),
    raw: rawMarket, // Store raw for debugging
  };
}

/**
 * Map Polymarket category string to our Category type
 * 
 * Handles null, undefined, and non-string values safely.
 */
function mapCategory(category: string | null | undefined | unknown): Market['category'] {
  // Handle null, undefined, or non-string values
  if (!category || typeof category !== 'string') {
    return 'Other';
  }
  
  const normalized = category.trim();
  if (!normalized) {
    return 'Other';
  }
  
  const categoryMap: Record<string, Market['category']> = {
    'crypto': 'Crypto',
    'cryptocurrency': 'Crypto',
    'technology': 'Tech',
    'tech': 'Tech',
    'finance': 'Finance',
    'financial': 'Finance',
    'politics': 'Politics',
    'political': 'Politics',
    'elections': 'Elections',
    'election': 'Elections',
    'sports': 'Sports',
    'entertainment': 'Entertainment',
    'world': 'World',
    'geopolitics': 'Geopolitics',
    'geopolitical': 'Geopolitics',
  };
  
  return categoryMap[normalized.toLowerCase()] || 'Other';
}

/**
 * Fetch all markets from Polymarket API
 * 
 * Uses in-memory cache with 60-second TTL.
 * If API fails, returns last cached copy if available.
 * 
 * @returns Array of Market objects
 * 
 * @throws Never throws - always returns array (empty on error)
 */
export async function fetchAllMarkets(): Promise<Market[]> {
  // Check cache first
  if (marketCache) {
    const age = Date.now() - marketCache.cachedAt;
    if (age < MARKET_CACHE_TTL) {
      console.log(`[Polymarket] 💾 Cache hit: ${marketCache.markets.length} markets (age: ${Math.round(age / 1000)}s)`);
      return marketCache.markets;
    }
    console.log(`[Polymarket] ⏰ Cache expired (age: ${Math.round(age / 1000)}s), fetching new markets...`);
  } else {
    console.log(`[Polymarket] 📊 No cache - fetching markets...`);
  }
  
  try {
    // Use the SAME API structure as bubble maps
    // Bubble maps use: /api/predictions -> server/services/polymarketService.js -> fetchAllMarkets()
    // Trading engine uses: This function -> server/services/polymarketService.js -> fetchAllMarkets()
    // Same API keys, same function, same structure - just different cache
    
    // Check if we're running server-side (Node.js environment)
    const isServerSide = typeof process !== 'undefined' && process.versions?.node;
    
    if (isServerSide) {
      // CRITICAL: Use the SAME transformed predictions as the frontend
      // This ensures market IDs match prediction IDs exactly
      // @ts-ignore - JS modules don't have type declarations
      const { fetchAllMarkets } = await import('../../../server/services/polymarketService.js');
      // @ts-ignore - JS modules don't have type declarations
      const { transformMarkets } = await import('../../../server/services/marketTransformer.js');
      
      // Fetch markets using the same function as bubble maps
      const rawMarkets = await fetchAllMarkets({
        category: null,
        active: true,
        maxPages: 5, // Get enough markets for trading
        limitPerPage: 1000,
      });
      
      console.log(`[Polymarket] ✅ Fetched ${rawMarkets.length} raw markets from API`);
      
      // CRITICAL: Use transformMarkets to get the SAME predictions as frontend
      // This ensures IDs match exactly
      const transformedPredictions = await transformMarkets(rawMarkets);
      
      console.log(`[Polymarket] ✅ Transformed to ${transformedPredictions.length} predictions (same as frontend)`);
      
      // Map transformed predictions to trading engine Market format
      // Use the EXACT same IDs from transformed predictions
      const markets = transformedPredictions.map((prediction: any) => {
        // Use the EXACT ID from the transformed prediction
        const marketId = prediction.id;
        
        if (!marketId) {
          return null;
        }
        
        // Extract end date and status from raw market data
        const rawMarket = prediction.raw || {};
        const endDate = rawMarket.end_date_iso || rawMarket.endDate || rawMarket.endDateIso || prediction.endDate;
        const closed = rawMarket.closed || prediction.closed || false;
        const archived = rawMarket.archived || prediction.archived || false;
        const active = rawMarket.active !== false && prediction.active !== false;
        
        // Extract data from transformed prediction
        const question = prediction.question || '';
        const volume = prediction.volume || prediction.volume24h || 0;
        const liquidity = prediction.liquidity || 0;
        const probability = prediction.probability || 50;
        
        // Map category from prediction
        const categoryValue = prediction.category || 'Other';
        
        return {
          id: String(marketId), // Use EXACT prediction ID
          question,
          category: mapCategory(categoryValue),
          volumeUsd: volume,
          liquidityUsd: liquidity,
          currentProbability: probability / 100, // Convert from 0-100 to 0-1
          priceChange24h: 0,
          endDate: endDate || undefined,
          closed: closed || false,
          archived: archived || false,
          active: active !== false,
          raw: prediction, // Store full prediction for reference
        };
      }).filter((m: Market | null): m is Market => {
        return m !== null && Boolean(m.id) && Boolean(m.question) && !isNaN(m.volumeUsd) && !isNaN(m.currentProbability);
      });
      
      console.log(`[Polymarket] ✅ Mapped to ${markets.length} valid markets with matching IDs`);
      
      // Update cache (separate cache from bubble maps to avoid conflicts)
      marketCache = {
        markets,
        cachedAt: Date.now(),
      };
      
      return markets;
    }
    
    // Client-side fallback (shouldn't happen for trading engine)
    // Use environment variables for URL and key
    const apiUrl = process.env.POLYMARKET_API_URL || 'https://gamma-api.polymarket.com/markets';
    const apiKey = process.env.POLYMARKET_API_KEY;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    const rawMarkets = Array.isArray(data) ? data : (data.markets || data.results || []);
    
    const markets = rawMarkets.map(mapPolymarketMarket).filter((m: Market) => {
      return m.id && m.question && !isNaN(m.volumeUsd) && !isNaN(m.currentProbability);
    });
    
    // Update cache
    marketCache = {
      markets,
      cachedAt: Date.now(),
    };
    
    return markets;
  } catch (error) {
    console.error('[Polymarket] Failed to fetch markets:', error);
    
    // Return cached data if available, even if expired
    if (marketCache) {
      console.warn('[Polymarket] Returning stale cache due to API error');
      return marketCache.markets;
    }
    
    // No cache available - return empty array
    return [];
  }
}

/**
 * Clear the market cache (useful for testing)
 */
export function clearMarketCache(): void {
  marketCache = null;
}






