# Examples

## Cave
`Cave/Cave.tsx`

Demonstrates a first-person dungeon viewer built on a cellular automata generator that produces organic, cave-like layouts. The camera operates in continuous free-form mode with mouse look and WASD/Q/E controls, allowing unrestricted exploration of a 60×60 dungeon. Rendering uses instanced textured quads for floors, ceilings, and walls drawn from a procedurally generated tile atlas. A minimap displays multiple overlay modes including solid density, flood-fill region IDs, distance-to-wall heatmap, and hazard mapping.

---

## EotB
`EotB/EotB.tsx`

Presents a classic Eye-of-the-Beholder-style grid-locked first-person dungeon crawler over a BSP-generated rectangular layout. Movement is turn-based with smooth lerp animations — W/S moves forward/backward and A/D rotates 90 degrees — rather than free-form. Demonstrates texture repacking: an external padded spritesheet is loaded and repacked into a clean 3-tile atlas at runtime with remapped UV coordinates. A minimap with the same overlay modes as the Cave example stays synchronized with the camera state.

---

## Mobs
`Mobs/Mobs.tsx`

Extends the EotB viewer with a full turn-based combat system featuring seven monsters of varying difficulty spawned throughout the dungeon. Integrates a turn scheduler, monster AI (idle/alert/chase states), damage and death events, experience points, and floating combat numbers with flash effects. Billboard sprites render monsters in 3D using procedural background removal and upsampling shaders. A sidebar combat log tracks all turn events alongside a minimap that visualizes each monster's current alert state.

---

## Objects
`Objects/Objects.tsx`

Augments the EotB viewer with procedural 3D model spawning — FBX chests and GLB columns — placed throughout the dungeon using custom shader materials for torchlight flicker and band-based distance fog. Chests are placed deterministically in specific rooms; columns are placed in symmetric pairs inside larger chambers, scaled so their caps meet the ceiling height. Demonstrates passing object registries to the rendering system so dynamic 3D geometry is integrated into the first-person view. A modified minimap shows object positions as yellow dots.

---

## Targeting
`Targeting/Targeting.tsx`

Extends the Mobs combat example with an area-of-effect spell system featuring four targeting patterns: single-cell smite, radius fireball, cone blast, and line lightning. Players select spells with 1–4 and cast with F; a dynamic highlight mask renders the target zone directly in the 3D view with a crosshair cursor while a spell is active. Spells create persistent world effects that deal damage-per-turn to monsters inside affected cells across multiple turns. Spell events are tracked separately from melee damage in the combat log.
