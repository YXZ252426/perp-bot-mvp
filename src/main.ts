import { PriceEngine } from "./engine";
import { Bot } from "./bot";
import { BotLimits, Wallet } from "./types";
import { SmaCross, MeanRevert, RandomStrategy } from "./strategies";

// 1) Create the price engine (your minimal exchange core)
const engine = new PriceEngine(
  { k: 0.25, L: 2000, lambda: 0.03, sigmaNoise: 0.004, feeTrade: 0.02, priceFloor: 0.01 },
  100
);

// 2) State for strategies
const history: number[] = [engine.price];

// 3) Helper to construct a bot
function makeBot(id: string, strategy: any, maxPos: number, limits: BotLimits) {
  const wallet: Wallet = { maxPosition: maxPos, position: 0 };
  return new Bot(id, strategy, wallet, limits, (o) => engine.submitOrder(o));
}

// 4) Build a small team of bots
const bots = [
  makeBot("trend-1", new SmaCross(5, 20, 3, 0.001), 20, { maxPerTick: 3, cooldown: 1 }),
  makeBot("revert-1", new MeanRevert(30, 1.2, 2), 20, { maxPerTick: 2, cooldown: 1 }),
  makeBot("rand-1", new RandomStrategy(0.15, 0.15, 1), 10, { maxPerTick: 1, cooldown: 1 }),
];

// 5) Tick loop
let tick = 0;
const TICK_MS = 500; // 0.5s per tick

const timer = setInterval(() => {
  // a) bots decide based on current market context
  const ctx = { tick, price: engine.price, history: history.slice() };
  bots.forEach(b => b.onTick(ctx));

  // b) settle the tick to get a new price
  const res = engine.settleTick();
  history.push(res.price);

  // c) log every 10 ticks
  if (tick % 10 === 0) {
    console.log(`[tick ${res.tick}] P=${res.price.toFixed(2)} net=${res.netFlow.toFixed(1)} buy=${res.buyVol.toFixed(1)} sell=${res.sellVol.toFixed(1)} fees=${res.poolFees.toFixed(2)}`);
  }

  // d) stop after N ticks for demo
  tick++;
  if (tick > 300) {
    clearInterval(timer);
    console.log("Done.");
  }
}, TICK_MS);
