/**
 * Agent trading system configuration
 *
 * Feature flags and configuration constants for the trading engine.
 */
/**
 * Default configuration
 */
export const DEFAULT_CONFIG = {
    mode: process.env.PREDICTION_ENGINE_MODE === 'LIVE' ? 'LIVE' : 'SIMULATION',
    debug: process.env.PREDICTION_ENGINE_DEBUG === 'true',
    enableLifecycle: true,
    enableAdaptive: true,
    enableWebSearch: true,
};
/**
 * Get current engine configuration
 */
export function getEngineConfig() {
    return DEFAULT_CONFIG;
}
/**
 * Check if lifecycle management is enabled
 */
export function isLifecycleEnabled() {
    return getEngineConfig().enableLifecycle;
}
/**
 * Check if adaptive tuning is enabled
 */
export function isAdaptiveEnabled() {
    return getEngineConfig().enableAdaptive;
}
/**
 * Check if web search is enabled
 */
export function isWebSearchEnabled() {
    return getEngineConfig().enableWebSearch;
}
/**
 * Check if debug mode is enabled
 */
export function isDebugMode() {
    return getEngineConfig().debug;
}
