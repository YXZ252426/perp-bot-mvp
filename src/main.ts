import { PriceEngine } from "./engine";
import { Bot } from "./bot";
import { BotLimits, Wallet } from "./types";
import { SmaCross, MeanRevert, RandomStrategy } from "./strategies";
import { MessageHub } from "./message";

const engine = new PriceEngine(
  { k: 0.25, L: 2000, lambda: 0.03, sigmaNoise: 0.004, feeTrade: 0.02, priceFloor: 0.01 },
  100
);
const history: number[] = [engine.price];
const hub = new MessageHub();
const ANN_WINDOW = 30; // 策略看到的最近公告窗口（tick）

function makeBot(id: string, strategy: any, maxPos: number, limits: BotLimits) {
  const wallet: Wallet = { maxPosition: maxPos, position: 0 };
  return new Bot(
    id,
    strategy,
    wallet,
    limits,
    (o) => engine.submitOrder(o),            // 下单
    (ann) => hub.post(ann, tick)             // 发公告
  );
}

const bots = [
  makeBot("trend-1", new SmaCross(5, 20, 3, 0.001), 20, { maxPerTick: 3, cooldown: 1 }),
  makeBot("revert-1", new MeanRevert(30, 1.2, 2),    20, { maxPerTick: 2, cooldown: 1 }),
  makeBot("rand-1", new RandomStrategy(0.15, 0.15, 1), 10, { maxPerTick: 1, cooldown: 1 }),
];

let tick = 0;
const TICK_MS = 500;

const timer = setInterval(() => {
  // a) 含“最近公告”的上下文
  const anns = hub.recent(tick, ANN_WINDOW);
  const ctx = { tick, price: engine.price, history: history.slice(), announcements: anns };
  console.log("CTX:", ctx);
  // b) 先可能发公告，再做交易决策
  bots.forEach(b => b.onTick(ctx));

  // c) 结算这个 tick（价格只由买卖量决定，不直接用公告影响）
  const res = engine.settleTick();
  history.push(res.price);

  if (tick % 10 === 0) {
    console.log(`[tick ${res.tick}] P=${res.price.toFixed(2)} anns=${anns.length} net=${res.netFlow.toFixed(1)}`);
  }

  tick++;
  if (tick > 300) { clearInterval(timer); console.log("Done."); }
}, TICK_MS);
