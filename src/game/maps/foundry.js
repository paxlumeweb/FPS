// FOUNDRY — industrial warehouse.
// 90 x 68 m playable. A large warehouse (48 x 36 m) with a catwalk ring, a central spine bridge,
// container stacks and racking inside; container yards outside on both team sides, a truck lane to
// the north and a tank farm to the south. Skylight gaps in the roof let sun stripes onto the floor.
// The west half is authored by hand and mirrored (180° rotation) for balanced sides.

import { MapBuilder } from './builder.js';

const STEEL = 0x6f7f8c;

export function buildFoundry() {
  const b = new MapBuilder('foundry', 'Foundry');
  b.desc = 'Industrial warehouse. Close-quarters floor fights under a catwalk ring, with open container yards outside.';
  b.env = {
    skyTop: 0x4878ad, skyHorizon: 0xc4d6e0, sunColor: 0xfff3dc, sunDir: [0.32, 0.88, 0.34], sunIntensity: 3.0,
    hemiSky: 0xd4e2ff, hemiGround: 0x6a655c, hemiIntensity: 1.7, fogColor: 0xb9c9d3, fogNear: 60, fogFar: 300, exposure: 1.05, envIntensity: 0.65, vmLight: 0.9,
  };

  /** Pallet racking: solid goods at the bottom, open shelves with boxes above. Runs along X. */
  const rack = (x0, x1, z, depth = 1.0) => {
    b.box(x0, 0.1, z, x1, 1.5, z + depth, 'wood', { tint: 0xb9a27a });
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 2.6))) b.box(x - 0.06, 1.5, z, x + 0.06, 4.6, z + depth, 'metalYellow');
    for (const y of [3.0, 4.5]) b.box(x0, y, z, x1, y + 0.1, z + depth, 'metalDark');
    let i = 0;
    for (let x = x0 + 0.4; x < x1 - 1.2; x += 1.9) { i++; if (i % 3 !== 0) b.box(x, 1.5, z + 0.1, x + 1.2, 2.5, z + depth - 0.1, i % 2 ? 'wood' : 'woodDark'); if (i % 2) b.box(x + 0.2, 3.1, z + 0.1, x + 1.3, 3.9, z + depth - 0.1, 'woodDark'); }
  };

  // ---------- ground (west half) ----------
  b.box(-52, -1, -41, 0, 0, 41, 'asphalt');
  b.box(-23.6, 0, -17.6, 0, 0.1, 17.6, 'floorIndustrial');
  for (let z = -30; z <= 30; z += 12) b.decor(-44, 0, z - 0.1, -26, 0.015, z + 0.1, 'hazard');

  // ---------- perimeter (west half) ----------
  b.box(-46, 0, -35, 0, 5.5, -34, 'concrete'); b.box(-46, 5.5, -35.1, 0, 5.8, -33.9, 'concreteDark');
  b.box(-46, 0, -35, -45, 5.5, 35, 'concrete'); b.box(-46.1, 5.5, -35, -44.9, 5.8, 35, 'concreteDark');
  b.box(-46, 0, 34, 0, 5.5, 35, 'concrete'); b.box(-46, 5.5, 33.9, 0, 5.8, 35.1, 'concreteDark');
  // distant industrial skyline behind the wall
  b.facade(-52, -41, -30, -36, 13, 'concrete', 's', { floorH: 4 });
  b.box(-26, 0, -41, -18, 18, -36.5, 'rust'); b.box(-14, 0, -41, -6, 15, -36.5, 'metal');
  b.facade(-52, -34, -47, -8, 11, 'brickDark', 'e', { floorH: 4 });
  b.box(-52, 0, -4, -47.5, 16, 6, 'rust'); b.facade(-52, 10, -47, 34, 12, 'concrete', 'e', { floorH: 4 });
  b.facade(-52, 36, -26, 41, 12, 'brickDark', 'n', { floorH: 4 }); b.box(-20, 0, 36.5, -10, 17, 41, 'metal'); b.box(-6, 0, 36.5, 0, 12, 41, 'rust');

  // ---------- warehouse shell (west half) ----------
  // west wall: two roller doors, a personnel door, an upper door from the fire escape, clerestory windows
  const westOpen = [[-12, -8, 0, 3.6], [8, 12, 0, 3.6], [-0.7, 0.7, 0, 2.2], [-0.7, 0.7, 4, 6.2], [-16, -13, 5, 6.6], [-5.5, -2.5, 5, 6.6], [2.5, 5.5, 5, 6.6], [13, 16, 5, 6.6]];
  b.wallZ(-18, 18, -24, 0, 1.2, 0.4, 'concrete', westOpen);
  b.wallZ(-18, 18, -24, 1.2, 9, 0.4, 'container', westOpen, { tint: STEEL });
  // north wall (x < 0): roller door + windows;  south wall (x < 0): roller door + windows
  const northOpen = [[-16, -12, 0, 3.6], [-8, -5, 5, 6.6], [-22, -19, 5, 6.6]];
  b.wallX(-23.6, 0, -18, 0, 1.2, 0.4, 'concrete', northOpen);
  b.wallX(-23.6, 0, -18, 1.2, 9, 0.4, 'container', northOpen, { tint: STEEL });
  const southOpen = [[-8, -4, 0, 3.6], [-20, -17, 5, 6.6], [-13, -10, 5, 6.6]];
  b.wallX(-23.6, 0, 17.6, 0, 1.2, 0.4, 'concrete', southOpen);
  b.wallX(-23.6, 0, 17.6, 1.2, 9, 0.4, 'container', southOpen, { tint: STEEL });
  // roof with skylight gaps (sun stripes) + trusses
  for (const [z0, z1] of [[-18.4, -13], [-11, -5], [-3, 3], [5, 11], [13, 18.4]]) b.box(-24.4, 9, z0, 0, 9.3, z1, 'metalDark');
  for (const x of [-20, -12, -4]) b.box(x - 0.15, 8.4, -18, x + 0.15, 9, 18, 'metalYellow');
  for (const z of [-12, -4, 4, 12]) b.box(-24, 8.6, z - 0.1, 0, 9, z + 0.1, 'metalYellow');

  // ---------- catwalks (y = 4) ----------
  b.box(-23.6, 3.8, -17.6, -21.2, 4, 17.6, 'metalDark');                      // west run
  b.box(-21.2, 3.8, -17.6, 0, 4, -15.2, 'metalDark');                         // north run (west half)
  b.stairs(-12, -14.5, '-x', 1.4, 0.1, 4, 16, 0.4, 'metalDark', 0);            // interior stairs: x -12 -> -18.4, then step north onto the catwalk
  b.railZ(-15.2, 17.6, -21.2, 4);                                             // west run inner rail
  b.railX(-21.2, -18.9, -15.32, 4); b.railX(-17.5, 0, -15.32, 4);            // north run rail with a gap at the stair head
  for (const z of [-9, -3, 3, 9, 15]) b.cbox(-21.3, z, 0.2, 0.2, 0.1, 3.7, 'metalDark');
  for (const x of [-16, -10, -4]) b.cbox(x, -15.3, 0.2, 0.2, 0.1, 3.7, 'metalDark');

  // exterior fire escape on the west wall -> upper door onto the west catwalk
  b.stairs(-25.7, -7.6, '+z', 1.4, 0, 4, 16, 0.4, 'metalDark');
  b.box(-26.4, 3.8, -1.2, -24, 4, 1.8, 'metalDark');
  b.railZ(-1.2, 1.8, -26.4, 4); b.railX(-26.4, -24, 1.68, 4);
  b.cbox(-26.2, 1.6, 0.2, 0.2, 0, 3.8, 'metalDark'); b.cbox(-26.2, 0.6, 0.2, 0.2, 0, 3.8, 'metalDark');

  // ---------- warehouse floor (west half) ----------
  b.container(-14, -8.4, true, 0.1, 0x9c3b2a); b.container(-14, -8.4, true, 2.7, 0x2f5d8a);
  b.container(-14, -5.9, true, 0.1, 0x3d6b4a);
  b.cbox(-10.45, -6.4, 1.0, 1.0, 0.1, 2.0, 'wood'); b.cbox(-10.45, -5.4, 1.0, 1.0, 0.1, 1.0, 'woodDark'); // crate steps onto the container
  b.container(-9, 9, true, 0.1, 0xc9a227, true);                              // walk-through container
  b.container(-9, 11.5, true, 0.1, 0x8a8f94);
  b.cbox(-15.5, 2.5, 4.2, 3.2, 0.1, 3.0, 'metalGreen'); b.cbox(-15.5, 2.5, 1.2, 1.2, 3.1, 2.2, 'metalDark'); // press
  b.cbox(-12.6, 2.5, 1.0, 1.6, 0.1, 1.3, 'metal');                            // control desk
  rack(-19.5, -11, 13.2); rack(-19.5, -11, 15.6);
  b.crate(-5, -12.8, 1.4, 0.1); b.crate(-6.4, -13, 1.1, 0.1, 'woodDark'); b.crate(-5, -12.8, 1.0, 1.5, 'woodDark');
  b.crate(-18.5, -3.5, 1.3, 0.1); b.crate(-3.2, 6.2, 1.3, 0.1); b.crate(-3.2, 4.9, 1.0, 0.1, 'woodDark');
  b.cbox(-7, -1.5, 1.3, 2.2, 0.1, 1.3, 'metalYellow'); b.cbox(-7, -2.9, 0.3, 0.3, 0.1, 2.8, 'metalDark'); // forklift
  b.box(-20.8, 0.1, 5.5, -20.2, 1.0, 9, 'concrete');                          // safety barrier
  b.box(-11.5, 0.1, -0.3, -8.5, 1.0, 0.3, 'concrete');
  b.box(-2.6, 0.1, -9.5, -2.0, 1.0, -6, 'concrete');

  // ---------- west yard (team side) ----------
  b.container(-36, -13, false, 0, 0x2f5d8a); b.container(-36, -13, false, 2.6, 0x9c3b2a);
  b.container(-33.4, -13, false, 0, 0x8a8f94);
  b.container(-31, 5, true, 0, 0x3d6b4a);
  b.container(-35, 15, true, 0, 0x9c3b2a, true);
  b.container(-35, 17.6, true, 0, 0xc9a227); b.container(-35, 17.6, true, 2.6, 0x2f5d8a);
  b.van(-39.5, 1, false, 0xd8d8d0);
  b.crate(-30, -4.5, 1.4); b.crate(-30, -5.9, 1.1, 0, 'woodDark'); b.crate(-28.5, 12, 1.3); b.crate(-41, -22, 1.4); b.crate(-41, -23.4, 1.0, 0, 'woodDark');
  b.box(-29.5, 0, -17, -29, 1.0, -13, 'concrete'); b.box(-30, 0, 20.5, -26, 1.0, 21, 'concrete');
  b.room({ x0: -44.5, z0: 24, x1: -40, z1: 29, y0: 0, h: 2.8, th: 0.25, mat: 'concrete', roof: true, roofMat: 'metalDark', floor: true,
    open: { e: [[26, 27.3, 0, 2.2]], n: [[-43.5, -41.5, 1.0, 2.2]], s: [[-43.5, -41.5, 1.0, 2.2]] } }); // guard hut
  b.lamp(-44, -10, 7, 1.4, 0); b.lamp(-44, 10, 7, 1.4, 0); b.lamp(-27, -30, 7, 0, 1.4); b.lamp(-27, 30, 7, 0, -1.4);

  // ---------- north truck lane (x < 0) ----------
  b.box(-22, 1.3, -27.5, -9.5, 4.0, -24.9, 'paint', { tint: 0xd8d8d0 }); b.box(-21.5, 0, -27.3, -10, 1.3, -25.1, 'rubber'); // trailer
  b.box(-9.5, 0.4, -27.4, -7, 3.2, -25, 'paint', { tint: 0x8a2b22 }); b.box(-9.3, 0, -27.2, -7.2, 0.4, -25.2, 'rubber');   // cab
  b.container(-18, -31.5, true, 0, 0x3d6b4a); b.container(-11.5, -31.5, true, 0, 0x8a8f94);
  b.crate(-4, -22.5, 1.4); b.crate(-2.6, -22.8, 1.0, 0, 'woodDark'); b.box(-6, 0, -21.5, -5.5, 1.0, -19, 'concrete');
  b.box(-3, 0, -33, -0.4, 1.6, -30.5, 'metalGreen');

  // ---------- south tank farm (x < 0) ----------
  b.cbox(-17, 27, 6, 6, 0, 7, 'rust'); b.cbox(-17, 27, 6.6, 6.6, 7, 0.3, 'metalDark');
  b.cbox(-8, 28, 4.6, 4.6, 0, 5.5, 'metal'); b.cbox(-8, 28, 5.2, 5.2, 5.5, 0.3, 'metalDark');
  b.box(-24, 0, 22.4, -4, 0.7, 23, 'rust');                                   // low pipe run (cover you can hop)
  b.box(-13.2, 3.2, 21, -12.6, 3.8, 34, 'rust'); b.cbox(-12.9, 24, 0.3, 0.3, 0, 3.2, 'metalDark'); b.cbox(-12.9, 31, 0.3, 0.3, 0, 3.2, 'metalDark');
  b.crate(-22, 30, 1.4); b.crate(-3, 21.5, 1.3); b.box(-2.5, 0, 26, -2, 1.0, 30, 'concrete');

  // ---------- spawns ----------
  const A = [[-42, -30, -90], [-42, -18, -90], [-43, -6, -90], [-43, 6, -90], [-42, 12, -90], [-42, 20.5, -90], [-38, 31, -90], [-38, -26, -90], [-29, -31, -90], [-29, 31, -90]];
  for (const [x, z, yaw] of A) b.spawn('a', x, z, yaw, 0.05);
  const F = [[-42, -30, -90], [-43, 6, -90], [-38, 31, -90], [-29, -22, 180], [-27.5, 9, 180], [-18, -12.5, -90, 0.15], [-18, 9, -90, 0.15], [-6, -4, 0, 0.15],
    [-22.4, 0, -90, 4.05], [-10, -16.4, 180, 4.05], [-14, -22, 90], [-21.5, 25.5, -90], [-2, 24, 0], [-32, -2, -90], [-5, 14.5, -90, 0.15]];
  for (const [x, z, yaw, y] of F) b.spawn('ffa', x, z, yaw, y === undefined ? 0.05 : y);

  b.mirror();

  // ---------- centre (authored after mirroring) ----------
  b.box(-1.2, 3.8, -15.2, 1.2, 4, 15.2, 'metalDark');                         // spine bridge
  b.railZ(-15.2, -1.5, -1.2, 4); b.railZ(1.5, 15.2, -1.2, 4); b.railZ(-15.2, -1.5, 1.08, 4); b.railZ(1.5, 15.2, 1.08, 4);
  b.cbox(0, 0, 4.2, 5.6, 0.1, 3.3, 'metalGreen'); b.cbox(0, 0, 4.8, 1.2, 3.4, 0.4, 'metalDark'); // central furnace under the bridge
  b.cbox(0, 3.6, 1.6, 1.2, 0.1, 1.4, 'metal'); b.cbox(0, -3.6, 1.6, 1.2, 0.1, 1.4, 'metal');
  for (const z of [-10, 10]) { b.cbox(-1.1, z, 0.2, 0.2, 0.1, 3.7, 'metalDark'); b.cbox(1.1, z, 0.2, 0.2, 0.1, 3.7, 'metalDark'); }
  b.bounds = { x0: -45, z0: -34, x1: 45, z1: 34 };
  return b.build();
}
