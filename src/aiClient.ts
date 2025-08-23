// src/aiClient.ts
import fetch from "node-fetch";
import { AIResponse } from "./types";

export type Stance = "BULL" | "BEAR" | "NEUTRAL";
export interface AIAnn { text: string; stance: Stance; tick: number; }

export class AIClient {
  private inflight = false;          // 只保留一个在途请求，防止堆积
  private failures = 0;
  private breakerUntil = 0;          // 熔断到期时间
  private latest: AIAnn | null = null;  // 最近一条结果（由策略弹出）

  constructor(
    private base = "http://127.0.0.1:9933",
    private timeoutMs = 200,
    private maxFailures = 5,
    private breakMs = 10_000,
    private staleTicks = 8
  ) {}

  /** 非阻塞触发调用；在途/熔断中直接返回 */
  triggerAnnounce(state: any, nowTick: number) {
    const now = Date.now();
    if (this.inflight || now < this.breakerUntil) return;

    this.inflight = true;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);

    fetch(`${this.base}/announce`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "announce",
          state,
          constraints: {
            timeout_ms: this.timeoutMs,
            max_text_len: 140,
            tick: nowTick,
          },
        }),
        signal: ctl.signal,
      })
        .then(r =>
          r.ok
            ? (r.json() as Promise<AIResponse>) // 👈 在这里断言
            : Promise.reject(new Error(String(r.status)))
        )
        .then((j) => {
          const a = j?.announce;
          const t = Number.isFinite(j?.tick) ? j.tick! : nowTick;
          if (a?.text && ["BULL", "BEAR", "NEUTRAL"].includes(a.stance)) {
            this.latest = {
              text: String(a.text).slice(0, 140),
              stance: a.stance,
              tick: t,
            };
          }
          this.failures = 0;
        })
        .catch(() => {
          this.failures++;
          if (this.failures >= this.maxFailures) {
            this.breakerUntil = Date.now() + this.breakMs;
            this.failures = 0;
          }
        })
        .finally(() => {
          clearTimeout(timer);
          this.inflight = false;
        });
      
  }

  /** 同步弹出一条“新鲜”的结果；过期就丢弃 */
  popIfFresh(currentTick: number): AIAnn | null {
    if (!this.latest) return null;
    if (currentTick - this.latest.tick > this.staleTicks) { this.latest = null; return null; }
    const a = this.latest; this.latest = null; return a;
  }
}
