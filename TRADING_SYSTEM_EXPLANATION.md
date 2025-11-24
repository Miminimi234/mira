# Trading System Explanation

## How Trades Work Currently

### 1. **Trade Generation (Opening Trades)**
- Agents analyze markets every 30 seconds
- They score markets based on volume, liquidity, news, price movement, and probability
- If a market scores high enough (above threshold), agents generate a trade
- Each trade has:
  - **Status**: `OPEN` or `CLOSED`
  - **Side**: `YES` or `NO` (betting direction)
  - **Investment**: Amount invested (varies by confidence, risk, and market score)
  - **Entry Probability**: Market probability when trade was opened
  - **Current Probability**: Live market probability (updates from Polymarket)

### 2. **Trade Persistence (Why Trades Don't Disappear)**
- **Trades are cached in Redis** (or in-memory if Redis unavailable)
- Cache TTL: 30 seconds (trades refresh every 30 seconds)
- **Trades persist across server restarts** via Redis
- Each agent's trades are stored separately
- When you open the agent trades panel, it fetches from this cache

### 3. **Current Trade Closing Logic**

**Currently, trades are closed in two ways:**

#### A. **Deterministic Closing (At Generation Time)**
- When a trade is first generated, ~33% are marked as `CLOSED` immediately
- This is based on a hash of the market ID (same market = same status)
- PnL is calculated deterministically based on confidence and score
- **This is why you see closed trades immediately**

#### B. **Lifecycle Management (Planned, Not Fully Active)**
The system has infrastructure for **dynamic closing** based on market conditions:

**Exit Conditions (defined in `lifecycle.ts`):**
- **Take-Profit**: 
  - YES position closes if probability >= 80%
  - NO position closes if probability <= 20%
- **Stop-Loss**:
  - YES position closes if probability <= 30%
  - NO position closes if probability >= 70%
- **Time-Based**: Close after 30 days
- **Score Decay**: Close if market score drops below 20

**However**, this lifecycle checking is not currently running in the background.

### 4. **What's Missing (The Gap)**

The system has the **code** for lifecycle management (`lifecycle.ts`), but it's not being **executed**:

```typescript
// In execution.ts, there's a TODO:
// TODO: Apply lifecycle logic:
// 1. Check exit conditions for open positions
// 2. Close positions that meet exit criteria
// 3. Open new positions (subject to risk caps)
// 4. Handle flips (close + reopen opposite side)
```

### 5. **How It Should Work (Full Implementation)**

**Background Process (Every 30-60 seconds):**
1. For each agent's **open positions**:
   - Fetch current market probability from Polymarket
   - Check if exit conditions are met (take-profit, stop-loss, time, score)
   - If conditions met → Close position, calculate realized PnL
   - Update portfolio (add realized PnL to capital)
2. Generate new trades (if agent has available capital)
3. Update chart with new capital values

**Trade States:**
- `OPEN`: Active position, unrealized PnL updates with market probability
- `CLOSED`: Position closed, realized PnL is final

### 6. **Current Behavior vs. Ideal Behavior**

**Current:**
- Trades are generated with OPEN/CLOSED status deterministically
- Closed trades show PnL immediately (calculated at generation)
- Open trades show unrealized PnL (calculated from current probability)
- **No automatic closing** when profit targets are hit

**Ideal (Full Implementation):**
- Trades start as OPEN
- Background process checks every 30-60 seconds
- When profit target hit → Status changes to CLOSED, PnL realized
- Chart updates showing actual profit/loss
- Agent capital increases/decreases based on closed trades

### 7. **Why Trades Stay in Panel**

- Trades are **cached in Redis** with 30-second TTL
- When you open the agent panel, it fetches from cache
- Both OPEN and CLOSED trades are shown
- OPEN trades show live unrealized PnL
- CLOSED trades show final realized PnL

### 8. **Next Steps to Full Implementation**

To make the system fully dynamic:

1. **Start background scheduler** (in `server/index.js`):
   ```typescript
   import { startScheduler } from './lib/agents/execution.js';
   startScheduler(60000); // Run every 60 seconds
   ```

2. **Implement lifecycle checking** in `execution.ts`:
   - Load open positions from cache/persistence
   - Fetch current market probabilities
   - Run `processPositionLifecycle()` for each agent
   - Update cache with closed positions
   - Generate new trades

3. **Update trade status dynamically**:
   - When exit condition met → Change status from OPEN to CLOSED
   - Calculate realized PnL
   - Update agent's capital

## Summary

**Current State:**
- ✅ Trades are generated and cached
- ✅ Trades persist in Redis
- ✅ OPEN/CLOSED status exists
- ✅ PnL calculation exists
- ❌ **Lifecycle checking not running** (trades don't auto-close when profit hit)

**What You're Seeing:**
- Trades appear in the panel and stay there (cached)
- Closed trades show PnL (calculated at generation)
- Open trades show unrealized PnL (calculated from live probability)
- But trades don't automatically close when they hit profit targets

**To Fix:**
- Need to activate the background scheduler
- Need to implement the lifecycle checking in the execution cycle
- Then trades will automatically close when profit/stop-loss is hit

