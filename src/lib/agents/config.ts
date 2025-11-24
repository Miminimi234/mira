/**
 * Agent trading system configuration
 * 
 * Feature flags and configuration constants for the trading engine.
 */

/**
 * Trading engine mode
 */
export type EngineMode = 'LIVE' | 'SIMULATION' | 'DEBUG';

/**
 * Trading engine configuration
 */
export interface TradingEngineConfig {
  mode: EngineMode;
  debug: boolean;
  enableLifecycle: boolean;
  enableAdaptive: boolean;
  enableWebSearch: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: TradingEngineConfig = {
  mode: process.env.PREDICTION_ENGINE_MODE === 'LIVE' ? 'LIVE' : 'SIMULATION',
  debug: process.env.PREDICTION_ENGINE_DEBUG === 'true',
  enableLifecycle: true,
  enableAdaptive: true,
  enableWebSearch: true,
};

/**
 * Get current engine configuration
 */
export function getEngineConfig(): TradingEngineConfig {
  return DEFAULT_CONFIG;
}

/**
 * Check if lifecycle management is enabled
 */
export function isLifecycleEnabled(): boolean {
  return getEngineConfig().enableLifecycle;
}

/**
 * Check if adaptive tuning is enabled
 */
export function isAdaptiveEnabled(): boolean {
  return getEngineConfig().enableAdaptive;
}

/**
 * Check if web search is enabled
 */
export function isWebSearchEnabled(): boolean {
  return getEngineConfig().enableWebSearch;
}

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(): boolean {
  return getEngineConfig().debug;
}

