// src/pathfinding/minHeap.ts
//
// A minimal binary min-heap keyed on a numeric priority.
// Used by aStar8 as the open-set priority queue.

export class MinHeap<T> {
  private _heap: Array<{ priority: number; value: T }> = [];

  get size(): number {
    return this._heap.length;
  }

  push(priority: number, value: T): void {
    this._heap.push({ priority, value });
    this._bubbleUp(this._heap.length - 1);
  }

  pop(): T | undefined {
    if (this._heap.length === 0) return undefined;
    const top = this._heap[0].value;
    const last = this._heap.pop()!;
    if (this._heap.length > 0) {
      this._heap[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  peek(): T | undefined {
    return this._heap[0]?.value;
  }

  peekPriority(): number {
    return this._heap[0]?.priority ?? Infinity;
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._heap[parent].priority <= this._heap[i].priority) break;
      const tmp = this._heap[parent];
      this._heap[parent] = this._heap[i];
      this._heap[i] = tmp;
      i = parent;
    }
  }

  private _siftDown(i: number): void {
    const n = this._heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this._heap[l].priority < this._heap[smallest].priority) smallest = l;
      if (r < n && this._heap[r].priority < this._heap[smallest].priority) smallest = r;
      if (smallest === i) break;
      const tmp = this._heap[smallest];
      this._heap[smallest] = this._heap[i];
      this._heap[i] = tmp;
      i = smallest;
    }
  }
}
