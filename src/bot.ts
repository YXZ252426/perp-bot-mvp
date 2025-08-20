import { BotLimits, MarketCtx, OutgoingAnnouncement, Side, Strategy, Wallet } from "./types";

export class Bot {
  private lastTradeTick = -Infinity;

  constructor(
    public readonly id: string,
    private strategy: Strategy,
    private wallet: Wallet,
    private limits: BotLimits,
    private submitOrder: (order: { agentId: string; side: Side; size: number }) => void,
    private submitAnnounce: (ann: OutgoingAnnouncement) => void, // ← 新增
  ) {}

  onTick(ctx: MarketCtx) {
    // 先发公告（若策略实现了 announce）
    const sAny = this.strategy as any;
    if (typeof sAny.announce === "function") {
      const msg = sAny.announce(ctx);
      if (msg) {
        this.submitAnnounce({ agentId: this.id, text: msg.text, stance: msg.stance });
      }
    }

    // 以下是交易部分（原样）
    if (ctx.tick - this.lastTradeTick < this.limits.cooldown) return;

    const d = this.strategy.decide(ctx);
    if (!d) return;

    const size = Math.min(Math.abs(d.size), this.limits.maxPerTick);
    if (size <= 0) return;

    const nextPos = this.wallet.position + (d.side === "BUY" ? size : -size);
    if (Math.abs(nextPos) > this.wallet.maxPosition) return;

    this.submitOrder({ agentId: this.id, side: d.side, size });
    this.wallet.position = nextPos;
    this.lastTradeTick = ctx.tick;
  }
}
