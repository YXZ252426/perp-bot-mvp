import { Decision, MarketCtx, Strategy } from "./types";

function sma(arr: number[], n: number): number | null {
  if (arr.length < n) return null;
  const s = arr.slice(-n).reduce((a, b) => a + b, 0);
  return s / n;
}

// Trend-following: simple moving average crossover
export class SmaCross implements Strategy {
  constructor(
    private fast = 5,
    private slow = 20,
    private baseSize = 3,
    private band = 0.001 // deadband to reduce churn
  ) {}
  decide(ctx: MarketCtx): Decision | null {
    const f = sma(ctx.history, this.fast);
    const s = sma(ctx.history, this.slow);
    if (f == null || s == null) return null;

    if (f > s * (1 + this.band)) return { side: "BUY", size: this.baseSize, reason: "fast>slow" };
    if (f < s * (1 - this.band)) return { side: "SELL", size: this.baseSize, reason: "fast<slow" };
    return null;
  }
}

// Mean reversion: z-score vs recent window
export class MeanRevert implements Strategy {
  constructor(
    private lookback = 30,
    private zThresh = 1.0,
    private baseSize = 2
  ) {}
  decide(ctx: MarketCtx): Decision | null {
    if (ctx.history.length < this.lookback) return null;
    const win = ctx.history.slice(-this.lookback);
    const mu = win.reduce((a, b) => a + b, 0) / win.length;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - mu) ** 2, 0) / win.length) || 1e-8;
    const z = (ctx.price - mu) / sd;

    if (z > this.zThresh) return { side: "SELL", size: this.baseSize, reason: `z=${z.toFixed(2)}` };
    if (z < -this.zThresh) return { side: "BUY", size: this.baseSize, reason: `z=${z.toFixed(2)}` };
    return null;
  }
}

// Random baseline strategy (for sanity checks)
export class RandomStrategy implements Strategy {
  constructor(private buyProb = 0.15, private sellProb = 0.15, private size = 1) {}
  decide(_ctx: MarketCtx): Decision | null {
    const r = Math.random();
    if (r < this.buyProb) return { side: "BUY", size: this.size };
    if (r < this.buyProb + this.sellProb) return { side: "SELL", size: this.size };
    return null;
  }
}
