// src/messages.ts
import { Announcement, OutgoingAnnouncement } from "./types";

export class MessageHub {
  private feed: Announcement[] = [];

  post(out: OutgoingAnnouncement, tick: number): Announcement {
    const a: Announcement = { tick, agentId: out.agentId, text: out.text, stance: out.stance };
    this.feed.push(a);
    return a;
  }

  // 取最近 windowTicks 内的公告
  recent(currentTick: number, windowTicks: number): Announcement[] {
    const from = currentTick - windowTicks;
    return this.feed.filter(a => a.tick >= from);
  }
}
