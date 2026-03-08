// CP437 glyph picks for dungeon rendering
// Atlas: 32 x 8 grid, 9x14 px per tile, indices 0–255

export const CP437_TILES = {
  // Base terrain
  floor: 46, // '.' classic roguelike floor
  wall: 219, // '█' solid wall

  // Core interactables
  doorClosed: 43, // '+'
  doorOpen: 47, // '/'
  key: 107, // 'k'
  lever: 33, // '!' — toggled ON
  leverOff: 173, // '¡' — toggled OFF (inverted exclamation)
  plate: 95, // '_'
  block: 254, // square
  chest: 36, // '$'

  // Special / optional
  monster: 77, // 'M'
  secretDoor: 35, // '#'
  hiddenPassage: 176, // '░'
  hazard: 126, // '~'

  player: 64, // '@'
  exit: 69, // 'E' — stairs/exit in farthest room
} as const;
