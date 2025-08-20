export type Side = "BUY" | "SELL";

export interface Action {
  agentId: string;
  side: Side;
  size: number; // positive number; ignored if <= 0
}

export interface EngineParams {
  k: number;              // price sensitivity
  L: number;              // virtual liquidity
  lambda: number;         // per-tick price limit, e.g. 0.03 = ±3%
  sigmaNoise?: number;    // optional lognormal noise std (e.g. 0.004)
  feeTrade?: number;      // fixed fee per order
  priceFloor?: number;    // minimum price (avoid zero), default 0.01
}

export interface TickResult {
  tick: number;
  price: number;
  buyVol: number;
  sellVol: number;
  netFlow: number;
  poolFees: number;
}

export interface MarketCtx {
  tick: number;
  price: number;
  history: number[];
  announcements: Announcement[]; 
}


export interface Decision {
  side: Side;
  size: number;
  reason?: string;
}

export interface Strategy {
  decide(ctx: MarketCtx): Decision | null;
  announce?(ctx: MarketCtx): Announce | null; // ← 可选
}

export interface Wallet {
  maxPosition: number;
  position: number;
}

export interface BotLimits {
  maxPerTick: number;
  cooldown: number;
}

// ✅ 新增：立场与公告
export type Stance = "BULL" | "BEAR" | "NEUTRAL";

export interface Announcement {
  tick: number;
  agentId: string;
  text: string;
  stance: Stance;
}

export interface Announce { // 策略用来发公告
  text: string;
  stance: Stance;
}

export interface OutgoingAnnouncement {
  agentId: string;
  text: string;
  stance: Stance;
}