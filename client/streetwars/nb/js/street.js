// Street life: food carts with vendors (a hot dog or an ice cream patches you up), buskers with their
// instruments and their own music (tip them), surfers riding the waves off Sunrise Beach and a game of
// beach volleyball that goes on until something scares the players off.
// The carts and the court are built with the city; the people are the crowd's (npc.js): vendors and
// buskers stand on spots, surfers and volleyball players are puppets moved from here.
(function (NB) {
  'use strict';
  const { U, GeoBuilder } = NB;
  const rand = U.rand, pick = a => a[(Math.random() * a.length) | 0];
  // the beach volleyball court: net across x at z = NET, 8 m wide, 16 m long, on the sand south of the spawn
  const COURT = { x0: 121, x1: 129, z0: -38, z1: -22 }, NET = -30;
  NB.STREET_RESERVED = { id: 'volley', x0: COURT.x0 - 2.5, x1: COURT.x1 + 2.5, z0: COURT.z0 - 2.5, z1: COURT.z1 + 2.5 };

  NB.buildStreet = function (ctx) {
    const { scene, col, C, palms, doors, motelLot, mapShapes, lamps } = ctx;
    const P = new GeoBuilder(), N = new GeoBuilder();
    const box = (x0, y0, z0, x1, y1, z1, hex) => P.box(x0, y0, z0, x1, y1, z1, C(hex));
    const floorAt = (x, z) => { let f = 0; for (const b of col.query(x - .3, z - .3, x + .3, z + .3, [])) if (b.maxY < 1.2 && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.maxY > f) f = b.maxY; return f; };
    // move a spot off any palm trunk
    const clearOfPalms = (x, z) => { for (let k = 0; k < 8; k++) { const hit = palms.find(p => Math.hypot(p[0] - x, p[2] - z) < 1.8); if (!hit) break; x += x > hit[0] ? 1 : -1; } return [x, z]; };
    const spots = [], carts = [], buskers = [];
    const signTex = (w, h, draw) => U.canvasTex(w, h, draw, false);

    /* ---------- food carts ---------- */
    // a cart on wheels with an umbrella, the vendor behind it, a customer or two in front
    function cart(kind, x0, z0, face) {
      const [x, z] = clearOfPalms(x0, z0), y = floorAt(x, z), fx = Math.sin(face), fz = Math.cos(face), rx = Math.cos(face), rz = -Math.sin(face);
      const hot = kind === 'hotdog', body = hot ? '#d8dde6' : '#fff4fa', trim = hot ? '#e8202a' : '#ff7eb6';
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = face; scene.add(g);
      const m = (geo, hex, px, py, pz) => { const o = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) })); o.position.set(px, py, pz); o.castShadow = true; g.add(o); return o; };
      m(new THREE.BoxGeometry(1.7, .75, .85), body, 0, .72, 0);
      m(new THREE.BoxGeometry(1.74, .12, .89), trim, 0, 1.12, 0);
      m(new THREE.BoxGeometry(1.74, .08, .89), trim, 0, .38, 0);
      for (const s of [-1, 1]) { const w = m(new THREE.CylinderGeometry(.26, .26, .08, 14).rotateX(Math.PI / 2), '#1c1c22', s * .55, .26, .47); w.rotation.y = 0; }
      m(new THREE.BoxGeometry(.05, .9, .05), '#b8b4c4', .95, .75, -.3);   // the handle
      m(new THREE.CylinderGeometry(.04, .04, 1.5, 6), '#f5f5f0', .5, 1.9, 0);
      const um = new THREE.Mesh(new THREE.ConeGeometry(1.3, .45, 8, 1, true), new THREE.MeshLambertMaterial({ color: new THREE.Color(hot ? '#ffd23d' : '#8fe3d6'), side: THREE.DoubleSide }));
      um.position.set(.5, 2.72, 0); g.add(um);
      const stripes = new THREE.Mesh(new THREE.ConeGeometry(1.31, .45, 8, 1, true, 0, Math.PI / 4), new THREE.MeshLambertMaterial({ color: new THREE.Color(trim), side: THREE.DoubleSide }));
      for (let k = 0; k < 4; k++) { const s = stripes.clone(); s.position.copy(um.position); s.rotation.y = k * Math.PI / 2; g.add(s); }
      if (hot) { m(new THREE.BoxGeometry(1.2, .06, .5), '#9a96a8', -.1, 1.2, 0); for (let k = 0; k < 4; k++) m(new THREE.CylinderGeometry(.04, .04, .32, 6).rotateZ(Math.PI / 2), '#b0503a', -.5 + k * .22, 1.26, .05); }
      else for (let k = 0; k < 3; k++) m(new THREE.CylinderGeometry(.15, .15, .1, 10), ['#ffd6e4', '#fff3c4', '#c9f0e0'][k], -.45 + k * .38, 1.22, 0);
      const t = signTex(256, 64, (c, w, h) => {
        c.fillStyle = trim; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = 'italic bold 40px "Trebuchet MS", Arial, sans-serif'; c.fillText(hot ? 'HOT DOGS' : 'ICE CREAM', w / 2, h / 2 + 2);
      });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .38), new THREE.MeshBasicMaterial({ map: t }));
      sg.position.set(0, .8, .431); g.add(sg); const sb = sg.clone(); sb.position.z = -.431; sb.rotation.y = Math.PI; g.add(sb);
      // a solid box for the cart (it faces along x or z)
      const hx = Math.abs(rx) * .9 + Math.abs(fx) * .48, hz = Math.abs(rz) * .9 + Math.abs(fz) * .48;
      col.add(x - hx, 0, z - hz, x + hx, y + 1.2, z + hz);
      // the vendor stands behind the cart (its -z side) looking out over it
      const vendor = { kind: 'idle', x: x - fx * .95, z: z - fz * .95, y, fixedY: true, heading: face, type: 'vendor' };
      spots.push(vendor);
      // customers: one or two people waiting in front
      for (const s of [-.5, .6]) if (Math.random() < .6) spots.push({ kind: 'idle', x: x + fx * 1.35 + rx * s, z: z + fz * 1.35 + rz * s, y, fixedY: true, heading: face + Math.PI + rand(-.3, .3), mix: x > 106 ? 'promenade' : 'town' });
      carts.push({ kind, x, z, y, face, vendor, shoutT: rand(4, 12) });
    }
    cart('hotdog', -81.5, 16.5, Math.PI / 4);            // in the park by the fountain
    cart('hotdog', 432, -37.5, Math.PI);                 // Vice Point plaza on Palm Island
    cart('ice', 111.8, -9, -Math.PI / 2);                // on the sand at the end of the avenue
    cart('ice', 113, 64, -Math.PI / 2);                  // up the beach, past the pier

    /* ---------- buskers ---------- */
    // each one has an instrument that is only there while they are, and a tune you hear close up
    function busker(kind, x0, z0, face) {
      const [x, z] = clearOfPalms(x0, z0), y = floorAt(x, z);
      const s = { kind, x, z, y: kind === 'drum' ? y + .51 : y, fixedY: true, heading: face, type: 'musician' };
      spots.push(s);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = face; scene.add(g);
      const m = (geo, hex, px, py, pz, rx, ry, rz) => { const o = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) })); o.position.set(px, py, pz); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = true; g.add(o); return o; };
      const inst = new THREE.Group(); g.add(inst);
      const im = (geo, hex, px, py, pz, rx, ry, rz) => { const o = m(geo, hex, px, py, pz, rx, ry, rz); g.remove(o); inst.add(o); return o; };
      if (kind === 'guitar') {
        // body across the belly, the neck out to the left hand
        im(new THREE.CylinderGeometry(.2, .22, .1, 12).rotateX(Math.PI / 2), '#b5651d', .06, 1.02, .2, 0, 0, 0);
        im(new THREE.CylinderGeometry(.06, .06, .102, 10).rotateX(Math.PI / 2), '#2a1a10', .06, 1.02, .2);
        im(new THREE.BoxGeometry(.62, .06, .035), '#5a3a1e', -.3, 1.15, .22, 0, 0, .35);
        im(new THREE.BoxGeometry(.12, .08, .04), '#3a2412', -.6, 1.26, .22, 0, 0, .35);
      } else if (kind === 'sax') {
        im(new THREE.CylinderGeometry(.045, .06, .6, 10), '#e0b23a', .03, 1.02, .24, -.25, 0, 0);
        im(new THREE.CylinderGeometry(.11, .06, .16, 12), '#e0b23a', .03, .7, .34, -1.1, 0, 0);
        im(new THREE.CylinderGeometry(.02, .02, .2, 6), '#2a2a2a', .03, 1.36, .15, .8, 0, 0);
      } else {
        // an upturned bucket to sit on and two to drum on
        im(new THREE.CylinderGeometry(.2, .16, .45, 12), '#ff8a3d', 0, .225, -.08);
        im(new THREE.CylinderGeometry(.2, .16, .5, 12), '#ff8a3d', -.22, .25, .5);
        im(new THREE.CylinderGeometry(.18, .14, .45, 12), '#3fa0ff', .26, .225, .48);
      }
      // an open case with a few bills in it, on the ground in front
      m(new THREE.BoxGeometry(.9, .08, .35), '#2a1a24', .5, .04, .9);
      m(new THREE.BoxGeometry(.84, .02, .3), '#8a1f4a', .5, .085, .9);
      for (let k = 0; k < 3; k++) m(new THREE.BoxGeometry(.14, .01, .07), '#6bbf6b', .3 + k * .2, .1, .88 + (k % 2) * .06, 0, rand(-.5, .5), 0);
      buskers.push({ kind, spot: s, inst, x, z, y, face, tipT: 0, shoutT: rand(8, 20) });
    }
    busker('sax', 111.6, 12, -Math.PI / 2);              // on the sand by the promenade, facing the avenue
    busker('guitar', -70.5, 31, -Math.PI * .75);         // in the park, looking at the fountain
    busker('drum', 419, -24, Math.PI * .75);             // Vice Point plaza

    /* ---------- night life: outside Hotel OCEAN after dark ---------- */
    const girls = [];
    const night = () => G && G.hour && (G.hour() >= 19 || G.hour() < 5);
    let motel = null;
    if (motelLot) {
      motel = buildMotel(motelLot);
      for (const [x, z] of motel.girls) {
        const s = { kind: 'flirt', x, z, y: .17, fixedY: true, heading: Math.PI / 2 + (Math.random() - .5) * .9, type: 'escort', when: () => night() };
        spots.push(s); girls.push(s);
      }
    }
    // THE PINK FLAMINGO: a two-storey motel with an open walkway upstairs, stairs, numbered doors, a car park
    // in front and a tall roadside sign; it faces the beach road
    function buildMotel(L) {
      const M = new GeoBuilder(), NN = new GeoBuilder(), GG = new GeoBuilder();
      const bx = (x0, y0, z0, x1, y1, z1, hex, solid) => { M.box(x0, y0, z0, x1, y1, z1, C(hex)); if (solid) col.add(x0, y0 < .5 ? 0 : y0, z0, x1, y1, z1); };
      const neon = (x0, y0, z0, x1, y1, z1, hex) => { NN.box(x0, y0, z0, x1, y1, z1, C(hex)); GG.box(x0 - .25, y0 - .25, z0 - .25, x1 + .25, y1 + .25, z1 + .25, C(hex).multiplyScalar(.9), { noTop: true }); };
      const X0 = L.x0, FX = L.x0 + 8, Z0 = L.z0 + .5, Z1 = L.z1 - .5, FL = 3.2, H = 6.6, WALL = '#f7c6d6', TRIM = '#f5f0e6';
      // the building: two floors of rooms, a flat roof with a parapet
      bx(X0, 0, Z0, FX, H, Z1, WALL, true);
      bx(X0 - .15, H, Z0 - .15, FX + .15, H + .45, Z1 + .15, TRIM, true);
      bx(FX, 3.0, Z0, FX + .04, 3.25, Z1, '#e890b0');
      // the walkway upstairs, its railing and posts, and the stairs up at the north end
      bx(FX, FL - .2, Z0, FX + 1.7, FL, Z1, TRIM, true);
      bx(FX + 1.6, FL, Z0, FX + 1.7, FL + 1, Z1 - 1.3, TRIM, true); bx(FX + 1.6, FL + .9, Z0, FX + 1.72, FL + 1.02, Z1 - 1.3, '#ff4fa3');   // open at the top of the stairs
      for (let z = Z0 + .2; z < Z1; z += 3.4) bx(FX + 1.5, 0, z, FX + 1.7, FL - .2, z + .2, TRIM, true);
      const steps = 11;
      for (let i = 0; i < steps; i++) { const y = (i + 1) * FL / steps, z = Z1 - 4.4 + i * .4; bx(FX + 1.75, 0, z, FX + 3, y, z + .4, '#d8d0c8', true); }
      bx(FX + 2.95, 0, Z1 - 4.4, FX + 3.05, FL + 1, Z1, TRIM, true);
      // numbered doors and windows on both floors; some rooms have their lights on
      let n = 1, topDoor = null;
      for (const y0 of [.17, FL]) {
        for (let z = Z0 + 1.2; z < Z1 - 1.8; z += 2.6) {
          bx(FX, y0, z, FX + .05, y0 + 2.2, z + .95, ['#2fa8a0', '#8a5ad8', '#e0286a', '#3f7fd0'][n % 4]);
          bx(FX, y0 + 2.3, z + .3, FX + .06, y0 + 2.55, z + .65, '#f5f0e6');
          if (y0 > 1) topDoor = { z: z + .47, n };
          if (Math.random() < .55) neon(FX, y0 + .9, z + 1.15, FX + .04, y0 + 2, z + 2.1, pick(['#ffd58a', '#ffe4b0', '#ff9fd2']));
          else bx(FX, y0 + .9, z + 1.15, FX + .04, y0 + 2, z + 2.1, '#26304a');
          n++;
        }
      }
      neon(FX + .02, H - .3, Z0, FX + .08, H - .15, Z1, '#ff4fa3'); neon(FX + .02, FL - .45, Z0, FX + .08, FL - .35, Z1, '#3fe6e0');
      // the car park: dark asphalt with white bays, from the building out to the pavement
      bx(FX + 1.7, .15, Z0, L.x1, .17, Z1, '#3a3542');
      for (let z = Z0 + .5; z < Z1 - 4.5; z += 3) bx(FX + 3.5, .17, z, FX + 8.5, .175, z + .1, '#ece6dc');
      // a drinks machine by the stairs, glowing
      bx(FX + 1.8, .17, Z0 + .5, FX + 2.5, 2, Z0 + 1.3, '#c81e1e', true); neon(FX + 2.5, 1.2, Z0 + .6, FX + 2.53, 1.9, Z0 + 1.2, '#ffffff');
      // the roadside sign on a tall pole at the corner of the car park
      const px = L.x1 - 1.2, pz = Z0 + 1;
      bx(px - .12, 0, pz - .12, px + .12, 7, pz + .12, '#b8b4c4', true);
      const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; scene.add(m); return m; };
      add(M.build(), new THREE.MeshLambertMaterial({ vertexColors: true })).castShadow = true;
      add(NN.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
      add(GG.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .26, blending: THREE.AdditiveBlending, depthWrite: false }));
      const signT = U.canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#1a0f24'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#ff4fa3'; g.lineWidth = 6; g.shadowColor = '#ff4fa3'; g.shadowBlur = 12; g.strokeRect(8, 8, w - 16, h - 16);
        // the flamingo: a curved neck, a body, one leg
        g.strokeStyle = '#ff7eb6'; g.lineWidth = 7; g.beginPath(); g.moveTo(92, 150); g.quadraticCurveTo(70, 90, 100, 60); g.quadraticCurveTo(120, 45, 112, 75); g.stroke();
        g.fillStyle = '#ff7eb6'; g.beginPath(); g.ellipse(115, 150, 32, 18, -.3, 0, 7); g.fill(); g.fillRect(112, 165, 5, 40);
        g.shadowBlur = 16; g.textAlign = 'center'; g.fillStyle = '#ffe3f0'; g.font = 'italic bold 30px "Trebuchet MS", Arial, sans-serif'; g.fillText('PINK', 190, 110); g.fillText('FLAMINGO', 128, 225);
        g.shadowColor = '#3fe6e0'; g.fillStyle = '#3fe6e0'; g.font = 'bold 26px Rubik, Arial, sans-serif'; g.fillText('MOTEL', 190, 150);
      }, false);
      const board = new THREE.Mesh(new THREE.BoxGeometry(.25, 3.2, 3.2), [0, 1, 2, 3, 4, 5].map(i => i < 2 ? new THREE.MeshBasicMaterial({ map: signT }) : new THREE.MeshLambertMaterial({ color: 0x1a0f24 })));
      board.position.set(px, 8.4, pz); scene.add(board);
      // "VACANCY" under it, blinking at night
      const vT = U.canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#1a0f24'; g.fillRect(0, 0, w, h); g.fillStyle = '#6bff8a'; g.shadowColor = '#6bff8a'; g.shadowBlur = 10; g.textAlign = 'center'; g.font = 'bold 40px Rubik, Arial, sans-serif'; g.fillText('VACANCY', w / 2, 46); }, false);
      const vMat = new THREE.MeshBasicMaterial({ map: vT });
      const vac = new THREE.Mesh(new THREE.BoxGeometry(.2, .75, 3), [vMat, vMat, ...[0, 0, 0, 0].map(() => new THREE.MeshLambertMaterial({ color: 0x1a0f24 }))]);
      vac.position.set(px, 6.3, pz); scene.add(vac);
      // the name on the roof over the walkway
      const roofT = U.canvasTex(512, 96, (g, w, h) => { g.fillStyle = '#1a0f24'; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.shadowColor = '#ff4fa3'; g.shadowBlur = 14; g.fillStyle = '#ff7eb6'; g.font = 'italic bold 58px "Trebuchet MS", Arial, sans-serif'; g.fillText('PINK FLAMINGO', w / 2, 66); }, false);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: roofT })); roof.position.set(FX + .2, H + 1.4, (Z0 + Z1) / 2); roof.rotation.y = Math.PI / 2; scene.add(roof);
      for (const z of [(Z0 + Z1) / 2 - 4, (Z0 + Z1) / 2 + 4]) bx(FX + .1, H + .45, z - .08, FX + .26, H + .6, z + .08, '#2a2436');
      palms.push([L.x1 - 1.4, .15, Z1 - 1.2]);
      if (mapShapes) mapShapes.push({ x0: X0, z0: Z0, x1: FX, z1: Z1, c: '#ff7eb6', k: 'b' }, { x0: FX, z0: Z0, x1: L.x1, z1: Z1, c: '#55505f', k: 'p' });
      return {
        center: { x: (X0 + L.x1) / 2, z: (Z0 + Z1) / 2 },
        // after a night in a room you come down the stairs to the car park
        door: { x: FX + 2.6, z: Z1 - 7, heading: Math.PI / 2 },
        // the room upstairs: its door on the walkway, and the way there from the kerb, up the stairs
        room: { x: FX + .1, z: topDoor.z, y: FL, nx: 1, nz: 0, heading: Math.PI / 2, n: topDoor.n },
        path: [[FX + 3.7, Z1 - 5.6], [FX + 2.35, Z1 - 4.9], [FX + 2.35, Z1 - .3], [FX + 1.05, Z1 - .65], [FX + 1.0, topDoor.z]],
        girls: [[L.x1 - .6, Z0 + 4.5], [L.x1 - .5, Z0 + 6], [L.x1 - .7, Z0 + 7.5]],   // at the kerb, where a car can pull up
        vacancy: vMat
      };
    }

    /* ---------- the beach volleyball court ---------- */
    const WH = C('#f5f5f0'), c0 = COURT;
    for (const [a, b, c, d] of [[c0.x0, c0.z0, c0.x1, c0.z0 + .08], [c0.x0, c0.z1 - .08, c0.x1, c0.z1], [c0.x0, c0.z0, c0.x0 + .08, c0.z1], [c0.x1 - .08, c0.z0, c0.x1, c0.z1]]) P.flat(a, b, c, d, .03, WH);
    for (const x of [c0.x0 - .6, c0.x1 + .6]) { box(x - .06, 0, NET - .06, x + .06, 2.55, NET + .06, '#f5f5f0'); col.add(x - .1, 0, NET - .1, x + .1, 2.55, NET + .1); }
    const netTex = U.canvasTex(128, 32, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(20,20,30,.9)'; g.lineWidth = 1; for (let x = 0; x <= w; x += 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.fillStyle = '#f5f5f0'; g.fillRect(0, 0, w, 3); }, false);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(c0.x1 - c0.x0 + 1.2, .9), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    net.position.set((c0.x0 + c0.x1) / 2, 2.0, NET); scene.add(net);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 8), new THREE.MeshLambertMaterial({ color: 0xfff4c8 }));
    ball.castShadow = true; ball.position.set(125, .14, NET - 5); scene.add(ball);
    const add = (geo, mat) => { const o = new THREE.Mesh(geo, mat); o.matrixAutoUpdate = false; o.castShadow = true; o.receiveShadow = true; scene.add(o); return o; };
    add(P.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));

    /* ---------- surfboards ---------- */
    const boards = ['#ff4fa3', '#3fe6e0'].map(hex => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 6).scale(.3, .05, 1.1), new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) }));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.06, .02, 1.8), new THREE.MeshBasicMaterial({ color: 0xffffff })); stripe.position.y = .045; b.add(stripe);
      b.visible = false; scene.add(b); return b;
    });

    /* ======================= runtime ======================= */
    let G = null;
    const onShow = s => !!(s.person && s.person.spot === s);
    // surfers: paddle out, wait for a wave sitting on the board, stand up and ride it in, fall off, again
    const surfers = [{ z: -55, board: boards[0] }, { z: 66, board: boards[1] }].map(s => Object.assign(s, { p: null, state: 'paddle', t: 0, x: 146, wz: s.z, h: Math.PI / 2, foamT: 0 }));
    // volleyball: two a side, the ball flies in arcs between them
    const V = { players: [], ball: { x: 125, y: .14, z: NET - 5, from: null, to: null, t: 0, dur: 1, h: 3 }, state: 'off', t: 0, team: 0, touches: 0, hitter: null, receiver: null };
    const HOME = [[123, NET - 5.5, 0], [127, NET - 3], [123, NET + 3, 1], [127, NET + 5.5, 1]].map(([x, z, team]) => ({ x, z, team: team || 0 }));

    function startVolley() {
      V.players = HOME.map((h, i) => {
        const p = G.crowd.spawnPuppet(pick(['beach_m', 'beach_f', 'beach_m', 'beach_f']), h.x, h.z, h.team ? Math.PI : 0);
        if (p) { p.puppet.anim = 'ready'; p.hitT = 0; }
        return { p, home: h, gx: h.x, gz: h.z, team: h.team, i };
      });
      if (V.players.some(v => !v.p)) { stopVolley(); return; }
      V.state = 'serve'; V.t = 0; V.team = Math.random() < .5 ? 0 : 1;
    }
    function stopVolley() {
      for (const v of V.players) if (v.p && v.p.puppet) G.crowd.releasePuppet(v.p);
      V.players = []; V.state = 'off'; ball.position.set(125, .14, NET - 5);
    }
    // send the ball from (x, y, z) to a point, with a hang time and an apex height over the straight line
    function fly(x, y, z, tx, ty, tz, dur, h) { const B = V.ball; B.from = [x, y, z]; B.to = [tx, ty, tz]; B.t = 0; B.dur = dur; B.h = h; }
    function side(team) { return team === 0 ? [NET - 7.3, NET - 1.2] : [NET + 1.2, NET + 7.3]; }
    function hit(v) { v.p.hitT = .4; v.p.puppet.anim = 'volley'; G.audio.volley([v.p.x, 1.6, v.p.z]); }
    function volleyUpdate(dt) {
      const P = G.player, near = Math.hypot(P.x - 125, P.z - NET) < 120;
      const raining = G.rain && G.rain() > .3;
      if (V.state === 'off') { if (near && !raining && (V.cool -= dt) <= 0) startVolley(); return; }
      if (raining && V.state !== 'off') { for (const v of V.players) if (v.p) say(v.p, pick(['Дождь! Бежим!', 'Всё, доиграем потом!'])); stopVolley(); V.cool = 20; return; }
      if (!near || V.players.some(v => !v.p || !v.p.puppet || v.p.dead)) { stopVolley(); V.cool = near ? 25 : 0; return; }
      V.t += dt;
      const B = V.ball;
      // everyone moves to where they want to be, facing the ball
      for (const v of V.players) {
        const p = v.p, dx = v.gx - p.x, dz = v.gz - p.z, d = Math.hypot(dx, dz);
        if (d > .15) { const sp = Math.min(d * 3, 4.2); p.x += dx / d * sp * dt; p.z += dz / d * sp * dt; p.speed = sp; p.running = sp > 2.5; if (p.hitT <= 0) p.puppet.anim = 'walk'; }
        else { p.speed = 0; p.running = false; if (p.hitT <= 0) p.puppet.anim = 'ready'; }
        p.heading += U.angDiff(p.heading, Math.atan2(ball.position.x - p.x, ball.position.z - p.z)) * Math.min(1, dt * 6);
        p.y = .02;
      }
      if (V.state === 'serve') {
        // the server walks back behind the line, bounces the ball, and serves
        const srv = V.players.find(v => v.team === V.team && v.i % 2 === (V.team ? 1 : 0)) || V.players[0];
        srv.gx = 125; srv.gz = V.team ? c0.z1 + .6 : c0.z0 - .6;
        for (const v of V.players) if (v !== srv) { v.gx = v.home.x; v.gz = v.home.z; }
        ball.position.set(srv.p.x + .3, 1.1 + Math.abs(Math.sin(V.t * 5)) * .5, srv.p.z);
        if (V.t > 2.2 && Math.hypot(srv.gx - srv.p.x, srv.gz - srv.p.z) < .3) {
          hit(srv); const [a, b] = side(1 - V.team), tx = rand(c0.x0 + .8, c0.x1 - .8), tz = rand(a, b);
          fly(srv.p.x, 2.2, srv.p.z, tx, 1.9, tz, rand(1.4, 1.7), rand(3.5, 4.5));
          V.state = 'rally'; V.team = 1 - V.team; V.touches = 0; V.receiver = pickReceiver(tx, tz);
        }
        return;
      }
      if (V.state === 'rally') {
        B.t += dt / B.dur;
        const t = Math.min(1, B.t), f = B.from, o = B.to;
        ball.position.set(f[0] + (o[0] - f[0]) * t, f[1] + (o[1] - f[1]) * t + 4 * B.h * t * (1 - t), f[2] + (o[2] - f[2]) * t);
        if (V.receiver) { V.receiver.gx = o[0]; V.receiver.gz = o[2] + (V.team ? .35 : -.35); }
        if (t >= 1) {
          const r = V.receiver, ok = r && Math.hypot(r.p.x - o[0], r.p.z - o[2]) < 1.2 && Math.random() < .9;
          if (!ok) { V.state = 'drop'; V.t = 0; B.vy = -3; B.vx = (o[0] - f[0]) / B.dur * .4; B.vz = (o[2] - f[2]) / B.dur * .4; return; }
          hit(r); V.touches++;
          const mate = V.players.find(v => v.team === V.team && v !== r);
          if (V.touches < 2 && Math.random() < .65) {
            // a pass up to the teammate at the net
            const tx = U.clamp(r.p.x + rand(-1.5, 1.5), c0.x0 + 1, c0.x1 - 1), tz = NET + (V.team ? 1.6 : -1.6);
            fly(o[0], o[1], o[2], tx, 2.1, tz, rand(1, 1.2), rand(2.2, 3)); V.receiver = mate;
          } else {
            // over the net
            const [a, b] = side(1 - V.team), tx = rand(c0.x0 + .6, c0.x1 - .6), tz = rand(a, b), spike = V.touches >= 2 && Math.random() < .5;
            fly(o[0], o[1] + (spike ? .5 : 0), o[2], tx, 1.9, tz, spike ? rand(.75, .95) : rand(1.2, 1.6), spike ? .6 : rand(2.8, 4.2));
            V.team = 1 - V.team; V.touches = 0; V.receiver = pickReceiver(tx, tz);
          }
          for (const v of V.players) if (v !== V.receiver) { v.gx = v.home.x + rand(-.6, .6); v.gz = v.home.z + rand(-.6, .6); }
        }
        return;
      }
      if (V.state === 'drop') {
        // the ball falls on the sand, bounces, rolls; the point goes to the other side and they serve again
        B.vy -= 9.8 * dt; ball.position.x += B.vx * dt; ball.position.z += B.vz * dt; ball.position.y += B.vy * dt;
        if (ball.position.y < .14) { ball.position.y = .14; B.vy = -B.vy * .35; B.vx *= .6; B.vz *= .6; if (Math.abs(B.vy) > .6) G.audio.volley([ball.position.x, .2, ball.position.z], true); }
        if (V.t > 2.4) { V.state = 'serve'; V.t = 0; V.team = 1 - V.team; if (V.receiver) say(V.receiver.p, pick(['Эх!', 'Мимо…', 'Моя вина!', 'Аут!'])); }
      }
    }
    function pickReceiver(tx, tz) { let best = null, bd = Infinity; for (const v of V.players) if (v.team === V.team) { const d = Math.hypot(v.p.x - tx, v.p.z - tz); if (d < bd) { bd = d; best = v; } } return best; }
    const say = (p, t) => { if (G.say && p) G.say(p, t); };

    function surfUpdate(s, dt) {
      const P = G.player, near = Math.hypot(P.x - 150, P.z - s.wz) < 130;
      if (!s.p) {
        s.board.visible = false;
        if (!near || (s.cool -= dt) > 0) return;
        s.p = G.crowd.spawnPuppet(Math.random() < .6 ? 'beach_m' : 'beach_f', 142, s.wz, Math.PI / 2);
        if (!s.p) return;
        s.p.noBlob = true; s.state = 'paddle'; s.t = 0; s.x = 142.5; s.z = s.wz; s.h = Math.PI / 2; s.target = rand(160, 172);
        return;
      }
      const p = s.p;
      if (!near || !p.puppet || p.dead || p.down) {
        // scared off (or the hero went away): the board washes up on its own and the surfer swims in
        if (p.puppet) G.crowd.releasePuppet(p);
        if (!near && G.crowd.people.includes(p) && !p.dead) G.crowd.despawnPerson(p);
        s.p = null; s.cool = near ? 30 : 0; s.board.visible = false; return;
      }
      s.t += dt;
      const tt = performance.now() / 1000, bob = Math.sin(tt * 1.7 + s.x * .3 + s.z * .2) * .06, surf = .05 + bob;
      let bx = s.x, bz = s.z, lift = 0;
      if (s.state === 'paddle') {
        // out through the surf, lying on the board
        s.h += U.angDiff(s.h, Math.PI / 2) * Math.min(1, dt * 2);
        s.x += Math.sin(s.h) * 1.9 * dt; s.z += Math.cos(s.h) * 1.9 * dt + (s.wz - s.z) * .1 * dt;
        p.puppet.anim = 'paddle'; p.y = surf + .18;
        if (s.x > s.target) { s.state = 'wait'; s.t = 0; s.wait = rand(3, 8); }
      } else if (s.state === 'wait') {
        // sitting astride, turning to face the beach, waiting for a set
        s.h += U.angDiff(s.h, -Math.PI / 2) * Math.min(1, dt * 1.2);
        p.puppet.anim = 'sit'; p.y = surf + .08 - .95 * p.look.hs;
        if (s.t > s.wait) { s.state = 'ride'; s.t = 0; s.carve = rand(0, 6); G.audio.wave([s.x, 0, s.z]); }
      } else if (s.state === 'ride') {
        // up on the board and down the face, carving from side to side, foam behind
        const v = 5.5 + Math.min(1, s.t) * 2, cv = Math.sin(s.t * 1.1 + s.carve) * .7;
        s.h = -Math.PI / 2 + cv; s.x += Math.sin(s.h) * v * dt; s.z += Math.cos(s.h) * v * dt;
        p.puppet.anim = s.t < .5 ? 'ready' : 'surf'; p.y = surf + .06; lift = .05;
        if ((s.foamT -= dt) <= 0) { s.foamT = .12; G.player.fx.ripple(s.x - Math.sin(s.h) * .8, .06, s.z - Math.cos(s.h) * .8, .9); }
        if (s.x < 143.5 || Math.abs(s.z - s.wz) > 14) {
          // wipe out (or kick out) into the shallows
          s.state = 'fall'; s.t = 0; G.player.fx.splash(s.x, .05, s.z, .45); if (Math.hypot(P.x - s.x, P.z - s.z) < 40) G.audio.splashAt([s.x, .2, s.z]);
        }
      } else if (s.state === 'fall') {
        p.puppet.anim = 'paddle'; p.y = surf - .15 + Math.min(1, s.t) * .33;
        if (s.t > 1.6) { s.state = 'paddle'; s.t = 0; s.target = rand(160, 172); s.z = s.wz + rand(-6, 6); }
      }
      // the rider stands on the middle of the board; lying down the chest is over it
      p.heading = s.h;
      const fx = Math.sin(s.h), fz = Math.cos(s.h);
      if (p.puppet.anim === 'paddle') { p.x = s.x - fx * .95; p.z = s.z - fz * .95; } else { p.x = s.x; p.z = s.z; }
      s.board.visible = true; s.board.position.set(bx, surf + lift, bz); s.board.rotation.set(0, s.h, 0);
      s.board.rotation.z = s.state === 'ride' ? Math.sin(s.t * 1.1 + s.carve) * .2 : bob * .5;
    }

    // the one in the hero's car: sitting in the passenger seat until the car stops somewhere, then a while parked
    const R = { state: 'none', car: null, look: null, rider: null, t: 0, spot: null, waitT: 0 };
    const riderMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    function seat(car, look) {
      const c = h => new THREE.Color(h || '#888888'), M = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
      const geo = NB.mergeParts([[new THREE.BoxGeometry(.38, .5, .22), M(0, .25, 0), c(look.col.torso)], [new THREE.BoxGeometry(.21, .24, .22), M(0, .65, 0), c(look.col.head)],
        [new THREE.BoxGeometry(.23, .08, .24), M(0, .79, 0), c(look.col.hairTop)], [new THREE.BoxGeometry(.23, .3, .06), M(0, .6, -.11), c(look.col.hairBack)]]);
      const m = new THREE.Mesh(geo, riderMat), st = car.model.seat; m.position.set(-st[0], st[1], st[2]); car.body.add(m); return m;
    }
    function dropRider(text) {
      if (R.rider) { R.rider.parent && R.rider.parent.remove(R.rider); R.rider.geometry.dispose(); R.rider = null; }
      if (R.look && R.car) {
        const rx = -Math.cos(R.car.h), rz = Math.sin(R.car.h), w = R.car.model.w / 2 + .7;
        const p = G.crowd.dropOff(R.car.x + rx * w, R.car.z + rz * w, Math.atan2(rx, rz), R.look, text);
        if (p) { p.keep = false; }
      }
      R.state = 'none'; R.car = null; R.look = null;
    }
    function nightUpdate(dt) {
      const car = G.vehicles.driving, P = G.player;
      if (R.state === 'none') {
        // pull up next to one of them: a toot of the horn, or just waiting there a moment, and she gets in
        if (!car || car.model.boat || car.model.heli || !night() || G.vehicles.speedKmh() > 4) { R.waitT = 0; return; }
        const s0 = girls.find(s => s.person && s.person.spot === s && Math.hypot(s.person.x - car.x, s.person.z - car.z) < 10);
        if (!s0) { R.waitT = 0; return; }
        if (!R.waitT) { say(s0.person, pick(['Подвезти, красавчик?', 'Привет, милый! Прокатимся?', 'Эй, красавчик, я свободна!'])); }
        R.waitT += dt;
        if (!G.vehicles.hornHeld && R.waitT < 2.2) return;
        R.waitT = 0;
        for (const s of [s0]) {
          const p = s.person;
          // turned away: she won't ask again for a few seconds
          if (G.police.wanted > 0) { say(p, pick(['Копы на хвосте! Проезжай!', 'Не сейчас, красавчик, за тобой полиция'])); R.waitT = -6; return; }
          if (G.money.get() < 100) { say(p, 'Сто долларов, милый. Приходи с деньгами'); R.waitT = -6; return; }
          R.look = p.look; R.spot = s; s.vacated = true; G.crowd.despawnPerson(p);
          R.car = car; R.rider = seat(car, R.look); R.state = 'ride'; R.t = 0; G.audio.door('car');
          G.flash('«Поехали, красавчик!» — остановитесь в тихом месте', 3);
          return;
        }
        return;
      }
      if (R.state === 'ride') {
        if (car !== R.car || G.police.wanted > 0) { dropRider(G.police.wanted > 0 ? 'Я с копами не связываюсь!' : 'Ну и ладно!'); return; }
        R.t = G.vehicles.speedKmh() < 1 && Math.hypot(car.x - R.spot.x, car.z - R.spot.z) > 25 ? R.t + dt : 0;
        if (R.t > 1.5) {
          if (!G.money.spend(100, 'Ночь в Неплохо Сити')) { dropRider('Без денег не катаю!'); return; }
          R.state = 'busy'; R.t = 0; car.rockT = 7; G.flash('Машина покачивается…', 3);
        }
        return;
      }
      if (R.state === 'busy') {
        R.t += dt; P.hp = Math.min(100, P.hp + dt * 14);
        if (car !== R.car) { dropRider('Эй, куда?!'); return; }
        if (R.t > 7) { P.hp = 100; G.flash('Здоровье восстановлено', 2.4); dropRider(pick(['Звони ещё, красавчик!', 'Было весело!', 'Пока, милый!'])); }
      }
    }

    let girlsT = 3;
    // a girl the hero has paid: she walks ahead up the stairs to the room, he follows a step behind
    let escort = null;
    function escortEnd(msg) {
      if (!escort) return;
      const p = escort.p; escort = null;
      if (G.crowd.people.includes(p) && p.puppet) { p.speed = 0; G.crowd.releasePuppet(p); if (msg) say(p, msg); }
    }
    function escortUpdate(dt) {
      if (!escort) return;
      const E = escort, p = E.p, P = G.player, path = motel.path;
      E.t += dt;
      if (!G.crowd.people.includes(p) || p.dead || p.down || !p.puppet) { escort = null; return; }
      if (G.police.wanted > 0) { escortEnd('Копы! Всё, я пошла!'); return; }
      if (P.dead || G.vehicles.driving || E.t > 90 || Math.hypot(P.x - p.x, P.z - p.z) > 14) { escortEnd('Ну и ладно, деньги не верну!'); return; }
      if ((E.wait -= dt) > 0) { p.speed = 0; p.puppet.anim = 'idle'; p.heading += U.angDiff(p.heading, Math.atan2(P.x - p.x, P.z - p.z)) * Math.min(1, dt * 5); return; }
      // she walks on to the next point, waiting for him if he falls behind
      const w = path[Math.min(E.k, path.length - 1)], dx = w[0] - p.x, dz = w[1] - p.z, d = Math.hypot(dx, dz);
      const behind = Math.hypot(P.x - p.x, P.z - p.z) > 3.2;
      if (d < .25) { if (E.k < path.length - 1) E.k++; }
      if (E.k >= path.length - 1 && d < .25) {
        p.speed = 0; p.puppet.anim = 'flirt'; p.heading += U.angDiff(p.heading, -Math.PI / 2) * Math.min(1, dt * 5);   // at the door, facing it
        if (Math.hypot(P.x - p.x, P.z - p.z) < 1.6 && Math.abs(P.y - p.y) < .6) { escort = null; G.room(p); }
        return;
      }
      if (behind) { p.speed = 0; p.puppet.anim = 'idle'; p.heading += U.angDiff(p.heading, Math.atan2(P.x - p.x, P.z - p.z)) * Math.min(1, dt * 5); return; }
      const sp = Math.min(2.1, d / dt);
      p.x += dx / d * sp * dt; p.z += dz / d * sp * dt; p.y = P.floorAt(p.x, p.z, p.y + .05);
      p.speed = sp; p.running = false; p.puppet.anim = 'walk';
      p.heading += U.angDiff(p.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
    }
    const api = {
      spots,
      // where the girls stand, while it's their hours (for the map)
      nightSpot() { return night() && girls.length ? { x: girls[1].x, z: girls[1].z } : null; },
      get motel() { return motel; },
      // while a girl leads the hero to the room: the direction to walk in, or null when he's free
      autoWalk() {
        if (!escort || escort.wait > 0) return null;
        const p = escort.p, P = G.player, dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz);
        // he walks the same points she does (the stairs, the gap onto the walkway), never passing her
        const path = motel.path, E = escort;
        while (E.pk < path.length - 1 && E.pk < E.k && Math.hypot(path[E.pk][0] - P.x, path[E.pk][1] - P.z) < .4) E.pk++;
        if (d < 1.2 || E.pk > E.k) return { dx: 0, dz: 0 };
        const w = path[E.pk], ex = w[0] - P.x, ez = w[1] - P.z, e = Math.hypot(ex, ez) || 1;
        return { dx: ex / e, dz: ez / e, mag: d > 2.2 ? .55 : .42 };
      },
      get escorting() { return !!escort; },
      carts,
      buskers,
      court: COURT,
      attach(g) { G = g; V.cool = 1; for (const s of surfers) s.cool = 0; },
      update(dt) {
        if (!G) return;
        for (const b of buskers) b.inst.visible = onShow(b.spot);
        volleyUpdate(dt);
        nightUpdate(dt);
        escortUpdate(dt);
        // the girls call out to the hero passing by
        if (night() && (girlsT -= dt) <= 0) {
          girlsT = rand(9, 16);
          const P = G.player, s = girls.find(g => g.person && g.person.spot === g && Math.hypot(g.x - P.x, g.z - P.z) < 16);
          if (s) say(s.person, pick(['Эй, красавчик!', 'Скучаешь, милый?', 'Иди сюда, не стесняйся!', 'Сто долларов — и ты как новенький!', 'Подвезёшь, красавчик?']));
        }
        for (const s of surfers) surfUpdate(s, dt);
        // vendors call out to the hero walking by
        const P = G.player;
        for (const c of carts) {
          if ((c.shoutT -= dt) > 0 || !onShow(c.vendor) || G.vehicles.driving) continue;
          c.shoutT = rand(14, 26);
          if (Math.hypot(P.x - c.x, P.z - c.z) < 10) say(c.vendor.person, c.kind === 'hotdog' ? pick(['Горячие хот-доги!', 'С горчицей? С кетчупом?', 'Лучшие хот-доги в Неплохо Сити!']) : pick(['Мороженое! Холодное мороженое!', 'Клубничное, ванильное, фисташковое!', 'В такую жару — только мороженое!']));
        }
        for (const b of buskers) b.tipT -= dt;
      },
      // things to do with F: buy food, tip a busker
      interactions() {
        const out = [];
        for (const s of girls) {
          const p = s.person; if (!p || p.spot !== s || !night() || escort) continue;
          out.push({ x: p.x, z: p.z, y: s.y, r: 1.6, short: 'НОМЕР', label: () => 'Снять номер в мотеле Pink Flamingo · $100',
            use: () => {
              if (G.police.wanted > 0) { say(p, 'Копы на хвосте! Иди отсюда!'); return; }
              if (!G.money.spend(100, 'Номер в мотеле')) { say(p, 'Сто долларов, милый. Приходи с деньгами'); return; }
              if (!G.crowd.takePuppet(p)) return;
              say(p, pick(['Пойдём, красавчик', 'Номер на втором этаже', 'Не заставляй ждать', 'Номер ' + motel.room.n + ' наш, пошли']));
              escort = { p, k: 0, pk: 0, t: 0, wait: .6 };
              G.flash('Идите с ней в номер ' + motel.room.n + ' на втором этаже', 2.6);
            } });
        }
        for (const c of carts) {
          if (!onShow(c.vendor)) continue;
          const hot = c.kind === 'hotdog', price = hot ? 5 : 3, heal = hot ? 25 : 15;
          out.push({ x: c.x + Math.sin(c.face) * 1, z: c.z + Math.cos(c.face) * 1, y: c.y, r: 1.6, short: hot ? 'ХОТ-ДОГ' : 'МОРОЖЕНОЕ',
            label: () => (hot ? 'Хот-дог' : 'Мороженое') + ' · $' + price,
            use: () => {
              if (!G.money.spend(price, hot ? 'Хот-дог' : 'Мороженое')) return;
              const before = G.player.hp; G.player.hp = Math.min(100, G.player.hp + heal); G.audio.pickup();
              say(c.vendor.person, pick(hot ? ['Приятного аппетита!', 'Держи, горячий!', 'Заходи ещё!'] : ['Держи, пока не растаяло!', 'Освежает!', 'Хорошего дня!']));
              G.flash(G.player.hp > before ? (hot ? 'Ммм, хот-дог! +' : 'Холодненькое! +') + Math.round(G.player.hp - before) + ' здоровья' : (hot ? 'Вкуснятина!' : 'Освежает!'), 2);
            } });
        }
        for (const b of buskers) {
          if (!onShow(b.spot)) continue;
          out.push({ x: b.x + Math.sin(b.face) * 1.2, z: b.z + Math.cos(b.face) * 1.2, y: b.y, r: 1.7, short: 'ЧАЕВЫЕ',
            label: () => 'Дать музыканту $5',
            use: () => {
              if (b.tipT > 0) return;
              if (!G.money.spend(5, 'Чаевые')) return;
              b.tipT = 1.2; G.audio.cash(false);
              say(b.spot.person, pick(['Спасибо, друг!', 'Благодарю!', 'Это для тебя!', 'Ты лучший!', 'Заказывай песню!']));
            } });
        }
        return out;
      },
      // the busker you can hear from here: which tune and how loud
      venueAt(x, z) {
        let best = null;
        for (const b of buskers) {
          if (!onShow(b.spot)) continue;
          const d = Math.hypot(x - b.x, z - b.z); if (d > 26) continue;
          const level = Math.max(0, 1 - d / 26) * (d < 5 ? 1 : .8);
          if (!best || level > best.level) best = { name: 'busk_' + b.kind, level };
        }
        return best;
      },
      // for the big map
      icons() { return carts.map(c => ({ x: c.x, z: c.z, kind: c.kind })).concat(buskers.map(b => ({ x: b.x, z: b.z, kind: 'music' }))); }
    };
    return api;
  };
})(window.NB);
