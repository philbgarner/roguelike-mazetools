// --------------------------------
// Atlas entry types
// --------------------------------

/** A tile entry with UV pixel coordinates in the atlas sheet. */
export type AtlasEntry = {
  id: number;
  name: string;
  uv: [number, number];
};

/** Sprite entry — may have a non-square size in pixels. */
export type AtlasSpriteEntry = {
  id: number;
  name: string;
  uv: [number, number];
  /** Pixel dimensions [w, h]. Omitted when the tile is tileSize × tileSize. */
  size?: [number, number];
};

/**
 * Floor/wall "typed" entry. id 0 ("none") has no uv and means "use no tile".
 * All other ids have a uv.
 */
export type AtlasTypedEntry =
  | { id: 0; name: string }
  | { id: number; name: string; uv: [number, number] };

// --------------------------------
// Full atlas shape
// --------------------------------

export type AtlasData = {
  tileSize: number;
  architecture: AtlasEntry[];
  floorTypes: AtlasTypedEntry[];
  wallTypes: AtlasTypedEntry[];
  ceilingTypes: AtlasTypedEntry[];
  overlays: AtlasEntry[];
  wallOverlays: AtlasEntry[];
  ceilingOverlays: AtlasEntry[];
  water: AtlasEntry[];
  sprites: AtlasSpriteEntry[];
  aoOverlays: AtlasEntry[];
};

// --------------------------------
// Lookup helper
// --------------------------------

export type AtlasLookup<T extends { id: number; name: string }> = {
  /** Returns the full entry or undefined if the name is not found. */
  byName(name: string): T | undefined;
  /**
   * Returns the numeric id for the given tile name.
   * Returns 0 (none/no-tile) if the name is not found.
   */
  idByName(name: string): number;
};

function makeLookup<T extends { id: number; name: string }>(
  entries: T[],
): AtlasLookup<T> {
  const map = new Map<string, T>(entries.map((e) => [e.name, e]));
  return {
    byName: (name) => map.get(name),
    idByName: (name) => map.get(name)?.id ?? 0,
  };
}

// --------------------------------
// AtlasIndex
// --------------------------------

/** Pre-built name→entry lookup tables for every atlas category. */
export type AtlasIndex = {
  data: AtlasData;
  architecture: AtlasLookup<AtlasEntry>;
  floorTypes: AtlasLookup<AtlasTypedEntry>;
  wallTypes: AtlasLookup<AtlasTypedEntry>;
  ceilingTypes: AtlasLookup<AtlasTypedEntry>;
  overlays: AtlasLookup<AtlasEntry>;
  wallOverlays: AtlasLookup<AtlasEntry>;
  ceilingOverlays: AtlasLookup<AtlasEntry>;
  water: AtlasLookup<AtlasEntry>;
  sprites: AtlasLookup<AtlasSpriteEntry>;
  aoOverlays: AtlasLookup<AtlasEntry>;
};

/**
 * Build an AtlasIndex from the raw atlas.json data.
 *
 * @example
 * import atlasJson from "../public/textures/atlas.json";
 * const atlas = buildAtlasIndex(atlasJson as AtlasData);
 * const floorId = atlas.floorTypes.idByName("Cobblestone"); // 1
 */
export function buildAtlasIndex(data: AtlasData): AtlasIndex {
  return {
    data,
    architecture: makeLookup(data.architecture),
    floorTypes: makeLookup(data.floorTypes as (AtlasTypedEntry & { id: number; name: string })[]),
    wallTypes: makeLookup(data.wallTypes as (AtlasTypedEntry & { id: number; name: string })[]),
    ceilingTypes: makeLookup(data.ceilingTypes as (AtlasTypedEntry & { id: number; name: string })[]),
    overlays: makeLookup(data.overlays),
    wallOverlays: makeLookup(data.wallOverlays),
    ceilingOverlays: makeLookup(data.ceilingOverlays),
    water: makeLookup(data.water),
    sprites: makeLookup(data.sprites),
    aoOverlays: makeLookup(data.aoOverlays),
  };
}
