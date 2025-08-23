// 简单的多空通用 PnL 记账：加权均价 + 实现/未实现 + 手续费
import { Side } from "./types";

export class PnLBook {
  public pos = 0;        // 现有净仓位（正=多；负=空）
  public avg = 0;        // 现有净仓位的加权平均成本
  public realized = 0;   // 已实现收益
  public fees = 0;       // 累计手续费
  public volume = 0;     // 成交数量累加（可用于统计）
  constructor(public readonly baseCapital = 10) {} // 初始资金（可自定义）

  apply(side: Side, size: number, price: number, fee = 0) {
    if (size <= 0) return;
    const dir = side === "BUY" ? 1 : -1;
    this.fees += fee;
    this.volume += size;

    // 如果当前仓位为 0 或下单方向与持仓同向 => 加仓 / 开新仓：更新加权均价
    if (this.pos === 0 || Math.sign(this.pos) === dir) {
      const absPos = Math.abs(this.pos);
      const newAbs = absPos + size;
      this.avg = absPos === 0 ? price : (this.avg * absPos + price * size) / newAbs;
      this.pos += dir * size;
      return;
    }

    // 走到这里：是减仓或反手
    // 先平掉一部分（或全部）旧仓，计算已实现 PnL
    const closeQty = Math.min(Math.abs(this.pos), size);
    if (this.pos > 0 && side === "SELL") {
      this.realized += (price - this.avg) * closeQty; // 多仓卖出
    } else if (this.pos < 0 && side === "BUY") {
      this.realized += (this.avg - price) * closeQty; // 空仓买回
    }

    let remaining = size - closeQty;
    this.pos += dir * closeQty; // 旧仓被部分或全部抵消

    if (this.pos === 0) {
      this.avg = 0; // 平仓后均价清零
      if (remaining > 0) {
        // 反手开新仓：用剩余数量在当前价建立新均价
        this.avg = price;
        this.pos = dir * remaining;
      }
    }
    // 若仍有同方向的旧仓（未完全平），均价保持不变
  }

  snapshot(mark: number) {
    const unreal =
      this.pos > 0 ? (mark - this.avg) * this.pos :
      this.pos < 0 ? (this.avg - mark) * (-this.pos) : 0;

    const equity = this.baseCapital + this.realized + unreal - this.fees;
    return {
      pos: this.pos,
      avg: this.avg,
      realized: this.realized,
      unreal,
      fees: this.fees,
      equity,
      volume: this.volume
    };
  }
}
