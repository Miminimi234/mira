declare module '../../../server/firebaseClient.js' {
  export function isEnabled(): boolean;
  export function getCache(key: string): Promise<any>;
  export function setCache(key: string, value: any, ttlSec?: number): Promise<void>;
  export function getConfig(): Promise<any>;

  const _default: {
    isEnabled: typeof isEnabled;
    getCache: typeof getCache;
    setCache: typeof setCache;
    getConfig: typeof getConfig;
  };

  export default _default;
}
