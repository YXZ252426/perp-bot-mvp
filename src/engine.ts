import { Action, EngineParams, TickResult } from "./types";

function clip(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

// Box–Muller transform for standard normal
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class PriceEngine {
  private p: number;
  private tickNo = 0;
  private buy = 0;
  private sell = 0;
  private poolFeesAcc = 0;

  constructor(
    public readonly params: EngineParams,
    initialPrice = 100
  ) {
    this.p = initialPrice;
  }

  get price() {
    return this.p;
  }

  submitOrder(a: Action) {
    if (a.size <= 0) return;
    if (a.side === "BUY") this.buy += a.size;
    else this.sell += a.size;
    if (this.params.feeTrade && this.params.feeTrade > 0) {
      this.poolFeesAcc += this.params.feeTrade;
    }
  }

  settleTick(): TickResult {
    const { k, L, lambda, sigmaNoise = 0, priceFloor = 0.01 } = this.params;

    const net = this.buy - this.sell;
    const delta = k * (net / (L + Math.abs(net)));
    const pPrime = this.p * (1 + delta);
    const pLimited = clip(pPrime, this.p * (1 - lambda), this.p * (1 + lambda));
    const noise = sigmaNoise > 0 ? Math.exp(randn() * sigmaNoise) : 1.0;
    this.p = Math.max(priceFloor, pLimited * noise);

    const res: TickResult = {
      tick: this.tickNo++,
      price: this.p,
      buyVol: this.buy,
      sellVol: this.sell,
      netFlow: net,
      poolFees: this.poolFeesAcc,
    };

    // reset per-tick accumulators
    this.buy = 0;
    this.sell = 0;
    this.poolFeesAcc = 0;

    return res;
  }
}
