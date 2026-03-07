/** Map of track keys to public asset URLs. */
export const MUSIC_TRACKS: Record<string, string> = {
  "dark-woods":
    "/music/JDSherbert - Ambiences Music Pack - Dark Dark Woods.ogg",
  "bloodrat-sewers":
    "/music/JDSherbert - Ambiences Music Pack - Bloodrat Sewers.ogg",
  "frost-mountain":
    "/music/JDSherbert - Ambiences Music Pack - Frost Mountain Aura.ogg",
};

export type MusicTrackKey = keyof typeof MUSIC_TRACKS;
