// Turtle Island: a small uninhabited tropical island far out in the open sea east of Palm Island, with no
// bridge (come by boat, helicopter or a long swim). A rounded, wobbly shape; a gently sloping sand beach all
// round, grass and a low hill in the middle; palms, bushes and flowers, rocks along the shore, a wrecked
// ship on the beach, an abandoned hut with a hammock and a cold campfire, two old stone heads on the hill,
// a rotten jetty with a boat, and a pirate chest that fills up again once a day. The animals are in
// wildlife.js. Built with the city's own builders.
(function (NB) {
  'use strict';

  NB.buildTropic = function (k) {
    const { C, U, col, scene, bPlain, mapShapes, palms } = k;
    const R = U.rng(4242), rr = (a, b) => a + R() * (b - a), pick = a => a[(R() * a.length) | 0];
    const CX = 760, CZ = 150, R0 = 44;
    // the coastline: radius by direction (the same formula is in the sea shader in world.js)
    const radius = a => R0 * (1 + .14 * Math.sin(3 * a + .7) + .07 * Math.sin(5 * a + 2.1) + .04 * Math.sin(9 * a));
    const polar = (x, z) => { const dx = x - CX, dz = z - CZ; return [Math.hypot(dx, dz), Math.atan2(dz, dx)]; };
    // ground height: the beach rises from the waterline, then grass climbs to a low hill a little off centre
    function heightAt(x, z) {
      const [d, a] = polar(x, z), n = d / radius(a);
      if (n >= 1) return -(n - 1) * 8;
      const beach = Math.min(1, (1 - n) / .28) * .75;
      const hx = x - (CX + 8), hz = z - (CZ - 6), hill = 3.4 * Math.exp(-(hx * hx + hz * hz) / (2 * 15 * 15));
      const bumps = .35 * Math.sin(x * .13 + 1) * Math.cos(z * .11) * Math.max(0, .8 - n);
      return beach + (n < .78 ? hill * Math.min(1, (.78 - n) / .2) + bumps : 0);
    }
    const inside = (x, z, m = 0) => { const [d, a] = polar(x, z); return d < radius(a) - m; };
    const shoreDist = (x, z) => { const [d, a] = polar(x, z); return Math.max(0, d - radius(a)); };
    const pointAt = (a, n) => { const r = radius(a) * n; return [CX + Math.cos(a) * r, CZ + Math.sin(a) * r]; };

    /* ---------- the ground: a radial mesh with sand, grass and wet sand colours ---------- */
    {
      const NA = 96, NR = 22, pos = [], colr = [], idx = [], c = new THREE.Color();
      const SAND = new THREE.Color('#e8d39a'), WET = new THREE.Color('#b89c62'), GRASS = new THREE.Color('#5aa35a'), DARK = new THREE.Color('#3f8a44');
      pos.push(CX, heightAt(CX, CZ), CZ); c.copy(GRASS); colr.push(c.r, c.g, c.b);
      for (let i = 1; i <= NR; i++) {
        const n = 1.12 * Math.pow(i / NR, .8);
        for (let j = 0; j < NA; j++) {
          const a = j / NA * Math.PI * 2, [x, z] = pointAt(a, n), y = heightAt(x, z);
          pos.push(x, y, z);
          if (n > .96) c.copy(WET); else if (n > .74) c.copy(SAND).lerp(WET, Math.max(0, (n - .9) / .06)); else c.copy(GRASS).lerp(DARK, .5 + .5 * Math.sin(x * .3 + z * .2)).lerp(SAND, Math.max(0, (n - .66) / .08));
          const v = .94 + ((i * 7 + j * 13) % 9) / 90; colr.push(c.r * v, c.g * v, c.b * v);
        }
      }
      for (let j = 0; j < NA; j++) idx.push(0, 1 + (j + 1) % NA, 1 + j);
      for (let i = 1; i < NR; i++) for (let j = 0; j < NA; j++) {
        const a = 1 + (i - 1) * NA + j, b = 1 + (i - 1) * NA + (j + 1) % NA, cc = 1 + i * NA + j, d = 1 + i * NA + (j + 1) % NA;
        idx.push(a, b, cc, b, d, cc);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m);
    }
    // what you walk on: columns of ground in a 2.5 m grid (cars and people step over the small differences)
    const S = 2.5, RM = R0 * 1.3;
    for (let x = CX - RM; x < CX + RM; x += S) for (let z = CZ - RM; z < CZ + RM; z += S) {
      const h = heightAt(x + S / 2, z + S / 2);
      if (h > .02) { const b = col.add(x, -4, z, x + S, h, z + S); b.ramp = true; b.terrain = heightAt; }
    }
    NB.water.hole({ test: (x, z) => heightAt(x, z) > .06 });
    // on the map: the outline in slices
    for (let z = CZ - RM; z < CZ + RM; z += 3) {
      let x0 = null, x1 = null;
      for (let x = CX - RM; x < CX + RM; x += 1.5) if (inside(x, z + 1.5)) { if (x0 == null) x0 = x; x1 = x + 1.5; }
      if (x0 != null) mapShapes.push({ x0, z0: z, x1, z1: z + 3, c: '#e6c78d', k: 's' });
    }
    for (let z = CZ - RM; z < CZ + RM; z += 3) {
      let x0 = null, x1 = null;
      for (let x = CX - RM; x < CX + RM; x += 1.5) { const [d, a] = polar(x, z + 1.5); if (d < radius(a) * .72) { if (x0 == null) x0 = x; x1 = x + 1.5; } }
      if (x0 != null) mapShapes.push({ x0, z0: z, x1, z1: z + 3, c: '#4f9a5c', k: 'p' });
    }

    /* ---------- plants ---------- */
    const onGround = (x, z) => heightAt(x, z);
    const busy = [];   // places kept clear for the wreck, the hut, the heads, the jetty
    const clear = (x, z, r) => busy.every(b => Math.hypot(b[0] - x, b[1] - z) > b[2] + r);
    const WRECK = pointAt(2.3, .9), HUT = pointAt(-.9, .45), HEADS = [CX + 8, CZ - 6], JETTY = pointAt(Math.PI, .98);
    busy.push([WRECK[0], WRECK[1], 8], [HUT[0], HUT[1], 7], [HEADS[0], HEADS[1], 5], [JETTY[0], JETTY[1], 6]);
    const palmSpots = [];
    for (let k = 0; k < 150 && palmSpots.length < 46; k++) {
      const a = rr(0, Math.PI * 2), n = k < 90 ? rr(.62, .9) : rr(.1, .6), [x, z] = pointAt(a, n);
      if (!clear(x, z, 2) || palmSpots.some(p => Math.hypot(p[0] - x, p[2] - z) < 3.2)) continue;
      const y = onGround(x, z); palms.push([x, y, z]); palmSpots.push([x, y, z]);
    }
    for (let k = 0; k < 60; k++) {   // bushes and flowers
      const a = rr(0, Math.PI * 2), n = rr(.15, .75), [x, z] = pointAt(a, n); if (!clear(x, z, 1.5)) continue;
      const y = onGround(x, z), s = rr(.7, 1.5), g = pick(['#3f8a44', '#4f9a4c', '#357a3c', '#5aaa50']);
      bPlain.box(x - s, y - .1, z - s * .8, x + s, y + s * .9, z + s * .8, C(g));
      if (R() < .5) for (let f = 0; f < 3; f++) { const fx = x + rr(-s, s) * .8, fz = z + rr(-s, s) * .6; bPlain.box(fx - .12, y + s * .9, fz - .12, fx + .12, y + s * .9 + .14, fz + .12, C(pick(['#ff4fa3', '#ffd23d', '#ff6a3d', '#f5f5f0']))); }
    }
    // rocks along the shore and a few on the hill
    const rock = (x, z, s) => { const y = onGround(x, z); const g = pick(['#8a8290', '#7a7282', '#958c98', '#6f6878']); bPlain.box(x - s, y - .6, z - s * .8, x + s, y + s * 1.1, z + s * .8, C(g)); bPlain.box(x - s * .6, y + s * 1.1, z - s * .5, x + s * .5, y + s * 1.6, z + s * .4, C(g).multiplyScalar(1.08)); col.add(x - s, -4, z - s * .8, x + s, y + s * 1.6, z + s * .8); return y + s * 1.6; };
    const sunRocks = [];
    for (let k = 0; k < 26; k++) { const a = rr(0, Math.PI * 2), [x, z] = pointAt(a, rr(.93, 1.05)); if (clear(x, z, 2)) { const top = rock(x, z, rr(.7, 1.8)); if (k % 5 === 0) sunRocks.push([x, top, z]); } }
    for (let k = 0; k < 5; k++) { const [x, z] = pointAt(rr(0, 6.3), rr(.2, .5)); if (clear(x, z, 2)) sunRocks.push([x, rock(x, z, rr(.8, 1.3)), z]); }

    /* ---------- the wreck: a broken hull half buried in the sand, ribs, a snapped mast ---------- */
    {
      const [wx, wz] = WRECK, y = onGround(wx, wz), H = C('#6a4a32'), D = C('#4a3222');
      const g = new THREE.Group(); g.position.set(wx, y - .5, wz); g.rotation.set(.12, 2.3 + Math.PI / 2, .22); scene.add(g);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const parts = [];
      const B = (w, h, d, x, yy, z, c) => parts.push([new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().makeTranslation(x, yy, z), c]);
      B(3.4, .3, 10, 0, 0, 0, D);
      for (const s of [-1, 1]) B(.25, 1.8, 9, s * 1.7, .9, 0, H);
      B(3.4, 1.8, .25, 0, .9, -4.9, H);
      for (let z = -3.5; z <= 4.5; z += 1.3) for (const s of [-1, 1]) B(.2, 2.6 + (z > 2 ? -1.2 : 0), .2, s * 1.75, 1.3, z, D);
      B(.35, 5.5, .35, 0, 2.8, -1, D); B(2.8, .2, .2, 0, 4.8, -1, D);
      const m = new THREE.Mesh(NB.mergeParts(parts), mat); m.castShadow = true; g.add(m);
      col.add(wx - 3.5, -4, wz - 3.5, wx + 3.5, y + 1.8, wz + 3.5);
      mapShapes.push({ x0: wx - 3, z0: wz - 3, x1: wx + 3, z1: wz + 3, c: '#6a4a32', k: 'b' });
    }
    /* ---------- the hut: four posts, a thatched roof, a hammock between two palms, a cold campfire ---------- */
    let chest, megaVest;
    {
      const [hx, hz] = HUT, y = onGround(hx, hz), W = C('#7a5a3a');
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { bPlain.box(hx + dx - .15, y - .2, hz + dz - .15, hx + dx + .15, y + 2.6, hz + dz + .15, W); col.add(hx + dx - .15, -4, hz + dz - .15, hx + dx + .15, y + 2.6, hz + dz + .15); }
      bPlain.box(hx - 2, y, hz - 2, hx + 2, y + .15, hz + 2, C('#8a6a4a'));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.2, 4).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color: 0xc9a45a })); roof.position.set(hx, y + 3.7, hz); roof.castShadow = true; scene.add(roof);
      col.add(hx - 2.4, y + 2.6, hz - 2.4, hx + 2.4, y + 3.2, hz + 2.4);
      // the hammock
      const ax = hx + 5, az = hz - 3, bx = hx + 5, bz = hz + 3;
      for (const [px, pz] of [[ax, az], [bx, bz]]) { const py = onGround(px, pz); bPlain.box(px - .15, py, pz - .15, px + .15, py + 2, pz + .15, W); col.add(px - .15, -4, pz - .15, px + .15, py + 2, pz + .15); }
      const hy = onGround(hx + 5, hz) + .9;
      bPlain.box(hx + 4.55, hy - .1, az + .5, hx + 5.45, hy, bz - .5, C('#e84a5f')); bPlain.box(hx + 4.6, hy, az + .5, hx + 5.4, hy + .05, bz - .5, C('#ffd23d'));
      // the campfire: a ring of stones and burnt logs
      const fx = hx - 4, fz = hz + 1, fy = onGround(fx, fz);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; bPlain.box(fx + Math.cos(a) * .8 - .18, fy - .05, fz + Math.sin(a) * .8 - .15, fx + Math.cos(a) * .8 + .18, fy + .2, fz + Math.sin(a) * .8 + .15, C('#7a7282')); }
      bPlain.box(fx - .5, fy, fz - .08, fx + .5, fy + .14, fz + .08, C('#2a2020')); bPlain.box(fx - .08, fy + .05, fz - .5, fx + .08, fy + .19, fz + .5, C('#2a2020'));
      for (const [sx, sz] of [[fx + 1.6, fz], [fx - 1.6, fz + .3]]) { const sy = onGround(sx, sz); bPlain.box(sx - .6, sy, sz - .2, sx + .6, sy + .4, sz + .2, C('#6a4a32')); }
      // the pirate chest, under the hut
      const cy = y + .15;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, .6, .7), new THREE.MeshLambertMaterial({ color: 0x6a3a1a })); base.position.set(hx, cy + .3, hz); scene.add(base);
      for (const dx of [-.4, .4]) { const band = new THREE.Mesh(new THREE.BoxGeometry(.08, .62, .72), new THREE.MeshLambertMaterial({ color: 0xd0a030 })); band.position.set(hx + dx, cy + .31, hz); scene.add(band); }
      const lid = new THREE.Group(); lid.position.set(hx, cy + .6, hz - .35); scene.add(lid);
      const lidBox = new THREE.Mesh(new THREE.BoxGeometry(1.12, .22, .72), new THREE.MeshLambertMaterial({ color: 0x7a4a22 })); lidBox.position.set(0, .11, .36); lid.add(lidBox);
      const gold = new THREE.Mesh(new THREE.BoxGeometry(.9, .12, .5), new THREE.MeshBasicMaterial({ color: 0xffd23d })); gold.position.set(hx, cy + .62, hz); scene.add(gold);
      col.add(hx - .55, -4, hz - .35, hx + .55, cy + .8, hz + .35);
      chest = { x: hx, z: hz + 1.1, y, lid, gold, open: 0, want: 0, emptyT: 0 };
      // beside it, on a wooden stand: a golden bulletproof vest, a million points of armour
      {
        const vx = hx + 1.35, vz = hz - .6, g = new THREE.Group(); g.position.set(vx, cy, vz); scene.add(g);
        const wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2a }), goldM = new THREE.MeshLambertMaterial({ color: 0xe8c547, emissive: 0x6a5010 }), strap = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
        const b = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
        b(.5, .06, .5, wood, 0, .03, 0); b(.06, 1.1, .06, wood, 0, .58, 0); b(.5, .05, .05, wood, 0, 1.1, 0);
        const vest = new THREE.Group(); vest.position.y = .85; g.add(vest);
        const vb = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); vest.add(o); };
        vb(.44, .5, .2, goldM, 0, 0, 0); for (const s of [-1, 1]) vb(.1, .16, .2, goldM, s * .15, .32, 0);
        for (const y of [-.12, .08]) vb(.46, .05, .22, strap, 0, y, 0);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffd84f, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.position.y = .85; g.add(glow);
        col.add(vx - .25, -4, vz - .25, vx + .25, cy + 1.15, vz + .25);
        megaVest = { x: vx, z: vz + .75, y, vest, glow, takenT: 0 };
      }
    }
    /* ---------- two stone heads on the hill, looking out to sea ---------- */
    for (const [dx, dz] of [[-1.8, 0], [1.8, .4]]) {
      const x = HEADS[0] + dx, z = HEADS[1] + dz, y = onGround(x, z), G = C('#8a8290'), Dk = C('#6f6878');
      bPlain.box(x - .7, y - .3, z - .5, x + .7, y + 2.8, z + .5, G);
      bPlain.box(x - .75, y + 2.8, z - .55, x + .75, y + 3.2, z + .55, Dk);
      bPlain.box(x - .2, y + 1.6, z - .75, x + .2, y + 2.5, z - .5, Dk);          // the nose
      bPlain.box(x - .55, y + 2.2, z - .56, x - .25, y + 2.4, z - .5, C('#2a2630')); bPlain.box(x + .25, y + 2.2, z - .56, x + .55, y + 2.4, z - .5, C('#2a2630'));
      bPlain.box(x - .4, y + 1.1, z - .56, x + .4, y + 1.25, z - .5, Dk);
      col.add(x - .7, -4, z - .5, x + .7, y + 3.2, z + .5);
    }
    /* ---------- a rotten jetty on the west side, with a boat tied up ---------- */
    const JX = JETTY[0], JZ = JETTY[1];
    for (let x = JX - 16; x < JX + 1; x += .9) {
      if ((x * 7 | 0) % 11 === 3) continue;   // a missing plank here and there
      bPlain.box(x, .26, JZ - 1.1, x + .75, .4, JZ + 1.1, C(pick(['#8a6a4a', '#7a5a3a', '#9a7a5a'])));
    }
    for (let x = JX - 16; x < JX; x += 3.2) for (const s of [-1, 1]) { bPlain.box(x - .15, -3, JZ + s * 1.1 - .15, x + .15, .8, JZ + s * 1.1 + .15, C('#5a4030')); col.add(x - .15, -3, JZ + s * 1.1 - .15, x + .15, .8, JZ + s * 1.1 + .15); }
    { const b = col.add(JX - 16, -.2, JZ - 1.1, JX + 1, .4, JZ + 1.1); b.ramp = true; }
    NB.water.hole({ x0: JX - 16, x1: JX + 1, z0: JZ - 1.1, z1: JZ + 1.1 });
    mapShapes.push({ x0: JX - 16, z0: JZ - 1.1, x1: JX + 1, z1: JZ + 1.1, c: '#8a6a4a', k: 's' });

    /* ---------- the game side ---------- */
    let G = null, lastT = null;
    const CHEST_CASH = 10000, REFILL = 24 * 60, MEGA = 500;   // refills once a game day (24 minutes)
    return {
      center: { x: CX, z: CZ }, R0, radius, heightAt, inside, shoreDist, pointAt, palmSpots, sunRocks,
      boat: { id: 'speedboat', x: JX - 13, z: JZ + 3.2, h: -Math.PI / 2 },
      districtAt(x, z) { const [d, a] = polar(x, z); return d < radius(a) + 6 ? 'Остров Лёхи' : null; },
      attach(g) { G = g; },
      interactions() {
        if (!G) return [];
        return [{ x: chest.x, z: chest.z, y: chest.y, r: 1.8, short: 'СУНДУК', label: () => chest.emptyT > 0 ? 'Сундук пуст — загляните завтра' : 'Пиратский сундук', use: () => {
          if (chest.emptyT > 0) { G.flash('Пусто. Сундук наполнится через ' + Math.ceil(chest.emptyT / 60) + ' мин', 2.4); return; }
          chest.want = 1; chest.emptyT = REFILL;
          G.addMoney(CHEST_CASH, 'Клад'); G.flash('Пиратский клад! +$10 000', 3);
        } }, { x: megaVest.x, z: megaVest.z, y: megaVest.y, r: 1.4, short: 'БРОНЯ', label: () => megaVest.takenT > 0 ? 'Стойка пуста — золотой жилет вернётся завтра' : 'Золотой бронежилет · 500 брони', use: () => {
          if (megaVest.takenT > 0) { G.flash('Пусто. Новый золотой жилет появится через ' + Math.ceil(megaVest.takenT / 60) + ' мин', 2.4); return; }
          if (!G.setArmor) return;
          if (G.armor() >= MEGA) { G.flash('На вас уже золотой бронежилет', 2); return; }
          megaVest.takenT = REFILL; G.setArmor(MEGA); if (G.pickup) G.pickup(); G.flash('Золотой бронежилет! Броня: 500', 3.5);
        } }];
      },
      update(t) {
        const dt = lastT == null ? 0 : U.clamp(t - lastT, 0, .1); lastT = t;
        if (chest.emptyT > 0) { chest.emptyT -= dt; if (chest.emptyT <= 0) chest.want = 0; }
        chest.open = U.damp(chest.open, chest.want, 3, dt);
        chest.lid.rotation.x = -chest.open * 1.9;
        if (megaVest.takenT > 0) megaVest.takenT -= dt;
        megaVest.vest.visible = megaVest.takenT <= 0; megaVest.glow.visible = megaVest.takenT <= 0; megaVest.vest.rotation.y += dt * .8; megaVest.glow.material.opacity = .12 + Math.sin(t * 3) * .05;
        chest.gold.visible = chest.emptyT <= 0 || chest.open < .5;
      }
    };
  };
})(window.NB);
