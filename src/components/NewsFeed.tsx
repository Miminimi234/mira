import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { ExternalLink, Newspaper } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  category: string;
  url?: string;
  imageUrl?: string;
  description?: string;
  publishedAt?: string;
}

interface NewsAPIArticle {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
}

// Format relative time
const formatTime = (publishedAt: string): string => {
  const published = new Date(publishedAt);
  const now = new Date();
  const diffMs = now.getTime() - published.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return published.toLocaleDateString();
};

const NEWS_CATEGORIES = [
  'All',
  'Politics',
  'Crypto',
  'Markets',
  'Economics',
  'Technology',
  'Sports',
  'Climate',
  'News'
] as const;

type NewsCategory = typeof NEWS_CATEGORIES[number];

export const NewsFeed = () => {
  const [allNews, setAllNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedCategory, setSelectedCategory] = useState<NewsCategory>('All');
  const [timeKey, setTimeKey] = useState(0); // Force recalculation of timestamps

  // Process news data (used by both WebSocket and fallback polling)
  const processNewsData = (data: NewsAPIResponse) => {
    if (data.status === 'ok' && data.articles) {
      // Transform articles to NewsItem format
      const transformedArticles: NewsItem[] = data.articles
        .filter(article => article.title && article.title !== '[Removed]')
        .slice(0, 100)
        .map((article, index) => {
          const content = `${article.title} ${article.description || ''}`.toLowerCase();
          let category = 'News';

          const cryptoKeywords = ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'btc', 'eth', 'xrp', 'solana', 'defi', 'nft', 'altcoin', 'zcash', 'cryptocurrency'];
          if (cryptoKeywords.some(keyword => content.includes(keyword))) {
            category = 'Crypto';
          } else if (content.includes('election') || content.includes('politic') || content.includes('president')) {
            category = 'Politics';
          } else if (content.includes('stock') || content.includes('market') || content.includes('dow') || content.includes('s&p')) {
            category = 'Markets';
          } else if (content.includes('economy') || content.includes('fed') || content.includes('inflation')) {
            category = 'Economics';
          } else if (content.includes('ai') || content.includes('technology') || content.includes('tech')) {
            category = 'Technology';
          } else if (content.includes('sport') || content.includes('game')) {
            category = 'Sports';
          } else if (content.includes('climate') || content.includes('weather')) {
            category = 'Climate';
          }

          return {
            id: article.url || `news-${index}`,
            title: article.title,
            source: article.source?.name || 'Unknown',
            time: '',
            category,
            url: article.url,
            imageUrl: article.urlToImage || undefined,
            description: article.description || undefined,
            publishedAt: article.publishedAt,
          };
        });

      transformedArticles.sort((a, b) => {
        const timeA = new Date(a.publishedAt || 0).getTime();
        const timeB = new Date(b.publishedAt || 0).getTime();
        return timeB - timeA;
      });

      setAllNews(transformedArticles);
      setLastUpdate(new Date());
    }
  };

  // Fetch news from server proxy (fallback)
  const fetchNews = async () => {
    try {
      setLoading(true);
      const { API_BASE_URL } = await import('@/lib/apiConfig');
      const apiUrl = `${API_BASE_URL}/api/news?source=all`;
      console.log('[NewsFeed] fetching news from', apiUrl);
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const data: NewsAPIResponse = await response.json();
      console.log('[NewsFeed] received news payload', { total: (data && (data as any).totalResults), status: data?.status });
      // Log entire payload in debug builds (trimmed in production)
      if (!data || !data.articles) console.warn('[NewsFeed] unexpected news payload shape', data);
      processNewsData(data);
    } catch (error) {
      console.error('Error fetching news:', error);
      if (allNews.length === 0) {
        console.warn('No news available - check if news API keys are configured on the server');
      }
    } finally {
      setLoading(false);
    }
  };

  // Filter news by selected category and calculate timestamps dynamically
  const news = useMemo(() => {
    let filtered = selectedCategory === 'All'
      ? allNews
      : allNews.filter(item => item.category === selectedCategory);

    // Recalculate timestamps dynamically
    return filtered.map(item => ({
      ...item,
      time: item.publishedAt ? formatTime(item.publishedAt) : 'Unknown',
    }));
  }, [allNews, selectedCategory, timeKey]); // Include timeKey to force recalculation

  // Fetch news via WebSocket - real-time updates
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let fallbackInterval: NodeJS.Timeout | null = null;

    const setupWebSocket = async () => {
      try {
        const { subscribe } = await import('@/lib/websocket');

        unsubscribe = await subscribe('news', (data: NewsAPIResponse) => {
          processNewsData(data);
          setLoading(false);
        });

        console.log('[NewsFeed] ✅ WebSocket connected for news');
      } catch (error) {
        console.warn('[NewsFeed] ⚠️  WebSocket failed, falling back to polling:', error);

        // Fallback to polling via server endpoint
        const { API_BASE_URL } = await import('@/lib/apiConfig');
        console.log('[NewsFeed] falling back to polling', `${API_BASE_URL}/api/news?source=all`);
        // Fallback to polling
        fetchNews();
        fallbackInterval = setInterval(fetchNews, 2.5 * 60 * 1000);
      }
    };

    // Always fetch once on mount to populate UI, then try to subscribe for live updates.
    fetchNews();
    setupWebSocket();

    return () => {
      if (unsubscribe) unsubscribe();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, []);

  // Update timestamps every minute to keep them current
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeKey(prev => prev + 1);
    }, 60 * 1000); // Every minute

    return () => clearInterval(interval);
  }, []);
  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-bg-elevated flex-shrink-0">
        <div className="h-10 px-4 flex items-center justify-between">
          <span className="text-xs text-terminal-accent font-mono leading-none flex items-center gap-2">
            <Newspaper className="w-3 h-3" />
            &gt; NEWS FEED
          </span>
          <div className="flex items-center gap-2">
            <motion.div
              className="w-2 h-2 rounded-full bg-trade-yes"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [1, 0.7, 1],
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-[10px] text-muted-foreground font-mono">LIVE</span>
          </div>
        </div>
        {/* Category Selector Dropdown */}
        <div className="px-4 pb-2 relative z-10" style={{ pointerEvents: 'auto' }}>
          <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as NewsCategory)}>
            <SelectTrigger
              className="h-7 text-[10px] font-mono border-border bg-muted/50 hover:bg-muted"
              style={{ pointerEvents: 'auto', zIndex: 10 }}
            >
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent
              className="z-[9999]"
              style={{ pointerEvents: 'auto', zIndex: 9999 }}
            >
              {NEWS_CATEGORIES.map((category) => (
                <SelectItem
                  key={category}
                  value={category}
                  className="text-[10px] font-mono"
                  style={{ pointerEvents: 'auto' }}
                >
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* News Feed */}
      <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {loading && news.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-terminal-accent border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <span className="text-xs text-muted-foreground font-mono">Loading news...</span>
            </div>
          </div>
        ) : news.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Newspaper className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <span className="text-xs text-muted-foreground font-mono block mb-1">No news available</span>
              <span className="text-[10px] text-muted-foreground font-mono opacity-70">
                Check if news API keys are configured
              </span>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {news.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-bg-elevated border border-border rounded-lg p-3 hover:border-terminal-accent/50 transition-colors cursor-pointer group"
                onClick={() => {
                  if (item.url) {
                    window.open(item.url, '_blank', 'noopener,noreferrer');
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Image */}
                  {item.imageUrl && (
                    <div className="flex-shrink-0 w-20 h-20 rounded overflow-visible border border-border group/image relative z-10">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover rounded transition-all duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      {/* Large preview on hover */}
                      <div className="absolute top-0 left-full ml-3 w-80 h-56 rounded-lg overflow-hidden border-2 border-terminal-accent shadow-2xl bg-background opacity-0 invisible group-hover/image:opacity-100 group-hover/image:visible transition-all duration-300 z-50 pointer-events-none">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] text-terminal-accent font-mono uppercase tracking-wider px-2 py-0.5 bg-terminal-accent/10 rounded">
                        {item.category}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {item.time}
                      </span>
                    </div>
                    <h3 className="text-xs font-medium text-foreground leading-snug group-hover:text-terminal-accent transition-colors mb-1">
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2 mb-1.5">
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-muted-foreground font-mono">
                        {item.source}
                      </span>
                      {item.url && (
                        <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

