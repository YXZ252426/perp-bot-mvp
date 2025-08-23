// src/strategies/aiAnnouncer.ts
import { Strategy, MarketCtx, Announce } from "../types";
import { AIClient } from "../aiClient";

// 简单指标
function sma(arr:number[], n:number){ if(arr.length<n) return null; let s=0; for(let i=arr.length-n;i<arr.length;i++) s+=arr[i]; return s/n; }
function zScore(arr:number[], n:number){ if(arr.length<n) return null; const w=arr.slice(-n);
  const mu=w.reduce((a,b)=>a+b,0)/n; const sd=Math.sqrt(w.reduce((a,b)=>a+(b-mu)**2,0)/n)||1e-8; return (w[w.length-1]-mu)/sd; }

export class AIAnnouncer implements Strategy {
  private lastThink = -Infinity;
  constructor(
    private ai: AIClient,
    private thinkEvery = 6,   // 每 6 个 tick 触发一次 AI 请求（≈3s/次，如果 tick=500ms）
    private speakEvery = 12   // 每 12 个 tick 最多说一次话
  ) {}

  decide(_ctx: MarketCtx) { return null; } // 不下单

  announce(ctx: MarketCtx): Announce | null {
    // 1) 触发异步调用（不等待）
    if (ctx.tick - this.lastThink >= this.thinkEvery) {
      const state = {
        tick: ctx.tick, price: ctx.price,
        sma5: sma(ctx.history,5), sma20: sma(ctx.history,20), z30: zScore(ctx.history,30),
        anns: ctx.announcements.slice(-6).map(a => ({ tick:a.tick, stance:a.stance, text:a.text }))
      };
      this.ai.triggerAnnounce(state, ctx.tick);
      this.lastThink = ctx.tick;
    }
    // 2) 若有新鲜结果且到说话窗口，就同步返回一条公告
    const pending = this.ai.popIfFresh(ctx.tick);
    if (!pending) return null;
    if (ctx.tick % this.speakEvery !== 0) return null; // 简单的频控
    return { text: pending.text, stance: pending.stance };
  }
}
