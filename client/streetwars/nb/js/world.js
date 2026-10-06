// The city: roads, blocks, buildings, neon, palms, beach and sea. Built once from a fixed seed.
(function (NB) {
  'use strict';
  const { U, GeoBuilder, Colliders } = NB;

  const ROADS = [-100, -50, 0, 50, 100];   // road centre lines, both axes
  const RH = 6;                            // road half-width
  const SW = 3;                            // sidewalk width inside a block
  const CITY = 106;                        // city edge (outer road edge)
  const SHORE = 140;                       // where sand meets water
  const EMB = 112;                         // the embankment's sea edge on the west, north and south
  // the whole playable world: past these walls there's only open ocean
  const WORLD = { x0: -600, x1: 880, z0: -680, z1: 560 };
  const SIGN_WORDS = ['HOTEL', 'MOTEL', 'PALMS', 'OCEAN', 'BAR', 'CLUB', 'PIZZA', 'DINER', 'CASINO', 'TATTOO', 'RADIO', 'SURF', 'DISCO', 'CAFE', 'ARCADE', 'VIDEO', 'POLICE', 'AMMO', 'HOSPITAL', 'BANK', 'SUNSET', 'CORAL', 'BREEZE', 'LAGUNA', 'MARLIN', 'TROPIC', 'RIVIERA', 'PARADISE', 'LIQUOR', 'PAWN', 'LAUNDRY', 'GARAGE', 'FASHION', 'SECURITY'];
  const NEON = ['#ff4fa3', '#3fe6e0', '#ffd84f', '#8cff6b', '#c28bff', '#ff8a3d'];
  const PASTEL = ['#f7b5c9', '#aee8d3', '#f7e7a1', '#cdb8f0', '#ffc9a8', '#a9d8f5', '#f3efe6', '#ffd6e4', '#c6f0e8'];
  const COOL = ['#d9d4cc', '#b9c7d8', '#c7b8a8', '#8fb0cf', '#e4dccf', '#a7b7c4'];
  const MUTED = ['#8f7f9b', '#a08a8a', '#7f8fa0', '#9a8f7a', '#86799a'];

  NB.buildWorld = function (scene, renderer) {
    const R = U.rng(1986);
    const rr = (a, b) => a + R() * (b - a), pick = a => a[(R() * a.length) | 0];
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const col = new Colliders(8);
    const C = h => new THREE.Color(h);
    const mapShapes = [];   // for the minimap

    /* ---------- textures ---------- */
    // One facade texture covers 4 x 4 bays (16 m), so the lit windows at night don't repeat every floor.
    const FT = 16, BAYS = 4;
    const facadeTex = U.canvasTex(512, 512, (g) => {
      for (let by = 0; by < BAYS; by++) for (let bx = 0; bx < BAYS; bx++) {
        g.save(); g.translate(bx * 128, by * 128);
        const s = 128;
        g.fillStyle = '#f6f3ee'; g.fillRect(0, 0, s, s);
        U.speckle(g, s, s, 900, ['#d8d2c8', '#ffffff'], .15, .5, 1, 2);
        g.fillStyle = '#d6cfc4'; g.fillRect(0, s - 8, s, 8);
        for (const x of [14, 74]) {
          g.fillStyle = '#d2cbc0'; g.fillRect(x - 4, 24, 48, 76);
          const gr = g.createLinearGradient(0, 28, 0, 96); gr.addColorStop(0, '#46527a'); gr.addColorStop(1, '#1f2540');
          g.fillStyle = gr; g.fillRect(x, 28, 40, 68);
          g.fillStyle = 'rgba(255,180,150,.22)'; g.beginPath(); g.moveTo(x, 60); g.lineTo(x + 22, 28); g.lineTo(x + 32, 28); g.lineTo(x, 76); g.fill();
          g.fillStyle = '#d2cbc0'; g.fillRect(x + 19, 28, 2, 68);
        }
        g.restore();
      }
    }, true, aniso);
    // what glows at night: a random mix of lit rooms, TVs and dark windows
    const windowsTex = U.canvasTex(512, 512, (g) => {
      const WR = U.rng(4242), LIT = ['#ffd58a', '#ffe4b0', '#ffc878', '#fff0d0', '#9fe6ff', '#ff9fd2'];
      g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
      for (let by = 0; by < BAYS; by++) for (let bx = 0; bx < BAYS; bx++) for (const x of [14, 74]) {
        if (WR() > .46) continue;
        const X = bx * 128 + x, Y = by * 128 + 28, c = LIT[(WR() * (WR() < .8 ? 4 : 6)) | 0];
        const gr = g.createLinearGradient(0, Y, 0, Y + 68); gr.addColorStop(0, c); gr.addColorStop(1, shadeHex(c, .55 + WR() * .3));
        g.fillStyle = gr; g.fillRect(X, Y, 40, 68);
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(X + 19, Y, 2, 68);
        if (WR() < .4) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(X, Y, 40, 12 + WR() * 30); }   // half-drawn blinds
      }
    }, true, aniso);
    function shadeHex(hex, k) { const c = new THREE.Color(hex).multiplyScalar(k); return '#' + c.getHexString(); }
    const pavingTex = U.canvasTex(128, 128, (g, s) => {
      g.fillStyle = '#ddd5ca'; g.fillRect(0, 0, s, s);
      U.speckle(g, s, s, 1500, ['#bdb3a6', '#f2ece3'], .2, .5, 1, 2);
      g.fillStyle = '#b3a99c'; for (let i = 0; i < 4; i++) { g.fillRect(i * 32, 0, 2, s); g.fillRect(0, i * 32, s, 2); }
    }, true, aniso);
    const asphaltTex = U.canvasTex(256, 256, (g, s) => {
      g.fillStyle = '#403b48'; g.fillRect(0, 0, s, s);
      U.speckle(g, s, s, 6000, ['#2e2a35', '#55505e', '#4a4552'], .3, .8, 1, 2);
    }, true, aniso);
    const sandTex = U.canvasTex(256, 256, (g, s) => {
      g.fillStyle = '#ecd29a'; g.fillRect(0, 0, s, s);
      U.speckle(g, s, s, 7000, ['#d6b87c', '#f7e4b8', '#c9a86c'], .2, .6, 1, 2);
    }, true, aniso);
    const signTex = U.canvasTex(512, 576, (g) => {
      SIGN_WORDS.forEach((w, k) => {
        const x = (k % 4) * 128, y = ((k / 4) | 0) * 64, c = NEON[k % NEON.length];
        g.fillStyle = '#1b1030'; roundRect(g, x + 4, y + 4, 120, 56, 9); g.fill();
        g.strokeStyle = c; g.lineWidth = 3; g.shadowColor = c; g.shadowBlur = 8; roundRect(g, x + 7, y + 7, 114, 50, 7); g.stroke();
        let fs = 30; g.font = `italic bold ${fs}px "Trebuchet MS", Arial, sans-serif`;
        while (g.measureText(w).width > 100) { fs -= 2; g.font = `italic bold ${fs}px "Trebuchet MS", Arial, sans-serif`; }
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowBlur = 14; g.fillStyle = c; g.fillText(w, x + 64, y + 33);
        g.shadowBlur = 3; g.fillStyle = '#fff4fa'; g.font = g.font; g.globalAlpha = .75; g.fillText(w, x + 64, y + 33); g.globalAlpha = 1;
        g.shadowBlur = 0;
      });
    }, false, aniso);
    function roundRect(g, x, y, w, h, r) {
      g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
      g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    }
    const signUV = k => { const c = k % 4, r = (k / 4) | 0; return [c / 4 + .004, 1 - (r + 1) / 9 + .004, (c + 1) / 4 - .004, 1 - r / 9 - .004]; };

    /* ---------- builders ---------- */
    let bFacade = new GeoBuilder(), bPlain = new GeoBuilder(), bNeon = new GeoBuilder(), bGlow = new GeoBuilder(), bSign = new GeoBuilder();
    const bPaving = new GeoBuilder(), bAsphalt = new GeoBuilder(), bSand = new GeoBuilder();
    // Builds a block "into the void": the seeded random calls still happen, so the rest of the city
    // stays exactly as it was, but nothing is drawn or collides. Returns a function that undoes it.
    function mute() {
      const saved = { bFacade, bPlain, bNeon, bGlow, bSign }, shapes = mapShapes.length, sink = new GeoBuilder();
      bFacade = bPlain = bNeon = bGlow = bSign = sink;
      col.add = () => ({});
      return () => { ({ bFacade, bPlain, bNeon, bGlow, bSign } = saved); delete col.add; mapShapes.length = shapes; };
    }
    let club = null, motelLot = null;
    // the hotels on the beach road each have their own name (only the real Hotel OCEAN is called that)
    const HOTEL_NAMES = ['PALMS', 'SUNSET', 'CORAL', 'BREEZE', 'RIVIERA'];
    let hotelN = 0;
    const WHITE = C('#ffffff');
    const palms = [], lamps = [], umbrellas = [], blocks = [], benches = [], loungers = [];
    let fashion = null, security = null, strip = null;
    let station = null, hospital = null, gunShop = null, hotelRoof = null, towerRoof = null;
    // beach plots kept free of random props: the hero's villa at the north end and the tiki bar
    const RESERVED = [{ id: 'villa', x0: 110.5, x1: 134, z0: 79.5, z1: 104 }, { id: 'tiki', x0: 118, x1: 136, z0: -76, z1: -58 }, { id: 'pier', x0: 121, x1: 166, z0: 40.5, z1: 51.5 }, { id: 'bridge', x0: 106, x1: 170, z0: -107, z1: -89 }, NB.STREET_RESERVED];
    const reserved = (x, z, m = 0) => RESERVED.some(r => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);

    // hollow: four strips instead of one flat slab, for a roof you can stand on
    function neonRing(x0, z0, x1, z1, y, hex, hollow) {
      const c = C(hex);
      if (hollow) for (const [a, b, e, d] of [[x0, z0, x1, z0 + .07], [x0, z1 - .07, x1, z1], [x0, z0, x0 + .07, z1], [x1 - .07, z0, x1, z1]]) bNeon.box(a - .07, y, b - .07, e + .07, y + .14, d + .07, c);
      else bNeon.box(x0 - .07, y, z0 - .07, x1 + .07, y + .14, z1 + .07, c);
      bGlow.box(x0 - .3, y - .3, z0 - .3, x1 + .3, y + .45, z1 + .3, c.clone().multiplyScalar(.9), { noTop: true });
    }
    // Rectangle protruding `out` metres from a face of box b, centred on the face, half-width hw.
    function faceRect(face, b, out, hw, off = 0) {
      const cx = (b.x0 + b.x1) / 2 + (face[1] === 'z' ? off : 0), cz = (b.z0 + b.z1) / 2 + (face[1] === 'x' ? off : 0);
      switch (face) {
        case '+x': return [b.x1, cz - hw, b.x1 + out, cz + hw];
        case '-x': return [b.x0 - out, cz - hw, b.x0, cz + hw];
        case '+z': return [cx - hw, b.z1, cx + hw, b.z1 + out];
        default: return [cx - hw, b.z0 - out, cx + hw, b.z0];
      }
    }
    function facePoint(face, b, out, off = 0) {
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      switch (face) {
        case '+x': return [b.x1 + out, cz + off];
        case '-x': return [b.x0 - out, cz + off];
        case '+z': return [cx + off, b.z1 + out];
        default: return [cx + off, b.z0 - out];
      }
    }
    function sign(face, b, y0, y1, hw, word, off = 0) {
      const k = typeof word === 'number' ? word : SIGN_WORDS.indexOf(word);
      const [px, pz] = facePoint(face, b, .08, off);
      bSign.panel(face, px, pz, y0, y1, hw, WHITE, signUV(k));
      const [gx, gz] = facePoint(face, b, .05, off);
      bGlow.panel(face, gx, gz, y0 - .45, y1 + .45, hw + .5, C(NEON[k % NEON.length]).multiplyScalar(.55));
    }
    function building(x0, z0, x1, z1, h, hex, y0 = .15) {
      const c = C(hex);
      bFacade.box(x0, y0, z0, x1, h, z1, c, { tile: FT, top: c.clone().multiplyScalar(.82) });
      bPlain.box(x0 - .18, h, z0 - .18, x1 + .18, h + .35, z1 + .18, c.clone().multiplyScalar(.72));
      col.add(x0, 0, z0, x1, h + .35, z1);
      mapShapes.push({ x0, z0, x1, z1, c: hex, k: 'b' });
      return { x0, z0, x1, z1, h };
    }
    function rooftop(b) {
      const n = 1 + ((R() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const w = rr(1.2, 2.6), d = rr(1.2, 2.6), x = rr(b.x0 + 1, b.x1 - 1 - w), z = rr(b.z0 + 1, b.z1 - 1 - d);
        if (x > b.x0 && z > b.z0) bPlain.box(x, b.h + .35, z, x + w, b.h + .35 + rr(.8, 1.6), z + d, C(pick(['#9a93a3', '#b3acb8', '#7f788a'])));
      }
    }
    function awning(face, b, hex, hw) {
      const [x0, z0, x1, z1] = faceRect(face, b, 1.5, hw);
      bPlain.box(x0, 3.0, z0, x1, 3.22, z1, C(hex));
    }
    // an enterable building's front door: dark door, neon frame over it, and the spot on the sidewalk that leads inside
    const doors = {};
    function frontDoor(id, face, b, off, hex) {
      const c = C(hex);
      const [dx0, dz0, dx1, dz1] = faceRect(face, b, .06, .8, off);
      bPlain.box(dx0, .15, dz0, dx1, 2.55, dz1, C('#1d1426'));
      const [fx0, fz0, fx1, fz1] = faceRect(face, b, .1, 1.0, off);
      bNeon.box(fx0, 2.55, fz0, fx1, 2.67, fz1, c);
      bGlow.box(fx0 - .2, 2.25, fz0 - .2, fx1 + .2, 2.95, fz1 + .2, c.clone().multiplyScalar(.9), { noTop: true });
      const [px, pz] = facePoint(face, b, 1.3, off);
      const n = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[face];
      doors[id] = { x: px, z: pz, y: .15, heading: Math.atan2(n[0], n[1]), nx: n[0], nz: n[1], hex, cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2 };
      return doors[id];
    }
    // downtown buildings that become places you can walk into
    const SPECIAL = { '1,1,0': ['bank', 'BANK', '#4fd1ff'], '2,1,0': ['casino', 'CASINO', '#ffd84f'], '1,2,1': ['arcade', 'ARCADE', '#c28bff'], '2,2,1': ['diner', 'DINER', '#ff4fa3'] };
    // NEPLOXO TOWER: a two-storey lobby podium and a stepped glass tower of three tiers, neon on every corner,
    // the name near the top on all four sides; the top tier's roof (pool, helipad) is built in places.js
    function buildTower(x0, z0, x1, z1, alongZ) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, face = alongZ ? '-x' : '-z', GLASS = '#b8cce6', ROOF = 150;
      const pod = building(x0 + .5, z0 + .5, x1 - .5, z1 - .5, 9, '#e6e1f0');
      neonRing(pod.x0, pod.z0, pod.x1, pod.z1, 8.7, '#ff4fa3');
      const box = (hw, hl) => alongZ ? [cx - hw, cz - hl, cx + hw, cz + hl] : [cx - hl, cz - hw, cx + hl, cz + hw];
      const tiers = [[6, 12.5, 9.35, 82], [5.5, 11.5, 82, 120], [5, 10, 120, ROOF]];
      for (const [hw, hl, y0, y1] of tiers) {
        const [a0, b0, a1, b1] = box(hw, hl), top = y1 === ROOF;
        bFacade.box(a0, y0, b0, a1, y1, b1, C(GLASS), { tile: FT, top: C(GLASS).multiplyScalar(.8), noTop: top });
        col.add(a0, 0, b0, a1, top ? y1 - 1.8 : y1, b1);
        neonRing(a0, b0, a1, b1, y1 - .45, '#3fe6e0', top);
        for (const [px, pz] of [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]) { bNeon.box(px - .09, y0 + .3, pz - .09, px + .09, y1 - .3, pz + .09, C('#ff4fa3')); bGlow.box(px - .4, y0, pz - .4, px + .4, y1, pz + .4, C('#ff4fa3').multiplyScalar(.6), { noTop: true }); }
      }
      mapShapes.push({ x0: pod.x0, z0: pod.z0, x1: pod.x1, z1: pod.z1, c: '#ff7ab8', k: 'b' });
      const [r0, q0, r1, q1] = box(5, 10);
      towerRoof = { x0: r0, z0: q0, x1: r1, z1: q1, y: ROOF, alongZ, cx, cz };
      frontDoor('tower', face, pod, 0, '#ff4fa3');
      // the name, lit, near the top on all four faces and over the entrance
      const nameTex = U.canvasTex(512, 128, (g, w, h) => {
        g.fillStyle = '#10081c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff4fa3'; g.lineWidth = 6; g.shadowColor = '#ff4fa3'; g.shadowBlur = 14; g.strokeRect(8, 8, w - 16, h - 16);
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic bold 62px "Trebuchet MS", Arial, sans-serif'; g.fillStyle = '#ffe3f0'; g.fillText('NEPLOXO', w / 2, h / 2 - 12);
        g.shadowColor = '#3fe6e0'; g.fillStyle = '#3fe6e0'; g.font = 'bold 30px Rubik, Arial, sans-serif'; g.fillText('T O W E R', w / 2, h / 2 + 34);
      }, false);
      const nameMat = new THREE.MeshBasicMaterial({ map: nameTex });
      const [t0, u0, t1, u1] = box(5, 10);
      for (const [fx, fz, ry, w] of [[t0 - .05, cz, -Math.PI / 2, (u1 - u0) * .8], [t1 + .05, cz, Math.PI / 2, (u1 - u0) * .8], [cx, u0 - .05, Math.PI, (t1 - t0) * .8], [cx, u1 + .05, 0, (t1 - t0) * .8]]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), nameMat); m.position.set(fx, ROOF - 5, fz); m.rotation.y = ry; scene.add(m);
      }
      const [px, pz] = facePoint(face, pod, .08, 0), n = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), nameMat);
      n.position.set(px, 5.2, pz); n.rotation.y = face === '-x' ? -Math.PI / 2 : Math.PI; scene.add(n);
    }
    // gun shop: orange neon frame over the door, orange trim on the roof
    function gunShopFront(face, b, h) {
      neonRing(b.x0, b.z0, b.x1, b.z1, h - .6, '#ff8a3d');
      const d = frontDoor('ammo', face, b, 2.4, '#ff8a3d');
      gunShop = { x: d.x, z: d.z, y: .15, heading: d.heading, cx: d.cx, cz: d.cz };
      mapShapes.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, c: '#ff9a55', k: 'b' });
    }
    function faceToward(b, cx, cz) { // the face of b that looks towards (cx, cz)'s opposite, i.e. away from block centre
      const dx = (b.x0 + b.x1) / 2 - cx, dz = (b.z0 + b.z1) / 2 - cz;
      if (Math.abs(Math.abs(dx) - Math.abs(dz)) < 1) return R() < .5 ? (dx > 0 ? '+x' : '-x') : (dz > 0 ? '+z' : '-z');
      return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? '+x' : '-x') : (dz > 0 ? '+z' : '-z');
    }

    /* ---------- ground ---------- */
    {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: 0x3a3148 }));
      g.rotation.x = -Math.PI / 2; g.position.y = -.03; scene.add(g);
    }
    bAsphalt.flat(-CITY, -CITY, CITY, CITY, 0, WHITE, 8);

    /* ---------- road markings ---------- */
    const YEL = C('#f2c14e'), PAINT = C('#ece6dc');
    const nearCross = v => ROADS.some(L => Math.abs(v - L) < RH + 1);
    for (const L of ROADS) {
      for (let s = -CITY; s < CITY; s += 6) {
        if (nearCross(s) || nearCross(s + 3)) continue;
        bPlain.flat(L - .1, s, L + .1, s + 3, .02, YEL);   // along z
        bPlain.flat(s, L - .1, s + 3, L + .1, .02, YEL);   // along x
      }
      // crosswalks
      for (const M of ROADS) {
        for (const dir of [-1, 1]) {
          const a = M + dir * (RH + 1), b = M + dir * (RH + 3.5);
          if (Math.abs(b) > CITY) continue;
          for (let sx = L - RH + .6; sx < L + RH - .6; sx += 1.3) {
            bPlain.flat(sx, Math.min(a, b), sx + .65, Math.max(a, b), .021, PAINT);   // road L runs along z, crossing at z=M
            bPlain.flat(Math.min(a, b), sx, Math.max(a, b), sx + .65, .021, PAINT);   // road L runs along x, crossing at x=M
          }
        }
      }
    }

    /* ---------- blocks ---------- */
    const blockType = (i, j) => (i === 3 ? 'hotel' : i === 0 && j === 1 ? 'police' : i === 0 && j === 3 ? 'hospital' : i === 0 && j === 2 ? 'park' : i === 2 && j === 0 ? 'parking' : (i === 1 || i === 2) && (j === 1 || j === 2) ? 'downtown' : 'shops');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const bx0 = ROADS[i] + RH, bx1 = ROADS[i + 1] - RH, bz0 = ROADS[j] + RH, bz1 = ROADS[j + 1] - RH;
      const lx0 = bx0 + SW, lx1 = bx1 - SW, lz0 = bz0 + SW, lz1 = bz1 - SW;
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      const t = blockType(i, j);
      bPaving.box(bx0, 0, bz0, bx1, .15, bz1, C('#e8e2d8'), { tile: 2, topTile: 2 });
      col.add(bx0, 0, bz0, bx1, .15, bz1);
      mapShapes.push({ x0: bx0, z0: bz0, x1: bx1, z1: bz1, c: '#8e8798', k: 's' });
      blocks.push({ i, j, bx0, bx1, bz0, bz1, type: t });

      // lamps on this block's sidewalk edge, every ~16 m
      for (let s = 4; s < 38; s += 16) {
        lamps.push([bx0 + .9, bz0 + s, -Math.PI / 2], [bx1 - .9, bz1 - s, Math.PI / 2]);
        lamps.push([bx1 - s, bz0 + .9, Math.PI], [bx0 + s, bz1 - .9, 0]);
      }

      if (t === 'hotel') {
        // the block in front of the spawn point becomes the NEPLOXO 21 club instead of two hotels
        const unmute = j === 2 ? mute() : null;
        const mz = (lz0 + lz1) / 2;
        for (const [z0, z1] of [[lz0, mz - 1], [mz + 1, lz1]]) {
          const motelHere = j === 3 && z0 !== lz0, unmuteM = motelHere ? mute() : null;
          const hex = pick(PASTEL), neon = pick(NEON), h = 4 * Math.round(rr(3, 5.6)) + .6;
          const ocean = j === 1 && z0 === lz0;   // Hotel OCEAN: a lobby you can enter and a pool on the roof
          const b = building(lx1 - 20, z0, lx1, z1, h, hex);
          const zc = (z0 + z1) / 2;
          // stepped crown (the OCEAN's top is left open for the roof deck built in places.js)
          bFacade.box(b.x0 + 3, h + .35, z0 + 2.5, b.x1 - 2, h + 3.4, z1 - 2.5, C(hex), { tile: FT, top: C(hex).multiplyScalar(.82), noTop: ocean });
          if (ocean) hotelRoof = { x0: b.x0 + 3, x1: b.x1 - 2, z0: z0 + 2.5, z1: z1 - 2.5, y: h + 3.4, hex };
          neonRing(b.x0 + 3, z0 + 2.5, b.x1 - 2, z1 - 2.5, h + 3.25, neon, ocean);
          // art-deco fin facing the ocean
          const accent = pick(PASTEL);
          bFacade.box(b.x1, .15, zc - 1.2, b.x1 + .9, h + 4.5, zc + 1.2, C(accent), { tile: FT });
          col.add(b.x1, 0, zc - 1.2, b.x1 + .9, h + 4.5, zc + 1.2);
          bNeon.box(b.x1 + .9, 1.8, zc - .1, b.x1 + .98, h + 4.2, zc + .1, C(neon));
          bGlow.box(b.x1 + .9, 1.5, zc - .45, b.x1 + 1.3, h + 4.5, zc + .45, C(neon).multiplyScalar(.9), { noTop: true });
          neonRing(b.x0, z0, b.x1, z1, 4.35, neon);
          neonRing(b.x0, z0, b.x1, z1, h - .5, pick(NEON));
          pick(['HOTEL', 'MOTEL', 'PALMS', 'OCEAN']);   // (the old random name: the call keeps the city's random numbers in step)
          const name = unmute || unmuteM || ocean ? 'OCEAN' : HOTEL_NAMES[hotelN++];
          sign('+x', b, h - 3.4, h - .9, 2.5, name, -4.3);
          sign('+x', b, 3.1, 4.0, .9, pick(['BAR', 'CAFE', 'CLUB', 'DISCO']), 4.3);
          bPlain.box(b.x1, 3.0, zc - 3.5, b.x1 + 2.2, 3.25, zc + 3.5, C(accent).multiplyScalar(.9));
          if (ocean) { frontDoor('hotel', '+x', b, 2.4, '#3fe6e0'); mapShapes.push({ x0: b.x0, z0, x1: b.x1, z1, c: '#3fe6e0', k: 'b' }); }
          if (unmuteM) { unmuteM(); motelLot = { x0: lx1 - 20, x1: lx1, z0, z1 }; }
        }
        // low shops on the back (west) street
        const b = building(lx0, lz0, lx1 - 23, lz1, rr(5, 7), pick(PASTEL));
        awning('-x', b, pick(NEON), 6); sign('-x', b, 3.5, 4.9, 1.5, pick(['PIZZA', 'SURF', 'TATTOO', 'VIDEO', 'DINER']), 6); rooftop(b);
        if (unmute) { unmute(); club = NB.buildClub({ scene, col, C, bPlain, bNeon, bGlow, neonRing, mapShapes, palms }); }
      } else if (t === 'downtown') {
        const splitX = R() < .5;
        const halves = splitX ? [[lx0, lz0, (lx0 + lx1) / 2 - 1.5, lz1], [(lx0 + lx1) / 2 + 1.5, lz0, lx1, lz1]]
                              : [[lx0, lz0, lx1, (lz0 + lz1) / 2 - 1.5], [lx0, (lz0 + lz1) / 2 + 1.5, lx1, lz1]];
        for (const [hi, [x0, z0, x1, z1]] of halves.entries()) {
          // NEPLOXO TOWER takes the half of this block nearest the city centre (built into the void first, as with the club)
          const tower = i === 2 && j === 2 && hi === 0, unmuteT = tower ? mute() : null;
          const sp = SPECIAL[i + ',' + j + ',' + hi];
          const hex = pick(COOL), h1 = rr(18, 32), h2 = h1 + rr(8, 22);
          const b = building(x0 + .5, z0 + .5, x1 - .5, z1 - .5, h1, hex);
          const ub = { x0: b.x0 + 2.5, z0: b.z0 + 2.5, x1: b.x1 - 2.5, z1: b.z1 - 2.5, h: h2 };
          bFacade.box(ub.x0, h1 + .35, ub.z0, ub.x1, h2, ub.z1, C(hex).multiplyScalar(.95), { tile: FT, top: C(hex).multiplyScalar(.78) });
          bPlain.box(ub.x0 + 2, h2, ub.z0 + 2, ub.x1 - 2, h2 + 2, ub.z1 - 2, C('#7f788a'));
          bPlain.box((ub.x0 + ub.x1) / 2 - .1, h2 + 2, (ub.z0 + ub.z1) / 2 - .1, (ub.x0 + ub.x1) / 2 + .1, h2 + rr(6, 12), (ub.z0 + ub.z1) / 2 + .1, C('#5d566a'));
          if (R() < .6) neonRing(ub.x0, ub.z0, ub.x1, ub.z1, h2 - .6, pick(NEON));
          const f = faceToward(b, cx, cz);
          const word = pick(['CASINO', 'RADIO', 'VIDEO', 'ARCADE', 'CAFE', 'DINER']);
          sign(f, b, 3.3, 4.8, 1.5, sp ? sp[1] : word);
          awning(f, b, pick(PASTEL), 5);
          if (sp) { frontDoor(sp[0], f, b, 0, sp[2]); mapShapes.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, c: sp[2], k: 'b' }); }
          if (unmuteT) { unmuteT(); buildTower(x0, z0, x1, z1, splitX); }
        }
      } else if (t === 'shops') {
        const mx = (lx0 + lx1) / 2, mz = (lz0 + lz1) / 2;
        for (const [x0, x1] of [[lx0, mx - 1], [mx + 1, lx1]]) for (const [z0, z1] of [[lz0, mz - 1], [mz + 1, lz1]]) {
          const h = pick([5, 6.5, 8, 8, 10, 12, 14]);
          const ix = x0 < mx ? 0 : 1, iz = z0 < mz ? 0 : 1;
          const b = building(ix ? x0 + rr(0, 2) : x0, iz ? z0 + rr(0, 2) : z0, ix ? x1 : x1 - rr(0, 2), iz ? z1 : z1 - rr(0, 2), h, pick(PASTEL));
          const f = faceToward(b, cx, cz);
          // the gun shop takes one of these buildings; the seeded random calls stay the same so the city doesn't change
          const isGun = i === 2 && j === 3 && ix === 1 && iz === 0;
          const isFashion = i === 1 && j === 3 && ix === 1 && iz === 0;   // Neon Fashion, the clothes shop
          const isGuards = i === 2 && j === 3 && ix === 0 && iz === 1;    // Shield Security, the bodyguard agency
          const isStrip = i === 2 && j === 3 && ix === 1 && iz === 1;     // NOT BAD GIRLS, the strip club
          awning(f, b, pick(['#ff7eb6', '#4fd1c5', '#ffcf5c', '#b388ff', '#ff9966']), 5.5);
          const word = (R() * 16) | 0;
          sign(f, b, 3.45, 4.95, 1.5, isGun ? 'AMMO' : isFashion ? 'FASHION' : isGuards ? 'SECURITY' : isStrip ? 'GIRLS' : word);
          if (R() < .35) neonRing(b.x0, b.z0, b.x1, b.z1, h - .3, pick(NEON));
          if (isGun) gunShopFront(f, b, h);
          if (isGuards) { neonRing(b.x0, b.z0, b.x1, b.z1, h - .6, '#3fe6e0'); const d = frontDoor('security', f, b, 0, '#3fe6e0'); security = { x: d.x, z: d.z, cx: d.cx, cz: d.cz }; mapShapes.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, c: '#7fd6e0', k: 'b' }); }
          if (isStrip) { neonRing(b.x0, b.z0, b.x1, b.z1, h - .6, '#ff2d7a'); neonRing(b.x0, b.z0, b.x1, b.z1, 3.2, '#9b30ff'); const d = frontDoor('strip', f, b, 0, '#ff2d7a'); strip = { x: d.x, z: d.z, cx: d.cx, cz: d.cz }; mapShapes.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, c: '#ff5fa0', k: 'b' }); }
          if (isFashion) { neonRing(b.x0, b.z0, b.x1, b.z1, h - .6, '#ff4fa3'); const d = frontDoor('fashion', f, b, 0, '#ff7eb6'); fashion = { x: d.x, z: d.z, cx: d.cx, cz: d.cz }; mapShapes.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, c: '#ff9fc3', k: 'b' }); }
          rooftop(b);
        }
      } else if (t === 'park') {
        const grass = C('#5aa35a'), mx = cx, mz = cz;
        for (const [x0, x1] of [[lx0, mx - 2], [mx + 2, lx1]]) for (const [z0, z1] of [[lz0, mz - 2], [mz + 2, lz1]]) {
          bPlain.box(x0, .15, z0, x1, .19, z1, grass, { top: grass });
          mapShapes.push({ x0, z0, x1, z1, c: '#4f9a5c', k: 'p' });
          for (let k = 0; k < 3; k++) palms.push([rr(x0 + 2, x1 - 2), .19, rr(z0 + 2, z1 - 2)]);
        }
        // fountain
        bPlain.box(mx - 3.2, .15, mz - 3.2, mx + 3.2, .75, mz + 3.2, C('#efe7da'));
        bPlain.box(mx - 2.7, .7, mz - 2.7, mx + 2.7, .72, mz + 2.7, C('#4fc9d6'));
        bPlain.box(mx - .5, .72, mz - .5, mx + .5, 2.2, mz + .5, C('#efe7da'));
        bPlain.box(mx - 1.1, 2.2, mz - 1.1, mx + 1.1, 2.4, mz + 1.1, C('#efe7da'));
        col.add(mx - 3.2, 0, mz - 3.2, mx + 3.2, .75, mz + 3.2); col.add(mx - .5, 0, mz - .5, mx + .5, 2.4, mz + .5);
        // benches along the paths
        for (const [bx, bz, rot] of [[mx - 8, mz - 2.6, 0], [mx + 8, mz + 2.6, 0], [mx - 2.6, mz + 8, 1], [mx + 2.6, mz - 8, 1]]) {
          const w = rot ? .6 : 1.8, d = rot ? 1.8 : .6;
          benches.push({ x: bx, z: bz, rot, face: rot ? (bx < mx ? Math.PI / 2 : -Math.PI / 2) : (bz < mz ? 0 : Math.PI) });
          bPlain.box(bx - w / 2, .15, bz - d / 2, bx + w / 2, .6, bz + d / 2, C('#b77a4a'));
          col.add(bx - w / 2, 0, bz - d / 2, bx + w / 2, .6, bz + d / 2);
        }
      } else if (t === 'police') {
        // police station: white-and-blue HQ facing the street to the east, car park in front, annexe behind
        const b = building(lx0, lz0, lx0 + 22, lz0 + 21, 9.35, '#e3e9f0');
        const zc = (b.z0 + b.z1) / 2;
        bPlain.box(b.x0 - .19, 4.1, b.z0 - .19, b.x1 + .19, 4.6, b.z1 + .19, C('#2f5fb0'));
        neonRing(b.x0, b.z0, b.x1, b.z1, 8.7, '#3f8cff');
        sign('+x', b, 5.4, 7.6, 3.2, 'POLICE');
        bPlain.box(b.x1, 3.1, zc - 3.2, b.x1 + 2.6, 3.4, zc + 3.2, C('#2f5fb0'));
        bPlain.box(b.x1 + 2.3, .15, zc - 3.1, b.x1 + 2.5, 3.1, zc - 2.9, C('#dfe6ee')); bPlain.box(b.x1 + 2.3, .15, zc + 2.9, b.x1 + 2.5, 3.1, zc + 3.1, C('#dfe6ee'));
        bNeon.box(b.x0 + 4, 9.7, zc - .4, b.x0 + 4.8, 10.1, zc + .4, C('#ff3355')); bNeon.box(b.x0 + 6, 9.7, zc - .4, b.x0 + 6.8, 10.1, zc + .4, C('#3377ff'));
        bPlain.box(b.x1 + 4, .15, b.z1 - 1.6, b.x1 + 4.15, 9, b.z1 - 1.45, C('#cfd6de'));
        bPlain.box(b.x1 + 4.15, 7.4, b.z1 - 1.58, b.x1 + 6, 8.6, b.z1 - 1.52, C('#2f5fb0'));
        col.add(b.x1 + 3.95, 0, b.z1 - 1.65, b.x1 + 4.2, 9, b.z1 - 1.4);
        const annexe = building(lx0, lz0 + 24, lx0 + 14, lz1, 6, '#cfd6de');
        neonRing(annexe.x0, annexe.z0, annexe.x1, annexe.z1, 5.6, '#3f8cff');
        for (let z = lz0 + 1; z < lz0 + 20; z += 6.2) bPlain.flat(b.x1 + 5.5, z, lx1, z + .12, .16, PAINT);
        mapShapes.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, c: '#5a86e0', k: 'b' });
        frontDoor('police', '+x', b, 0, '#3f8cff');
        station = { x: b.x1 + 3.2, z: zc, heading: Math.PI / 2, cx: (b.x0 + b.x1) / 2, cz: zc,
          parking: [[lx1 - 2.6, lz0 + 4.1, 0], [lx1 - 2.6, lz0 + 10.3, 0], [lx1 - 2.6, lz0 + 16.5, Math.PI]] };
      } else if (t === 'hospital') {
        // hospital: white tower with red bands and a red cross facing the street, ambulance bay in front
        const b = building(lx0, lz0, lx0 + 24, lz0 + 22, 13.35, '#f4f6f8');
        const zc = (b.z0 + b.z1) / 2;
        bPlain.box(b.x0 - .19, 4.1, b.z0 - .19, b.x1 + .19, 4.6, b.z1 + .19, C('#d42a2a'));
        neonRing(b.x0, b.z0, b.x1, b.z1, 12.8, '#ff3344');
        sign('+x', b, 5.6, 7.6, 3.4, 'HOSPITAL', -3.2);
        const RED = C('#ff2a3a');
        bNeon.box(b.x1 + .02, 8.4, zc + 3.1, b.x1 + .14, 11.6, zc + 3.9, RED); bNeon.box(b.x1 + .02, 9.6, zc + 1.9, b.x1 + .14, 10.4, zc + 5.1, RED);
        bGlow.box(b.x1, 8, zc + 1.5, b.x1 + .5, 12, zc + 5.5, RED.clone().multiplyScalar(.8), { noTop: true });
        bPlain.box(b.x1, 3.1, zc - 6.5, b.x1 + 3.2, 3.4, zc - .5, C('#d42a2a'));
        bPlain.box(b.x1 + 2.9, .15, zc - 6.4, b.x1 + 3.1, 3.1, zc - 6.2, C('#e6e9ee')); bPlain.box(b.x1 + 2.9, .15, zc - .8, b.x1 + 3.1, 3.1, zc - .6, C('#e6e9ee'));
        col.add(b.x1 + 2.85, 0, zc - 6.45, b.x1 + 3.15, 3.1, zc - 6.15); col.add(b.x1 + 2.85, 0, zc - .85, b.x1 + 3.15, 3.1, zc - .55);
        // helipad on the roof
        const hx = (b.x0 + b.x1) / 2, hz = zc, WHITE2 = C('#f5f5f0');
        bPlain.box(hx - 4, 13.7, hz - 4, hx + 4, 13.75, hz + 4, C('#3a3f4a'));
        bPlain.flat(hx - 1.5, hz - 1.8, hx - 1, hz + 1.8, 13.76, WHITE2); bPlain.flat(hx + 1, hz - 1.8, hx + 1.5, hz + 1.8, 13.76, WHITE2); bPlain.flat(hx - 1, hz - .25, hx + 1, hz + .25, 13.76, WHITE2);
        const annexe = building(lx0, lz0 + 25, lx0 + 16, lz1, 7, '#e6e9ee');
        neonRing(annexe.x0, annexe.z0, annexe.x1, annexe.z1, 6.6, '#ff3344');
        for (let z = lz0 + 1; z < lz0 + 20; z += 6.2) bPlain.flat(b.x1 + 5.5, z, lx1, z + .12, .16, PAINT);
        mapShapes.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, c: '#e8a0a8', k: 'b' });
        frontDoor('hospital', '+x', b, -3.5, '#ff3344');
        hospital = { x: b.x1 + 3.6, z: zc - 3.5, heading: Math.PI / 2, cx: (b.x0 + b.x1) / 2, cz: zc,
          parking: [[lx1 - 2.6, lz0 + 4.1, 0], [lx1 - 2.6, lz0 + 10.3, 0]] };
      } else if (t === 'parking') {
        bPlain.box(lx0, .15, lz0, lx1, .16, lz1, C('#4a4552'));
        mapShapes.push({ x0: lx0, z0: lz0, x1: lx1, z1: lz1, c: '#55505f', k: 'p' });
        for (const zz of [lz0 + 5.5, lz1 - 5.5]) for (let x = lx0 + 1; x < lx1 - 1; x += 3) bPlain.flat(x, zz - 2.5, x + .12, zz + 2.5, .17, PAINT);
      }
    }

    /* ---------- beach ---------- */
    bPaving.box(CITY, 0, -CITY, CITY + 3.5, .15, CITY, C('#e8e2d8'), { tile: 2, topTile: 2 });
    col.add(CITY, 0, -CITY, CITY + 3.5, .15, CITY);
    bSand.flat(CITY + 3.5, -EMB, SHORE + 12, EMB, .02, WHITE, 6);
    mapShapes.push({ x0: CITY, z0: -CITY, x1: CITY + 3.5, z1: CITY, c: '#8e8798', k: 's' });
    for (let z = -99; z <= 99; z += 9) if (Math.abs(z + .5 + 98) > 9) palms.push([CITY + 1.8, .15, z + .5]);   // none where the bridge starts
    // kept clear of the crossings so people walking to the beach are not blocked
    for (let z = -94; z <= 94; z += 12) if (!ROADS.some(L => Math.abs(z - L) < RH + 3.2)) palms.push([ROADS[4] - RH - .65, .15, z]);
    for (let k = 0; k < 26; k++) { const p = [rr(113, 134), .02, rr(-100, 100)]; if (!reserved(p[0], p[2], 1)) palms.push(p); }
    for (let k = 0; k < 16; k++) {
      const x = rr(116, 136), z = rr(-96, 96);
      if (reserved(x, z, 3)) continue;
      umbrellas.push([x, z]); loungers.push({ x, z });
      col.add(x - .35, 0, z + .55, x + .35, .5, z + 2.8);   // a long, flat lounger with a low headrest: the sunbather lies on it, head and all
      bPlain.box(x - .35, .02, z + .55, x + .35, .35, z + 2.8, C('#f5f0e6'));
      bPlain.box(x - .35, .35, z + 2.5, x + .35, .43, z + 2.8, C('#e8e0d0'));
    }
    for (const [tx, tz, hex] of [[124, 28, '#ff9fc3'], [126, -46, '#8fe3d6']]) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        bPlain.box(tx + sx * 1.1 - .08, 0, tz + sz * 1.1 - .08, tx + sx * 1.1 + .08, 2, tz + sz * 1.1 + .08, C('#f3efe6'));
        col.add(tx + sx * 1.1 - .12, 0, tz + sz * 1.1 - .12, tx + sx * 1.1 + .12, 2, tz + sz * 1.1 + .12);
      }
      bPlain.box(tx - 1.5, 2, tz - 1.5, tx + 1.5, 4, tz + 1.5, C(hex));
      bPlain.box(tx - 1.8, 4, tz - 1.8, tx + 1.8, 4.25, tz + 1.8, C('#f3efe6'));
      col.add(tx - 1.5, 2, tz - 1.5, tx + 1.5, 4.25, tz + 1.5);
    }
    // (the rock breakwaters that used to close the bay at the beach ends: gone now the sea is open all round;
    // built into the void so the seeded city stays the same)
    const unmuteRocks = mute();
    for (const sz of [-1, 1]) {
      for (let x = CITY; x < SHORE + 30; x += 3.4) {
        const h = rr(1.2, 2.6), z = sz * 108 + rr(-.8, .8);
        bPlain.box(x, 0, z - 1.8, x + rr(2.6, 3.6), h, z + 1.8, C(pick(['#8a8290', '#7a7282', '#958c98'])));
      }
      col.add(CITY, -10, sz > 0 ? 106 : -112, SHORE + 80, 6, sz > 0 ? 112 : -106);
    }
    unmuteRocks();
    // the sea goes all the way round the city and Palm Island; invisible walls far out close the world
    // (for swimmers, boats and the helicopter alike)
    const LAND = { x0: -EMB, x1: SHORE, z0: -EMB, z1: EMB }, ISL = { x0: 345, x1: 515, z0: -105, z1: 105 }, NORTH = { x0: -110, x1: 260, z0: -400, z1: -180 }, BAY = { x0: 335, x1: 750, z0: -560, z1: -180 };
    const W = WORLD;
    col.add(W.x0 - 6, -10, W.z0 - 6, W.x0, 320, W.z1 + 6); col.add(W.x1, -10, W.z0 - 6, W.x1 + 6, 320, W.z1 + 6);
    col.add(W.x0, -10, W.z0 - 6, W.x1, 320, W.z0); col.add(W.x0, -10, W.z1, W.x1, 320, W.z1 + 6);
    const rectDist = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
    let tropic = null, military = null, hideaway = null;   // Turtle Island, built further down: its beach shelves into the sea like the others
    NB.water.vols.length = 0; NB.water.holes.length = 0;
    NB.water.add({ name: 'sea', surface: () => .05,
      test: (x, z) => x > W.x0 && x < W.x1 && z > W.z0 && z < W.z1 && !(x > LAND.x0 && x < SHORE - .6 && z > LAND.z0 && z < LAND.z1) && !NB.water.dry(x, z),
      // off a sandy beach the bed slopes gently; off the embankment it's deep straight away
      floor: (x, z) => {
        const dc = rectDist(x, z, LAND), sandy = U.clamp(x, LAND.x0, LAND.x1) > CITY;
        return .02 - U.clamp(Math.min(sandy ? dc * .3 : 2 + dc * .5, rectDist(x, z, ISL) * .3, 2 + rectDist(x, z, NORTH) * .5, 2 + rectDist(x, z, BAY) * .5, tropic ? tropic.shoreDist(x, z) * .25 : 99, hideaway ? hideaway.shoreDist(x, z) * .25 : 99, military ? military.shoreDist(x, z) * .25 : 99), 0, 3.4);
      } });

    /* ---------- the embankment: a paved promenade on the sea wall round the rest of the city ---------- */
    {
      const PAVE = C('#ddd6cb'), EDGE = C('#b9b2a6'), WALL = C('#8f887e');
      for (const [x0, z0, x1, z1] of [[-EMB, -EMB, -CITY, EMB], [-CITY, CITY, CITY + .01, EMB], [-CITY, -EMB, CITY + .01, -CITY]]) {
        bPaving.box(x0, 0, z0, x1, .15, z1, PAVE, { tile: 2, topTile: 2 }); col.add(x0, 0, z0, x1, .15, z1);
        mapShapes.push({ x0, z0, x1, z1, c: '#8e8798', k: 's' });
      }
      // a stone kerb along the edge, and the sea wall below it
      bPlain.box(-EMB, .15, -EMB, -EMB + .45, .38, EMB, EDGE); bPlain.box(-EMB - .3, -3.6, -EMB - .3, -EMB, .15, EMB + .3, WALL);
      for (const s of [-1, 1]) { bPlain.box(-EMB, .15, s > 0 ? EMB - .45 : -EMB, CITY, .38, s > 0 ? EMB : -EMB + .45, EDGE); bPlain.box(-EMB, -3.6, s > 0 ? EMB : -EMB - .3, CITY, .15, s > 0 ? EMB + .3 : -EMB, WALL); }
      // lamps looking inland and palms in between
      for (let z = -100; z <= 100; z += 16) { lamps.push([-EMB + 1.1, z, Math.PI / 2, .15]); palms.push([-EMB + 2.6, .15, z + 8]); }
      for (let x = -96; x <= 96; x += 16) { lamps.push([x, EMB - 1.1, Math.PI, .15], [x + 8, -EMB + 1.1, 0, .15]); palms.push([x + 8, .15, EMB - 2.6]); if (Math.abs(x) > 10) palms.push([x, .15, -EMB + 2.6]); }
    }

    /* ---------- the Neon Bay Bridge and Palm Island ---------- */
    const island = NB.buildIsland({ C, U, col, scene, bPlain, bFacade, bNeon, bGlow, bSand, bAsphalt, bPaving, building, sign, awning, neonRing, mapShapes, palms, lamps, PASTEL, NEON, FT });

    /* ---------- North Side: the working-class island across the strait to the north ---------- */
    const north = NB.buildNorthside({ C, U, col, scene, bPlain, bFacade, bNeon, bGlow, bAsphalt, bPaving, building, sign, awning, neonRing, mapShapes, palms, lamps, FT });

    /* ---------- Bayview: the island with the airport, bridged to the North Side and to Palm Island ---------- */
    const bay = NB.buildBayview({ C, U, col, scene, bPlain, bFacade, bNeon, bGlow, bAsphalt, bPaving, building, sign, awning, neonRing, mapShapes, palms, lamps, FT });
    if (bay.door) doors.airport = bay.door;
    if (north.prison) doors.prison = north.prison.door;
    if (north.sport) { doors.boxing = north.sport.boxing; doors.gym = north.sport.gym; }

    /* ---------- Turtle Island: uninhabited, far out in the open sea, no bridge ---------- */
    tropic = NB.buildTropic({ C, U, col, scene, bPlain, mapShapes, palms });
    hideaway = NB.buildHideaway({ C, U, col, scene, bPlain, palms });   // the secret islet in the far corner (not on the map)

    /* ---------- Omega Island and its secret military base, far out to the south-west ---------- */
    military = NB.buildMilitary({ C, U, col, scene, bPlain, bNeon, mapShapes, palms, lamps });   // the terminal's front door (places.js builds the inside)

    /* ---------- (formerly the city's boundary wall and a distant skyline: now open sea) ---------- */
    const unmuteEdge = mute();
    for (let z = -130; z < 130;) { const w = rr(10, 20); building(-130, z, -CITY, Math.min(130, z + w), rr(12, 38), pick(MUTED), 0); z += w; }
    for (const s of [-1, 1]) for (let x = -CITY; x < CITY;) {
      const w = rr(10, 22), x1 = Math.min(CITY, x + w);
      building(x, s > 0 ? CITY : -130, x1, s > 0 ? 130 : -CITY, rr(12, 38), pick(MUTED), 0); x += w;
    }
    for (let k = 0; k < 26; k++) {
      const a = rr(Math.PI * .55, Math.PI * 1.45), d = rr(170, 250), w = rr(12, 26);
      const x = Math.cos(a) * d, z = Math.sin(a) * d * 1.2;
      bFacade.box(x - w / 2, 0, z - w / 2, x + w / 2, rr(40, 95), z + w / 2, C(pick(MUTED)).multiplyScalar(.9), { tile: FT });
    }
    unmuteEdge();

    /* ---------- places you can go into: interiors, the villa, the tiki bar, the hotel roof ---------- */
    const fireStation = NB.buildFireStation({ scene, col, C, mapShapes });   // before the places: its door leads into an interior
    if (fireStation) doors.firestation = fireStation.door;
    const places = NB.buildPlaces({ scene, col, C, doors, hotelRoof, towerRoof, hospital, reserved: RESERVED, palms, mapShapes });

    /* ---------- the spray shop, food carts, buskers and the volleyball court ---------- */
    const spray = NB.buildSpray({ scene, col, C, mapShapes });
    const street = NB.buildStreet({ scene, col, C, palms, doors, motelLot, mapShapes, lamps });
    // LEHA NEPLOXO WORLD: the president's billboards — a giant one on the beach facing the city, one on each embankment
    if (NB.buildBillboards) NB.buildBillboards({ scene, col, spots: [[122, -75, -Math.PI / 2, 26, 8, .1], [22, -109.3, 0, 16, 6, .15], [-22, 109.3, Math.PI, 16, 6, .15]] });

    /* ---------- lamps (dropping ones that land in a road or beyond the city) ---------- */
    const inRoad = v => ROADS.some(L => Math.abs(v - L) < RH + .5);
    // lamps with a height of their own are on the bridge or the island and are always kept
    const lampList = lamps.filter(([x, z, , y]) => y != null || (!inRoad(x) && !inRoad(z) && Math.abs(x) < CITY && Math.abs(z) < CITY && !(club && club.blocksLamp(x, z))));
    for (const [x, z, , y] of lampList) col.add(x - .15, y != null ? y - .5 : 0, z - .15, x + .15, (y || 0) + 6, z + .15);

    /* ---------- meshes ---------- */
    const lam = (map, extra) => new THREE.MeshLambertMaterial(Object.assign({ map, vertexColors: true }, extra || {}));
    const add = (geo, mat, cast, recv) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!cast; m.receiveShadow = !!recv; m.matrixAutoUpdate = false; scene.add(m); return m; };
    // the ground materials darken when wet (weather.js)
    const asphaltMat = lam(asphaltTex), sandMat = lam(sandTex), pavingMat = lam(pavingTex);
    add(bAsphalt.build(), asphaltMat, false, true);
    add(bSand.build(), sandMat, false, true);
    add(bPaving.build(), pavingMat, false, true);
    const facadeMat = lam(facadeTex, { emissive: 0xffffff, emissiveMap: windowsTex, emissiveIntensity: 0 });
    add(bFacade.build(), facadeMat, true, true);
    add(bPlain.build(), lam(null), true, true);
    add(bNeon.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    add(bSign.build(), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, alphaTest: .05 }));
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .26, blending: THREE.AdditiveBlending, depthWrite: false });
    add(bGlow.build(), glowMat);

    // palms: trunk and fronds merged into one instanced mesh
    const M4 = () => new THREE.Matrix4();
    const palmParts = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.CylinderGeometry(.2 - i * .02, .24 - i * .02, 1.55, 7);
      palmParts.push([g, M4().makeTranslation(i * i * .045, .75 + i * 1.5, 0), C(i % 2 ? '#8a6a4a' : '#76583c')]);
    }
    const top = new THREE.Vector3(16 * .045 + .05, 7.45, 0);
    for (let f = 0; f < 9; f++) {
      const a = f / 9 * Math.PI * 2 + (f % 2) * .2;
      const base = M4().makeTranslation(top.x, top.y, top.z).multiply(M4().makeRotationY(a)).multiply(M4().makeRotationX(-.3));
      palmParts.push([new THREE.BoxGeometry(.75, .05, 1.7), base.clone().multiply(M4().makeTranslation(0, 0, .85)), C(f % 2 ? '#3f8f4a' : '#2f7a3c')]);
      const outer = base.clone().multiply(M4().makeTranslation(0, 0, 1.65)).multiply(M4().makeRotationX(.95)).multiply(M4().makeTranslation(0, 0, .9));
      palmParts.push([new THREE.BoxGeometry(.55, .05, 1.9), outer, C(f % 2 ? '#358043' : '#2a6e36')]);
    }
    palmParts.push([new THREE.BoxGeometry(.22, .22, .22), M4().makeTranslation(top.x + .15, top.y - .25, .12), C('#4a3a22')]);
    palmParts.push([new THREE.BoxGeometry(.22, .22, .22), M4().makeTranslation(top.x - .1, top.y - .28, -.15), C('#4a3a22')]);
    const palmGeo = NB.mergeParts(palmParts);
    const palmMesh = new THREE.InstancedMesh(palmGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), palms.length);
    const dummy = new THREE.Object3D();
    palms.forEach(([x, y, z], i) => {
      const s = rr(.85, 1.2);
      dummy.position.set(x, y, z); dummy.rotation.set(rr(-.06, .06), rr(0, Math.PI * 2), rr(-.06, .06)); dummy.scale.set(s, s, s);
      dummy.updateMatrix(); palmMesh.setMatrixAt(i, dummy.matrix);
      col.add(x - .28, 0, z - .28, x + .28, 7, z + .28);
    });
    palmMesh.castShadow = true; palmMesh.receiveShadow = false; scene.add(palmMesh);

    // lamps
    const lampGeo = NB.mergeParts([
      [new THREE.CylinderGeometry(.07, .1, 6, 6), M4().makeTranslation(0, 3, 0), C('#2b2735')],
      [new THREE.BoxGeometry(.08, .08, 1.5), M4().makeTranslation(0, 5.9, .7), C('#2b2735')]]);
    const lampMesh = new THREE.InstancedMesh(lampGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), lampList.length);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
    const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.32, .12, .55).translate(0, 5.82, 1.35), headMat, lampList.length);
    // warm pools of light on the pavement under each lamp, faded in at night
    const poolTex = U.canvasTex(64, 64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(.45, 'rgba(255,190,120,.45)'); gr.addColorStop(1, 'rgba(255,170,100,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }, false);
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), poolMat, lampList.length);
    lampList.forEach(([x, z, r, y], i) => {
      const base = y != null ? y - .15 : 0;
      dummy.position.set(x, base + .15, z); dummy.rotation.set(0, r, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      lampMesh.setMatrixAt(i, dummy.matrix); headMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + Math.sin(r) * 1.6, base + .17, z + Math.cos(r) * 1.6); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      poolMesh.setMatrixAt(i, dummy.matrix);
    });
    lampMesh.castShadow = true; poolMesh.visible = false; scene.add(lampMesh, headMesh, poolMesh);
    const LAMP_OFF = C('#8f887e'), LAMP_ON = C('#ffe2b0');
    let wetPools = 0;

    // beach umbrellas
    const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.04, .04, 2.4, 5).translate(0, 1.2, 0), new THREE.MeshLambertMaterial({ color: 0xf3efe6 }), umbrellas.length);
    const topMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.05, 1.6, .55, 8).translate(0, 2.35, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), umbrellas.length);
    umbrellas.forEach(([x, z], i) => {
      dummy.position.set(x, 0, z); dummy.rotation.set(0, R() * 6, 0); dummy.updateMatrix();
      poleMesh.setMatrixAt(i, dummy.matrix); topMesh.setMatrixAt(i, dummy.matrix);
      topMesh.setColorAt(i, C(pick(['#ff6fa8', '#3fd6d0', '#ffd24f', '#b58bff', '#ff8a5c'])));
    });
    topMesh.castShadow = true; scene.add(poleMesh, topMesh);

    // sea
    const seaMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFog: { value: scene.fog.color }, uNear: { value: scene.fog.near }, uFar: { value: scene.fog.far }, uSun: { value: new THREE.Vector3(1, .22, .12).normalize() },
        uShallow: { value: C('#3dc2c7') }, uDeep: { value: C('#244d8c') }, uSpec: { value: C('#ffb880') }, uRim: { value: C('#ff8c99') }, uFoam: { value: 1 } },
      vertexShader: `varying vec3 vW; varying float vD;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime, uNear, uFar, uFoam; uniform vec3 uFog, uSun, uShallow, uDeep, uSpec, uRim; varying vec3 vW; varying float vD;
        void main(){
          float dC = length(vec2(max(max(${(-EMB).toFixed(1)} - vW.x, vW.x - ${SHORE.toFixed(1)}), 0.0), max(abs(vW.z) - ${EMB.toFixed(1)}, 0.0)));
          vec2 qi = vec2(max(max(345.0 - vW.x, vW.x - 515.0), 0.0), max(abs(vW.z) - 105.0, 0.0));
          float dI = length(qi);
          float dN = length(vec2(max(max(-110.0 - vW.x, vW.x - 260.0), 0.0), max(max(-400.0 - vW.z, vW.z + 180.0), 0.0)));
          float dA = length(vec2(max(max(335.0 - vW.x, vW.x - 750.0), 0.0), max(max(-560.0 - vW.z, vW.z + 180.0), 0.0)));
          vec2 qT = vW.xz - vec2(760.0, 150.0); float aT = atan(qT.y, qT.x);
          float dT = max(length(qT) - 44.0 * (1.0 + 0.14 * sin(3.0 * aT + 0.7) + 0.07 * sin(5.0 * aT + 2.1) + 0.04 * sin(9.0 * aT)), 0.0);
          vec2 qM = vW.xz - vec2(-400.0, 380.0); float aM = atan(qM.y, qM.x);
          float dM = max(length(qM) - 86.0 * (1.0 + 0.1 * sin(2.0 * aM + 0.4) + 0.06 * sin(5.0 * aM + 1.3) + 0.03 * sin(11.0 * aM)), 0.0);
          float far = clamp(min(min(min(min(min(dC, dI), dN), dA), dT), dM) / 60.0, 0.0, 1.0);
          vec3 c = mix(uShallow, uDeep, far);
          float w1 = sin(vW.x*0.35 + uTime*1.2) * 0.5 + sin(vW.z*0.23 - uTime*0.8 + vW.x*0.1) * 0.5;
          float w2 = sin((vW.x+vW.z)*0.9 + uTime*2.0) * sin(vW.z*1.3 - uTime*1.4);
          vec3 n = normalize(vec3(w2*0.12, 1.0, w1*0.12));
          vec3 v = normalize(cameraPosition - vW);
          float spec = pow(max(dot(reflect(-v, n), uSun), 0.0), 70.0);
          c += uSpec * spec * 1.6;
          c += uRim * (1.0 - max(dot(v, vec3(0.,1.,0.)), 0.0)) * 0.25;
          float sand = min(min(min(dI, dT), dM), vW.x > ${(CITY).toFixed(1)} ? dC : 99.0);
          float wob = sin((vW.z + vW.x)*0.15 + uTime*0.9)*0.8 + sin(uTime*0.7)*0.7;
          float foam = smoothstep(2.6, 0.0, abs(sand - wob - 1.2)) * (0.6 + 0.4*sin((vW.z + vW.x)*1.7 + uTime*3.0));
          c = mix(c, vec3(1.0,0.97,0.94) * uFoam, clamp(foam,0.0,1.0) * 0.75);
          c = mix(c, uFog, smoothstep(uNear, uFar, vD));
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    // the sea is a ring round the city (its middle cut out as geometry, so nothing is drawn under the streets)
    const seaGeo = (() => {
      const pos = [], idx = [], quad = (x0, z0, x1, z1) => { const n = pos.length / 3; pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1); idx.push(n, n + 2, n + 1, n, n + 3, n + 2); };
      const X0 = -1300, X1 = 1700, Z0 = -1500, Z1 = 1500, a = -EMB, b = SHORE - .6;
      quad(X0, Z0, a, Z1); quad(b, Z0, X1, Z1); quad(a, Z0, b, -EMB); quad(a, EMB, b, Z1);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeBoundingSphere(); return g;
    })();
    seaMat.side = THREE.DoubleSide;
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.position.y = .05; scene.add(sea);

    /* ---------- minimap base ---------- */
    const MAP = { x0: WORLD.x0, z0: WORLD.z0, x1: WORLD.x1, z1: WORLD.z1, s: 1.3 };
    const mc = document.createElement('canvas');
    mc.width = (MAP.x1 - MAP.x0) * MAP.s; mc.height = (MAP.z1 - MAP.z0) * MAP.s;
    {
      const g = mc.getContext('2d'), X = x => (x - MAP.x0) * MAP.s, Z = z => (z - MAP.z0) * MAP.s;
      g.fillStyle = '#2d6f9c'; g.fillRect(0, 0, mc.width, mc.height);
      g.fillStyle = '#e6c78d'; g.fillRect(X(CITY), Z(-EMB), X(SHORE) - X(CITY), Z(EMB) - Z(-EMB));
      g.fillStyle = '#3d3848'; g.fillRect(X(-CITY), Z(-CITY), X(CITY) - X(-CITY), Z(CITY) - Z(-CITY));
      for (const s of mapShapes) {
        g.fillStyle = s.k === 'b' ? shade(s.c, .78) : s.c;
        g.fillRect(X(s.x0), Z(s.z0), (s.x1 - s.x0) * MAP.s, (s.z1 - s.z0) * MAP.s);
      }
    }
    function shade(hex, k) { const c = C(hex).multiplyScalar(k); return '#' + c.getHexString(); }

    function districtAt(x, z) {
      if (club && club.inside(x, z)) return club.name;
      const pl = places.at(x, z); if (pl) return pl.name;
      const isl = island.districtAt(x, z); if (isl) return isl;
      const ns = north.districtAt(x, z); if (ns) return ns;
      const bv = bay.districtAt(x, z); if (bv) return bv;
      const tr = tropic.districtAt(x, z); if (tr) return tr;
      const ml = military.districtAt(x, z); if (ml) return ml;
      if (x > SHORE + 8 || x < -EMB || Math.abs(z) > EMB) return x > SHORE && x < 560 && Math.abs(z) < 128 ? 'Залив Неплохо' : 'Открытое море';
      if (x > CITY) return 'Пляж Not Bad';
      if (x > 52) return 'Бульвар Not Bad';
      if (Math.abs(x) < 52 && Math.abs(z) < 52) return 'Даунтаун NEPLOXO';
      if (x < -52) return z > 0 ? 'Лёха-Хайтс' : 'Гавань Лёхи';
      return z < 0 ? 'Рынок «Неплохо»' : 'Квартал 21';
    }

    return {
      col, districtAt, bounds: WORLD, layout: { ROADS, RH, CITY, SHORE, blocks }, benches, loungers, station, hospital, gunShop, fashion, security, strip, club, places, island, north, bay, tropic, hideaway, military, spray, street, fireStation, reserved: RESERVED, map: { canvas: mc, x0: MAP.x0, z0: MAP.z0, s: MAP.s },
      spawn: { x: CITY + 1.8, z: 4.5, heading: Math.PI / 2 },
      // env comes from the day/night cycle: how bright the neon glows, which windows and lamps are on, the sea colours
      update(t, env) {
        const u = seaMat.uniforms; u.uTime.value = t;
        const glow = env ? env.glow : .24;
        glowMat.opacity = glow + Math.sin(t * 2.3) * .02 + (Math.sin(t * 17) > .97 ? -.06 : 0);
        if (!env) return;
        if (club) club.update(t, env, env.px, env.pz);
        places.render(t, env); island.update(t, env); north.update(t, env); bay.update(t, env); tropic.update(t); hideaway.update(t); military.update(t, env); spray.render(t);
        u.uSun.value.copy(env.specDir); u.uSpec.value.copy(env.spec); u.uShallow.value.copy(env.seaA); u.uDeep.value.copy(env.seaB); u.uRim.value.copy(env.rim); u.uFoam.value = env.foam;
        facadeMat.emissiveIntensity = env.windows;
        headMat.color.copy(LAMP_OFF).lerp(LAMP_ON, env.lamps);
        poolMat.opacity = env.lamps * (.5 + wetPools * .4); poolMesh.visible = env.lamps > .02;
      },
      setFog(near, far) { seaMat.uniforms.uNear.value = near; seaMat.uniforms.uFar.value = far; },
      // rain: dark wet asphalt and pavements, damp sand, the lamp light pooling brighter on the wet ground
      setWet(w) { asphaltMat.color.setScalar(1 - w * .42); pavingMat.color.setScalar(1 - w * .3); sandMat.color.setScalar(1 - w * .22); wetPools = w; }
    };
  };
})(window.NB);
