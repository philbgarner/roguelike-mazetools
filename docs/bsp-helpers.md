# BSP Helpers — `src/bspHelpers.ts`

Shared low-level helpers used by `bsp.ts` and `astar.ts`. Exported for consumers that want to build custom priority queues or heuristics.

---

## Classes

### `MinHeap<T>`

A binary min-heap keyed on a numeric priority. Used by `aStar8` as the open-set priority queue.

```ts
class MinHeap<T> {
  get size(): number

  /** Push a value with a given priority (lower = higher priority). */
  push(priority: number, value: T): void

  /** Remove and return the value with the lowest priority. Returns undefined if empty. */
  pop(): T | undefined

  /** Return the value with the lowest priority without removing it. */
  peek(): T | undefined

  /** Return the priority of the minimum element, or Infinity if empty. */
  peekPriority(): number
}
```

**Example:**

```ts
import { MinHeap } from "./src/bspHelpers";

const heap = new MinHeap<string>();
heap.push(5, "medium");
heap.push(1, "urgent");
heap.push(9, "low");

heap.pop(); // "urgent"
heap.pop(); // "medium"
heap.pop(); // "low"
```

---

## Functions

### `octile(ax, ay, bx, by)`

```ts
function octile(ax: number, ay: number, bx: number, by: number): number
```

Octile distance heuristic for 8-directional grids. Scaled to match integer movement costs: orthogonal = 10, diagonal = 14. Admissible for `aStar8`.

```
octile = 10 * (dx + dy) - 6 * min(dx, dy)
       = 10 * max(dx, dy) + 4 * min(dx, dy)
```

where `dx = |ax - bx|`, `dy = |ay - by|`.

**Example:**

```ts
import { octile } from "./src/bspHelpers";

octile(0, 0, 3, 0); // 30  (3 orthogonal steps)
octile(0, 0, 3, 3); // 42  (3 diagonal steps: 3 × 14)
octile(0, 0, 4, 3); // 52  (3 diagonals + 1 orthogonal: 3×14 + 10)
```
