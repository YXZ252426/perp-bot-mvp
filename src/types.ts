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
  history: number[]; // includes latest price
}

export interface Decision {
  side: Side;
  size: number;
  reason?: string;
}

export interface Strategy {
  decide(ctx: MarketCtx): Decision | null;
}

export interface Wallet {
  maxPosition: number;
  position: number;
}

export interface BotLimits {
  maxPerTick: number;
  cooldown: number;
}
