// DUSTLINE — desert compound.
// 96 x 72 m playable. A walled compound in the middle (two-storey main building, corner watch
// towers, wall-walks) surrounded by a village of mud-brick houses with rooftop access, market
// stalls, rock outcrops and open ground for long-range fights.
// The west half is authored by hand and mirrored (180° rotation) for balanced sides.

import { MapBuilder } from './builder.js';

export function buildDustline() {
  const b = new MapBuilder('dustline', 'Dustline');
  b.desc = 'Desert compound. Long open sightlines outside, watch towers and rooftops, tight rooms inside the walls.';
  b.env = {
    skyTop: 0x3c7ccf, skyHorizon: 0xead9b6, sunColor: 0xfff0cf, sunDir: [0.4, 0.84, -0.36], sunIntensity: 3.3,
    hemiSky: 0xe4eeff, hemiGround: 0xb39664, hemiIntensity: 1.5, fogColor: 0xe3cfa6, fogNear: 70, fogFar: 330, exposure: 1.0, envIntensity: 0.6,
  };

  const palm = (x, z, h = 5.2) => {
    b.cbox(x, z, 0.4, 0.4, 0, h, 'bark');
    b.box(x - 2.2, h, z - 0.45, x + 2.2, h + 0.18, z + 0.45, 'leaves'); b.box(x - 0.45, h + 0.05, z - 2.2, x + 0.45, h + 0.23, z + 2.2, 'leaves');
    b.cbox(x, z, 1.2, 1.2, h + 0.18, 0.5, 'leaves');
  };
  const rocks = (x, z, s = 1) => {
    b.cbox(x, z, 3.4 * s, 2.8 * s, 0, 2.6 * s, 'rock'); b.cbox(x + 1.6 * s, z + 1.2 * s, 2.2 * s, 2.4 * s, 0, 1.5 * s, 'rock');
    b.cbox(x - 1.5 * s, z - 1.0 * s, 1.6 * s, 1.8 * s, 0, 0.9 * s, 'rock');
  };
  const barrel = (x, z, tint = 0x8a2b22) => b.cbox(x, z, 0.62, 0.62, 0, 0.95, 'paint', { tint });
  /** Market stall: four posts, cloth canopy, a table. */
  const stall = (x, z, tint) => {
    for (const [dx, dz] of [[-1.4, -1], [1.4, -1], [-1.4, 1], [1.4, 1]]) b.cbox(x + dx, z + dz, 0.12, 0.12, 0, 2.4, 'woodDark');
    b.box(x - 1.7, 2.4, z - 1.3, x + 1.7, 2.52, z + 1.3, 'cloth', { tint });
    b.box(x - 1.2, 0, z - 0.5, x + 1.2, 0.9, z + 0.5, 'wood');
  };

  // ---------- ground (west half) ----------
  b.box(-56, -1, -44, 0, 0, 44, 'sand');
  b.decor(-48, 0, -2.6, -18, 0.012, 2.6, 'sandDark');           // track to the west gate
  b.decor(-9.4, 0, -36, -4.6, 0.012, -14, 'sandDark');          // track to the north gate
  b.decor(-17.4, 0, -13.4, 0, 0.012, 13.4, 'sandDark');         // compound yard

  // ---------- perimeter: rock walls and dunes (west half) ----------
  const ridge = [[-56, -44, -40, -36, 7], [-40, -44, -22, -36, 9], [-22, -44, -8, -36, 6.5], [-8, -44, 0, -36, 8],
    [-56, -36, -48, -18, 8], [-56, -18, -48, 2, 6], [-56, 2, -48, 20, 9], [-56, 20, -48, 36, 7],
    [-56, 36, -34, 44, 8], [-34, 36, -16, 44, 6], [-16, 36, 0, 44, 9]];
  for (const [x0, z0, x1, z1, h] of ridge) { b.box(x0, 0, z0, x1, h, z1, 'rock'); b.box(x0 + 1.5, h, z0 + 1.5, x1 - 1.5, h + 1.6, z1 - 1.5, 'rock'); }

  // ---------- compound wall (west half) ----------
  const WALL = 3.2, T = 0.6;
  b.wallZ(-14, 14, -18, 0, WALL, T, 'mudbrick', [[-2, 2, 0, WALL]]);                 // west wall with gate
  b.box(-18.3, 3.2, -2.6, -17.1, 4.1, -2, 'mudDark'); b.box(-18.3, 3.2, 2, -17.1, 4.1, 2.6, 'mudDark'); // gate posts
  b.box(-18.2, 3.6, -2.6, -17.2, 4.1, 2.6, 'woodDark');                              // gate lintel
  b.wallX(-17.4, 0, -14, 0, WALL, T, 'mudbrick', [[-9, -5, 0, WALL]]);               // north wall (west half) with gate
  b.wallX(-17.4, 0, 13.4, 0, WALL, T, 'mudbrick', []);                               // south wall (west half), no gate
  // NW watch tower: platform at y = 4, reached by stairs along the inside of the north wall
  b.box(-20, 0, -16, -16, 3.8, -12, 'mudbrick'); b.box(-20.2, 3.8, -16.2, -15.8, 4, -11.8, 'woodDark');
  b.box(-20.2, 4, -16.2, -15.8, 5, -16, 'mudDark'); b.box(-20.2, 4, -16, -20, 5, -11.8, 'mudDark');   // parapet N + W
  b.box(-15.8 - 0.2, 4, -16, -15.8, 5, -13.6, 'mudDark');                            // parapet E (gap toward the stairs)
  b.box(-20, 4, -12, -17.6, 5, -11.8, 'mudDark');                                    // parapet S (gap toward the wall-walk)
  for (const [x, z] of [[-20, -16], [-16.2, -16], [-20, -12.2], [-16.2, -12.2]]) b.box(x, 5, z, x + 0.2, 6.9, z + 0.2, 'woodDark');
  b.box(-20.5, 6.9, -16.5, -15.5, 7.1, -11.5, 'wood');
  b.stairs(-9.6, -12.8, '-x', 1.2, 0, 4, 16, 0.4, 'mudbrick');                       // x -9.6 -> -16, y 0 -> 4
  // wall-walk along the west wall (y = 2.2, wall top is the parapet) down from the tower
  b.stairs(-16.8, -8.6, '-z', 1.2, 2.2, 4, 8, 0.4, 'mudbrick', 0);                   // z -8.6 -> -11.8
  b.box(-17.4, 2.0, -8.6, -16.2, 2.2, -2.6, 'wood');
  for (const z of [-7, -4]) b.cbox(-16.3, z, 0.15, 0.15, 0, 2.0, 'woodDark');
  // SW corner: sheltered storage (roofed corner inside the wall)
  b.box(-17.4, 2.6, 8, -11, 2.8, 13.4, 'wood'); b.cbox(-11.2, 8.2, 0.2, 0.2, 0, 2.6, 'woodDark'); b.cbox(-11.2, 13.2, 0.2, 0.2, 0, 2.6, 'woodDark'); b.cbox(-17.2, 8.2, 0.2, 0.2, 0, 2.6, 'woodDark');
  b.crate(-16, 12, 1.3); b.crate(-14.6, 12.2, 1.0, 0, 'woodDark'); b.crate(-16, 12, 1.0, 1.3, 'woodDark'); barrel(-12.5, 12.4); barrel(-12.5, 11.6, 0x2f5d8a);

  // ---------- compound yard cover (west half) ----------
  b.cbox(-12.5, -3.5, 2.2, 2.2, 0, 1.0, 'sandstone'); b.cbox(-12.5, -3.5, 0.2, 0.2, 1.0, 1.6, 'woodDark'); // well
  b.box(-13.5, 0, 3, -10, 1.1, 3.5, 'mudbrick'); b.box(-10.5, 0, 3.5, -10, 1.1, 6, 'mudbrick');       // low L wall
  b.van(-4.5, -10.6, true, 0xb9a27a);                                                                 // pickup near the north gate
  b.crate(-3, 9.8, 1.3); b.crate(-4.4, 10, 1.0, 0, 'woodDark'); barrel(-9.5, -8.5); barrel(-8.8, -8.6, 0x3d6b4a);
  b.box(-15.8, 0, 1.2, -15.2, 1.0, 2.6, 'cloth', { tint: 0x8a7a55 }); b.box(-15.8, 0, -2.6, -15.2, 1.0, -1.2, 'cloth', { tint: 0x8a7a55 }); // sandbags inside the gate

  // ---------- village, north-west: house with rooftop ----------
  b.room({ x0: -38, z0: -28, x1: -30, z1: -20, y0: 0, h: 3.2, th: 0.35, mat: 'mudbrick', floor: true, floorMat: 'sandstone', roof: true, roofMat: 'mudDark',
    open: { e: [[-24.7, -23.3, 0, 2.2], [-27.5, -26, 1.1, 2.2]], s: [[-35, -33.6, 0, 2.2], [-32.5, -31, 1.1, 2.2]], n: [[-35.5, -33.5, 1.1, 2.2]], w: [[-23, -21.5, 1.1, 2.2]] } });
  b.stairs(-38.7, -20, '-z', 1.4, 0, 3.5, 14, 0.4, 'mudbrick');                      // exterior stairs to the roof
  b.box(-38, 3.5, -28, -30, 4.1, -27.8, 'mudDark'); b.box(-30.2, 3.5, -27.8, -30, 4.1, -20, 'mudDark'); b.box(-37.8, 3.5, -20.2, -30.2, 4.1, -20, 'mudDark');
  b.box(-38, 3.5, -27.8, -37.8, 4.1, -25.6, 'mudDark');                              // west parapet (open where the stairs arrive)
  b.box(-36.5, 0.1, -27.4, -34.8, 0.6, -25.6, 'cloth', { tint: 0x7a4b3a }); b.box(-31.6, 0.1, -22.6, -30.6, 1.0, -20.6, 'wood');
  b.cbox(-33, -24, 1.4, 1.4, 3.5, 0.9, 'mudbrick');                                  // roof block for cover
  // ---------- village, south-west: ruined house (no roof) ----------
  b.wallX(-40, -31, 16, 0, 3.0, 0.35, 'mudbrick', [[-37, -35.6, 0, 2.2], [-33.5, -32, 1.0, 3.0]]);
  b.wallX(-40, -34, 25.65, 0, 2.2, 0.35, 'mudbrick', [[-38, -36.5, 1.0, 2.2]]);
  b.wallZ(16.35, 25.65, -40, 0, 3.0, 0.35, 'mudbrick', [[20, 22, 1.0, 2.2]]);
  b.wallZ(16.35, 21, -31.35, 0, 2.6, 0.35, 'mudbrick', [[18, 19.4, 0, 2.2]]);
  b.box(-33.5, 0, 23.5, -31, 0.8, 25.5, 'mudDark'); b.box(-31.5, 0, 21.5, -30.6, 1.3, 23.5, 'mudDark'); // rubble
  b.crate(-38.6, 24.2, 1.2); b.box(-36, 0, 19.5, -34, 0.8, 20.5, 'wood');
  // ---------- outside the west gate: market + defences ----------
  stall(-26, -5.5, 0x9b2f2f); stall(-26, 5.5, 0x2f5d8a); stall(-31.5, 8.5, 0xc9a227);
  b.box(-22.6, 0, -4.2, -21.8, 1.0, -1.4, 'cloth', { tint: 0x8a7a55 }); b.box(-22.6, 0, 1.4, -21.8, 1.0, 4.2, 'cloth', { tint: 0x8a7a55 }); // sandbags
  b.car(-29, -11.5, true, 0x6b5a45); barrel(-24.2, -9.5); barrel(-24.2, 10.2, 0x2f5d8a);
  rocks(-43, -9, 1.0); rocks(-42.5, 9.5, 0.9); rocks(-25, -31, 1.1); rocks(-24.5, 31, 1.0); rocks(-11, -27, 0.8); rocks(-9, 24, 0.9);
  palm(-34, -14.5); palm(-41, 2.2, 5.8); palm(-22.5, 16.5); palm(-28, 27.5, 4.8); palm(-20.5, -21); palm(-3, 30.5); palm(-14.5, -31.5, 5.6);
  // ---------- north strip (x < 0): outside the north gate ----------
  b.box(-12.5, 0, -19.5, -9.6, 1.1, -19, 'mudbrick'); b.box(-4.4, 0, -19.5, -1.5, 1.1, -19, 'mudbrick');
  b.cbox(-2.5, -29, 4, 4, 0, 4.2, 'rust'); b.cbox(-2.5, -29, 4.4, 4.4, 4.2, 0.25, 'metalDark');                 // water tank
  b.wallX(-19, -13.5, -24, 0, 2.4, 0.4, 'mudbrick', [[-16.8, -15.4, 0, 2.4]]);                               // ruined wall
  b.crate(-6.5, -22.5, 1.3); barrel(-5.2, -22.9);
  // ---------- south strip (x < 0): outside the blank south wall ----------
  b.box(-15, 0, 18.5, -9, 1.1, 19, 'mudbrick'); b.box(-9.5, 0, 19, -9, 1.1, 22, 'mudbrick');
  b.cbox(-16, 28.5, 3, 5, 0, 2.6, 'mudbrick'); b.cbox(-16, 28.5, 3.4, 5.4, 2.6, 0.2, 'mudDark');              // small shed (solid)
  b.crate(-4.5, 17.5, 1.4); b.crate(-3.1, 17.8, 1.0, 0, 'woodDark'); b.car(-5, 26.5, false, 0x8a2b22);

  // ---------- spawns ----------
  const A = [[-45, -30, -90], [-45, -20, -90], [-45, -3, -90], [-45, 3, -90], [-44.5, 15, -90], [-45, 27, -90], [-40, 31.5, -90], [-41, -32, -90], [-36, -17, -90], [-36, 12.5, -90]];
  for (const [x, z, yaw] of A) b.spawn('a', x, z, yaw, 0.05);
  const F = [[-45, -30, -90], [-45, 3, -90], [-40, 31.5, -90], [-34, -24, 90, 0.15], [-35.5, -23, 90, 3.55], [-36.5, 22, 0], [-29, 0, -90], [-18, -14, -45, 4.05],
    [-13.5, -9.5, 180], [-13, 9.5, -90], [-7, -31, 180], [-12, 30.5, -90], [-21, -27, 180], [-21, 22, 0], [-3, -20.5, 180]];
  for (const [x, z, yaw, y] of F) b.spawn('ffa', x, z, yaw, y === undefined ? 0.05 : y);

  b.mirror();

  // ---------- central main building (authored after mirroring; symmetric by construction) ----------
  const win = (a, c) => [a, c, 1.0, 2.3], win2 = (a, c) => [a, c, 4.5, 5.8];
  b.room({ x0: -8, z0: -6, x1: 8, z1: 6, y0: 0, h: 3.2, th: 0.4, mat: 'sandstone', floor: true, floorMat: 'tile',
    open: {
      w: [[-0.7, 0.7, 0, 2.2], win(-4.5, -3), win(3, 4.5)], e: [[-0.7, 0.7, 0, 2.2], win(-4.5, -3), win(3, 4.5)],
      s: [[-4, -2.6, 0, 2.2], win(-1, 1)], n: [[2.6, 4, 0, 2.2], win(-1, 1)],
    } });
  b.slab(-8, -6, 8, 6, 3.2, 3.5, 'sandstone', [[-7.4, -5.6, -1.8, -4.4], [1.8, 4.4, 7.4, 5.6]]);
  b.stairs(-7.4, -5, '+x', 1.2, 0.1, 3.5, 14, 0.4, 'sandstone', 0);                   // west staircase (north wall)
  b.stairs(7.4, 5, '-x', 1.2, 0.1, 3.5, 14, 0.4, 'sandstone', 0);                     // east staircase (south wall)
  b.wallZ(-5.6, 2, -0.2, 0.1, 3.2, 0.4, 'sandstone', [[-2.2, -0.8, 0, 2.2]]);         // ground-floor partition
  b.box(2.5, 0.1, -1.5, 5, 0.9, -0.5, 'wood'); b.box(-5.5, 0.1, 1.5, -3.5, 0.9, 2.5, 'wood'); b.box(5.8, 0.1, -5.4, 7.4, 1.9, -4.6, 'woodDark');
  b.room({ x0: -8, z0: -6, x1: 8, z1: 6, y0: 3.5, h: 3.1, th: 0.4, mat: 'sandstone', roof: true, roofMat: 'mudDark',
    open: {
      w: [[-0.7, 0.7, 3.5, 5.7], win2(-4.5, -3), win2(3, 4.5)], e: [[-0.7, 0.7, 3.5, 5.7], win2(-4.5, -3), win2(3, 4.5)],
      s: [win2(-5, -3), win2(-1, 1), win2(3, 5)], n: [win2(-5, -3), win2(-1, 1), win2(3, 5)],
    } });
  b.railX(-7.4, -1.8, -4.4, 3.5, 1.0, 'woodDark'); b.railX(1.8, 7.4, 4.28, 3.5, 1.0, 'woodDark');
  b.box(-1.5, 3.5, -1.2, 1.5, 4.4, -0.7, 'wood'); b.box(-5, 3.5, 3.4, -3, 4.1, 5.2, 'cloth', { tint: 0x7a4b3a }); b.box(3, 3.5, -5.2, 5, 4.1, -3.4, 'cloth', { tint: 0x3d5a80 });
  // balconies over the west and east doors
  for (const sgn of [-1, 1]) {
    const x0 = sgn < 0 ? -10.2 : 8, x1 = sgn < 0 ? -8 : 10.2;
    b.box(x0, 3.3, -2.6, x1, 3.5, 2.6, 'wood');
    b.box(sgn < 0 ? x0 : x1 - 0.15, 3.5, -2.6, sgn < 0 ? x0 + 0.15 : x1, 4.4, 2.6, 'woodDark');
    b.box(x0, 3.5, -2.6, x1, 4.4, -2.45, 'woodDark'); b.box(x0, 3.5, 2.45, x1, 4.4, 2.6, 'woodDark');
    for (const z of [-2.4, 2.4]) b.cbox(sgn < 0 ? -10 : 10, z, 0.18, 0.18, 0, 3.3, 'woodDark');
  }
  b.box(-8.3, 6.9, -6.3, 8.3, 7.4, -6, 'mudDark'); b.box(-8.3, 6.9, 6, 8.3, 7.4, 6.3, 'mudDark'); b.box(-8.3, 6.9, -6, -8, 7.4, 6, 'mudDark'); b.box(8, 6.9, -6, 8.3, 7.4, 6, 'mudDark');
  b.bounds = { x0: -48, z0: -36, x1: 48, z1: 36 };
  return b.build();
}
