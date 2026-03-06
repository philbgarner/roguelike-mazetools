/**
 * Active buff system for time-limited potion effects.
 *
 * Buffs are applied immediately when a potion is consumed and tracked by the
 * number of player move steps remaining.  Each player move decrements all
 * stepsRemaining by 1; when it hits 0 the buff is removed and its stat bonuses
 * are reversed.
 */

export type ActiveBuff = {
  /** Unique instance id (e.g. "buff-<instanceId>"). */
  id: string;
  /** Display name for the buff (e.g. "Power Potion"). */
  name: string;
  /** Steps remaining before the buff expires. */
  stepsRemaining: number;
  bonusAttack: number;
  bonusDefense: number;
  bonusMaxHp: number;
  bonusSpeed: number;
};

/**
 * Tick all active buffs down by one player-move step.
 *
 * Returns the updated (still-active) buff list and a separate list of
 * buffs that just expired.  The caller is responsible for reversing the
 * expired buffs' stat bonuses.
 */
export function tickActiveBuffs(buffs: ActiveBuff[]): {
  updatedBuffs: ActiveBuff[];
  expiredBuffs: ActiveBuff[];
} {
  const updatedBuffs: ActiveBuff[] = [];
  const expiredBuffs: ActiveBuff[] = [];
  for (const buff of buffs) {
    const next = { ...buff, stepsRemaining: buff.stepsRemaining - 1 };
    if (next.stepsRemaining <= 0) {
      expiredBuffs.push(buff); // push original so caller knows how much to reverse
    } else {
      updatedBuffs.push(next);
    }
  }
  return { updatedBuffs, expiredBuffs };
}
