/**
 * Unified news aggregator
 *
 * Fetches news from multiple sources (NewsAPI, NewsData.io, GNews, World News API, Mediastack)
 * with deduplication and caching. All agents share a single news pool to minimize API costs.
 */
/**
 * News cache configuration
 */
const NEWS_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
let newsCache = null;
/**
 * Get configured news providers from environment variables
 */
function getNewsProviders() {
    const providers = [];
    // NewsAPI.org
    if (process.env.NEWS_API_KEY) {
        providers.push({
            name: 'NewsAPI',
            url: 'https://newsapi.org/v2/everything',
            apiKey: process.env.NEWS_API_KEY,
            enabled: true,
        });
    }
    // NewsData.io
    if (process.env.NEWSDATA_API_KEY) {
        providers.push({
            name: 'NewsData.io',
            url: 'https://newsdata.io/api/1/news',
            apiKey: process.env.NEWSDATA_API_KEY,
            enabled: true,
        });
    }
    // GNews
    if (process.env.GNEWS_API_KEY) {
        providers.push({
            name: 'GNews',
            url: 'https://gnews.io/api/v4/search',
            apiKey: process.env.GNEWS_API_KEY,
            enabled: true,
        });
    }
    // World News API
    if (process.env.WORLD_NEWS_API_KEY) {
        providers.push({
            name: 'World News API',
            url: 'https://api.worldnewsapi.com/search-news',
            apiKey: process.env.WORLD_NEWS_API_KEY,
            enabled: true,
        });
    }
    // Mediastack
    if (process.env.MEDIASTACK_API_KEY) {
        providers.push({
            name: 'Mediastack',
            url: 'https://api.mediastack.com/v1/news',
            apiKey: process.env.MEDIASTACK_API_KEY,
            enabled: true,
        });
    }
    return providers;
}
/**
 * Fetch news from a single provider
 *
 * @param provider - News provider configuration
 * @returns Array of news articles or empty array on error
 */
async function fetchFromProvider(provider) {
    if (!provider.enabled || !provider.apiKey) {
        return [];
    }
    try {
        // Build query URL - each provider has different query params
        const url = new URL(provider.url);
        // Common query parameters (adapt per provider)
        if (provider.name === 'NewsAPI') {
            url.searchParams.set('q', 'prediction OR election OR cryptocurrency OR bitcoin OR ethereum OR stock market OR economy OR technology OR AI OR sports OR climate');
            url.searchParams.set('language', 'en');
            url.searchParams.set('sortBy', 'publishedAt');
            url.searchParams.set('pageSize', '20');
            url.searchParams.set('apiKey', provider.apiKey);
        }
        else if (provider.name === 'NewsData.io') {
            url.searchParams.set('apikey', provider.apiKey);
            url.searchParams.set('q', 'prediction OR election OR cryptocurrency');
            url.searchParams.set('language', 'en');
            url.searchParams.set('size', '10');
        }
        else if (provider.name === 'GNews') {
            url.searchParams.set('q', 'prediction OR election OR cryptocurrency');
            url.searchParams.set('lang', 'en');
            url.searchParams.set('max', '10');
            url.searchParams.set('apikey', provider.apiKey);
        }
        else if (provider.name === 'World News API') {
            url.searchParams.set('api-key', provider.apiKey);
            url.searchParams.set('text', 'prediction OR election OR cryptocurrency');
            url.searchParams.set('language', 'en');
            url.searchParams.set('number', '10');
        }
        else if (provider.name === 'Mediastack') {
            url.searchParams.set('access_key', provider.apiKey);
            url.searchParams.set('keywords', 'prediction,election,cryptocurrency');
            url.searchParams.set('languages', 'en');
            url.searchParams.set('limit', '10');
        }
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(10000), // 10 second timeout
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        // Map provider response to NewsArticle format
        // TODO: Adapt to actual provider response structures
        let articles = [];
        if (provider.name === 'NewsAPI' && data.articles) {
            articles = data.articles;
        }
        else if (provider.name === 'NewsData.io' && data.results) {
            articles = data.results;
        }
        else if (provider.name === 'GNews' && data.articles) {
            articles = data.articles;
        }
        else if (provider.name === 'World News API' && data.news) {
            articles = data.news;
        }
        else if (provider.name === 'Mediastack' && data.data) {
            articles = data.data;
        }
        return articles.map((article, index) => ({
            id: `${provider.name}:${article.url || article.link || article.guid || index}`,
            title: article.title || '',
            description: article.description || article.content?.substring(0, 200),
            content: article.content || article.description,
            source: article.source?.name || article.source_name || provider.name,
            publishedAt: article.publishedAt || article.pubDate || article.published_at || new Date().toISOString(),
            url: article.url || article.link || article.guid || '',
            sourceApi: provider.name, // Track which API provided this article
        }));
    }
    catch (error) {
        console.error(`[News] Failed to fetch from ${provider.name}:`, error);
        return [];
    }
}
/**
 * Deduplicate articles by title
 *
 * @param articles - Array of articles
 * @returns Deduplicated array
 */
function deduplicateArticles(articles) {
    const seen = new Set();
    const unique = [];
    for (const article of articles) {
        const normalizedTitle = article.title.toLowerCase().trim();
        if (!seen.has(normalizedTitle) && article.title) {
            seen.add(normalizedTitle);
            unique.push(article);
        }
    }
    return unique;
}
/**
 * Fetch latest news from all enabled providers
 *
 * Uses cache if data is less than 5 minutes old.
 * Fetches from all providers in parallel using Promise.allSettled.
 *
 * @returns Array of deduplicated news articles
 *
 * @throws Never throws - always returns array (empty on error)
 */
export async function fetchLatestNews() {
    // Check cache first
    if (newsCache) {
        const age = Date.now() - newsCache.cachedAt;
        if (age < NEWS_REFRESH_MS) {
            console.log(`[News] 💾 Cache hit: ${newsCache.articles.length} articles (age: ${Math.round(age / 1000)}s)`);
            return newsCache.articles;
        }
        console.log(`[News] ⏰ Cache expired (age: ${Math.round(age / 1000)}s), fetching new news...`);
    }
    else {
        console.log(`[News] 📰 No cache - fetching news...`);
    }
    const providers = getNewsProviders();
    console.log(`[News] 📡 Found ${providers.length} news providers: ${providers.map(p => p.name).join(', ')}`);
    if (providers.length === 0) {
        console.warn('[News] ⚠️ No news providers configured - check environment variables:');
        console.warn('[News]    NEWS_API_KEY, NEWSDATA_API_KEY, GNEWS_API_KEY, WORLD_NEWS_API_KEY, MEDIASTACK_API_KEY');
        // Don't cache empty array if no providers - return empty but don't cache
        return newsCache?.articles || [];
    }
    // Fetch from all providers in parallel
    console.log(`[News] 🔄 Fetching from ${providers.length} providers in parallel...`);
    const results = await Promise.allSettled(providers.map(provider => fetchFromProvider(provider)));
    // Collect all articles
    const allArticles = [];
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
            allArticles.push(...result.value);
        }
        else {
            console.error(`[News] Provider ${providers[i].name} failed:`, result.reason);
        }
    }
    // Deduplicate and update cache
    const uniqueArticles = deduplicateArticles(allArticles);
    console.log(`[News] ✅ Fetched ${allArticles.length} articles, ${uniqueArticles.length} unique after deduplication`);
    // Only cache if we got articles (don't cache empty array from failed fetches)
    if (uniqueArticles.length > 0) {
        newsCache = {
            articles: uniqueArticles,
            cachedAt: Date.now(),
        };
        console.log(`[News] 💾 Cached ${uniqueArticles.length} articles`);
    }
    else {
        console.warn(`[News] ⚠️ No articles fetched - not caching empty result. Will retry on next call.`);
        // Return stale cache if available, otherwise empty
        return newsCache?.articles || [];
    }
    return uniqueArticles;
}
/**
 * Clear the news cache (useful for testing)
 */
export function clearNewsCache() {
    newsCache = null;
}
