// src/graphEdgeId.ts
//
// Canonical graph-edge identity for room-graph edges.
// A "gate edge" is defined at the ROOM GRAPH level (roomA <-> roomB),
// not at the tile level.
//
// This module intentionally has no dependencies.

export type GraphEdgeId = string;

export function graphEdgeId(roomA: number, roomB: number): GraphEdgeId {
  const a = roomA | 0;
  const b = roomB | 0;
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return `R${lo}-R${hi}`;
}
