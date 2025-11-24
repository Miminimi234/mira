// CSRF token management utility
// Fetches and manages CSRF tokens for API requests

let csrfToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

/**
 * Fetch CSRF token from server
 * Caches the token to avoid unnecessary requests
 */
export async function getCsrfToken(): Promise<string> {
  // Return cached token if available
  if (csrfToken) {
    return csrfToken;
  }

  // If a request is already in progress, wait for it
  if (tokenPromise) {
    return tokenPromise;
  }

  // Fetch new token
  tokenPromise = (async () => {
    try {
      const { API_BASE_URL } = await import('./apiConfig');
      const response = await fetch(`${API_BASE_URL}/api/csrf-token`, {
        method: 'GET',
        credentials: 'include', // Include cookies
      });

      if (!response.ok) {
        throw new Error('Failed to fetch CSRF token');
      }

      const data = await response.json();
      csrfToken = data.csrfToken;
      return csrfToken;
    } catch (error) {
      console.error('Error fetching CSRF token:', error);
      // Clear promise so we can retry
      tokenPromise = null;
      throw error;
    }
  })();

  return tokenPromise;
}

/**
 * Clear cached CSRF token (useful after errors)
 */
export function clearCsrfToken(): void {
  csrfToken = null;
  tokenPromise = null;
}

/**
 * Get CSRF token from cookie (if available)
 * This is a fallback if the token wasn't fetched via API
 */
export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'XSRF-TOKEN') {
      return decodeURIComponent(value);
    }
  }
  return null;
}

