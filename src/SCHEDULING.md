## Turn-taking module plan (Priority-queue scheduler, RogueBasin-style)

This plan adds a **runtime turn system** that owns:

* a **player actor**
* a **monster actor list** (from your existing `resolveSpawns` pipeline)
* a **priority-queue scheduler** implementing the RogueBasin “delay per action / fastest acts more often” approach ([roguebasin.com][1])

It’s designed to be **generator-independent** (like `src/dungeonState.ts`) and to work with both:

* `src/api/generateDungeon.ts` (preferred: already returns `resolved.monsters`) and
* the current `src/examples/MinimalExample.tsx` (fallback: can still be wired later).

---

# 1) New folder + files

Create a new folder:

### `src/turn/`

### 1.1 `src/turn/turnTypes.ts`

**Goal:** shared types for actors, actions, and the turn loop boundary.

Symbols to add:

* `export type ActorId = string;`

* `export type ActorKind = "player" | "monster";`

* `export type ActorBase = {`

  * `id: ActorId;`
  * `kind: ActorKind;`
  * `x: number; y: number;`
  * `speed: number;` *(>0; used to compute delay)*
  * `alive: boolean;`
  * `blocksMovement: boolean;`
    `};`

* `export type PlayerActor = ActorBase & { kind: "player" };`

* `export type MonsterActor = ActorBase & { kind: "monster"; spawnId: string; danger: number; roomId: number };`

* `export type TurnActionKind = "wait" | "move" | "attack" | "interact";`

* `export type TurnAction = {`

  * `kind: TurnActionKind;`
  * `dx?: number; dy?: number;` *(for move)*
  * `targetId?: ActorId;` *(for attack)*
  * `meta?: Record<string, unknown>;` *(future hooks, e.g. door/lever ids)*
    `};`

* `export type ActionCost = { time: number };`

  * This is the “delay” value used by the scheduler (RogueBasin calls it “delay between actions”; faster = smaller delay) ([roguebasin.com][1])

---

### 1.2 `src/turn/turnScheduler.ts`

**Goal:** implement the RogueBasin scheduling algorithm using a priority queue.

RogueBasin’s write-up describes:

* each event/creature has a **delay** based on speed
* you pop the smallest delay item
* time advances and the actor is reinserted with its delay ([roguebasin.com][1])

**Important implementation detail for your codebase:** you already have `src/pathfinding/minHeap.ts` (a binary min-heap). Rather than “subtract time from every element” (O(n) adjust), store **absolute timestamps**.

Symbols to add:

#### `export class TurnScheduler`

Internal storage:

* `private heap: MinHeap<Scheduled>;` (reuse `MinHeap` from `src/pathfinding/minHeap.ts`)
* `private now: number = 0;`
* `private seq: number = 0;` *(stable tie-break for identical times)*

Where:

* `type Scheduled = { actorId: ActorId; at: number; seq: number };`

Key methods:

* `add(actorId: ActorId, delay: number): void`

  * schedule at `this.now + delay`
* `remove(actorId: ActorId): void`

  * easiest/robust approach: **lazy cancellation**:

    * keep `private cancelled = new Set<ActorId>()`
    * on `remove()`, add to set
    * on `next()`, skip cancelled entries
* `next(): { actorId: ActorId; now: number } | null`

  * pop min `at`, set `this.now = at`, return actorId
* `reschedule(actorId: ActorId, delay: number): void`

  * calls `add(actorId, delay)` after acting
* `getNow(): number`

Tie-breaking:

* heap priority should be composite `(at, seq)`:

  * easiest: store `priority = at * 1e6 + (seq % 1e6)`
  * or store two heaps; but simplest is a composite numeric priority since `MinHeap` accepts a number.
* Always increment `seq` on insert so equal `at` preserves insertion order (RogueBasin’s queue keeps insertion order for equal priorities) ([roguebasin.com][1])

---

### 1.3 `src/turn/turnSystem.ts`

**Goal:** a high-level “game loop brain” that:

* owns actors (player + monsters)
* owns a `TurnScheduler`
* pauses when it’s the player’s turn (UI-driven)
* auto-plays monsters (AI callback)

Symbols:

#### `export type TurnSystemState = {`

* `actors: Record<ActorId, PlayerActor | MonsterActor>;`
* `playerId: ActorId;`
* `scheduler: TurnScheduler;`
* `awaitingPlayerInput: boolean;`
* `activeActorId: ActorId | null;`
  `};`

#### `export type TurnSystemDeps = {`

* `dungeon: BspDungeonOutputs;`
* `content: ContentOutputs;`
* `runtime: DungeonRuntimeState;` *(from `src/dungeonState.ts`)*
* `isWalkable: (x:number,y:number) => boolean;`
* `monsterDecide: (state, monsterId) => TurnAction;` *(simple default AI can be “wait” initially)*
* `computeCost: (actorId, action) => ActionCost;`
* `applyAction: (state, actorId, action) => TurnSystemState;`
  `};`

#### `export function createTurnSystemState(...)`

* Build actors + initialize scheduler:

  * schedule every actor initially with its normal delay (RogueBasin notes this keeps the initial order consistent) ([roguebasin.com][1])

#### `export function tickUntilPlayer(state, deps): TurnSystemState`

* Loop:

  * `evt = scheduler.next()`
  * if actor dead/removed: continue
  * if actor is player:

    * set `awaitingPlayerInput=true`, `activeActorId=playerId`, stop
  * else:

    * `action = deps.monsterDecide(...)`
    * `cost = deps.computeCost(monsterId, action)`
    * `state = deps.applyAction(state, monsterId, action)`
    * `scheduler.reschedule(monsterId, cost.time)`

#### `export function commitPlayerAction(state, deps, action): TurnSystemState`

* Preconditions: `awaitingPlayerInput === true`
* Apply player action, reschedule player with cost, then call `tickUntilPlayer()` again.

This split cleanly supports React:

* hover/inspect doesn’t advance turns
* only a committed click/keypress does

---

### 1.4 `src/turn/createActors.ts`

**Goal:** deterministic conversion from your generator output into runtime actors.

Symbols:

#### `export function createPlayerActor(startX, startY): PlayerActor`

* `id: "player"` (or `player:${seed}` if you want multi-floor later)
* default `speed = 10` (or 1; but match your tuning)

#### `export function createMonstersFromResolved(resolved: ResolvedSpawns | null): MonsterActor[]`

* If `resolved` is null (theme-less path), return `[]`
* Otherwise:

  * map `resolved.monsters[]` → MonsterActor
  * use `entityId` as `id`
  * set `x,y, roomId, danger, spawnId`
  * choose `speed` deterministically from spawnId/danger (example policy):

    * `speed = clamp(1, 10, 4 + danger)` (placeholder tuning)

---

# 2) Where this plugs into the existing repo

### 2.1 Use the API result shape (preferred)

You already have `src/api/generateDungeon.ts` returning:

* `content`
* `theme`
* `resolved` spawns (monsters etc.)

Plan edit:

#### `src/examples/MinimalExample.tsx`

Add an alternate path (doesn’t need to replace your current movement code immediately):

* Switch dungeon generation to `generateDungeon()` (from `src/api/generateDungeon.ts`) so you have `result.resolved`.
* Call:

  * `computeStartCell(dungeon, content)` (already present)
  * `createPlayerActor(start.x, start.y)`
  * `createMonstersFromResolved(result.resolved)`
  * `createTurnSystemState(...)`
* Replace “direct setPlayer on keypress” with:

  * if it’s player’s turn, commit a move action
  * otherwise ignore input

This will make the module usable without reworking the generator.

### 2.2 Keep it aligned with your existing runtime puzzle state

Your runtime puzzle state lives in `src/dungeonState.ts` and is mutated by “actions” (e.g. lever toggles, door states, etc.). The turn system should *not* replace it—just **sequence** it.

Plan edit:

#### `src/dungeonState.ts` (no behavior change required initially)

* Only add a tiny integration helper if desired:

  * `export function applyRuntimeSideEffectsForMove(...)`
  * but this can also live in `turnSystem.ts` to avoid coupling.

---

# 3) Core scheduling math (shared tuning constants)

Add:

### `src/turn/actionCosts.ts`

Symbols:

* `export const BASE_TIME = 10;` (mirrors RogueBasin’s example constant) ([roguebasin.com][1])
* `export function actionDelay(speed: number, action: TurnAction): number`

  * baseline: `BASE_TIME / speed`
  * modifiers:

    * move: `* 1.0`
    * attack: `* 2.0` (RogueBasin suggests varying delay by action type) ([roguebasin.com][1])
    * wait: `* 1.0`

This keeps all timing policy in one place.

---

# 4) Minimal AI (phase 1) + upgrade path (phase 2)

### Phase 1 (ship the infrastructure)

* `monsterDecide`: always `{ kind: "wait" }` or random step if walkable
* `applyAction`:

  * move changes actor x/y if walkable and not occupied
  * attack can be stubbed (no damage yet)

### Phase 2 (use your existing A*)

You already have:

* `src/pathfinding/aStar8.ts`

Upgrade plan:

* Add `src/turn/monsterAI.ts`:

  * `decideChasePlayer(...)` uses `aStar8` to compute next step toward player
  * action = `move(dx,dy)` for first step
* Later, if you want “awareness by biome/level”, you can feed that into speed/cost or AI selection.

---

# 5) Determinism + debugging hooks

Add optional diagnostics:

### `src/turn/turnDebug.ts`

* `export type TurnLogEntry = { t:number; actorId:ActorId; action:TurnAction; cost:number }`
* In `TurnSystemState`, optionally store `log: TurnLogEntry[]` (bounded ring buffer)

This will match your project’s diagnostic-first approach and help validate “speed ratios produce turn ratios” (RogueBasin’s “observations” section) ([roguebasin.com][1])

---

# 6) Suggested implementation order (small, testable commits)

1. **Scheduler only**

* Add `turnTypes.ts`, `turnScheduler.ts`, `actionCosts.ts`
* Add a tiny in-app “console demo” function (since no test runner) to verify that speed ratios behave as expected ([roguebasin.com][1])

2. **Actors + turn system**

* Add `createActors.ts`, `turnSystem.ts`
* Add a minimal “wait-only AI” and “move-only player” applyAction

3. **Wire into MinimalExample**

* Use `generateDungeon()` so you can spawn monsters from `resolved`
* Render monsters as glyphs (even if static) and advance AI turns until player’s turn

4. **Upgrade AI with A***

* Add `monsterAI.ts` using `aStar8`

---
[1]: https://roguebasin.com/index.php/A_priority_queue_based_turn_scheduling_system "A priority queue based turn scheduling system - RogueBasin"
