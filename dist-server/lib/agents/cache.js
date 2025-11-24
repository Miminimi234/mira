/**
 * Agent trade cache
 *
 * Caches generated trades for each agent to avoid redundant computation.
 * Cache invalidates if market IDs change (new markets appear).
 *
 * Uses Redis for persistence (survives server restarts) with in-memory fallback.
 */
/**
 * Cache TTL: 5 minutes (balance between freshness and performance)
 * Summary requests use cached data, individual agent requests can regenerate if needed
 * Increased from 2 minutes to reduce cache misses on concurrent requests
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
/**
 * In-memory cache: agentId -> cache entry (fallback if Redis unavailable)
 */
const agentCache = new Map();
/**
 * Redis client (lazy-loaded, optional)
 */
let redisClient = null;
/**
 * Initialize Redis client for cache persistence
 * Called from server/index.js after Redis is set up
 */
export function setRedisClient(client) {
    redisClient = client;
    console.log('[Cache] ✅ Redis client set for persistent cache');
}
/**
 * Get cache key for agent
 */
function getCacheKey(agentId) {
    return `agent:trades:${agentId}`;
}
/**
 * Load from Redis (if available)
 */
async function loadFromRedis(agentId) {
    if (!redisClient)
        return null;
    try {
        const key = getCacheKey(agentId);
        const data = await redisClient.get(key);
        if (!data)
            return null;
        const entry = JSON.parse(data);
        // Check TTL
        const age = Date.now() - entry.generatedAt;
        if (age >= CACHE_TTL_MS) {
            await redisClient.del(key); // Clean up expired
            return null;
        }
        // Also update in-memory cache
        agentCache.set(agentId, entry);
        return entry;
    }
    catch (error) {
        console.warn(`[Cache:${agentId}] ⚠️ Redis read failed, using in-memory:`, error.message);
        return null;
    }
}
/**
 * Save to Redis (if available)
 */
async function saveToRedis(agentId, entry) {
    if (!redisClient)
        return;
    try {
        const key = getCacheKey(agentId);
        // Store with TTL slightly longer than cache TTL for cleanup
        await redisClient.setEx(key, Math.ceil(CACHE_TTL_MS / 1000) + 60, JSON.stringify(entry));
    }
    catch (error) {
        console.warn(`[Cache:${agentId}] ⚠️ Redis write failed:`, error.message);
    }
}
/**
 * Get cached agent trades
 *
 * @param agentId - Agent identifier
 * @param currentMarketIds - Sorted array of current market IDs
 * @returns Cached trades or null if cache miss/invalid
 */
export async function getCachedAgentTrades(agentId, currentMarketIds) {
    // Try in-memory cache first (fastest)
    let entry = agentCache.get(agentId);
    // If not in memory, try Redis (for persistence across restarts)
    if (!entry && redisClient) {
        const redisEntry = await loadFromRedis(agentId);
        if (redisEntry !== null) {
            entry = redisEntry;
        }
    }
    if (!entry) {
        return null; // Cache miss
    }
    // Check TTL
    const age = Date.now() - entry.generatedAt;
    if (age >= CACHE_TTL_MS) {
        agentCache.delete(agentId);
        if (redisClient) {
            try {
                await redisClient.del(getCacheKey(agentId));
            }
            catch (e) {
                // Ignore Redis errors
            }
        }
        return null; // Cache expired
    }
    // Check if market IDs match (invalidate if markets changed)
    if (entry.marketIds.length !== currentMarketIds.length) {
        agentCache.delete(agentId);
        if (redisClient) {
            try {
                await redisClient.del(getCacheKey(agentId));
            }
            catch (e) {
                // Ignore Redis errors
            }
        }
        return null; // Markets changed
    }
    // Compare market IDs (both are sorted)
    for (let i = 0; i < entry.marketIds.length; i++) {
        if (entry.marketIds[i] !== currentMarketIds[i]) {
            agentCache.delete(agentId);
            if (redisClient) {
                try {
                    await redisClient.del(getCacheKey(agentId));
                }
                catch (e) {
                    // Ignore Redis errors
                }
            }
            return null; // Markets changed
        }
    }
    // Cache hit - return cached trades
    return entry.trades;
}
/**
 * Set cached agent trades
 *
 * @param agentId - Agent identifier
 * @param trades - Trades to cache
 * @param marketIds - Sorted array of market IDs used
 */
export async function setCachedAgentTrades(agentId, trades, marketIds) {
    const entry = {
        trades,
        generatedAt: Date.now(),
        marketIds: [...marketIds], // Copy array
    };
    // Save to in-memory cache (fast access)
    agentCache.set(agentId, entry);
    // Merge with persisted trades in Firebase to avoid overwriting existing data on restart
    try {
        const firebaseClient = await import('../../../server/firebaseClient.js');
        if (firebaseClient && firebaseClient.getCache && firebaseClient.setCache) {
            for (let i = 0; i < entry.trades.length; i++) {
                const t = entry.trades[i];
                try {
                    const marketIndexKey = `marketTrade:${t.marketId}`;
                    const existingIdx = await firebaseClient.getCache(marketIndexKey);
                    if (existingIdx && existingIdx.tradeId) {
                        const persisted = await firebaseClient.getCache(`trade:${existingIdx.tradeId}`);
                        if (persisted) {
                            entry.trades[i] = persisted;
                        }
                    }
                }
                catch (err) {
                    // ignore per-trade merge errors
                }
            }
            // Persist merged cache under agent key
            const ttlSec = Math.ceil(CACHE_TTL_MS / 1000) + 60;
            await firebaseClient.setCache(getCacheKey(agentId), entry, ttlSec);
        }
        else {
            // Fallback: save to Redis if available
            await saveToRedis(agentId, entry);
        }
    }
    catch (err) {
        // Best-effort: if persistence check fails, fall back to Redis
        console.warn(`[Cache:${agentId}] ⚠️ Persistence merge failed:`, err.message);
        await saveToRedis(agentId, entry);
    }
    console.log(`[Cache:${agentId}] 💾 Cached ${trades.length} trades for ${marketIds.length} markets (memory + persisted)`);
}
/**
 * Get cached trades without market ID validation (for summary/quick access)
 * This is faster as it doesn't require fetching markets first
 *
 * @param agentId - Agent identifier
 * @returns Cached trades or null if cache miss/expired
 */
export async function getCachedTradesQuick(agentId) {
    // Try in-memory cache first (fastest)
    let entry = agentCache.get(agentId);
    // If not in memory, try Redis (for persistence across restarts)
    if (!entry && redisClient) {
        const redisEntry = await loadFromRedis(agentId);
        if (redisEntry) {
            entry = redisEntry;
        }
    }
    if (!entry) {
        return null; // Cache miss
    }
    // Check TTL only (no market ID validation for speed)
    const age = Date.now() - entry.generatedAt;
    if (age >= CACHE_TTL_MS) {
        agentCache.delete(agentId);
        if (redisClient) {
            try {
                await redisClient.del(getCacheKey(agentId));
            }
            catch (e) {
                // Ignore Redis errors
            }
        }
        return null; // Cache expired
    }
    return entry.trades;
}
/**
 * Clear agent cache (useful for testing)
 */
export function clearAgentCache() {
    agentCache.clear();
}
