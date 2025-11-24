import { PredictionNodeData } from "@/components/PredictionTypes";

/**
 * Get watchlist storage key for a specific user
 */
function getWatchlistKey(userEmail?: string): string {
  if (!userEmail) {
    // Fallback to global key if no email (shouldn't happen when logged in)
    return 'mira_watchlist';
  }
  return `mira_watchlist_${userEmail}`;
}

/**
 * Get watchlist from localStorage for a specific user
 */
export function getWatchlist(userEmail?: string): PredictionNodeData[] {
  try {
    const key = getWatchlistKey(userEmail);
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error loading watchlist:', error);
    return [];
  }
}

/**
 * Save watchlist to localStorage for a specific user
 */
export function saveWatchlist(watchlist: PredictionNodeData[], userEmail?: string): void {
  try {
    const key = getWatchlistKey(userEmail);
    localStorage.setItem(key, JSON.stringify(watchlist));
  } catch (error) {
    console.error('Error saving watchlist:', error);
  }
}

/**
 * Add market to watchlist for a specific user
 */
export function addToWatchlist(market: PredictionNodeData, userEmail?: string): void {
  const watchlist = getWatchlist(userEmail);
  // Check if already in watchlist
  if (watchlist.some(m => m.id === market.id)) {
    return; // Already in watchlist
  }
  watchlist.push(market);
  saveWatchlist(watchlist, userEmail);
}

/**
 * Remove market from watchlist for a specific user
 */
export function removeFromWatchlist(marketId: string, userEmail?: string): void {
  const watchlist = getWatchlist(userEmail);
  const filtered = watchlist.filter(m => m.id !== marketId);
  saveWatchlist(filtered, userEmail);
}

/**
 * Check if market is in watchlist for a specific user
 */
export function isInWatchlist(marketId: string, userEmail?: string): boolean {
  const watchlist = getWatchlist(userEmail);
  return watchlist.some(m => m.id === marketId);
}

/**
 * Clear entire watchlist for a specific user
 */
export function clearWatchlist(userEmail?: string): void {
  const key = getWatchlistKey(userEmail);
  localStorage.removeItem(key);
}

