# Action Middleware — `src/actions.ts`

Pre-action interceptor pipeline. Lets the consuming game register middlewares (trap triggers, door auto-open, teleport pads, action vetoes) without forking the engine commit path. Pure middleware pattern — no dungeon or engine state dependencies.

---

## Types

### `ActionKind`

```ts
type ActionKind = string;
```

### `ActionContext<TAction, TActor, TState>`

```ts
type ActionContext<
  TAction = { kind: ActionKind },
  TActor = unknown,
  TState = unknown,
> = {
  action: TAction;
  actorId: string;
  actor: TActor;
  state: TState;
};
```

### `ActionMiddlewareResult<TState>`

```ts
type ActionMiddlewareResult<TState> =
  | { pass: true; state?: TState }     // allow; optionally with side-effected state
  | { pass: false; reason?: string };  // veto
```

### `ActionMiddleware<TAction, TActor, TState>`

```ts
type ActionMiddleware<TAction, TActor, TState> = (
  ctx: ActionContext<TAction, TActor, TState>,
  next: () => ActionMiddlewareResult<TState>,
) => ActionMiddlewareResult<TState>;
```

### `ActionPipeline<TAction, TActor, TState>`

```ts
type ActionPipeline<TAction, TActor, TState> = {
  /** Append a middleware. Middlewares run in registration order. */
  use(middleware: ActionMiddleware<TAction, TActor, TState>): void;

  /**
   * Run all registered middlewares for the given context.
   * Returns the final result after all middlewares have run, or the first veto.
   */
  run(ctx: ActionContext<TAction, TActor, TState>): ActionMiddlewareResult<TState>;
};
```

---

## Functions

### `createActionPipeline<TAction, TActor, TState>()`

```ts
function createActionPipeline<
  TAction = { kind: ActionKind },
  TActor = unknown,
  TState = unknown,
>(): ActionPipeline<TAction, TActor, TState>
```

Create a new empty action pipeline. Middlewares are run in registration order (FIFO).

---

## Examples

### Basic setup

```ts
import { createActionPipeline } from "./src/actions";

type MyAction = { kind: "move"; x: number; y: number } | { kind: "attack"; targetId: string };
type MyState = TurnSystemState;

const pipeline = createActionPipeline<MyAction, PlayerActor, MyState>();
```

### Trap middleware

```ts
pipeline.use((ctx, next) => {
  if (ctx.action.kind === "move") {
    const hazard = masks.getHazard(ctx.action.x, ctx.action.y);
    if (hazard !== 0) {
      triggerTrap(hazard, ctx.actorId); // fire trap side-effect
    }
  }
  return next(); // allow the move to proceed regardless
});
```

### Veto middleware (faction guard)

```ts
pipeline.use((ctx, next) => {
  if (ctx.action.kind === "attack") {
    const target = ctx.state.actors[ctx.action.targetId];
    if (!factions.isHostile(ctx.actor.faction, target.faction)) {
      return { pass: false, reason: "cannot attack a non-hostile faction" };
    }
  }
  return next();
});
```

### Middleware that transforms state

```ts
pipeline.use((ctx, next) => {
  const result = next();
  if (result.pass && ctx.action.kind === "move") {
    // Automatically open any door the player walked through
    const newState = openDoorAt(result.state ?? ctx.state, ctx.action.x, ctx.action.y);
    return { pass: true, state: newState };
  }
  return result;
});
```

### Replacing `commitPlayerAction`

```ts
// Before:
setTurnState(prev => commitPlayerAction(prev, deps, action));

// After:
const result = pipeline.run({
  action,
  actorId: "player",
  actor: turnState.actors["player"] as PlayerActor,
  state: turnState,
});

if (result.pass) {
  setTurnState(prev =>
    commitPlayerAction(result.state ?? prev, deps, action)
  );
}
```

---

## Notes

- Middlewares run in registration order. The first `{ pass: false }` result short-circuits all subsequent middlewares — later `use()` calls are not reached.
- Calling `next()` delegates to the next middleware; not calling it effectively vetoes the action silently (return `{ pass: false }` explicitly for clarity).
- `result.state` is optional — middlewares that only observe (not transform) state should omit it or return it unchanged.
- The pipeline is generic: swap `TAction`, `TActor`, `TState` to match your game's action and state types.
