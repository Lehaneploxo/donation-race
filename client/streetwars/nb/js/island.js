// Palm Island and the Neon Bay Bridge. A cable-stayed bridge leaves the end of the main street by the
// promenade, climbs over the beach, crosses ~200 m of open sea twelve metres up and comes down onto
// an island with its own neighbourhoods: Starfish Heights (mansions behind walls, waterfront villas),
// Vice Point (a plaza with neon shops, beach hotels on the south shore), a park, a gas station and
// Lighthouse Point, whose beam sweeps the sea at night. Built with the city's own builders but its
// own random numbers, so the city itself doesn't change.
(function (NB) {
  'use strict';
  const FLAT = [.03, .5];

  NB.buildIsland = function (k) {
    const { C, U, col, scene, bPlain, bFacade, bNeon, bGlow, bSand, bAsphalt, bPaving, building, sign, awning, neonRing, mapShapes, palms, lamps, PASTEL, NEON, FT } = k;
    const R = U.rng(3131), rr = (a, b) => a + R() * (b - a), pick = a => a[(R() * a.length) | 0];
    const WHITE = C('#ffffff'), YEL = C('#f2c14e'), PAINT = C('#ece6dc');
    const IX0 = 345, IX1 = 515, IZ0 = -105, IZ1 = 105, SAND = .3, LAND = .42;
    const spots = [], parking = [], gy = LAND;
    const B = { x0: 158.5, x1: 296.5 };   // where the bridge is high over the water

    /* ================= the bridge ================= */
    const deckY = 12, HW = 7, BZ = -98;   // the bridge runs along the south edge of the bay, out of the sunset view
    // a sloped slab between (xa, ya) and (xb, yb), xa < xb, across z0..z1: top, underside and both side faces
    function slab(xa, ya, xb, yb, z0, z1, th, hex) {
      const c = C(hex), s = (yb - ya) / (xb - xa), n = 1 / Math.hypot(s, 1);
      bPlain.quad([xa, ya, z1], [xb, yb, z1], [xb, yb, z0], [xa, ya, z0], -s * n, n, 0, c, FLAT, FLAT, FLAT, FLAT);
      bPlain.quad([xa, ya - th, z0], [xb, yb - th, z0], [xb, yb - th, z1], [xa, ya - th, z1], s * n, -n, 0, c.clone().multiplyScalar(.7), FLAT, FLAT, FLAT, FLAT);
      bPlain.quad([xa, ya - th, z1], [xb, yb - th, z1], [xb, yb, z1], [xa, ya, z1], 0, 0, 1, c.clone().multiplyScalar(.85), FLAT, FLAT, FLAT, FLAT);
      bPlain.quad([xb, yb - th, z0], [xa, ya - th, z0], [xa, ya, z0], [xb, yb, z0], 0, 0, -1, c.clone().multiplyScalar(.85), FLAT, FLAT, FLAT, FLAT);
    }
    const deckAt = x => x <= 109.5 ? .15 : x < B.x0 ? .15 + (x - 109.5) / (B.x0 - 109.5) * (deckY - .15) : x <= B.x1 ? deckY : x < IX0 ? deckY - (x - B.x1) / (IX0 - B.x1) * (deckY - SAND) : SAND;
    // one piece of road on the bridge: deck, pavements, parapets, lane markings; ramps are colliders in small steps
    const PV = 2.2;   // pavement width: room for people to walk across
    function span(xa, xb) {
      const ya = deckAt(xa), yb = deckAt(xb);
      slab(xa, ya, xb, yb, BZ - HW + PV, BZ + HW - PV, .7, '#3d3946');
      for (const [z0, z1] of [[-HW, -HW + PV], [HW - PV, HW]]) slab(xa, ya + .12, xb, yb + .12, BZ + z0, BZ + z1, .82, '#cfc8c0');
      for (const [z0, z1] of [[-HW - .3, -HW], [HW, HW + .3]]) slab(xa, ya + 1.1, xb, yb + 1.1, BZ + z0, BZ + z1, 1.1, '#e8e2da');
      for (const z of [-HW - .31, HW + .3]) slab(xa, ya - .45, xb, yb - .45, BZ + z, BZ + z + .01, .08, '#ff4fa3');
      // markings: a double yellow line in the middle, dashes between the lanes
      for (const z of [-.2, .08]) slab(xa, ya + .015, xb, yb + .015, BZ + z, BZ + z + .12, .01, '#f2c14e');
      for (let x = xa; x < xb - 2; x += 6) for (const z of [-2.8, 2.7]) slab(x, deckAt(x) + .015, x + 3, deckAt(x + 3) + .015, BZ + z, BZ + z + .12, .01, '#ece6dc');
      const steps = Math.max(1, Math.ceil((xb - xa) / (ya === yb ? 200 : .7)));
      for (let i = 0; i < steps; i++) {
        const x0 = xa + (xb - xa) * i / steps, x1 = xa + (xb - xa) * (i + 1) / steps, y = deckAt((x0 + x1) / 2);
        // road surface: cars ride over these steps rather than bumping into them (b.ramp)
        for (const b of [col.add(x0, y - .7, BZ - HW + PV, x1, y, BZ + HW - PV), col.add(x0, y - .7, BZ - HW, x1, y + .12, BZ - HW + PV), col.add(x0, y - .7, BZ + HW - PV, x1, y + .12, BZ + HW)]) b.ramp = true;
        col.add(x0, y, BZ - HW - .3, x1, y + 1.2, BZ - HW); col.add(x0, y, BZ + HW, x1, y + 1.2, BZ + HW + .3);
      }
    }
    span(109.5, B.x0); span(B.x0, B.x1); span(B.x1, IX0);
    // piers under the deck, and two tall pylons carrying fans of cables
    for (const x of [140, 150, 170, 186, 228, 272, 288, 305, 322, 336]) {
      const y = deckAt(x) - .7; if (y < 1.2) continue;
      for (const z of [BZ - 4.5, BZ + 3]) { bPlain.box(x - .7, -4, z, x + .7, y, z + 1.5, C('#bfb8b0')); col.add(x - .7, -4, z, x + .7, y, z + 1.5); }
      bPlain.box(x - .8, y - .8, BZ - 5, x + .8, y, BZ + 5, C('#bfb8b0'));
    }
    const PYL = [205, 250], TOP = 46, cable = [];
    for (const px of PYL) {
      for (const z of [BZ - HW - 1.4, BZ + HW + .4]) { bPlain.box(px - 1, -4, z, px + 1, TOP, z + 1, C('#e8e2da')); col.add(px - 1, -4, z, px + 1, TOP, z + 1); bNeon.box(px - 1.02, 13, z + .45, px - .98, TOP - 1, z + .55, C('#3fe6e0')); }
      for (const y of [deckY - 3, 30, TOP - 2]) bPlain.box(px - .8, y, BZ - HW - 1.4, px + .8, y + 1.4, BZ + HW + 1.4, C('#e8e2da'));
      bNeon.box(px - .3, TOP, BZ - .3, px + .3, TOP + 1.2, BZ + .3, C('#ff3344'));
      for (let d = 6; d <= 44; d += 4.75) for (const s of [-1, 1]) for (const z of [BZ - HW - .9, BZ + HW + .9]) cable.push(px, TOP - 1 - d * .12, z, px + s * d, deckY + 1.1, z);
    }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cable, 3));
    scene.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xf2eee8 })));
    // lamps along both pavements, all the way across
    for (let x = 116; x < IX0 - 2; x += 18) { lamps.push([x, BZ - HW + .35, 0, deckAt(x) + .12], [x + 9, BZ + HW - .35, Math.PI, deckAt(x + 9) + .12]); }
    mapShapes.push({ x0: 109.5, z0: BZ - HW, x1: IX0, z1: BZ + HW, c: '#6a6474', k: 's' });

    /* ================= the island ================= */
    // sand all round, a paved and planted interior, a body of rock under the waterline
    col.add(IX0, -4, IZ0, IX1, SAND, IZ1);
    bPlain.box(IX0, -1.5, IZ0, IX1, SAND - .005, IZ1, C('#cdb07a'));
    bSand.flat(IX0, IZ0, IX1, IZ1, SAND, WHITE, 6);
    NB.water.hole({ x0: IX0, x1: IX1, z0: IZ0, z1: IZ1 });
    mapShapes.push({ x0: IX0, z0: IZ0, x1: IX1, z1: IZ1, c: '#e6c78d', k: 's' });
    const LX0 = 355, LX1 = 505, LZ0 = -95, LZ1 = 95;
    bPaving.box(LX0, SAND, LZ0, LX1, LAND, LZ1, C('#e8e2d8'), { tile: 2, topTile: 2 });
    col.add(LX0, 0, LZ0, LX1, LAND, LZ1);
    mapShapes.push({ x0: LX0, z0: LZ0, x1: LX1, z1: LZ1, c: '#8e8798', k: 's' });
    // roads: an avenue from the bridge to the lighthouse, a ring north and south, two cross streets
    const ROADS = [[IX0, -105, LX0, 5], [IX0, -5, 505, 5], [360, 55, 500, 65], [360, -65, 500, -55], [375, -65, 385, 65], [465, -65, 475, 65]];
    for (const [x0, z0, x1, z1] of ROADS) {
      const y = x0 < LX0 ? SAND + .005 : LAND + .004;
      if (x0 < LX0) { bAsphalt.flat(x0, z0, LX0, z1, SAND + .005, WHITE, 8); bAsphalt.flat(LX0, z0, x1, z1, LAND + .004, WHITE, 8); }
      else bAsphalt.flat(x0, z0, x1, z1, y, WHITE, 8);
      mapShapes.push({ x0, z0, x1, z1, c: '#3d3848', k: 's' });
      const along = x1 - x0 > z1 - z0, mid = along ? (z0 + z1) / 2 : (x0 + x1) / 2;
      for (let s = along ? x0 + 2 : z0 + 2; s < (along ? x1 : z1) - 3; s += 6) {
        const yy = (along ? s : x0) < LX0 ? SAND + .01 : LAND + .01;
        if (along) bPlain.flat(s, mid - .1, s + 3, mid + .1, yy, YEL); else bPlain.flat(mid - .1, s, mid + .1, s + 3, yy, YEL);
      }
    }
    const grass = (x0, z0, x1, z1) => { bPlain.box(x0, LAND, z0, x1, LAND + .04, z1, C('#5aa35a')); mapShapes.push({ x0, z0, x1, z1, c: '#4f9a5c', k: 'p' }); };
    const wall = (x0, z0, x1, z1, h, hex) => { bPlain.box(x0, LAND, z0, x1, LAND + h, z1, C(hex)); col.add(x0, 0, z0, x1, LAND + h, z1); };
    const palm = (x, z, y = LAND) => palms.push([x, y, z]);
    const bench = (x, z, face) => { const rot = Math.abs(Math.sin(face)) > .5, w = rot ? .6 : 1.8, d = rot ? 1.8 : .6; bPlain.box(x - w / 2, LAND, z - d / 2, x + w / 2, LAND + .45, z + d / 2, C('#b77a4a')); col.add(x - w / 2, 0, z - d / 2, x + w / 2, LAND + .45, z + d / 2); if (R() < .6) spots.push({ kind: 'sit', x: x - Math.sin(face) * .12, z: z - Math.cos(face) * .12, y: LAND + .51, fixedY: true, heading: face, mix: 'town', home: true }); };
    const talk = (x, z, mix) => { const g = {}, n = R() < .4 ? 3 : 2, seed = R() * 10; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; spots.push({ kind: 'talk', x: x + Math.sin(a) * .55, z: z + Math.cos(a) * .55, y: gy, fixedY: true, heading: Math.atan2(-Math.sin(a), -Math.cos(a)), mix, seed, idx: i, n, grp: g, home: true }); } };
    const walker = (pts, mix, type) => spots.push({ kind: 'walk', x: pts[0][0], z: pts[0][1], y: gy, fixedY: true, heading: 0, mix, type, patrol: pts });
    const loop = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

    // ---- the park by the bridge landing (west, north of the avenue)
    grass(357, 8, 373, 52); for (let i = 0; i < 7; i++) palm(rr(359, 371), rr(10, 50));
    bench(360.5, 20, Math.PI / 2); bench(360.5, 38, Math.PI / 2); bench(369.5, 29, -Math.PI / 2);
    talk(365, 45, 'town'); walker(loop(356.5, 7, 374, 53), 'town');

    // ---- the gas station (west, south of the avenue)
    bPlain.box(357, LAND, -40, 373, LAND + .02, -8, C('#6a6474'));
    for (const [x, z] of [[360, -30], [370, -30], [360, -18], [370, -18]]) { bPlain.box(x - .2, LAND, z - .2, x + .2, LAND + 5, z + .2, C('#f2f2f2')); col.add(x - .2, 0, z - .2, x + .2, LAND + 5, z + .2); }
    bPlain.box(358, LAND + 5, -32, 372, LAND + 5.6, -16, C('#f2f2f2')); bNeon.box(357.9, LAND + 5.05, -32.1, 372.1, LAND + 5.2, -15.9, C('#ff4fa3'));
    for (const x of [363, 367]) for (const z of [-26, -21]) { bPlain.box(x - .35, LAND, z - .25, x + .35, LAND + 1.6, z + .25, C('#e02a3a')); bNeon.box(x - .3, LAND + 1.2, z - .26, x + .3, LAND + 1.5, z - .25, C('#ffd84f')); col.add(x - .35, 0, z - .25, x + .35, LAND + 1.6, z + .25); }
    const shop = building(358, -52, 372, -42, 5, '#f7e7a1', LAND);
    sign('+z', shop, 3.3, 4.4, 1.6, 'CAFE'); awning('+z', shop, '#ff4fa3', 6);
    parking.push({ x: 362, z: -12, h: 0 }, { x: 368, z: -36, h: Math.PI });
    walker([[358, -6], [373, -6], [373, -41], [358, -41]], 'town');

    // ---- Vice Point plaza (centre, south of the avenue): shops with neon round a fountain
    bPlain.box(395, LAND, -45, 455, LAND + .02, -15, C('#f2d6c9'));
    const fx = 425, fz = -30;
    bPlain.box(fx - 3.5, LAND, fz - 3.5, fx + 3.5, LAND + .7, fz + 3.5, C('#efe7da')); bPlain.box(fx - 3, LAND + .66, fz - 3, fx + 3, LAND + .68, fz + 3, C('#4fc9d6'));
    bPlain.box(fx - .5, LAND + .7, fz - .5, fx + .5, LAND + 2.6, fz + .5, C('#efe7da')); bNeon.box(fx - 3.1, LAND + .7, fz - 3.1, fx + 3.1, LAND + .76, fz - 3, C('#3fe6e0'));
    col.add(fx - 3.5, 0, fz - 3.5, fx + 3.5, LAND + .7, fz + 3.5); col.add(fx - .5, 0, fz - .5, fx + .5, LAND + 2.6, fz + .5);
    const WORDS = ['PIZZA', 'DISCO', 'VIDEO', 'TATTOO', 'SURF', 'CLUB', 'DINER', 'RADIO'];
    const shops = [[387, -54, 405, -46, '+z'], [409, -54, 441, -46, '+z'], [445, -54, 463, -46, '+z'], [387, -14, 405, -7, '-z'], [445, -14, 463, -7, '-z'], [387, -44, 393, -16, '+x'], [457, -44, 463, -16, '-x']];
    for (const [x0, z0, x1, z1, f] of shops) {
      const hex = pick(PASTEL), h = pick([6, 8, 10, 12]), b = building(x0, z0, x1, z1, h, hex, LAND);
      sign(f, b, 3.4, 4.8, 1.5, pick(WORDS)); awning(f, b, pick(NEON), f[1] === 'z' ? Math.min(6, (x1 - x0) / 2 - .5) : 6);
      if (R() < .6) neonRing(b.x0, b.z0, b.x1, b.z1, h - .3, pick(NEON));
    }
    for (let i = 0; i < 6; i++) palm(rr(398, 452), rr(-43, -17));
    bench(413, -30, Math.PI / 2); bench(437, -30, -Math.PI / 2); bench(425, -40, 0); bench(425, -20, Math.PI);
    talk(410, -38, 'strip'); talk(440, -22, 'strip'); talk(418, -19, 'downtown');
    walker(loop(396, -44, 454, -16), 'strip'); walker([[454, -16], [396, -16], [396, -44], [454, -44]], 'strip'); walker(loop(386, -6, 464, -6.1).slice(0, 2).concat([[464, -6], [386, -6]]), 'downtown');

    // ---- Starfish Heights: three walled mansions north of the avenue, five villas on the water further north
    function mansion(x0, z0, x1, z1, gateSide) {
      const hex = pick(['#f6f2ec', '#f7d6e0', '#d6eef0', '#f4ead0', '#e6ddf4']), wallC = '#f2ede4';
      const gz = gateSide === 'south' ? z0 : z1, cx = (x0 + x1) / 2;
      // perimeter wall; on the street side it stops either side of the gate (the gate itself stays shut)
      const gateWall = (za, zb) => { bPlain.box(x0, LAND, za, cx - 3, LAND + 1.6, zb, C(wallC)); bPlain.box(cx + 3, LAND, za, x1, LAND + 1.6, zb, C(wallC)); col.add(x0, 0, za, x1, LAND + 1.6, zb); };
      if (gateSide === 'south') { gateWall(z0, z0 + .3); wall(x0, z1 - .3, x1, z1, 1.6, wallC); } else { wall(x0, z0, x1, z0 + .3, 1.6, wallC); gateWall(z1 - .3, z1); }
      wall(x0, z0, x0 + .3, z1, 1.6, wallC); wall(x1 - .3, z0, x1, z1, 1.6, wallC);
      // wrought-iron gates: black bars with gold tips, a rail top and bottom, so you can see the garden through them
      const gz0 = gz - (gateSide === 'south' ? 0 : .3), gz1 = gz + (gateSide === 'south' ? .3 : 0);
      bPlain.box(cx - 3, LAND + .05, gz0 + .12, cx + 3, LAND + .15, gz1 - .12, C('#1a1a22'));
      bPlain.box(cx - 3, LAND + 1.55, gz0 + .12, cx + 3, LAND + 1.65, gz1 - .12, C('#1a1a22'));
      for (let bx = cx - 2.85; bx < cx + 2.9; bx += .3) {
        bPlain.box(bx - .03, LAND + .05, gz0 + .13, bx + .03, LAND + 1.85, gz1 - .13, C('#1a1a22'));
        bPlain.box(bx - .05, LAND + 1.85, gz0 + .11, bx + .05, LAND + 1.95, gz1 - .11, C('#e8c547'));
      }
      for (const s of [-1, 1]) { bPlain.box(cx + s * 3 - .3, LAND, gz - .3, cx + s * 3 + .3, LAND + 2.2, gz + .3, C(wallC)); bNeon.box(cx + s * 3 - .2, LAND + 2.2, gz - .2, cx + s * 3 + .2, LAND + 2.45, gz + .2, C('#ffd84f')); }
      grass(x0 + .3, z0 + .3, x1 - .3, z1 - .3);
      const hd = (z1 - z0) * .38, hw = (x1 - x0) * .6, hz = gateSide === 'south' ? z1 - 3 - hd : z0 + 3;
      const house = building(cx - hw / 2, hz, cx + hw / 2, hz + hd, 4.2, hex, LAND);
      building(cx - hw / 2 + 1.5, hz + 1.5, cx + hw / 2 - 1.5, hz + hd - 1.5, 8, hex, 4.55);
      bPlain.box(cx - hw / 2 - .5, 8.1, hz + 1, cx + hw / 2 + .5, 8.35, hz + hd - 1, C('#e4ddd2'));
      neonRing(house.x0, house.z0, house.x1, house.z1, 4.3, pick(['#ff4fa3', '#3fe6e0', '#ffd84f']));
      // pool and palms in the garden, a drive with an expensive car
      const pz = gateSide === 'south' ? z0 + 5 : z1 - 11;
      bPlain.box(cx + 2, LAND + .04, pz, cx + hw / 2 - 1, LAND + .06, pz + 6, C('#4fd6e6'));
      bPlain.box(cx + 1.7, LAND + .04, pz - .3, cx + hw / 2 - .7, LAND + .05, pz + 6.3, C('#f6f2ec'));
      bPlain.box(cx - 2.5, LAND + .045, gateSide === 'south' ? z0 + .3 : hz + hd, cx + .5, LAND + .06, gateSide === 'south' ? hz : z1 - .3, C('#d8d0c4'));
      for (const [px, pz2] of [[x0 + 2, z0 + 2], [x1 - 2, z0 + 2], [x0 + 2, z1 - 2], [x1 - 2, z1 - 2]]) palm(px, pz2);
      parking.push({ x: cx - 1, z: gateSide === 'south' ? z0 + 6 : z1 - 6, h: gateSide === 'south' ? 0 : Math.PI, id: pick(['zefiro', 'corsaro', 'royale', 'maldiva', 'zefiro']) });
      mapShapes.push({ x0, z0, x1, z1, c: '#5a9a62', k: 'p' });
      if (R() < .7) spots.push({ kind: 'lie', x: cx + hw / 2 - 2.5, z: gateSide === 'south' ? z0 + 3 : z1 - 5, y: LAND + .12, fixedY: true, heading: 0, type: 'beach_f', home: true });
    }
    mansion(387, 8, 411, 52, 'south'); mansion(414, 8, 438, 52, 'south'); mansion(441, 8, 463, 52, 'south');
    for (let i = 0; i < 5; i++) { const x0 = 362 + i * 27.6; mansion(x0, 67, x0 + 25, 93, 'south'); }
    walker([[386, 6.5], [464, 6.5], [464, 53.5], [386, 53.5]], 'downtown', 'jogger');

    // ---- beach hotels on the south shore, loungers and umbrellas on the sand
    const ISLE_HOTELS = ['LAGUNA', 'MARLIN', 'TROPIC'];
    for (const [k, [x0, x1]] of [[365, 395], [410, 440], [455, 485]].entries()) {
      const hex = pick(PASTEL), h = 4 * Math.round(rr(3, 5)) + .6, b = building(x0, -92, x1, -70, h, hex, LAND);
      bFacade.box(b.x0 + 3, h + .35, b.z0 + 2, b.x1 - 3, h + 3, b.z1 - 3, C(hex), { tile: FT, top: C(hex).multiplyScalar(.82) });
      neonRing(b.x0, b.z0, b.x1, b.z1, 4.35, pick(NEON)); neonRing(b.x0, b.z0, b.x1, b.z1, h - .5, pick(NEON));
      pick(['HOTEL', 'PALMS', 'OCEAN', 'MOTEL']);   // keeps the island's random numbers in step
      sign('-z', b, h - 3.4, h - .9, 3, ISLE_HOTELS[k]); awning('-z', b, pick(NEON), 8);
    }
    const gap = x => x > 437 && x < 458;   // the road to the Bayview Bridge comes through here
    for (let i = 0; i < 12; i++) {
      const x = rr(360, 500), z = rr(-103, -97.5);
      if (gap(x)) { R(); pick([0]); continue; }
      bPlain.box(x - .35, SAND, z - .2, x + .35, SAND + .33, z + 2.05, C('#f5f0e6')); bPlain.box(x - .35, SAND + .33, z + 1.75, x + .35, SAND + .41, z + 2.05, C('#e8e0d0'));
      col.add(x - .35, 0, z - .2, x + .35, SAND + .45, z + 2.05);
      if (R() < .7) spots.push({ kind: 'lie', x, z: z - .08, y: SAND + .45, fixedY: true, heading: 0, mix: 'beach', home: true });
      bPlain.box(x + .6, SAND, z + .8, x + .66, SAND + 2.3, z + .86, C('#f3efe6'));
      bPlain.box(x - .6, SAND + 2.2, z - .6, x + 1.9, SAND + 2.4, z + 2.2, C(pick(['#ff6fa8', '#3fd6d0', '#ffd24f', '#b58bff'])));
    }
    for (let i = 0; i < 10; i++) { const x = rr(358, 502), z = rr(-104, -96.5); if (!gap(x)) palm(x, z, SAND); }
    for (let i = 0; i < 8; i++) palm(rr(346, 353.5), rr(10, 100), SAND);   // the west shore road runs south of the avenue
    talk(380, -99, 'beach'); talk(470, -100, 'beach');
    walker([[360, -95.8], [500, -95.8]], 'beach', 'jogger');

    // ---- Lighthouse Point: a striped tower at the end of the avenue, with a beam that turns at night
    grass(477, 8, 503, 53); grass(477, -53, 503, -8);
    for (let i = 0; i < 8; i++) palm(rr(479, 501), rr(10, 51) * (R() < .5 ? 1 : -1));
    const LHX = 510, LHZ = 0;
    for (let i = 0; i < 8; i++) { const y0 = SAND + i * 2.2, r = 2.2 - i * .12; bPlain.box(LHX - r, y0, LHZ - r, LHX + r, y0 + 2.2, LHZ + r, C(i % 2 ? '#e02a3a' : '#f6f2ec')); }
    col.add(LHX - 2.2, 0, LHZ - 2.2, LHX + 2.2, SAND + 17.6, LHZ + 2.2);
    bPlain.box(LHX - 1.8, SAND + 17.6, LHZ - 1.8, LHX + 1.8, SAND + 17.8, LHZ + 1.8, C('#2a2a30'));
    bNeon.box(LHX - 1, SAND + 17.8, LHZ - 1, LHX + 1, SAND + 19.2, LHZ + 1, C('#fff2c0'));
    bPlain.box(LHX - 1.4, SAND + 19.2, LHZ - 1.4, LHX + 1.4, SAND + 19.6, LHZ + 1.4, C('#e02a3a'));
    const beam = new THREE.Group(); beam.position.set(LHX, SAND + 18.5, LHZ); scene.add(beam);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const s of [1, -1]) beam.add(new THREE.Mesh(new THREE.CylinderGeometry(.4, 7, 120, 16, 1, true).translate(0, 60, 0).rotateZ(s * Math.PI / 2 * .985), beamMat));
    bench(490, 20, Math.PI / 2); bench(490, -20, Math.PI / 2); talk(495, 35, 'strip'); walker(loop(478, 9, 502, 52), 'town');
    for (let x = 391; x < 460; x += 12) parking.push({ x, z: 4, h: Math.PI / 2 }, { x: x + 6, z: -4, h: -Math.PI / 2 });

    // ---- lamps along the island's streets
    for (let x = 360; x < 503; x += 16) lamps.push([x, 5.8, Math.PI, LAND], [x + 8, -5.8, 0, LAND]);
    for (let x = 366; x < 500; x += 18) lamps.push([x, 54.2, 0, LAND], [x + 9, -54.2, Math.PI, LAND]);

    const districtAt = (x, z) => x < IX0 - 3 ? 'Мост NEPLOXO' : x > 476 ? 'Мыс Неплохо' : z > 58 ? 'Хайтс Not Bad' : z > 5 ? 'Хайтс Not Bad' : z < -60 ? 'Пляж Пойнт 21' : 'Пойнт 21';
    return {
      spots, parking, bounds: { x0: IX0, x1: IX1, z0: IZ0, z1: IZ1 }, deckAt,
      // the island's streets for traffic: the bridge lands on the west shore road, which runs up to the avenue;
      // the avenue and the two cross streets with the north and south streets make a ring round Vice Point.
      // bridge: the city junction it leaves from and the island junction it comes down at
      walkways: [BZ - HW + PV / 2 + .2, BZ + HW - PV / 2 - .2].map(z => [[107, z], [IX0 + 3, z]]),
      roads: { lane: 1.9, nodes: [[350, BZ], [350, 0], [380, 0], [470, 0], [380, 60], [470, 60], [380, -60], [470, -60], [447.5, -60]],
        links: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 3], [2, 6], [6, 8], [8, 7], [7, 3]], bridge: { city: [100, -100], island: 0 } },
      districtAt(x, z) { if (x > IX0 - 3 && x < IX1 + 5 && Math.abs(z) < 110) return districtAt(x, z); if (x > 140 && x <= IX0 - 3 && Math.abs(z - BZ) < HW + 1) return 'Мост NEPLOXO'; return null; },
      update(t, env) { const n = env ? env.night : 0; beamMat.opacity = n * .12; beam.visible = n > .03; beam.rotation.y = t * .5; }
    };
  };
})(window.NB);
