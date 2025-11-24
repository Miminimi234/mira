// API endpoint for /api/predictions
import * as firebaseClient from '../server/firebaseClient.js';
import { transformMarkets } from '../server/services/marketTransformer.js';
import { fetchAllMarkets } from '../server/services/polymarketService.js';
import { mapCategoryToPolymarket } from '../server/utils/categoryMapper.js';

// No in-memory or Redis fallback: predictions are cached only in Firebase when available.

export default async function handler(req, res) {
  // SECURITY: CORS - restrict to specific origins instead of wildcard
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:3000', 'https://miramaps.io'];

  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // SECURITY: Input validation and limits
    let { category = 'All Markets', limit = 5000, search = null } = req.query;

    // Validate and sanitize inputs
    const MAX_LIMIT = 10000;
    const MAX_SEARCH_LENGTH = 200;
    const MAX_CATEGORY_LENGTH = 50;

    // Enforce maximum limit to prevent DoS
    limit = Math.min(Math.max(parseInt(limit) || 5000, 1), MAX_LIMIT);

    // Validate category
    if (typeof category !== 'string' || category.length > MAX_CATEGORY_LENGTH) {
      return res.status(400).json({ error: 'Invalid category parameter' });
    }

    // Validate and sanitize search query
    if (search) {
      if (typeof search !== 'string' || search.length > MAX_SEARCH_LENGTH) {
        return res.status(400).json({ error: 'Invalid search parameter' });
      }
      search = search.trim().substring(0, MAX_SEARCH_LENGTH);
    }

    // Check cache first (but don't cache search results - they should be fresh)
    const isSearching = search && search.trim();
    if (!isSearching) {
      try {
        if (firebaseClient && firebaseClient.isEnabled && firebaseClient.isEnabled()) {
          const cacheKey = `predictions:${category}:${limit}`;
          const fbCached = await firebaseClient.getCachedPrediction(cacheKey);
          if (fbCached) {
            console.log(`[CACHE HIT] Returning cached predictions from Firebase for category: ${category}`);
            try {
              // Ensure per-market "predicted" flags are up-to-date by checking persistence markers
              if (firebaseClient && firebaseClient.isEnabled && firebaseClient.isEnabled() && fbCached.predictions && Array.isArray(fbCached.predictions)) {
                await Promise.all(fbCached.predictions.map(async (p) => {
                  try {
                    const mk = await firebaseClient.getCache(`marketTrade:${p.id}`);
                    p.predicted = !!(mk && mk.data && (mk.data.status === 'OPEN' || mk.data.status === 'PENDING' || mk.data.status === 'CLOSED'));
                  } catch (e) {
                    p.predicted = false;
                  }
                }));
              }
            } catch (e) {
              console.warn('[CACHE] Failed to refresh predicted flags on cached predictions:', e && e.message);
            }
            return res.json(fbCached);
          }
        } else {
          console.error('[CACHE] ❌ Firebase not enabled - predictions cache unavailable');
        }
      } catch (fbErr) {
        console.warn('[CACHE] Firebase check failed:', fbErr.message);
      }
    }

    console.log(`[CACHE MISS] Fetching fresh predictions for category: ${category}${isSearching ? ` (search: ${search})` : ''}`);

    // Map category to Polymarket category
    let polymarketCategory = null;
    if (category !== 'All Markets' && category !== 'Trending' && category !== 'Breaking' && category !== 'New') {
      polymarketCategory = mapCategoryToPolymarket(category);
    }

    // Fetch markets from Polymarket
    const maxMarkets = isSearching
      ? 10000
      : category === 'All Markets' ? 500 : 5000;

    let markets = await fetchAllMarkets({
      category: polymarketCategory,
      active: true,
      maxPages: Math.ceil(maxMarkets / 1000) + 1,
      limitPerPage: 1000,
      searchQuery: isSearching ? search.trim() : null,
    });

    // ALWAYS fetch all markets for Earnings, Geopolitics, and Elections
    if (category === 'Earnings' || category === 'Geopolitics' || category === 'Elections') {
      console.log(`Fetching ALL markets for ${category} category (will filter by detection)...`);
      const allMarkets = await fetchAllMarkets({
        category: null,
        active: true,
        maxPages: Math.ceil(3000 / 1000) + 1,
        limitPerPage: 1000,
        searchQuery: isSearching ? search.trim() : null,
      });
      markets = allMarkets;
      console.log(`Fetched ${markets.length} total markets for ${category} detection`);
    } else if (markets.length < 50 && polymarketCategory) {
      console.log(`Category search for ${category} returned only ${markets.length} markets. Trying without category filter...`);
      const allMarkets = await fetchAllMarkets({
        category: null,
        active: true,
        maxPages: Math.ceil(2000 / 1000) + 1,
        limitPerPage: 1000,
        searchQuery: isSearching ? search.trim() : null,
      });
      markets = allMarkets;
    }

    // Limit markets for "All Markets" category
    const limitedMarkets = (category === 'All Markets' && !isSearching)
      ? markets.slice(0, 500)
      : markets;

    // Transform markets to predictions
    const predictions = await transformMarkets(limitedMarkets);

    // Apply server-side search filtering if search query provided
    let searchFilteredPredictions = predictions;
    if (isSearching) {
      const searchLower = search.toLowerCase().trim();
      searchFilteredPredictions = predictions.filter(p => {
        const question = (p.question || '').toLowerCase();
        const category = (p.category || '').toLowerCase();
        const description = (p.description || '').toLowerCase();
        return question.includes(searchLower) ||
          category.includes(searchLower) ||
          description.includes(searchLower);
      });
      console.log(`Search "${search}" filtered ${predictions.length} predictions down to ${searchFilteredPredictions.length}`);
    }

    // Filter by category if needed
    let filteredPredictions = searchFilteredPredictions;
    if (category !== 'All Markets') {
      filteredPredictions = searchFilteredPredictions.filter(p => {
        if (category === 'Trending' || category === 'Breaking' || category === 'New') {
          return true;
        }
        const marketCategory = (p.category || 'World');
        if (marketCategory === category) {
          return true;
        }
        if (category === 'Elections' && marketCategory === 'Politics') {
          return true;
        }
        if (category === 'Geopolitics' && marketCategory === 'Politics') {
          return true;
        }
        if (category === 'Earnings' && marketCategory === 'Finance') {
          return true;
        }
        return false;
      });
      console.log(`Filtered ${filteredPredictions.length} predictions for category: ${category}`);
    }

    // Apply limit if specified
    if (limit && parseInt(limit) > 0) {
      filteredPredictions = filteredPredictions.slice(0, parseInt(limit));
    }

    // Enrich predictions with per-market 'predicted' flag from persistence (marketTrade:{marketId})
    try {
      if (firebaseClient && firebaseClient.isEnabled && firebaseClient.isEnabled() && Array.isArray(filteredPredictions)) {
        await Promise.all(filteredPredictions.map(async (p) => {
          try {
            const mk = await firebaseClient.getCache(`marketTrade:${p.id}`);
            p.predicted = !!(mk && mk.data && (mk.data.status === 'OPEN' || mk.data.status === 'PENDING' || mk.data.status === 'CLOSED'));
          } catch (e) {
            p.predicted = false;
          }
        }));
      }
    } catch (e) {
      console.warn('[PREDICTIONS] Failed to enrich predictions with persistence flags:', e && e.message);
    }

    // Cache the response AFTER filtering
    const responseData = {
      predictions: filteredPredictions,
      count: filteredPredictions.length,
      totalFetched: markets.length,
      totalTransformed: predictions.length,
    };

    if (!isSearching) {
      try {
        if (firebaseClient && firebaseClient.isEnabled && firebaseClient.isEnabled()) {
          const cacheKey = `predictions:${category}:${limit}`;
          await firebaseClient.setCachedPrediction(cacheKey, responseData, 5 * 60);
          console.log(`[CACHE] ✅ Cached predictions in Firebase: ${cacheKey}`);
        } else {
          console.error('[CACHE] ❌ Firebase not enabled - skipping predictions cache');
        }
      } catch (fbErr) {
        console.warn('[CACHE] Failed to persist predictions to Firebase:', fbErr.message);
      }
    }

    return res.json(responseData);
  } catch (error) {
    console.error('Error in predictions endpoint:', error);
    return res.status(500).json({
      error: error.message,
      predictions: [],
      count: 0,
    });
  }
}

