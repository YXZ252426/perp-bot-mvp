import { Announce, MarketCtx, Strategy, Decision } from "./types";

function sma(arr: number[], n: number): number | null {
  if (arr.length < n) return null;
  const s = arr.slice(-n).reduce((a, b) => a + b, 0);
  return s / n;
}

export class SmaCross implements Strategy {
  constructor(
    private fast = 5,
    private slow = 20,
    private baseSize = 3,
    private band = 0.001
  ) {}
  decide(ctx: MarketCtx): Decision | null {
    const f = sma(ctx.history, this.fast);
    const s = sma(ctx.history, this.slow);
    if (f == null || s == null) return null;

    // 原始意图（均线）
    let intent = 0;
    if (f > s * (1 + this.band)) intent = 1;
    else if (f < s * (1 - this.band)) intent = -1;

    // 群体信号：取最近一条公告
    const last = ctx.announcements.at(-1);
    const crowd = last ? (last.stance === "BULL" ? 1 : last.stance === "BEAR" ? -1 : 0) : 0;

    const score = intent + crowd;
    if (score > 0) return { side: "BUY", size: this.baseSize, reason: "trend+crowd" };
    if (score < 0) return { side: "SELL", size: this.baseSize, reason: "trend+crowd" };
    return null;
  }
  announce(ctx: MarketCtx): Announce | null {
    // 每 12 个 tick 才发一次，极简
    if (ctx.tick % 12 !== 0) return null;
    const f = sma(ctx.history, this.fast);
    const s = sma(ctx.history, this.slow);
    if (f == null || s == null) return null;
    if (f > s * (1 + this.band)) return { text: "Uptrend", stance: "BULL" };
    if (f < s * (1 - this.band)) return { text: "Downtrend", stance: "BEAR" };
    return { text: "Sideways", stance: "NEUTRAL" };
  }
}

export class MeanRevert implements Strategy {
  constructor(private lookback = 30, private zThresh = 1.2, private baseSize = 2) {}
  decide(ctx: MarketCtx): Decision | null {
    if (ctx.history.length < this.lookback) return null;
    const win = ctx.history.slice(-this.lookback);
    const mu = win.reduce((a, b) => a + b, 0) / win.length;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - mu) ** 2, 0) / win.length) || 1e-8;
    const z = (ctx.price - mu) / sd;

    let intent = 0;
    if (z > this.zThresh) intent = -1;       // 过热→卖
    else if (z < -this.zThresh) intent = 1;  // 过冷→买

    const last = ctx.announcements.at(-1);
    const crowd = last ? (last.stance === "BULL" ? 1 : last.stance === "BEAR" ? -1 : 0) : 0;

    const score = intent + crowd;
    if (score > 0) return { side: "BUY", size: this.baseSize, reason: `revert+crowd` };
    if (score < 0) return { side: "SELL", size: this.baseSize, reason: `revert+crowd` };
    return null;
  }
  announce(ctx: MarketCtx): Announce | null {
    if (ctx.history.length < this.lookback || ctx.tick % 15 !== 0) return null;
    const win = ctx.history.slice(-this.lookback);
    const mu = win.reduce((a, b) => a + b, 0) / win.length;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - mu) ** 2, 0) / win.length) || 1e-8;
    const z = (ctx.price - mu) / sd;
    if (Math.abs(z) < this.zThresh) return null;
    return z > 0 ? { text: "Overbought", stance: "BEAR" } : { text: "Oversold", stance: "BULL" };
  }
}

// 随机策略：不发公告、不读公告（保持基线）
export class RandomStrategy implements Strategy {
  constructor(private buyProb = 0.15, private sellProb = 0.15, private size = 1) {}
  decide(ctx: MarketCtx): Decision | null {
    const r = Math.random();
    if (r < this.buyProb) return { side: "BUY", size: this.size };
    if (r < this.buyProb + this.sellProb) return { side: "SELL", size: this.size };
    return null;
  }
}
