// Bayview: the island north-east of the city, between the North Side and Palm Island. A quiet middle-class
// neighbourhood in the south (family houses with lawns, fences and driveways, pastel apartment blocks, a main
// street of shops, a school with a sports field, a supermarket, a gas station, a park with a pond, a church)
// and Neon Bay International Airport in the north: a runway, a taxiway, an apron with airliners at the gates,
// a glass terminal, a control tower, hangars with light planes, fuel tanks. One airliner lands, turns round
// and takes off again all day long. Two low bridges: the Harbour Bridge from the North Side and the Bayview
// Bridge from Palm Island. Built with the city's own builders and its own random numbers.
(function (NB) {
  'use strict';
  const FLAT = [.03, .5];

  NB.buildBayview = function (k) {
    const { C, U, col, scene, bPlain, bFacade, bNeon, bGlow, bAsphalt, bPaving, building, sign, awning, neonRing, mapShapes, palms, lamps, FT } = k;
    const R = U.rng(7070), rr = (a, b) => a + R() * (b - a), pick = a => a[(R() * a.length) | 0], chance = p => R() < p;
    const G0 = .45, Y = G0 + .15;                             // the ground, and the top of the pavements
    const XS = [345, 397.5, 447.5, 500, 560, 620, 680, 740], ZS = [-190, -240, -290, -340, -390], RH = 6, SW = 3;
    const B = { x0: 335, x1: 750, z0: -560, z1: -180 };
    const AZ = -402;                                        // the airport fence: homes to the south, the airport to the north
    const spots = [], parking = [], blocks = [], walkways = [];
    const GRASS = '#5aa35a', WHITE = C('#f5f5f0'), YEL = C('#e8c040');

    /* ---------- little builders ---------- */
    // a quad whose corners are put in the order that makes it face along n
    function quad4(a, b, c, d, n, colr) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { const t = b; b = d; d = t; cx = -cx; cy = -cy; cz = -cz; }
      const L = Math.hypot(cx, cy, cz) || 1;
      bPlain.quad(a, b, c, d, cx / L, cy / L, cz / L, colr, FLAT, FLAT, FLAT, FLAT);
    }
    // a gable roof over a box, the ridge along x (or along z)
    function gable(x0, z0, x1, z1, y, h, hex, alongZ) {
      const c = C(hex), d = c.clone().multiplyScalar(.78), o = .45, yt = y + h;
      if (!alongZ) {
        const zm = (z0 + z1) / 2;
        quad4([x0 - o, y - .2, z1 + o], [x1 + o, y - .2, z1 + o], [x1 + o, yt, zm], [x0 - o, yt, zm], [0, 1, 1], c);
        quad4([x1 + o, y - .2, z0 - o], [x0 - o, y - .2, z0 - o], [x0 - o, yt, zm], [x1 + o, yt, zm], [0, 1, -1], c);
        quad4([x1, y, z1], [x1, y, z0], [x1, yt, zm], [x1, yt, zm], [1, 0, 0], d);
        quad4([x0, y, z0], [x0, y, z1], [x0, yt, zm], [x0, yt, zm], [-1, 0, 0], d);
      } else {
        const xm = (x0 + x1) / 2;
        quad4([x1 + o, y - .2, z0 - o], [x1 + o, y - .2, z1 + o], [xm, yt, z1 + o], [xm, yt, z0 - o], [1, 1, 0], c);
        quad4([x0 - o, y - .2, z1 + o], [x0 - o, y - .2, z0 - o], [xm, yt, z0 - o], [xm, yt, z1 + o], [-1, 1, 0], c);
        quad4([x0, y, z1], [x1, y, z1], [xm, yt, z1], [xm, yt, z1], [0, 0, 1], d);
        quad4([x1, y, z0], [x0, y, z0], [xm, yt, z0], [xm, yt, z0], [0, 0, -1], d);
      }
    }
    // a rectangle on face f of box b, 'off' along the face, half-width hw, sticking out 'out'
    const fr = (f, b, out, hw, off) => {
      const cx = (b.x0 + b.x1) / 2 + (f[1] === 'z' ? off : 0), cz = (b.z0 + b.z1) / 2 + (f[1] === 'x' ? off : 0);
      return f === '+x' ? [b.x1, cz - hw, b.x1 + out, cz + hw] : f === '-x' ? [b.x0 - out, cz - hw, b.x0, cz + hw] : f === '+z' ? [cx - hw, b.z1, cx + hw, b.z1 + out] : [cx - hw, b.z0 - out, cx + hw, b.z0];
    };
    const fbox = (f, b, out, hw, off, y0, y1, hex, mat) => { const [a, c, d, e] = fr(f, b, out, hw, off); (mat || bPlain).box(a, y0, c, d, y1, e, C(hex)); };
    const faceLen = (f, b) => f[1] === 'x' ? b.z1 - b.z0 : b.x1 - b.x0;
    const DOORS = ['#6a3a2a', '#2a3a5a', '#8a2a3a', '#2f5a3a', '#f5f5f0', '#3a3a40'];
    function door(f, b, off, y, hex, glass) {
      fbox(f, b, .1, .78, off, y, y + 2.5, '#f5f5f0');
      fbox(f, b, .14, .6, off, y, y + 2.3, hex);
      if (glass) fbox(f, b, .16, .45, off, y + .2, y + 2.1, '#9ab4c8', bNeon);
      else fbox(f, b, .2, .05, off + .4, y + 1.05, y + 1.15, '#d0b060');
      fbox(f, b, .22, .12, off, y + 2.62, y + 2.8, '#ffd9a0', bNeon);
    }
    function win(f, b, off, y0, y1, hw) {
      hw = hw || .62;
      fbox(f, b, .07, hw + .14, off, y0 - .1, y1 + .1, '#f5f5f0');
      const lit = chance(.2);
      fbox(f, b, .11, hw, off, y0, y1, lit ? '#8a7650' : '#243044', lit ? bNeon : bPlain);
      fbox(f, b, .22, hw + .2, off, y0 - .16, y0 - .06, '#e8e2d6');
    }
    // a round tree: a trunk and a two-tone crown
    function tree(x, z, s) {
      s = s || rr(.8, 1.2);
      bPlain.box(x - .18, Y, z - .18, x + .18, Y + 2.2 * s, z + .18, C('#6a4a32')); col.add(x - .2, 0, z - .2, x + .2, Y + 2.2 * s, z + .2);
      const g = pick(['#3f8a44', '#4f9a4c', '#357a3c']);
      bPlain.box(x - 1.4 * s, Y + 1.9 * s, z - 1.4 * s, x + 1.4 * s, Y + 3.9 * s, z + 1.4 * s, C(g));
      bPlain.box(x - 1 * s, Y + 3.9 * s, z - 1 * s, x + 1 * s, Y + 4.6 * s, z + 1 * s, C(g).multiplyScalar(1.12));
    }
    const lawn = (x0, z0, x1, z1) => { bPlain.box(x0, Y, z0, x1, Y + .04, z1, C(GRASS)); mapShapes.push({ x0, z0, x1, z1, c: '#4f9a5c', k: 'p' }); };
    const bench = (x, z, face) => {
      const rot = Math.abs(Math.sin(face)) > .5, w = rot ? .6 : 1.8, d = rot ? 1.8 : .6;
      bPlain.box(x - w / 2, Y, z - d / 2, x + w / 2, Y + .45, z + d / 2, C('#b77a4a')); col.add(x - w / 2, 0, z - d / 2, x + w / 2, Y + .45, z + d / 2);
      if (chance(.6)) spots.push({ kind: 'sit', x: x - Math.sin(face) * .12, z: z - Math.cos(face) * .12, y: Y + .51, fixedY: true, heading: face, mix: 'bay', home: true });
    };
    const talk = (x, z, y) => { const grp = {}, n = chance(.4) ? 3 : 2, seed = R() * 10; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; spots.push({ kind: 'talk', x: x + Math.sin(a) * .55, z: z + Math.cos(a) * .55, y: y == null ? Y : y, fixedY: true, heading: Math.atan2(-Math.sin(a), -Math.cos(a)), mix: 'bay', seed, idx: i, n, grp, home: true }); } };
    const walker = (pts, type) => spots.push({ kind: 'walk', x: pts[0][0], z: pts[0][1], y: Y, fixedY: true, heading: 0, mix: 'bay', type, patrol: pts });
    // a lit sign painted on a canvas (for names that aren't on the city's sign sheet)
    function board(text, x, y, z, w, h, face, bg, fg) {
      const tex = U.canvasTex(1024, 160, (g, W, H) => {
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        let s = 110; g.font = `900 ${s}px "Arial Black", Impact, sans-serif`;
        const m = g.measureText(text).width; if (m > W * .92) { s = Math.floor(s * W * .92 / m); g.font = `900 ${s}px "Arial Black", Impact, sans-serif`; }
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg; g.fillText(text, W / 2, H / 2 + 4);
      }, false, 4);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(x, y, z); m.rotation.y = face; scene.add(m); return m;
    }

    /* ---------- the land ---------- */
    col.add(B.x0, -4, B.z0, B.x1, G0, B.z1);
    bPlain.box(B.x0, -3.6, B.z0, B.x1, G0, B.z1, C('#7c7872'));
    NB.water.hole({ x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1 });
    // the neighbourhood: streets everywhere between the blocks, a pavement round the edge
    bAsphalt.flat(B.x0 + 4, AZ + 4, B.x1 - 4, B.z1 - 4, G0 + .004, C('#ffffff'), 8);
    mapShapes.push({ x0: B.x0, z0: AZ, x1: B.x1, z1: B.z1, c: '#4a4452', k: 's' });
    for (const [x0, z0, x1, z1] of [[B.x0, AZ, B.x0 + 4, B.z1], [B.x1 - 4, AZ, B.x1, B.z1], [B.x0 + 4, B.z1 - 4, B.x1 - 4, B.z1], [B.x0 + 4, AZ, B.x1 - 4, AZ + 4]]) {
      bPaving.box(x0, G0, z0, x1, Y, z1, C('#d8d0c4'), { tile: 2, topTile: 2 }); col.add(x0, 0, z0, x1, Y, z1);
    }
    // (none where the two bridges come in: x 447.5 on the south edge, z -290 on the west edge)
    for (let x = B.x0 + 12; x < B.x1 - 8; x += 24) if (Math.abs(x - 447.5) > 8) lamps.push([x, B.z1 - 1.2, 0, Y]);
    for (let z = B.z1 - 14; z > AZ + 8; z -= 24) { if (Math.abs(z + 290) > 9) lamps.push([B.x0 + 1.2, z, Math.PI / 2, Y]); lamps.push([B.x1 - 1.2, z - 12, -Math.PI / 2, Y]); }
    // dashed yellow lines down the middle of the streets
    for (const x of XS) for (let z = AZ + 8; z < B.z1 - 6; z += 6) if (!ZS.some(L => Math.abs(z + 1.5 - L) < RH + 1)) bPlain.flat(x - .1, z, x + .1, z + 3, G0 + .02, YEL);
    for (const zz of ZS) for (let x = B.x0 + 6; x < B.x1 - 6; x += 6) if (!XS.some(L => Math.abs(x + 1.5 - L) < RH + 1)) bPlain.flat(x, zz - .1, x + 3, zz + .1, G0 + .02, YEL);

    /* ---------- the neighbourhood's blocks ---------- */
    const HOUSE = ['#f3e6c8', '#cfe3ef', '#f2d0d6', '#d8ecd2', '#efe2f5', '#fbe7c6', '#e6e0d6', '#c9dde8', '#f6f0e0'];
    const ROOF = ['#8a4a3a', '#5a5f6a', '#3a4a6a', '#6a3a3a', '#7a6a5a', '#4a5a4a'];
    const PASTELS = ['#f2c6d6', '#bfe3e0', '#f6e2b0', '#c9d6f2', '#e6d0f2', '#d6ecc6', '#f7d2b8'];
    // a family house with its front to s (+1: the +z street); returns its box
    function house(x0, z0, x1, z1, s) {
      const hex = pick(HOUSE), two = chance(.45), h = two ? 6 : 3.3, top = Y + h;
      bPlain.box(x0, Y, z0, x1, top, z1, C(hex)); col.add(x0, 0, z0, x1, top + 1, z1);
      bPlain.box(x0 - .06, Y, z0 - .06, x1 + .06, Y + .45, z1 + .06, C('#b8b0a2'));
      if (two) bPlain.box(x0 - .1, Y + 3.05, z0 - .1, x1 + .1, Y + 3.25, z1 + .1, C('#f5f5f0'));
      gable(x0, z0, x1, z1, top, rr(1.6, 2.3), pick(ROOF));
      mapShapes.push({ x0, z0, x1, z1, c: hex, k: 'b' });
      const f = s > 0 ? '+z' : '-z', bk = s > 0 ? '-z' : '+z', b = { x0, z0, x1, z1 }, L = x1 - x0;
      door(f, b, -L / 4, Y, pick(DOORS));
      fbox(f, b, 1.4, 1.2, -L / 4, Y, Y + .2, '#c8c0b4');   // the porch step
      fbox(f, b, 1.5, 1.35, -L / 4, Y + 2.75, Y + 2.9, '#f5f5f0');
      for (let fl = 0; fl < (two ? 2 : 1); fl++) {
        const y = Y + 1 + fl * 2.8;
        win(f, b, L / 6, y, y + 1.3); win(f, b, L / 3 + .4, y, y + 1.3); if (fl) win(f, b, -L / 4, y, y + 1.3);
        win(bk, b, -L / 5, y, y + 1.3); win(bk, b, L / 5, y, y + 1.3);
        win('+x', b, 0, y, y + 1.3); win('-x', b, 0, y, y + 1.3);
      }
      // a chimney on some
      if (chance(.4)) { const cx = x0 + L * .75; bPlain.box(cx - .4, top, (z0 + z1) / 2 - .4, cx + .4, top + 2.6, (z0 + z1) / 2 + .4, C('#8a4a3a')); }
      return b;
    }
    function houses(lx0, lz0, lx1, lz1) {
      lawn(lx0, lz0, lx1, lz1);
      const n = Math.max(2, Math.floor((lx1 - lx0) / 13)), W = (lx1 - lx0) / n;
      for (const s of [1, -1]) for (let k = 0; k < n; k++) {
        const xc = lx0 + W * (k + .5) + rr(-.8, .8), hw = Math.min(4.6, W / 2 - 2.4), dw = 3;   // half the house, the driveway's width
        const edge = s > 0 ? lz1 : lz0, front = edge - s * 6, back = front - s * 7.5;
        const hx0 = xc - hw - dw / 2, hx1 = xc + hw - dw / 2;
        house(hx0, Math.min(front, back), hx1, Math.max(front, back), s);
        // the driveway beside the house, a car on some
        const dx0 = hx1 + .5, dx1 = dx0 + dw, dz0 = Math.min(edge, front), dz1 = Math.max(edge, front);
        bPlain.box(dx0, Y, dz0, dx1, Y + .06, dz1, C('#a8a296'));
        if (chance(.28)) parking.push({ x: (dx0 + dx1) / 2, z: (dz0 + dz1) / 2 - s * .3, h: s > 0 ? Math.PI : 0 });
        // a path from the porch to the pavement, a picket fence along the front with gaps for both
        const px = hx0 + (hx1 - hx0) / 4;
        bPlain.box(px - .6, Y, dz0, px + .6, Y + .05, dz1, C('#d8d0c4'));
        const fz = edge - s * .15;
        for (const [a, b2] of [[xc - W / 2 + .3, px - .8], [px + .8, dx0 - .2]]) if (b2 - a > .4) {
          bPlain.box(a, Y, fz - .05, b2, Y + .8, fz + .05, WHITE); col.add(a, 0, fz - .08, b2, Y + .8, fz + .08);
          for (let x = a; x < b2; x += .5) bPlain.box(x, Y + .8, fz - .05, x + .12, Y + .95, fz + .05, WHITE);
        }
        bPlain.box(dx1 + .3, Y, fz - .08, dx1 + .42, Y + 1, fz + .08, C('#6a5a4a')); bPlain.box(dx1 + .15, Y + 1, fz - .2, dx1 + .6, Y + 1.3, fz + .2, C(pick(['#3a4a8a', '#8a2a2a', '#2a2a2e'])));   // the mailbox
        if (chance(.6)) tree(xc - W / 2 + 1.8, edge - s * 3); else if (chance(.5)) palms.push([xc - W / 2 + 1.8, Y, edge - s * 3]);
        if (chance(.18)) talk(px + 1.8, edge - s * 3.5);
      }
      // swimming pools in some back yards
      const mid = (lz0 + lz1) / 2;
      for (let k = 0; k < n; k++) if (chance(.35)) { const xc = lx0 + W * (k + .5); bPlain.box(xc - 3, Y + .01, mid - 1.2, xc + 3, Y + .06, mid + 1.2, C('#e8e2d6')); bNeon.box(xc - 2.7, Y + .062, mid - .95, xc + 2.7, Y + .07, mid + .95, C('#4fc8e8')); }
    }
    function apartments(lx0, lz0, lx1, lz1, cz) {
      for (const [z0, z1, f] of [[lz0 + 1, cz - 5, '-z'], [cz + 5, lz1 - 1, '+z']]) {
        const hex = pick(PASTELS), h = G0 + 4 * (2 + ((R() * 3) | 0)) + .6, b = building(lx0 + 1, z0, lx1 - 1, z1, h, hex, Y);
        for (let y = Y + 4; y < h - 2; y += 4) for (let off = -faceLen(f, b) / 2 + 4; off < faceLen(f, b) / 2 - 3; off += 6) {
          fbox(f, b, 1.2, 1.5, off, y, y + .12, '#f5f5f0'); fbox(f, b, 1.2, 1.5, off, y + .12, y + 1, pick(['#f5f5f0', '#e8e2d6']));   // balconies
        }
        door(f, b, 0, Y, '#2a3a4a', true); fbox(f, b, 2, 2, 0, Y + 2.9, Y + 3.1, '#f5f5f0');
        neonRing(b.x0, b.z0, b.x1, b.z1, h - .4, pick(['#ff4fa3', '#3fe6e0', '#ffd23d']), true);
        talk((b.x0 + b.x1) / 2 + 3, f === '+z' ? b.z1 + 1.8 : b.z0 - 1.8);
      }
      // the residents' car park between the two blocks
      bPlain.box(lx0 + 1, Y, cz - 4.5, lx1 - 1, Y + .03, cz + 4.5, C('#4a4652'));
      for (let x = lx0 + 4; x < lx1 - 3; x += 3) { bPlain.flat(x, cz - 4.4, x + .1, cz - 1.5, Y + .04, WHITE); if (chance(.14)) parking.push({ x: x + 1.5, z: cz - 2.2, h: Math.PI }); }
      for (let x = lx0 + 4; x < lx1 - 3; x += 3) { bPlain.flat(x, cz + 1.5, x + .1, cz + 4.4, Y + .04, WHITE); if (chance(.14)) parking.push({ x: x + 1.5, z: cz + 2.2, h: 0 }); }
    }
    function shops(lx0, lz0, lx1, lz1, cx, cz) {
      const words = ['CAFE', 'PIZZA', 'VIDEO', 'DINER', 'SURF', 'LAUNDRY', 'BAR', 'ARCADE', 'FASHION', 'TATTOO'];
      for (const [x0, z0, x1, z1] of [[lx0, lz0, cx - 1, cz - 1], [cx + 1, lz0, lx1, cz - 1], [lx0, cz + 1, cx - 1, lz1], [cx + 1, cz + 1, lx1, lz1]]) {
        const b = building(x0, z0, x1, z1, G0 + rr(6, 9), pick(PASTELS), Y);
        const dx = (b.x0 + b.x1) / 2 - cx, dz = (b.z0 + b.z1) / 2 - cz, f = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? '+x' : '-x') : (dz > 0 ? '+z' : '-z');
        const L = faceLen(f, b), ww = Math.min(4.5, L / 4 - 1.2);
        bPlain.box(b.x0 - .05, Y, b.z0 - .05, b.x1 + .05, Y + 3.6, b.z1 + .05, C(pick(['#f5f5f0', '#e8e2d6', '#d8d0c4'])), { noTop: true });
        for (const off of [-(ww + 1.4), ww + 1.4]) { fbox(f, b, .1, ww + .15, off, Y + .45, Y + 2.55, '#2a2a2e'); fbox(f, b, .14, ww, off, Y + .6, Y + 2.4, pick(['#c8b890', '#a8c0c8', '#d8b0b8', '#b8d0a8']), bNeon); }
        door(f, b, 0, Y, '#2a2a2e', true);
        fbox(f, b, 1.6, Math.min(L / 2 - .5, 2 * ww + 3), 0, Y + 2.8, Y + 3.0, pick(['#ff4fa3', '#3fe6e0', '#ffd23d', '#2a6fe8', '#e8202a']));
        sign(f, b, Y + 3.3, Y + 4.7, 1.6, pick(words));
        talk(...(f === '+x' ? [b.x1 + 1.8, (b.z0 + b.z1) / 2 + 4] : f === '-x' ? [b.x0 - 1.8, (b.z0 + b.z1) / 2 + 4] : f === '+z' ? [(b.x0 + b.x1) / 2 + 4, b.z1 + 1.8] : [(b.x0 + b.x1) / 2 + 4, b.z0 - 1.8]));
      }
    }
    function school(lx0, lz0, lx1, lz1) {
      const b = building(lx0 + 1, lz0 + 1, lx1 - 1, lz0 + 12, G0 + 8.6, '#e8c9a0', Y);
      bPlain.box(b.x0 - .1, b.h - .5, b.z0 - .1, b.x1 + .1, b.h, b.z1 + .1, C('#b84a3a'));
      door('+z', b, 0, Y, '#2a3a5a', true); door('+z', b, -8, Y, '#2a3a5a', true);
      board('BAYVIEW HIGH SCHOOL', (b.x0 + b.x1) / 2, Y + 5.2, b.z1 + .12, 16, 1.8, 0, '#1c2a4a', '#ffd23d');
      bPlain.box((b.x0 + b.x1) / 2 + 8, Y, b.z1 + 2, (b.x0 + b.x1) / 2 + 8.12, Y + 7, b.z1 + 2.12, C('#d0d0d4'));   // the flagpole
      bPlain.box((b.x0 + b.x1) / 2 + 8.12, Y + 5.6, b.z1 + 2.03, (b.x0 + b.x1) / 2 + 10, Y + 6.8, b.z1 + 2.09, C('#e8202a'));
      // the sports field: grass inside a red running track, white lines, goals at both ends
      const fx0 = lx0 + 2, fx1 = lx1 - 2, fz0 = lz0 + 15, fz1 = lz1 - 1;
      bPlain.box(fx0, Y, fz0, fx1, Y + .03, fz1, C('#b8563e')); lawn(fx0 + 2.4, fz0 + 2.4, fx1 - 2.4, fz1 - 2.4);
      const mx = (fx0 + fx1) / 2;
      for (const [a, b2, c, d] of [[fx0 + 3.4, fz0 + 3.4, fx1 - 3.4, fz0 + 3.5], [fx0 + 3.4, fz1 - 3.5, fx1 - 3.4, fz1 - 3.4], [fx0 + 3.4, fz0 + 3.4, fx0 + 3.5, fz1 - 3.4], [fx1 - 3.5, fz0 + 3.4, fx1 - 3.4, fz1 - 3.4], [mx - .05, fz0 + 3.4, mx + .05, fz1 - 3.4]]) bPlain.flat(a, b2, c, d, Y + .05, WHITE);
      for (const gx of [fx0 + 3.6, fx1 - 3.6]) { const zm = (fz0 + fz1) / 2; for (const z of [zm - 2.5, zm + 2.5]) bPlain.box(gx - .06, Y, z - .06, gx + .06, Y + 2.2, z + .06, WHITE); bPlain.box(gx - .06, Y + 2.1, zm - 2.5, gx + .06, Y + 2.2, zm + 2.5, WHITE); }
      talk(mx - 6, (fz0 + fz1) / 2 + 2, Y + .04); talk(mx + 7, (fz0 + fz1) / 2 - 3, Y + .04);
      walker([[fx0 + 1.2, fz0 + 1.2], [fx1 - 1.2, fz0 + 1.2], [fx1 - 1.2, fz1 - 1.2], [fx0 + 1.2, fz1 - 1.2]], 'jogger');
    }
    function market(lx0, lz0, lx1, lz1) {
      const b = building(lx0 + 1, lz0 + 1, lx1 - 1, lz0 + 16, G0 + 6.6, '#f0ece4', Y);
      bPlain.box(b.x0 - .1, b.h - 1.2, b.z0 - .1, b.x1 + .1, b.h, b.z1 + .12, C('#2aa89a'));
      bPlain.box(b.x0 - .05, Y, b.z0 - .05, b.x1 + .05, Y + 3.8, b.z1 + .05, C('#f0ece4'), { noTop: true });
      fbox('+z', b, .1, faceLen('+z', b) / 2 - 3, 0, Y + .2, Y + 3.2, '#2a2a2e'); fbox('+z', b, .14, faceLen('+z', b) / 2 - 3.3, 0, Y + .3, Y + 3.1, '#b8d0d8', bNeon);
      door('+z', b, -4, Y, '#2a2a2e', true); door('+z', b, 4, Y, '#2a2a2e', true);
      board('SUPERMARKET', (b.x0 + b.x1) / 2, b.h + 1.3, b.z1 + .3, 14, 2.2, 0, '#e8202a', '#ffffff');
      // the car park in front: lines, parked cars, a trolley shelter
      const pz0 = b.z1 + 2, pz1 = lz1 - .5;
      bPlain.box(lx0 + .5, Y, pz0, lx1 - .5, Y + .03, pz1, C('#4a4652'));
      for (const [z0, z1, h] of [[pz0 + .5, pz0 + 5.5, 0], [pz1 - 5.5, pz1 - .5, Math.PI]]) for (let x = lx0 + 2; x < lx1 - 3; x += 3) { bPlain.flat(x, z0, x + .1, z1, Y + .04, WHITE); if (chance(.22)) parking.push({ x: x + 1.5, z: (z0 + z1) / 2, h }); }
      bPlain.box(lx1 - 6, Y, (pz0 + pz1) / 2 - .8, lx1 - 2, Y + 2.2, (pz0 + pz1) / 2 + .8, C('#9aa4b0'));
      talk((b.x0 + b.x1) / 2 + 8, b.z1 + 1.2);
    }
    function gas(lx0, lz0, lx1, lz1, cx, cz) {
      bPlain.box(lx0, Y, lz0, lx1, Y + .03, lz1, C('#6a6672'));
      const shop = building(lx0 + 2, lz0 + 1, lx0 + 16, lz0 + 10, G0 + 4.6, '#f5f5f0', Y);
      door('+z', shop, 0, Y, '#2a2a2e', true); fbox('+z', shop, .14, 2.5, 4, Y + .6, Y + 2.4, '#c8d8e0', bNeon);
      // the canopy over the pumps
      const x0 = cx - 6, x1 = cx + 12, z0 = cz - 3, z1 = cz + 9;
      for (const [x, z] of [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]]) { bPlain.box(x - .3, Y, z - .3, x + .3, Y + 5, z + .3, C('#d0d0d4')); col.add(x - .3, 0, z - .3, x + .3, Y + 5, z + .3); }
      bPlain.box(x0, Y + 5, z0, x1, Y + 5.8, z1, C('#f5f5f0')); bNeon.box(x0 - .05, Y + 5.3, z0 - .05, x1 + .05, Y + 5.6, z1 + .05, C('#e8202a'));
      for (const px of [cx - 1, cx + 7]) { bPlain.box(px - .5, Y, cz + 2.4, px + .5, Y + 1.6, cz + 3.6, C('#e8202a')); col.add(px - .5, 0, cz + 2.4, px + .5, Y + 1.6, cz + 3.6); bNeon.box(px - .3, Y + 1.2, cz + 3.6, px + .3, Y + 1.5, cz + 3.62, C('#8fe3d6')); }
      board('GAS 24/7', x1 - 1, Y + 7.5, z1 + .5, 5, 1.4, 0, '#1c2a4a', '#ffd23d');
      bPlain.box(x1 - 1.1, Y, z1 + .3, x1 - .9, Y + 6.8, z1 + .5, C('#d0d0d4'));
      parking.push({ x: cx + 3, z: cz + 3, h: Math.PI / 2 });
    }
    function park(lx0, lz0, lx1, lz1, cx, cz) {
      lawn(lx0, lz0, lx1, lz1);
      // paths: a cross and a ring round the pond
      bPlain.box(cx - 1.2, Y + .04, lz0, cx + 1.2, Y + .07, lz1, C('#d8cdb4')); bPlain.box(lx0, Y + .04, cz - 1.2, lx1, Y + .07, cz + 1.2, C('#d8cdb4'));
      const px0 = cx + 4, px1 = lx1 - 4, pz0 = lz0 + 3, pz1 = cz - 4;
      bPlain.box(px0 - .6, Y, pz0 - .6, px1 + .6, Y + .3, pz1 + .6, C('#b8b0a2')); col.add(px0 - .6, 0, pz0 - .6, px1 + .6, Y + .3, pz1 + .6);
      bNeon.box(px0, Y + .31, pz0, px1, Y + .32, pz1, C('#5ab8d8'));
      for (let k = 0; k < 2; k++) { const x = rr(px0 + 1, px1 - 1), z = rr(pz0 + 1, pz1 - 1); bPlain.box(x - .3, Y + .32, z - .2, x + .3, Y + .55, z + .2, WHITE); }   // ducks
      // a playground: a slide and swings
      const gx = lx0 + 6, gz = lz1 - 7;
      bPlain.box(gx - 3, Y, gz - 3, gx + 3, Y + .05, gz + 3, C('#d8b88a'));
      bPlain.box(gx - 2.4, Y, gz - .5, gx - 1.6, Y + 2.2, gz + .5, C('#e8202a')); quad4([gx - 1.6, Y + 2.2, gz - .45], [gx - 1.6, Y + 2.2, gz + .45], [gx + 1.4, Y + .2, gz + .45], [gx + 1.4, Y + .2, gz - .45], [.5, 1, 0], C('#ffd23d'));
      col.add(gx - 2.4, 0, gz - .5, gx - 1.6, Y + 2.2, gz + .5);
      for (const x of [gx + 1.5, gx + 3.5]) { bPlain.box(x - .06, Y, gz - 2.6, x + .06, Y + 2.4, gz - 2.48, C('#3a6ac8')); }
      bPlain.box(gx + 1.5, Y + 2.35, gz - 2.6, gx + 3.5, Y + 2.45, gz - 2.48, C('#3a6ac8'));
      bench(cx - 4, cz + 3, 0); bench(cx + 4, cz - 3, Math.PI); bench(lx0 + 3, cz + 6, Math.PI / 2); bench(lx1 - 3, cz + 6, -Math.PI / 2);
      for (let k = 0; k < 7; k++) { const x = rr(lx0 + 2, lx1 - 2), z = rr(lz0 + 2, lz1 - 2); if (Math.abs(x - cx) > 3 && Math.abs(z - cz) > 3 && !(x > px0 - 2 && x < px1 + 2 && z > pz0 - 2 && z < pz1 + 2) && !(Math.abs(x - gx) < 5 && Math.abs(z - gz) < 5)) tree(x, z); }
      talk(cx - 6, cz - 6); walker([[lx0 + 1.5, lz0 + 1.5], [lx1 - 1.5, lz0 + 1.5], [lx1 - 1.5, lz1 - 1.5], [lx0 + 1.5, lz1 - 1.5]]);
    }
    function church(lx0, lz0, lx1, lz1, cx, cz) {
      lawn(lx0, lz0, lx1, lz1);
      const x0 = cx - 6, x1 = cx + 6, z0 = cz - 12, z1 = cz + 8, h = Y + 7;
      bPlain.box(x0, Y, z0, x1, h, z1, C('#f5f2ea')); col.add(x0, 0, z0, x1, h + 3, z1); mapShapes.push({ x0, z0, x1, z1, c: '#f5f2ea', k: 'b' });
      gable(x0, z0, x1, z1, h, 4, '#6a3a3a', true);
      const t = { x0: cx - 2.2, z0: z1, x1: cx + 2.2, z1: z1 + 4.4 };
      bPlain.box(t.x0, Y, t.z0, t.x1, Y + 14, t.z1, C('#f5f2ea')); col.add(t.x0, 0, t.z0, t.x1, Y + 14, t.z1);
      quad4([t.x0, Y + 14, t.z1], [t.x1, Y + 14, t.z1], [cx, Y + 19, t.z0 + 2.2], [cx, Y + 19, t.z0 + 2.2], [0, 1, 1], C('#6a3a3a'));
      quad4([t.x1, Y + 14, t.z0], [t.x0, Y + 14, t.z0], [cx, Y + 19, t.z0 + 2.2], [cx, Y + 19, t.z0 + 2.2], [0, 1, -1], C('#6a3a3a'));
      quad4([t.x1, Y + 14, t.z1], [t.x1, Y + 14, t.z0], [cx, Y + 19, t.z0 + 2.2], [cx, Y + 19, t.z0 + 2.2], [1, 1, 0], C('#5a3030'));
      quad4([t.x0, Y + 14, t.z0], [t.x0, Y + 14, t.z1], [cx, Y + 19, t.z0 + 2.2], [cx, Y + 19, t.z0 + 2.2], [-1, 1, 0], C('#5a3030'));
      bPlain.box(cx - .08, Y + 19, t.z0 + 2.12, cx + .08, Y + 20.6, t.z0 + 2.28, C('#d0b060')); bPlain.box(cx - .5, Y + 19.9, t.z0 + 2.12, cx + .5, Y + 20.06, t.z0 + 2.28, C('#d0b060'));
      door('+z', t, 0, Y, '#6a3a2a');
      for (const z of [z0 + 4, z0 + 9, z0 + 14]) for (const f of ['+x', '-x']) win(f, { x0, z0: z - 1, x1, z1: z + 1 }, 0, Y + 2, Y + 5, .5);
      for (let k = 0; k < 4; k++) tree(pick([lx0 + 3, lx1 - 3]), rr(lz0 + 3, lz1 - 3));
      bench(cx - 5, z1 + 3, 0); bench(cx + 5, z1 + 3, 0); talk(cx + 4, z1 + 6);
    }

    const PLAN = [
      ['houses', 'shops', 'shops', 'houses', 'apartments', 'houses', 'park'],
      ['houses', 'school', 'houses', 'market', 'houses', 'apartments', 'houses'],
      ['apartments', 'houses', 'park', 'houses', 'gas', 'houses', 'apartments'],
      ['houses', 'apartments', 'houses', 'church', 'houses', 'houses', 'houses']
    ];
    for (let j = 0; j < ZS.length - 1; j++) for (let i = 0; i < XS.length - 1; i++) {
      const bx0 = XS[i] + RH, bx1 = XS[i + 1] - RH, bz1 = ZS[j] - RH, bz0 = ZS[j + 1] + RH;
      const lx0 = bx0 + SW, lx1 = bx1 - SW, lz0 = bz0 + SW, lz1 = bz1 - SW, cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2, type = PLAN[j][i];
      bPaving.box(bx0, G0, bz0, bx1, Y, bz1, C('#d8d0c4'), { tile: 2, topTile: 2 }); col.add(bx0, 0, bz0, bx1, Y, bz1);
      mapShapes.push({ x0: bx0, z0: bz0, x1: bx1, z1: bz1, c: '#8e8798', k: 's' });
      blocks.push({ i: 200 + i, j: 200 + j, bx0, bx1, bz0, bz1, type: 'suburb', bay: true });
      for (const [x, z, r] of [[bx0 + .9, bz0 + 8, -Math.PI / 2], [bx1 - .9, bz1 - 8, Math.PI / 2], [cx, bz1 - .9, Math.PI], [cx + 6, bz0 + .9, 0]]) lamps.push([x, z, r, Y]);
      // a fire hydrant on one corner
      bPlain.box(bx0 + .5, Y, bz1 - .9, bx0 + .8, Y + .7, bz1 - .6, C('#e8c020'));
      if (type === 'houses') houses(lx0, lz0, lx1, lz1);
      else if (type === 'apartments') apartments(lx0, lz0, lx1, lz1, cz);
      else if (type === 'shops') shops(lx0, lz0, lx1, lz1, cx, cz);
      else if (type === 'school') school(lx0, lz0, lx1, lz1);
      else if (type === 'market') market(lx0, lz0, lx1, lz1);
      else if (type === 'gas') gas(lx0, lz0, lx1, lz1, cx, cz);
      else if (type === 'park') park(lx0, lz0, lx1, lz1, cx, cz);
      else church(lx0, lz0, lx1, lz1, cx, cz);
      // cars at the kerb
      for (const side of [-1, 1]) if (chance(.2)) parking.push({ x: side < 0 ? bx0 - 1.1 : bx1 + 1.1, z: cz + rr(-10, 10), h: side < 0 ? 0 : Math.PI });
    }

    /* ---------- the airport ---------- */
    const AY = G0 + .006;
    bPlain.box(B.x0, G0, B.z0, B.x1, G0 + .003, AZ, C('#6aa860'));
    mapShapes.push({ x0: B.x0, z0: B.z0, x1: B.x1, z1: AZ, c: '#5a9a5c', k: 'p' });
    const tarmac = (x0, z0, x1, z1, hex) => { bPlain.box(x0, G0, z0, x1, AY, z1, C(hex || '#55525c')); mapShapes.push({ x0, z0, x1, z1, c: '#3d3848', k: 's' }); };
    // the runway: edge lines, a dashed centre line, piano keys at both ends, lights all along
    const RW = { x0: 355, x1: 740, z0: -545, z1: -520 }, RZ = (RW.z0 + RW.z1) / 2;
    tarmac(RW.x0, RW.z0, RW.x1, RW.z1, '#48454f');
    for (const z of [RW.z0 + .6, RW.z1 - .9]) bPlain.flat(RW.x0 + 2, z, RW.x1 - 2, z + .3, AY + .003, WHITE);
    for (let x = RW.x0 + 30; x < RW.x1 - 30; x += 18) bPlain.flat(x, RZ - .25, x + 10, RZ + .25, AY + .003, WHITE);
    for (const x of [RW.x0 + 3, RW.x1 - 15]) for (let z = RW.z0 + 2.5; z < RW.z1 - 2.5; z += 2.2) bPlain.flat(x, z, x + 12, z + 1.2, AY + .003, WHITE);
    for (let x = RW.x0; x <= RW.x1; x += 15) for (const z of [RW.z0 - .4, RW.z1 + .4]) bNeon.box(x - .15, G0, z - .15, x + .15, G0 + .3, z + .15, C(x < RW.x0 + 20 ? '#40ff70' : x > RW.x1 - 20 ? '#ff3040' : '#fff4d0'));
    // the taxiway, links to both ends of the runway, and the apron in front of the terminal
    tarmac(360, -512, 735, -502); for (let x = 362; x < 733; x += 8) bPlain.flat(x, -507.1, x + 5, -506.9, AY + .003, YEL);
    tarmac(360, -520, 380, -512); tarmac(715, -520, 735, -512);
    tarmac(440, -502, 700, -446);
    // the terminal: a long glass hall with a canopy over the kerb, jet bridges out to the gates
    const TB = { x0: 455, x1: 552, z0: -446, z1: -420 };
    const term = building(TB.x0, TB.z0, TB.x1, TB.z1, G0 + 12, '#b8cce6', G0);
    bPlain.box(term.x0 - .2, term.h - .8, term.z0 - .2, term.x1 + .2, term.h, term.z1 + .2, C('#f5f5f0'));
    neonRing(term.x0, term.z0, term.x1, term.z1, term.h - .9, '#ff4fa3');
    bPaving.box(TB.x0 - 3, G0, TB.z1, TB.x1 + 3, Y, TB.z1 + 6, C('#d8d0c4'), { tile: 2, topTile: 2 }); col.add(TB.x0 - 3, 0, TB.z1, TB.x1 + 3, Y, TB.z1 + 6);
    bPlain.box(TB.x0 - 2, Y + 4.2, TB.z1, TB.x1 + 2, Y + 4.5, TB.z1 + 5, C('#f5f5f0'));
    for (let x = TB.x0; x <= TB.x1; x += 12) bPlain.box(x - .15, Y, TB.z1 + 4.4, x + .15, Y + 4.2, TB.z1 + 4.7, C('#d0d0d4'));
    for (const off of [-30, 0, 30]) door('+z', term, off, Y, '#2a2a2e', true);
    board('LEHA NEPLOXO INTERNATIONAL AIRPORT', (TB.x0 + TB.x1) / 2, term.h + 2.2, TB.z1 - 2, 60, 4, 0, '#1c2a4a', '#ff4fa3');
    board('LEHA NEPLOXO INTERNATIONAL AIRPORT', (TB.x0 + TB.x1) / 2, term.h + 2.2, TB.z1 - 2.1, 60, 4, Math.PI, '#1c2a4a', '#ff4fa3');
    bPlain.box((TB.x0 + TB.x1) / 2 - 30, term.h, TB.z1 - 2.3, (TB.x0 + TB.x1) / 2 + 30, term.h + .3, TB.z1 - 1.8, C('#2a2a30'));
    for (const x of [TB.x0 + 8, TB.x1 - 8]) bPlain.box(x - .2, term.h, TB.z1 - 2.2, x + .2, term.h + 4.2, TB.z1 - 1.9, C('#2a2a30'));
    for (let x = TB.x0 + 6; x < TB.x1 - 4; x += 14) bench(x, TB.z1 + 2, Math.PI);
    talk(TB.x0 + 14, TB.z1 + 3.5); talk(TB.x0 + 44, TB.z1 + 3); talk(TB.x1 - 16, TB.z1 + 3.5);
    const GATES = [478, 530];
    for (const gx of GATES) { bPlain.box(gx - 1.3, G0 + 3.2, TB.z0 - 14, gx + 1.3, G0 + 6, TB.z0, C('#d8d8e0')); for (const z of [TB.z0 - 13]) bPlain.box(gx - .3, G0, z - .3, gx + .3, G0 + 3.2, z + .3, C('#8a8a92')); }
    // the drop-off road in front, and the two streets up to it through the fence
    const TZ = -408;
    bAsphalt.flat(441.5, TZ - 6, 566, TZ + 6, G0 + .006, C('#ffffff'), 8);
    for (const x of [447.5, 560]) bAsphalt.flat(x - 6, AZ - .1, x + 6, AZ + 4.2, Y + .004, C('#ffffff'), 8);
    mapShapes.push({ x0: 441.5, z0: TZ - 6, x1: 566, z1: TZ + 6, c: '#3d3848', k: 's' });
    for (let x = 452; x < 556; x += 6) bPlain.flat(x, TZ - .1, x + 3, TZ + .1, G0 + .02, YEL);
    // the car park beside the terminal, with taxis waiting
    tarmac(568, -445, 640, -416, '#4a4652');
    for (let x = 571; x < 637; x += 3) for (const [z0, z1, h] of [[-444, -439, 0], [-422, -417, Math.PI]]) { bPlain.flat(x, z0, x + .1, z1, AY + .003, WHITE); if (chance(.15)) parking.push({ x: x + 1.5, z: (z0 + z1) / 2, h }); }
    for (const x of [575, 581, 587]) parking.push({ id: 'cab', x, z: -431, h: -Math.PI / 2 });
    // the fence round the airport, with gaps where the two streets come in
    for (let x = B.x0 + 4; x < B.x1 - 4; x += 3) if (!(Math.abs(x - 447.5) < 7.5 || Math.abs(x - 560) < 7.5)) bPlain.box(x - .05, Y, AZ - .05, x + .05, Y + 2.6, AZ + .05, C('#9a9aa2'));
    for (const [a, b2] of [[B.x0 + 4, 440], [455, 552.5], [567.5, B.x1 - 4]]) { bPlain.box(a, Y + 2.5, AZ - .03, b2, Y + 2.6, AZ + .03, C('#9a9aa2')); bPlain.box(a, Y + 1.2, AZ - .02, b2, Y + 1.26, AZ + .02, C('#9a9aa2')); col.add(a, 0, AZ - .15, b2, Y + 2.6, AZ + .15); }
    for (const x of [447.5, 560]) { bPlain.box(x + 6.2, Y, AZ + .3, x + 7.8, Y + 2.6, AZ + 1.9, C('#f5f5f0')); col.add(x + 6.2, 0, AZ + .3, x + 7.8, Y + 2.6, AZ + 1.9); bNeon.box(x + 6.1, Y + 1.4, AZ + .5, x + 6.15, Y + 2.2, AZ + 1.7, C('#8fe3d6')); }
    board('AIRPORT', 447.5 - 8.5, Y + 3.4, AZ + 1, 5, 1.2, 0, '#1c2a4a', '#ffffff');
    // the control tower
    const TX = 650, TZ2 = -432;
    bPlain.box(TX - 2.2, G0, TZ2 - 2.2, TX + 2.2, G0 + 26, TZ2 + 2.2, C('#e8e2da')); col.add(TX - 2.2, 0, TZ2 - 2.2, TX + 2.2, G0 + 26, TZ2 + 2.2);
    bPlain.box(TX - 3.8, G0 + 26, TZ2 - 3.8, TX + 3.8, G0 + 26.6, TZ2 + 3.8, C('#f5f5f0'));
    bPlain.box(TX - 3.6, G0 + 26.6, TZ2 - 3.6, TX + 3.6, G0 + 29.4, TZ2 + 3.6, C('#28405a'));
    bPlain.box(TX - 4, G0 + 29.4, TZ2 - 4, TX + 4, G0 + 30, TZ2 + 4, C('#f5f5f0'));
    bPlain.box(TX - .08, G0 + 30, TZ2 - .08, TX + .08, G0 + 34, TZ2 + .08, C('#d0d0d4')); bNeon.box(TX - .25, G0 + 34, TZ2 - .25, TX + .25, G0 + 34.5, TZ2 + .25, C('#ff2233'));
    mapShapes.push({ x0: TX - 2.2, z0: TZ2 - 2.2, x1: TX + 2.2, z1: TZ2 + 2.2, c: '#e8e2da', k: 'b' });
    // hangars with rounded roofs and big doors facing the taxiway; light planes parked outside
    for (const [x0, x1] of [[358, 396], [402, 438]]) {
      const z0 = -496, z1 = -458, xm = (x0 + x1) / 2;
      bPlain.box(x0, G0, z0, x1, G0 + 8, z1, C('#a8aab2')); col.add(x0, 0, z0, x1, G0 + 12, z1);
      for (const [w, y0, y1] of [[0, 8, 9.6], [3, 9.6, 10.8], [7, 10.8, 11.6], [11, 11.6, 12]]) bPlain.box(x0 + w, G0 + y0, z0, x1 - w, G0 + y1, z1, C('#8a8c94'));
      bPlain.box(x0 + 3, G0, z0 - .08, x1 - 3, G0 + 7.4, z0, C('#6a6e78'));
      for (let x = x0 + 3; x < x1 - 3; x += 4) bPlain.box(x, G0, z0 - .12, x + .1, G0 + 7.4, z0 - .08, C('#5a5e68'));
      board('HANGAR ' + (x0 < 400 ? '1' : '2'), xm, G0 + 8.8, z0 - .15, 10, 1.2, Math.PI, '#1c2a4a', '#ffd23d');
      mapShapes.push({ x0, z0, x1, z1, c: '#a8aab2', k: 'b' });
    }
    // fuel tanks
    for (const [x, z] of [[700, -432], [716, -432], [708, -418]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 7, 20), new THREE.MeshLambertMaterial({ color: 0xf2f0ea })); m.position.set(x, G0 + 3.5, z); m.castShadow = true; scene.add(m);
      col.add(x - 3.6, 0, z - 3.6, x + 3.6, G0 + 7, z + 3.6);
    }

    /* ---------- aeroplanes ---------- */
    const M4 = (x, y, z, rx) => new THREE.Matrix4().makeRotationX(rx || 0).setPosition(x, y, z);
    const BX = (w, h, d, x, y, z, hex, rx) => [new THREE.BoxGeometry(w, h, d), M4(x, y, z, rx), C(hex)];
    const CY = (r0, r1, l, x, y, z, hex) => [new THREE.CylinderGeometry(r0, r1, l, 14).rotateX(Math.PI / 2), M4(x, y, z), C(hex)];
    // an airliner, nose along +z, wheels at y = 0
    function airliner(livery) {
      return NB.mergeParts([
        CY(2.1, 2.1, 30, 0, 3.4, 0, '#f5f5f0'), CY(.5, 2.1, 5, 0, 3.4, 17.5, '#f5f5f0'), CY(2.1, .7, 7, 0, 3.9, -18.5, '#f5f5f0'),
        BX(4.24, .34, 26, 0, 4.1, .5, '#22304a'), BX(4.26, .45, 32, 0, 2.7, 0, livery), BX(2.4, .5, .9, 0, 4.25, 17.2, '#22304a'),
        BX(34, .45, 6.5, 0, 2.5, 1, '#e8e8ee'), BX(.3, 2, 1.6, 17, 3.4, -.2, livery), BX(.3, 2, 1.6, -17, 3.4, -.2, livery),
        CY(1.15, 1.15, 4.2, 7, 1.4, 3, '#c8c8d0'), CY(1.15, 1.15, 4.2, -7, 1.4, 3, '#c8c8d0'), CY(.9, .9, .12, 7, 1.4, 5.12, '#2a2a30'), CY(.9, .9, .12, -7, 1.4, 5.12, '#2a2a30'),
        BX(.45, 7, 5.5, 0, 7.8, -19, livery), BX(12, .3, 3.2, 0, 4.6, -19.5, '#e8e8ee'),
        BX(.3, 1.8, .3, 0, .9, 14, '#3a3a40'), BX(.5, .7, .9, 0, .35, 14, '#1c1c1f'),
        BX(.35, 1.4, .35, 2.6, .9, .5, '#3a3a40'), BX(.35, 1.4, .35, -2.6, .9, .5, '#3a3a40'), BX(.7, .8, 1.4, 2.6, .4, .5, '#1c1c1f'), BX(.7, .8, 1.4, -2.6, .4, .5, '#1c1c1f')]);
    }
    // a light plane, the kind you learn to fly in
    function cessna(hex) {
      return NB.mergeParts([
        BX(1.2, 1.3, 6.5, 0, 1.4, 0, '#f5f5f0'), BX(1.22, .3, 6.52, 0, 1.2, 0, hex), BX(1.0, .7, 1.4, 0, 2.2, 1.1, '#22304a'),
        BX(10, .16, 1.6, 0, 2.6, 1, '#f5f5f0'), BX(3.6, .12, 1.1, 0, 1.6, -3, '#f5f5f0'), BX(.12, 1.4, 1.1, 0, 2.3, -3.1, hex),
        BX(.8, .8, .5, 0, 1.4, 3.45, hex), BX(.1, 2.4, .12, 0, 1.4, 3.75, '#2a2a30'),
        BX(.1, 1.1, .1, .8, .55, .9, '#3a3a40'), BX(.1, 1.1, .1, -.8, .55, .9, '#3a3a40'), BX(.35, .5, .5, .8, .25, .9, '#1c1c1f'), BX(.35, .5, .5, -.8, .25, .9, '#1c1c1f'), BX(.35, .5, .5, 0, .25, 2.8, '#1c1c1f')]);
    }
    const planeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const put = (geo, x, z, h) => { const m = new THREE.Mesh(geo, planeMat); m.position.set(x, G0, z); m.rotation.y = h; m.castShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); return m; };
    // at the gates, nose in towards the terminal; their bodies and wings are solid
    for (const [gx, liv] of [[GATES[0], '#ff4fa3'], [GATES[1], '#2a6fe8']]) {
      const z = TB.z0 - 16 - 20;
      put(airliner(liv), gx, z, 0);
      col.add(gx - 2.1, G0 + 1.3, z - 22, gx + 2.1, G0 + 5.5, z + 20); col.add(gx - 17, G0 + 2.2, z - 2.3, gx + 17, G0 + 2.8, z + 4.3); col.add(gx - .3, G0 + 1.2, z - 22, gx + .3, G0 + 11.3, z - 16);
    }
    put(airliner('#3fe6e0'), 630, -478, Math.PI / 2 + .3);
    col.add(612, G0 + 1.3, -484, 648, G0 + 5.5, -472);
    for (const [x, z, hx] of [[372, -452, '#e8202a'], [390, -450, '#2a6fe8'], [420, -452, '#ffd23d']]) { put(cessna(hx), x, z, Math.PI); col.add(x - .7, 0, z - 3.3, x + .7, G0 + 2.4, z + 3.3); }
    // the airliner that lands, rolls out, turns round, waits, takes off and flies away, again and again
    const flyer = new THREE.Mesh(airliner('#ffd23d'), planeMat); flyer.rotation.order = 'YXZ'; flyer.castShadow = true; scene.add(flyer);
    const light = new THREE.Mesh(new THREE.SphereGeometry(.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); light.position.set(0, 1.6, 15); flyer.add(light);
    const FL = { ph: 'wait', t: 6, v: 0, x: 420, y: G0, yaw: Math.PI / 2, pitch: 0 }, TOUCH = RW.x1 - 25, FAR = 1750, APP_Y = 110;
    function flyStep(dt) {
      const F = FL; F.t += dt;
      switch (F.ph) {
        case 'wait': F.v = 0; if (F.t > 16) { F.ph = 'roll'; F.t = 0; } break;
        case 'roll': F.v += 8 * dt; F.x += F.v * dt; F.pitch = U.damp(F.pitch, F.v > 55 ? .13 : 0, 3, dt); if (F.v > 62) { F.ph = 'climb'; F.t = 0; } break;
        case 'climb': F.v = Math.min(85, F.v + 3 * dt); F.x += F.v * dt; F.y += (5 + F.t * 1.5) * dt; F.pitch = U.damp(F.pitch, .17, 2, dt);
          if (F.x > FAR) { F.ph = 'approach'; F.t = 0; F.x = FAR; F.y = G0 + APP_Y; F.v = 72; F.yaw = -Math.PI / 2; F.pitch = .02; } break;
        case 'approach': F.x -= F.v * dt; F.y = G0 + Math.max(0, (F.x - TOUCH) / (FAR - TOUCH) * APP_Y); F.pitch = U.damp(F.pitch, F.x - TOUCH < 80 ? .1 : .03, 2, dt);
          if (F.x <= TOUCH) { F.ph = 'land'; F.y = G0; F.t = 0; } break;
        case 'land': F.v = Math.max(0, F.v - 8.8 * dt); F.x -= F.v * dt; F.pitch = U.damp(F.pitch, 0, 2.5, dt); if (F.v <= 0) { F.ph = 'turn'; F.t = 0; } break;
        case 'turn': { const u = U.clamp(F.t / 9, 0, 1); F.yaw = -Math.PI / 2 + Math.PI * u * u * (3 - 2 * u); if (F.t > 9) { F.yaw = Math.PI / 2; F.ph = 'wait'; F.t = 0; } break; }
      }
      flyer.position.set(F.x, F.y, RZ); flyer.rotation.y = F.yaw; flyer.rotation.x = -F.pitch;
      light.visible = F.ph !== 'wait';
    }
    flyStep(0);

    /* ---------- the bridges ---------- */
    // a low bridge between (a) and (b) along x or along z: a smooth deck with ramps, raised pavements, parapets,
    // lamps and piers; cars drive on invisible steps (ramps)
    function bridge(axis, c, s0, s1, y0, y1, RWd, PWd) {
      const DECK = 3.2, RAMP = 16, len = s1 - s0;
      const deckY = s => { const t0 = U.clamp((s - s0) / RAMP, 0, 1), t1 = U.clamp((s1 - s) / RAMP, 0, 1); return Math.min(y0 + (DECK - y0) * t0, y1 + (DECK - y1) * t1); };
      const P = (s, y, q) => axis === 'x' ? [s, y, c + q] : [c + q, y, s];
      const across = axis === 'x' ? [0, 0, 1] : [1, 0, 0];
      function slab(q0, q1, sa, ya, sb, yb, th, hex) {
        const colr = C(hex), dk = colr.clone().multiplyScalar(.72), sd = colr.clone().multiplyScalar(.86);
        quad4(P(sa, ya, q0), P(sb, yb, q0), P(sb, yb, q1), P(sa, ya, q1), [0, 1, 0], colr);
        quad4(P(sa, ya - th, q0), P(sb, yb - th, q0), P(sb, yb - th, q1), P(sa, ya - th, q1), [0, -1, 0], dk);
        quad4(P(sa, ya - th, q1), P(sb, yb - th, q1), P(sb, yb, q1), P(sa, ya, q1), across, sd);
        quad4(P(sa, ya - th, q0), P(sb, yb - th, q0), P(sb, yb, q0), P(sa, ya, q0), across.map(v => -v), sd);
      }
      const K = [s0, s0 + RAMP, s1 - RAMP, s1];
      for (let i = 0; i < 3; i++) {
        const sa = K[i], sb = K[i + 1], ya = deckY(sa), yb = deckY(sb);
        slab(-RWd, RWd, sa, ya, sb, yb, .6, '#4a4652');
        slab(-PWd, -RWd, sa, ya + .15, sb, yb + .15, .75, '#b9b2a6'); slab(RWd, PWd, sa, ya + .15, sb, yb + .15, .75, '#b9b2a6');
        slab(-PWd - .3, -PWd, sa, ya + 1.15, sb, yb + 1.15, 1.15, '#a8a298'); slab(PWd, PWd + .3, sa, ya + 1.15, sb, yb + 1.15, 1.15, '#a8a298');
        for (const q of [-RWd - .04, RWd - .08]) slab(q, q + .12, sa, ya + .16, sb, yb + .16, .02, '#e8e2d6');
        for (let s = sa; s < sb - 1; s += 6) { const s2 = Math.min(sb, s + 3); slab(-.1, .1, s, deckY(s) + .015, s2, deckY(s2) + .015, .01, '#c9a43e'); }
      }
      for (let s = s0; s < s1; s += .7) {
        const e = Math.min(s1, s + .7), y = deckY((s + e) / 2);
        const box = (q0, q1, ya, yb) => axis === 'x' ? col.add(s, ya, c + q0, e, yb, c + q1) : col.add(c + q0, ya, s, c + q1, yb, e);
        for (const b of [box(-RWd, RWd, y - .6, y), box(-PWd, -RWd, y - .6, y + .15), box(RWd, PWd, y - .6, y + .15)]) b.ramp = true;
        box(-PWd - .3, -PWd, y, y + 1.15); box(PWd, PWd + .3, y, y + 1.15);
      }
      for (let s = s0 + RAMP + 4; s < s1 - RAMP; s += 16) for (const q of [-4.5, 3]) { const [x, , z] = P(s, 0, q); const y = deckY(s) - .6; if (axis === 'x') { bPlain.box(x - .75, -4, z, x + .75, y, z + 1.5, C('#9a948a')); col.add(x - .75, -4, z, x + .75, y, z + 1.5); } else { bPlain.box(x, -4, z - .75, x + 1.5, y, z + .75, C('#9a948a')); col.add(x, -4, z - .75, x + 1.5, y, z + .75); } }
      for (let s = s0 + 6; s < s1 - 4; s += 18) { const [ax, , az] = P(s, 0, -PWd + .5), [bx, , bz] = P(s + 9, 0, PWd - .5); lamps.push([ax, az, axis === 'x' ? 0 : Math.PI / 2, deckY(s) + .15], [bx, bz, axis === 'x' ? Math.PI : -Math.PI / 2, deckY(s + 9) + .15]); }
      const [mx0, , mz0] = P(s0, 0, -PWd - .3), [mx1, , mz1] = P(s1, 0, PWd + .3);
      mapShapes.push({ x0: Math.min(mx0, mx1), z0: Math.min(mz0, mz1), x1: Math.max(mx0, mx1), z1: Math.max(mz0, mz1), c: '#6a6474', k: 's' });
      for (const q of [-(RWd + PWd) / 2, (RWd + PWd) / 2]) { const [ax, , az] = P(s0 - 2, 0, q), [bx, , bz] = P(s1 + 2, 0, q); walkways.push([[ax, az], [bx, bz]]); }
    }
    // the Harbour Bridge from the North Side, along the North Side's middle street
    const HZ = -290;
    bridge('x', HZ, 260, B.x0, G0 + .15, G0 + .15, 5.2, 7.5);
    for (const x0 of [256, B.x0]) bAsphalt.flat(x0, HZ - 5.2, x0 + 4, HZ + 5.2, Y + .004, C('#ffffff'), 8);
    // the Bayview Bridge from Palm Island, between two of its beach hotels
    const PBX = 447.5;
    bridge('z', PBX, B.z1, -105, G0 + .15, .3, 4.6, 6.4);
    bAsphalt.flat(PBX - 4.6, B.z1 - 4, PBX + 4.6, B.z1, Y + .004, C('#ffffff'), 8);
    bAsphalt.flat(PBX - 4.6, -105, PBX + 4.6, -95, .305, C('#ffffff'), 8);
    bAsphalt.flat(PBX - 4.6, -95, PBX + 4.6, -65, .424, C('#ffffff'), 8);
    mapShapes.push({ x0: PBX - 4.6, z0: -105, x1: PBX + 4.6, z1: -65, c: '#3d3848', k: 's' });
    for (const s of [-1, 1]) { const x0 = s < 0 ? PBX - 20 : PBX + 7, x1 = s < 0 ? PBX - 7 : PBX + 20; bPlain.box(x0, .3, -105.4, x1, 1.2, -105, C('#c8c4bc')); bPlain.box(x0, 1.05, -105.45, x1, 1.2, -104.95, C('#e8202a')); col.add(x0, 0, -105.4, x1, 1.2, -105); }

    /* ---------- for the rest of the game ---------- */
    const districtAt = (x, z) => {
      if (Math.abs(z - HZ) < 9 && x > 258 && x < B.x0 + 1) return 'Портовый мост';
      if (Math.abs(x - PBX) < 8 && z < -104 && z > B.z1 - 1) return 'Мост Лёха-Вью';
      if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return null;
      if (z < AZ) return 'Аэропорт LEHA NEPLOXO';
      return x < 447.5 ? 'Бэйвью: Уэст-Энд' : x > 620 ? 'Бэйвью: Ист-Сайд' : 'Лёха-Вью';
    };
    const nodes = [], links = [];
    for (const z of ZS) for (const x of XS) nodes.push([x, z]);
    const id = (i, j) => j * XS.length + i;
    for (let j = 0; j < ZS.length; j++) for (let i = 0; i < XS.length; i++) { if (i + 1 < XS.length) links.push([id(i, j), id(i + 1, j)]); if (j + 1 < ZS.length) links.push([id(i, j), id(i, j + 1)]); }
    const T1 = nodes.push([447.5, TZ]) - 1, T2 = nodes.push([560, TZ]) - 1;
    links.push([id(2, 4), T1], [T1, T2], [T2, id(4, 4)]);
    let lastT = null;
    return {
      spots, parking, blocks, walkways, bounds: B, districtAt,
      door: { x: (TB.x0 + TB.x1) / 2, z: TB.z1 + 1.3, y: Y, heading: 0, nx: 0, nz: 1, hex: '#3fe6e0', cx: (TB.x0 + TB.x1) / 2, cz: (TB.z0 + TB.z1) / 2 }, airport: { x0: B.x0, x1: B.x1, z0: B.z0, z1: AZ },
      roads: { lane: 2.6, nodes, links, island: true, bridges: [{ from: [250, HZ], to: id(0, 2) }, { from: [PBX, -60], to: id(2, 0) }] },
      update(t) { const dt = lastT == null ? 0 : U.clamp(t - lastT, 0, .1); lastT = t; flyStep(dt); }
    };
  };
})(window.NB);
