# Perp-Bot-MVP

最小可跑的 **价格引擎 + 自动机器人** Demo：
- 输入：每个 tick 内各 Bot 的买/卖量
- 输出：新价格（带涨跌停与轻噪声）
- 附：趋势/反转/随机三种策略 + Tick 循环

## 运行

```bash
# 1) 解压并进入项目目录
# 2) 安装依赖
npm i

# 3) 开发模式直接跑（ts-node）
npm run dev

# 或者构建后再跑
npm run build
npm start
```

运行后你会在控制台看到每 10 个 tick 的价格与净订单流：

```
[tick 0] P=100.15 net=3.0 buy=7.0 sell=4.0 fees=0.06
...
```


## 参数说明（engine）
- `k`：价格灵敏度（0.1~0.5）
- `L`：虚拟流动性（越大越平滑）
- `lambda`：单 tick 涨跌幅限制，如 0.03 = ±3%
- `sigmaNoise`：极小随机噪声（可为 0）
- `feeTrade`：每次下单的固定手续费
- `priceFloor`：价格下限，防归零

# REST API

## 1) 添加/投放 Bot

```bash
POST /match/agents
```

**Request Body**

```json
{
  "botId": "user-bot-1",
  "strategyKind": "informative",
  "strategyParams": { "lookback": 25, "z": 1.0, "size": 2 },
  "maxPos": 20,
  "limits": { "maxPerTick": 2, "cooldown": 1 }
}
```

-   `botId`：字符串，唯一标识一个 bot。
    
-   `strategyKind`：见上文 StrategyKind。
    
-   `strategyParams`：该策略的参数对象（不同策略参数字段不同，见下“常见 strategyParams”）。
    
-   `maxPos`：仓位上限（绝对值）。
    
-   `limits.maxPerTick`：单 tick 最大下单量。
    
-   `limits.cooldown`：冷却 tick 数（最短多少 tick 才能再下单）。
    

**Response**

```json
{ "ok": true }
```

> 说明：当前实现未返回错误码；若想避免重复 `botId`，建议在后端 `addAgent` 返回 `false` 时回 409（改造点，非现状）。

---

## 2) 获取对局快照

```sql
GET /match/snapshot
```

**Response（示例）**

```json
{
  "tick": 0,
  "price": 100,
  "bots": ["cons-1","aggr-1","chaos-1","info-1","cons-2"],
  "historyLen": 1
}
```

---

## 3) 控制对局（开始/暂停/重置）

### 开始（或恢复）

```lua
POST /match/resume
```

**Response**

```json
{ "ok": true }
```

### 暂停

```bash
POST /match/pause
```

**Response**

```json
{ "ok": true }
```

### 重置

```bash
POST /match/reset
```

**Response**

```json
{ "ok": true }
```

> 注意：**重置会清空所有已在盘内的 bot**，并重新初始化价格与历史。当前代码中 `reset()` 不会自动重新投放默认 5 个 bot；如需“重置后仍带默认 bot”，需要在 `reset()` 中补回默认种子或在 `/match/reset` 处理里重新投放（这是一个可选的后端改造点）。



## 4). 获取排行榜

**Endpoint**

```sql
GET /match/leaderboard
```

**描述**  
获取交易比赛的排行榜数据，按 `equity`（总权益）降序排列。

**请求参数（Query）**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| n | number | 否 | 10 | 返回前 n 名排行榜数据 |

**响应格式（JSON Array）**  
返回一个数组，每个元素表示一个参赛账户。

**字段说明**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 账户或机器人 ID |
| equity | number | 总权益（= 初始资金 + 已实现收益 + 未实现收益 - 手续费） |
| realized | number | 已实现收益（已经锁定的盈亏） |
| volume | number | 累计成交量 |

---

## 2\. 响应示例

**请求**

```sql
GET /match/leaderboard?n=5
```

**响应**

```json
[
  {
    "id": "botA",
    "equity": 78.5,
    "realized": 20.0,
    "volume": 15
  },
  {
    "id": "botB",
    "equity": 55.0,
    "realized": 50.0,
    "volume": 8
  }
]
```

---

## 3\. 前端展示推荐

前端表格可以展示如下字段：

-   **排名 Rank**（前端根据数组顺序生成 1, 2, 3...）
    
-   **ID**（`id`）
    
-   **总权益 Equity**（`equity`）
    
-   **已实现收益 Realized**（`realized`）
    
-   **成交量 Volume**（`volume`）
    

| Rank | ID | Equity | Realized | Volume |
| --- | --- | --- | --- | --- |
| 1 | botA | 78.5 | 20.0 | 15 |
| 2 | botB | 55.0 | 50.0 | 8 |

---
---

# WebSocket

-   **URL**：`ws://localhost:3000/ws`
    
-   **协议**：无自定义子协议
    
-   **消息方向**：服务器 → 客户端（推送 tick 数据）
    
-   **客户端无需发送订阅消息**，连接即开始接收。
    

**浏览器端示例**

```js
const ws = new WebSocket("ws://localhost:3000/ws");

ws.onopen = () => console.log("WS connected");
ws.onmessage = (ev) => {
  const tick = JSON.parse(ev.data);
  // { tick, price, buyVol, sellVol, net, announcements: [...] }
  console.log("TICK:", tick);
};
ws.onclose = () => console.log("WS closed");
ws.onerror = (e) => console.error("WS error", e);
```
