// Omega Island: a big uninhabited island far out to the south-west with a secret military base on it. No
// bridge — come by boat or helicopter. Beaches and jungle round a flat plateau; on it, behind a fence topped
// with barbed wire, Base Omega: a gatehouse with a barrier, four watchtowers with searchlights, the HQ with
// its antennas and dishes, a parade ground and the flag, three barracks, a motor pool under camouflage nets
// (jeeps, trucks), a tank, two helipads with a military helicopter, a hangar with a secret black jet, fuel
// tanks, an ammunition depot with the armoury crate, a firing range, and a radar on the hill outside. Soldiers
// guard it: walk in and you're warned, stay and the alarm goes off and they open fire (the fighting is in
// npc.js, as for the gangs). A jeep patrols the ring road; everything with an engine can be taken.
(function (NB) {
  'use strict';
  const FLAT = [.03, .5];

  NB.buildMilitary = function (k) {
    const { C, U, col, scene, bPlain, bNeon, mapShapes, palms, lamps } = k;
    const R = U.rng(9191), rr = (a, b) => a + R() * (b - a), pick = a => a[(R() * a.length) | 0];
    const CX = -400, CZ = 380, R0 = 86, PLAT = 1.2;
    const radius = a => R0 * (1 + .1 * Math.sin(2 * a + .4) + .06 * Math.sin(5 * a + 1.3) + .03 * Math.sin(11 * a));
    const polar = (x, z) => { const dx = x - CX, dz = z - CZ; return [Math.hypot(dx, dz), Math.atan2(dz, dx)]; };
    const HILL = [CX + 10, CZ + 62];
    // the ground: a beach all round, a flat plateau for the base, a hill for the radar
    function heightAt(x, z) {
      const [d, a] = polar(x, z), n = d / radius(a);
      if (n >= 1) return -(n - 1) * 8;
      let h = n > .8 ? (1 - n) / .2 * PLAT : PLAT;
      const hx = x - HILL[0], hz = z - HILL[1]; h += 7 * Math.exp(-(hx * hx + hz * hz) / (2 * 12 * 12));
      if (n < .8 && n > .6) h += .25 * Math.sin(x * .2) * Math.cos(z * .17) * (n - .6) * 5;   // a little roll in the jungle
      return h;
    }
    const pointAt = (a, n) => { const r = radius(a) * n; return [CX + Math.cos(a) * r, CZ + Math.sin(a) * r]; };
    const inside = (x, z) => { const [d, a] = polar(x, z); return d < radius(a); };
    const shoreDist = (x, z) => { const [d, a] = polar(x, z); return Math.max(0, d - radius(a)); };
    const L = (x, z) => [CX + x, CZ + z];   // base plan coordinates

    /* ---------- the ground mesh, colliders, water, map ---------- */
    {
      const NA = 128, NR = 28, pos = [], colr = [], idx = [], c = new THREE.Color();
      const SAND = new THREE.Color('#e2cc94'), WET = new THREE.Color('#b0965e'), GRASS = new THREE.Color('#5a9a4a'), DARK = new THREE.Color('#3f7a3c'), DIRT = new THREE.Color('#8a7a5a');
      pos.push(CX, heightAt(CX, CZ), CZ); colr.push(DIRT.r, DIRT.g, DIRT.b);
      for (let i = 1; i <= NR; i++) {
        const n = 1.1 * Math.pow(i / NR, .75);
        for (let j = 0; j < NA; j++) {
          const a = j / NA * Math.PI * 2, [x, z] = pointAt(a, n), y = heightAt(x, z);
          pos.push(x, y, z);
          if (n > .95) c.copy(WET); else if (n > .82) c.copy(SAND); else if (n > .62) c.copy(GRASS).lerp(DARK, .5 + .5 * Math.sin(x * .25 + z * .2)).lerp(SAND, Math.max(0, (n - .78) / .04));
          else c.copy(GRASS).lerp(DIRT, .35 + .2 * Math.sin(x * .1) * Math.cos(z * .13));
          const v = .94 + ((i * 7 + j * 13) % 9) / 90; colr.push(c.r * v, c.g * v, c.b * v);
        }
      }
      for (let j = 0; j < NA; j++) idx.push(0, 1 + (j + 1) % NA, 1 + j);
      for (let i = 1; i < NR; i++) for (let j = 0; j < NA; j++) { const a = 1 + (i - 1) * NA + j, b = 1 + (i - 1) * NA + (j + 1) % NA, cc = 1 + i * NA + j, d = 1 + i * NA + (j + 1) % NA; idx.push(a, b, cc, b, d, cc); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m);
      const S = 2.5, RM = R0 * 1.22;
      for (let x = CX - RM; x < CX + RM; x += S) for (let z = CZ - RM; z < CZ + RM; z += S) { const h = heightAt(x + S / 2, z + S / 2); if (h > .02) { const b = col.add(x, -4, z, x + S, h, z + S); b.ramp = true; b.terrain = heightAt; } }
      NB.water.hole({ test: (x, z) => heightAt(x, z) > .06 });
      for (let z = CZ - RM; z < CZ + RM; z += 3) {
        let x0 = null, x1 = null; for (let x = CX - RM; x < CX + RM; x += 1.5) if (inside(x, z + 1.5)) { if (x0 == null) x0 = x; x1 = x + 1.5; }
        if (x0 != null) mapShapes.push({ x0, z0: z, x1, z1: z + 3, c: '#e2cc94', k: 's' });
        x0 = null; for (let x = CX - RM; x < CX + RM; x += 1.5) { const [d, a] = polar(x, z + 1.5); if (d < radius(a) * .82) { if (x0 == null) x0 = x; x1 = x + 1.5; } }
        if (x0 != null) mapShapes.push({ x0, z0: z, x1, z1: z + 3, c: '#4f8a4c', k: 'p' });
      }
    }

    /* ---------- builders ---------- */
    const Y = PLAT;
    const box = (x0, y0, z0, x1, y1, z1, hex, solid) => { const [a, b] = L(x0, z0), [c2, d] = L(x1, z1); bPlain.box(a, y0, b, c2, y1, d, C(hex)); if (solid) col.add(a, y0 < .5 ? -4 : y0, b, c2, y1, d); };
    const neon = (x0, y0, z0, x1, y1, z1, hex) => { const [a, b] = L(x0, z0), [c2, d] = L(x1, z1); bNeon.box(a, y0, b, c2, y1, d, C(hex)); };
    const flat = (x0, z0, x1, z1, y, hex) => { const [a, b] = L(x0, z0), [c2, d] = L(x1, z1); bPlain.box(a, y, b, c2, y + .03, d, C(hex)); };
    const shape = (x0, z0, x1, z1, c, kk) => { const [a, b] = L(x0, z0), [c2, d] = L(x1, z1); mapShapes.push({ x0: a, z0: b, x1: c2, z1: d, c, k: kk || 'b' }); };
    function board(text, sub, x, y, z, w, h, face, bg, fg) {
      const tex = U.canvasTex(1024, 256, (g, W, H) => {
        g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = fg; g.lineWidth = 12; g.strokeRect(14, 14, W - 28, H - 28);
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        let s = 96; g.font = `900 ${s}px "Arial Black", Impact, sans-serif`; const m = g.measureText(text).width; if (m > W * .88) { s = Math.floor(s * W * .88 / m); g.font = `900 ${s}px "Arial Black", Impact, sans-serif`; }
        g.fillText(text, W / 2, sub ? H * .4 : H / 2);
        if (sub) { g.font = 'bold 44px Arial, sans-serif'; g.fillText(sub, W / 2, H * .75); }
      }, false, 4);
      const [wx, wz] = L(x, z), m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      m.position.set(wx, y, wz); m.rotation.y = face; scene.add(m); return m;
    }
    const spots = [], parking = [];
    const soldier = (x, z, heading, kind, y) => { const [wx, wz] = L(x, z); spots.push({ kind: kind || 'guard', x: wx, z: wz, y: y == null ? Y : y, fixedY: true, heading, type: 'soldier', mix: 'guard', home: true }); };
    const patrol = pts => { const P = pts.map(([x, z]) => L(x, z)); spots.push({ kind: 'walk', x: P[0][0], z: P[0][1], y: Y, fixedY: true, heading: 0, type: 'soldier', mix: 'guard', patrol: P }); };
    const talkGroup = (x, z) => { const grp = {}, n = 3, seed = R() * 10; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, [wx, wz] = L(x + Math.sin(a) * .6, z + Math.cos(a) * .6); spots.push({ kind: 'talk', x: wx, z: wz, y: Y, fixedY: true, heading: Math.atan2(-Math.sin(a), -Math.cos(a)), type: 'soldier', mix: 'guard', seed, idx: i, n, grp, home: true }); } };
    const OLIVE = '#5a6440', OLIVE2 = '#4a5436', CONC = '#9a968c', CONC2 = '#86827a', SAND = '#c8b48a';

    /* ---------- the fence: concrete footing, chain-link panels, barbed wire; a gate in the north side ---------- */
    const F = { x0: -62, x1: 28, z0: -28, z1: 42 }, GATE = { x: -20, w: 8 };
    shape(F.x0, F.z0, F.x1, F.z1, '#6a6a5a', 's');
    const fenceRun = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let s = 0; s <= len; s += 3) { const x = ax + dx * s, z = az + dz * s; box(x - .07, Y, z - .07, x + .07, Y + 3.2, z + .07, '#8a8a8e'); }
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz), t = .04;
      box(x0 - t, Y - .3, z0 - t, x1 + t, Y + .35, z1 + t, CONC);
      box(x0 - t * .5, Y + .35, z0 - t * .5, x1 + t * .5, Y + 2.9, z1 + t * .5, '#aeb0b4');
      for (const y of [Y + 3.0, Y + 3.15, Y + 3.3]) box(x0 - .03, y, z0 - .03, x1 + .03, y + .03, z1 + .03, '#3a3a3e');
      const [a, b] = L(x0 - .15, z0 - .15), [c2, d] = L(x1 + .15, z1 + .15); col.add(a, -4, b, c2, Y + 3.3, d);
    };
    fenceRun(F.x0, F.z0, GATE.x - GATE.w / 2, F.z0); fenceRun(GATE.x + GATE.w / 2, F.z0, F.x1, F.z0);
    fenceRun(F.x0, F.z1, F.x1, F.z1); fenceRun(F.x0, F.z0, F.x0, F.z1);
    fenceRun(F.x1, F.z0, F.x1, 1); fenceRun(F.x1, 21, F.x1, F.z1);   // a gap behind the hangar: the jet taxis out onto the airstrip
    // the gate: a guard booth, a striped barrier (up), signs
    box(GATE.x + 4.4, Y, F.z0 - 3.2, GATE.x + 7, Y + 2.8, F.z0 - .4, '#d8d4c8', true); box(GATE.x + 4.3, Y + 2.8, F.z0 - 3.3, GATE.x + 7.1, Y + 3.1, F.z0 - .3, OLIVE2);
    box(GATE.x + 4.35, Y + 1.2, F.z0 - 3.25, GATE.x + 7.05, Y + 2.2, F.z0 - 3.2, '#2a3440');
    box(GATE.x - 4.6, Y, F.z0 - .6, GATE.x - 4, Y + 1.1, F.z0, '#d8d4c8', true);
    { const [wx, wz] = L(GATE.x - 4.3, F.z0 - .3); const arm = new THREE.Mesh(new THREE.BoxGeometry(8, .18, .18), new THREE.MeshLambertMaterial({ color: 0xe8202a })); arm.position.set(wx + 3.6, Y + 2.6, wz); arm.rotation.z = 1.2; scene.add(arm); }
    board('ВОЕННЫЙ ОБЪЕКТ', 'ВХОД ЗАПРЕЩЁН · ОГОНЬ НА ПОРАЖЕНИЕ', GATE.x - 9, Y + 2.2, F.z0 - .2, 5, 1.25, Math.PI, '#e8c020', '#141414');
    board('BASE OMEGA', 'RESTRICTED AREA', GATE.x + 10, Y + 2.2, F.z0 - .2, 5, 1.25, Math.PI, '#2a3a2a', '#f5f5f0');
    soldier(GATE.x - 3, F.z0 - 2, Math.PI); soldier(GATE.x + 3.2, F.z0 - 2, Math.PI);
    // sandbag walls by the gate
    for (const s of [-1, 1]) box(GATE.x + s * 9 - 2, Y, F.z0 - 5, GATE.x + s * 9 + 2, Y + 1, F.z0 - 4.2, SAND, true);

    /* ---------- watchtowers with searchlights ---------- */
    const TOWER_H = 7.5, searchlights = [], beacons = [];
    for (const [tx, tz] of [[F.x0 + 2, F.z0 + 2], [F.x1 - 2, F.z0 + 2], [F.x0 + 2, F.z1 - 2], [F.x1 - 2, F.z1 - 2]]) {
      const ty = heightAt(...L(tx, tz)), top = ty + TOWER_H;
      for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) box(tx + dx - .12, ty, tz + dz - .12, tx + dx + .12, top, tz + dz + .12, OLIVE2, true);
      box(tx - 1.8, top, tz - 1.8, tx + 1.8, top + .25, tz + 1.8, OLIVE);
      { const [a, b] = L(tx - 1.8, tz - 1.8), [c2, d] = L(tx + 1.8, tz + 1.8); col.add(a, top - .3, b, c2, top + .25, d); }
      for (const [x0, z0, x1, z1] of [[-1.8, -1.8, 1.8, -1.7], [-1.8, 1.7, 1.8, 1.8], [-1.8, -1.8, -1.7, 1.8], [1.7, -1.8, 1.8, 1.8]]) box(tx + x0, top + .25, tz + z0, tx + x1, top + 1.2, tz + z1, OLIVE2);
      for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) box(tx + dx - .06, top + 1.2, tz + dz - .06, tx + dx + .06, top + 2.6, tz + dz + .06, OLIVE2);
      box(tx - 2.1, top + 2.6, tz - 2.1, tx + 2.1, top + 2.85, tz + 2.1, '#3a4430');
      box(tx - .25, top + 1.2, tz - .25, tx + .25, top + 1.6, tz + .25, '#2a2a2e');
      const [wx, wz] = L(tx, tz);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, 26, 16, 1, true).translate(0, -13, 0).rotateX(-Math.PI / 2 + .35),
        new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const pivot = new THREE.Group(); pivot.position.set(wx, top + 1.5, wz); pivot.add(cone); scene.add(pivot); cone.rotation.x = 0;
      searchlights.push({ pivot, cone, ph: R() * 6 });
      beacons.push([wx, top + 2.95, wz]);
      soldier(tx, tz, Math.atan2(tx + 17, tz - 7) + Math.PI, 'guard', top + .25);
    }
    for (const [x, y, z] of beacons) bNeon.box(x - .15, y, z - .15, x + .15, y + .3, z + .15, C('#ff2233'));

    /* ---------- the ring road inside the fence ---------- */
    const RR = { x0: -40, x1: 8, z0: -18, z1: 32 }, RW = 3;
    for (const [x0, z0, x1, z1] of [[RR.x0 - RW, RR.z0 - RW, RR.x1 + RW, RR.z0 + RW], [RR.x0 - RW, RR.z1 - RW, RR.x1 + RW, RR.z1 + RW], [RR.x0 - RW, RR.z0 - RW, RR.x0 + RW, RR.z1 + RW], [RR.x1 - RW, RR.z0 - RW, RR.x1 + RW, RR.z1 + RW]]) { flat(x0, z0, x1, z1, Y, '#5a5860'); shape(x0, z0, x1, z1, '#4a4652', 's'); }
    flat(GATE.x - 3, F.z0 - 1, GATE.x + 3, RR.z0 - RW, Y, '#5a5860');
    for (let x = RR.x0; x < RR.x1; x += 6) { flat(x, RR.z0 - .08, x + 3, RR.z0 + .08, Y + .01, '#e8c040'); flat(x, RR.z1 - .08, x + 3, RR.z1 + .08, Y + .01, '#e8c040'); }
    const PATROL = [L(RR.x0, RR.z0), L(RR.x1, RR.z0), L(RR.x1, RR.z1), L(RR.x0, RR.z1)];
    // the road north from the gate to the jetty
    const JA = -1.73, [jx, jz] = pointAt(JA, .97), JL = [jx - CX, jz - CZ];
    { const [a, b] = L(GATE.x - 3, JL[1]), [c2, d] = L(GATE.x + 3, F.z0 - 1); for (let z = b; z < d; z += 2) { const y = Math.max(.05, heightAt(a + 3, z + 1)); bPlain.box(a, y, z, c2, y + .04, z + 2, C('#7a7060')); } }

    /* ---------- HQ: two storeys of concrete, dark windows, antennas, dishes; the flag on the parade ground ---------- */
    box(-14, Y, -15, 4, Y + 7.4, -4, CONC, true); box(-14.2, Y + 7.4, -15.2, 4.2, Y + 7.8, -3.8, CONC2); shape(-14, -15, 4, -4, '#9a968c');
    for (const y of [Y + 1.1, Y + 4.4]) for (let x = -12.5; x < 3; x += 2.4) { box(x, y, -3.95, x + 1.4, y + 1.6, -3.85, '#1e2a36'); box(x, y, -15.15, x + 1.4, y + 1.6, -15.05, '#1e2a36'); }
    box(-6.2, Y, -3.9, -3.8, Y + 2.6, -3.8, '#2a3440'); box(-7, Y + 2.7, -3.8, -3, Y + 2.9, -2.2, OLIVE2);
    board('ШТАБ', 'HEADQUARTERS', -5, Y + 3.5, -3.75, 3.4, .9, 0, '#2a3a2a', '#f5f5f0');
    soldier(-7.5, -2.8, 0); soldier(-2.5, -2.8, 0);
    box(-.2, Y + 7.8, -12, .2, Y + 17, -11.6, '#c8c8cc'); for (let y = Y + 10; y < Y + 16.5; y += 2) box(-1.2, y, -11.85, 1.2, y + .08, -11.75, '#c8c8cc');
    const dishes = [];
    for (const [dx, dz, s] of [[-10, -12, 1.6], [-6, -7, 1.1]]) {
      const [wx, wz] = L(dx, dz), d = new THREE.Mesh(new THREE.CylinderGeometry(s, s * .3, s * .5, 18, 1, true), new THREE.MeshLambertMaterial({ color: 0xe8e8ea, side: THREE.DoubleSide }));
      d.position.set(wx, Y + 8.6 + s * .3, wz); d.rotation.set(-.8, R() * 6, 0); scene.add(d); dishes.push(d);
      box(dx - .12, Y + 7.8, dz - .12, dx + .12, Y + 8.6, dz + .12, '#8a8a8e');
    }
    flat(-14, 0, 4, 12, Y + .005, '#6a6870'); shape(-14, 0, 4, 12, '#5a5860', 's');
    for (let x = -13; x < 3.5; x += 1.5) flat(x, 11.6, x + .8, 11.8, Y + .02, '#f5f5f0');
    box(-5.1, Y, 5.9, -4.9, Y + 11, 6.1, '#d0d0d4', true);
    const flagTex = U.canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#3a5a32'; g.fillRect(0, 0, w, h); g.fillStyle = '#1c2a4a'; g.fillRect(0, 0, w * .38, h); g.fillStyle = '#f5f5f0'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 16 : 36; g.lineTo(w * .19 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } g.fill(); g.fillStyle = '#e8c020'; g.fillRect(w * .38, h * .45, w * .62, h * .1); }, false);
    const flagGeo = new THREE.PlaneGeometry(3, 1.9, 10, 1), flagBase = flagGeo.attributes.position.array.slice();
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide })); { const [wx, wz] = L(-5, 6); flag.position.set(wx + 1.55, Y + 9.9, wz); scene.add(flag); }
    talkGroup(-9, 8); talkGroup(0, 3);

    /* ---------- barracks: long buildings with doors, windows and air conditioners ---------- */
    for (const z0 of [-15, -5, 5]) {
      box(-37, Y, z0, -19, Y + 3.6, z0 + 6, '#7a7a60', true); shape(-37, z0, -19, z0 + 6, '#7a7a60');
      const [a, b] = L(-37.3, z0 - .3), [c2, d] = L(-18.7, z0 + 6.3), rf = C('#5a5a48');
      bPlain.quad([a, Y + 3.6, d], [c2, Y + 3.6, d], [c2, Y + 4.8, (b + d) / 2], [a, Y + 4.8, (b + d) / 2], 0, .9, .45, rf, FLAT, FLAT, FLAT, FLAT);
      bPlain.quad([c2, Y + 3.6, b], [a, Y + 3.6, b], [a, Y + 4.8, (b + d) / 2], [c2, Y + 4.8, (b + d) / 2], 0, .9, -.45, rf, FLAT, FLAT, FLAT, FLAT);
      for (let x = -35.5; x < -20; x += 2.6) { box(x, Y + 1.2, z0 + 6, x + 1.2, Y + 2.4, z0 + 6.08, '#243040'); box(x, Y + 1.2, z0 - .08, x + 1.2, Y + 2.4, z0, '#243040'); }
      box(-28.8, Y, z0 + 6, -27.2, Y + 2.4, z0 + 6.1, '#3a3020'); box(-29.3, Y + 2.5, z0 + 6, -26.7, Y + 2.65, z0 + 7, OLIVE2);
      box(-22, Y + 2.4, z0 + 6, -21, Y + 3, z0 + 6.6, '#c8c4bc');
    }
    board('КАЗАРМЫ', null, -28, Y + 3, -15.1, 3.4, .8, Math.PI, '#2a3a2a', '#f5f5f0');
    talkGroup(-24, 13); soldier(-31, 12.2, 0, 'idle');

    /* ---------- the motor pool under camouflage nets ---------- */
    flat(-37, 15, -19, 29, Y + .004, '#6a6660');
    for (const [x0, x1] of [[-37, -28.5], [-27.5, -19]]) {
      for (const [dx, dz] of [[x0, 15], [x1, 15], [x0, 29], [x1, 29]]) box(dx - .08, Y, dz - .08, dx + .08, Y + 3.4, dz + .08, '#6a5a3a');
      for (let z = 15; z < 29; z += 1.4) box(x0, Y + 3.4, z, x1, Y + 3.5, z + .7, pick(['#4a5a32', '#5a6a3a', '#3a4a2a', '#6a6a42']));
    }
    for (const [x, z] of [[-34.5, 18.5], [-31, 18.5], [-24.5, 18.5], [-21.5, 18.5]]) parking.push({ id: 'mjeep', x: CX + x, z: CZ + z, h: Math.PI });
    for (const x of [-33, -23]) parking.push({ id: 'mtruck', x: CX + x, z: CZ + 25, h: Math.PI });
    soldier(-28, 22, Math.PI / 2, 'idle');
    // the tank on its concrete pad, sandbags round it
    flat(-10, 17, 2, 29, Y + .006, '#8a8680'); parking.push({ id: 'tank', x: CX - 4, z: CZ + 23, h: Math.PI });
    for (const [x0, z0, x1, z1] of [[-10, 29, 2, 29.8], [-10.8, 17, -10, 29.8], [2, 17, 2.8, 29.8]]) box(x0, Y, z0, x1, Y + 1, z1, SAND, true);

    /* ---------- the hangar with the secret jet ---------- */
    const H = { x0: 13, x1: 27, z0: -2, z1: 24 };
    // (open at both ends: the jet rolls out of the back onto the airstrip)
    for (const [a, b] of [[H.z0, 1.5], [20.5, H.z1]]) box(H.x1 - .4, Y, a, H.x1, Y + 9, b, '#7a7e76', true);
    box(H.x1 - .4, Y + 7, 1.5, H.x1, Y + 9, 20.5, '#7a7e76');
    for (const [w, y0, y1] of [[0, 0, 7], [.6, 7, 8.4], [1.8, 8.4, 9.4], [3.6, 9.4, 10]]) { box(H.x0, Y + y0, H.z0 + w, H.x1, Y + y1, H.z0 + w + .4, '#7a7e76', w === 0); box(H.x0, Y + y0, H.z1 - w - .4, H.x1, Y + y1, H.z1 - w, '#7a7e76', w === 0); }
    for (const [w, y] of [[0, 7], [.6, 8.4], [1.8, 9.4], [3.6, 10]]) box(H.x0, Y + y - .01, H.z0 + w, H.x1, Y + y + .3, H.z1 - w, '#6a6e66');
    { const [a, b] = L(H.x0, H.z0), [c2, d] = L(H.x1, H.z1); col.add(a, Y + 7, b, c2, Y + 10.3, d); }
    shape(H.x0, H.z0, H.x1, H.z1, '#7a7e76');
    flat(H.x0 + .5, H.z0 + .5, H.x1 - .5, H.z1 - .5, Y + .004, '#5a5860');
    board('HANGAR 7', 'ДОСТУП ТОЛЬКО ПО ПРОПУСКАМ', H.x0 - .05, Y + 8, (H.z0 + H.z1) / 2, 7, 1.6, -Math.PI / 2, '#2a3a2a', '#e8c020');
    {
      // a black stealth jet: flat angular body, swept wings, twin tails
      const parts = [], B = (w, h, d, x, y, z, hex, ry) => parts.push([new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().makeRotationY(ry || 0).setPosition(x, y, z), C(hex)]);
      B(2.6, .9, 12, 0, 1.6, 0, '#1a1c20'); B(1.2, .5, 3, 0, 2.2, 3, '#2a3440');
      B(7, .18, 5, -3.2, 1.5, -1.5, '#1a1c20', .5); B(7, .18, 5, 3.2, 1.5, -1.5, '#1a1c20', -.5);
      B(.18, 2.2, 2.2, -1.2, 2.8, -4.8, '#1a1c20', .3); B(.18, 2.2, 2.2, 1.2, 2.8, -4.8, '#1a1c20', -.3);
      B(.9, .7, .6, -.7, 1.4, -6.1, '#2a2a2e'); B(.9, .7, .6, .7, 1.4, -6.1, '#2a2a2e');
      B(.2, 1.1, .2, 0, .6, 3.5, '#3a3a40'); B(.2, 1.1, .2, -1.6, .6, -1.5, '#3a3a40'); B(.2, 1.1, .2, 1.6, .6, -1.5, '#3a3a40');
      // (the jet itself is a vehicle now: cars.js 'jet', parked here nose to the hangar door)
      const [wx, wz] = L(18, 11); parking.push({ id: 'jet', x: wx, z: wz, h: Math.PI / 2 });
      // the airstrip: out of the hangar's back, through the fence, east to the beach
      flat(H.x1, 4, 76, 18, Y + .006, '#3a3a40'); shape(H.x1, 4, 76, 18, '#3a3a40', 's');
      for (let x = H.x1 + 2; x < 74; x += 6) flat(x, 10.85, x + 3, 11.15, Y + .02, '#f5f5f0');
      for (let x = H.x1 + 1; x < 76; x += 5) for (const z of [4.3, 17.7]) neon(x - .12, Y, z - .12, x + .12, Y + .2, z + .12, '#ffb030');
      for (const z of [5, 6.2, 15.8, 17]) flat(70, z, 74, z + .6, Y + .02, '#f5f5f0');
    }
    soldier(H.x0 - 1.5, H.z0 + 3, -Math.PI / 2); soldier(H.x0 - 1.5, H.z1 - 3, -Math.PI / 2);

    /* ---------- helipads and the helicopter ---------- */
    for (const pz of [-12, 14]) {
      const px = -52;
      flat(px - 7, pz - 7, px + 7, pz + 7, Y + .004, '#6a6870'); shape(px - 7, pz - 7, px + 7, pz + 7, '#5a5860', 's');
      for (const [x0, z0, x1, z1] of [[-2.2, -3, -1.4, 3], [1.4, -3, 2.2, 3], [-1.4, -.4, 1.4, .4]]) flat(px + x0, pz + z0, px + x1, pz + z1, Y + .02, '#f5f5f0');
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; flat(px + Math.cos(a) * 5.4 - .3, pz + Math.sin(a) * 5.4 - .3, px + Math.cos(a) * 5.4 + .3, pz + Math.sin(a) * 5.4 + .3, Y + .02, '#e8c040'); }
      for (const [dx, dz] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) neon(px + dx - .12, Y, pz + dz - .12, px + dx + .12, Y + .25, pz + dz + .12, '#3fe66a');
    }
    parking.push({ id: 'milheli', x: CX - 52, z: CZ - 12, h: Math.PI / 2 });
    soldier(-45, 1, -Math.PI / 2);

    /* ---------- fuel, ammunition, the armoury crate, the firing range ---------- */
    const onlineCrate = () => !!(NB.net && NB.net.connected);
    const crateLeft = () => onlineCrate() ? NB.net.lootLeft('crate') / 1000 : Math.max(0, crate.emptyT);   // seconds
    for (const [x, z] of [[18, -19], [24, -19]]) {
      const [wx, wz] = L(x, z), t = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 4.5, 18), new THREE.MeshLambertMaterial({ color: 0x5a6440 })); t.position.set(wx, Y + 2.25, wz); t.castShadow = true; scene.add(t);
      col.add(wx - 2.4, -4, wz - 2.4, wx + 2.4, Y + 4.5, wz + 2.4);
    }
    board('ОГНЕОПАСНО', 'FUEL', 21, Y + 3, -16.5, 3, .8, 0, '#e8c020', '#141414');
    for (let k = 0; k < 14; k++) { const x = rr(-12, 4), z = rr(34.5, 40); const s = pick([[1.2, .6, .7], [1.6, .8, .9], [.9, .5, .6]]); box(x, Y, z, x + s[0], Y + s[1] * (1 + (k % 3)), z + s[2], pick(['#5a6440', '#4a5436', '#6a6a42']), true); }
    box(-20, Y, 35, -15, Y + 3, 41, '#6a6a58', true); box(-20.2, Y + 3, 34.8, -14.8, Y + 3.3, 41.2, OLIVE2); shape(-20, 35, -15, 41, '#6a6a58');
    board('СКЛАД ВООРУЖЕНИЯ', null, -17.5, Y + 2.4, 34.9, 4.6, .7, Math.PI, '#2a3a2a', '#e8c020');
    const crate = (() => { const [wx, wz] = L(-17.5, 33.6); const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, .8, .9), new THREE.MeshLambertMaterial({ color: 0x4a5436 })); b.position.set(wx, Y + .4, wz); scene.add(b); col.add(wx - .8, -4, wz - .45, wx + .8, Y + .8, wz + .45); const lid = new THREE.Mesh(new THREE.BoxGeometry(1.64, .1, .94), new THREE.MeshLambertMaterial({ color: 0x3a4428 })); lid.position.set(wx, Y + .85, wz); scene.add(lid); return { x: wx, z: wz - 1.1, lid, emptyT: 0 }; })();
    soldier(-22, 33, Math.PI); soldier(-13, 33, Math.PI);
    for (const x of [-58, -54, -50, -46]) { box(x - .5, Y, 38, x + .5, Y + 1.8, 38.12, '#f5efe0'); box(x - .25, Y + .9, 37.95, x + .25, Y + 1.4, 37.99, '#e8202a'); }
    box(-60, Y, 39.5, -44, Y + 3, 40, '#5a5040', true);
    soldier(-52, 30, 0); soldier(-48, 30, 0);
    // lamps along the ring road
    for (let x = RR.x0; x <= RR.x1; x += 12) { const [a, b] = L(x, RR.z0 - RW - .6), [c2, d] = L(x + 6, RR.z1 + RW + .6); lamps.push([a, b, 0, Y], [c2, d, Math.PI, Y]); }
    // soldiers walking the ring road and the fence
    patrol([[RR.x0 + 1.5, RR.z0 + 1.5], [RR.x1 - 1.5, RR.z0 + 1.5], [RR.x1 - 1.5, RR.z1 - 1.5], [RR.x0 + 1.5, RR.z1 - 1.5]]);
    patrol([[RR.x1 - 1.5, RR.z1 - 1.5], [RR.x0 + 1.5, RR.z1 - 1.5], [RR.x0 + 1.5, RR.z0 + 1.5], [RR.x1 - 1.5, RR.z0 + 1.5]]);
    patrol([[F.x0 + 3, F.z0 + 4], [F.x0 + 3, F.z1 - 4], [F.x0 + 10, F.z1 - 4], [F.x0 + 10, F.z0 + 4]]);

    /* ---------- the radar on the hill ---------- */
    const hy = heightAt(HILL[0], HILL[1]);
    { const [a, b] = [HILL[0], HILL[1]]; bPlain.box(a - 1.5, hy - .5, b - 1.5, a + 1.5, hy + 5, b + 1.5, C('#c8c4bc')); col.add(a - 1.5, -4, b - 1.5, a + 1.5, hy + 5, b + 1.5); }
    const radar = new THREE.Group(); radar.position.set(HILL[0], hy + 5.2, HILL[1]); scene.add(radar);
    { const dish = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, .25), new THREE.MeshLambertMaterial({ color: 0xe8e8ea })); dish.position.y = 1.4; dish.rotation.x = -.25; radar.add(dish); const post = new THREE.Mesh(new THREE.BoxGeometry(.4, 1.2, .4), new THREE.MeshLambertMaterial({ color: 0x8a8a8e })); post.position.y = .6; radar.add(post); }
    { const dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf2f0ea })); const x = HILL[0] + 7, z = HILL[1] + 3, y = heightAt(x, z); dome.position.set(x, y - .2, z); scene.add(dome); col.add(x - 2.4, -4, z - 2.4, x + 2.4, y + 2.4, z + 2.4); }
    bNeon.box(HILL[0] - .2, hy + 5, HILL[1] - .2, HILL[0] + .2, hy + 5.3, HILL[1] + .2, C('#ff2233'));
    spots.push({ kind: 'guard', x: HILL[0] - 3, z: HILL[1] - 2, y: heightAt(HILL[0] - 3, HILL[1] - 2), fixedY: true, heading: 0, type: 'soldier', mix: 'guard', home: true });

    /* ---------- the jetty with a patrol boat; jungle; warning signs on the beaches ---------- */
    const [jwx, jwz] = [jx, jz];
    for (let z = jwz - 16; z < jwz + 1; z += .9) bPlain.box(jwx - 1.2, .26, z, jwx + 1.2, .4, z + .75, C(pick(['#7a6a5a', '#6a5a4a'])));
    { const b = col.add(jwx - 1.2, -.2, jwz - 16, jwx + 1.2, .4, jwz + 1); b.ramp = true; }
    NB.water.hole({ x0: jwx - 1.2, x1: jwx + 1.2, z0: jwz - 16, z1: jwz + 1 });
    mapShapes.push({ x0: jwx - 1.2, z0: jwz - 16, x1: jwx + 1.2, z1: jwz + 1, c: '#7a6a5a', k: 's' });
    const boat = { id: 'speedboat', x: jwx + 3.4, z: jwz - 11, h: Math.PI };
    const inBase = (x, z, m = 0) => { const lx = x - CX, lz = z - CZ; return lx > F.x0 - m && lx < F.x1 + m && lz > F.z0 - m && lz < F.z1 + m; };
    for (let k = 0; k < 90; k++) {
      const a = rr(0, Math.PI * 2), n = rr(.3, .84), [x, z] = pointAt(a, n);
      if (inBase(x, z, 6) || (x - CX > 20 && z - CZ > -2 && z - CZ < 24) || Math.hypot(x - HILL[0], z - HILL[1]) < 10 || Math.abs(x - (CX + GATE.x)) < 5 && z < CZ + F.z0) continue;
      palms.push([x, heightAt(x, z), z]);
      if (R() < .4) { const s = rr(.8, 1.5), y = heightAt(x + 2, z); bPlain.box(x + 2 - s, y - .1, z - s, x + 2 + s, y + s, z + s, C(pick(['#3f7a3c', '#4f8a44', '#2f6a34']))); }
    }
    for (const a of [.4, 1.9, 3.1, 4.6]) { const [x, z] = pointAt(a, .9), y = heightAt(x, z); board('ЗАПРЕТНАЯ ЗОНА', 'RESTRICTED · НЕ ВХОДИТЬ', x - CX, y + 1.6, z - CZ, 3, .75, Math.atan2(Math.cos(a), Math.sin(a)), '#e8c020', '#141414'); bPlain.box(x - .06, y, z - .06, x + .06, y + 1.2, z + .06, C('#6a6a6e')); }

    /* ---------- the game side ---------- */
    let G = null, lastT = null, warnT = 0, warned = false, alarm = false;
    const patrolJeep = { car: null, k: 0 };
    return {
      center: { x: CX, z: CZ }, radius, heightAt, shoreDist, spots, parking, boat,
      inBase: (x, z) => inBase(x, z),
      districtAt(x, z) { if (inBase(x, z, 2)) return 'Секретная база «Омега-21»'; const [d, a] = polar(x, z); return d < radius(a) + 6 ? 'Остров Омега-21' : null; },
      // g: { player, vehicles, crowd, flash, say, give(id, n), setArmor(n), audio }
      // (online the crate is shared by the whole server: emptied by whoever gets there first, refilled 15 minutes later)
      attach(g) { G = g; const p = g.vehicles.spawnParked('mjeep', PATROL[0][0], PATROL[0][1], Math.PI / 2); if (p) { patrolJeep.car = p; p.driverMesh.visible = true; } },
      interactions() {
        if (!G) return [];
        return [{ x: crate.x, z: crate.z, y: Y, r: 1.7, short: 'ЯЩИК', label: () => crateLeft() > 0 ? 'Ящик пуст' : 'Армейский ящик с оружием', use: () => {
          if (crateLeft() > 0) { G.flash('Пусто. Новую партию завезут через ' + Math.ceil(crateLeft() / 60) + ' мин', 2.4); return; }
          if (crate.asking) return;
          crate.asking = true;
          (onlineCrate() ? NB.net.loot('crate') : Promise.resolve(null)).then(r => {
            crate.asking = false;
            if (r === false) { G.flash('Пусто — другой игрок успел раньше. Новая партия через ' + Math.ceil(crateLeft() / 60) + ' мин', 2.6); return; }
            crate.emptyT = 15 * 60;
            G.give('rifle', 120); G.give('smg', 90); G.setArmor(100);
            G.flash('Армейский ящик: винтовка, автомат, бронежилет!', 3);
          });
        } }];
      },
      get alarm() { return alarm && !!G && inBase(G.player.x, G.player.z, 120); },
      update(t, env) {
        const dt = lastT == null ? 0 : U.clamp(t - lastT, 0, .1); lastT = t;
        radar.rotation.y += dt * 1.2;
        const night = env ? env.night : 0;
        for (const s of searchlights) { s.pivot.rotation.y = Math.sin(t * .35 + s.ph) * 1.6 + s.ph; s.cone.material.opacity = night * .16 + (alarm ? .05 : 0); s.cone.visible = night > .05 || alarm; }
        { const pos = flagGeo.attributes.position.array; for (let i = 0; i < pos.length; i += 3) { const u = (flagBase[i] + 1.5) / 3; pos[i + 2] = Math.sin(t * 5 - u * 5) * .25 * u; } flagGeo.attributes.position.needsUpdate = true; }
        if (crate.emptyT > 0) crate.emptyT -= dt;
        crate.lid.visible = crateLeft() <= 0;
        if (!G) return;
        // the patrol jeep drives round the ring road until someone takes it or knocks it about
        const J = patrolJeep.car;
        if (J && (G.vehicles.driving === J || J.awake || J.damage > 40 || !G.vehicles.cars.includes(J))) { J.driverMesh.visible = G.vehicles.driving === J ? J.driverMesh.visible : false; patrolJeep.car = null; }
        else if (J) {
          const [tx, tz] = PATROL[patrolJeep.k], dx = tx - J.x, dz = tz - J.z, d = Math.hypot(dx, dz);
          if (d < 2) patrolJeep.k = (patrolJeep.k + 1) % PATROL.length;
          const want = Math.atan2(dx, dz); J.h += U.clamp(U.angDiff(J.h, want), -1.2 * dt, 1.2 * dt);
          const sp = Math.abs(U.angDiff(J.h, want)) > .5 ? 3 : 7;
          J.vx = Math.sin(J.h) * sp; J.vz = Math.cos(J.h) * sp; J.x += J.vx * dt; J.z += J.vz * dt;
        }
        // trespassing: a warning, then the alarm and gunfire
        const P = G.player, inside = inBase(P.x, P.z);
        if (inside && !P.dead) {
          warnT += dt;
          if (!warned) { warned = true; G.flash('Секретный военный объект! Немедленно покиньте территорию!', 3.5); const s = G.crowd.people.find(q => q.gang === 'army' && !q.dead && Math.hypot(q.x - P.x, q.z - P.z) < 40); if (s) G.say(s, pick(['Стоять! Военный объект!', 'Посторонним вход запрещён!', 'Покиньте территорию!'])); }
          if (warnT > 5) { G.crowd.provoke('army', P.x, P.z); if (!alarm) { alarm = true; G.flash('Тревога! Солдаты открывают огонь!', 3); } }
        } else if (!inBase(P.x, P.z, 50)) { warnT = 0; warned = false; }
        const hot = G.crowd.gangHeat.army > 0;
        if (alarm && !hot && !inside) alarm = false;
      }
    };
  };
})(window.NB);
