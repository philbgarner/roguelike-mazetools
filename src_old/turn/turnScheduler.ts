// src/turn/turnScheduler.ts
//
// RogueBasin-style priority queue scheduler using absolute timestamps.
// Reuses MinHeap from src/pathfinding/minHeap.ts.
//
// Key design: store absolute timestamps (not relative delays) to avoid O(n)
// adjustment per tick. Lazy cancellation handles removal efficiently.
//
// Reference: https://roguebasin.com/index.php/A_priority_queue_based_turn_scheduling_system

import { MinHeap } from "../pathfinding/minHeap";
import type { ActorId } from "./turnTypes";

type Scheduled = {
  actorId: ActorId;
  at: number;
  seq: number;
};

export class TurnScheduler {
  private heap: MinHeap<Scheduled> = new MinHeap();
  private now: number = 0;
  /** Monotonically increasing sequence number for stable tie-breaking. */
  private seq: number = 0;
  /** Actors pending removal; skipped on next(). */
  private cancelled: Set<ActorId> = new Set();

  /**
   * Schedule an actor to act at now + delay.
   * Lower delay = acts sooner (faster actors have smaller delays).
   */
  add(actorId: ActorId, delay: number): void {
    const at = this.now + delay;
    const seq = this.seq++;
    // Composite priority: at (major) + fractional seq (minor tie-break).
    // seq is bounded mod 1e6 so the fractional part stays < 1.
    const priority = at + (seq % 1_000_000) / 1_000_000;
    this.heap.push(priority, { actorId, at, seq });
  }

  /**
   * Lazily remove an actor from the schedule.
   * Cancelled actors are skipped when they surface in next().
   */
  remove(actorId: ActorId): void {
    this.cancelled.add(actorId);
  }

  /**
   * Re-add a cancelled actor to the schedule (un-cancels it too).
   */
  restore(actorId: ActorId): void {
    this.cancelled.delete(actorId);
  }

  /**
   * Pop the next actor whose turn it is.
   * Advances now to the actor's scheduled time.
   * Skips cancelled entries.
   * Returns null if the schedule is empty.
   */
  next(): { actorId: ActorId; now: number } | null {
    while (this.heap.size > 0) {
      const entry = this.heap.pop()!;
      if (this.cancelled.has(entry.actorId)) {
        // Clean up the cancellation record once consumed.
        this.cancelled.delete(entry.actorId);
        continue;
      }
      this.now = entry.at;
      return { actorId: entry.actorId, now: this.now };
    }
    return null;
  }

  /**
   * Re-schedule an actor after it has acted.
   * Call this after consuming the actor via next() and applying its action.
   */
  reschedule(actorId: ActorId, delay: number): void {
    this.add(actorId, delay);
  }

  getNow(): number {
    return this.now;
  }

  /** Number of pending entries (includes cancelled-but-not-yet-consumed). */
  get size(): number {
    return this.heap.size;
  }
}
