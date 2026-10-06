// The fire brigade. A fire station stands in the car park next to NEON SPRAY; when a car is burning
// (or a wreck is still burning) near the hero, a fire engine drives out of the station with its siren on,
// two firefighters get out, turn their hoses on the fire until it's out, climb back in and drive home.
// Put out in time, a burning car doesn't blow up.
(function (NB) {
  'use strict';
  const { U, GeoBuilder } = NB;
  const X0 = 27, X1 = 40.5, Z0 = -72, Z1 = -59.4, H = 6.4, BAYS = [[28, 33.4], [34.1, 39.5]], BAY_H = 4.3;

  NB.buildFireStation = function (ctx) {
    const { scene, col, C, mapShapes } = ctx;
    const P = new GeoBuilder(), N = new GeoBuilder(), GL = new GeoBuilder();
    const box = (x0, y0, z0, x1, y1, z1, hex, solid) => { P.box(x0, y0, z0, x1, y1, z1, C(hex)); if (solid) col.add(x0, y0 < .5 ? 0 : y0, z0, x1, y1, z1); };
    const neon = (x0, y0, z0, x1, y1, z1, hex) => { N.box(x0, y0, z0, x1, y1, z1, C(hex)); GL.box(x0 - .25, y0 - .25, z0 - .25, x1 + .25, y1 + .25, z1 + .25, C(hex).multiplyScalar(.9), { noTop: true }); };
    const BRICK = '#a8322a', TRIM = '#f2ede4';
    box(X0, 0, Z0, X1, H, Z0 + .4, BRICK, true);
    box(X0, 0, Z0, X0 + .4, H, Z1, BRICK, true); box(X1 - .4, 0, Z0, X1, H, Z1, BRICK, true);
    box(X0, 0, Z1 - .4, BAYS[0][0], H, Z1, BRICK, true); box(BAYS[0][1], 0, Z1 - .4, BAYS[1][0], H, Z1, BRICK, true); box(BAYS[1][1], 0, Z1 - .4, X1, H, Z1, BRICK, true);
    box(BAYS[0][0], BAY_H, Z1 - .4, BAYS[1][1], H, Z1, BRICK, true);
    box(X0 - .2, H, Z0 - .2, X1 + .2, H + .35, Z1 + .2, TRIM, true);
    box(X0 + .4, .15, Z0 + .4, X1 - .4, .17, Z1 - .4, '#6a6470');
    for (const [a, b] of BAYS) { box(a - .15, 0, Z1 - .02, a, BAY_H + .15, Z1 + .08, TRIM); box(b, 0, Z1 - .02, b + .15, BAY_H + .15, Z1 + .08, TRIM); box(a - .15, BAY_H, Z1 - .02, b + .15, BAY_H + .15, Z1 + .08, TRIM); }
    box(X0, 2.9, Z1 - .02, X1, 3.05, Z1 + .05, TRIM);
    // the crew door on the pillar between the bays, with a lit sign over it
    { const dx = (BAYS[0][1] + BAYS[1][0]) / 2; box(dx - .3, .15, Z1, dx + .3, 2.5, Z1 + .1, '#2a1a18'); box(dx - .05, 1.1, Z1 + .1, dx + .05, 1.2, Z1 + .16, '#d9d9e2'); neon(dx - .34, 2.55, Z1 + .02, dx + .34, 2.65, Z1 + .14, '#ff3344'); }
    // inside: hoses on the wall, helmets on hooks, lamps
    for (let x = X0 + 1; x < X1 - 1; x += 2.6) box(x, 1.2, Z0 + .4, x + .9, 2.1, Z0 + .55, '#e8c547');
    for (let x = X0 + 1.5; x < X1 - 1; x += 1.3) box(x, 1.7, Z0 + .55, x + .3, 1.95, Z0 + .8, '#c81e1e');
    neon(X0 - .22, H + .1, Z1 + .15, X1 + .22, H + .22, Z1 + .25, '#ff3344');
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; scene.add(m); return m; };
    const shell = add(P.build(), new THREE.MeshLambertMaterial({ vertexColors: true })); shell.castShadow = shell.receiveShadow = true;
    add(N.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    add(GL.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .26, blending: THREE.AdditiveBlending, depthWrite: false }));
    const signTex = U.canvasTex(512, 96, (g, w, h) => {
      g.fillStyle = '#f2ede4'; g.fillRect(0, 0, w, h); g.fillStyle = '#c81e1e'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#c81e1e'; g.font = 'bold 52px Rubik, Arial, sans-serif'; g.fillText('FIRE STATION 7', w / 2, h / 2 + 2);
    }, false);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), new THREE.MeshBasicMaterial({ map: signTex })); sign.position.set((X0 + X1) / 2, 5.3, Z1 + .03); scene.add(sign);
    mapShapes.push({ x0: X0, z0: Z0, x1: X1, z1: Z1, c: '#e0483a', k: 'b' });
    return {
      center: { x: (X0 + X1) / 2, z: (Z0 + Z1) / 2 },
      // the crew door on the pillar between the two bays: it leads into the station (places.js)
      door: { x: (BAYS[0][1] + BAYS[1][0]) / 2, z: Z1 + 1.3, y: .15, heading: 0, nx: 0, nz: 1, hex: '#ff3344', cx: (X0 + X1) / 2, cz: (Z0 + Z1) / 2 },
      // the engines leave from the avenue in front of the doors
      exit: { x: (X0 + X1) / 2, z: -50 },
      // a fire engine parked in the left bay; the forecourt and the kerb stay clear
      parked: { x: (BAYS[0][0] + BAYS[0][1]) / 2, z: -66, h: 0 },
      keepClear: { x0: X0 - 1, x1: X1 + 1, z0: Z0 - 3, z1: Z1 + 7 }
    };
  };

  const SHOUT = ['Тушим!', 'Воду давай!', 'Отойдите от машины!', 'Сейчас рванёт — назад!'];
  NB.createFireService = function (world, o) {
    const st = world.fireStation, units = [];
    let scanT = 1;
    if (st) o.vehicles.spawnParked('firetruck', st.parked.x, st.parked.z, st.parked.h);
    // water from the hoses: droplets flying in an arc onto the fire
    const dropTex = U.canvasTex(32, 32, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(230,245,255,1)'); gr.addColorStop(1, 'rgba(160,210,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, false);
    const drops = [];
    for (let i = 0; i < 90; i++) { const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: dropTex, transparent: true, depthWrite: false })); d.visible = false; d.scale.set(.35, .35, 1); o.scene.add(d); drops.push(d); }
    let dropHead = 0;
    function spray(m, f) {
      const d = drops[dropHead]; dropHead = (dropHead + 1) % drops.length;
      const sx = m.x + Math.sin(m.heading) * .6, sz = m.z + Math.cos(m.heading) * .6, sy = m.y + 1.1;
      d.from = [sx, sy, sz]; d.to = [f.x + (Math.random() - .5) * 1.5, f.y + .9 + Math.random() * .5, f.z + (Math.random() - .5) * 1.5]; d.t = 0; d.visible = true;
    }
    const alive = p => p && o.crowd.people.includes(p) && !p.dead && !p.down;
    const burning = c => o.vehicles.cars.includes(c) && (c.burnT > 0 || c.wreckFireT > 0);
    function release(u) { for (const m of u.crew) if (alive(m)) o.crowd.releaseMedic(m); u.crew = []; }
    function goHome(u) {
      if (u.fire && u.fire.fireUnit === u) u.fire.fireUnit = null;
      u.state = 'leave'; u.t = 0; u.car.sirenOn = false; u.goal = null;
      if (st) { u.goal = [st.exit.x + 3, st.exit.z - 3.5]; o.vehicles.driveTo(u.car, u.goal[0], u.goal[1], 12); }
    }
    // is the engine getting any closer to where it's going? returns the seconds it has been stuck
    function headway(u, dt) {
      if (!u.goal) return 0;
      const d = Math.hypot(u.car.x - u.goal[0], u.car.z - u.goal[1]);
      if (u.best == null || d < u.best - 2) { u.best = d; u.stuckT = 0; } else u.stuckT = (u.stuckT || 0) + dt;
      return u.stuckT;
    }
    const unseen = (car, player) => !car.visible || Math.hypot(car.x - player.x, car.z - player.z) > 70;
    return {
      units,
      update(dt, player) {
        if (!st) return;
        scanT -= dt;
        if (scanT <= 0) {
          scanT = 1;
          if (units.length < 2) {
            let best = null, bd = 150;
            for (const c of o.vehicles.fires()) { if (c.fireUnit || c === o.vehicles.driving || (o.hold && o.hold(c))) continue; const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } }
            if (best) {
              const car = o.vehicles.spawnDepot('firetruck', st.exit.x, st.exit.z, best.x, best.z);
              if (car) {
                const [kx, kz] = o.vehicles.kerbPoint(best.x, best.z);
                o.vehicles.driveTo(car, kx, kz, 15); car.sirenOn = true;
                const u = { car, fire: best, state: 'drive', t: 0, crew: [], goal: [kx, kz] };
                best.fireUnit = u; units.push(u);
                if (Math.hypot(st.exit.x - player.x, st.exit.z - player.z) < 60 || bd < 60) o.flash('Пожарные выехали', 1.8);
              }
            }
          }
        }
        for (const u of units.slice()) {
          u.t += dt;
          const car = u.car, f = u.fire;
          if (!o.vehicles.cars.includes(car) || car.driver === 'player' || car.wreck) {
            release(u); if (f && f.fireUnit === u) f.fireUnit = null;
            units.splice(units.indexOf(u), 1); continue;
          }
          switch (u.state) {
            case 'drive': {
              if (!burning(f)) { goHome(u); break; }
              const stuck = headway(u, dt);
              if (stuck > 12 && unseen(car, player)) {   // nobody sees it: it gets there
                car.x = u.goal[0]; car.z = u.goal[1]; car.vx = car.vz = 0; car.h = Math.atan2(f.x - car.x, f.z - car.z); u.best = null; u.stuckT = 0;
              } else if (stuck > 25 && Math.hypot(car.x - f.x, car.z - f.z) < 45) car.goto = { arrived: true, x: car.x, z: car.z };   // stuck in sight: walk from here
              // stop short of the fire, the crew gets out
              if (Math.hypot(car.x - f.x, car.z - f.z) < 15 || (car.goto && car.goto.arrived)) {
                car.goto = null; car.vx = car.vz = 0;
                const rx = -Math.cos(car.h), rz = Math.sin(car.h);
                for (const s of [-1, 1]) {
                  const m = o.crowd.spawnMedic(car.x + rx * s * 1.6, car.z + rz * s * 1.6, 'firefighter');
                  if (!m) continue;
                  const a = Math.atan2(car.x - f.x, car.z - f.z) + s * .5;
                  m.medic.goal = [f.x + Math.sin(a) * 4.2, f.z + Math.cos(a) * 4.2]; m.medic.face = Math.atan2(f.x - m.medic.goal[0], f.z - m.medic.goal[1]);
                  u.crew.push(m);
                }
                u.state = 'approach'; u.t = 0;
                if (o.say && u.crew[0]) o.say(u.crew[0], SHOUT[(Math.random() * SHOUT.length) | 0]);
              } else if (u.t > 100) goHome(u);
              break;
            }
            case 'approach':
              if (!burning(f)) { u.state = 'return'; u.t = 0; for (const m of u.crew) if (alive(m)) { m.medic.goal = [car.x, car.z]; m.medic.face = null; } break; }
              if (u.crew.every(m => !alive(m) || m.medic.arrived) || u.t > 12) { for (const m of u.crew) if (alive(m)) m.medic.anim = 'hose'; u.state = 'spray'; u.t = 0; }
              break;
            case 'spray':
              for (const m of u.crew) if (alive(m)) { if (Math.random() < .7) spray(m, f); }
              if (u.t > 4.5 || !burning(f)) {
                if (burning(f)) o.vehicles.extinguish(f);
                for (const m of u.crew) if (alive(m)) { m.medic.anim = null; const rx = -Math.cos(car.h), rz = Math.sin(car.h); m.medic.goal = [car.x + rx * 1.6, car.z + rz * 1.6]; m.medic.face = null; }
                u.state = 'return'; u.t = 0;
                if (o.say && alive(u.crew[0])) o.say(u.crew[0], 'Потушили!');
              }
              break;
            case 'return':
              if (u.crew.every(m => !alive(m) || m.medic.arrived) || u.t > 20) { for (const m of u.crew) o.crowd.despawnPerson(m); u.crew = []; goHome(u); }
              break;
            case 'leave': {
              const d = Math.hypot(car.x - player.x, car.z - player.z), stuck = headway(u, dt);
              if ((d > 70 && !car.visible) || (car.goto && car.goto.arrived) || (stuck > 12 && unseen(car, player)) || stuck > 40) { o.vehicles.remove(car); units.splice(units.indexOf(u), 1); }
              break;
            }
          }
        }
        for (const d of drops) if (d.visible) {
          d.t += dt / .55; if (d.t >= 1) { d.visible = false; continue; }
          const t = d.t, a = d.from, b = d.to;
          d.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * 1.2, a[2] + (b[2] - a[2]) * t);
          d.material.opacity = .9 * (1 - t * .5);
        }
      }
    };
  };
})(window.NB);
