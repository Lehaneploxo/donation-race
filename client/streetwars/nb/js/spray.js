// NEON SPRAY: a paint shop at the north edge of the car park on Flores Market's avenue.
// Drive in and stop: the roller door comes down, the car gets a new colour and its dents knocked out,
// and whatever the police had on you is gone. $100 a go.
(function (NB) {
  'use strict';
  const { U, GeoBuilder } = NB;
  const PRICE = 100;
  // the shop: walls round three sides, the door facing the avenue (+z)
  const X0 = 12.5, X1 = 23.5, Z0 = -72, Z1 = -59.4, CX = (X0 + X1) / 2, H = 4.6, DOOR = [CX - 4, CX + 4], DOOR_H = 3.3, FLOOR = .175;
  // where a car has to stop to be sprayed (its centre)
  const BAY = { x0: X0 + 1.7, x1: X1 - 1.7, z0: Z0 + 1.4, z1: Z1 - 2.8 };

  NB.buildSpray = function (ctx) {
    const { scene, col, C, mapShapes } = ctx;
    const P = new GeoBuilder(), N = new GeoBuilder(), GL = new GeoBuilder();
    const box = (x0, y0, z0, x1, y1, z1, hex, solid) => { P.box(x0, y0, z0, x1, y1, z1, C(hex)); if (solid) col.add(x0, y0 < .5 ? 0 : y0, z0, x1, y1, z1); };
    const neon = (x0, y0, z0, x1, y1, z1, hex) => { N.box(x0, y0, z0, x1, y1, z1, C(hex)); GL.box(x0 - .25, y0 - .25, z0 - .25, x1 + .25, y1 + .25, z1 + .25, C(hex).multiplyScalar(.9), { noTop: true }); };
    const WALL = '#2c2440', TRIM = '#1a1428';
    // shell
    box(X0, 0, Z0, X1, H, Z0 + .4, WALL, true);                                    // back
    box(X0, 0, Z0, X0 + .4, H, Z1, WALL, true); box(X1 - .4, 0, Z0, X1, H, Z1, WALL, true);   // sides
    box(X0, 0, Z1 - .4, DOOR[0], H, Z1, WALL, true); box(DOOR[1], 0, Z1 - .4, X1, H, Z1, WALL, true);   // pillars either side of the door
    box(DOOR[0], DOOR_H + FLOOR, Z1 - .4, DOOR[1], H, Z1, TRIM, true);                 // header over the door
    box(X0 - .2, H, Z0 - .2, X1 + .2, H + .3, Z1 + .2, '#3a3050', true);               // roof
    box(X0 + .4, .15, Z0 + .4, X1 - .4, FLOOR, Z1 - .4, '#4a4458');                     // floor
    // yellow-and-black chevrons on the floor at the door and a stop line inside
    for (let x = DOOR[0] + .1; x < DOOR[1] - .3; x += .8) box(x, FLOOR, Z1 - .9, x + .4, FLOOR + .006, Z1 - .45, '#ffd23d');
    box(BAY.x0 + .2, FLOOR, BAY.z0 - .6, BAY.x1 - .2, FLOOR + .006, BAY.z0 - .35, '#f5f5f0');
    // inside: a spray gantry across the ceiling, lamps, a shelf of paint tins, a stack of tyres
    for (const z of [Z0 + 2.5, Z0 + 8.5]) {
      box(X0 + .4, H - .9, z - .12, X1 - .4, H - .7, z + .12, '#8a8698');
      for (let x = X0 + 2; x < X1 - 1.5; x += 1.5) box(x - .07, H - 1.25, z - .07, x + .07, H - .9, z + .07, '#b8b4c4');
    }
    for (const x of [X0 + .8, X1 - .8]) neon(x - .05, 1, Z0 + 1, x + .05, 3.6, Z0 + 1.1, x < CX ? '#ff4fa3' : '#3fe6e0');
    box(X0 + .4, 0, Z0 + .5, X0 + 1.1, 2.2, Z0 + 4.5, '#3a3448', true);
    const TINS = ['#e8202a', '#ffd23d', '#2a6fe8', '#ff4fa3', '#8cff6b', '#f5f5f0'];
    let tin = 0;
    for (let y = .5; y < 2.2; y += .55) for (let z = Z0 + .7; z < Z0 + 4.2; z += .42) box(X0 + .5, y, z, X0 + .8, y + .32, z + .3, TINS[(tin++ * 5) % 6]);
    for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(.33, .13, 6, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1c1c22 })); t.position.set(X1 - 1.1, .3 + k * .26, Z0 + 1); scene.add(t); }
    col.add(X1 - 1.6, 0, Z0 + .5, X1 - .6, 1.2, Z0 + 1.5);
    // neon outline along the roof edge and round the door
    for (const [a, b, c, d] of [[X0 - .22, Z1 + .15, X1 + .22, Z1 + .25], [X0 - .22, Z0 - .25, X1 + .22, Z0 - .15], [X0 - .25, Z0 - .2, X0 - .15, Z1 + .2], [X1 + .15, Z0 - .2, X1 + .25, Z1 + .2]]) neon(a, H + .1, b, c, H + .22, d, '#3fe6e0');
    neon(DOOR[0] - .15, FLOOR, Z1 + .02, DOOR[0] - .05, DOOR_H + FLOOR, Z1 + .1, '#ff4fa3'); neon(DOOR[1] + .05, FLOOR, Z1 + .02, DOOR[1] + .15, DOOR_H + FLOOR, Z1 + .1, '#ff4fa3');
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; scene.add(m); return m; };
    const shell = add(P.build(), new THREE.MeshLambertMaterial({ vertexColors: true })); shell.castShadow = shell.receiveShadow = true;
    add(N.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    add(GL.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .26, blending: THREE.AdditiveBlending, depthWrite: false }));
    // the sign over the door, and a second one on the roof you can see from the avenue
    const signTex = U.canvasTex(512, 96, (g, w, h) => {
      g.fillStyle = '#12091e'; g.fillRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic bold 60px "Trebuchet MS", Arial, sans-serif';
      g.shadowColor = '#ff4fa3'; g.shadowBlur = 16; g.fillStyle = '#ff4fa3'; g.fillText('NEON', w * .3, h / 2 + 2);
      g.shadowColor = '#3fe6e0'; g.fillStyle = '#3fe6e0'; g.fillText('SPRAY', w * .68, h / 2 + 2);
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.55)'; g.font = 'italic bold 60px "Trebuchet MS", Arial, sans-serif'; g.fillText('NEON', w * .3, h / 2 + 2); g.fillText('SPRAY', w * .68, h / 2 + 2);
    }, false);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.2), signMat); sign.position.set(CX, DOOR_H + FLOOR + .7, Z1 + .03); scene.add(sign);
    const roofSign = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 1.6), signMat); roofSign.position.set(CX, H + 1.35, Z1 - .6); scene.add(roofSign);
    for (const x of [CX - 3.5, CX + 3.5]) box(x - .06, H + .3, Z1 - .66, x + .06, H + .6, Z1 - .54, '#2a2436');
    // a price board by the door
    const priceTex = U.canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#12091e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffd23d'; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12);
      g.textAlign = 'center'; g.fillStyle = '#fff1e4'; g.font = 'bold 20px Rubik, Arial, sans-serif'; g.fillText('ПОКРАСКА', w / 2, 38);
      g.fillStyle = '#6bff8a'; g.font = '900 38px Rubik, Arial, sans-serif'; g.fillText('$' + PRICE, w / 2, 80);
      g.fillStyle = '#ffd23d'; g.font = 'bold 15px Rubik, Arial, sans-serif'; g.fillText('без вопросов', w / 2, 106);
    }, false);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: priceTex })); board.position.set(X1 - .4, 2, Z1 + .05); scene.add(board);
    // the roller door, rolled up into the header
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(DOOR[1] - DOOR[0], DOOR_H, .1).translate(0, DOOR_H / 2, 0), new THREE.MeshLambertMaterial({ color: 0x9a94a8 }));
    for (let k = 1; k < 9; k++) { const line = new THREE.Mesh(new THREE.BoxGeometry(DOOR[1] - DOOR[0], .03, .11), new THREE.MeshLambertMaterial({ color: 0x6f6a7e })); line.position.y = k * DOOR_H / 9; doorMesh.add(line); }
    doorMesh.position.set((DOOR[0] + DOOR[1]) / 2, FLOOR, Z1 - .2); scene.add(doorMesh);
    // paint mist that drifts out of the bay when the door goes up
    const mistTex = U.canvasTex(64, 64, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, false);
    const mist = [];
    for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false })); s.visible = false; s.life = 0; scene.add(s); mist.push(s); }
    mapShapes.push({ x0: X0, z0: Z0, x1: X1, z1: Z1, c: '#b06bff', k: 'b' });

    let G = null;
    const S = { state: 'idle', t: 0, open: 1, armed: true, car: null, hinted: false, color: null };
    // the whole car is inside, clear of the door
    const inBay = c => { const ez = Math.abs(Math.cos(c.h)) * c.model.l / 2 + Math.abs(Math.sin(c.h)) * c.model.w / 2; return c.x > BAY.x0 && c.x < BAY.x1 && c.z > BAY.z0 && c.z + ez < Z1 - .35; };
    function puffs(hex) {
      const c = new THREE.Color(hex);
      for (const s of mist) {
        s.position.set(U.rand(BAY.x0, BAY.x1), U.rand(.4, 2.6), U.rand(BAY.z0, BAY.z1));
        s.life = U.rand(1.6, 2.8); s.maxLife = s.life; s.visible = true; s.material.color.copy(c); s.vz = U.rand(.4, 1.6); s.scale.set(1.4, 1.4, 1);
      }
    }
    const api = {
      PRICE,
      center: { x: CX, z: (Z0 + Z1) / 2 },
      door: { x: CX, z: Z1 + 1.5 },
      // keep the lot and the kerb in front of the door free of parked cars
      keepClear: { x0: X0 - 2.5, x1: X1 + 2.5, z0: Z0 - 3, z1: Z1 + 7 },
      get busy() { return S.state !== 'idle'; },
      attach(g) { G = g; },
      // on foot at the door: a hint to come back in a car
      interactions() {
        return [{ x: CX, z: Z1 + 1.2, r: 3.2, short: 'ПОКРАСКА', label: () => G.vehicles.driving ? null : 'Покраска NEON SPRAY · $' + PRICE,
          use: () => G.flash('Заезжайте внутрь на машине и остановитесь: новая краска, ремонт и розыск снят · $' + PRICE, 3.4) }];
      },
      update(dt) {
        if (!G) return;
        const car = G.vehicles.driving;
        // a hint the first time you're wanted near the shop
        if (G.police.wanted > 0 && !S.hinted && car && Math.hypot(G.player.x - CX, G.player.z - (Z0 + Z1) / 2) < 70) { S.hinted = true; G.flash('Покраска NEON SPRAY рядом — заезжайте, и розыск снимут', 3); }
        if (G.police.wanted === 0) S.hinted = false;
        S.t += dt;
        switch (S.state) {
          case 'idle':
            if (!car || !inBay(car)) { S.armed = true; break; }
            if (!S.armed || car.model.heli || car.model.boat || G.vehicles.speedKmh() > 4) break;
            S.armed = false;
            if (G.money.get() < PRICE) { G.audio.deny(); G.flash('Покраска стоит $' + PRICE + ' — не хватает денег', 2.6); break; }
            S.state = 'closing'; S.t = 0; S.car = car; G.audio.rollerDoor();
            break;
          case 'closing':
            S.open = Math.max(0, 1 - S.t / 1.1);
            if (S.t > 1.1) {
              S.state = 'spraying'; S.t = 0; G.audio.spray(2.2);
              // behind a closed door nobody can see you: the stars are gone
              S.wasWanted = G.police.wanted > 0; if (S.wasWanted) G.police.clear();
            }
            break;
          case 'spraying':
            if (S.t > 1.2 && !S.done) {
              S.done = true;
              G.blink(() => {
                if (G.vehicles.cars.includes(S.car)) { G.vehicles.respray(S.car); S.color = S.car.color; }
                G.money.spend(PRICE, 'Покраска');
              });
            }
            if (S.t > 2.3) { S.state = 'opening'; S.t = 0; S.done = false; G.audio.rollerDoor(); if (S.color) puffs(S.color); }
            break;
          case 'opening':
            S.open = Math.min(1, S.t / 1.1);
            if (S.t > 1.1) {
              S.state = 'idle'; S.t = 0;
              G.flash(S.wasWanted ? 'Розыск снят! Машина как новая' : 'Свежая краска, машина как новая', 3);
            }
            break;
        }
        const sc = Math.max(.04, 1 - S.open);
        doorMesh.scale.y = sc; doorMesh.position.y = FLOOR + DOOR_H * (1 - sc);
        for (const s of mist) if (s.visible) {
          s.life -= dt; s.position.z += s.vz * dt; s.position.y += dt * .3;
          const k = 1.4 + (s.maxLife - s.life) * 1.2; s.scale.set(k, k, 1);
          s.material.opacity = Math.max(0, s.life / s.maxLife) * .55; if (s.life <= 0) s.visible = false;
        }
      },
      render(t) {
        // the sign flickers while the guns are going behind the door
        signMat.color.setScalar(S.state === 'spraying' ? (Math.sin(t * 22) > 0 ? 1 : .35) : 1);
      }
    };
    return api;
  };
})(window.NB);
