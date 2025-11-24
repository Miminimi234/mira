/**
 * WebSocket client for real-time updates
 * Replaces polling with server-pushed updates
 */

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let connectionPromise: Promise<Socket> | null = null;

export const getSocket = async (): Promise<Socket> => {
  if (socket?.connected) {
    return socket;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      const { API_BASE_URL } = await import('./apiConfig');

      // Determine WebSocket URL
      let wsUrl: string;
      if (API_BASE_URL === '' || API_BASE_URL.startsWith('/')) {
        // Relative URL - use same origin
        wsUrl = window.location.origin;
      } else if (API_BASE_URL.startsWith('http://')) {
        wsUrl = API_BASE_URL.replace('http://', 'ws://');
      } else if (API_BASE_URL.startsWith('https://')) {
        wsUrl = API_BASE_URL.replace('https://', 'wss://');
      } else {
        // Assume it's a hostname
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        wsUrl = `${protocol}://${API_BASE_URL}`;
      }

      return new Promise<Socket>((resolve, reject) => {
        socket = io(wsUrl, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
          timeout: 3000, // Reduced from 20s to 3s for faster fallback to polling
        });

        // Add timeout to reject if connection takes too long
        const timeoutId = setTimeout(() => {
          if (!socket?.connected) {
            console.warn('[WS] ⚠️  Connection timeout after 3s, falling back to polling');
            reject(new Error('Connection timeout'));
          }
        }, 3000);

        socket.on('connect', () => {
          clearTimeout(timeoutId);
          console.log('[WS] ✅ Connected to server');
          resolve(socket!);
        });

        socket.on('disconnect', () => {
          console.log('[WS] ❌ Disconnected from server');
        });

        socket.on('connect_error', (error) => {
          clearTimeout(timeoutId);
          console.error('[WS] ⚠️  Connection error:', error.message);
          // Fallback to polling if WebSocket fails
          reject(error);
        });
      });
    } catch (error) {
      console.error('[WS] ⚠️  Failed to initialize socket:', error);
      return Promise.reject(error);
    }
  })();

  return connectionPromise;
};

export const subscribe = async (channel: string, callback: (data: any) => void) => {
  const ws = await getSocket();
  ws.emit('subscribe', channel);
  // Predictions use a generic event name ('predictions') emitted by the server
  // while clients join rooms named like `predictions:All Markets:5000`.
  // Listen to the correct event based on channel type.
  if (channel.startsWith('predictions:')) {
    ws.on('predictions', callback);
  } else {
    ws.on(channel, callback);
  }
  console.log(`[WS] 📡 Subscribed to: ${channel}`);

  return () => {
    if (channel.startsWith('predictions:')) {
      ws.off('predictions', callback);
    } else {
      ws.off(channel, callback);
    }
    ws.emit('unsubscribe', channel);
    console.log(`[WS] 📴 Unsubscribed from: ${channel}`);
  };
};

export const disconnect = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    connectionPromise = null;
    console.log('[WS] 🔌 Disconnected');
  }
};

