/** One entry in the atlas — UV coords of its tile in normalised 0‥1 space. */
export type TileEntry = {
  id: number;
  /** Left edge of tile (0..1). */
  uvX: number;
  /** Bottom edge of tile in WebGL convention (0..1, y=0 is bottom). */
  uvY: number;
  uvW: number;
  uvH: number;
};

/**
 * Describes a uniform tilesheet where every tile is the same pixel size.
 * Rows are read top-to-bottom from the source image, but uvY is flipped for
 * WebGL/Three.js (y=0 = bottom of texture).
 */
export type TileAtlas = {
  sheetWidth: number;
  sheetHeight: number;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  getTile(id: number): TileEntry;
};

/**
 * Convert a pixel UV origin (top-left corner of a tile in the atlas image)
 * into a row-major tile ID compatible with `buildTileAtlas`.
 *
 * @param pixelX    Left edge of the tile in pixels (from atlas.json `uv[0]`).
 * @param pixelY    Top edge of the tile in pixels (from atlas.json `uv[1]`).
 * @param tileSize  Tile width/height in pixels (atlas.json `tileSize`).
 * @param sheetWidth Full width of the atlas image in pixels.
 */
export function uvToTileId(
  pixelX: number,
  pixelY: number,
  tileSize: number,
  sheetWidth: number,
): number {
  const columns = Math.floor(sheetWidth / tileSize);
  return Math.floor(pixelY / tileSize) * columns + Math.floor(pixelX / tileSize);
}

/**
 * Build a TileAtlas from sheet dimensions and per-tile pixel size.
 * Tile IDs are row-major: id=0 is top-left, id=columns is start of row 1, etc.
 */
export function buildTileAtlas(
  sheetWidth: number,
  sheetHeight: number,
  tileWidth: number,
  tileHeight: number,
): TileAtlas {
  const columns = Math.floor(sheetWidth / tileWidth);
  const rows = Math.floor(sheetHeight / tileHeight);
  const uvW = tileWidth / sheetWidth;
  const uvH = tileHeight / sheetHeight;

  return {
    sheetWidth,
    sheetHeight,
    tileWidth,
    tileHeight,
    columns,
    rows,
    getTile(id: number): TileEntry {
      const col = id % columns;
      const row = Math.floor(id / columns);
      return {
        id,
        uvX: col * uvW,
        // Flip row: row 0 of the image → top of texture → uvY near 1 in WebGL
        uvY: 1 - (row + 1) * uvH,
        uvW,
        uvH,
      };
    },
  };
}
