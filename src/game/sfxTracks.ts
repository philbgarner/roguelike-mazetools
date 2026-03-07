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
};

export type SfxKey = keyof typeof SFX_TRACKS;
