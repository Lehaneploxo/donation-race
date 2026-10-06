// A secret: a tiny uninhabited island in the far north-east corner of the sea, at the very edge of the world.
// It isn't on the map and has no name (out there it's just "open sea"). A sand bar with a grassy hump, a few
// palms, rocks and bushes. Behind the rocks on its far side, half buried in the sand under a palm, an old dark
// chest: a million dollars and a vest with a million points of armour. It fills again a day (real time) after
// it was emptied. Reached only by boat, helicopter or a very long swim.
(function (NB) {
  'use strict';

  NB.buildHideaway = function (k) {
    const { C, U, col, scene, bPlain, palms } = k;
    const R = U.rng(777), rr = (a, b) => a + R() * (b - a);
    const CX = 830, CZ = -628, R0 = 12;   // a quarter the size of Turtle Island
    const radius = a => R0 * (1 + .16 * Math.sin(3 * a + 1.3) + .08 * Math.sin(5 * a + .4));
    const polar = (x, z) => { const dx = x - CX, dz = z - CZ; return [Math.hypot(dx, dz), Math.atan2(dz, dx)]; };
    function heightAt(x, z) {
      const [d, a] = polar(x, z), n = d / radius(a);
      if (n >= 1) return -(n - 1) * 8;
      const beach = Math.min(1, (1 - n) / .35) * .6;
      return beach + (n < .6 ? 1.1 * Math.min(1, (.6 - n) / .3) : 0);
    }
    const shoreDist = (x, z) => { const [d, a] = polar(x, z); return Math.max(0, d - radius(a)); };
    const pointAt = (a, n) => { const r = radius(a) * n; return [CX + Math.cos(a) * r, CZ + Math.sin(a) * r]; };

    /* ---------- the ground ---------- */
    {
      const NA = 48, NR = 12, pos = [], colr = [], idx = [], c = new THREE.Color();
      const SAND = new THREE.Color('#e8d39a'), WET = new THREE.Color('#b89c62'), GRASS = new THREE.Color('#5aa35a');
      pos.push(CX, heightAt(CX, CZ), CZ); colr.push(GRASS.r, GRASS.g, GRASS.b);
      for (let i = 1; i <= NR; i++) {
        const n = 1.15 * Math.pow(i / NR, .8);
        for (let j = 0; j < NA; j++) {
          const a = j / NA * Math.PI * 2, [x, z] = pointAt(a, n);
          pos.push(x, heightAt(x, z), z);
          if (n > .95) c.copy(WET); else if (n > .62) c.copy(SAND); else c.copy(GRASS).lerp(SAND, Math.max(0, (n - .5) / .12));
          colr.push(c.r, c.g, c.b);
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
    const S = 2.5, RM = R0 * 1.4;
    for (let x = CX - RM; x < CX + RM; x += S) for (let z = CZ - RM; z < CZ + RM; z += S) {
      const h = heightAt(x + S / 2, z + S / 2);
      if (h > .02) { const b = col.add(x, -4, z, x + S, h, z + S); b.ramp = true; b.terrain = heightAt; }
    }
    NB.water.hole({ test: (x, z) => heightAt(x, z) > .06 });
    // (no map shapes, no district name: it doesn't exist as far as the map is concerned)

    /* ---------- palms, rocks, bushes ---------- */
    // the chest hides on the north-east side, the one facing the empty edge of the world, away from anyone coming in
    const HA = -.75, [HX, HZ] = pointAt(HA, .55);
    for (const [a, n] of [[-.6, .62], [1.4, .45], [2.6, .55], [3.9, .5]]) { const [x, z] = pointAt(a, n); palms.push([x, heightAt(x, z), z]); }
    const ROCK = ['#8a8290', '#7a7280', '#9a92a0'];
    const rock = (x, z, w, h, d, hex) => { const y = heightAt(x, z); bPlain.box(x - w / 2, y - .3, z - d / 2, x + w / 2, y + h, z + d / 2, C(hex)); col.add(x - w / 2, -4, z - d / 2, x + w / 2, y + h, z + d / 2); };
    // a ring of rocks between the chest and the middle of the island, so it can't be seen from the beach you land on
    for (let k = 0; k < 6; k++) {
      const a = HA + Math.PI + (k - 2.5) * .28, x = HX + Math.cos(a) * 2.2, z = HZ + Math.sin(a) * 2.2;
      rock(x, z, rr(.9, 1.4), rr(.9, 1.4), rr(.8, 1.2), ROCK[k % 3]);
    }
    for (let k = 0; k < 7; k++) { const [x, z] = pointAt(R() * 6.28, rr(.75, .95)); rock(x, z, rr(.4, .9), rr(.2, .6), rr(.4, .9), ROCK[k % 3]); }
    // bushes round the chest
    const BUSH = ['#2f7a3a', '#3f8a44', '#357f3e'];
    for (let k = 0; k < 9; k++) {
      const a = R() * 6.28, d = rr(.9, 1.7), x = HX + Math.cos(a) * d, z = HZ + Math.sin(a) * d, y = heightAt(x, z), s = rr(.5, .85);
      if (Math.cos(a - HA - Math.PI) > .3) continue;   // not right in front of it from the rocks' side
      bPlain.box(x - s, y - .1, z - s, x + s, y + s * 1.1, z + s, C(BUSH[k % 3]));
    }

    /* ---------- the chest: old dark wood, half buried, the lid barely showing ---------- */
    const cy = heightAt(HX, HZ) - .28, chest = new THREE.Group(); chest.position.set(HX, cy, HZ); chest.rotation.y = -HA + .4; scene.add(chest);
    const wood = new THREE.MeshLambertMaterial({ color: 0x4a3420 }), band = new THREE.MeshLambertMaterial({ color: 0x2a241e });
    const bx = (w, h, d, m, x, y, z, p) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); (p || chest).add(o); return o; };
    bx(.9, .5, .6, wood, 0, .25, 0); for (const x of [-.3, .3]) bx(.06, .52, .62, band, x, .25, 0);
    const lid = new THREE.Group(); lid.position.set(0, .5, -.3); chest.add(lid);
    bx(.92, .14, .62, wood, 0, .07, .3, lid); for (const x of [-.3, .3]) bx(.06, .16, .64, band, x, .07, .3, lid);
    const gold = new THREE.Mesh(new THREE.BoxGeometry(.75, .1, .45), new THREE.MeshLambertMaterial({ color: 0xe8c547, emissive: 0x5a4010 })); gold.position.set(0, .5, 0); chest.add(gold);
    col.add(HX - .5, -4, HZ - .5, HX + .5, cy + .55, HZ + .5);

    /* ---------- the game side ---------- */
    const CASH = 1000000, ARMOR = 1000000, REFILL = 24 * 3600 * 1000;   // a real day
    let G = null, lastT = null, open = 0;
    const clock = () => (NB.online && NB.online.now ? NB.online.now() : Date.now());
    // online the chest is the whole server's: one player takes it, it fills again a real day later (server/world.js)
    const onlineChest = () => !!(NB.net && NB.net.connected);
    const left = () => { if (onlineChest()) return NB.net.lootLeft('chest'); const r = G && G.progress && G.progress.records; return r ? Math.max(0, (r.hideawayT || 0) - clock()) : 0; };
    let asking = false;
    return {
      center: { x: CX, z: CZ }, shoreDist, heightAt,
      attach(g) { G = g; },
      interactions() {
        if (!G) return [];
        const y = heightAt(HX, HZ);
        return [{ x: HX, z: HZ, y, r: 1.6, short: 'СУНДУК', label: () => left() > 0 ? 'Старый сундук. Пусто' : 'Старый сундук', use: () => {
          const l = left();
          if (l > 0) { G.flash('Пусто. Кто-то уже побывал здесь. Загляните через ' + Math.ceil(l / 3600000) + ' ч', 2.6); return; }
          if (asking) return;
          asking = true;
          (onlineChest() ? NB.net.loot('chest') : Promise.resolve(null)).then(r => {
            asking = false;
            if (r === false) { G.flash('Пусто. Другой игрок нашёл клад раньше. Загляните через ' + Math.ceil(left() / 3600000) + ' ч', 3); return; }
            G.progress.records.hideawayT = clock() + REFILL;
            G.addMoney(CASH, 'Тайный клад');
            if (G.setArmor && G.armor() < ARMOR) G.setArmor(ARMOR);
            if (G.pickup) G.pickup();
            G.flash('Тайный клад! +$1 000 000 и бронежилет на 1 000 000 брони', 5);
          });
        } }];
      },
      update(t) {
        const dt = lastT == null ? 0 : U.clamp(t - lastT, 0, .1); lastT = t;
        const full = left() <= 0;
        open = U.damp(open, full ? 0 : 1, 3, dt); lid.rotation.x = -open * 1.9; gold.visible = full;
      }
    };
  };
})(window.NB);
