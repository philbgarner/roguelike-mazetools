# Field of View — `src/fov.ts`

Recursive shadowcasting FOV (Björn Bergström's algorithm). Covers all 8 octants. O(r²) with no heap allocations — safe to call every turn per actor.

---

## Types

### `FovOptions`

```ts
type FovOptions = {
  /**
   * Return true if the cell blocks light (usually: solid !== 0).
   * Called with every candidate cell during the octant sweep.
   * Should return true for out-of-bounds coordinates.
   */
  isOpaque: (x: number, y: number) => boolean;

  /**
   * Called once per visible cell, including the origin itself.
   * Use this to write to a visibility mask, reveal map tiles, etc.
   */
  visit: (x: number, y: number) => void;

  /** Chebyshev radius. Cells beyond this distance are never visited. Default: 1024. */
  radius?: number;
};
```

---

## Functions

### `computeFov(originX, originY, options)`

```ts
function computeFov(
  originX: number,
  originY: number,
  options: FovOptions,
): void
```

Compute the set of cells visible from `(originX, originY)` using recursive shadowcasting across all 8 octants. Always visits the origin cell itself.

### `createVisibilityMask(width, height)`

```ts
function createVisibilityMask(width: number, height: number): Uint8Array
```

Allocate a zeroed `Uint8Array` of size `width × height`. Convenience helper — callers that already maintain their own mask don't need this.

---

## Examples

### Fog of war

```ts
import { computeFov, createVisibilityMask } from "./src/fov";

const W = dungeon.width;
const H = dungeon.height;
const solidData = dungeon.textures.solid.image.data as Uint8Array;

// Allocate (or reuse) visibility mask
const visibleNow = createVisibilityMask(W, H);
visibleNow.fill(0); // clear each frame

computeFov(player.x, player.y, {
  isOpaque: (x, y) =>
    x < 0 || y < 0 || x >= W || y >= H || solidData[y * W + x] !== 0,
  visit: (x, y) => {
    visibleNow[y * W + x] = 1;
    revealed[y * W + x] = 1; // also track ever-seen cells
  },
  radius: 12,
});
```

### Per-monster vision (hide monsters outside FOV)

```ts
const playerVisible = createVisibilityMask(dungeon.width, dungeon.height);

computeFov(player.x, player.y, {
  isOpaque: (x, y) => {
    if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) return true;
    return solidData[y * dungeon.width + x] !== 0;
  },
  visit: (x, y) => { playerVisible[y * dungeon.width + x] = 1; },
  radius: 10,
});

const visibleMonsters = monsters.filter(m => playerVisible[m.y * dungeon.width + m.x]);
```

### Multiple sight origins (e.g. torches)

```ts
// computeFov is cheap — call it once per light source
for (const torch of torches) {
  computeFov(torch.x, torch.y, {
    isOpaque: (x, y) => ...,
    visit: (x, y) => { lightMask[y * W + x] = 1; },
    radius: torch.range,
  });
}
```

---

## Notes

- The algorithm uses recursive calls rather than a heap, so no dynamic allocation occurs after setup. Stack depth is bounded by `radius`.
- Penumbra (partial visibility at shadow edges) is handled correctly by the octant slope tracking.
- Walls at the edge of `radius` are visited (you can see the wall you're standing next to), but cells beyond `radius` are not.
- `isOpaque` **must** return `true` for out-of-bounds coordinates to prevent the algorithm from walking off the grid.
