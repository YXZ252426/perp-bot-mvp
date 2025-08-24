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

function sample<T>(arr: T[], k: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, Math.min(k, a.length)));
}

type OrderMini = { side: Side; size: number };
type CartelState = { leaderId: string; followers: Set<string>; untilTick: number };
export class SingleMatch extends EventEmitter {
  private engine: PriceEngine;
  private hub = new MessageHub();
  private history: number[] = [];
  private bots: Bot[] = [];
  private botIds = new Set<string>(); // ✅ 防重复
  private tick = 0;
  private timer: NodeJS.Timeout | null = null;
  private books = new Map<string, PnLBook>();
  private lastOrders = new Map<string, OrderMini>(); // 本 tick 记录各 bot 的最终下单
  private cartel: CartelState | null = null;         // 当前唯一的“拉盘/砸盘”协同

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

    /** 发起协同（拉盘/砸盘按钮） */
  startCartel(leaderId: string, nFollowers = 3, durationTicks = 20) {
    if (!this.botIds.has(leaderId)) return null;
    // 随机抽取跟随者
    const candidates = this.bots.map(b => b.id).filter(id => id !== leaderId);
    const picked = new Set(sample(candidates, nFollowers));
    this.cartel = { leaderId, followers: picked, untilTick: this.tick + Math.max(1, durationTicks) };
    return { leaderId, followers: [...picked], untilTick: this.cartel.untilTick };
  }

  /** 提前结束协同 */
  stopCartel() { this.cartel = null; }

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
      // 过期自动关闭
      if (this.cartel && this.tick >= this.cartel.untilTick) this.cartel = null;

      const anns = this.hub.recent(this.tick, this.cfg.annWindow);
      const ctx: MarketCtx = {
        tick: this.tick,
        price: this.engine.price,
        history: this.history.slice(),
        announcements: anns,
      };

      // 每 tick 开头清空“最终单”记录
      this.lastOrders.clear();

      if (this.cartel) {
        const leader = this.bots.find(b => b.id === this.cartel!.leaderId);
        const followers = this.cartel!.followers;

        // 1) 让领头 bot 先跑（产生自己的最终单）
        leader?.onTick(ctx);

        // 2) 复制领头的“最终单”给跟随者（若领头没下单，则不复制）
        const ord = this.lastOrders.get(this.cartel.leaderId);
        if (ord) {
          this.bots.forEach(b => {
            if (followers.has(b.id)) {
              b.followOrder(ord, this.tick);
            }
          });
        }

        // 3) 其他非跟随、非领头 bot 正常运行
        this.bots.forEach(b => {
          if (b.id === this.cartel!.leaderId) return;
          if (followers.has(b.id)) return;
          b.onTick(ctx);
        });
      } else {
        // 无协同时：全体正常运行
        this.bots.forEach(b => b.onTick(ctx));
      }

      // 结算
      const res = this.engine.settleTick();
      this.history.push(res.price);

      // 推送（可附上当前协同信息与排行榜）
      this.emit("tick", {
        tick: res.tick,
        price: res.price,
        buyVol: res.buyVol,
        sellVol: res.sellVol,
        net: res.netFlow,
        announcements: anns,
        cartel: this.cartel ? {
          leaderId: this.cartel.leaderId,
          followers: [...this.cartel.followers],
          ticksLeft: Math.max(0, this.cartel.untilTick - (this.tick + 1)),
        } : null,
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
    this.botIds.clear();
    this.books.clear();
    this.hub = new MessageHub();
    this.tick = 0;
    this.cartel = null;
    this.lastOrders.clear();
    this.engine = new PriceEngine(this.cfg.engineParams, this.cfg.initialPrice ?? 100);
    this.history = [this.engine.price];
  }

  snapshot() {
    return {
      tick: this.tick,
      price: this.engine.price,
      bots: this.bots.map(b => b.id),
      historyLen: this.history.length,
      cartel: this.cartel ? {
        leaderId: this.cartel.leaderId,
        followers: [...this.cartel.followers],
        ticksLeft: Math.max(0, this.cartel.untilTick - this.tick),
      } : null,
      top: this.leaderboard(5),
    };
  }
}
