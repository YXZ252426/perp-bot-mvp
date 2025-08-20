import { Strategy } from "./types";
import { ConservativeStrategy, AggressiveStrategy, ChaoticStrategy, InformativeStrategy } from "./strategies";

export function makeStrategy(kind: string, p: any): Strategy {
  switch (kind) {
    case "conservative": return new ConservativeStrategy(p?.fast ?? 8, p?.slow ?? 34, p?.size ?? 1,  p?.band ?? 0.0015);
    case "aggressive":   return new AggressiveStrategy(  p?.fast ?? 5, p?.slow ?? 20, p?.size ?? 3,  p?.band ?? 0.001 );
    case "chaotic":      return new ChaoticStrategy(     p?.size ?? 2, p?.tradeProb ?? 0.35);
    case "informative":  return new InformativeStrategy( p?.lookback ?? 30, p?.z ?? 1.1, p?.size ?? 2);
    default:             return new ConservativeStrategy(); // 兜底
  }
}
