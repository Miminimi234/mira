// Service Worker for caching predictions API
const CACHE_NAME = 'mira-predictions-v1';
const PREDICTIONS_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Install event - cache initial resources
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim(); // Take control immediately
});

// Fetch event - intercept network requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only cache predictions API
  if (url.pathname === '/api/predictions' || url.pathname.endsWith('/api/predictions')) {
    event.respondWith(handlePredictionsRequest(event.request));
  }
});

async function handlePredictionsRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Check if we have a valid cached response
  if (cachedResponse) {
    const cachedData = await cachedResponse.clone().json();
    const cacheTime = cachedData._cacheTime || 0;
    const age = Date.now() - cacheTime;
    
    // If cache is still fresh (less than 2 minutes), return it immediately
    if (age < PREDICTIONS_CACHE_DURATION) {
      // Return cached response immediately
      return cachedResponse;
    }
  }
  
  // Fetch fresh data from network
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Clone the response to cache it
      const responseClone = networkResponse.clone();
      const data = await responseClone.json();
      
      // Add cache timestamp
      data._cacheTime = Date.now();
      
      // Store in cache with timestamp
      const newResponse = new Response(JSON.stringify(data), {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers: networkResponse.headers,
      });
      
      await cache.put(request, newResponse.clone());
      
      return networkResponse;
    }
    
    // If network fails and we have stale cache, return it
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return networkResponse;
  } catch (error) {
    // Network error - return cached response if available
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // No cache available - return error response
    return new Response(JSON.stringify({ error: 'Network error', predictions: [] }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

