// North Side: the working-class island across the strait north of the city. A short low bridge from the
// end of the city's middle street, a grid of streets, and blocks of brick tenements with fire escapes,
// cheap shops (liquor, pawn, laundry, garage), warehouses with roller doors, factories with smoking
// chimneys, a container port with a crane on the north shore, a junkyard, empty lots with fires burning
// in oil drums, and two basketball courts where the gangs hang out: the Cobras (red) in the west, the
// Skulls (green) in the east, with the blocks between them a no man's land. Graffiti everywhere, few
// neon signs, few lamps. Built with the city's own builders and its own random numbers.
(function (NB) {
  'use strict';

  NB.buildNorthside = function (k) {
    const { C, U, col, scene, bPlain, bFacade, bNeon, bGlow, bAsphalt, bPaving, building, sign, awning, neonRing, mapShapes, palms, lamps, FT } = k;
    const R = U.rng(5150), rr = (a, b) => a + R() * (b - a), pick = a => a[(R() * a.length) | 0], chance = p => R() < p;
    const G0 = .45;                                         // ground level on the island (above the sea)
    const XS = [-100, -50, 0, 50, 100, 150, 200, 250], ZS = [-190, -240, -290, -340, -390], RH = 6, SW = 3;
    const B = { x0: XS[0] - RH - 4, x1: XS[XS.length - 1] + RH + 4, z0: ZS[ZS.length - 1] - RH - 4, z1: ZS[0] + RH + 4 };
    const BRICK = ['#8a3b2e', '#9c5a3c', '#6e4a3a', '#7a4636', '#a0664a'], CONCRETE = ['#8e8a86', '#7a7672', '#9a958c', '#6f6c6a'], FADED = ['#b8a88a', '#a8b0a0', '#b09a98', '#9aa4b0'];
    const spots = [], parking = [], blocks = [], barrels = [], chimneys = [];

    /* ---------- the land: a slab above the water with a sea wall round it ---------- */
    col.add(B.x0, -4, B.z0, B.x1, G0, B.z1);
    bPlain.box(B.x0, -3.6, B.z0, B.x1, G0, B.z1, C('#7c7872'));
    NB.water.hole({ x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1 });
    bAsphalt.flat(B.x0 + 4, B.z0 + 4, B.x1 - 4, B.z1 - 4, G0 + .004, C('#ffffff'), 8);
    // a strip of pavement round the edge, a kerb stone, lamps now and then
    for (const [x0, z0, x1, z1] of [[B.x0, B.z0, B.x0 + 4, B.z1], [B.x1 - 4, B.z0, B.x1, B.z1], [B.x0 + 4, B.z0, B.x1 - 4, B.z0 + 4], [B.x0 + 4, B.z1 - 4, B.x1 - 4, B.z1]]) {
      bPaving.box(x0, G0, z0, x1, G0 + .15, z1, C('#cfc8bc'), { tile: 2, topTile: 2 }); col.add(x0, 0, z0, x1, G0 + .15, z1);
    }
    mapShapes.push({ x0: B.x0, z0: B.z0, x1: B.x1, z1: B.z1, c: '#4a4452', k: 's' });
    // road markings: a dashed yellow line down the middle of every street
    for (const x of XS) for (let z = B.z0 + 6; z < B.z1 - 6; z += 6) if (!ZS.some(L => Math.abs(z + 1.5 - L) < RH + 1)) bPlain.flat(x - .1, z, x + .1, z + 3, G0 + .02, C('#c9a43e'));
    for (const zz of ZS) for (let x = B.x0 + 6; x < B.x1 - 6; x += 6) if (!XS.some(L => Math.abs(x + 1.5 - L) < RH + 1)) bPlain.flat(x, zz - .1, x + 3, zz + .1, G0 + .02, C('#c9a43e'));

    /* ---------- the bridge from the city: short, low, concrete ---------- */
    const BX = 0, BZ0 = -106, BZ1 = B.z1, DECK = 3.2, RAMP = 16, RW = 5.2, PW = 7.5;   // road half-width, pavement to 7.5
    const deckY = z => { const t0 = U.clamp((BZ0 - z) / RAMP, 0, 1), t1 = U.clamp((z - BZ1) / RAMP, 0, 1); return Math.min(.15 + (DECK - .15) * t0, G0 + (DECK - G0) * t1); };
    // a smooth sloped slab from (za, ya) to (zb, yb), za < zb, across x0..x1: top, underside and both sides
    const FLAT = [.03, .5];
    function slabZ(x0, x1, za, ya, zb, yb, th, hex) {
      const c = C(hex), s = (yb - ya) / (zb - za), n = 1 / Math.hypot(s, 1), d = c.clone().multiplyScalar(.7), e = c.clone().multiplyScalar(.85);
      bPlain.quad([x0, yb, zb], [x1, yb, zb], [x1, ya, za], [x0, ya, za], 0, n, -s * n, c, FLAT, FLAT, FLAT, FLAT);
      bPlain.quad([x0, ya - th, za], [x1, ya - th, za], [x1, yb - th, zb], [x0, yb - th, zb], 0, -n, s * n, d, FLAT, FLAT, FLAT, FLAT);
      bPlain.quad([x1, yb - th, zb], [x1, ya - th, za], [x1, ya, za], [x1, yb, zb], 1, 0, 0, e, FLAT, FLAT, FLAT, FLAT);
      bPlain.quad([x0, ya - th, za], [x0, yb - th, zb], [x0, yb, zb], [x0, ya, za], -1, 0, 0, e, FLAT, FLAT, FLAT, FLAT);
    }
    // what you see: a smooth road with a raised pavement for people on each side and parapets, in three pieces
    const ZK = [BZ1, BZ1 + RAMP, BZ0 - RAMP, BZ0];
    for (let k = 0; k < 3; k++) {
      const za = ZK[k], zb = ZK[k + 1], ya = deckY(za), yb = deckY(zb);
      slabZ(BX - RW, BX + RW, za, ya, zb, yb, .6, '#4a4652');
      slabZ(BX - PW, BX - RW, za, ya + .15, zb, yb + .15, .75, '#b9b2a6'); slabZ(BX + RW, BX + PW, za, ya + .15, zb, yb + .15, .75, '#b9b2a6');
      slabZ(BX - PW - .3, BX - PW, za, ya + 1.15, zb, yb + 1.15, 1.15, '#a8a298'); slabZ(BX + PW, BX + PW + .3, za, ya + 1.15, zb, yb + 1.15, 1.15, '#a8a298');
      // kerb lines and a dashed yellow middle line
      for (const x of [BX - RW - .04, BX + RW - .08]) slabZ(x, x + .12, za, ya + .16, zb, yb + .16, .02, '#e8e2d6');
      for (let z = za; z < zb - 1; z += 6) { const z2 = Math.min(zb, z + 3); slabZ(BX - .1, BX + .1, z, deckY(z) + .015, z2, deckY(z2) + .015, .01, '#c9a43e'); }
    }
    // what you walk and drive on: small invisible steps (ramps for cars)
    for (let z = BZ0; z > BZ1; z -= .7) {
      const z1 = Math.max(BZ1, z - .7), y = deckY((z + z1) / 2);
      for (const b of [col.add(BX - RW, y - .6, z1, BX + RW, y, z), col.add(BX - PW, y - .6, z1, BX - RW, y + .15, z), col.add(BX + RW, y - .6, z1, BX + PW, y + .15, z)]) b.ramp = true;
      col.add(BX - PW - .3, y, z1, BX - PW, y + 1.15, z); col.add(BX + PW, y, z1, BX + PW + .3, y + 1.15, z);
    }
    for (const z of [-122, -140, -158]) for (const x of [BX - 4.5, BX + 3]) { bPlain.box(x, -4, z - .75, x + 1.5, deckY(z) - .6, z + .75, C('#9a948a')); col.add(x, -4, z - .75, x + 1.5, deckY(z) - .6, z + .75); }
    for (let z = BZ0 - 6; z > BZ1 + 4; z -= 18) lamps.push([BX - 7, z, Math.PI / 2, deckY(z) + .15], [BX + 7, z - 9, -Math.PI / 2, deckY(z - 9) + .15]);
    mapShapes.push({ x0: BX - 7.8, z0: BZ1, x1: BX + 7.8, z1: BZ0, c: '#6a6474', k: 's' });
    // guard rails along the sea wall either side of both ends, so nothing drives off into the water there
    for (const s of [-1, 1]) for (const [z0, z1, y] of [[-112, -111.6, .15], [BZ1 - .4, BZ1, G0 + .15]]) {
      const x0 = s < 0 ? BX - 30 : BX + 7.8, x1 = s < 0 ? BX - 7.8 : BX + 30;
      bPlain.box(x0, y, z0, x1, y + .9, z1, C('#c8c4bc')); bPlain.box(x0, y + .75, z0 - .05, x1, y + .9, z1 + .05, C('#e8202a')); col.add(x0, 0, z0, x1, y + .9, z1);
    }

    /* ---------- graffiti: a sheet of tags sprayed onto walls ---------- */
    const TAGS = ['COBRAS', 'SKULLS', '21', 'RUST', 'KINGS', 'ZERO', 'WILD', 'NO COPS'];
    const tagTex = U.canvasTex(512, 256, (g) => {
      TAGS.forEach((t, i) => {
        const x = (i % 4) * 128, y = ((i / 4) | 0) * 128, c = t === 'COBRAS' ? '#e8202a' : t === 'SKULLS' ? '#2bd67b' : pick(['#ff4fa3', '#3fe6e0', '#ffd23d', '#f5f5f0', '#9b5cff']);
        g.save(); g.translate(x + 64, y + 64); g.rotate(rr(-.25, .25));
        g.font = 'italic 900 30px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 7; g.strokeStyle = '#141018'; g.strokeText(t, 0, 0); g.fillStyle = c; g.fillText(t, 0, 0);
        g.fillStyle = c; for (let k = 0; k < 5; k++) g.fillRect(rr(-50, 50), rr(8, 14), 2, rr(6, 20));   // drips
        g.restore();
      });
    }, false);
    const tagMat = new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, alphaTest: .1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    function tag(face, b, off, word) {
      const i = word ? TAGS.indexOf(word) : (R() * TAGS.length) | 0, c = i % 4, r = (i / 4) | 0;
      const g = new THREE.PlaneGeometry(3.2, 1.6), uv = g.attributes.uv;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, (c + uv.getX(q)) / 4, 1 - (r + 1 - uv.getY(q)) / 2);
      const m = new THREE.Mesh(g, tagMat), cx = (b.x0 + b.x1) / 2 + (face[1] === 'z' ? off : 0), cz = (b.z0 + b.z1) / 2 + (face[1] === 'x' ? off : 0);
      const n = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[face];
      m.position.set(face === '+x' ? b.x1 + .02 : face === '-x' ? b.x0 - .02 : cx, G0 + 1.3, face === '+z' ? b.z1 + .02 : face === '-z' ? b.z0 - .02 : cz);
      m.rotation.y = Math.atan2(n[0], n[1]); scene.add(m);
    }
    const faceOf = (b, cx, cz) => { const dx = (b.x0 + b.x1) / 2 - cx, dz = (b.z0 + b.z1) / 2 - cz; return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? '+x' : '-x') : (dz > 0 ? '+z' : '-z'); };
    const barrel = (x, z) => { bPlain.box(x - .3, G0 + .15, z - .3, x + .3, G0 + 1.05, z + .3, C('#5a3a2a')); col.add(x - .3, 0, z - .3, x + .3, G0 + 1.05, z + .3); barrels.push([x, G0 + 1.1, z]); };
    const talk = (x, z, type, y, gang) => { const grp = {}, n = chance(.4) ? 3 : 2, seed = R() * 10; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; spots.push({ kind: 'talk', x: x + Math.sin(a) * .6, z: z + Math.cos(a) * .6, y, fixedY: true, heading: Math.atan2(-Math.sin(a), -Math.cos(a)), mix: 'north', type: typeof type === 'function' ? type() : type, seed, idx: i, n, grp, home: true, gang }); } };
    const gangType = g => () => g === 'red' ? 'gang_red' : 'gang_green';

    /* ---------- street level: the ground floor of every building is built by hand ---------- */
    const GF = G0 + 3.6;                                    // top of the ground floor (the facade texture's windows start above it)
    // a rectangle on face f of box b, 'off' along the face, half-width hw, sticking out 'out'
    const fr = (f, b, out, hw, off) => {
      const cx = (b.x0 + b.x1) / 2 + (f[1] === 'z' ? off : 0), cz = (b.z0 + b.z1) / 2 + (f[1] === 'x' ? off : 0);
      return f === '+x' ? [b.x1, cz - hw, b.x1 + out, cz + hw] : f === '-x' ? [b.x0 - out, cz - hw, b.x0, cz + hw] : f === '+z' ? [cx - hw, b.z1, cx + hw, b.z1 + out] : [cx - hw, b.z0 - out, cx + hw, b.z0];
    };
    const fbox = (f, b, out, hw, off, y0, y1, hex, mat) => { const [a, c, d, e] = fr(f, b, out, hw, off); (mat || bPlain).box(a, y0, c, d, y1, e, C(hex)); };
    const faceLen = (f, b) => f[1] === 'x' ? b.z1 - b.z0 : b.x1 - b.x0;
    // the other face of a corner building that looks onto a street
    const sideOf = (b, f, cx, cz) => f[1] === 'x' ? ((b.z0 + b.z1) / 2 > cz ? '+z' : '-z') : ((b.x0 + b.x1) / 2 > cx ? '+x' : '-x');
    const DOORS = ['#3a2a22', '#2a3a4a', '#4a2a2a', '#2f4a3a', '#5a4630', '#3a3a40'];
    // a solid ground floor round the building with a stone band on top
    function groundFloor(b, Y, hex) {
      bPlain.box(b.x0 - .05, Y, b.z0 - .05, b.x1 + .05, GF, b.z1 + .05, C(hex), { noTop: true });
      bPlain.box(b.x0 - .14, GF - .05, b.z0 - .14, b.x1 + .14, GF + .2, b.z1 + .14, C('#b8b0a2'));
    }
    // a front door: frame, door, window or knob, a step, a little roof and a lamp over it
    function door(f, b, off, Y, hex, glass) {
      fbox(f, b, .1, .78, off, Y, Y + 2.5, '#d8cfc0');
      fbox(f, b, .14, .6, off, Y, Y + 2.3, hex);
      if (glass) fbox(f, b, .16, .45, off, Y + 1.1, Y + 2.1, '#8a8a70', bNeon);
      else { fbox(f, b, .16, .4, off, Y + 1.5, Y + 2.1, '#2a2e38'); fbox(f, b, .2, .05, off + .4, Y + 1.05, Y + 1.15, '#d0b060'); }
      fbox(f, b, .7, .95, off, Y, Y + .14, '#9a948a');
      fbox(f, b, .85, 1.05, off, Y + 2.6, Y + 2.72, '#3a3230');
      fbox(f, b, .22, .12, off, Y + 2.85, Y + 3.05, '#ffd9a0', bNeon);
    }
    // ground-floor windows along a face, leaving a gap of half-width 'skip' round offset 0
    function windowsAlong(f, b, Y, skip, bars) {
      const L = faceLen(f, b);
      for (let off = -L / 2 + 2; off <= L / 2 - 2; off += 3.2) {
        if (Math.abs(off) < skip) continue;
        fbox(f, b, .08, .8, off, Y + .9, Y + 2.8, '#d8cfc0');
        const lit = chance(.2);
        fbox(f, b, .12, .64, off, Y + 1.02, Y + 2.68, lit ? '#6a5a3e' : '#1e2230', lit ? bNeon : bPlain);
        fbox(f, b, .24, .9, off, Y + .84, Y + .96, '#b8b0a2');
        if (bars) for (let q = -.5; q <= .5; q += .25) fbox(f, b, .2, .025, off + q, Y + 1.02, Y + 2.68, '#2a2a2e');
      }
    }

    /* ---------- the blocks ---------- */
    // what stands where: the docks along the north shore, factories and a junkyard behind them, tenements and shops
    // towards the bridge; each gang's court in the middle of its turf
    const PLAN = [
      ['shops', 'lot', 'shops', 'sport', 'lot', 'tenements', 'warehouse'],
      ['tenements', 'court', 'tenements', 'shops', 'tenements', 'court', 'tenements'],
      ['factory', 'factory', 'tenements', 'prison', 'warehouse', 'junkyard', 'factory'],
      ['warehouse', 'warehouse', 'containers', 'containers', 'containers', 'containers', 'warehouse']
    ];
    const turf = x => x < 50 ? 'red' : x > 100 ? 'green' : null;

    /* ---------- NORTH SIDE PRISON: in no man's land between the gangs ---------- */
    // a concrete wall with razor wire, a watchtower with a guard at each corner, a gate kept by two officers,
    // the exercise yard (basketball, weights, tables, inmates walking laps) and Block A at the back, whose
    // door leads into the cells (places.js). Only the inmates can't get past the gate.
    let prison = null, sport = null;
    // NOT BAD BOXING and NEPLOXO GYM: one concrete building by the bridge, two doors, two big signs
    function buildSport(lx0, lx1, lz0, lz1, Y) {
      const b = building(lx0 + 1, lz0 + 3, lx1 - 1, lz1, G0 + 11, '#4a4e58', Y);
      bPlain.box(b.x0 - .1, G0 + 10.4, b.z0 - .1, b.x1 + .1, G0 + 11, b.z1 + .1, C('#2a2e36'));
      groundFloor(b, Y, '#2a2e36');
      const bcx = (b.x0 + b.x1) / 2, bcz = (b.z0 + b.z1) / 2;
      door('+z', b, -7, Y, '#c81e2a', true); door('+z', b, 7, Y, '#1c3a6a', true);
      windowsAlong('+z', b, Y, 9, false);
      const board = (text, sub, x, col, bg) => {
        const t = U.canvasTex(512, 128, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = '900 52px Rubik, "Arial Black", Arial, sans-serif'; g.shadowColor = col; g.shadowBlur = 14; g.fillText(text, w / 2, 70); g.shadowBlur = 0; g.font = 'bold 22px Rubik, Arial, sans-serif'; g.fillStyle = col; g.fillText(sub, w / 2, 106); }, false);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: t })); m.position.set(bcx + x, GF + 1.6, b.z1 + .08); scene.add(m);
        bGlow.box(bcx + x - 4.7, GF + .4, b.z1 + .05, bcx + x + 4.7, GF + 2.8, b.z1 + .3, C(col).multiplyScalar(.5), { noTop: true });
      };
      board('NOT BAD BOXING', 'ринг · спарринги · чемпионы Района 21', -7, '#ff3a3a', '#141418');
      board('NEPLOXO GYM', 'железо · дорожки · турник', 7, '#3fe6e0', '#10202a');
      // the logo high up on the corner, lit
      const lt = U.canvasTex(256, 256, (g, w) => { g.clearRect(0, 0, w, w); if (NB.drawLogo) NB.drawLogo(g, w / 2, w / 2, w * .48); }, false);
      const lm = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshBasicMaterial({ map: lt, transparent: true })); lm.position.set(bcx, G0 + 8.2, b.z1 + .08); scene.add(lm);
      mapShapes.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, c: '#c83a4a', k: 'b' });
      const d = (off, hex) => ({ x: bcx + off, z: b.z1 + 1.3, y: Y, heading: 0, nx: 0, nz: 1, hex, cx: bcx, cz: bcz });
      return { x: bcx, z: bcz, boxing: d(-7, '#ff3a3a'), gym: d(7, '#3fe6e0') };
    }
    function buildPrison(bx0, bx1, bz0, bz1, cx, Y) {
      const X0 = bx0 + 1, X1 = bx1 - 1, Z0 = bz0 + 1, Z1 = bz1 - 1, WH = 5.5, T = .6, GW = 1.8, CONC = '#9a958c', DARK = '#3a3a40';
      const box = (x0, y0, z0, x1, y1, z1, hex, solid) => { bPlain.box(x0, y0, z0, x1, y1, z1, C(hex)); if (solid) return col.add(x0, y0 < 1 ? 0 : y0, z0, x1, y1, z1); };
      const wall = (x0, z0, x1, z1) => {
        box(x0, Y, z0, x1, Y + WH, z1, CONC, true);
        box(x0 - .05, Y + WH, z0 - .05, x1 + .05, Y + WH + .12, z1 + .05, '#7a7672');
        // razor wire: loops along the top
        const along = x1 - x0 > z1 - z0, L = along ? x1 - x0 : z1 - z0;
        for (let s = .25; s < L; s += .5) { const x = along ? x0 + s : (x0 + x1) / 2, z = along ? (z0 + z1) / 2 : z0 + s; box(x - .2, Y + WH + .12, z - .2, x + .2, Y + WH + .5, z + .2, DARK); }
      };
      wall(X0, Z0, X1, Z0 + T); wall(X0, Z0, X0 + T, Z1); wall(X1 - T, Z0, X1, Z1);
      wall(X0, Z1 - T, cx - GW, Z1); wall(cx + GW, Z1 - T, X1, Z1);
      // the gate: heavy pillars, a lintel with the name, the steel gates slid open against the wall
      for (const s of [-1, 1]) box(cx + s * GW - .5, Y, Z1 - .9, cx + s * GW + .5, Y + 6.6, Z1 + .3, '#7a7672', true);
      box(cx - GW, Y + 4.4, Z1 - .8, cx + GW, Y + 5.6, Z1 + .2, '#7a7672', true);
      for (const s of [-1, 1]) { box(cx + s * GW, Y, Z1 - 1.3, cx + s * (GW + 3.4), Y + 4, Z1 - 1.2, '#4a4e54'); for (let x = GW + .2; x < GW + 3.4; x += .3) box(cx + s * x - .03, Y, Z1 - 1.34, cx + s * x + .03, Y + 4, Z1 - 1.16, '#2a2e34'); }
      col.add(cx - GW, 0, Z1 - T, cx + GW, Y + 4.4, Z1).npcOnly = true;   // inmates stay in
      const signT = U.canvasTex(512, 96, (g, w, h) => { g.fillStyle = '#1c2a3e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e8c547'; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#f2f2ec'; g.textAlign = 'center'; g.font = 'bold 40px Rubik, Arial, sans-serif'; g.fillText('ТЮРЬМА РАЙОНА 21', w / 2, 50); g.font = '22px Rubik, Arial, sans-serif'; g.fillStyle = '#e8c547'; g.fillText('ИСПРАВИТЕЛЬНОЕ УЧРЕЖДЕНИЕ №1', w / 2, 80); }, false);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .68), new THREE.MeshBasicMaterial({ map: signT })); sg.position.set(cx, Y + 5, Z1 + .22); scene.add(sg);
      // watchtowers at the corners, a guard in each
      for (const [x, z] of [[X0 + 1.2, Z0 + 1.2], [X1 - 1.2, Z0 + 1.2], [X0 + 1.2, Z1 - 1.2], [X1 - 1.2, Z1 - 1.2]]) {
        box(x - 1, Y, z - 1, x + 1, Y + 7, z + 1, CONC, true);
        box(x - 1.7, Y + 7, z - 1.7, x + 1.7, Y + 7.2, z + 1.7, '#7a7672', true);
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(x + a * 1.55 - .08, Y + 7.2, z + b * 1.55 - .08, x + a * 1.55 + .08, Y + 9.4, z + b * 1.55 + .08, '#5a5a60');
        for (const [a, b, c, d] of [[-1.7, -1.7, 1.7, -1.6], [-1.7, 1.6, 1.7, 1.7], [-1.7, -1.7, -1.6, 1.7], [1.6, -1.7, 1.7, 1.7]]) box(x + a, Y + 7.2, z + b, x + c, Y + 8.2, z + d, '#7a7672', true);
        bNeon.box(x - 1.62, Y + 8.2, z - 1.62, x + 1.62, Y + 8.6, z + 1.62, C('#4a6070'));
        box(x - 1.9, Y + 9.4, z - 1.9, x + 1.9, Y + 9.7, z + 1.9, '#4a4e54');
        bNeon.box(x - .3, Y + 9.7, z - .3, x + .3, Y + 10, z + .3, C('#fff2c0'));   // the searchlight
        spots.push({ kind: 'guard', x, z, y: Y + 7.2, fixedY: true, heading: Math.atan2(cx - x, (Z0 + Z1) / 2 - z), type: 'cop', mix: 'north', home: true });
      }
      // Block A: three storeys of concrete with barred slits, the door to the cells in front
      const BZ = Z1 - 19, BH = 9;
      box(X0 + 3, Y, Z0 + T, X1 - 3, Y + BH, BZ, '#a8a49c', true);
      box(X0 + 2.8, Y + BH, Z0 + T, X1 - 2.8, Y + BH + .35, BZ + .2, '#7a7672');
      for (const y of [Y + 1.6, Y + 4.6, Y + 7.3]) for (let x = X0 + 4.5; x < X1 - 4; x += 2.4) {
        if (Math.abs(x - cx) < 2.4 && y < Y + 3) continue;
        box(x, y, BZ, x + .9, y + 1.1, BZ + .05, '#1e2230');
        for (let q = .15; q < .9; q += .2) box(x + q - .025, y, BZ + .05, x + q + .025, y + 1.1, BZ + .09, '#8a8a90');
      }
      box(cx - 1.3, Y, BZ, cx + 1.3, Y + 3, BZ + .15, '#5a5e64'); box(cx - .9, Y, BZ + .15, cx + .9, Y + 2.6, BZ + .2, '#2a2e34');
      bNeon.box(cx - .6, Y + 3.2, BZ + .1, cx + .6, Y + 3.45, BZ + .3, C('#ffb030'));
      const aT = U.canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#1c2a3e'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2f2ec'; g.textAlign = 'center'; g.font = 'bold 36px Rubik, Arial, sans-serif'; g.fillText('БЛОК А', w / 2, 45); }, false);
      const as = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .6), new THREE.MeshBasicMaterial({ map: aT })); as.position.set(cx, Y + 3.9, BZ + .2); scene.add(as);
      // the yard: asphalt with painted lines, a basketball hoop, weights, steel tables, floodlights
      const YZ0 = BZ, YZ1 = Z1 - T;
      box(X0 + T, Y, YZ0, X1 - T, Y + .01, YZ1, '#5e5a56');
      for (const [a, b, c, d] of [[X0 + 2, YZ0 + 1.5, X1 - 2, YZ0 + 1.6], [X0 + 2, YZ1 - 1.6, X1 - 2, YZ1 - 1.5], [X0 + 2, YZ0 + 1.5, X0 + 2.1, YZ1 - 1.5], [X1 - 2.1, YZ0 + 1.5, X1 - 2, YZ1 - 1.5]]) bPlain.flat(a, b, c, d, Y + .02, C('#e8c547'));
      { const hx = X0 + 6, hz = YZ0 + 2; box(hx - .1, Y, hz - .1, hx + .1, Y + 3.3, hz + .1, '#d0d0d4', true); box(hx - .9, Y + 3, hz + .1, hx + .9, Y + 4.1, hz + .2, '#f5f5f0'); box(hx - .25, Y + 3.05, hz + .2, hx + .25, Y + 3.08, hz + .6, '#e8502a'); }
      for (const [x, z] of [[X1 - 9, YZ0 + 4], [X1 - 6, YZ0 + 4], [X1 - 7.5, YZ0 + 8]]) {
        box(x - .3, Y, z - .9, x + .3, Y + .45, z + .9, '#3a3a40', true);
        box(x - .8, Y + 1.2, z - .03, x + .8, Y + 1.26, z + .03, '#8a8a90'); for (const s of [-1, 1]) box(x + s * .7 - .05, Y + 1, z - .2, x + s * .7 + .05, Y + 1.46, z + .2, '#1a1a1e');
        for (const s of [-1, 1]) box(x + s * .8 - .04, Y, z - .04, x + s * .8 + .04, Y + 1.2, z + .04, '#8a8a90');
        spots.push({ kind: 'sit', x, z, y: Y + .51, heading: Math.PI / 2, type: 'prisoner', mix: 'north', home: true });
      }
      for (const [x, z] of [[cx - 5, YZ1 - 7], [cx + 5, YZ1 - 7]]) {
        box(x - 1.2, Y, z - .5, x + 1.2, Y + .8, z + .5, '#8a8a90', true);
        for (const s of [-1, 1]) { box(x - 1.2, Y, z + s * 1.05 - .2, x + 1.2, Y + .45, z + s * 1.05 + .2, '#8a8a90', true); for (const dx of [-.6, .6]) if (chance(.7)) spots.push({ kind: 'sit', x: x + dx, z: z + s * 1.1, y: Y + .51, heading: s > 0 ? Math.PI : 0, type: 'prisoner', mix: 'north', home: true }); }
      }
      for (const [x, z] of [[X0 + 1.2, YZ0 + 1], [X1 - 1.2, YZ0 + 1], [cx - 9, YZ1 - 1], [cx + 9, YZ1 - 1]]) { box(x - .12, Y, z - .12, x + .12, Y + 8, z + .12, '#6a6a70', true); bNeon.box(x - .5, Y + 8, z - .3, x + .5, Y + 8.3, z + .3, C('#fff6dc')); }
      // inmates walking laps, standing about in twos and threes, and the officers watching them
      const lap = [[X0 + 3, YZ1 - 2.5], [X1 - 3, YZ1 - 2.5], [X1 - 3, YZ0 + 11], [X0 + 3, YZ0 + 11]];
      for (let k = 0; k < 4; k++) { const P = lap.slice(k).concat(lap.slice(0, k)); spots.push({ kind: 'walk', x: P[0][0], z: P[0][1], y: Y, fixedY: true, heading: 0, type: 'prisoner', mix: 'north', patrol: P }); }
      for (const [x, z] of [[X0 + 7, YZ0 + 5], [cx, YZ1 - 11], [X1 - 12, YZ1 - 4], [X0 + 11, YZ1 - 4]]) talk(x, z, 'prisoner', Y);
      spots.push({ kind: 'walk', x: X0 + 4, z: YZ0 + 3, y: Y, fixedY: true, heading: 0, type: 'cop', mix: 'north', patrol: [[X0 + 4, YZ0 + 3], [X1 - 4, YZ0 + 3], [X1 - 4, YZ1 - 3.5], [X0 + 4, YZ1 - 3.5]] });
      spots.push({ kind: 'guard', x: cx + 2.2, z: BZ + 1, y: Y, fixedY: true, heading: 0, type: 'cop', mix: 'north', home: true });
      for (const s of [-1, 1]) spots.push({ kind: 'guard', x: cx + s * 2.9, z: Z1 + 1.3, y: Y, fixedY: true, heading: 0, type: 'cop', mix: 'north', home: true });
      // a guard booth just inside the gate
      box(cx + 3, Y, Z1 - 4.2, cx + 5.6, Y + 2.8, Z1 - T, '#7a7672', true); bNeon.box(cx + 2.96, Y + 1.2, Z1 - 3.9, cx + 3, Y + 2.2, Z1 - 1, C('#6a8090'));
      spots.push({ kind: 'guard', x: cx + 2.4, z: Z1 - 2.6, y: Y, fixedY: true, heading: -Math.PI / 2, type: 'cop', mix: 'north', home: true });
      mapShapes.push({ x0: X0, z0: Z0, x1: X1, z1: Z1, c: '#5a6270', k: 'b' });
      return { x: cx, z: (Z0 + Z1) / 2, door: { x: cx, z: BZ + 1.3, y: Y, heading: 0, nx: 0, nz: 1, hex: '#ffb030', cx, cz: (Z0 + Z1) / 2 } };
    }
    for (let j = 0; j < ZS.length - 1; j++) for (let i = 0; i < XS.length - 1; i++) {
      const bx0 = XS[i] + RH, bx1 = XS[i + 1] - RH, bz1 = ZS[j] - RH, bz0 = ZS[j + 1] + RH;
      const lx0 = bx0 + SW, lx1 = bx1 - SW, lz0 = bz0 + SW, lz1 = bz1 - SW, cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      const type = PLAN[j][i], gang = turf(cx), Y = G0 + .15;
      bPaving.box(bx0, G0, bz0, bx1, Y, bz1, C('#c8c0b4'), { tile: 2, topTile: 2 }); col.add(bx0, 0, bz0, bx1, Y, bz1);
      mapShapes.push({ x0: bx0, z0: bz0, x1: bx1, z1: bz1, c: '#7e7888', k: 's' });
      blocks.push({ i: 100 + i, j: 100 + j, bx0, bx1, bz0, bz1, type: 'north', north: true });
      // a lamp or two on the corners (some of them broken)
      for (const [x, z, r] of [[bx0 + .9, bz0 + 10, -Math.PI / 2], [bx1 - .9, bz1 - 10, Math.PI / 2]]) if (chance(.65)) lamps.push([x, z, r, Y]);

      if (type === 'tenements') {
        // three or four brick walk-ups round the block, fire escapes zigzagging down their fronts
        const half = [[lx0, lz0, cx - 1, cz - 1], [cx + 1, lz0, lx1, cz - 1], [lx0, cz + 1, cx - 1, lz1], [cx + 1, cz + 1, lx1, lz1]];
        for (const [x0, z0, x1, z1] of half) {
          if (chance(.15)) { barrel(rr(x0 + 3, x1 - 3), rr(z0 + 3, z1 - 3)); continue; }   // a gap: a yard with a fire
          const h = G0 + 4 * (2 + ((R() * 3) | 0)) + .4, b = building(x0, z0, x1, z1, h, pick(BRICK), Y);
          bPlain.box(x0 - .1, h - .6, z0 - .1, x1 + .1, h, z1 + .1, C('#5a3a30'));
          const f = faceOf(b, cx, cz), sd = sideOf(b, f, cx, cz);
          // the street floor: a way in under the fire escape, windows either side (barred on some), a blank middle on the side wall for tags
          groundFloor(b, Y, pick(['#4a2a22', '#553128', '#3e2a24']));
          door(f, b, 0, Y, pick(DOORS));
          windowsAlong(f, b, Y, 2.2, chance(.4)); windowsAlong(sd, b, Y, 5, chance(.4));
          // the fire escape: a landing with a railing on every floor, posts at both ends, a ladder down the side
          const top = h - 1.2, [ea, ec, ed, ee] = fr(f, b, 1.1, 3, 0);
          for (let y = GF; y < top; y += 4) { bPlain.box(ea, y, ec, ed, y + .08, ee, C('#2a2426')); bPlain.box(ea, y + .9, ec, ed, y + .95, ee, C('#2a2426')); }
          for (const o of [-2.96, 2.96]) { const [a, c, d, e] = fr(f, b, 1.1, .04, o); const [a2, c2, d2, e2] = f === '+x' ? [d - .08, c, d, e] : f === '-x' ? [a, c, a + .08, e] : f === '+z' ? [a, e - .08, d, e] : [a, c, d, c + .08]; bPlain.box(a2, GF, c2, d2, top, e2, C('#2a2426')); }
          fbox(f, b, .95, .22, 2.3, GF - 2.2, top, '#2a2426');
          // air conditioners here and there
          for (let y = GF + 1.2; y < h - 2; y += 4) if (chance(.45)) { const o = rr(-faceLen(sd, b) / 2 + 1.5, faceLen(sd, b) / 2 - 1.5); fbox(sd, b, .55, .45, o, y, y + .6, '#c8c4bc'); }
          bPlain.box((x0 + x1) / 2 - 1, h + .6, (z0 + z1) / 2 - 1, (x0 + x1) / 2 + 1, h + 3, (z0 + z1) / 2 + 1, C('#6a5040'));   // the water tank on legs
          for (const dx of [-.85, .85]) for (const dz of [-.85, .85]) bPlain.box((x0 + x1) / 2 + dx - .08, h, (z0 + z1) / 2 + dz - .08, (x0 + x1) / 2 + dx + .08, h + .6, (z0 + z1) / 2 + dz + .08, C('#3a2a22'));
          if (chance(.85)) tag(sd, b, 0);
          // steps up to the door: someone may be sitting on them
          { const [sx, sz] = f === '+x' ? [x1 + .9, (z0 + z1) / 2] : f === '-x' ? [x0 - .9, (z0 + z1) / 2] : f === '+z' ? [(x0 + x1) / 2, z1 + .9] : [(x0 + x1) / 2, z0 - .9];
            if (chance(.6)) spots.push({ kind: 'sit', x: sx, z: sz, y: Y + .45, fixedY: true, heading: f === '+x' ? Math.PI / 2 : f === '-x' ? -Math.PI / 2 : f === '+z' ? 0 : Math.PI, mix: 'north', home: true });
            bPlain.box(sx - .8, Y, sz - .8, sx + .8, Y + .2, sz + .8, C('#a09a90'));
            bPlain.box(sx - .8 + (f === '+x' ? 0 : f === '-x' ? .5 : 0), Y + .2, sz - .8 + (f === '-z' ? .5 : 0), sx + .8 - (f === '+x' ? .5 : 0), Y + .4, sz + .8 - (f === '+z' ? .5 : 0), C('#a09a90')); }
        }
        if (chance(.5)) talk(bx0 + 1.8, cz + rr(-8, 8), gang ? gangType(gang) : null, Y, gang);
      } else if (type === 'shops') {
        const words = ['LIQUOR', 'PAWN', 'LAUNDRY', 'GARAGE', 'PIZZA', 'VIDEO', 'DINER', 'TATTOO'];
        for (const [x0, z0, x1, z1] of [[lx0, lz0, cx - 1, cz - 1], [cx + 1, lz0, lx1, cz - 1], [lx0, cz + 1, cx - 1, lz1], [cx + 1, cz + 1, lx1, lz1]]) {
          const b = building(x0, z0, x1, z1, G0 + rr(5, 8), pick(FADED), Y), f = faceOf(b, cx, cz), sd = sideOf(b, f, cx, cz), L = faceLen(f, b);
          groundFloor(b, Y, pick(['#5a4a44', '#44505a', '#4f4a3e', '#5a4038']));
          // a shop front: two big windows lit from inside, a glass door between them, an awning, the sign above
          const ww = Math.min(4.5, L / 4 - 1.2), barred = chance(.6);
          for (const off of [-(ww + 1.4), ww + 1.4]) {
            fbox(f, b, .1, ww + .15, off, Y + .45, Y + 2.55, '#2a2a2e');
            fbox(f, b, .14, ww, off, Y + .6, Y + 2.4, pick(['#7a6a4a', '#6a7078', '#7a5a5a', '#5a6a58']), bNeon);
            if (barred) for (let q = -ww; q <= ww; q += .45) fbox(f, b, .22, .03, off + q, Y + .6, Y + 2.4, '#2a2a2e');
          }
          door(f, b, 0, Y, '#2a2a2e', true);
          fbox(f, b, 1.5, Math.min(L / 2 - .5, 2 * ww + 3), 0, Y + 2.8, Y + 3.0, pick(['#8a1f2a', '#2a3f6b', '#3b5a3a', '#6b4423']));
          sign(f, b, Y + 3.3, Y + 4.7, 1.5, pick(words));
          windowsAlong(sd, b, Y, 5, true);
          if (chance(.8)) tag(sd, b, 0);
          // a phone box on the kerb outside some of them
          if (chance(.35)) {
            const [a, c, d, e] = fr(f, b, 3, .45, L / 2 - 2);
            const o = f === '+x' ? [d - .9, c, d - .1, e] : f === '-x' ? [a + .1, c, a + .9, e] : f === '+z' ? [a, e - .9, d, e - .1] : [a, c + .1, d, c + .9];
            bPlain.box(o[0], Y, o[1], o[2], Y + 2.3, o[3], C('#c8c4bc')); bNeon.box(o[0] + .05, Y + 2.05, o[1] + .05, o[2] - .05, Y + 2.25, o[3] - .05, C('#3f8fe6')); col.add(o[0], 0, o[1], o[2], Y + 2.3, o[3]);
          }
        }
        talk(bx1 - 1.8, cz + rr(-6, 6), gang && chance(.4) ? gangType(gang) : null, Y, gang && chance(.4) ? gang : undefined);
      } else if (type === 'warehouse') {
        const b = building(lx0, lz0, lx1, lz1, G0 + rr(8, 11), pick(CONCRETE), Y), f = faceOf(b, i === 0 ? cx + 50 : cx - 50, cz);
        bPlain.box(b.x0 - .1, b.h - .5, b.z0 - .1, b.x1 + .1, b.h, b.z1 + .1, C('#5a5854'));
        groundFloor(b, Y, '#5e5c58');
        if (faceLen(f, b) > 28) door(f, b, faceLen(f, b) / 2 - 2.5, Y, '#4a4a50');
        for (const off of [-8, 0, 8]) { const [dx0, dz0, dx1, dz1] = f === '+x' ? [b.x1, (lz0 + lz1) / 2 + off - 2.2, b.x1 + .08, (lz0 + lz1) / 2 + off + 2.2] : f === '-x' ? [b.x0 - .08, (lz0 + lz1) / 2 + off - 2.2, b.x0, (lz0 + lz1) / 2 + off + 2.2] : f === '+z' ? [(lx0 + lx1) / 2 + off - 2.2, b.z1, (lx0 + lx1) / 2 + off + 2.2, b.z1 + .08] : [(lx0 + lx1) / 2 + off - 2.2, b.z0 - .08, (lx0 + lx1) / 2 + off + 2.2, b.z0]; bPlain.box(dx0, Y, dz0, dx1, Y + 4, dz1, C(pick(['#6a7078', '#8a7a4a', '#5a6a5a']))); }
        tag(f, b, pick([-4, 4])); if (chance(.6)) tag(f, b, -12);
      } else if (type === 'factory') {
        const b = building(lx0, lz0, lx1, lz1 - 6, G0 + rr(9, 12), pick(BRICK), Y);
        // a saw-tooth roof and a tall striped chimney
        for (let x = b.x0 + 1; x < b.x1 - 3; x += 5) bPlain.box(x, b.h, b.z0 + 1, x + 3, b.h + 2, b.z1 - 1, C('#6a6a70'));
        const chx = b.x1 - 4, chz = b.z1 + 2.5;
        bPlain.box(chx - 1.3, Y, chz - 1.3, chx + 1.3, G0 + 28, chz + 1.3, C('#8a3b2e')); col.add(chx - 1.3, 0, chz - 1.3, chx + 1.3, G0 + 28, chz + 1.3);
        for (const y of [G0 + 22, G0 + 25.5]) bPlain.box(chx - 1.35, y, chz - 1.35, chx + 1.35, y + 1.2, chz + 1.35, C('#e8e2da'));
        chimneys.push([chx, G0 + 28.5, chz]);
        { const ff = faceOf(b, cx, cz - 30), L = faceLen(ff, b); groundFloor(b, Y, '#4a2a22'); door(ff, b, -L / 2 + 3, Y, '#3a3a40'); fbox(ff, b, .08, 3, L / 2 - 6, Y, Y + 3.4, '#6a7078'); fbox(ff, b, 1.8, 3.4, L / 2 - 6, Y, Y + 1.1, '#8e8a86'); windowsAlong(ff, b, Y, L / 2 - 6, false); tag(ff, b, 0); }
        barrel(lx0 + 3, lz1 - 2);
      } else if (type === 'containers') {
        // stacks of shipping containers, and a gantry crane on the quay
        const CC = ['#b8452a', '#2f6e9e', '#c9a227', '#3c7d4f', '#8a3b6a', '#5a5f6a'];
        for (let x = lx0 + 1; x < lx1 - 12; x += 13) for (let z = lz0 + 1; z < lz1 - 2; z += 3.2) {
          const n = 1 + ((R() * 3) | 0);
          for (let s = 0; s < n; s++) bPlain.box(x, Y + s * 2.6, z, x + 12, Y + (s + 1) * 2.6, z + 2.5, C(pick(CC)));
          col.add(x, 0, z, x + 12, Y + n * 2.6, z + 2.5);
        }
        if (i === 3) {
          const qx = cx, qz = bz0 + .5;
          for (const dx of [-5, 5]) for (const dz of [0, 8]) { bPlain.box(qx + dx - .4, Y, qz + dz - .4, qx + dx + .4, G0 + 22, qz + dz + .4, C('#d8a02a')); col.add(qx + dx - .4, 0, qz + dz - .4, qx + dx + .4, G0 + 22, qz + dz + .4); }
          bPlain.box(qx - 5.5, G0 + 22, qz - 22, qx + 5.5, G0 + 24, qz + 9, C('#d8a02a')); bPlain.box(qx - 2, G0 + 24, qz - 2, qx + 2, G0 + 27, qz + 4, C('#e8e2da'));
        }
      } else if (type === 'junkyard') {
        // a corrugated fence round piles of wrecked cars
        for (const [x0, z0, x1, z1] of [[lx0, lz0, lx1, lz0 + .2], [lx0, lz1 - .2, lx1 - 8, lz1], [lx0, lz0, lx0 + .2, lz1], [lx1 - .2, lz0, lx1, lz1]]) { bPlain.box(x0, Y, z0, x1, Y + 2.6, z1, C('#6a6058')); col.add(x0, 0, z0, x1, Y + 2.6, z1); }
        for (let n = 0; n < 16; n++) { const x = rr(lx0 + 2, lx1 - 5), z = rr(lz0 + 2, lz1 - 4), h = rr(1, 3.5); bPlain.box(x, Y, z, x + rr(3, 4.5), Y + h, z + rr(1.8, 2.4), C(pick(['#6a3a2a', '#4a4a50', '#7a5a3a', '#3a4a5a']))); col.add(x, 0, z, x + 4.5, Y + h, z + 2.4); }
        const wall = { x0: lx0, x1: lx1, z0: lz0, z1: lz0 + .2 }; tag('-z', wall, -6, 'RUST'); tag('-z', wall, 6);
      } else if (type === 'sport') {
        sport = buildSport(lx0, lx1, lz0, lz1, Y);
      } else if (type === 'prison') {
        prison = buildPrison(bx0, bx1, bz0, bz1, cx, Y);
      } else if (type === 'court') {
        // a basketball court behind a chain-link fence: the gang's corner
        const Yc = Y + .01;
        bPlain.box(lx0 + 2, Y, lz0 + 2, lx1 - 2, Yc, lz1 - 2, C('#5a5a64'));
        const lc = gang === 'red' ? '#e8202a' : '#2bd67b';
        for (const [a, b2, c2, d] of [[lx0 + 5, lz0 + 5, lx1 - 5, lz0 + 5.12], [lx0 + 5, lz1 - 5.12, lx1 - 5, lz1 - 5], [lx0 + 5, lz0 + 5, lx0 + 5.12, lz1 - 5], [lx1 - 5.12, lz0 + 5, lx1 - 5, lz1 - 5], [lx0 + 5, cz - .06, lx1 - 5, cz + .06]]) bPlain.flat(a, b2, c2, d, Yc + .005, C(lc));
        for (const z of [lz0 + 5.5, lz1 - 5.5]) { bPlain.box(cx - .1, Y, z - .1, cx + .1, Y + 3.3, z + .1, C('#d0d0d4')); bPlain.box(cx - .9, Y + 3, z - .05 + (z < cz ? .1 : -.1), cx + .9, Y + 4.1, z + .05 + (z < cz ? .1 : -.1), C('#f5f5f0')); col.add(cx - .15, 0, z - .15, cx + .15, Y + 3.3, z + .15); }
        for (let x = lx0 + 2; x <= lx1 - 2; x += 3.2) for (const z of [lz0 + 2, lz1 - 2]) bPlain.box(x - .04, Y, z - .04, x + .04, Y + 3, z + .04, C('#9a9aa2'));
        for (let z = lz0 + 2; z <= lz1 - 2; z += 3.2) for (const x of [lx0 + 2, lx1 - 2]) bPlain.box(x - .04, Y, z - .04, x + .04, Y + 3, z + .04, C('#9a9aa2'));
        for (const [a, b2, c2, d] of [[lx0 + 2, lz0 + 1.96, lx1 - 2, lz0 + 2.04], [lx0 + 2, lz1 - 2.04, lx1 - 2, lz1 - 1.96], [lx0 + 1.96, lz0 + 2, lx0 + 2.04, lz1 - 2], [lx1 - 2.04, lz0 + 2, lx1 - 1.96, lz1 - 2]]) bPlain.box(a, Y + 2.95, b2, c2, Y + 3.05, d, C('#9a9aa2'));
        barrel(lx0 + 4, lz0 + 4); barrel(lx1 - 4, lz1 - 4);
        talk(cx - 4, cz - 7, gangType(gang), Y, gang); talk(cx + 5, cz + 6, gangType(gang), Y, gang); talk(cx + 3, cz - 2, gangType(gang), Y, gang);
      } else {
        // an empty lot: dirt, a burnt-out car, oil drums with fires in them, a wall covered in tags
        bPlain.box(lx0, Y, lz0, lx1, Y + .01, lz1, C('#6e5e48'));
        bPlain.box(cx - 2.2, Y, cz - 1, cx + 2.2, Y + 1.3, cz + 1, C('#2a2624')); col.add(cx - 2.2, 0, cz - 1, cx + 2.2, Y + 1.3, cz + 1);
        barrel(cx - 5, cz + 4); barrel(cx + 6, cz - 5); if (chance(.5)) barrel(cx + 3, cz + 7);
        const w = { x0: lx0 + 1, x1: lx1 - 1, z0: lz1 - .6, z1: lz1 }; bPlain.box(w.x0, Y, w.z0, w.x1, Y + 3, w.z1, C('#8e8a86')); col.add(w.x0, 0, w.z0, w.x1, Y + 3, w.z1);
        tag('-z', w, -9); tag('-z', w, 0, gang === 'red' ? 'COBRAS' : gang === 'green' ? 'SKULLS' : '21'); tag('-z', w, 9);
        talk(cx - 4, cz + 4, gang ? gangType(gang) : null, Y, gang);
      }
      if (type !== 'containers') {   // a fire hydrant on the corner
        bPlain.box(bx0 + .5, Y, bz1 - .9, bx0 + .8, Y + .7, bz1 - .6, C('#c8202a')); bPlain.box(bx0 + .45, Y + .7, bz1 - .95, bx0 + .85, Y + .8, bz1 - .55, C('#c8202a'));
      }
      if (type === 'tenements' || type === 'shops') {
        // dumpsters and rubbish bags at the ends of the alley between the buildings
        for (const z of [lz0 + .4, lz1 - 2.2]) if (chance(.7)) {
          bPlain.box(cx - .85, Y, z, cx + .85, Y + 1.3, z + 1.8, C(pick(['#2f5a3a', '#3a4a6a', '#5a4a2a']))); bPlain.box(cx - .9, Y + 1.3, z - .05, cx + .9, Y + 1.4, z + 1.85, C('#22262a'));
          col.add(cx - .85, 0, z, cx + .85, Y + 1.4, z + 1.8);
          for (let k = 0; k < 3; k++) { const bx = cx + rr(-.7, .7), bz = z + (z < cz ? 2.2 : -.4) + rr(-.15, .15); bPlain.box(bx - .28, Y, bz - .28, bx + .28, Y + .5, bz + .28, C('#1e1e22')); }
        }
        // washing hung across the alley
        if (type === 'tenements') for (let k = 0; k < 3; k++) {
          const y = G0 + 6.5 + k * 4, z = rr(lz0 + 5, lz1 - 5); if (!chance(.6)) continue;
          bPlain.box(cx - 1, y, z - .015, cx + 1, y + .03, z + .015, C('#d0ccc4'));
          for (let x = cx - .8; x < cx + .7; x += .45) bPlain.box(x, y - .6, z - .02, x + .35, y, z + .02, C(pick(['#f5f5f0', '#e8202a', '#3f8fe6', '#ffd23d', '#ff4fa3', '#88aacc'])));
        }
      }
      // cars parked at the kerb, old and cheap
      for (const side of [-1, 1]) if (chance(.5)) parking.push({ id: pick(['meridian', 'hayride', 'outbacker', 'piccolo', 'meridian']), x: side < 0 ? bx0 - 1.1 : bx1 + 1.1, z: cz + rr(-12, 12), h: side < 0 ? 0 : Math.PI });
    }

    /* ---------- fires in the oil drums, smoke from the chimneys ---------- */
    const fireTex = U.canvasTex(64, 64, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,240,190,1)'); gr.addColorStop(.4, 'rgba(255,150,50,.9)'); gr.addColorStop(1, 'rgba(200,40,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, false);
    const fires = barrels.map(([x, y, z]) => { const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); f.position.set(x, y + .35, z); scene.add(f); return f; });
    const smokeTex = U.canvasTex(64, 64, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(120,115,120,.8)'); gr.addColorStop(1, 'rgba(120,115,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, false);
    const smoke = [];
    for (let k = 0; k < chimneys.length * 8; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false })); s.chim = chimneys[k % chimneys.length]; s.t = (k / 8 | 0) * .1 + (k % 8) / 8; scene.add(s); smoke.push(s); }

    // gang turf on the map, and where each gang hangs out
    const territories = [
      { gang: 'red', name: 'Кобры', color: '#e8202a', x0: B.x0, x1: 50, z0: B.z0, z1: B.z1 },
      { gang: 'green', name: 'Черепа', color: '#2bd67b', x0: 100, x1: B.x1, z0: B.z0, z1: B.z1 }
    ];
    const hangouts = [{ gang: 'red', name: 'Банда «Кобры»', x: -25, z: -265 }, { gang: 'green', name: 'Банда «Черепа»', x: 175, z: -265 }];

    const districtAt = (x, z) => {
      if (Math.abs(x - BX) < 9 && z < BZ0 && z > BZ1) return 'Мост 21';
      if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return null;
      if (z < ZS[3]) return 'Доки Района 21';
      if (prison && x > 50 && x < 100 && z < ZS[2] && z > ZS[3]) return 'Тюрьма Района 21';
      return x < 50 ? 'Район 21: земля Кобр' : x > 100 ? 'Район 21: земля Черепов' : 'Район 21';
    };
    // streets for traffic: the grid, joined to the city at the end of its middle street
    const nodes = [], links = [];
    for (const z of ZS) for (const x of XS) nodes.push([x, z]);
    const id = (i, j) => j * XS.length + i;
    for (let j = 0; j < ZS.length; j++) for (let i = 0; i < XS.length; i++) { if (i + 1 < XS.length) links.push([id(i, j), id(i + 1, j)]); if (j + 1 < ZS.length) links.push([id(i, j), id(i, j + 1)]); }
    return {
      spots, parking, blocks, territories, hangouts, bounds: B, districtAt, prison, sport,
      walkways: [BX - (RW + PW) / 2, BX + (RW + PW) / 2].map(x => [[x, BZ0 + 2], [x, BZ1 - 2]]),
      roads: { lane: 2.6, nodes, links, bridge: { city: [BX, -100], island: id(XS.indexOf(BX), 0) }, north: true },
      update(t, env) {
        const n = env ? env.night : 0;
        fires.forEach((f, i) => { const k = 1 + Math.sin(t * 11 + i) * .15 + Math.sin(t * 7 + i * 2) * .1; f.scale.set(.9 * k, 1.3 * k, 1); f.material.opacity = .75 + n * .25; });
        for (const s of smoke) {
          const u = (t * .08 + s.t) % 1, [x, y, z] = s.chim;
          s.position.set(x + u * 6, y + u * 14, z - u * 2); const k = 2 + u * 7; s.scale.set(k, k, 1); s.material.opacity = (1 - u) * .45;
        }
      }
    };
  };
})(window.NB);
