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

## 目录
```
src/
  engine.ts       # PriceEngine：submitOrder + settleTick
  types.ts        # 基础类型
  bot.ts          # Bot 容器：冷却、仓位限制、下单提交
  strategies.ts   # SmaCross / MeanRevert / Random 策略
  main.ts         # Tick 循环：把一切连起来
```

## 参数说明（engine）
- `k`：价格灵敏度（0.1~0.5）
- `L`：虚拟流动性（越大越平滑）
- `lambda`：单 tick 涨跌幅限制，如 0.03 = ±3%
- `sigmaNoise`：极小随机噪声（可为 0）
- `feeTrade`：每次下单的固定手续费
- `priceFloor`：价格下限，防归零

## 下一步
- 把 `TickResult` 用 WebSocket 推送给前端折线图
- 加入报名费/奖池/结算（链上或 off-chain）
- 给策略提供“消息情绪”输入，形成“信息→价格”的闭环
