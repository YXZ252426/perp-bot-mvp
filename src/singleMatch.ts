// src/singleMatch.ts
import { EventEmitter } from "events";
import { PriceEngine } from "./engine";
import { Bot } from "./bot";
import { MessageHub } from "./message";
import { BotLimits, MarketCtx, Wallet } from "./types";
import { makeStrategy } from "./strategyFactory";

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
}

export class SingleMatch extends EventEmitter {
  private engine: PriceEngine;
  private hub = new MessageHub();
  private history: number[] = [];
  private bots: Bot[] = [];
  private botIds = new Set<string>(); // ✅ 防重复
  private tick = 0;
  private timer: NodeJS.Timeout | null = null;

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
      (o) => this.engine.submitOrder(o),
      (ann) => this.hub.post(ann, this.tick)
    );
    this.bots.push(bot);
    this.botIds.add(botId);
    return true;
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

      // 推送给前端（WS）
      this.emit("tick", {
        tick: res.tick,
        price: res.price,
        buyVol: res.buyVol,
        sellVol: res.sellVol,
        net: res.netFlow,
        announcements: anns,
      });

      this.tick++;
    }, this.cfg.tickMs);
  }

  pause() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  reset() {
    this.pause();
    this.bots = [];
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
    };
  }
}
