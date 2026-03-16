// src/turn/turnScheduler.ts
//
// RogueBasin-style priority queue scheduler using absolute timestamps.
//
// Key design: store absolute timestamps (not relative delays) to avoid O(n)
// adjustment per tick. Lazy cancellation handles removal efficiently.
//
// Reference: https://roguebasin.com/index.php/A_priority_queue_based_turn_scheduling_system

import { MinHeap } from "../bspHelpers";
import type { ActorId } from "./turnTypes";

type Scheduled = {
  actorId: ActorId;
  at: number;
  seq: number;
};

export class TurnScheduler {
  private heap: MinHeap<Scheduled> = new MinHeap();
  private now: number = 0;
  private seq: number = 0;
  private cancelled: Set<ActorId> = new Set();

  /** Schedule an actor to act at now + delay. */
  add(actorId: ActorId, delay: number): void {
    const at = this.now + delay;
    const seq = this.seq++;
    const priority = at + (seq % 1_000_000) / 1_000_000;
    this.heap.push(priority, { actorId, at, seq });
  }

  /** Lazily remove an actor from the schedule. */
  remove(actorId: ActorId): void {
    this.cancelled.add(actorId);
  }

  /** Re-add a cancelled actor (un-cancels it too). */
  restore(actorId: ActorId): void {
    this.cancelled.delete(actorId);
  }

  /**
   * Pop the next actor whose turn it is.
   * Advances now to the actor's scheduled time.
   * Returns null if the schedule is empty.
   */
  next(): { actorId: ActorId; now: number } | null {
    while (this.heap.size > 0) {
      const entry = this.heap.pop()!;
      if (this.cancelled.has(entry.actorId)) {
        this.cancelled.delete(entry.actorId);
        continue;
      }
      this.now = entry.at;
      return { actorId: entry.actorId, now: this.now };
    }
    return null;
  }

  /** Re-schedule an actor after it has acted. */
  reschedule(actorId: ActorId, delay: number): void {
    this.add(actorId, delay);
  }

  getNow(): number {
    return this.now;
  }

  get size(): number {
    return this.heap.size;
  }
}
