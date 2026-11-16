# Credits and asset sources

Breachline uses **no paid assets and no downloaded assets**. Every model, texture, sound and icon
is generated procedurally by code in this repository. The only third-party material is two
open-source JavaScript libraries, vendored in `vendor/`.

## Third-party code shipped with the game

| Library | Version | Licence | Where | Used for |
|---|---|---|---|---|
| [Three.js](https://threejs.org/) | r170 (0.170.0) | MIT — `vendor/THREE-LICENSE` | `vendor/three.module.min.js` | WebGL rendering |
| [PeerJS](https://peerjs.com/) | 1.5.5 | MIT — `vendor/PEERJS-LICENSE` | `vendor/peerjs.min.js` | WebRTC data-channel connections and signalling |

Both files are unmodified copies from the official npm packages (`npm run vendor` re-copies them
after `npm install`).

## Services

| Service | Used for | Notes |
|---|---|---|
| PeerJS Cloud (`0.peerjs.com`) | Signalling for the default `peerjs` backend | Free public broker run by the PeerJS project. Only connection setup goes through it; game traffic is peer-to-peer. You can point the game at your own PeerServer in `src/config.js`. |
| Cloudflare Workers + Durable Objects | Optional relay backend (`server/cloudflare`) | Only if you deploy it yourself. |

## Development-only tools (not shipped, not required to play)

| Tool | Licence | Used for |
|---|---|---|
| [peer](https://github.com/peers/peerjs-server) (PeerServer) | MIT | Local signalling server for the WebRTC browser test |
| [Playwright](https://playwright.dev/) | Apache-2.0 | End-to-end browser test (`tools/test-browser.mjs`); install separately |
| [Wrangler](https://developers.cloudflare.com/workers/wrangler/) | MIT / Apache-2.0 | Running and deploying the relay Worker; fetched by `npx` |

## Assets — all procedural, generated at runtime

| Asset type | Source | Generated in |
|---|---|---|
| Map geometry (3 maps) | Original; authored as code from axis-aligned boxes | `src/game/maps/*.js` |
| Surface textures (brick, concrete, asphalt, metal, wood, sand, …) | Painted onto canvases with noise and simple patterns | `src/render/textures.js` |
| Sky, sun and fog | Shader gradient | `src/render/worldmesh.js` |
| Weapon models, attachments, grenade, first-person arms | Built from boxes and cylinders | `src/render/gunmodels.js` |
| Soldier models and animation | Built from boxes; procedural walk / crouch / death poses | `src/render/characters.js` |
| Muzzle flash, tracers, particles, decals, explosions | Generated sprites and geometry | `src/render/effects.js`, `src/render/textures.js` |
| All sound effects (gunfire, reloads, footsteps, explosions, hit markers, UI) | Synthesised with the Web Audio API (filtered noise + oscillators) | `src/core/audio.js` |
| UI, HUD, icons, favicon | HTML/CSS and an inline SVG | `index.html`, `css/style.css`, `src/ui/*.js` |
| Fonts | None bundled; the UI uses the system font stack (Inter is used if the player already has it installed) | `css/style.css` |

No CC0 or other third-party models, textures, sounds, music or fonts are included, so there is
nothing further to attribute.

## Names

Weapon, map and character names are fictional. Any resemblance to real products is generic to the
genre (e.g. "assault rifle", "9 mm pistol").

## Licence of this project

No licence file has been added for the game's own code. If you publish the repository and want
others to be able to reuse it, add a licence of your choice (MIT would match the bundled
libraries).
