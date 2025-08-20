import { Decision, MarketCtx, Strategy, Announce } from "./types";

// 小工具
function sma(arr: number[], n: number): number | null {
  if (arr.length < n) return null;
  let s = 0;
  for (let i = arr.length - n; i < arr.length; i++) s += arr[i];
  return s / n;
}
function zScore(win: number[]): { mu: number; sd: number; z: number } {
  const mu = win.reduce((a,b)=>a+b,0) / win.length;
  const sd = Math.sqrt(win.reduce((a,b)=>a+(b-mu)**2,0)/win.length) || 1e-8;
  const z  = (win[win.length-1] - mu) / sd;
  return { mu, sd, z };
}

/** 1) 保守：只看均线趋势，忽略公告，手数小 */
export class ConservativeStrategy implements Strategy {
  constructor(
    private fast=8, private slow=34, private baseSize=1, private band=0.0015
  ) {}
  decide(ctx: MarketCtx): Decision | null {
    const f = sma(ctx.history, this.fast);
    const s = sma(ctx.history, this.slow);
    if (f == null || s == null) return null;
    if (f > s * (1 + this.band)) return { side: "BUY",  size: this.baseSize, reason: "conservative-trend" };
    if (f < s * (1 - this.band)) return { side: "SELL", size: this.baseSize, reason: "conservative-trend" };
    return null;
  }
  announce(ctx: MarketCtx): Announce | null {
    if (ctx.tick % 20 !== 0) return null;
    const f = sma(ctx.history, this.fast); const s = sma(ctx.history, this.slow);
    if (f == null || s == null) return null;
    if (f > s * (1 + this.band)) return { text:"稳健看多", stance:"BULL" };
    if (f < s * (1 - this.band)) return { text:"稳健看空", stance:"BEAR" };
    return { text:"观望", stance:"NEUTRAL" };
  }
}

/** 2) 积极：趋势 + 适度跟风，强势时放大手数 */
export class AggressiveStrategy implements Strategy {
  constructor(
    private fast=5, private slow=20, private baseSize=3, private band=0.001
  ) {}
  decide(ctx: MarketCtx): Decision | null {
    const f = sma(ctx.history, this.fast);
    const s = sma(ctx.history, this.slow);
    if (f == null || s == null) return null;

    // 自身趋势意图
    let intent = 0;
    if (f > s * (1 + this.band)) intent = 1;
    else if (f < s * (1 - this.band)) intent = -1;

    // 最近一条公告的群体信号（无权重，极简）
    const last = ctx.announcements.length ? ctx.announcements[ctx.announcements.length-1] : undefined;
    const crowd = last ? (last.stance === "BULL" ? 1 : last.stance === "BEAR" ? -1 : 0) : 0;

    const score = intent + crowd; // -2..2
    if (score === 0) return null;
    const size = this.baseSize * (Math.abs(score) >= 2 ? 2 : 1); // 强共振时加倍
    return { side: score > 0 ? "BUY" : "SELL", size, reason: "aggressive-trend+crowd" };
  }
  announce(ctx: MarketCtx): Announce | null {
    if (ctx.tick % 10 !== 0) return null;
    const f = sma(ctx.history, this.fast); const s = sma(ctx.history, this.slow);
    if (f == null || s == null) return null;
    if (f > s * (1 + this.band)) return { text:"强势上行，跟进", stance:"BULL" };
    if (f < s * (1 - this.band)) return { text:"弱势下行，做空", stance:"BEAR" };
    return { text:"等待突破", stance:"NEUTRAL" };
  }
}

/** 3) 混沌：带随机性，偶尔反着群体来搅局 */
export class ChaoticStrategy implements Strategy {
  constructor(private baseSize=2, private tradeProb=0.35) {}
  decide(ctx: MarketCtx): Decision | null {
    if (Math.random() >= this.tradeProb) return null; // 并非每个 tick 都动
    const last = ctx.announcements.length ? ctx.announcements[ctx.announcements.length-1] : undefined;
    // 50% 跟随、50% 反着来
    let dir = Math.random() < 0.5 ? 1 : -1;
    const crowd = last ? (last.stance === "BULL" ? 1 : last.stance === "BEAR" ? -1 : 0) : 0;
    const final = crowd === 0 ? dir : (Math.random()<0.5 ? crowd : -crowd);
    const size = this.baseSize + Math.floor(Math.random()*3); // 2..4
    return { side: final > 0 ? "BUY" : "SELL", size, reason: "chaotic" };
  }
  announce(ctx: MarketCtx): Announce | null {
    if (ctx.tick % 6 !== 0) return null;
    const pick = Math.random();
    if (pick < 0.33) return { text:"放大波动！", stance:"BULL" };
    if (pick < 0.66) return { text:"打破秩序！", stance:"BEAR" };
    return { text:"制造噪声", stance:"NEUTRAL" };
  }
}

/** 4) 信息：优先跟随信息；没有信息时用均值回归兜底 */
export class InformativeStrategy implements Strategy {
  constructor(private lookback=30, private z=1.1, private baseSize=2) {}
  decide(ctx: MarketCtx): Decision | null {
    const last = ctx.announcements.length ? ctx.announcements[ctx.announcements.length-1] : undefined;
    if (last && last.stance !== "NEUTRAL") {
      return { side: last.stance === "BULL" ? "BUY" : "SELL", size: this.baseSize, reason: "info-follow" };
    }
    // 无信息→均值回归兜底
    if (ctx.history.length < this.lookback) return null;
    const win = ctx.history.slice(-this.lookback);
    const { z } = zScore(win);
    if (z > this.z)  return { side: "SELL", size: this.baseSize, reason: "revert" };
    if (z < -this.z) return { side: "BUY",  size: this.baseSize, reason: "revert" };
    return null;
  }
  announce(ctx: MarketCtx): Announce | null {
    if (ctx.tick % 8 !== 0) return null;
    const last = ctx.announcements.length ? ctx.announcements[ctx.announcements.length-1] : undefined;
    if (last && last.stance !== "NEUTRAL") return { text:`转述：${last.stance}`, stance:last.stance };
    return { text:"收集情报", stance:"NEUTRAL" };
  }
}
