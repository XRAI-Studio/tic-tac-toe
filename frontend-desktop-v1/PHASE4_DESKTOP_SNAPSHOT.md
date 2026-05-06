# Cube3 — Desktop-Only Snapshot (Phase 4, v1.0)

This folder is a **frozen snapshot** of the Phase 4 desktop-only frontend captured on **2026-02-18**, just before the Phase 5 mobile-optimization pass was applied to the live `/app/frontend/` folder.

## Why it exists
Phase 5 rewrote `Play.jsx`, `Navbar.jsx`, `Board3D.jsx`, and `index.css` to add a mobile/tablet HUD, safe-area handling, adaptive 3D camera, and 44px touch targets. This snapshot preserves the earlier desktop-only build in case you ever want to:
- Roll back to the fixed desktop HUD (four corner panels)
- Compare phase-over-phase for a presentation
- Fork a desktop-only variant

## What's inside
- `src/` — desktop-only React source (identical to `/app/frontend/src/` at the Phase 4 cutoff)
- `public/`, `craco.config.js`, `postcss.config.js`, `tailwind.config.js`, `package.json`
- **No** `node_modules`, no `build/`, no `yarn.lock` — re-install before running

## How to build / run this snapshot standalone
```bash
cd /app/frontend-desktop-v1
yarn install
# Point at the backend (reuse the live .env or copy it):
cp /app/frontend/.env .env
yarn start   # will clash on port 3000 — stop supervisor's frontend first
```

## How to promote this snapshot back to live
If you ever want the desktop-only build to be the deployed version:
```bash
# Stop live frontend
sudo supervisorctl stop frontend

# Back up mobile version first
mv /app/frontend /app/frontend-mobile-v1

# Promote this snapshot
cp -r /app/frontend-desktop-v1 /app/frontend
cp /app/frontend-mobile-v1/.env /app/frontend/.env
cd /app/frontend && yarn install

# Restart
sudo supervisorctl start frontend
```

## Differences vs. live (Phase 5)
| Area | Desktop snapshot (this folder) | Live Phase 5 (`/app/frontend/`) |
|------|-------------------------------|--------------------------------|
| Play HUD | 4 fixed corner panels | Responsive — corner panels ≥ md, top bar + bottom bar + sheet on mobile |
| Navbar | Always-expanded nav links | Hamburger menu on `< sm` |
| 3D camera | Fixed `[6,5,7]` / fov 42 | Adapts for portrait / tiny-portrait aspect ratios |
| Safe-area insets | none | `env(safe-area-inset-*)` for notches |
| Touch targets | ~28px | ≥ 44px on mobile (WCAG / Apple HIG) |
| `hooks/useIsMobile.js` | not present | present |

Everything else (backends, game logic, AI, replays, auth) is identical.
