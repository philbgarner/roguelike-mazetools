// src/actions.ts
//
// Action validation middleware pipeline.
// Lets the consuming game register pre-action interceptors (trap triggers,
// door auto-open, teleport pads, action vetoes) without forking the engine
// commit path. Pure middleware pattern, no dungeon state dependencies.

export type ActionKind = string;

export type ActionContext<
  TAction = { kind: ActionKind },
  TActor = unknown,
  TState = unknown,
> = {
  action: TAction;
  actorId: string;
  actor: TActor;
  state: TState;
};

export type ActionMiddlewareResult<TState> =
  | { pass: true; state?: TState }    // allow, optionally with side-effected state
  | { pass: false; reason?: string }; // veto

export type ActionMiddleware<
  TAction = { kind: ActionKind },
  TActor = unknown,
  TState = unknown,
> = (
  ctx: ActionContext<TAction, TActor, TState>,
  next: () => ActionMiddlewareResult<TState>,
) => ActionMiddlewareResult<TState>;

export type ActionPipeline<TAction, TActor, TState> = {
  /** Append a middleware. Middlewares run in registration order. */
  use(middleware: ActionMiddleware<TAction, TActor, TState>): void;

  /**
   * Run all registered middlewares for the given context.
   * Returns the final result after all middlewares have run (or the first veto).
   */
  run(ctx: ActionContext<TAction, TActor, TState>): ActionMiddlewareResult<TState>;
};

/** Create a new empty action pipeline. */
export function createActionPipeline<
  TAction = { kind: ActionKind },
  TActor = unknown,
  TState = unknown,
>(): ActionPipeline<TAction, TActor, TState> {
  const middlewares: ActionMiddleware<TAction, TActor, TState>[] = [];

  return {
    use(middleware) {
      middlewares.push(middleware);
    },
    run(ctx) {
      let i = 0;
      const next = (): ActionMiddlewareResult<TState> => {
        if (i >= middlewares.length) return { pass: true };
        return middlewares[i++](ctx, next);
      };
      return next();
    },
  };
}
