// DOWNTOWN — urban streets at golden hour.
// 96 x 62 m playable. A long main street (E-W) with a central plaza, two back alleys, two cross
// streets, enterable buildings, a parking deck and two footbridges for height.
// The north half is authored by hand and mirrored (180° rotation) so both teams get identical sides.

import { MapBuilder } from './builder.js';

export function buildDowntown() {
  const b = new MapBuilder('downtown', 'Downtown');
  b.desc = 'Urban streets. Long main-street sightlines, tight alleys, rooftops and footbridges.';
  b.env = {
    skyTop: 0x35568f, skyHorizon: 0xf0c08a, sunColor: 0xffd9a8, sunDir: [-0.5, 0.82, 0.42], sunIntensity: 2.8,
    hemiSky: 0xbfd0ff, hemiGround: 0x6b5a4a, hemiIntensity: 1.5, fogColor: 0xd9b392, fogNear: 50, fogFar: 260, exposure: 1.1,
  };

  // ---------- ground (north half) ----------
  b.box(-56, -1, -39, 56, 0, 0, 'asphalt');
  // sidewalks under the blocks, paving in the plaza
  for (const [x0, x1] of [[-48, -31], [-25, -10], [10, 25], [31, 48]]) b.box(x0, 0, -24, x1, 0.08, -6.2, 'sidewalk');
  b.box(-10, 0, -24, 10, 0.08, -6.2, 'paving');
  b.box(-9, 0.08, -23.4, 9, 0.14, -13.6, 'grass');

  // ---------- perimeter ----------
  const north = [[-56, -36, 11, 'brick'], [-36, -22, 14.5, 'concrete'], [-22, -8, 9.5, 'brickDark'], [-8, 8, 17, 'plaster'],
    [8, 22, 10.5, 'brick'], [22, 36, 13.5, 'plaster'], [36, 56, 9.5, 'brickDark']];
  for (const [x0, x1, h, m] of north) b.facade(x0, -39, x1, -31, h, m, 's');
  b.facade(-56, -31, -48, -15, 11.5, 'plaster', 'e');
  b.facade(-56, -15, -48, 0, 15, 'brick', 'e');
  b.facade(48, -31, 56, -14, 12.5, 'concrete', 'w');
  b.facade(48, -14, 56, 0, 9.5, 'brickDark', 'w');

  // ---------- west end, north: depot with covered loading bay ----------
  b.facade(-48, -23, -39, -8, 8.5, 'brickDark', 'ens');
  b.box(-39, 3.2, -20, -33, 3.5, -11, 'metalDark');
  b.cbox(-33.3, -19.7, 0.4, 0.4, 0.08, 3.12, 'metalDark');
  b.cbox(-33.3, -11.3, 0.4, 0.4, 0.08, 3.12, 'metalDark');
  b.crate(-38.2, -18.6, 1.3, 0.08);
  b.crate(-38.2, -17.25, 1.3, 0.08);
  b.crate(-38.2, -18.0, 1.1, 1.38);
  b.crate(-36.7, -18.8, 1.0, 0.08, 'woodDark');
  b.cbox(-37.6, -12.6, 2.4, 1.2, 0.08, 1.0, 'metal');

  // ---------- mid-west, north: apartment building (2 floors) ----------
  b.room({
    x0: -24, z0: -23, x1: -11, z1: -8, y0: 0, h: 3.2, mat: 'brick', floor: true, floorMat: 'tile',
    open: {
      s: [[-22.8, -20.8, 1.0, 2.3], [-19, -17.6, 0, 2.2], [-15.5, -13, 1.0, 2.3]],
      n: [[-14, -12.6, 0, 2.2]],
      w: [[-17, -15.6, 0, 2.2], [-12, -10, 1.0, 2.3]],
      e: [[-20, -18, 1.0, 2.3], [-16.4, -15, 0, 2.2], [-13, -11, 1.0, 2.3]],
    },
  });
  b.stairs(-22.5, -22, '+x', 1.4, 0.1, 3.5, 14, 0.4, 'concrete', 0);
  b.slab(-24, -23, -11, -8, 3.2, 3.5, 'concrete', [[-22.7, -22.7, -16.9, -21.3]]);
  b.wallX(-18, -11.3, -17.6, 0.1, 3.2, 0.2, 'plaster', [[-15, -13.8, 0, 2.2]]);
  b.box(-23.5, 0.1, -12.2, -22.6, 0.9, -9.6, 'cloth', { tint: 0x7a4b3a }); // sofa
  b.box(-21, 0.1, -19.6, -19.4, 0.85, -18.6, 'wood'); // table
  b.box(-12.4, 0.1, -22.6, -11.4, 2.0, -18.6, 'woodDark'); // shelving
  b.box(-13.2, 0.1, -9.4, -11.4, 1.0, -8.5, 'metal'); // counter
  // second floor
  b.room({
    x0: -24, z0: -23, x1: -11, z1: -8, y0: 3.5, h: 3.3, mat: 'brick', roof: true, roofMat: 'roof',
    open: {
      s: [[-22.4, -20.4, 4.5, 5.8], [-18.2, -15.8, 3.5, 5.8], [-14.5, -12.5, 4.5, 5.8]],
      e: [[-20.5, -18, 4.4, 5.9], [-13.5, -11, 4.4, 5.9]],
      w: [[-17.5, -15, 4.5, 5.8]],
      n: [[-16, -14, 4.5, 5.8]],
    },
  });
  b.railX(-22.7, -17.0, -21.3, 3.5, 1.0);
  b.wallZ(-20, -13.5, -19.2, 3.5, 6.8, 0.2, 'plaster', [[-17.4, -16.2, 3.5, 5.7]]);
  b.box(-23.6, 3.5, -13, -21.6, 4.1, -10, 'cloth', { tint: 0x3d5a80 }); // bed
  b.box(-12.3, 3.5, -22.5, -11.4, 5.3, -20.8, 'woodDark'); // wardrobe
  b.box(-15, 3.5, -9.2, -13, 4.3, -8.5, 'wood'); // desk under window
  b.box(-24.2, 7.1, -23.2, -10.8, 7.5, -22.9, 'concreteDark'); b.box(-24.2, 7.1, -8.1, -10.8, 7.5, -7.8, 'concreteDark');
  b.box(-24.2, 7.1, -22.9, -23.9, 7.5, -8.1, 'concreteDark'); b.box(-11.1, 7.1, -22.9, -10.8, 7.5, -8.1, 'concreteDark');

  // ---------- west footbridge over the main street (full span; mirror creates the east one) ----------
  b.box(-18.2, 3.2, -8, -15.8, 3.5, 8, 'concrete');
  b.railZ(-8, 8, -18.2, 3.5, 1.0); b.railZ(-8, 8, -15.92, 3.5, 1.0);
  for (const z of [-6.6, 6.6]) { b.cbox(-18.0, z, 0.4, 0.4, 0, 3.2, 'concrete'); b.cbox(-16.0, z, 0.4, 0.4, 0, 3.2, 'concrete'); }

  // ---------- mid-east, north: parking deck ----------
  for (const x of [11.3, 17.5, 23.7]) for (const z of [-22.7, -15.5, -8.3]) b.cbox(x, z, 0.6, 0.6, 0.08, 3.12, 'concrete');
  b.slab(11, -23, 24, -8, 3.2, 3.5, 'concrete', [[17.4, -22.6, 23.0, -21.2]]);
  b.stairs(23.0, -21.9, '-x', 1.4, 0.08, 3.5, 14, 0.4, 'concrete', 0);
  b.railX(17.5, 23.0, -21.2, 3.5, 1.0); b.railZ(-22.6, -21.2, 23.0, 3.5, 1.0);
  b.box(11, 3.5, -23, 24, 4.5, -22.8, 'concrete'); // north parapet
  b.box(11, 3.5, -22.8, 11.2, 4.5, -17, 'concrete'); b.box(11, 3.5, -15, 11.2, 4.5, -8, 'concrete'); // west (gap = drop to park)
  b.box(23.8, 3.5, -22.8, 24, 4.5, -8, 'concrete'); // east
  b.box(11.2, 3.5, -8.2, 15.8, 4.5, -8, 'concrete'); b.box(18.2, 3.5, -8.2, 23.8, 4.5, -8, 'concrete'); // south (gap = bridge)
  b.car(14.2, -12.2, false, 0x2d4f7c, 3.5);
  b.car(21.3, -17.2, false, 0xb9b9b3, 3.5);
  b.cbox(19.2, -11.4, 3.2, 0.5, 3.5, 1.0, 'concrete');
  b.cbox(13.2, -19.6, 1.6, 1.4, 3.5, 1.3, 'metal');
  // under the deck
  b.car(14.2, -18.2, false, 0x6d2a2a);
  b.car(20.6, -12.4, false, 0x1e2a33);
  b.cbox(12.6, -10.2, 1.7, 1.7, 0.08, 2.5, 'metalGreen');
  b.crate(21.4, -19.4, 1.2, 0.08);

  // ---------- east end, north: bodega with roof access ----------
  b.room({
    x0: 33, z0: -22, x1: 46, z1: -10, y0: 0, h: 3.4, mat: 'plaster', floor: true, floorMat: 'tile', roof: true, roofMat: 'roof',
    open: {
      w: [[-21, -19, 1.0, 2.3], [-17, -15.6, 0, 2.2]],
      s: [[35, 37.5, 1.0, 2.3], [41, 42.4, 0, 2.2]],
      n: [[36, 37.4, 0, 2.2]],
    },
  });
  b.box(42.5, 0.1, -20, 45, 1.1, -19.2, 'wood');
  b.box(36, 0.1, -19, 36.6, 1.9, -14, 'metal');
  b.box(39, 0.1, -19, 39.6, 1.9, -14, 'metal');
  b.box(43.6, 0.1, -13.5, 45.4, 1.2, -11, 'metalGreen');
  b.stairs(47, -22, '+z', 2, 0, 3.7, 14, 0.4, 'concrete');
  b.box(46, 0, -16.4, 48, 3.7, -14, 'concrete');
  b.box(33, 3.7, -22, 46, 4.5, -21.8, 'plaster'); b.box(33, 3.7, -10.2, 46, 4.5, -10, 'plaster');
  b.box(33, 3.7, -21.8, 33.2, 4.5, -10.2, 'plaster');
  b.box(45.8, 3.7, -21.8, 46, 4.5, -16.4, 'plaster'); b.box(45.8, 3.7, -14, 46, 4.5, -10.2, 'plaster');
  b.cbox(37, -13, 1.8, 1.3, 3.7, 1.1, 'metal');
  b.cbox(41, -18, 2.2, 2.2, 3.7, 0.7, 'glass');
  b.box(32.6, 2.5, -19.5, 33, 2.65, -12, 'cloth', { tint: 0x9b2f2f }); // awning strip

  // ---------- plaza / park (north half) ----------
  b.box(-8, 0.08, -12.6, -3, 0.95, -11.6, 'stone'); b.box(-7.8, 0.95, -12.4, -3.2, 1.15, -11.8, 'leaves');
  b.box(3, 0.08, -12.6, 8, 0.95, -11.6, 'stone'); b.box(3.2, 0.95, -12.4, 7.8, 1.15, -11.8, 'leaves');
  b.box(-0.6, 0.14, -21.5, 0.6, 1.0, -16.5, 'stone');
  b.cbox(-5.6, -18.6, 3, 3, 0.14, 2.7, 'metalGreen'); b.cbox(-5.6, -18.6, 3.8, 3.8, 2.84, 0.2, 'metalDark');
  b.tree(8.2, -17.5); b.tree(-2.2, -9.8, 3.4, 1.5); b.tree(-8.3, -22.3, 3.6, 1.4); b.tree(3.4, -15.2, 3.0, 1.3);
  b.box(4.6, 0.14, -19.4, 6.6, 0.6, -18.8, 'wood'); // bench
  b.box(-3.4, 0.14, -15.3, -1.6, 0.6, -14.7, 'wood');

  // ---------- main street cover (north lane + west half of the centre line) ----------
  b.bus(-27, -2.6, true);
  b.car(-40, -4.6, true, 0x8a2b22);
  b.car(-12.2, -5, true, 0x2d4f7c);
  b.van(36, -3.4, true, 0xd8d8d0);
  b.car(6.2, -3.6, false, 0xc9a227);
  b.box(-9.2, 0, -6, -8.7, 0.95, -2.2, 'concrete'); // jersey barriers
  b.box(8.7, 0, -5.4, 9.2, 0.95, -1.6, 'concrete');
  b.box(21, 0, -1.2, 24.5, 0.95, -0.7, 'concrete');
  b.box(-34, 0, -0.9, -33.4, 1.3, 0.9, 'metal'); // utility box on the centre line
  for (const x of [-44, -30.5, -9.6, 9.6, 30.5, 44]) b.lamp(x, -7.3, 5.6, 0, 1.3);
  for (let x = -46; x < -11; x += 6) b.decor(x, 0, -0.09, x + 3, 0.015, 0.09, 'paintWhite');
  for (let i = 0; i < 6; i++) { b.decor(-11.5, 0, -5.6 + i * 0.95, -9.9, 0.015, -5.1 + i * 0.95, 'paintWhite'); b.decor(9.9, 0, -5.6 + i * 0.95, 11.5, 0.015, -5.1 + i * 0.95, 'paintWhite'); }

  // ---------- cross streets (north half) ----------
  b.car(-27.6, -15, false, 0x3a3f44);
  b.cbox(-30.2, -20.4, 1.3, 2.2, 0, 1.25, 'metalGreen');
  b.car(27.8, -18, false, 0x8a2b22);
  b.box(25.6, 0, -11.2, 28.6, 0.95, -10.7, 'concrete');
  b.cbox(30.2, -13.5, 1.2, 1.2, 0, 1.2, 'wood');

  // ---------- north alley ----------
  b.cbox(-40, -30.2, 2.2, 1.3, 0, 1.25, 'metalGreen');
  b.wallZ(-31, -27.4, -28.2, 0, 2.5, 0.2, 'woodDark');
  b.crate(-33.6, -29.9, 1.3); b.crate(-33.6, -29.9, 1.1, 1.3); b.crate(-32.2, -30.2, 1.0, 0, 'woodDark');
  b.cbox(-19.5, -24.9, 2.2, 1.3, 0, 1.25, 'metalGreen');
  b.van(-1.4, -28.7, true, 0x5c6b73);
  b.crate(6.5, -30.1, 1.4); b.crate(8, -30.2, 1.1, 0, 'woodDark');
  b.cbox(15, -30.3, 3, 1.0, 0, 1.6, 'metal'); // AC bank
  b.wallZ(-27.6, -24, 28, 0, 2.5, 0.2, 'woodDark');
  b.cbox(22, -30.2, 2.2, 1.3, 0, 1.25, 'metalGreen');
  b.crate(38.5, -29.8, 1.4); b.crate(40.1, -30.1, 1.0, 0, 'woodDark');
  b.lamp(-14, -30.6, 4.6, 0, 1.0); b.lamp(14, -30.6, 4.6, 0, 1.0); b.lamp(42, -30.6, 4.6, 0, 1.0); b.lamp(-42, -30.6, 4.6, 0, 1.0);

  // ---------- spawns ----------
  // Team A: west end (both halves authored; mirror turns them into team B at the east end)
  const A = [[-45.5, -28, -90], [-42, -26.2, -90], [-46, -5.5, -90], [-46, 0, -90], [-46, 5.5, -90], [-36, -9.4, -90],
    [-45.5, 28, -90], [-42, 26.2, -90], [-38, 8.9, -90], [-44, 8.9, -90]];
  for (const [x, z, yaw] of A) b.spawn('a', x, z, yaw, 0.1);
  const F = [[-45, -28, -90], [-46, -2, -90], [-36, -9.4, -90], [-27.5, -21.8, 180], [6, -27.5, 180], [-21.2, -14.5, 180, 0.2],
    [17.5, -12, 180, 0.2], [40.5, -16.5, 90, 0.2], [45, -28, 90], [27.4, -22.5, 180], [-6, -9.6, 180, 0.2], [-17, -4.2, -90],
    [42, -4.6, 90], [14.5, -16, -90, 3.6], [-14, -12, 90, 3.6]];
  for (const [x, z, yaw, y] of F) b.spawn('ffa', x, z, yaw, y === undefined ? 0.1 : y);

  b.mirror();

  // ---------- centre monument (authored after mirroring) ----------
  b.cbox(0, 0, 5.4, 5.4, 0, 0.45, 'stone');
  b.cbox(0, 0, 3.6, 3.6, 0.45, 0.45, 'stone');
  b.cbox(0, 0, 1.7, 1.7, 0.9, 4.6, 'stone');
  b.cbox(0, 0, 2.3, 2.3, 5.5, 0.4, 'concreteDark');
  b.bounds = { x0: -48, z0: -31, x1: 48, z1: 31 };
  return b.build();
}
