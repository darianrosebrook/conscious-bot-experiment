# Dashboard sprites

Sprite assets used by the dashboard UI.

## HUD sprites (`hud/`)

Minecraft-style HUD icons for health, hunger, and armor. Sourced from vanilla Minecraft 1.20+ GUI sprites (e.g. `assets/minecraft/textures/gui/sprites/hud/`).

- **Health (hearts)**: `hud/heart/` — `full.png`, `half.png`, `container.png`, plus `*_blinking.png` for animation.
- **Hunger (food)**: `hud/` — `food_full.png`, `food_half.png`, `food_empty.png`; `*_hunger.png` variants for low-health tint.
- **Armor**: `hud/` — `armor_full.png`, `armor_half.png`, `armor_empty.png`.

All are 9x9 PNG; paths are relative to `public/` (e.g. `/sprites/hud/heart/full.png`).
