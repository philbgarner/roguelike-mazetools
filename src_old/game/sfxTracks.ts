/** A single SFX entry: either one URL or a series that round-robins on each play. */
export type SfxEntry = string | string[];

/** Map of SFX keys to public asset URL(s). Series entries cycle through each play. */
export const SFX_TRACKS: Record<string, SfxEntry> = {
  "footstep-dirt": [
    "/sfx/Dirt Walk 1.ogg",
    "/sfx/Dirt Walk 2.ogg",
    "/sfx/Dirt Walk 3.ogg",
    "/sfx/Dirt Walk 4.ogg",
    "/sfx/Dirt Walk 5.ogg",
  ],
  "footstep-stone": [
    "/sfx/Stone Walk 1.ogg",
    "/sfx/Stone Walk 2.ogg",
    "/sfx/Stone Walk 3.ogg",
    "/sfx/Stone Walk 4.ogg",
    "/sfx/Stone Walk 5.ogg",
  ],
  "sword-hit": [
    "/sfx/Sword Impact Hit 1.ogg",
    "/sfx/Sword Impact Hit 2.ogg",
    "/sfx/Sword Impact Hit 3.ogg",
  ],
  "bow-hit": [
    "/sfx/Bow Impact Hit 1.ogg",
    "/sfx/Bow Impact Hit 2.ogg",
    "/sfx/Bow Impact Hit 3.ogg",
  ],
  "sword-block": [
    "/sfx/Sword Blocked 1.ogg",
    "/sfx/Sword Blocked 2.ogg",
    "/sfx/Sword Blocked 3.ogg",
  ],
  "sword-equip": [
    "/sfx/Sword Unsheath 1.ogg",
    "/sfx/Sword Unsheath 2.ogg",
  ],
  "sword-unequip": [
    "/sfx/Sword Sheath 1.ogg",
    "/sfx/Sword Sheath 2.ogg",
  ],
  "bow-equip": "/sfx/Bow Take Out 1.ogg",
  "bow-unequip": "/sfx/Bow Put Away 1.ogg",
  "chest-open": [
    "/sfx/Chest Open 1.ogg",
    "/sfx/Chest Open 2.ogg",
  ],
  "chest-close": [
    "/sfx/Chest Close 1.ogg",
    "/sfx/Chest Close 2.ogg",
  ],
  "door-open": [
    "/sfx/Door Open 1.ogg",
    "/sfx/Door Open 2.ogg",
  ],
  "door-close": [
    "/sfx/Door Close 1.ogg",
    "/sfx/Door Close 2.ogg",
  ],
};

export type SfxKey = keyof typeof SFX_TRACKS;
