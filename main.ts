// Donchian channel breakout bot for cbBTC/USDC on 1-minute bars.
//
// Strategy (original; none of the kit baselines uses it):
//   * Enter long with the full cash when the close breaks above the highest
//     high of the previous 50 bars (a fresh ~1-hour high). One position at a
//     time, long only.
//   * Exit the whole position when the close breaks below the lowest low of
//     the previous 180 bars, so a winner is left to run through chop and only
//     a genuine 3-hour breakdown ends the trade.
//   * Crash guards: exit if the close falls 2.0% below the highest close
//     since entry (give-back stop), or 1.5% below the entry close (hard
//     stop). Neither fired on the dev window; they cap the damage if the
//     race window reverses sharply right after an entry.
//   * After an exit there is no re-entry until the next fresh 50-bar high,
//     which is the cooldown: it keeps the bot out of whipsaw chop, where
//     every round trip costs ~26-46 bps in fees, slippage and impact.
//   * Orders are capped at 500 bps of slippage from the latest close, so a
//     gap open past that is rejected and retried on the next bar instead of
//     filled for almost nothing.
//
// All comparisons are exact integer (bigint) price units: no floats, no
// wall clock, no environment reads, no randomness. The two graded runs
// therefore produce identical orders.

import { runBars, type BarsState } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const ENTRY_LOOKBACK = 50;
const EXIT_LOOKBACK = 180;
const MAX_SLIPPAGE_BPS = 500;
/** 2.0% give-back stop, as an integer ratio: close * 1000 < peak * 980. */
const GIVEBACK_NUM = 980n;
const GIVEBACK_DEN = 1000n;
/** 1.5% hard stop from the entry close: close * 1000 < entry * 985. */
const HARDSTOP_NUM = 985n;
const HARDSTOP_DEN = 1000n;

const highs: bigint[] = [];
const lows: bigint[] = [];
let entryClose: bigint | null = null;
let peakClose: bigint | null = null;

function maxOf(xs: readonly bigint[]): bigint {
  let m = xs[0]!;
  for (const x of xs) if (x > m) m = x;
  return m;
}

function minOf(xs: readonly bigint[]): bigint {
  let m = xs[0]!;
  for (const x of xs) if (x < m) m = x;
  return m;
}

await runBars({
  onBatch(state: BarsState, batch) {
    const bars = batch.bars.filter((b) => b.symbol === SYMBOL);
    if (bars.length === 0) return [];
    const bar = bars[bars.length - 1]!;
    const close = BigInt(bar.c);
    highs.push(BigInt(bar.h));
    lows.push(BigInt(bar.l));

    const held = state.positions.get(SYMBOL);
    if (held === undefined) {
      entryClose = null;
      peakClose = null;
    } else {
      if (entryClose === null) entryClose = close;
      if (peakClose === null || close > peakClose) peakClose = close;
    }
    // Warm-up bars build history but never trade; and 50 bars of history
    // are needed before the first signal can form.
    if (state.warmingUp) return [];
    if (highs.length < ENTRY_LOOKBACK + 1) return [];

    if (held !== undefined) {
      const exitLow = minOf(lows.slice(-EXIT_LOOKBACK - 1, -1));
      let exit = close < exitLow;
      if (!exit && peakClose !== null && close * GIVEBACK_DEN < peakClose * GIVEBACK_NUM) exit = true;
      if (!exit && entryClose !== null && close * HARDSTOP_DEN < entryClose * HARDSTOP_NUM) exit = true;
      if (exit) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    const entryHigh = maxOf(highs.slice(-ENTRY_LOOKBACK - 1, -1));
    if (close > entryHigh) {
      const cash = state.cash;
      if (cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
      entryClose = close;
      peakClose = close;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
