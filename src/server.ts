// src/server.ts
import express from "express";
import { WebSocketServer } from "ws";
import { SingleMatch } from "./singleMatch";
import { STRATEGY_PRESETS } from "./strategyFactory";

const app = express();
app.use(express.json());

const defaultBots = [
  { botId: "trend-1",  strategyKind: "sma",    strategyParams: { fast: 5,  slow: 20, size: 3 } },
  { botId: "trend-2",  strategyKind: "sma",    strategyParams: { fast: 8,  slow: 34, size: 2 } },
  { botId: "revert-1", strategyKind: "revert", strategyParams: { lookback: 30, z: 1.2, size: 2 } },
  { botId: "revert-2", strategyKind: "revert", strategyParams: { lookback: 20, z: 1.0, size: 1 } },
  { botId: "rand-1",   strategyKind: "random", strategyParams: { buyProb: 0.15, sellProb: 0.15, size: 1 } },
];

// 启动唯一的盘（默认投放 5 个 bot）
const match = new SingleMatch({
  tickMs: 500,
  annWindow: 30,
  engineParams: { k: 0.25, L: 2000, lambda: 0.03, sigmaNoise: 0.004, feeTrade: 0.02, priceFloor: 0.01 },
  initialPrice: 100,
  defaultBots,
});
match.start();

// 可选：给前端渲染策略列表
app.get("/strategies", (_req, res) => res.json(STRATEGY_PRESETS));

// 前端创建 agent 后，“投放进场”
app.post("/match/agents", (req, res) => {
  const { botId, strategyKind, strategyParams, maxPos, limits } = req.body;
  match.addAgent(botId, strategyKind, strategyParams ?? {}, maxPos ?? 20, limits ?? { maxPerTick: 2, cooldown: 1 });
  res.json({ ok: true });
});

// 查看当前盘快照
app.get("/match/snapshot", (_req, res) => res.json(match.snapshot()));

// 控制
app.post("/match/pause", (_req, res) => { match.pause(); res.json({ ok: true }); });
app.post("/match/resume", (_req, res) => { match.start(); res.json({ ok: true }); });
app.post("/match/reset", (_req, res) => { match.reset(); res.json({ ok: true }); });

// 启动 HTTP
const server = app.listen(3000, () => console.log("http://localhost:3000"));

// WS：前端订阅 tick 数据
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  const onTick = (payload: any) => { try { ws.send(JSON.stringify(payload)); } catch {} };
  match.on("tick", onTick);
  ws.on("close", () => match.off("tick", onTick));
});
