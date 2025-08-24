// src/server.ts
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { SingleMatch } from "./singleMatch";

const app = express();
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json());

const defaultBots = [
  { botId: "cons-1",  strategyKind: "conservative", strategyParams: {} },
  { botId: "aggr-1",  strategyKind: "aggressive",   strategyParams: {} },
  { botId: "chaos-1", strategyKind: "chaotic",      strategyParams: {} },
  { botId: "info-1",  strategyKind: "informative",  strategyParams: {} },
  { botId: "cons-2",  strategyKind: "conservative", strategyParams: { fast:10, slow:40 } },
  { botId: "ai-1", strategyKind: "ai_announcer",
    strategyParams: { base: "http://127.0.0.1:9933", timeoutMs: 200, thinkEvery: 6, speakEvery: 12 } },
];


// 初始化唯一的盘（先投放默认 5 个 bot，但不 start）
const match = new SingleMatch({
  tickMs: 1500,
  annWindow: 30,
  engineParams: { k: 0.25, L: 2000, lambda: 0.03, sigmaNoise: 0.004, feeTrade: 0.02, priceFloor: 0.01 },
  initialPrice: 100,
  defaultBots,
});

// 投放新 agent
app.post("/match/agents", (req, res) => {
  const { botId, strategyKind, strategyParams, maxPos, limits } = req.body;
  match.addAgent(botId, strategyKind, strategyParams ?? {}, maxPos ?? 20, limits ?? { maxPerTick: 2, cooldown: 1 });
  res.json({ ok: true });
});

// 快照
app.get("/match/snapshot", (_req, res) => res.json(match.snapshot()));
// 排行榜（默认前 10）
app.get("/match/leaderboard", (req, res) => {
  const n = Number(req.query.n ?? 10);
  res.json(match.leaderboard(isNaN(n) ? 10 : n));
});


// 控制接口
app.post("/match/pause", (_req, res) => { match.pause(); res.json({ ok: true }); });
app.post("/match/resume", (_req, res) => { match.start(); res.json({ ok: true }); });
app.post("/match/reset", (_req, res) => { match.reset(); res.json({ ok: true }); });

// src/server.ts（新增路由）
app.post("/match/cartel/start", (req, res) => {
  const { leaderId, nFollowers, durationTicks } = req.body || {};
  const started = match.startCartel(String(leaderId), Number(nFollowers ?? 3), Number(durationTicks ?? 20));
  if (!started) return res.status(400).json({ ok:false, error:"LEADER_NOT_FOUND" });
  res.json({ ok:true, ...started });
});

app.post("/match/cartel/stop", (_req, res) => {
  match.stopCartel();
  res.json({ ok:true });
});


// 启动 HTTP
const server = app.listen(3000, () => console.log("http://localhost:3000"));

// WS：订阅 tick 数据
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  const onTick = (payload: any) => { try { ws.send(JSON.stringify(payload)); } catch {} };
  match.on("tick", onTick);
  ws.on("close", () => match.off("tick", onTick));
});
