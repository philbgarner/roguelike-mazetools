export interface Player {
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  attack: number;
  defense: number;
}

export const DEFAULT_PLAYER: Player = {
  hp: 20,
  maxHp: 20,
  xp: 0,
  level: 1,
  attack: 5,
  defense: 1,
};
