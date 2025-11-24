// API configuration - environment-aware base URL
// In production, uses relative URLs (same domain) or VITE_API_BASE_URL if set
// In development, uses localhost:3002

// Check if we're in production
const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';

// Get the API base URL
const getApiBaseUrl = (): string => {
  // If custom API URL is set via environment variable, use it
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // In production, use relative URLs (same domain)
  // This works if backend is deployed on the same domain
  if (isProduction) {
    return ''; // Empty string means relative URL
  }
  
  // In development, use localhost
  return 'http://localhost:3002';
};

export const API_BASE_URL = getApiBaseUrl();

// Solana RPC configuration
// Helius is a premium RPC provider - more reliable than public endpoints
// Get your API key from: https://www.helius.dev/
// Format: https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
export const getSolanaRpcEndpoints = (): string[] => {
  const heliusApiKey = import.meta.env.VITE_HELIUS_API_KEY;
  
  const endpoints: string[] = [];
  
  // Add Helius first if API key is configured (most reliable)
  if (heliusApiKey) {
    endpoints.push(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`);
  }
  
  // Add public endpoints as fallback
  endpoints.push(
    'https://api.mainnet-beta.solana.com',
    'https://rpc.ankr.com/solana',
    'https://solana-api.projectserum.com'
  );
  
  return endpoints;
};

