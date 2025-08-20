// src/strategyFactory.ts
import { SmaCross, MeanRevert, RandomStrategy } from "./strategies";

export function makeStrategy(kind: string, p: any) {
  switch (kind) {
    case "sma":    return new SmaCross(p.fast ?? 5, p.slow ?? 20, p.size ?? 3, p.band ?? 0.001);
    case "revert": return new MeanRevert(p.lookback ?? 30, p.z ?? 1.2, p.size ?? 2);
    case "random":
    default:       return new RandomStrategy(p.buyProb ?? 0.15, p.sellProb ?? 0.15, p.size ?? 1);
  }
}

// 可选：给前端一个“可选策略列表”
export const STRATEGY_PRESETS = [
  { kind: "sma",    params: { fast: 5, slow: 20, size: 3, band: 0.001 } },
  { kind: "revert", params: { lookback: 30, z: 1.2, size: 2 } },
  { kind: "random", params: { buyProb: 0.15, sellProb: 0.15, size: 1 } },
];
