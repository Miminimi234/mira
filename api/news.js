// API endpoint for /api/news
// SECURITY: All API keys must be in environment variables - never hardcode
import * as firebaseClient from '../server/firebaseClient.js';

// SECURITY: Get API keys from environment variables only
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_URL = 'https://newsapi.org/v2/everything';
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;
const NEWSDATA_API_URL = 'https://newsdata.io/api/1/news';
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const GNEWS_API_URL = 'https://gnews.io/api/v4/search';

let newsCache = {
  data: null,
  timestamp: null,
  CACHE_DURATION: 5 * 60 * 1000,
};

const normalizeTitle = (title) => {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const deduplicateArticles = (articles) => {
  const seen = new Map();
  const uniqueArticles = [];

  for (const article of articles) {
    const normalizedTitle = normalizeTitle(article.title || '');
    const url = article.url || '';

    let isDuplicate = false;
    for (const [key, existing] of seen.entries()) {
      const existingTitle = normalizeTitle(existing.title || '');

      if (url && existing.url && url === existing.url) {
        isDuplicate = true;
        break;
      }

      if (normalizedTitle && existingTitle && normalizedTitle === existingTitle) {
        isDuplicate = true;
        break;
      }

      if (normalizedTitle.length > 20 && existingTitle.length > 20) {
        if (normalizedTitle.includes(existingTitle) || existingTitle.includes(normalizedTitle)) {
          if (Math.abs(normalizedTitle.length - existingTitle.length) < 10) {
            isDuplicate = true;
            break;
          }
        }
      }
    }

    if (!isDuplicate) {
      const key = normalizedTitle || url || `article-${uniqueArticles.length}`;
      seen.set(key, article);
      uniqueArticles.push(article);
    }
  }

  return uniqueArticles;
};

const fetchNewsAPI = async () => {
  // SECURITY: Check if API key is configured
  if (!NEWS_API_KEY) {
    console.warn('NEWS_API_KEY not configured, skipping NewsAPI');
    return [];
  }

  const fromDate = new Date();
  fromDate.setHours(fromDate.getHours() - 24);
  const fromDateStr = fromDate.toISOString();
  const toDateStr = new Date().toISOString();

  const queries = [
    'prediction OR election',
    'cryptocurrency',
    'bitcoin',
    'ethereum',
    'blockchain',
    'stock market OR economy',
    'technology OR AI',
    'sports OR climate'
  ];

  const fetchPromises = queries.map(async (query) => {
    try {
      const url = `${NEWS_API_URL}?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=20&from=${fromDateStr}&to=${toDateStr}&apiKey=${NEWS_API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) return [];

      const data = await response.json();

      if (data.status === 'ok' && data.articles) {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        return data.articles
          .filter(article => {
            if (!article.publishedAt) return false;
            const publishedDate = new Date(article.publishedAt);
            return publishedDate >= twentyFourHoursAgo;
          })
          .map(article => ({
            ...article,
            sourceApi: 'newsapi',
          }));
      }

      return [];
    } catch (error) {
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  const allArticles = results.flat();

  const uniqueArticles = [];
  const seenUrls = new Set();

  for (const article of allArticles) {
    if (article.url && !seenUrls.has(article.url)) {
      seenUrls.add(article.url);
      uniqueArticles.push(article);
    }
  }

  return uniqueArticles;
};

const fetchNewsData = async () => {
  // SECURITY: Check if API key is configured
  if (!NEWSDATA_API_KEY) {
    console.warn('NEWSDATA_API_KEY not configured, skipping NewsData.io');
    return [];
  }

  const fromDate = new Date();
  fromDate.setHours(fromDate.getHours() - 24);
  const fromDateStr = fromDate.toISOString().split('T')[0];

  const queries = [
    'prediction',
    'election',
    'cryptocurrency',
    'bitcoin',
    'ethereum',
    'blockchain',
    'stock market',
    'economy',
    'technology',
    'sports',
    'climate'
  ];

  const fetchPromises = queries.map(async (query) => {
    try {
      const url = `${NEWSDATA_API_URL}?apikey=${NEWSDATA_API_KEY}&q=${encodeURIComponent(query)}&language=en&size=10&time_from=${fromDateStr}`;
      const response = await fetch(url);

      if (!response.ok) return [];

      const data = await response.json();

      if (data.status === 'success' && data.results) {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        return data.results.filter(article => {
          if (!article.pubDate) return false;
          const publishedDate = new Date(article.pubDate);
          return publishedDate >= twentyFourHoursAgo;
        });
      }

      return [];
    } catch (error) {
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  const allArticles = results.flat();

  const uniqueArticles = [];
  const seenLinks = new Set();

  for (const article of allArticles) {
    const link = article.link || article.guid;
    if (link && !seenLinks.has(link)) {
      seenLinks.add(link);
      uniqueArticles.push(article);
    }
  }

  return uniqueArticles.map(article => ({
    source: {
      id: article.source_id || null,
      name: article.source_name || 'Unknown',
    },
    author: article.creator?.[0] || null,
    title: article.title || '',
    description: article.description || null,
    url: article.link || article.guid || '',
    urlToImage: article.image_url || null,
    publishedAt: article.pubDate || new Date().toISOString(),
    content: article.content || null,
    sourceApi: 'newsdata',
  }));
};

const fetchGNews = async () => {
  // SECURITY: Check if API key is configured
  if (!GNEWS_API_KEY) {
    console.warn('GNEWS_API_KEY not configured, skipping GNews');
    return [];
  }

  const fromDate = new Date();
  fromDate.setHours(fromDate.getHours() - 24);
  const fromDateStr = fromDate.toISOString().split('T')[0];

  const queries = [
    'prediction OR election',
    'cryptocurrency OR bitcoin OR ethereum OR crypto OR blockchain OR stock market',
    'technology OR economy',
    'sports OR climate'
  ];

  const allArticles = [];

  for (const query of queries) {
    try {
      if (allArticles.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const url = `${GNEWS_API_URL}?q=${encodeURIComponent(query)}&lang=en&max=20&from=${fromDateStr}&apikey=${GNEWS_API_KEY}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429) {
          break;
        }
        continue;
      }

      const data = await response.json();

      if (data.articles && Array.isArray(data.articles)) {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const filteredArticles = data.articles.filter(article => {
          if (!article.publishedAt && !article.pubDate) return false;
          const publishedDate = new Date(article.publishedAt || article.pubDate);
          return publishedDate >= twentyFourHoursAgo;
        });

        allArticles.push(...filteredArticles);
      }
    } catch (error) {
      // Continue to next query
    }
  }

  const uniqueArticles = [];
  const seenUrls = new Set();

  for (const article of allArticles) {
    const url = article.url || article.link;
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      uniqueArticles.push(article);
    }
  }

  return uniqueArticles.map(article => ({
    source: {
      id: article.source?.id || null,
      name: article.source?.name || 'Unknown',
    },
    author: article.author || null,
    title: article.title || '',
    description: article.description || null,
    url: article.url || article.link || '',
    urlToImage: article.image || null,
    publishedAt: article.publishedAt || article.pubDate || new Date().toISOString(),
    content: article.content || null,
    sourceApi: 'gnews',
  }));
};

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

  const { source = 'all' } = req.query;

  try {
    // Use Firebase as primary cache for news (no in-memory/Redis fallback)
    const cacheKey = source === 'all' ? 'news:all' : `news:source:${source}`;
    try {
      if (firebaseClient && firebaseClient.isEnabled && firebaseClient.isEnabled()) {
        const cached = await firebaseClient.getCache(cacheKey);
        if (cached) {
          if (source === 'all') return res.json(cached);
          const filtered = { ...cached, articles: cached.articles.filter(a => a.sourceApi === source) };
          return res.json(filtered);
        }
      } else {
        console.error('[NEWS] ❌ Firebase not enabled - news cache unavailable');
      }
    } catch (fbErr) {
      console.warn('[NEWS] ⚠️  Firebase cache check failed:', fbErr.message);
    }

    const fetchPromises = [];

    if (source === 'all' || source === 'newsapi') {
      fetchPromises.push(fetchNewsAPI().catch(() => []));
    }

    if (source === 'all' || source === 'newsdata') {
      fetchPromises.push(fetchNewsData().catch(() => []));
    }

    if (source === 'all' || source === 'gnews') {
      fetchPromises.push(fetchGNews().catch(() => []));
    }

    const results = await Promise.all(fetchPromises);
    let allArticles = results.flat();

    allArticles = deduplicateArticles(allArticles);

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    allArticles = allArticles.filter(article => {
      if (!article.publishedAt) return false;
      const publishedDate = new Date(article.publishedAt);
      return publishedDate >= twentyFourHoursAgo;
    });

    allArticles.sort((a, b) => {
      const dateA = new Date(a.publishedAt || 0).getTime();
      const dateB = new Date(b.publishedAt || 0).getTime();
      return dateB - dateA;
    });

    allArticles = allArticles.slice(0, 100);

    const responseData = {
      status: 'ok',
      totalResults: allArticles.length,
      articles: allArticles,
      sources: {
        newsapi: allArticles.filter(a => a.sourceApi === 'newsapi').length,
        newsdata: allArticles.filter(a => a.sourceApi === 'newsdata').length,
        gnews: allArticles.filter(a => a.sourceApi === 'gnews').length,
      },
    };

    // Persist news to Firebase for 2 minutes
    try {
      if (firebaseClient && firebaseClient.isEnabled && firebaseClient.isEnabled()) {
        await firebaseClient.setCache('news:all', responseData, 2 * 60);
      }
    } catch (fbErr) {
      console.warn('[NEWS] ⚠️  Failed to cache news in Firebase:', fbErr.message);
    }

    if (source === 'all') {
      return res.json(responseData);
    } else {
      const filtered = {
        ...responseData,
        articles: responseData.articles.filter(a => a.sourceApi === source),
      };
      return res.json(filtered);
    }
  } catch (error) {
    console.error('Error in news endpoint:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message,
      articles: [],
    });
  }
}

