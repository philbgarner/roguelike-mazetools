// src/game/useTurnEvents.ts
//
// Bridges turn-system events (emitted synchronously inside setState updaters)
// to React component callbacks.
//
// Usage in a component:
//
//   const pendingEventsRef = useRef<TurnEvent[]>([]);
//
//   // Pass to buildDeps:
//   onEvent: (evt) => pendingEventsRef.current.push(evt),
//
//   // Subscribe to events:
//   const { subscribe } = useTurnEvents(pendingEventsRef, turnState);
//
//   useEffect(() => subscribe("damage", (evt) => {
//     push(`-${evt.amount}`, evt.x, evt.y, { color: "#ff4444" });
//   }), [subscribe]);

import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { TurnSystemState } from "../turn/turnSystem";
import type { TurnEvent } from "../turn/turnEvents";

type Handler<K extends TurnEvent["kind"]> = (
  evt: Extract<TurnEvent, { kind: K }>,
) => void;

/**
 * Drains the pending events queue after each turn state change and dispatches
 * events to registered handlers.
 *
 * @param pendingEventsRef  Ref accumulating events pushed by deps.onEvent.
 *                          Declare this ref *before* the turnState useState so
 *                          it is available in the lazy initializer.
 * @param turnState         Used as a useEffect dependency to trigger draining.
 */
export function useTurnEvents(
  pendingEventsRef: MutableRefObject<TurnEvent[]>,
  turnState: TurnSystemState,
) {
  // Map from event kind → set of handlers. Stored in a ref so subscribing /
  // unsubscribing never causes re-renders and handlers are always up-to-date.
  const handlersRef = useRef(
    new Map<string, Set<(evt: TurnEvent) => void>>(),
  );

  // After each turn state change, drain the queue and dispatch to handlers.
  useEffect(() => {
    const events = pendingEventsRef.current.splice(0);
    if (events.length === 0) return;
    for (const evt of events) {
      handlersRef.current.get(evt.kind)?.forEach((h) => h(evt));
    }
  }, [pendingEventsRef, turnState]);

  /**
   * Subscribe to a specific event kind.
   * Returns an unsubscribe function — pass it to useEffect's cleanup:
   *
   *   useEffect(() => subscribe("damage", handler), [subscribe]);
   */
  const subscribe = useCallback(
    <K extends TurnEvent["kind"]>(kind: K, handler: Handler<K>) => {
      let set = handlersRef.current.get(kind);
      if (!set) {
        set = new Set();
        handlersRef.current.set(kind, set);
      }
      set.add(handler as (evt: TurnEvent) => void);
      return () => {
        handlersRef.current.get(kind)?.delete(handler as (evt: TurnEvent) => void);
      };
    },
    [],
  );

  return { subscribe };
}
