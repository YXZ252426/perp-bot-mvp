import { BotLimits, MarketCtx, Side, Strategy, Wallet } from "./types";

export class Bot {
  private lastTradeTick = -Infinity;

  constructor(
    public readonly id: string,
    private strategy: Strategy,
    private wallet: Wallet,
    private limits: BotLimits,
    private submit: (order: { agentId: string; side: Side; size: number }) => void
  ) {}

  onTick(ctx: MarketCtx) {
    // cooldown
    if (ctx.tick - this.lastTradeTick < this.limits.cooldown) return;

    const d = this.strategy.decide(ctx);
    if (!d) return;

    const size = Math.min(Math.abs(d.size), this.limits.maxPerTick);
    if (size <= 0) return;

    // simple position guard (treat orders as instant fill for MVP)
    const nextPos = this.wallet.position + (d.side === "BUY" ? size : -size);
    if (Math.abs(nextPos) > this.wallet.maxPosition) return;

    this.submit({ agentId: this.id, side: d.side, size });
    this.wallet.position = nextPos;
    this.lastTradeTick = ctx.tick;
  }
}
