// src/singleMatch.ts
import { EventEmitter } from "events";
import { PriceEngine } from "./engine";
import { Bot } from "./bot";
import { MessageHub } from "./message";
import { BotLimits, MarketCtx, Wallet, Side } from "./types"; // ← 加入 Side
import { makeStrategy } from "./strategyFactory";
import { PnLBook } from "./pnl";

export interface BotSeed {
  botId: string;
  strategyKind: string;
  strategyParams?: any;
  maxPos?: number;
  limits?: BotLimits;
}

export interface MatchConfig {
  tickMs: number;
  annWindow: number;
  engineParams: ConstructorParameters<typeof PriceEngine>[0];
  initialPrice?: number;
  defaultBots?: BotSeed[];
  initialCapitalPerBot?: number;   // ← 每个 bot 初始资金（用来算 equity）
}

export class SingleMatch extends EventEmitter {
  private engine: PriceEngine;
  private hub = new MessageHub();
  private history: number[] = [];
  private bots: Bot[] = [];
  private botIds = new Set<string>(); // ✅ 防重复
  private tick = 0;
  private timer: NodeJS.Timeout | null = null;
  private books = new Map<string, PnLBook>();

  constructor(private cfg: MatchConfig) {
    super();
    this.engine = new PriceEngine(cfg.engineParams, cfg.initialPrice ?? 100);
    this.history = [this.engine.price];

    // ✅ 构造时自动投放默认 bots
    if (cfg.defaultBots?.length) {
      for (const seed of cfg.defaultBots) {
        this.addAgent(
          seed.botId,
          seed.strategyKind,
          seed.strategyParams ?? {},
          seed.maxPos ?? 20,
          seed.limits ?? { maxPerTick: 2, cooldown: 1 }
        );
      }
    }
  }

  /** 内部：下单 + 记账（MVP 用提交时刻现价 & 固定手续费） */
  private handleOrder(o: { agentId: string; side: Side; size: number }) {
    // 1) 提交给撮合引擎
    this.engine.submitOrder(o);

    // 2) 记账（提交时的价格作为成交价；手续费来源于引擎参数）
    const fee = this.cfg.engineParams.feeTrade ?? 0;
    const px = this.engine.price;
    const book = this.books.get(o.agentId);
    if (book) {
      book.apply(o.side, o.size, px, fee);
    }
  }

  /** 选择 agent 进场 */
  addAgent(
    botId: string,
    strategyKind: string,
    strategyParams: any,
    maxPos = 20,
    limits: BotLimits = { maxPerTick: 2, cooldown: 1 }
  ) {
    // ✅ 同名 bot 防重
    if (this.botIds.has(botId)) return false;

    const wallet: Wallet = { maxPosition: maxPos, position: 0 };
    const strategy = makeStrategy(strategyKind, strategyParams);
    const bot = new Bot(
      botId,
      strategy,
      wallet,
      limits,
      (o) => this.handleOrder({ ...o, agentId: botId }), // ← 包装提交以记账
      (ann) => this.hub.post(ann, this.tick)
    );
    this.bots.push(bot);
    this.botIds.add(botId);

    // ✅ 为新 bot 建一本账
    if (!this.books.has(botId)) {
      const cap = this.cfg.initialCapitalPerBot ?? 10; // 默认 10（可配）
      this.books.set(botId, new PnLBook(cap));
    }
    return true;
  }

  /** 排行榜（按 equity 降序） */
  leaderboard(topN = 10) {
    const price = this.engine.price;
    const rows = [...this.books.entries()].map(([id, book]) => {
      const s = book.snapshot(price);
      return { id, ...s }; // { id, pos, avg, realized, unreal, fees, equity, volume }
    }).sort((a, b) => b.equity - a.equity);
    return rows.slice(0, topN);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const anns = this.hub.recent(this.tick, this.cfg.annWindow);
      const ctx: MarketCtx = {
        tick: this.tick,
        price: this.engine.price,
        history: this.history.slice(),
        announcements: anns,
      };

      // 机器人先可能 announce，再下单
      this.bots.forEach(b => b.onTick(ctx));

      const res = this.engine.settleTick();
      this.history.push(res.price);

      // ✅ 推送给前端（WS）：附带前 5 名排行榜
      this.emit("tick", {
        tick: res.tick,
        price: res.price,
        buyVol: res.buyVol,
        sellVol: res.sellVol,
        net: res.netFlow,
        announcements: anns,
        top: this.leaderboard(5),
      });

      this.tick++;
    }, this.cfg.tickMs);
  }

  pause() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  reset() {
    this.pause();
    this.bots = [];
    this.botIds.clear();              // ✅ 清空已注册 botId
    this.books.clear();               // ✅ 清空账本
    this.hub = new MessageHub();
    this.tick = 0;
    this.engine = new PriceEngine(this.cfg.engineParams, this.cfg.initialPrice ?? 100);
    this.history = [this.engine.price];
  }

  snapshot() {
    return {
      tick: this.tick,
      price: this.engine.price,
      bots: this.bots.map(b => b.id),
      historyLen: this.history.length,
      top: this.leaderboard(5),       // ✅ 快照里也带前 5
    };
  }
}
