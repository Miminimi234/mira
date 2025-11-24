// Custodial wallet management
// Generates and manages Solana wallets for users

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export interface WalletData {
  publicKey: string;
  privateKey: string; // Base58 encoded
  keypair: Keypair;
}

/**
 * Generate a new Solana wallet
 */
export function generateWallet(): WalletData {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const privateKey = bs58.encode(keypair.secretKey);

  return {
    publicKey,
    privateKey,
    keypair,
  };
}

/**
 * Restore wallet from private key
 */
export function restoreWallet(privateKey: string): WalletData {
  try {
    const secretKey = bs58.decode(privateKey);
    const keypair = Keypair.fromSecretKey(secretKey);
    const publicKey = keypair.publicKey.toBase58();

    return {
      publicKey,
      privateKey,
      keypair,
    };
  } catch (error) {
    throw new Error('Invalid private key');
  }
}

/**
 * Store wallet in localStorage (for demo purposes)
 * In production, this should be stored securely on the server
 */
export function storeWallet(walletData: WalletData, userId: string): void {
  const key = `wallet_${userId}`;
  localStorage.setItem(key, JSON.stringify({
    publicKey: walletData.publicKey,
    privateKey: walletData.privateKey,
  }));
}

/**
 * Retrieve wallet from localStorage
 */
export function getStoredWallet(userId: string): WalletData | null {
  const key = `wallet_${userId}`;
  const stored = localStorage.getItem(key);
  
  if (!stored) return null;
  
  try {
    const data = JSON.parse(stored);
    return restoreWallet(data.privateKey);
  } catch (error) {
    return null;
  }
}

// Cache for wallet fetch promises to prevent duplicate requests
const walletFetchCache = new Map<string, Promise<WalletData>>();
// Track which wallets have been fetched from server (only fetch once per session)
const serverFetchedWallets = new Set<string>();

/**
 * Get or create wallet for user - SIMPLIFIED: check server ONCE, then use localStorage
 * NO automatic syncing - wallet is only saved to server when first created
 */
export async function getOrCreateWallet(userId: string): Promise<WalletData> {
  // Check if we already have a pending request for this user
  const cacheKey = `wallet_${userId}`;
  if (walletFetchCache.has(cacheKey)) {
    return walletFetchCache.get(cacheKey)!;
  }

  // Create the fetch promise
  const walletPromise = (async (): Promise<WalletData> => {
    try {
      // FIRST: Check localStorage (fast, no network)
      const localWallet = getStoredWallet(userId);
  
      // If we have a local wallet, use it (don't check server every time)
      if (localWallet) {
        // Only fetch from server ONCE per session if we haven't already
        if (!serverFetchedWallets.has(cacheKey)) {
          serverFetchedWallets.add(cacheKey);
          // Silently check server in background (don't wait, don't sync)
          fetch(`${(await import('@/lib/apiConfig')).API_BASE_URL}/api/wallet`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }).catch(() => {
            // Silent fail - we have localStorage wallet
          });
        }
        return localWallet;
      }

      // No local wallet - check server ONCE
      if (!serverFetchedWallets.has(cacheKey)) {
        serverFetchedWallets.add(cacheKey);
        try {
          const { API_BASE_URL } = await import('@/lib/apiConfig');
          const response = await fetch(`${API_BASE_URL}/api/wallet`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.wallet) {
              // Wallet found on server - restore it
              const wallet = restoreWallet(data.wallet.privateKey);
              // Store locally
              storeWallet(wallet, userId);
              return wallet;
            }
          }
        } catch (error) {
          // Server unavailable - will create new wallet below
          console.debug('Server wallet fetch failed:', error);
        }
      }
      
      // No wallet found anywhere - create new one
      const wallet = generateWallet();
    storeWallet(wallet, userId);
      
      // Save to server ONCE when created (fire and forget, don't wait)
      try {
        const { API_BASE_URL } = await import('@/lib/apiConfig');
        fetch(`${API_BASE_URL}/api/wallet`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicKey: wallet.publicKey,
            privateKey: wallet.privateKey,
          }),
        }).catch(() => {
          // Silent fail - wallet is stored locally
        });
      } catch (error) {
        // Silent fail
  }
  
  return wallet;
    } finally {
      // Remove from cache after completion
      walletFetchCache.delete(cacheKey);
    }
  })();

  // Cache the promise
  walletFetchCache.set(cacheKey, walletPromise);
  
  return walletPromise;
}

/**
 * Store custodial wallet directly (not user-specific)
 * This is the main wallet that persists across sessions
 */
export function storeCustodialWallet(walletData: WalletData): void {
  localStorage.setItem('custodialWallet', JSON.stringify({
    publicKey: walletData.publicKey,
    privateKey: walletData.privateKey,
  }));
}

/**
 * Get stored custodial wallet
 */
export function getCustodialWallet(): WalletData | null {
  const stored = localStorage.getItem('custodialWallet');
  
  if (!stored) return null;
  
  try {
    const data = JSON.parse(stored);
    return restoreWallet(data.privateKey);
  } catch (error) {
    return null;
  }
}

/**
 * Clear custodial wallet from storage
 */
export function clearCustodialWallet(): void {
  localStorage.removeItem('custodialWallet');
}

