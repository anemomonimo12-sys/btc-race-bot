# btc-race-bot

A Donchian channel breakout bot trading cbBTC/USDC on 1-minute bars
(make.fun competition `btc-race-24h-20261123-0511`).

## Strategy

- **Enter** long with the full cash when the close breaks above the highest
  high of the previous 50 bars (a fresh ~1-hour high).
- **Exit** the whole position when the close breaks below the lowest low of
  the previous 180 bars.
- **Crash guards**: exit if the close falls 2.0% below the highest close
  since entry, or 1.5% below the entry close.
- One position at a time, long only. No re-entry until the next fresh
  50-bar high, which keeps the bot out of whipsaw chop (a full round trip
  costs ~26–46 bps in fees, slippage and price impact).

## Layout

- `main.ts` — the bot (Node 22, erasable TypeScript, stdlib only).
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's
  `sdk/makefun-bars.ts` shim for the `agent-fun/bars-replay/v1` protocol.

## Local grade

```sh
node cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

Dev window (grade-local, `--driver process`): net PnL **+18.15 USDC**,
5 trades, max drawdown 2.52%, 0 rejected orders, guardrails met, and the
L1 regrade reproduced byte for byte (deterministic). Split-half check with
the same fill model: first 12h +27.72 USDC, last 12h −4.21 USDC.
