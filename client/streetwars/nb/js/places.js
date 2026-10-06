// Places you can go into. Like the interiors in Vice City, each building's inside is a separate room
// built far outside the city: walk into the glowing circle at a door, the screen blinks and you're in.
// Also built here, right in the city: the hero's beach villa with its garage and pool, the tiki bar
// on the sand, and the pool deck on the roof of Hotel OCEAN.
// Each place builds its geometry, its people (spots for npc.js) and, once the game is running,
// its interactions: things the hero can use with F / the action button.
(function (NB) {
  'use strict';
  const { U, GeoBuilder } = NB;
  const rand = U.rand, pick = a => a[(Math.random() * a.length) | 0];
  const FLAT = [.03, .5];

  /* =====================================================================
     building kit: boxes, neon, walls with doorways, textured floors, pictures, screens
     ===================================================================== */
  function makeKit(scene, col, C) {
    const P = new GeoBuilder(), N = new GeoBuilder(), GL = new GeoBuilder();
    const o = [0, 0];
    const ax = x => x + o[0], az = z => z + o[1];
    const screens = { pos: [], uv: [], seed: [], mode: [], idx: [], n: 0 };
    const K = {
      scene, col, C,
      at(x, z) { o[0] = x; o[1] = z; },
      wx: ax, wz: az,
      box(x0, y0, z0, x1, y1, z1, hex, solid, opt) {
        P.box(ax(x0), y0, az(z0), ax(x1), y1, az(z1), C(hex), opt);
        if (solid) return col.add(ax(x0), y0 < .5 ? Math.min(0, y0) : y0, az(z0), ax(x1), y1, az(z1));
      },
      solid(x0, y0, z0, x1, y1, z1) { return col.add(ax(x0), y0, az(z0), ax(x1), y1, az(z1)); },
      neon(x0, y0, z0, x1, y1, z1, hex, glow = true) {
        N.box(ax(x0), y0, az(z0), ax(x1), y1, az(z1), C(hex));
        if (glow) GL.box(ax(x0) - .16, y0 - .16, az(z0) - .16, ax(x1) + .16, y1 + .16, az(z1) + .16, C(hex).multiplyScalar(.8), { noTop: true });
      },
      glow(x0, y0, z0, x1, y1, z1, hex, k = .6) { GL.box(ax(x0), y0, az(z0), ax(x1), y1, az(z1), C(hex).multiplyScalar(k), { noTop: true }); },
      ceil(x0, z0, x1, z1, y, hex) { P.quad([ax(x0), y, az(z0)], [ax(x1), y, az(z0)], [ax(x1), y, az(z1)], [ax(x0), y, az(z1)], 0, -1, 0, C(hex), FLAT, FLAT, FLAT, FLAT); },
      // a wall running along x at z, or along z at x, with doorway gaps [{ c, w, h }]
      wallZ(z, x0, x1, h, hex, gaps = [], t = .3) {
        const g = gaps.slice().sort((a, b) => a.c - b.c); let s = x0;
        for (const d of g) { if (d.c - d.w / 2 > s) K.box(s, 0, z - t / 2, d.c - d.w / 2, h, z + t / 2, hex, true); K.box(d.c - d.w / 2, d.h, z - t / 2, d.c + d.w / 2, h, z + t / 2, hex, true); s = d.c + d.w / 2; }
        if (x1 > s) K.box(s, 0, z - t / 2, x1, h, z + t / 2, hex, true);
      },
      wallX(x, z0, z1, h, hex, gaps = [], t = .3) {
        const g = gaps.slice().sort((a, b) => a.c - b.c); let s = z0;
        for (const d of g) { if (d.c - d.w / 2 > s) K.box(x - t / 2, 0, s, x + t / 2, h, d.c - d.w / 2, hex, true); K.box(x - t / 2, d.h, d.c - d.w / 2, x + t / 2, h, d.c + d.w / 2, hex, true); s = d.c + d.w / 2; }
        if (z1 > s) K.box(x - t / 2, 0, s, x + t / 2, h, z1, hex, true);
      },
      // four walls around [x0..x1] x [z0..z1], doorways per side, ceiling, a skirting band and a neon line under the ceiling
      room(x0, z0, x1, z1, h, s) {
        const gp = s.gaps || {};
        K.wallZ(z0 - .15, x0 - .3, x1 + .3, h, s.wall, gp['-z']); K.wallZ(z1 + .15, x0 - .3, x1 + .3, h, s.wall, gp['+z']);
        K.wallX(x0 - .15, z0, z1, h, s.wall, gp['-x']); K.wallX(x1 + .15, z0, z1, h, s.wall, gp['+x']);
        K.ceil(x0, z0, x1, z1, h - .01, s.ceil || '#1a1420');
        if (s.trim) { for (const [a, b, c, d] of [[x0, z0, x1, z0 + .04], [x0, z1 - .04, x1, z1], [x0, z0, x0 + .04, z1], [x1 - .04, z0, x1, z1]]) K.box(a, 0, b, c, .14, d, s.trim); }
        if (s.neon) { for (const [a, b, c, d] of [[x0, z0, x1, z0 + .05], [x0, z1 - .05, x1, z1], [x0, z0, x0 + .05, z1], [x1 - .05, z0, x1, z1]]) K.neon(a, h - .35, b, c, h - .29, d, s.neon); }
      },
      tex(w, h, draw, repeat = true) { return U.canvasTex(w, h, draw, repeat, 4); },
      // a textured floor: tile = metres per texture repeat
      floor(x0, z0, x1, z1, tex, tile, y = .004) {
        const w = x1 - x0, d = z1 - z0, t = tex.clone(); t.needsUpdate = true;
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / tile, d / tile);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: t }));
        m.position.set(ax((x0 + x1) / 2), y, az((z0 + z1) / 2)); m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); return m;
      },
      // an upright picture facing '+x' | '-x' | '+z' | '-z', centred at (cx, cy, cz)
      picture(face, cx, cy, cz, w, h, tex, lit) {
        const g = new THREE.PlaneGeometry(w, h);
        if (face === '-z') g.rotateY(Math.PI); else if (face === '+x') g.rotateY(Math.PI / 2); else if (face === '-x') g.rotateY(-Math.PI / 2);
        const m = new THREE.Mesh(g, lit ? new THREE.MeshLambertMaterial({ map: tex, transparent: true }) : new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        m.position.set(ax(cx), cy, az(cz)); scene.add(m); return m;
      },
      // an animated screen quad (arcade game, slot reels, TV); all screens share one mesh and one shader
      screen(face, cx, cy, cz, w, h, mode, seed = Math.random()) {
        const R = { '+x': [0, -1], '-x': [0, 1], '+z': [1, 0], '-z': [-1, 0] }[face];
        const x = ax(cx), z = az(cz), hw = w / 2;
        const p = [[x - R[0] * hw, cy - h / 2, z - R[1] * hw], [x + R[0] * hw, cy - h / 2, z + R[1] * hw], [x + R[0] * hw, cy + h / 2, z + R[1] * hw], [x - R[0] * hw, cy + h / 2, z - R[1] * hw]];
        const s = screens.n;
        p.forEach((v, i) => { screens.pos.push(...v); screens.uv.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0); screens.seed.push(seed); screens.mode.push(mode); });
        screens.idx.push(s, s + 1, s + 2, s, s + 2, s + 3); screens.n += 4;
      },
      spot(s) { return Object.assign({ home: !s.patrol }, s, { x: ax(s.x), z: az(s.z), patrol: s.patrol && s.patrol.map(([x, z]) => [ax(x), az(z)]) }); },
      pt(x, z) { return { x: ax(x), z: az(z) }; },
      finish() {
        const add = (b, mat) => { const m = new THREE.Mesh(b.build(), mat); m.matrixAutoUpdate = false; scene.add(m); return m; };
        const pm = add(P, new THREE.MeshLambertMaterial({ vertexColors: true })); pm.receiveShadow = true; pm.castShadow = true;
        add(N, new THREE.MeshBasicMaterial({ vertexColors: true }));
        K.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false });
        add(GL, K.glowMat);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(screens.pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(screens.uv, 2));
        g.setAttribute('seed', new THREE.Float32BufferAttribute(screens.seed, 1));
        g.setAttribute('mode', new THREE.Float32BufferAttribute(screens.mode, 1));
        g.setIndex(screens.idx); g.computeBoundingSphere();
        K.screenMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: SCREEN_VS, fragmentShader: SCREEN_FS, side: THREE.DoubleSide });
        const sm = new THREE.Mesh(g, K.screenMat); sm.frustumCulled = false; scene.add(sm);
      }
    };
    return K;
  }

  const SCREEN_VS = `attribute float seed; attribute float mode; varying vec2 vUv; varying float vSeed; varying float vMode;
    void main(){ vUv = uv; vSeed = seed; vMode = mode; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const SCREEN_FS = `uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vMode;
    vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec3 c = vec3(0.02,0.01,0.05); float t = uTime * (0.8 + fract(vSeed*7.1) * 0.6) + vSeed * 40.0;
      if (vMode < 0.5) {                       // arcade games: invaders, a racer or a maze, picked by seed
        float kind = floor(fract(vSeed*3.7)*3.0); vec2 g = vUv * vec2(14.0, 12.0);
        if (kind < 0.5) {
          vec2 id = floor(g + vec2(sin(t)*1.5, 0.0));
          float on = step(0.45, hash(id)) * step(6.0, id.y) * step(id.y, 10.0);
          c += hue(vSeed + id.y*0.08) * on * step(0.2, fract(g.x + sin(t)*1.5)) * step(0.25, fract(g.y));
          c += vec3(0.3,1.0,0.4) * step(abs(vUv.x - 0.5 - sin(t*1.3)*0.3), 0.05) * step(vUv.y, 0.1) * step(0.04, vUv.y);
          c += vec3(1.0,1.0,0.6) * step(abs(vUv.x - 0.5 - sin(t*1.3 - 0.4)*0.3), 0.008) * step(abs(vUv.y - fract(t*0.9)), 0.03);
        } else if (kind < 1.5) {
          float road = step(abs(vUv.x - 0.5), 0.3);
          c = mix(vec3(0.05,0.25,0.12), vec3(0.14,0.13,0.18), road);
          c += vec3(0.9) * step(abs(vUv.x - 0.5), 0.012) * step(0.5, fract(vUv.y*5.0 + t*1.8)) * road;
          c += vec3(1.0,0.3,0.6) * step(abs(vUv.x - 0.5 - sin(t)*0.16), 0.055) * step(abs(vUv.y - 0.18), 0.07);
          c += vec3(0.3,0.9,1.0) * step(abs(vUv.x - 0.5 - 0.15), 0.05) * step(abs(fract(vUv.y + t*0.35) - 0.6), 0.06);
        } else {
          vec2 id = floor(g); vec2 f = fract(g); float wall = step(0.68, hash(id + 3.0));
          c = mix(c, vec3(0.1,0.2,1.0), wall * 0.8); c += vec3(1.0,0.9,0.5) * (1.0 - wall) * step(length(f - 0.5), 0.12);
          c += vec3(1.0,1.0,0.0) * step(length(vUv - vec2(fract(t*0.15), 0.5)), 0.06);
        }
        c *= 0.82 + 0.18 * sin(vUv.y * 320.0);
      } else if (vMode < 1.5) {                // slot machine reels
        float colI = floor(vUv.x * 3.0), spinning = step(0.55, fract(uTime*0.13 + vSeed + colI*0.07));
        float y = vUv.y * 3.0 + (spinning > 0.5 ? uTime * 9.0 : floor(vSeed * 9.0 + colI));
        vec2 f = vec2(fract(vUv.x * 3.0), fract(y)); float sid = floor(hash(vec2(colI, floor(y))) * 4.0);
        c = vec3(0.96,0.94,0.88);
        vec3 sc = sid < 0.5 ? vec3(0.9,0.1,0.15) : sid < 1.5 ? vec3(1.0,0.75,0.1) : sid < 2.5 ? vec3(0.2,0.7,1.0) : vec3(0.9,0.2,0.8);
        c = mix(c, sc, step(length(f - 0.5), 0.3));
        c *= step(0.04, f.x) * step(f.x, 0.96) * 0.85 + 0.15;
      } else if (vMode < 2.5) {                // TV: an 80s show, sunset over a grid, flicker
        vec2 u = vUv; float sky = step(0.45, u.y);
        c = mix(vec3(0.3,0.05,0.4), vec3(1.0,0.45,0.3), 1.0 - u.y) * sky;
        c += vec3(1.0,0.8,0.3) * step(length((u - vec2(0.5, 0.52)) * vec2(1.6, 1.0)), 0.18) * sky * step(0.5, fract(u.y*30.0 + 0.2));
        float gy = (0.45 - u.y); vec2 gp = vec2((u.x - 0.5) / max(gy, 0.02), 1.0 / max(gy, 0.02) + uTime*2.0);
        c += (1.0 - sky) * vec3(1.0,0.2,0.8) * (step(0.95, fract(gp.x)) + step(0.9, fract(gp.y * 0.25)));
        c *= 0.9 + 0.1 * sin(u.y * 400.0 + uTime * 30.0);
      } else {                                 // lift floor indicator / plain glow
        c = vec3(1.0,0.35,0.3) * step(0.5, fract(uTime*0.5));
      }
      gl_FragColor = vec4(c, 1.0);
    }`;

  /* =====================================================================
     textures
     ===================================================================== */
  function textures(K) {
    const T = {};
    T.checker = K.tex(64, 64, (g, s) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#141418' : '#f2efe8'; g.fillRect(x * s / 2, y * s / 2, s / 2, s / 2); } });
    T.marble = K.tex(256, 256, (g, s) => {
      g.fillStyle = '#ece6dc'; g.fillRect(0, 0, s, s); U.speckle(g, s, s, 2500, ['#dcd4c6', '#f8f4ee'], .2, .6, 1, 3);
      g.strokeStyle = 'rgba(150,140,130,.35)'; g.lineWidth = 1.5;
      for (let k = 0; k < 7; k++) { g.beginPath(); let x = Math.random() * s, y = 0; g.moveTo(x, y); while (y < s) { x += U.rand(-14, 14); y += U.rand(8, 22); g.lineTo(x, y); } g.stroke(); }
      g.fillStyle = 'rgba(120,110,100,.35)'; g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s);
    });
    T.pinkMarble = K.tex(256, 256, (g, s) => {
      g.fillStyle = '#f4d4dc'; g.fillRect(0, 0, s, s); U.speckle(g, s, s, 2000, ['#e8bcc8', '#fbe8ee'], .2, .6, 1, 3);
      g.strokeStyle = 'rgba(190,120,150,.35)'; g.lineWidth = 1.5;
      for (let k = 0; k < 6; k++) { g.beginPath(); let x = Math.random() * s, y = 0; g.moveTo(x, y); while (y < s) { x += U.rand(-14, 14); y += U.rand(8, 22); g.lineTo(x, y); } g.stroke(); }
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, 3); g.fillRect(0, 0, 3, s);
    });
    T.tiles = K.tex(64, 64, (g, s) => { g.fillStyle = '#dfe6e8'; g.fillRect(0, 0, s, s); U.speckle(g, s, s, 300, ['#cfd8da', '#eef3f4'], .3, .6, 1, 2); g.fillStyle = '#b8c2c6'; g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s); });
    T.mint = K.tex(64, 64, (g, s) => { g.fillStyle = '#d7efe8'; g.fillRect(0, 0, s, s); U.speckle(g, s, s, 300, ['#c6e4db', '#e8f7f2'], .3, .6, 1, 2); g.fillStyle = '#a9cfc4'; g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s); });
    T.concrete = K.tex(128, 128, (g, s) => { g.fillStyle = '#8a8690'; g.fillRect(0, 0, s, s); U.speckle(g, s, s, 2500, ['#77737e', '#9c98a2'], .3, .7, 1, 2); });
    T.darkTile = K.tex(64, 64, (g, s) => { g.fillStyle = '#3a3642'; g.fillRect(0, 0, s, s); U.speckle(g, s, s, 400, ['#34303c', '#444050'], .3, .6, 1, 2); g.fillStyle = '#26232c'; g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s); });
    T.wood = K.tex(128, 128, (g, s) => { g.fillStyle = '#9a6a42'; g.fillRect(0, 0, s, s); for (let y = 0; y < s; y += 16) { g.fillStyle = y % 32 ? '#8e5f3a' : '#a47249'; g.fillRect(0, y, s, 15); g.fillStyle = 'rgba(40,20,10,.35)'; g.fillRect(0, y + 15, s, 1); g.fillRect((y * 37) % s, y, 1, 16); } U.speckle(g, s, s, 500, ['#7a4e30', '#b07a50'], .2, .5, 1, 3); });
    T.whiteTile = K.tex(64, 64, (g, s) => { g.fillStyle = '#f6f3ee'; g.fillRect(0, 0, s, s); U.speckle(g, s, s, 200, ['#ebe6de', '#ffffff'], .3, .6, 1, 2); g.fillStyle = '#dcd6cc'; g.fillRect(0, 0, s, 1); g.fillRect(0, 0, 1, s); });
    // casino carpet: deep red with gold diamonds
    T.casino = K.tex(128, 128, (g, s) => {
      g.fillStyle = '#6a0f1e'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#c9a04a'; g.lineWidth = 3;
      for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s], [s / 2, s / 2]]) { g.beginPath(); g.moveTo(x, y - 26); g.lineTo(x + 26, y); g.lineTo(x, y + 26); g.lineTo(x - 26, y); g.closePath(); g.stroke(); }
      g.fillStyle = '#e8c56a'; for (const [x, y] of [[s / 2, 0], [0, s / 2], [s, s / 2], [s / 2, s]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
      U.speckle(g, s, s, 600, ['#5a0c18', '#7a1426'], .3, .6, 1, 2);
    });
    // the classic 80s arcade carpet: black with neon squiggles, triangles and dots
    T.arcade = K.tex(256, 256, (g, s) => {
      g.fillStyle = '#0d0a1a'; g.fillRect(0, 0, s, s);
      const cols = ['#ff4fa3', '#3fe6e0', '#ffd84f', '#8cff6b', '#c28bff'];
      g.lineWidth = 4; g.lineCap = 'round';
      for (let k = 0; k < 26; k++) {
        const c = cols[k % cols.length], x = Math.random() * s, y = Math.random() * s; g.strokeStyle = g.fillStyle = c;
        const kind = k % 3;
        if (kind === 0) { g.beginPath(); g.moveTo(x, y); for (let i = 1; i < 5; i++) g.lineTo(x + i * 9, y + (i % 2 ? -8 : 8)); g.stroke(); }
        else if (kind === 1) { g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 9, y + 7); g.lineTo(x - 9, y + 7); g.closePath(); g.stroke(); }
        else { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
      }
    });
    T.carpetPink = K.tex(64, 64, (g, s) => { g.fillStyle = '#e88aa8'; g.fillRect(0, 0, s, s); U.speckle(g, s, s, 700, ['#d97898', '#f29ab6'], .3, .6, 1, 2); });
    T.sign = (text, sub, col, bg = '#140a1c', font = 'bold') => K.tex(512, 128, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 14; g.strokeRect(10, 10, w - 20, h - 20);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.font = `${font} ${sub ? 52 : 64}px Rubik, "Trebuchet MS", Arial, sans-serif`;
      g.fillText(text, w / 2, sub ? h / 2 - 14 : h / 2); g.shadowBlur = 4; g.fillStyle = '#fff'; g.globalAlpha = .7; g.fillText(text, w / 2, sub ? h / 2 - 14 : h / 2); g.globalAlpha = 1;
      if (sub) { g.shadowBlur = 0; g.font = '600 24px Rubik, Arial, sans-serif'; g.fillStyle = '#f5e8ff'; g.fillText(sub, w / 2, h / 2 + 32); }
    }, false);
    T.poster = (draw) => K.tex(128, 180, draw, false);
    return T;
  }

  /* =====================================================================
     places
     ===================================================================== */
  NB.buildPlaces = function (ctx) {
    const { scene, col, C, doors, hotelRoof, towerRoof, hospital, palms, mapShapes } = ctx;
    const K = makeKit(scene, col, C), T = textures(K);
    const places = [], spots = [], outdoor = [], markers = [];
    // a chair, a sofa, a bed: someone sits there now and then (chance), and when nobody does it's still a free
    // seat the hero can take (main.js: «СЕСТЬ» / «ЛЕЧЬ»)
    const freeSeats = [];
    const seat = (chance, s) => { if (Math.random() < chance) spots.push(s); else freeSeats.push(s); };
    let G = null;   // the running game, handed over in attach()
    const ORIGIN = { ammo: [1500, 1500], bank: [1600, 1500], police: [2400, 1500], hospital: [2550, 1500], firestation: [2700, 1500], dealer: [2850, 1500], arcade: [1500, 1620], diner: [1600, 1620], hotel: [1700, 1620], casino: [1800, 1620], villa: [1500, 1740], motel: [1700, 1740], fashion: [1600, 1860], prison: [1700, 1860], boxing: [1800, 1740], gym: [1900, 1740], strip: [1800, 1860], tower: [1900, 1500], airport: [2000, 1512], shop_clothes: [2100, 1500], shop_food: [2100, 1620], shop_market: [2100, 1740], home_flat: [2100, 1860], home_house: [2200, 1500], home_mansion: [2200, 1640], home_studio: [2200, 1780] };

    // an interior: its room, where you appear inside, the exit circle, lighting and music
    function interior(id, name, door, o) {
      const [ox, oz] = ORIGIN[id];
      const pl = { id, name, door, ox, oz, kind: 'interior', light: o.light, music: o.music || null, interactions: [], hudInfo: null,
        inside: { x: ox + o.inside[0], z: oz + o.inside[1], heading: o.inside[2] || 0 },
        exit: { x: ox + o.exit[0], z: oz + o.exit[1] },
        copEntry: { x: ox + o.inside[0], z: oz + o.inside[1] },
        bounds: { x0: ox + o.bounds[0], z0: oz + o.bounds[1], x1: ox + o.bounds[2], z1: oz + o.bounds[3] },
        enabled: () => true, update: null, render: null, attach: null };
      // this interior's own local-to-world helpers (the kit's origin moves on as other places are built)
      pl.X = x => ox + x; pl.Z = z => oz + z; pl.P = (x, z) => ({ x: ox + x, z: oz + z });
      // every entrance is on the room's -z wall: close it from the inside with glass doors, and start
      // the hero a few steps in so the camera has room behind them
      pl.inside.z = pl.exit.z + 2.4;
      K.at(ox, oz);
      const ex = o.exit[0], wz = o.exit[1] - .85;
      K.box(ex - 1.25, 0, wz - .12, ex + 1.25, 3.3, wz + .12, '#2a2a34', true);
      for (const s of [-1, 1]) { K.box(ex + s * .62 - .5, .15, wz + .12, ex + s * .62 + .5, 2.5, wz + .14, '#6fa8c8'); K.box(ex + s * .62 - .35, 1.05, wz + .14, ex + s * .62 + .35, 1.12, wz + .2, '#d9d9e2'); }
      K.neon(ex - 1.2, 2.65, wz + .12, ex + 1.2, 2.72, wz + .17, door && door.hex || '#ffffff', false);
      places.push(pl);
      if (door) markers.push(marker(door.x, door.y || .15, door.z, door.hex || '#ffd84f', pl, 'in'));
      markers.push(marker(pl.exit.x, .02, pl.exit.z, '#ffffff', pl, 'out'));
      return pl;
    }
    // the glowing circle at a door
    function marker(x, y, z, hex, place, dir) {
      const g = new THREE.Group(), c = new THREE.Color(hex);
      const mk = (geo, op) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); g.add(m); return m; };
      mk(new THREE.RingGeometry(.62, .8, 32).rotateX(-Math.PI / 2).translate(0, .03, 0), .9);
      mk(new THREE.CircleGeometry(.62, 32).rotateX(-Math.PI / 2).translate(0, .02, 0), .16);
      const beam = mk(new THREE.CylinderGeometry(.7, .7, 1.4, 24, 1, true).translate(0, .7, 0), .1);
      g.position.set(x, y, z); scene.add(g);
      return { x, z, g, beam, place, dir, armed: true };
    }
    const lit = (sky, ground, i) => ({ sky: C(sky), ground: C(ground), i });

    /* ---------------------------------------------------------------
       1. AMMO BAY: counter, racks of guns, a four-lane shooting range
       --------------------------------------------------------------- */
    {
      const pl = interior('ammo', 'Ammo Bay', doors.ammo, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-8, -6, 8, 20], light: lit('#f4f1ea', '#6a6470', .95) });
      K.at(pl.ox, pl.oz);
      K.room(-8, -6, 8, 20, 4.2, { wall: '#4a4450', ceil: '#2a262e', trim: '#1c1a20', neon: '#ff8a3d', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.floor(-8, -6, 8, 4, T.darkTile, 1.2); K.floor(-8, 4, 8, 20, T.concrete, 3);
      K.wallZ(4, -8, 8, 4.2, '#3a3440', [{ c: 6.3, w: 1.4, h: 2.6 }]);
      // counter with a glass top and the clerk behind it
      K.box(-6, 0, 1.5, 2, 1.02, 2.3, '#3a2a22', true); K.box(-6.05, 1.02, 1.45, 2.05, 1.1, 2.35, '#9aa2ae');
      K.neon(-6, .25, 1.44, 2, .31, 1.5, '#ff8a3d', false);
      K.box(-6, 0, 2.3, -5.4, 1.02, 3.9, '#3a2a22', true);
      spots.push(K.spot({ kind: 'guard', x: -2, z: 3.1, heading: Math.PI, mix: 'guard', home: true }));
      // racks of guns on the side walls
      const gunShape = (x, y, z, face, long) => { const L = long ? .9 : .45, d = face === '+x' ? 1 : -1; K.box(x, y, z - L / 2, x + .06 * d, y + .1, z + L / 2, '#18181c'); K.box(x, y - .15, z - L / 2 + .08, x + .06 * d, y, z - L / 2 + .18, '#18181c'); };
      for (const [x, face] of [[-7.84, '+x'], [7.84, '-x']]) {
        K.box(face === '+x' ? -7.85 : 7.75, .9, -5, face === '+x' ? -7.75 : 7.85, 3.3, 1.2, '#6b5a44');
        for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) gunShape(x + (face === '+x' ? .1 : -.1), 1.2 + r * .55, -4.2 + k * 1.5, face, (r + k) % 3 === 0);
        K.neon(face === '+x' ? -7.8 : 7.76, 3.35, -5, face === '+x' ? -7.76 : 7.8, 3.4, 1.2, '#ff8a3d', false);
      }
      K.picture('-z', -2, 2.9, 3.83, 4.4, 1.1, T.sign('AMMO BAY', 'оружие · патроны · тир', '#ff8a3d'));
      K.picture('+z', -5.5, 1.9, -5.83, 1.3, 1.8, T.poster((g, w, h) => { g.fillStyle = '#f2e6c8'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; g.beginPath(); g.arc(w / 2, 60, 26, 0, 7); g.fill(); g.fillRect(w / 2 - 34, 86, 68, 80); g.strokeStyle = '#d02030'; g.lineWidth = 5; for (const r of [20, 40, 60]) { g.beginPath(); g.arc(w / 2, 100, r, 0, 7); g.stroke(); } }), true);
      for (let z = -4; z < 4; z += 3) K.neon(-3, 4.15, z, 3, 4.19, z + .25, '#fff4e0', false);
      // shooting range: booth counter, lane dividers, a backstop and four pop-up targets
      K.box(-8, 0, 5.2, 8, 1.0, 5.8, '#5a5a62', true); K.box(-8, 1.0, 5.15, 8, 1.06, 5.85, '#8a8a94');
      for (const x of [-4, 0, 4]) K.box(x - .05, 0, 5.8, x + .05, 2.2, 7.5, '#6a6a74', true);
      K.box(-8, 0, 19.4, 8, 4.2, 19.8, '#2a2226', true);
      for (const x of [-6, -2, 2, 6]) { K.neon(x - .02, .02, 6, x + .02, .04, 19, '#ffd84f', false); K.neon(x - .6, 3.9, 5.4, x + .6, 3.95, 5.5, '#ff8a3d', false); }
      const targetTex = K.tex(128, 160, (g, w, h) => {
        g.fillStyle = '#f5efe0'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1e'; g.beginPath(); g.arc(w / 2, 40, 22, 0, 7); g.fill(); g.fillRect(w / 2 - 34, 62, 68, 90);
        g.strokeStyle = '#f5efe0'; g.lineWidth = 3; for (const r of [14, 28, 42]) { g.beginPath(); g.arc(w / 2, 96, r, 0, 7); g.stroke(); }
        g.fillStyle = '#e02a3a'; g.beginPath(); g.arc(w / 2, 96, 7, 0, 7); g.fill();
      }, false);
      const targets = [-6, -2, 2, 6].map((x, i) => {
        const pivot = new THREE.Group(); pivot.position.set(K.wx(x), .05, K.wz(17));
        const card = new THREE.Mesh(new THREE.PlaneGeometry(.9, 1.2).rotateY(Math.PI).translate(0, .95, 0), new THREE.MeshLambertMaterial({ map: targetTex }));
        const pole = new THREE.Mesh(new THREE.BoxGeometry(.06, .4, .06).translate(0, .2, 0), new THREE.MeshLambertMaterial({ color: 0x333338 }));
        pivot.add(card, pole); pivot.rotation.x = Math.PI / 2 - .05; scene.add(pivot);
        return { i, x: K.wx(x), z: K.wz(17), pivot, up: 0, want: 0, t: 0 };
      });
      const R = { on: false, t: 0, score: 0, next: 0, lent: false };
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(-2, .8), r: 1.6, short: 'КУПИТЬ', label: () => 'Магазин оружия', use: () => G.openShop() },
          { ...pl.P(0, 4.65), r: 2.8, short: 'ТИР', label: () => R.on || G.player.z < pl.Z(4.1) ? null : 'Тир · $10 · 30 секунд', use: startRange }
        ];
      };
      function startRange() {
        if (!G.money.spend(10, 'Тир')) return;
        R.on = true; R.t = 30; R.score = 0; R.next = .6;
        R.lent = G.combat.startRange();
        G.flash(R.lent ? 'Вам выдали пистолет. Стреляйте по мишеням!' : 'Стреляйте по мишеням, пока они подняты!', 2.4);
      }
      function endRange(msg) {
        R.on = false; for (const tg of targets) tg.want = 0;
        G.combat.endRange(R.lent);
        const pay = R.score * 4, best = G.progress.records.range || 0;
        if (R.score > best) G.progress.records.range = R.score;
        G.flash((msg ? msg + ' ' : '') + 'Попаданий: ' + R.score + (R.score > best ? ' — новый рекорд!' : ' · рекорд ' + best), 3);
        if (pay) G.money.add(pay, 'Приз тира'); else G.save();
      }
      // shots are checked against the raised targets
      pl.targets = {
        hitTest(ox, oy, oz, dx, dy, dz, maxT) {
          let best = null;
          for (const tg of targets) {
            if (tg.up < .8 || Math.abs(dz) < 1e-4) continue;
            const t = (tg.z - oz) / dz; if (t < 0 || t > maxT || (best && t > best.t)) continue;
            const x = ox + dx * t, y = oy + dy * t;
            if (Math.abs(x - tg.x) < .45 && y > .45 && y < 1.6) best = { t, tg };
          }
          return best;
        },
        onHit(h) { if (h.tg.want) { h.tg.want = 0; R.score++; G.audio.pickup(); } }
      };
      pl.update = (dt) => {
        for (const tg of targets) { tg.up = U.damp(tg.up, tg.want, 12, dt); tg.pivot.rotation.x = (Math.PI / 2 - .05) * (1 - tg.up); if (tg.want && (tg.t -= dt) <= 0) tg.want = 0; }
        if (!R.on) { pl.hudInfo = null; return; }
        R.t -= dt; R.next -= dt;
        if (R.next <= 0) { R.next = rand(.5, 1.1); const f = targets.filter(t => !t.want); if (f.length) { const tg = pick(f); tg.want = 1; tg.t = rand(1.4, 2.3); } }
        const p = G.player;
        if (p.z > pl.Z(5.25) || p.z < pl.Z(4.05) || G.player.dead) { endRange('Вы ушли с позиции.'); return; }
        pl.hudInfo = { tag: 'ТИР', text: 'Попаданий: ' + R.score + ' · рекорд ' + (G.progress.records.range || 0), time: '0:' + String(Math.max(0, Math.ceil(R.t))).padStart(2, '0'), warn: R.t < 5 };
        if (R.t <= 0) endRange('Время!');
      };
      pl.quiet = () => true;   // shooting in here never bothers the police
    }

    /* ---------------------------------------------------------------
       2. BANK: marble hall, teller windows, a guard and the vault
       --------------------------------------------------------------- */
    {
      const pl = interior('bank', 'Банк Неплохо Сити', doors.bank, { inside: [0, -6.4, 0], exit: [0, -7.3], bounds: [-12, -8, 12, 16], light: lit('#fff4e0', '#7a6a5a', .95), music: null });
      K.at(pl.ox, pl.oz);
      K.room(-12, -8, 12, 10, 6, { wall: '#e8dcc6', ceil: '#d8ccb6', trim: '#6a4a2a', gaps: { '-z': [{ c: 0, w: 2.2, h: 3.2 }], '+z': [{ c: 0, w: 3.4, h: 3.5 }] } });
      K.floor(-12, -8, 12, 10, T.marble, 2);
      for (const x of [-7, 7]) for (const z of [-4, 1.5]) { K.box(x - .45, 0, z - .45, x + .45, 6, z + .45, '#efe6d4', true); K.box(x - .55, 0, z - .55, x + .55, .4, z + .55, '#c9b48a'); K.box(x - .55, 5.5, z - .55, x + .55, 5.9, z + .55, '#c9b48a'); }
      // teller counter with three brass-barred windows
      K.box(-12, 0, 4.2, 9.5, 1.15, 5.0, '#5a2f22', true); K.box(-12, 1.15, 4.15, 9.55, 1.22, 5.05, '#e8e2d6');
      const windows = [-6, -1, 4];
      for (let x = -12; x < 9.5; x += .25) if (!windows.some(w => Math.abs(x + .125 - w) < 1)) K.box(x, 1.22, 4.5, x + .25, 2.7, 4.7, '#5a2f22'); else K.box(x + .1, 1.22, 4.56, x + .14, 2.7, 4.62, '#c9a04a');
      K.box(-12, 2.7, 4.45, 9.55, 2.85, 4.75, '#c9a04a'); K.solid(-12, 1.22, 4.45, 9.55, 2.85, 4.75);
      for (const x of windows) spots.push(K.spot({ kind: 'idle', x, z: 6.1, heading: Math.PI, type: pick(['business_f', 'business_m']), home: true }));
      // queue ropes, benches, customers, the guard
      for (let x = -9; x <= 7; x += 2) { K.box(x - .06, 0, 2, x + .06, .95, 2.12, '#c9a04a', true); if (x < 7) K.box(x, .8, 2.03, x + 2, .86, 2.09, '#b0203a'); }
      K.box(-11.8, 0, -6, -10.9, .6, -1, '#6a4a2a', true);
      for (const z of [-5.2, -3.6, -2]) seat(.7, K.spot({ kind: 'sit', x: -11.25, z, y: .66, heading: Math.PI / 2, mix: 'downtown' }));
      for (const x of windows) if (Math.random() < .75) spots.push(K.spot({ kind: 'idle', x, z: 3.35, heading: 0, mix: 'downtown', home: true }));
      spots.push(K.spot({ kind: 'guard', x: 9.8, z: -6.3, heading: -Math.PI / 2 - .5, type: 'security', home: true }));
      K.picture('-z', 0, 4.6, 9.83, 8, 1.3, T.sign('BANK OF NEPLOXO', 'надёжно с 1961 года', '#e8c56a', '#1d1a24'));
      for (const x of [-8, 0, 8]) { K.neon(x - 1.2, 5.9, -3, x + 1.2, 5.96, -2.6, '#fff0cc', false); K.glow(x - 1.6, 5.4, -3.4, x + 1.6, 6, -2.2, '#fff0cc', .4); }
      // the vault: round steel door in the back wall, and the strong room behind it
      K.wallZ(16.15, -4.3, 4.3, 3.6, '#5a5a62'); K.wallX(-4.15, 10, 16, 3.6, '#5a5a62'); K.wallX(4.15, 10, 16, 3.6, '#5a5a62');
      K.ceil(-4, 10.1, 4, 16, 3.59, '#3a3a40'); K.floor(-4, 10.1, 4, 16, T.concrete, 2);
      for (const x of [-3.8, 3.6]) for (let y = .4; y < 3.2; y += .5) for (let z = 10.6; z < 15.6; z += .6) K.box(x, y, z, x + .2, y + .42, z + .52, '#9a9aa4');
      K.box(-2, 0, 15.2, 2, 1.1, 15.9, '#6a6a72', true);
      for (let k = 0; k < 6; k++) K.box(-1.8 + k * .6, 1.1, 15.3, -1.4 + k * .6, 1.25, 15.8, '#e8c040');
      K.neon(-3.9, 3.4, 10.2, 3.9, 3.45, 10.3, '#ff3344', false);
      const vaultPivot = new THREE.Group(); vaultPivot.position.set(K.wx(-1.65), 0, K.wz(9.8)); scene.add(vaultPivot);
      const vdoor = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, .45, 28).rotateX(Math.PI / 2).translate(1.65, 1.75, 0), new THREE.MeshLambertMaterial({ color: 0x9aa0aa }));
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(.5, .06, 8, 20).translate(1.65, 1.75, -.3), new THREE.MeshLambertMaterial({ color: 0xd9c070 }));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .2, 12).rotateX(Math.PI / 2).translate(1.65, 1.75, -.3), new THREE.MeshLambertMaterial({ color: 0xd9c070 }));
      vaultPivot.add(vdoor, wheel, hub);
      const vaultCol = K.solid(-1.7, 0, 9.55, 1.7, 3.4, 10.1);
      const V = { robbing: false, alarmT: 0, drill: 0, open: 0, tellers: new Set(), spawned: false };
      // online the bank is robbed once for the whole server, and again 15 minutes later (server/world.js);
      // without a connection the old rule: once per player every 15 minutes
      const online = () => !!(NB.net && NB.net.connected);
      const ready = () => online() ? NB.net.lootLeft('bank') <= 0 : Date.now() - (G.progress.bankT || 0) > 15 * 60 * 1000;
      let asking = false;
      function startRobbery(then) {
        if (V.robbing) { then(); return; }
        if (!ready()) { G.flash('Банк ещё не оправился после прошлого налёта', 2.4); return; }
        if (G.combat.isMelee()) { G.flash('Для ограбления нужен ствол в руках', 2.2); G.audio.deny(); return; }
        if (asking) return;
        asking = true;
        (online() ? NB.net.loot('bank') : Promise.resolve(null)).then(r => {
          asking = false;
          if (r === false) { G.flash('Банк только что ограбил другой игрок — касса и хранилище пустые', 3); G.audio.deny(); return; }
          if (V.robbing) { then(); return; }
          V.robbing = true; V.alarmT = 60; V.drill = 8; V.tellers.clear(); V.spawned = false;
          G.progress.bankT = Date.now(); G.save();
          G.police.robbery(); G.crowd.panic(pl.X(0), pl.Z(0), 40, true);
          G.flash('Ограбление! Сработала сигнализация — полиция уже едет', 3);
          then();
        });
      }
      pl.attach = () => {
        pl.interactions = windows.map((x, i) => ({ ...pl.P(x, 3.3), r: 1.25, short: 'ГРАБИТЬ',
          label: () => (V.tellers.has(i) || (!V.robbing && !ready())) ? null : 'Ограбить кассу',
          use: () => startRobbery(() => { if (V.tellers.has(i)) return; V.tellers.add(i); G.money.add(Math.round(rand(250, 420)), 'Касса'); }) }));
        pl.interactions.push({ ...pl.P(0, 8.9), r: 1.7, short: 'ВЗЛОМ',
          label: () => V.open > 0 || V.drilling ? null : !V.robbing && !ready() ? null : 'Взломать хранилище',
          use: () => startRobbery(() => { if (V.drilling || V.open > 0) return; V.drilling = true; G.flash('Взлом хранилища… держитесь рядом с дверью', 2.2); }) });
      };
      pl.update = (dt) => {
        const p = G.player, nearVault = Math.hypot(p.x - pl.X(0), p.z - pl.Z(8.9)) < 2.6;
        if (V.drilling) {
          if (nearVault && !p.dead) V.drill -= dt;
          pl.hudInfo = { tag: 'ВЗЛОМ', text: nearVault ? 'Взлом хранилища…' : 'Вернитесь к двери хранилища!', time: Math.ceil(Math.max(0, V.drill)) + ' с', warn: !nearVault };
          if (V.drill <= 0) {
            V.drilling = false; V.open = .001; pl.hudInfo = null; vaultCol.maxY = -1; G.audio.impact(10);
            for (let k = 0; k < 6; k++) G.combat.dropCash(pl.X(rand(-2.6, 2.6)), pl.Z(rand(11, 14.5)), Math.round(rand(320, 620)));
            G.flash('Хранилище открыто! Хватайте деньги и уходите', 3);
          }
        } else pl.hudInfo = null;
        if (V.open > 0 && V.open < 1) { V.open = Math.min(1, V.open + dt * .5); vaultPivot.rotation.y = -1.9 * (1 - Math.pow(1 - V.open, 3)); wheel.rotation.z += dt * 6; }
        if (V.robbing) { V.alarmT -= dt; if (V.alarmT <= 0) V.robbing = false; }
      };
      pl.alarm = () => V.robbing && V.alarmT > 0;
      pl.onLeave = () => { if (!V.robbing && V.open >= 1) { V.open = 0; vaultPivot.rotation.y = 0; vaultCol.maxY = 3.4; } V.drilling = false; };
    }

    /* ---------------------------------------------------------------
       the city services' buildings: the police station, the hospital, the fire station.
       Each is a real workplace: the boss's office (get hired, quit), the locker room (start and end a shift)
       and the rooms where the work goes on. Shared bits first.
       --------------------------------------------------------------- */
    // a doorway in a partition wall
    const DW = c => ({ c, w: 1.5, h: 2.5 });
    // a small sign over a doorway or on a wall
    const doorSign = (face, x, y, z, text, hex, bg) => K.picture(face, x, y, z, 2.2, .55, T.sign(text, null, hex, bg || '#0e1628'));
    // a heart monitor's screen
    const ecgTex = K.tex(128, 80, (g, w, h) => {
      g.fillStyle = '#04140c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3dff8a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, 46);
      for (let x = 0; x < w; x += 32) { g.lineTo(x + 10, 46); g.lineTo(x + 13, 40); g.lineTo(x + 16, 52); g.lineTo(x + 19, 12); g.lineTo(x + 22, 62); g.lineTo(x + 25, 46); g.lineTo(x + 32, 46); }
      g.stroke(); g.fillStyle = '#3dff8a'; g.font = 'bold 14px Arial'; g.fillText('♥ 72', 6, 16); g.fillStyle = '#4fc8ff'; g.fillText('SpO2 98', 64, 16);
    }, false);
    // a desk with a computer (the screen looks at whoever sits at +z of it when dir = 1, at -z when dir = -1)
    function computerDesk(x, z, dir, top) {
      K.box(x - 1.1, 0, z - .4, x + 1.1, .76, z + .4, top || '#d8d0c0', true);
      K.box(x - .32, .76, z - dir * .08 - .03, x + .32, 1.2, z - dir * .08 + .03, '#1e2228');
      K.screen(dir > 0 ? '+z' : '-z', x, .99, z - dir * .08 + dir * .035, .56, .36, 2);
      K.box(x - .3, .76, z + dir * .15, x + .3, .78, z + dir * .3, '#2a2a30');
    }
    // a chair; seat 0.6 high
    const chair = (x, z, hex) => { K.box(x - .25, 0, z - .25, x + .25, .6, z + .25, hex || '#2a3a52'); };
    // a hospital bed along z, its head at +z, someone lying in it now and then; an IV stand and a monitor beside it
    function hospitalBed(bx, cz, side, chance) {
      K.box(bx - .55, 0, cz - 1.05, bx + .55, .5, cz + 1.05, '#c9ced4', true); K.box(bx - .5, .5, cz - 1, bx + .5, .62, cz + 1, '#ffffff');
      K.box(bx - .5, .62, cz + .5, bx + .5, .72, cz + .95, '#dfe8f4'); K.box(bx - .55, .5, cz + 1, bx + .55, 1.1, cz + 1.08, '#9aa4b0');
      K.box(bx - .5, .62, cz - .95, bx + .5, .66, cz + .2, '#8fc8e8');
      const sx = bx + side * .85;
      K.box(sx - .03, 0, cz + .6, sx + .03, 1.9, cz + .66, '#c8ccd4'); K.box(sx - .1, 1.55, cz + .58, sx + .1, 1.85, cz + .68, '#e8f4ff');
      K.box(sx - .2, 0, cz + 1.0, sx + .2, 1.0, cz + 1.3, '#8a929e'); K.picture('-z', sx, 1.18, cz + .99, .36, .24, ecgTex);
      seat((chance == null ? .75 : chance), K.spot({ kind: 'lie', x: bx, z: cz - .9, y: .74, heading: 0, type: pick(['elderly', 'tourist_m', 'business_m', 'tourist_f', 'beach_m']) }));
    }
    // a row of lockers against a wall at x (face: +1 opens to +x)
    function lockerRow(x, z0, z1, face, hex) {
      for (let z = z0; z < z1 - .4; z += .9) {
        K.box(face > 0 ? x : x - .6, 0, z, face > 0 ? x + .6 : x, 2.3, z + .85, hex, true);
        const fx = face > 0 ? x + .61 : x - .61;
        K.box(Math.min(fx, fx + face * .02), 1.6, z + .3, Math.max(fx, fx + face * .02), 1.9, z + .55, '#2a3a4a');
      }
    }

    /* ---------------------------------------------------------------
       3. POLICE STATION, three rows of rooms:
          front:  locker room · lobby with the desk sergeant · holding cells
          middle: the chief's office · the detectives' room · interrogation with a one-way mirror
          back:   break room · armoury
       --------------------------------------------------------------- */
    {
      const H = 4, WALL = '#bcc6d4';
      const pl = interior('police', 'Полицейский участок', doors.police, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-20, -6, 20, 26], light: lit('#e8f0ff', '#50586a', .9) });
      K.at(pl.ox, pl.oz);
      K.room(-20, -6, 20, 26, H, { wall: '#c9d2de', ceil: '#b8c2ce', trim: '#2f5fb0', neon: '#3f8cff', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.wallX(-8, -6, 6, H, WALL, [DW(2)]); K.wallX(8, -6, 6, H, WALL, [DW(-3)]);
      K.wallZ(6, -20, 20, H, WALL, [DW(0)]);
      K.wallX(-8, 6, 16, H, WALL, [DW(11)]); K.wallX(8, 6, 16, H, WALL, [DW(9)]);
      K.wallZ(16, -20, 20, H, WALL, [DW(-4), DW(4)]); K.wallX(0, 16, 26, H, WALL);
      K.floor(-8, -6, 8, 6, T.tiles, 1.5); K.floor(8, -6, 20, 6, T.concrete, 2.5); K.floor(-20, -6, -8, 6, T.tiles, 1.2);
      K.floor(-20, 6, -8, 16, T.wood, 2); K.floor(-8, 6, 14, 16, T.darkTile, 1.4); K.floor(14, 6, 20, 16, T.concrete, 2.5);
      K.floor(-20, 16, 0, 26, T.whiteTile, 1.2); K.floor(0, 16, 20, 26, T.concrete, 2.5);
      for (const [x, z] of [[0, 0], [-14, 0], [14, -3], [-14, 11], [0, 11], [-10, 21], [10, 21]]) K.neon(x - 1.5, H - .04, z - .15, x + 1.5, H - .01, z + .15, '#f4f8ff', false);

      // the lobby: the desk sergeant behind his counter, a bench, wanted posters, signs to every door
      K.box(-6.5, 0, 1.5, -1.5, 1.15, 2.4, '#2f3a52', true); K.box(-6.55, 1.15, 1.45, -1.45, 1.22, 2.45, '#dfe6ee'); K.box(-6.5, 1.22, 2.3, -1.5, 1.7, 2.4, '#2f3a52');
      K.neon(-6.5, .3, 1.44, -1.5, .36, 1.5, '#3f8cff', false);
      computerDesk(-4.6, 2.9, 1, '#3a4660');
      spots.push(K.spot({ kind: 'idle', x: -4.6, z: 3.8, heading: Math.PI, type: 'cop', home: true }));
      spots.push(K.spot({ kind: 'guard', x: 6.6, z: -4.6, heading: -Math.PI * .75, type: 'cop', home: true }));
      K.box(-7.8, 0, -5, -7.2, .6, -.5, '#5a6478', true);
      for (const z of [-4.2, -2.6, -1.2]) seat(.6, K.spot({ kind: 'sit', x: -7.5, z, y: .66, heading: Math.PI / 2, mix: 'town', home: true }));
      K.picture('-z', 0, 3.25, 5.83, 3.6, .8, T.sign('NEPLOXO CITY PD', 'служить и защищать', '#3f8cff', '#0e1628'));
      const wanted = n => T.poster((g, w, h) => { g.fillStyle = '#f0e6c8'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('WANTED', w / 2, 26); g.fillStyle = ['#c98f65', '#8d5a36', '#e8b890'][n]; g.fillRect(w / 2 - 26, 40, 52, 60); g.fillStyle = '#2a1c14'; g.fillRect(w / 2 - 28, 36, 56, 16); g.fillStyle = '#222'; g.font = 'bold 18px Arial'; g.fillText('$' + (n + 1) * 500, w / 2, 130); });
      for (let k = 0; k < 3; k++) K.picture('-x', 7.83, 2.1, 1 + k * 1.4, 1, 1.4, wanted(k), true);
      doorSign('+x', -7.83, 3.1, 2, '← РАЗДЕВАЛКА', '#8fd0ff'); doorSign('-x', 7.83, 3.1, -3, 'КАМЕРЫ →', '#8fd0ff');
      doorSign('-z', 0, 2.75, 5.83, '↑ ОТДЕЛ · НАЧАЛЬНИК', '#ffd84f');

      // holding cells in the east wing: three cells behind bars, a guard
      for (const x of [12, 16]) K.wallX(x, 1, 6, H, '#9aa2ae');
      for (let x = 8.2; x < 20; x += .24) K.box(x, 0, .95, x + .06, 3, 1.02, '#3a3a44');
      K.solid(8.15, 0, .9, 20, 3, 1.05); K.box(8.15, 3, .9, 20, 3.12, 1.05, '#3a3a44');
      for (const cx of [10.1, 14, 18]) {
        K.box(cx - 1.4, 0, 4.9, cx + 1.4, .6, 5.8, '#6a6a74', true); K.box(cx + 1.1, 0, 1.4, cx + 1.6, .45, 1.9, '#d8d8d8');
        seat(.8, K.spot({ kind: 'sit', x: cx + rand(-.8, .8), z: 5.3, y: .66, heading: Math.PI, type: 'prisoner', home: true }));
      }
      spots.push(K.spot({ kind: 'guard', x: 18.5, z: -3.8, heading: Math.PI * .75, type: 'cop', home: true }));
      K.box(9, 0, -5.8, 11, .76, -5, '#5a6478', true); chair(10, -4.5);

      // the locker room in the west wing: lockers along two walls, benches, a mirror
      lockerRow(-19.85, -5.4, 5.6, 1, '#4f6a8a');
      for (let x = -18.6; x < -9.5; x += .9) { K.box(x, 0, -5.85, x + .85, 2.3, -5.25, '#4f6a8a', true); K.box(x + .3, 1.6, -5.24, x + .55, 1.9, -5.22, '#2a3a4a'); }
      for (const z of [-2, 2.6]) K.box(-15, 0, z - 1.4, -14.4, .5, z + 1.4, '#8a6a4a', true);
      K.picture('-z', -12, 1.7, 5.83, 2.4, 1.2, K.tex(64, 64, (g, s) => { g.fillStyle = '#b8d4e8'; g.fillRect(0, 0, s, s); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(8, 0, 10, s); }, false));
      K.picture('-z', -16.5, 3.1, 5.83, 3, .6, T.sign('РАЗДЕВАЛКА', null, '#8fd0ff', '#0e1628'));
      seat(.6, K.spot({ kind: 'sit', x: -14.7, z: -2.4, y: .56, heading: Math.PI / 2, type: 'cop', home: true }));

      // the chief's office: a big desk, the chief behind it, flags, books, the president on the wall
      K.box(-17.2, 0, 12.1, -11.8, .78, 13, '#5a3a24', true); K.box(-17.25, .78, 12.05, -11.75, .84, 13.05, '#3a2414');
      K.box(-14.9, 0, 13.4, -14.1, .6, 14.2, '#2a1a14'); K.box(-14.9, .6, 14.05, -14.1, 1.5, 14.2, '#2a1a14');
      spots.push(K.spot({ kind: 'sit', x: -14.5, z: 13.75, y: .66, heading: Math.PI, type: 'cop', home: true }));
      K.box(-15.6, .84, 12.3, -15, .87, 12.7, '#f2f2f2'); K.box(-13.2, .84, 12.4, -12.7, 1.05, 12.6, '#ffd84f');
      chair(-15.6, 10.6, '#6a2a2a'); chair(-13.4, 10.6, '#6a2a2a');
      K.box(-19.9, 0, 7, -19.4, 2.7, 10.8, '#5a3a24', true);
      for (let y = .4; y < 2.6; y += .55) for (let z = 7.1; z < 10.6; z += .22) K.box(-19.4, y, z, -19.2, y + .4 * (.7 + Math.random() * .3), z + .18, pick(['#8a2a2a', '#2a4a8a', '#2a6a3a', '#c9a04a', '#3a3a3a']));
      for (const [x, hex] of [[-19, '#3f8cff'], [-10, '#f2f2f2']]) { K.box(x - .04, 0, 15.2, x + .04, 2.6, 15.28, '#c9a04a'); K.box(x + .04, 1.7, 15.22, x + 1.1, 2.5, 15.26, hex); }
      K.picture('-z', -14.5, 2.75, 15.83, 2.8, 1.1, T.sign('LEHA NEPLOXO', 'президент мира', '#ffd84f', '#101820'));
      doorSign('+x', -7.83, 3.1, 11, '← НАЧАЛЬНИК', '#ffd84f');

      // the detectives' room: four desks with computers, a board with the case on it
      for (const [x, z] of [[-4.5, 8.6], [4.5, 8.6], [-4.5, 12.6], [4.5, 12.6]]) {
        computerDesk(x, z, 1); chair(x, z + .95);
        seat(.7, K.spot({ kind: 'sit', x, z: z + .95, y: .66, heading: Math.PI, type: 'cop', home: true }));
      }
      K.picture('-z', 0, 2, 15.83, 3, 1.5, K.tex(256, 128, (g, w, h) => {
        g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8a070'; g.fillRect(0, 0, w, 6);
        const pins = [[30, 30], [110, 22], [200, 40], [60, 90], [160, 95]];
        g.strokeStyle = '#d02030'; g.lineWidth = 2; g.beginPath(); pins.forEach(([x, y], i) => i ? g.lineTo(x + 14, y + 16) : g.moveTo(x + 14, y + 16)); g.stroke();
        for (const [x, y] of pins) { g.fillStyle = '#e8e0d0'; g.fillRect(x, y, 28, 32); g.fillStyle = '#5a4a3a'; g.fillRect(x + 8, y + 6, 12, 14); g.fillStyle = '#d02030'; g.beginPath(); g.arc(x + 14, y + 2, 3, 0, 7); g.fill(); }
        g.fillStyle = '#222'; g.font = 'bold 16px Arial'; g.fillText('ДЕЛО № 21', 92, 120);
      }), true);
      doorSign('-x', 7.83, 3.1, 9, 'ДОПРОСНАЯ →', '#8fd0ff');
      doorSign('-z', -4, 3.1, 15.83, '↑ ОТДЫХ', '#8fd0ff'); doorSign('-z', 4, 3.1, 15.83, '↑ ОРУЖЕЙНАЯ', '#8fd0ff');

      // interrogation: the observation room looks through a one-way mirror at a table, a lamp, a suspect
      K.wallX(14, 6, 16, H, WALL, [{ c: 7.2, w: 1.3, h: 2.5 }, { c: 11, w: 3.6, h: 2.3 }]);
      K.box(13.85, 0, 9.2, 14.15, 1, 12.8, WALL, true); K.solid(13.85, 1, 9.2, 14.15, 2.3, 12.8);
      { const m = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.3, 3.6), new THREE.MeshBasicMaterial({ color: 0x2a3440, transparent: true, opacity: .45, depthWrite: false }));
        m.position.set(K.wx(14), 1.65, K.wz(11)); scene.add(m); }
      K.box(9, 0, 10, 10.2, .76, 12, '#4a4a52', true); K.box(9.3, .76, 10.6, 9.8, .9, 11, '#1a1a1e');
      spots.push(K.spot({ kind: 'idle', x: 12.8, z: 11.4, heading: Math.PI / 2, type: 'cop', home: true }));
      K.box(16.2, 0, 10.4, 17.8, .76, 11.6, '#6a6a70', true); chair(17, 12.3, '#4a4a52'); chair(17, 9.7, '#4a4a52');
      K.box(16.95, 2.6, 10.95, 17.05, H, 11.05, '#2a2a2a'); K.neon(16.7, 2.45, 10.7, 17.3, 2.6, 11.3, '#fff2c8');
      spots.push(K.spot({ kind: 'sit', x: 17, z: 12.3, y: .66, heading: Math.PI, type: 'prisoner', home: true }));
      seat(.8, K.spot({ kind: 'sit', x: 17, z: 9.7, y: .66, heading: 0, type: 'cop', home: true }));
      doorSign('-x', 13.83, 3.1, 7.2, 'ДОПРОС', '#ff6a6a');

      // the break room: a sofa and a TV, a kitchen corner with coffee, a table of doughnuts
      K.box(-16, 0, 24.9, -10, .45, 25.9, '#3a4a6a', true); K.box(-16, .45, 25.55, -10, 1.15, 25.9, '#34425e');
      for (const x of [-15, -13, -11]) seat(.6, K.spot({ kind: 'sit', x, z: 25.2, y: .51, heading: Math.PI, type: 'cop', home: true }));
      K.box(-14.4, 0, 18, -11.6, .6, 18.5, '#2a2a30', true); K.box(-14.2, .6, 18.15, -11.8, 2.1, 18.25, '#141418'); K.screen('+z', -13, 1.35, 18.27, 2.3, 1.35, 2);
      K.box(-19.9, 0, 17, -19.2, .95, 22.5, '#e8e8ec', true); K.box(-19.85, .95, 18, -19.4, 1.4, 18.5, '#1a1a1e'); K.box(-19.85, .95, 19.5, -19.45, 1.3, 20.2, '#c0c0c8');
      K.box(-19.9, 0, 23.2, -19.1, 2, 24.3, '#f0f0f2', true);
      K.box(-6.5, 0, 19.8, -3.5, .75, 21.8, '#d8c8a8', true);
      for (let k = 0; k < 6; k++) K.box(-6 + (k % 3) * .9, .75, 20.3 + (k > 2 ? .8 : 0), -5.75 + (k % 3) * .9, .83, 20.55 + (k > 2 ? .8 : 0), pick(['#ff9ac8', '#c8743a', '#f2e0b0']));
      for (const [x, z, h] of [[-5, 19.2, 0], [-5, 22.4, Math.PI]]) { chair(x, z); seat(.5, K.spot({ kind: 'sit', x, z, y: .66, heading: h, type: 'cop', home: true })); }

      // the armoury: a counter behind a cage, the quartermaster, racks of guns, ammo crates
      K.box(.15, 0, 20, 19.85, 1.05, 20.8, '#3a4250', true); K.box(.15, 1.05, 19.95, 19.85, 1.1, 20.85, '#8a8a94');
      for (let x = .3; x <= 19.7; x += .3) if (x < 7 || x > 9) K.box(x, 1.1, 20.35, x + .04, H - .05, 20.4, '#5a5a62');
      K.solid(.15, 1.1, 20.3, 19.85, H, 20.45);
      spots.push(K.spot({ kind: 'idle', x: 8, z: 21.6, heading: Math.PI, type: 'cop', home: true }));
      for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) { const x = 2.4 + k * 1.4; K.box(x, 1 + r * .7, 25.75, x + (k % 3 ? .55 : .95), 1.1 + r * .7, 25.85, '#18181c'); }
      K.box(1.5, .9, 25.85, 15, 3.2, 25.95, '#6b5a44');
      for (const [x, z] of [[16, 22], [17.2, 22], [16.6, 23.4], [16, 24.8], [17.4, 24.8]]) K.box(x - .5, 0, z - .4, x + .5, .55, z + .4, '#4a5a32', true);
      K.picture('-z', 8, 3.4, 25.83, 3.2, .6, T.sign('ОРУЖЕЙНАЯ', null, '#ff8a3d', '#1a1210'));

      let warnT = 0;
      const job = () => G.jobs && G.jobs.job === 'police', on = () => G.jobs && G.jobs.duty === 'police';
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(-4, .8), r: 1.6, short: 'ДЕЖУРНЫЙ', label: () => 'Поговорить с дежурным', use: () => G.ui.menu({ eyebrow: 'Полицейский участок', title: 'Дежурный', items: () => [
            { name: 'Оплатить штраф', desc: 'Снять розыск: $500 за каждую звезду', price: G.police.wanted * 500, label: 'Оплатить', disabled: G.police.wanted ? '' : 'Вас не разыскивают', buy: () => { G.police.clear(); return 'Розыск снят. Больше не нарушайте!'; } },
            { name: 'Работа в полиции', desc: 'Устроиться или уволиться — у начальника: прямо через дверь за стойкой, в отделе налево. Смена — в раздевалке (слева от входа)', price: 0, disabled: 'Понятно', buy: () => '' },
            { name: 'Оружейная', desc: 'Табельное оружие на смену — в дальней комнате справа', price: 0, disabled: 'Понятно', buy: () => '' }
          ] }) },
          { ...pl.P(-18.2, 0), r: 2.4, short: 'СМЕНА', label: () => on() ? 'Раздевалка: закончить смену' : job() ? 'Раздевалка: начать смену' : 'Раздевалка (для сотрудников)', use: () => G.jobs.locker('police') },
          { ...pl.P(-14.5, 11.2), r: 1.8, short: 'НАЧАЛЬНИК', label: () => job() ? 'Начальник участка: ваша служба · уволиться' : 'Начальник участка: устроиться на работу', use: () => G.jobs.boss('police') },
          { ...pl.P(8, 19.3), r: 1.8, short: 'ОРУЖИЕ', label: () => 'Оружейная: табельное оружие', use: () => G.jobs.armoury() }
        ];
      };
      // walking around the station with a gun out gets you in trouble
      pl.update = (dt) => {
        const armed = !G.combat.isMelee() && G.progress.outfit !== 'cop' && G.police.wanted === 0;
        if (!armed) { warnT = 0; return; }
        if (warnT === 0) G.flash('Дежурный: «Эй! Уберите оружие!»', 2.5);
        warnT += dt;
        if (warnT > 3.5) { warnT = 0; G.police.reportCrime('punch', G.player.x, G.player.z); }
      };
    }

    /* ---------------------------------------------------------------
       4. HOSPITAL, three rows of rooms:
          front:  emergency (beds behind curtains) · reception hall with the lift to the roof · the doctors' room (lockers)
          middle: ward 1 · the nurses' post · ward 2
          back:   operating theatre · the head doctor's office · X-ray and lab
       --------------------------------------------------------------- */
    let hospLift = null;
    {
      const H = 3.8, WALL = '#e2eaec';
      const pl = interior('hospital', 'Больница', doors.hospital, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-20, -6, 20, 26], light: lit('#f2fbff', '#6a7a80', 1.0) });
      K.at(pl.ox, pl.oz);
      K.room(-20, -6, 20, 26, H, { wall: '#eef3f4', ceil: '#e2e8ea', trim: '#3aa88a', neon: '#6bffd0', gaps: { '-z': [{ c: 0, w: 1.8, h: 2.6 }] } });
      K.wallX(-8, -6, 6, H, WALL, [DW(2)]); K.wallX(8, -6, 6, H, WALL, [DW(2)]);
      K.wallZ(6, -20, 20, H, WALL, [DW(0)]);
      K.wallX(-8, 6, 16, H, WALL, [DW(11)]); K.wallX(8, 6, 16, H, WALL, [DW(11)]);
      K.wallZ(16, -20, 20, H, WALL, [DW(-4), DW(4), DW(15)]); K.wallX(0, 16, 26, H, WALL); K.wallX(10, 16, 26, H, WALL);
      K.floor(-20, -6, 20, 16, T.mint, 1.2); K.floor(-20, 16, 0, 26, T.whiteTile, 1); K.floor(0, 16, 10, 26, T.wood, 2); K.floor(10, 16, 20, 26, T.tiles, 1.2);
      for (const [x, z] of [[0, 0], [-14, 0], [14, 0], [-14, 11], [0, 11], [14, 11], [5, 21], [15, 21]]) K.neon(x - 1.5, H - .04, z - .15, x + 1.5, H - .01, z + .15, '#f4fffc', false);

      // reception: the nurse's counter, waiting chairs, the lift up to the helipad
      K.box(-6.5, 0, 0, -1, 1.1, .9, '#f6f8f8', true); K.box(-6.55, 1.1, -.05, -.95, 1.18, .95, '#3aa88a'); K.box(-6.5, .4, -.02, -1, .55, 0, '#e02a3a');
      computerDesk(-5.2, 1.6, 1, '#e8eef0');
      spots.push(K.spot({ kind: 'idle', x: -3.6, z: 1.9, heading: Math.PI, type: 'medic', home: true }));
      for (let z = -4.6; z < 0; z += .8) { K.box(7.2, 0, z - .3, 7.8, .6, z + .3, '#5ab0d0', true); K.box(7.8, .6, z - .3, 7.95, 1.2, z + .3, '#5ab0d0'); seat(.55, K.spot({ kind: 'sit', x: 7.5, z, y: .66, heading: -Math.PI / 2, type: pick(['elderly', 'tourist_m', 'tourist_f']), home: true })); }
      K.picture('-z', 0, 3.1, 5.83, 3.4, .75, T.sign('NEPLOXO GENERAL', 'приёмный покой', '#3aa88a', '#f4fbfa'));
      K.picture('-z', -4, 2.3, 5.83, 1.1, 1.1, K.tex(128, 128, (g, s) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); g.fillStyle = '#e02a3a'; g.fillRect(s * .38, s * .12, s * .24, s * .76); g.fillRect(s * .12, s * .38, s * .76, s * .24); }, false));
      K.box(4.6, 0, -5.99, 6.4, 2.6, -5.86, '#b8bcc8'); K.box(5.48, 0, -5.86, 5.52, 2.6, -5.83, '#7a7e8a'); K.neon(4.5, 2.6, -5.9, 6.5, 2.7, -5.83, '#6bffd0');
      K.picture('+z', 5.5, 3.05, -5.83, 1.6, .35, T.sign('ВЕРТОЛЁТ ↑', null, '#6bffd0', '#10201c'));
      hospLift = { x: pl.X(5.5), z: pl.Z(-4.6) };
      doorSign('+x', -7.83, 3.1, 2, '← ПРИЁМНОЕ', '#3aa88a', '#f4fbfa'); doorSign('-x', 7.83, 3.1, 2, 'ОРДИНАТОРСКАЯ →', '#3aa88a', '#f4fbfa');
      doorSign('-z', 0, 2.75, 5.83, '↑ ПАЛАТЫ · ГЛАВВРАЧ', '#3aa88a', '#f4fbfa');

      // emergency: three beds behind curtains, a doctor on his rounds
      for (const cz of [-3.6, 0, 3.6]) { hospitalBed(-18.4, cz, 1, .7); K.box(-19.9, 0, cz + 1.5, -16.4, 2.4, cz + 1.54, '#a8d0e8'); }
      spots.push(K.spot({ kind: 'idle', x: -15.6, z: .4, heading: -Math.PI / 2, type: 'medic', home: true }));
      K.box(-9.4, 0, -5.8, -8.4, 1.0, -4.6, '#d8dee4', true); K.box(-9.3, 1.0, -5.6, -8.5, 1.05, -4.8, '#8ab8d8');
      K.picture('+x', -19.83, 3, 0, 4, .6, T.sign('ПРИЁМНОЕ ОТДЕЛЕНИЕ', null, '#e02a3a', '#fff4f4'));

      // the doctors' room: lockers (the shift starts here), a sofa, a coffee table
      lockerRow(19.85, -5.4, 5.6, -1, '#3aa88a');
      K.box(10, 0, -5.9, 15, .45, -5, '#4a7a8a', true); K.box(10, .45, -5.9, 15, 1.1, -5.6, '#426e7c');
      K.box(11.4, 0, -3.8, 13.6, .45, -2.8, '#d8c8a8', true); K.box(11.8, .45, -3.5, 12.1, .6, -3.2, '#f2f2f2');
      for (const x of [11, 13.6]) seat(.6, K.spot({ kind: 'sit', x, z: -5.3, y: .51, heading: 0, type: 'medic', home: true }));
      K.picture('-z', 14, 3, 5.83, 3.4, .6, T.sign('ОРДИНАТОРСКАЯ', null, '#3aa88a', '#f4fbfa'));

      // two wards of four beds; the nurses' post between them
      for (const [x0, x1, n] of [[-20, -8, 1], [8, 20, 2]]) {
        for (const bx of [x0 + 1.6, x1 - 1.6]) for (const cz of [8.4, 13.4]) hospitalBed(bx, cz, bx < (x0 + x1) / 2 ? 1 : -1);
        K.picture(n === 1 ? '+x' : '-x', n === 1 ? -19.83 : 19.83, 2.6, 11, 1.6, .9, T.poster((g, w, h) => { g.fillStyle = '#9ad0e8'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2d06a'; g.beginPath(); g.arc(w * .7, h * .3, 18, 0, 7); g.fill(); g.fillStyle = '#4a9a5a'; g.fillRect(0, h * .65, w, h); }), true);
        if (Math.random() < .7) spots.push(K.spot({ kind: 'idle', x: (x0 + x1) / 2, z: 11, heading: n === 1 ? -Math.PI / 2 : Math.PI / 2, type: 'medic', home: true }));
      }
      doorSign('+x', -7.83, 3.1, 11, '← ПАЛАТА 1', '#3aa88a', '#f4fbfa'); doorSign('-x', 7.83, 3.1, 11, 'ПАЛАТА 2 →', '#3aa88a', '#f4fbfa');
      K.box(-3, 0, 11, 3, 1.05, 11.8, '#f6f8f8', true); K.box(-3.05, 1.05, 10.95, 3.05, 1.12, 11.85, '#3aa88a'); K.box(-3, 0, 11.8, -2.2, 1.05, 13.6, '#f6f8f8', true);
      computerDesk(0, 12.5, 1, '#e8eef0');
      spots.push(K.spot({ kind: 'idle', x: 1.6, z: 13.3, heading: Math.PI, type: 'medic', home: true }));
      for (let z = 7; z < 10; z += .8) { K.box(-7.8, 0, z - .3, -7.2, .6, z + .3, '#5ab0d0', true); seat(.4, K.spot({ kind: 'sit', x: -7.5, z, y: .66, heading: Math.PI / 2, type: pick(['elderly', 'tourist_f', 'business_m']), home: true })); }
      for (const x of [-7.3, 7.3]) { K.box(x - .3, 0, 15.2, x + .3, .5, 15.7, '#8a6a4a', true); K.box(x - .35, .5, 15.15, x + .35, 1.4, 15.75, '#3a9a4a'); }
      doorSign('-z', -4, 3.1, 15.83, 'ОПЕРАЦИОННАЯ', '#ff4f4f', '#fff4f4'); doorSign('-z', 4, 3.1, 15.83, 'ГЛАВВРАЧ', '#3aa88a', '#f4fbfa');
      K.neon(-4.8, 2.6, 15.8, -3.2, 2.7, 15.84, '#ff2233');

      // the operating theatre: a table under a big lamp, surgeons round it, monitors, a trolley of instruments
      K.box(-10.5, 0, 20, -9.5, .85, 22.1, '#8a929e', true); K.box(-10.55, .85, 19.9, -9.45, .95, 22.2, '#7ac0d8');
      spots.push(K.spot({ kind: 'lie', x: -10, z: 20.15, y: .97, heading: 0, type: pick(['tourist_m', 'business_m', 'beach_m']), home: true }));
      K.box(-10.05, 2.9, 20.95, -9.95, H, 21.05, '#c8ccd4'); K.box(-11, 2.75, 20.3, -9, 2.9, 21.8, '#e8ecf0'); K.neon(-10.8, 2.7, 20.5, -9.2, 2.75, 21.6, '#ffffff');
      for (const [x, z, h] of [[-11.6, 21, Math.PI / 2], [-8.4, 21, -Math.PI / 2], [-10, 23.2, Math.PI]]) spots.push(K.spot({ kind: 'idle', x, z, heading: h, type: 'medic', home: true }));
      for (const z of [19.4, 22.6]) { K.box(-13.6, 0, z - .3, -13, 1.3, z + .3, '#8a929e', true); K.picture('+x', -12.98, 1.6, z, .7, .45, ecgTex); }
      K.box(-7.8, 0, 19.2, -6.8, .9, 20, '#c8ccd4', true); for (let k = 0; k < 5; k++) K.box(-7.7 + k * .18, .9, 19.4, -7.6 + k * .18, .93, 19.8, '#e8ecf0');
      K.box(-19.9, 0, 17, -19.3, 1.9, 25, '#dfe6ea', true); K.box(-19.3, 1, 18, -19.28, 1.8, 24, '#a8c8d8');
      K.picture('-z', -10, 3, 25.83, 3.4, .6, T.sign('ОПЕРАЦИОННАЯ', null, '#ff4f4f', '#fff4f4'));

      // the head doctor's office
      K.box(2.8, 0, 22.1, 7.2, .78, 23, '#6a4a2a', true); K.box(2.75, .78, 22.05, 7.25, .84, 23.05, '#4a3020');
      K.box(4.6, 0, 23.4, 5.4, .6, 24.2, '#2a2a30'); K.box(4.6, .6, 24.05, 5.4, 1.5, 24.2, '#2a2a30');
      spots.push(K.spot({ kind: 'sit', x: 5, z: 23.75, y: .66, heading: Math.PI, type: 'medic', home: true }));
      K.box(3.2, .84, 22.3, 3.8, .87, 22.7, '#f2f2f2'); K.box(6.2, .84, 22.4, 6.6, 1.1, 22.6, '#3aa88a');
      chair(4, 20.6, '#3a6a6a'); chair(6, 20.6, '#3a6a6a');
      K.box(.2, 0, 17, .7, 2.6, 21, '#6a4a2a', true);
      for (let y = .4; y < 2.5; y += .55) for (let z = 17.1; z < 20.8; z += .22) K.box(.7, y, z, .9, y + .38, z + .18, pick(['#e8e8e8', '#3a6a9a', '#8a2a2a', '#2a6a4a']));
      for (const x of [2.5, 4, 7.5]) K.picture('-z', x, 2.3, 25.83, .8, .6, T.poster((g, w, h) => { g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a04a'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = '#333'; for (let k = 0; k < 5; k++) g.fillRect(24, 40 + k * 22, w - 48, 4); }), true);

      // X-ray and the lab: light boxes with pictures of bones, a scanner, microscopes
      const xray = K.tex(96, 128, (g, w, h) => { g.fillStyle = '#0a1420'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(220,240,255,.85)'; g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2, h - 10); g.stroke(); g.lineWidth = 3; for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(w / 2, 28 + k * 14, 34 - k * 2, 6, 0, Math.PI, 0); g.stroke(); } }, false);
      for (const z of [18, 19.4, 20.8]) { K.box(19.75, 1.2, z - .62, 19.9, 2.4, z + .62, '#e8f4ff'); K.picture('-x', 19.73, 1.8, z, 1.1, 1.1, xray); }
      K.box(13, 0, 22.5, 17, 1.1, 24.5, '#f2f4f6', true); K.box(14.2, .3, 23, 15.8, .9, 24.6, '#2a3440');
      K.box(11.5, 0, 22.8, 13, .7, 24.2, '#d8dee4', true); K.box(11.6, .7, 23, 12.9, .76, 24, '#7ac0d8');
      K.box(10.3, 0, 17.2, 11.3, .9, 20.8, '#e8eef0', true);
      for (const z of [17.8, 19.6]) { K.box(10.6, .9, z, 10.9, 1.35, z + .2, '#2a2a30'); K.box(10.55, .9, z - .1, 11, .95, z + .35, '#3a3a40'); }
      spots.push(K.spot({ kind: 'idle', x: 12.2, z: 19.2, heading: -Math.PI / 2, type: 'medic', home: true }));
      K.picture('-z', 15, 3, 25.83, 3.4, .6, T.sign('РЕНТГЕН · ЛАБОРАТОРИЯ', null, '#4fc8ff', '#0e1628'));
      doorSign('-z', 15, 3.1, 15.83, '↑ РЕНТГЕН', '#3aa88a', '#f4fbfa');

      let bloodT = 0;
      const job = () => G.jobs && G.jobs.job === 'ems', on = () => G.jobs && G.jobs.duty === 'ems';
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(-3.6, -.7), r: 1.6, short: 'МЕДСЕСТРА', label: () => 'Поговорить с медсестрой',
            use: () => G.ui.menu({ eyebrow: 'Больница', title: 'Приёмный покой', items: () => [
              { name: 'Лечение', desc: 'Полностью восстановить здоровье', price: 40, disabled: G.player.hp >= 100 ? 'Вы здоровы' : '', buy: () => { G.player.hp = 100; return 'Здоровье восстановлено'; } },
              { name: 'Бронежилет', desc: 'Со склада больницы, дешевле, чем в магазине', price: 150, disabled: G.getArmor() >= 100 ? 'Уже надет' : '', buy: () => { G.setArmor(100); return 'Бронежилет надет'; } },
              { name: 'Сдать кровь', desc: '−25 здоровья, +$25. Раз в 5 минут', price: -25, earn: 'Сдать кровь', disabled: Date.now() - bloodT < 300000 ? 'Приходите позже' : G.player.hp <= 30 ? 'Слишком мало здоровья' : '', buy: () => { bloodT = Date.now(); G.player.hp -= 25; return 'Спасибо, вы спасли жизнь!'; } },
              { name: 'Работа на скорой', desc: 'Устроиться или уволиться — у главврача: прямо через пост медсестры, дверь справа. Смена — в ординаторской (справа от входа)', price: 0, disabled: 'Понятно', buy: () => '' }
            ] }) },
          { ...pl.P(18.2, 0), r: 2.4, short: 'СМЕНА', label: () => on() ? 'Ординаторская: закончить смену' : job() ? 'Ординаторская: начать смену' : 'Шкафчики врачей (для сотрудников)', use: () => G.jobs.locker('ems') },
          { ...pl.P(5, 21.2), r: 1.8, short: 'ГЛАВВРАЧ', label: () => job() ? 'Главврач: ваша работа · уволиться' : 'Главврач: устроиться на скорую', use: () => G.jobs.boss('ems') }
        ];
        if (heliPad) pl.interactions.push({ ...pl.P(5.5, -4.9), r: 1.4, short: 'ЛИФТ', label: () => 'Лифт на крышу — вертолёт', use: () => G.teleport(heliPad.liftX, heliPad.z, Math.PI / 2, null, 'Крыша больницы', heliPad.y) });
      };
    }

    /* ---------------------------------------------------------------
       FIRE STATION 7, inside: the garage with two engines, a pole down from upstairs, hoses and helmets;
       then the locker room, the kitchen and the chief's office; at the back the bunk room and a gym
       --------------------------------------------------------------- */
    if (doors.firestation) {
      const H = 5, WALL = '#e8ded2', RED = '#c81e1e';
      const pl = interior('firestation', 'Пожарная часть', doors.firestation, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-16, -6, 16, 30], light: lit('#fff4ea', '#5a4a48', .95) });
      K.at(pl.ox, pl.oz);
      K.room(-16, -6, 16, 30, H, { wall: '#a8322a', ceil: '#3a3436', trim: '#f2ede4', neon: '#ff3344', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.wallZ(10, -16, 16, H, WALL, [DW(-10.5), DW(.5), DW(11)]);
      K.wallX(-5, 10, 22, H, WALL); K.wallX(6, 10, 22, H, WALL);
      K.wallZ(22, -16, 16, H, WALL, [DW(-3), DW(3)]); K.wallX(0, 22, 30, H, WALL);
      K.floor(-16, -6, 16, 10, T.concrete, 3); K.floor(-16, 10, -5, 22, T.tiles, 1.2); K.floor(-5, 10, 6, 22, T.checker, 1); K.floor(6, 10, 16, 22, T.wood, 2);
      K.floor(-16, 22, 0, 30, T.wood, 2); K.floor(0, 22, 16, 30, T.darkTile, 1.4);
      for (const [x, z] of [[-9, 2], [9, 2], [0, 2], [-10.5, 16], [.5, 16], [11, 16], [-8, 26], [8, 26]]) K.neon(x - 1.5, H - .04, z - .15, x + 1.5, H - .01, z + .15, '#fff6ea', false);

      // the garage: big doors (closed), two engines, the brass pole, hoses and helmets on the walls
      for (const cx of [-9, 9]) {
        K.box(cx - 2.8, 0, -5.99, cx + 2.8, 4.2, -5.86, '#d8d2c8');
        for (let y = .4; y < 4.2; y += .5) K.box(cx - 2.8, y, -5.86, cx + 2.8, y + .05, -5.84, '#b8b2a8');
        K.box(cx - 2.95, 4.2, -5.99, cx + 2.95, 4.4, -5.84, '#f2ede4');
        // an engine: cab at -z, body with lockers, a ladder on top, white stripe, lights
        const x0 = cx - 1.25, x1 = cx + 1.25;
        K.box(x0, .45, -3.6, x1, 2.9, -1.2, RED, true); K.box(x0 + .05, 1.7, -3.62, x1 - .05, 2.6, -3.58, '#9fd0f0');
        K.box(x0, .45, -1.2, x1, 2.7, 6.2, RED, true); K.box(x0 - .01, 1.15, -3.6, x1 + .01, 1.35, 6.2, '#f2f2f2');
        for (let z = -.8; z < 5.8; z += 1.6) for (const s of [x0 - .02, x1 + .01]) K.box(s, 1.5, z, s + .01, 2.5, z + 1.4, '#a8181a');
        K.box(x0 + .3, 2.7, -1, x0 + .45, 2.95, 6.6, '#c8ccd4'); K.box(x1 - .45, 2.7, -1, x1 - .3, 2.95, 6.6, '#c8ccd4');
        for (let z = -.8; z < 6.6; z += .45) K.box(x0 + .45, 2.8, z, x1 - .45, 2.86, z + .06, '#c8ccd4');
        K.neon(x0 + .2, 2.9, -3.2, x0 + .7, 3.05, -2.9, '#ff2233'); K.neon(x1 - .7, 2.9, -3.2, x1 - .2, 3.05, -2.9, '#3f6bff');
        for (const z of [-2.6, 1.6, 4.8]) for (const s of [x0 - .12, x1 - .02]) K.box(s, 0, z - .5, s + .14, .9, z + .5, '#1a1a1e');
      }
      K.box(-.06, 0, 6, .06, H, 6.12, '#d8b84a', true); K.neon(-.55, H - .06, 5.55, .55, H - .02, 6.6, '#ffd84f', false);
      K.box(-.6, 0, 5.5, .6, .05, 6.6, '#2a2a2e');
      for (let z = -4; z < 8; z += 2.4) { K.box(-15.85, 1.2, z, -15.7, 2.1, z + .9, '#e8c547'); K.box(15.7, 1.2, z, 15.85, 2.1, z + .9, '#e8c547'); }
      for (let z = -4; z < 8; z += 1.2) { K.box(-15.7, 2.4, z, -15.45, 2.65, z + .3, RED); }
      K.picture('-z', 0, 4.1, 9.83, 5, 1, T.sign('FIRE STATION 7', 'Неплохо Сити', '#ff3344', '#1a0a0a'));
      for (const [x, z, h] of [[-5.6, 3, Math.PI / 2], [5.6, 0, -Math.PI / 2], [3, 8.6, Math.PI]]) if (Math.random() < .8) spots.push(K.spot({ kind: 'idle', x, z, heading: h, type: 'firefighter', home: true }));
      doorSign('-z', -10.5, 3.1, 9.83, 'РАЗДЕВАЛКА', '#ffd84f', '#1a0a0a'); doorSign('-z', .5, 3.1, 9.83, 'КУХНЯ', '#ffd84f', '#1a0a0a'); doorSign('-z', 11, 3.1, 9.83, 'НАЧАЛЬНИК ЧАСТИ', '#ffd84f', '#1a0a0a');

      // the locker room: open lockers with the gear in them — helmets, coats, boots
      for (let x = -15.6; x < -5.8; x += 1.2) {
        K.box(x, 0, 21.2, x + 1.1, 2.3, 21.85, '#6a6a72', true);
        K.box(x + .15, 1.1, 21.15, x + .95, 2.0, 21.25, '#c8a040'); K.box(x + .3, 2.0, 21.2, x + .8, 2.25, 21.5, '#e8c547'); K.box(x + .25, 0, 20.9, x + .85, .35, 21.2, '#1a1a1e');
      }
      lockerRow(-15.85, 10.6, 19.8, 1, '#6a6a72');
      K.box(-10.8, 0, 14.2, -8.2, .45, 14.8, '#8a6a4a', true);
      K.picture('+x', -15.83, 3.4, 15.2, 3, .55, T.sign('РАЗДЕВАЛКА', null, '#ffd84f', '#1a0a0a'));

      // the kitchen: a long table with benches, the crew eating, a stove and a fridge
      K.box(-3, 0, 14, 4, .78, 16, '#8a5a3a', true);
      for (const z of [13.3, 16.7]) K.box(-3, 0, z - .25, 4, .45, z + .25, '#6a4a2a', true);
      for (let x = -2.4; x < 4; x += 1.3) for (const [z, h] of [[13.3, 0], [16.7, Math.PI]]) seat(.45, K.spot({ kind: 'sit', x, z, y: .51, heading: h, type: 'firefighter', home: true }));
      for (let x = -2.4; x < 4; x += 1.6) { K.box(x - .2, .78, 14.6, x + .2, .82, 15, '#f2f2f2'); K.box(x - .12, .82, 14.7, x + .12, .9, 14.9, '#c8743a'); }
      K.box(-4.85, 0, 15.4, -4.05, .95, 20.6, '#e8e8ec', true); K.box(-4.8, .95, 16.2, -4.1, 1.0, 17.4, '#1a1a1e'); K.box(-4.75, .95, 18.6, -4.3, 1.25, 19.1, '#c0c0c8');
      K.box(4.8, 0, 10.2, 5.85, 2.1, 11.6, '#f0f0f2', true); K.box(4.78, 1.2, 10.25, 4.8, 1.22, 11.55, '#c8ccd4');
      if (Math.random() < .7) spots.push(K.spot({ kind: 'idle', x: -3.4, z: 18, heading: -Math.PI / 2, type: 'firefighter', home: true }));

      // the chief's office
      K.box(8.2, 0, 17.4, 13.8, .78, 18.3, '#5a3a24', true); K.box(8.15, .78, 17.35, 13.85, .84, 18.35, '#3a2414');
      K.box(10.6, 0, 18.7, 11.4, .6, 19.5, '#2a1a14'); K.box(10.6, .6, 19.35, 11.4, 1.5, 19.5, '#2a1a14');
      spots.push(K.spot({ kind: 'sit', x: 11, z: 19.05, y: .66, heading: Math.PI, type: 'firefighter', home: true }));
      K.box(9, .84, 17.6, 9.6, .87, 18, '#f2f2f2'); K.box(12.6, .84, 17.6, 13.2, 1.15, 18, '#e8c547');
      chair(10, 16, '#6a2a2a'); chair(12, 16, '#6a2a2a');
      K.picture('-z', 11, 2.7, 21.83, 2.6, 1, T.sign('LEHA NEPLOXO', 'президент мира', '#ffd84f', '#1a0a0a'));
      for (const z of [12, 13.4]) K.picture('-x', 15.83, 2.2, z, .9, .7, T.poster((g, w, h) => { g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c81e1e'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = '#c81e1e'; g.beginPath(); g.moveTo(w / 2, 30); g.lineTo(w / 2 + 22, 90); g.lineTo(w / 2 - 22, 90); g.fill(); }), true);

      // the bunk room: the night shift asleep
      for (const bx of [-14.6, -11.4, -8.2, -5]) {
        for (const y of [.45, 1.65]) { K.box(bx - .5, y, 26.6, bx + .5, y + .14, 28.8, '#f2f2f2'); K.box(bx - .5, y + .14, 28.2, bx + .5, y + .24, 28.7, '#dfe8f4'); K.box(bx - .5, y - .08, 26.6, bx + .5, y, 28.8, '#5a5a62'); }
        for (const [x, z] of [[bx - .5, 26.6], [bx + .44, 26.6], [bx - .5, 28.74], [bx + .44, 28.74]]) K.box(x, 0, z, x + .06, 2.2, z + .06, '#5a5a62');
        K.solid(bx - .5, 0, 26.6, bx + .5, 2.2, 28.8);
        seat(.6, K.spot({ kind: 'lie', x: bx, z: 26.9, y: .62, heading: 0, type: 'firefighter', home: true }));
      }
      K.picture('-z', -8, 3.6, 29.83, 3.4, .6, T.sign('КОМНАТА ОТДЫХА', null, '#ffd84f', '#1a0a0a'));

      // the gym: a bench with a barbell, dumbbells, a punching bag
      K.box(6.4, 0, 25.4, 7.6, .5, 27.6, '#2a2a30', true); K.box(5.4, 1.1, 26.9, 8.6, 1.16, 27, '#c8ccd4'); for (const x of [5.5, 8.3]) K.box(x, .85, 26.7, x + .2, 1.4, 27.2, '#1a1a1e');
      K.box(1, 0, 29.2, 5, .6, 29.8, '#3a3a42', true); for (let x = 1.2; x < 5; x += .5) K.box(x, .6, 29.35, x + .3, .8, 29.65, '#1a1a1e');
      K.box(12.45, 2.2, 25.95, 12.55, H, 26.05, '#2a2a2a'); K.box(12.2, .6, 25.7, 12.8, 2.2, 26.3, RED, true);
      if (Math.random() < .7) spots.push(K.spot({ kind: 'idle', x: 12.5, z: 24.9, heading: 0, type: 'firefighter', home: true }));
      K.picture('-z', 8, 3.6, 29.83, 2.6, .6, T.sign('СПОРТЗАЛ', null, '#ffd84f', '#1a0a0a'));
      doorSign('-z', -3, 3.1, 21.83, '↑ ОТДЫХ', '#ffd84f', '#1a0a0a'); doorSign('-z', 3, 3.1, 21.83, '↑ СПОРТЗАЛ', '#ffd84f', '#1a0a0a');

      const job = () => G.jobs && G.jobs.job === 'fire', on = () => G.jobs && G.jobs.duty === 'fire';
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(-10.5, 18.4), r: 2.4, short: 'СМЕНА', label: () => on() ? 'Раздевалка: закончить смену' : job() ? 'Раздевалка: начать смену' : 'Раздевалка (для сотрудников)', use: () => G.jobs.locker('fire') },
          { ...pl.P(11, 16.6), r: 1.8, short: 'НАЧАЛЬНИК', label: () => job() ? 'Начальник части: ваша служба · уволиться' : 'Начальник части: устроиться пожарным', use: () => G.jobs.boss('fire') }
        ];
      };
    }
    /* ---------------------------------------------------------------
       NEPLOXO MOTORS: the car dealership on the south side of the car park by NEON SPRAY. Outside a glass
       showroom facing the avenue; inside the exclusive cars turn slowly on round stands under spotlights.
       Buying is in autos.js; the car is waiting on the lot behind the showroom.
       --------------------------------------------------------------- */
    let dealer = null;
    {
      // the building, right in the city: x 10..40, z -93..-79, the glass front and the door on the avenue side (-z)
      const X0 = 10, X1 = 40, Z0 = -93, Z1 = -79, H = 6.5, Y = .16;
      K.at(0, 0);
      K.box(X0, Y, Z0 + .3, X1, H, Z1, '#e8e4ee', true);                                   // the body of the building
      K.box(X0 - .2, H, Z0 - .2, X1 + .2, H + .4, Z1 + .2, '#141418', true);                 // the roof slab
      K.box(X0, Y, Z0, X1, H - .2, Z0 + .3, '#6fa8c8');                                      // the glass front
      for (let x = X0; x <= X1; x += 3) K.box(x - .06, Y, Z0 - .04, x + .06, H - .2, Z0 + .02, '#d9d9e2');
      K.neon(X0, H - .35, Z0 - .1, X1, H - .25, Z0 - .04, '#3fe6e0');
      K.neon(X0, Y + .05, Z0 - .1, X1, Y + .12, Z0 - .04, '#ff4fa3', false);
      K.picture('-z', (X0 + X1) / 2, H + .95, Z0 - .25, 14, 1.6, T.sign('NEPLOXO MOTORS', 'эксклюзивные автомобили', '#3fe6e0', '#0e0a18'));
      K.box((X0 + X1) / 2 - 7, H + .1, Z0 - .2, (X0 + X1) / 2 + 7, H + 1.8, Z0 - .15, '#0e0a18');
      // what's inside shows through the glass: a few car shapes and the lights
      for (const [x, hex] of [[15, '#c9a227'], [22, '#e8202a'], [29, '#141418'], [35, '#8cff6b']]) { K.box(x - 1, Y, Z0 + .5, x + 1, Y + 1.1, Z0 + 2.5, hex); K.neon(x - 1.4, H - .6, Z0 + .5, x + 1.4, H - .55, Z0 + 2.5, '#fff8e8', false); }
      const door = { x: 25, z: Z0 - 1.3, y: Y, heading: Math.PI, nx: 0, nz: -1, hex: '#3fe6e0', cx: 25, cz: (Z0 + Z1) / 2 };
      K.box(23.6, Y, Z0 - .08, 26.4, 3, Z0 - .02, '#1d1426'); K.neon(23.4, 3, Z0 - .1, 26.6, 3.12, Z0 - .02, '#3fe6e0');
      mapShapes.push({ x0: X0, z0: Z0, x1: X1, z1: Z1, c: '#3fe6e0', k: 'b' });
      // the lot behind it, where bought cars wait: painted bays
      const bays = [];
      for (let x = 13; x <= 37; x += 4) { K.box(x - .05, Y, -78.2, x + .05, Y + .01, -73.2, '#f5f5f0'); bays.push({ x: x + 2, z: -75.6, h: Math.PI / 2 }); }
      bays.pop();
      K.picture('+z', 12, 2.2, -78.95, 3, .7, T.sign('ВЫДАЧА АВТО', null, '#3fe6e0', '#0e0a18'));

      // inside: one big hall
      const pl = interior('dealer', 'NEPLOXO MOTORS', door, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-21, -6, 21, 24], light: lit('#fff6f0', '#5a5060', 1.05), music: 'lounge' });
      K.at(pl.ox, pl.oz);
      K.room(-21, -6, 21, 24, 7, { wall: '#efeaf2', ceil: '#141418', trim: '#3fe6e0', neon: '#3fe6e0', gaps: { '-z': [{ c: 0, w: 1.8, h: 2.8 }] } });
      K.floor(-21, -6, 21, 24, T.marble, 3);
      K.picture('-z', 0, 4.8, 23.83, 12, 2, T.sign('NEPLOXO MOTORS', 'только у нас · только для своих', '#3fe6e0', '#0e0a18'));
      K.picture('-z', -14, 3.6, 23.83, 5, 1.2, T.sign('LEHA NEPLOXO', 'президент мира рекомендует', '#ffd84f', '#141018'));
      // the sales desk
      K.box(9, 0, -3.4, 15, 1.1, -2.4, '#141418', true); K.box(8.95, 1.1, -3.45, 15.05, 1.16, -2.35, '#c9a227'); K.neon(9, .25, -3.45, 15, .3, -3.4, '#3fe6e0', false);
      spots.push(K.spot({ kind: 'idle', x: 12, z: -1.6, heading: Math.PI, type: 'business_f', home: true }), K.spot({ kind: 'idle', x: -12, z: -2, heading: Math.PI / 2, type: 'business_m', home: true }));
      for (const x of [-18, -16]) { K.box(x - .5, 0, -4.8, x + .5, .45, -3.8, '#2a2a30', true); seat(.6, K.spot({ kind: 'sit', x, z: -4.3, y: .51, heading: 0, mix: 'downtown', home: true })); }
      // eight stands in two rows, a car on each, turning
      const stands = [];
      const SLOTS = [[-15, 5], [-5, 5], [5, 5], [15, 5], [-15, 16], [-5, 16], [5, 16], [15, 16]];
      SLOTS.forEach(([x, z], i) => {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.2, .3, 40), new THREE.MeshLambertMaterial({ color: 0x2a2a32 }));
        disc.position.set(K.wx(x), .15, K.wz(z)); scene.add(disc);
        K.solid(x - 2.2, 0, z - 2.2, x + 2.2, .3, z + 2.2);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(3.15, .05, 6, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3fe6e0 }));
        ring.position.set(K.wx(x), .31, K.wz(z)); scene.add(ring);
        K.neon(x - 2.5, 6.9, z - .1, x + 2.5, 6.95, z + .1, '#fff8e8', false);
        stands.push({ i, x: K.wx(x), z: K.wz(z), lx: x, lz: z, group: null });
      });
      pl.stands = stands;
      let spin = 0;
      pl.update = dt => { spin += dt * .35; for (const s of stands) if (s.group) s.group.rotation.y = spin + s.i * .8; };
      dealer = { place: pl, bays, door, keepClear: { x0: X0 - 1, x1: X1 + 1, z0: Z0 - 3, z1: -72.5 } };
    }

    /* ---------------------------------------------------------------
       NEPLOXO TOWER: a black-and-gold lobby with a lift to the roof; up top a pool, sunbeds,
       a glass railing, a spire with a red light, and a helipad with a helicopter
       --------------------------------------------------------------- */
    let towerPad = null;
    if (towerRoof && doors.tower) {
      const pl = interior('tower', 'NEPLOXO TOWER', doors.tower, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-10, -6, 10, 12], light: lit('#fff0e6', '#4a3a4a', .95), music: 'lounge' });
      K.at(pl.ox, pl.oz);
      K.room(-10, -6, 10, 12, 7, { wall: '#1c1622', ceil: '#120e18', trim: '#c9a04a', neon: '#ff4fa3', gaps: { '-z': [{ c: 0, w: 2.2, h: 3.2 }] } });
      K.floor(-10, -6, 10, 12, T.marble, 2.5);
      for (const x of [-6.5, 6.5]) for (const z of [-2, 6]) { K.box(x - .45, 0, z - .45, x + .45, 7, z + .45, '#101014', true); K.neon(x - .47, .3, z - .47, x + .47, .36, z + .47, '#c9a04a', false); K.neon(x - .47, 6.5, z - .47, x + .47, 6.56, z + .47, '#c9a04a', false); }
      K.box(-4, 0, 5.2, 4, 1.15, 6.1, '#101014', true); K.box(-4.05, 1.15, 5.15, 4.05, 1.22, 6.15, '#c9a04a'); K.neon(-4, .3, 5.14, 4, .36, 5.2, '#ff4fa3', false);
      spots.push(K.spot({ kind: 'idle', x: -1.5, z: 6.9, heading: Math.PI, type: 'business_f' }), K.spot({ kind: 'guard', x: 2.5, z: 6.9, heading: Math.PI, type: 'security' }));
      for (const x of [-4.5, 0, 4.5]) { K.box(x - 1, 0, 11.85, x + 1, 3, 11.99, '#c9a04a'); K.box(x - .02, 0, 11.83, x + .02, 3, 11.86, '#7a6a3a'); K.neon(x - 1.1, 3, 11.8, x + 1.1, 3.1, 11.9, '#3fe6e0'); }
      K.picture('-z', 0, 4.8, 11.83, 8, 2, T.sign('NEPLOXO TOWER', '150 метров над Неплохо Сити', '#ff4fa3', '#10081c'));
      for (const [x0, x1, h] of [[-9.8, -9, Math.PI / 2], [9, 9.8, -Math.PI / 2]]) { K.box(x0, 0, -3, x1, .6, 2, '#2a2230', true); for (let z = -2.4; z < 2; z += 1.2) seat(.5, K.spot({ kind: 'sit', x: (x0 + x1) / 2, z, y: .66, heading: h, mix: 'downtown' })); }
      const lobbyLift = pl.P(0, 10.6);
      towerPad = { lobbyLift };
      pl.attach = () => { pl.interactions = [{ ...lobbyLift, r: 2.2, short: 'ЛИФТ', label: () => 'Лифт на крышу — 150 м', use: () => G.teleport(towerPad.roofX, towerPad.roofZ, towerPad.roofH, null, 'Крыша NEPLOXO TOWER', towerRoof.y) }]; };

      // the roof: local axes u along the tower's length, v across it
      K.at(0, 0);
      const R = towerRoof, y = R.y, base = y - 1.8, deep = y - 1.66;
      const W = (u, v) => R.alongZ ? [R.cx + v, R.cz + u] : [R.cx + u, R.cz + v];
      const rect = (u0, v0, u1, v1) => { const [ax, az] = W(u0, v0), [bx, bz] = W(u1, v1); return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)]; };
      const RB = (u0, v0, u1, v1, y0, y1, hex, solid) => { const [a, b, c, d] = rect(u0, v0, u1, v1); K.box(a, y0, b, c, y1, d, hex, solid); };
      const RS = (u0, v0, u1, v1, y0, y1) => { const [a, b, c, d] = rect(u0, v0, u1, v1); K.solid(a, y0, b, c, y1, d); };
      const RN = (u0, v0, u1, v1, y0, y1, hex, glow) => { const [a, b, c, d] = rect(u0, v0, u1, v1); K.neon(a, y0, b, c, y1, d, hex, glow); };
      // deck round the pool (pool at u -8.5..-2.5, v -3..3)
      for (const [u0, v0, u1, v1] of [[-10, -5, -8.5, 5], [-2.5, -5, 10, 5], [-8.5, -5, -2.5, -3], [-8.5, 3, -2.5, 5]]) { RB(u0, v0, u1, v1, y - .12, y, '#e8e2da'); RS(u0, v0, u1, v1, base, y); }
      RB(-8.5, -3, -2.5, 3, deep - .05, deep, '#2fa8c0'); RS(-8.5, -3, -2.5, 3, base, deep);
      for (const [u0, v0, u1, v1] of [[-8.5, -3, -8.4, 3], [-2.6, -3, -2.5, 3], [-8.5, -3, -2.5, -2.9], [-8.5, 2.9, -2.5, 3]]) RB(u0, v0, u1, v1, deep, y - .02, '#3fc0d6');
      for (let k = 1; k <= 3; k++) { RB(-2.6 - (4 - k) * .55, -3, -2.6, 3, deep, deep + k * .415, k % 2 ? '#5fd6e2' : '#4fc9d6'); RS(-2.6 - (4 - k) * .55, -3, -2.5, 3, base, deep + k * .415); }
      const [pa, pb, pc, pd] = rect(-8.4, -2.9, -2.6, 2.9);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(pc - pa, pd - pb).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
        transparent: true, uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vU;
          void main(){ vec2 p = vU * vec2(7.0, 7.0); float w = sin(p.x*2.1 + uTime*1.7) * sin(p.y*2.7 - uTime*1.3) + sin((p.x+p.y)*1.3 + uTime);
            gl_FragColor = vec4(mix(vec3(0.12,0.62,0.85), vec3(0.85,1.0,1.0), smoothstep(0.9, 1.6, w)), 0.72); }` }));
      water.position.set((pa + pc) / 2, y - .22, (pb + pd) / 2); scene.add(water);
      NB.water.add({ name: 'towerpool', test: (x, z) => x > pa && x < pc && z > pb && z < pd, surface: () => y - .22 });
      // sunbeds with sunbathers along the pool
      // sunbeds by the pool: sunbathers always lie along +z, so each bed runs from v -4.6 to -2.35 in world z
      for (const u of [-9.25, -1.85, -.75]) {
        const [x, zs] = W(u, -4.6), z0 = R.alongZ ? R.cz - 4.6 : zs, z1 = z0 + 2.25;
        K.box(x - .35, y, z0, x + .35, y + .33, z1, '#ffffff', true); K.box(x - .35, y + .33, z1 - .3, x + .35, y + .41, z1, '#e8e0d0');
        K.box(x - .3, y + .331, z0 + .1, x + .3, y + .345, z1 - .35, u < -5 ? '#ff7eb6' : '#3fe6e0');
        if (Math.random() < .85) spots.push({ kind: 'lie', x, z: z0 + .15, y: y + .45, fixedY: true, heading: 0, type: Math.random() < .7 ? 'beach_f' : 'beach_m', home: true });
      }
      // the helipad at the other end
      RB(1.2, -4.4, 9.6, 4.4, y, y + .04, '#2a2a32');
      RN(1.4, -4.2, 9.4, -4.05, y + .04, y + .07, '#ffd84f', false); RN(1.4, 4.05, 9.4, 4.2, y + .04, y + .07, '#ffd84f', false); RN(1.4, -4.2, 1.55, 4.2, y + .04, y + .07, '#ffd84f', false); RN(9.25, -4.2, 9.4, 4.2, y + .04, y + .07, '#ffd84f', false);
      RB(3.8, -2, 4.3, 2, y + .04, y + .06, '#f2f2f2'); RB(6.7, -2, 7.2, 2, y + .04, y + .06, '#f2f2f2'); RB(4.3, -.25, 6.7, .25, y + .04, y + .06, '#f2f2f2');
      // lift hut, spire with a red light, glass railing all round
      RB(-2.3, 2.9, .3, 5, y, y + 2.8, '#1c1622', true); RN(-2.2, 2.85, .2, 2.9, y + 2.4, y + 2.5, '#ff4fa3');
      RB(-9.9, 4.2, -9.3, 4.8, y, y + 26, '#d8d8e2', true); RN(-9.75, 4.35, -9.45, 4.65, y + 26, y + 27.2, '#ff2233');
      // real glass: one see-through pane per side, a thin lit handrail and steel posts every two metres
      const glassMat = new THREE.MeshBasicMaterial({ color: 0x9fdcf0, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide });
      const rail = (u0, v0, u1, v1) => {
        const [a, b, c, d] = rect(u0, v0, u1, v1), m = new THREE.Mesh(new THREE.BoxGeometry(c - a, 1.05, d - b), glassMat);
        m.position.set((a + c) / 2, y + .525, (b + d) / 2); scene.add(m);
        RS(u0, v0, u1, v1, y, y + 1.2); RN(u0, v0, u1, v1, y + 1.05, y + 1.12, '#3fe6e0', false);
        const along = c - a > d - b, n = Math.round((along ? c - a : d - b) / 2);
        for (let k = 0; k <= n; k++) { const t = k / n, px = along ? a + (c - a) * t : (a + c) / 2, pz = along ? (b + d) / 2 : b + (d - b) * t; K.box(px - .05, y, pz - .05, px + .05, y + 1.05, pz + .05, '#d8dce4'); }
      };
      rail(-10, -5, 10, -4.9); rail(-10, 4.9, 10, 5); rail(-10, -5, -9.9, 5); rail(9.9, -5, 10, 5);
      const [hx, hz] = W(-1, 2.3), [lx, lz] = W(-1, 1.6);
      towerPad.roofX = lx; towerPad.roofZ = lz; towerPad.roofH = R.alongZ ? Math.PI : -Math.PI / 2;
      const [cx, cz] = W(5.4, 0); towerPad.heli = { x: cx, z: cz, h: R.alongZ ? 0 : Math.PI / 2 };
      outdoor.push({ x: hx, z: hz, y, r: 1.5, short: 'ЛИФТ', label: () => 'Лифт вниз', use: () => G.teleport(lobbyLift.x, lobbyLift.z - .8, Math.PI, pl, pl.name) });
      pl.renderRoof = t => { water.material.uniforms.uTime.value = t; };
    }
    // the helipad on the hospital roof: a lift hut to come up and go down, and the helicopter itself
    let heliPad = null;
    if (hospital) {
      K.at(0, 0);
      const y = 13.7, x = hospital.cx, z = hospital.cz;
      K.box(x - 10.3, y, z - 1.2, x - 8.1, y + 2.7, z + 1.2, '#f4f6f8', true); K.box(x - 8.1, y, z - .6, x - 8.05, y + 2.3, z + .6, '#b8bcc8');
      K.neon(x - 8.08, y + 2.3, z - .7, x - 8.02, y + 2.4, z + .7, '#6bffd0');
      for (const [a, b] of [[-4.3, -4.2], [4.2, 4.3]]) { K.neon(x - 4.3, y + .06, z + a, x + 4.3, y + .1, z + b, '#ffd84f', false); K.neon(x + a, y + .06, z - 4.3, x + b, y + .1, z + 4.3, '#ffd84f', false); }
      heliPad = { x: x + .8, z, y, liftX: x - 7.4 };
      const hosp = places.find(p => p.id === 'hospital'), down = hospLift;
      outdoor.push({ x: x - 7.6, z, y, r: 1.4, short: 'ЛИФТ', label: () => 'Лифт вниз', use: () => G.teleport(down.x, down.z, 0, hosp, hosp.name) });
    }

    /* ---------------------------------------------------------------
       5. ARCADE: rows of machines with live screens, neon carpet, a prize counter
       --------------------------------------------------------------- */
    {
      const pl = interior('arcade', 'Зал игровых автоматов', doors.arcade, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-10, -6, 10, 12], light: lit('#b8a0ff', '#201430', .55), music: 'arcade' });
      K.at(pl.ox, pl.oz);
      K.room(-10, -6, 10, 12, 3.6, { wall: '#1c1230', ceil: '#0e0a18', trim: '#0a0812', neon: '#c28bff', gaps: { '-z': [{ c: 0, w: 1.8, h: 2.6 }] } });
      K.floor(-10, -6, 10, 12, T.arcade, 3);
      const MARQ = ['#ff4fa3', '#3fe6e0', '#ffd84f', '#8cff6b', '#c28bff', '#ff8a3d'];
      const machines = [];
      // a cabinet whose front faces direction dir (+1: +x, -1: -x), standing at x = back
      const cabinet = (back, z, dir, k) => {
        const f = back + dir * .8, bx0 = Math.min(back, f), bx1 = Math.max(back, f);
        K.box(bx0, 0, z - .42, bx1, 1.95, z + .42, '#241a34', true);
        K.box(Math.min(f, f + dir * .32), .95, z - .4, Math.max(f, f + dir * .32), 1.08, z + .4, '#3a2a50');
        K.screen(dir > 0 ? '+x' : '-x', f + dir * .01, 1.45, z, .62, .5, 0);
        K.neon(bx0, 1.75, z - .42, bx1 + (dir > 0 ? .02 : 0), 1.95, z + .42, MARQ[k % MARQ.length]);
        for (const s of [-1, 1]) K.neon(f + dir * .01 - .01, .1, z + s * .41 - .01, f + dir * .01 + .01, 1.7, z + s * .41 + .01, MARQ[(k + 2) % MARQ.length], false);
        machines.push({ x: f + dir * .75, z, heading: dir > 0 ? -Math.PI / 2 : Math.PI / 2 });
      };
      let k = 0;
      for (let z = -3.4; z <= 10.5; z += 1.3) { cabinet(-10, z, 1, k++); cabinet(10, z, -1, k++); }
      for (let z = 0; z <= 7.8; z += 1.3) { cabinet(-.02, z, -1, k++); cabinet(.02, z, 1, k++); }
      for (const m of machines) if (Math.random() < .3) { m.busy = true; spots.push(K.spot({ kind: 'play', x: m.x, z: m.z, heading: m.heading, mix: 'town', home: true })); }
      // prize counter at the back with plush toys
      K.box(-4, 0, 10.2, 4, 1.05, 10.9, '#2a1a40', true); K.neon(-4, .9, 10.16, 4, .96, 10.2, '#ffd84f', false);
      K.box(-4, 0, 11.45, 4, 1.0, 11.95, '#2a1a40', true);
      for (let x = -3.6; x < 3.6; x += .5) K.box(x, 1.0, 11.5, x + .38, 1.0 + rand(.25, .45), 11.9, pick(['#ff7eb6', '#7fe0ff', '#ffd84f', '#9be37a', '#c9a4ff']));
      spots.push(K.spot({ kind: 'idle', x: 0, z: 11.15, heading: Math.PI, mix: 'town', home: true }));
      K.picture('-z', 0, 2.8, 11.83, 5, 1.1, T.sign('NEON ARCADE', '1 жетон = $5', '#c28bff', '#0c0818'));
      // air hockey in the corner
      K.box(4.5, 0, -4.4, 7.5, .85, -2.8, '#1a1a2a', true); K.neon(4.5, .85, -4.4, 7.5, .88, -2.8, '#3fe6e0');
      pl.attach = () => {
        pl.interactions = machines.filter(m => !m.busy).map(m => ({ ...pl.P(m.x, m.z), r: .95, short: 'ИГРАТЬ', label: () => 'Играть в NEON RACER · $5', use: () => G.ui.racer() }));
      };
    }

    /* ---------------------------------------------------------------
       6. DINER: checkerboard floor, counter and stools, booths, a jukebox, a waitress on skates
       --------------------------------------------------------------- */
    {
      const pl = interior('diner', 'Закусочная', doors.diner, { inside: [6, -3.4, 0], exit: [6, -4.3], bounds: [-10, -5, 10, 7], light: lit('#fff0e0', '#6a4a50', .95), music: 'diner' });
      K.at(pl.ox, pl.oz);
      K.room(-10, -5, 10, 7, 3.4, { wall: '#f4e8d8', ceil: '#e8dcca', trim: '#c8283c', neon: '#ff4fa3', gaps: { '-z': [{ c: 6, w: 1.6, h: 2.6 }] } });
      K.floor(-10, -5, 10, 7, T.checker, 1.2);
      K.box(-10, .9, -4.99, 10, 1.05, -4.9, '#c8283c'); K.box(-10, 2.9, 6.9, 10, 3.0, 6.99, '#c8283c');
      // counter, stools, the cook
      K.box(-8, 0, 3, 3, 1.02, 3.8, '#c8283c', true); K.box(-8.05, 1.02, 2.95, 3.05, 1.1, 3.85, '#f4f0ea'); K.box(-8, .45, 2.98, 3, .55, 3.0, '#d9d9e2');
      for (let x = -7.2; x < 2.6; x += 1.2) {
        K.box(x - .05, 0, 2.2, x + .05, .55, 2.3, '#d9d9e2'); K.box(x - .24, .55, 2.01, x + .24, .62, 2.49, '#c8283c');
        K.solid(x - .2, 0, 2.05, x + .2, .62, 2.45);
        seat(.45, K.spot({ kind: 'sit', x, z: 2.2, y: .66, heading: 0, mix: 'town', home: true }));
      }
      K.box(-8, 0, 6.2, 3, 1.0, 6.9, '#b8b8c2', true); K.box(-7, 1.9, 6.4, -2, 2.7, 6.9, '#9a9aa4');
      spots.push(K.spot({ kind: 'idle', x: -3, z: 5.1, heading: Math.PI, type: 'cook', home: true }));
      for (let x = -6; x < 2; x += 1.8) { K.box(x, 1.1, 3.2, x + .5, 1.3, 3.6, '#f2d6a8'); K.box(x + .05, 1.3, 3.25, x + .45, 1.34, 3.55, '#c8283c'); }
      K.picture('-z', -2.5, 2.35, 6.83, 4.2, 1, T.sign('БУРГЕР · ФРИ · ШЕЙК', 'открыто круглосуточно', '#ffd84f', '#1a1216'));
      // booths along the front windows
      for (const cx of [-8.2, -4.4, -.6]) {
        for (const s of [-1, 1]) { const x0 = cx + s * .95 - .3, x1 = cx + s * .95 + .3; K.box(x0, 0, -4.8, x1, .6, -3, '#c8283c', true); K.box(s < 0 ? x0 - .2 : x1, .6, -4.8, s < 0 ? x0 : x1 + .2, 1.3, -3, '#a81e30', true); }
        K.box(cx - .45, 0, -4.7, cx + .45, .78, -3.2, '#f4f0ea', true);
        for (const s of [-1, 1]) seat(.55, K.spot({ kind: 'sit', x: cx + s * .9, z: -3.9, y: .66, heading: s < 0 ? Math.PI / 2 : -Math.PI / 2, mix: 'town', home: true }));
      }
      for (let x = -9.5; x < 1.5; x += 2.4) K.neon(x, 1.3, -4.99, x + 1.8, 2.6, -4.97, '#a8e0ff', false);
      // jukebox
      K.box(8.9, 0, 2, 9.9, 1.5, 3.2, '#5a2a1a', true); K.neon(8.88, 1.5, 2.05, 8.92, 1.9, 3.15, '#ffd84f'); K.neon(8.88, .3, 2.2, 8.9, 1.3, 2.3, '#ff4fa3', false); K.neon(8.88, .3, 2.9, 8.9, 1.3, 3.0, '#3fe6e0', false);
      K.screen('-x', 8.87, 1.0, 2.6, .5, .3, 3);
      // the waitress skates a loop between the booths and the counter
      spots.push(K.spot({ kind: 'skate', x: -7, z: 1, heading: Math.PI / 2, type: 'waitress', patrol: [[-7.5, 1.1], [3.5, 1.1], [4.5, -1.6], [-8.5, -1.9]] }));
      const SONGS = ['diner', 'diner2', 'diner3'], NAMES = ['«Neon Boogie»', '«Малибу-твист»', '«Полночный шейк»'];
      let song = 0;
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(-2.5, 1.7), r: 1.9, short: 'МЕНЮ', label: () => 'Меню закусочной', use: () => G.ui.menu({ eyebrow: 'Закусочная', title: 'Меню', items: () => [
            { name: 'Бургер «Neon»', desc: '+40 здоровья', price: 12, buy: () => { G.player.hp = Math.min(100, G.player.hp + 40); return 'Вкусно!'; } },
            { name: 'Картошка фри', desc: '+15 здоровья', price: 5, buy: () => { G.player.hp = Math.min(100, G.player.hp + 15); return 'Хрустит!'; } },
            { name: 'Молочный коктейль', desc: '+20 здоровья', price: 7, buy: () => { G.player.hp = Math.min(100, G.player.hp + 20); return 'Клубничный, с вишенкой'; } },
            { name: 'Кофе', desc: '+10 здоровья', price: 3, buy: () => { G.player.hp = Math.min(100, G.player.hp + 10); return 'Бодрит!'; } }
          ] }) },
          { ...pl.P(8.4, 2.6), r: 1.4, short: 'МУЗЫКА', label: () => 'Музыкальный автомат · $1', use: () => { if (!G.money.spend(1, 'Музыка')) return; song = (song + 1) % SONGS.length; pl.music = SONGS[song]; G.flash('Играет ' + NAMES[song], 2); } }
        ];
      };
    }

    /* ---------------------------------------------------------------
       7. HOTEL OCEAN: lobby with a fountain and a lift to the rooftop pool
       --------------------------------------------------------------- */
    let roofLift = null;
    {
      const pl = interior('hotel', 'Отель OCEAN', doors.hotel, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-10, -6, 10, 10], light: lit('#fff2ec', '#7a5a6a', 1.0), music: 'lounge' });
      K.at(pl.ox, pl.oz);
      K.room(-10, -6, 10, 10, 6, { wall: '#f6e2e6', ceil: '#f0d8de', trim: '#3fb8b0', neon: '#3fe6e0', gaps: { '-z': [{ c: 0, w: 2, h: 3 }] } });
      K.floor(-10, -6, 10, 10, T.pinkMarble, 2);
      K.box(-4, 0, 6, 4, 1.15, 7, '#ffffff', true); K.box(-4.05, 1.15, 5.95, 4.05, 1.22, 7.05, '#3fb8b0'); K.neon(-4, .2, 5.94, 4, .28, 6, '#3fe6e0', false);
      spots.push(K.spot({ kind: 'idle', x: 0, z: 8, heading: Math.PI, type: 'business_f', home: true }));
      for (let x = -3; x <= 3; x += .5) for (let y = 1.6; y < 3.2; y += .4) K.box(x - .12, y, 9.88, x + .12, y + .25, 9.99, '#c9a04a');
      K.picture('-z', 0, 4.2, 9.83, 6, 1.3, T.sign('HOTEL OCEAN', 'Neploxo City · since 1938', '#3fe6e0', '#fff6f8'));
      // the fountain in the middle
      K.box(-1.8, 0, -.3, 1.8, .6, 3.3, '#ffffff', true); K.neon(-1.6, .5, -.1, 1.6, .54, 3.1, '#6fe0ff', false); K.box(-.3, .6, 1.2, .3, 1.8, 1.8, '#ffffff', true); K.box(-.7, 1.8, .8, .7, 1.95, 2.2, '#ffffff');
      K.glow(-1.6, .5, -.1, 1.6, 1.2, 3.1, '#6fe0ff', .4);
      // sofas with guests, potted palms, a chandelier
      for (const [x0, x1, face] of [[-9.8, -9, Math.PI / 2], [-6, -5.2, -Math.PI / 2]]) {
        K.box(x0, 0, -1, x1, .6, 3, '#3fb8b0', true); K.box(face > 0 ? x0 - .0 : x1 - .01, .6, -1, face > 0 ? x0 + .25 : x1, 1.25, 3, '#2f9890');
        for (let z = -.4; z < 3; z += 1.1) seat(.5, K.spot({ kind: 'sit', x: (x0 + x1) / 2 + (face > 0 ? .1 : -.1), z, y: .66, heading: face, mix: 'strip', home: true }));
      }
      K.box(-8, 0, .3, -7, .45, 1.7, '#e8e0d4', true);
      const pot = (x, z) => { K.box(x - .35, 0, z - .35, x + .35, .7, z + .35, '#c9a04a', true); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; K.box(x + Math.cos(a) * .15 - .06, .7, z + Math.sin(a) * .15 - .06, x + Math.cos(a) * .7, 1.6 + (k % 2) * .3, z + Math.sin(a) * .7, '#2f8a44'); } };
      for (const [x, z] of [[-9, -5], [9, -5], [-9, 9], [9, 9], [5, 6.5], [-5, 6.5]]) pot(x, z);
      K.neon(-1.5, 5.4, .3, 1.5, 5.46, 2.7, '#fff0d8'); K.glow(-2, 4.9, -.2, 2, 5.9, 3.2, '#fff0d8', .5);
      // the lift doors on the east wall
      K.box(9.85, 0, 3, 9.99, 2.7, 5, '#b8bcc8'); K.box(9.83, 0, 3.98, 9.86, 2.7, 4.02, '#7a7e8a'); K.neon(9.84, 2.7, 2.9, 9.88, 2.8, 5.1, '#3fe6e0');
      K.screen('-x', 9.82, 3.05, 4, .5, .25, 3);
      spots.push(K.spot({ kind: 'skate', x: 6, z: -3, heading: 0, type: 'bellboy', patrol: [[6, -3], [6, 4.5], [-6.5, 4.5], [-3, -3.5]] }));
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(0, 5.2), r: 1.8, short: 'НОМЕР', label: () => 'Снять номер на ночь · $60', use: () => { if (!G.money.spend(60, 'Номер в отеле')) return; G.sleep('Вы выспались в отеле OCEAN'); } },
          { ...pl.P(9, 4), r: 1.5, short: 'ЛИФТ', label: () => roofLift ? 'Лифт на крышу' : null, use: () => G.teleport(roofLift.x, roofLift.z, roofLift.heading, null, 'Крыша отеля OCEAN', roofLift.y) }
        ];
      };
    }
    // the rooftop pool deck, built on top of the real hotel in the city
    if (hotelRoof) {
      const R = hotelRoof; K.at(0, 0);
      const px0 = R.x0 + 4.2, px1 = R.x1 - 3.4, pz0 = R.z0 + 2.2, pz1 = R.z1 - 2.2, y = R.y, base = y - 3.05, deep = y - 1.66;
      NB.water.add({ name: 'roofpool', test: (x, z) => x > px0 + .1 && x < px1 - .1 && z > pz0 + .1 && z < pz1 - .1, surface: () => y - .22 });
      for (const [a, b, c, d] of [[R.x0, R.z0, px0, R.z1], [px1, R.z0, R.x1, R.z1], [px0, R.z0, px1, pz0], [px0, pz1, px1, R.z1]]) { K.box(a, y - .12, b, c, y, d, '#efe4d6'); K.solid(a, base, b, c, y, d); }
      K.box(px0, deep - .05, pz0, px1, deep, pz1, '#3fb3c7'); K.solid(px0, base, pz0, px1, deep, pz1);
      for (const [a, b, c, d] of [[px0, pz0, px0 + .12, pz1], [px1 - .12, pz0, px1, pz1], [px0, pz0, px1, pz0 + .12], [px0, pz1 - .12, px1, pz1]]) K.box(a, deep, b, c, y - .02, d, '#4fc9d6');
      // steps out of the pool at the east end, each one an easy step up
      for (let k = 1; k <= 3; k++) { const x0 = px1 - .12 - (4 - k) * .6; K.box(x0, deep, pz0 + .12, px1 - .12, deep + k * .415, pz1 - .12, k % 2 ? '#5fd6e2' : '#4fc9d6'); K.solid(x0, base, pz0, px1, deep + k * .415, pz1); }
      const water = new THREE.Mesh(new THREE.PlaneGeometry(px1 - px0 - .24, pz1 - pz0 - .24).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
        transparent: true, uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vU;
          void main(){ vec2 p = vU * vec2(9.0, 6.0); float w = sin(p.x*2.1 + uTime*1.7) * sin(p.y*2.7 - uTime*1.3) + sin((p.x+p.y)*1.3 + uTime);
            float caust = smoothstep(0.9, 1.6, w); gl_FragColor = vec4(mix(vec3(0.15,0.72,0.85), vec3(0.85,1.0,1.0), caust), 0.72); }`
      }));
      water.position.set((px0 + px1) / 2, y - .22, (pz0 + pz1) / 2); scene.add(water);
      // railing all round, loungers, umbrellas
      const rail = (a, b, c, d) => { K.box(a, y, b, c, y + 1.05, d, '#ffffff'); K.solid(a, y, b, c, y + 1.1, d); K.neon(a, y + 1.05, b, c, y + 1.1, d, '#ff4fa3', false); };
      rail(R.x0, R.z0, R.x1, R.z0 + .08); rail(R.x0, R.z1 - .08, R.x1, R.z1); rail(R.x0, R.z0, R.x0 + .08, R.z1); rail(R.x1 - .08, R.z0, R.x1, R.z1);
      for (let k = 0; k < 3; k++) {
        const x = px0 + .8 + k * 2.2;
        for (const [z0, z1, back] of [[R.z0 + .3, R.z0 + 2.0, R.z0 + .3], [R.z1 - 2.0, R.z1 - .3, R.z1 - .7]]) {
          if (x > px1 - 1.6) continue;
          K.box(x - .35, y, z0, x + .35, y + .35, z1, '#ffffff', true); K.box(x - .35, y + .35, back, x + .35, y + .8, back + .4, '#ffffff'); K.box(x - .3, y + .36, z0 + .2, x + .3, y + .38, z1 - .2, k % 2 ? '#ff7eb6' : '#3fe6e0');
        }
      }
      // lift hut in the south-west corner
      K.box(R.x0 + .15, y, R.z0 + .15, R.x0 + 2.8, y + 2.8, R.z0 + 2.6, R.hex || '#f7b5c9', true); K.box(R.x0 + 2.8, y, R.z0 + .8, R.x0 + 2.85, y + 2.3, R.z0 + 1.9, '#b8bcc8');
      K.neon(R.x0 + 2.82, y + 2.3, R.z0 + .7, R.x0 + 2.9, y + 2.4, R.z0 + 2.0, '#3fe6e0');
      roofLift = { x: R.x0 + 3.5, z: R.z0 + 1.35, heading: Math.PI / 2, y };
      const hotel = places.find(p => p.id === 'hotel'), fromLift = hotel.P(8.3, 4);
      outdoor.push({ x: R.x0 + 3.4, z: R.z0 + 1.35, y, r: 1.4, short: 'ЛИФТ', label: () => 'Лифт в лобби', use: () => G.teleport(fromLift.x, fromLift.z, -Math.PI / 2, hotel, hotel.name) });
      hotel.renderRoof = t => { water.material.uniforms.uTime.value = t; };
    }

    /* ---------------------------------------------------------------
       8. CASINO: roulette, card tables, rows of slot machines, a cashier's cage
       --------------------------------------------------------------- */
    {
      const pl = interior('casino', 'Казино', doors.casino, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-12, -6, 12, 14], light: lit('#ffe6c8', '#5a2a2a', .85), music: 'casino' });
      K.at(pl.ox, pl.oz);
      K.room(-12, -6, 12, 14, 5, { wall: '#3a0f1a', ceil: '#24080f', trim: '#c9a04a', neon: '#ffd84f', gaps: { '-z': [{ c: 0, w: 2.2, h: 3 }] } });
      K.floor(-12, -6, 12, 14, T.casino, 2.5);
      for (const x of [-6, 6]) for (const z of [-1, 8]) { K.box(x - .4, 0, z - .4, x + .4, 5, z + .4, '#c9a04a', true); K.neon(x - .42, .2, z - .42, x + .42, .26, z + .42, '#ff4fa3', false); K.neon(x - .42, 4.6, z - .42, x + .42, 4.66, z + .42, '#ff4fa3', false); }
      // roulette table with a wheel that spins
      K.box(-2.3, 0, 4, 2.3, .9, 6.2, '#5a2a1a', true); K.box(-2.2, .9, 4.1, 2.2, .95, 6.1, '#1f6b3a');
      for (let k = 0; k < 12; k++) K.box(-1.9 + k * .28, .951, 4.4, -1.72 + k * .28, .955, 5.2, k % 2 ? '#c81e2a' : '#141418');
      const wheel = new THREE.Group(); wheel.position.set(K.wx(1.55), .96, K.wz(5.5)); scene.add(wheel);
      wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(.5, .55, .1, 24), new THREE.MeshLambertMaterial({ color: 0x5a2a1a })));
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .11, 18), new THREE.MeshBasicMaterial({ vertexColors: false, color: 0xc81e2a })); wheel.add(rim);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(.12, .2, 8).translate(0, .15, 0), new THREE.MeshLambertMaterial({ color: 0xd9c070 })); wheel.add(cone);
      spots.push(K.spot({ kind: 'idle', x: 0, z: 6.9, heading: Math.PI, type: 'croupier', home: true }));
      for (const x of [-1.4, .2]) if (Math.random() < .8) spots.push(K.spot({ kind: 'idle', x, z: 3.3, heading: 0, mix: 'downtown', home: true }));
      // card tables with dealers and players
      for (const cx of [-6, 6]) {
        K.box(cx - 1.4, 0, 10, cx + 1.4, .9, 11.2, '#5a2a1a', true); K.box(cx - 1.3, .9, 10.1, cx + 1.3, .94, 11.1, '#1f6b3a');
        spots.push(K.spot({ kind: 'idle', x: cx, z: 11.9, heading: Math.PI, type: 'croupier', home: true }));
        for (const dx of [-.9, 0, .9]) { K.box(cx + dx - .22, 0, 9.1, cx + dx + .22, .62, 9.55, '#c9a04a', true); seat(.6, K.spot({ kind: 'sit', x: cx + dx, z: 9.3, y: .66, heading: 0, mix: 'downtown', home: true })); }
      }
      // slot machines along both walls
      const slots = [];
      for (const [back, dir] of [[-12, 1], [12, -1]]) for (let z = -4.2; z <= 12.5; z += 1.25) {
        if (Math.abs(z - 8) < .7 || Math.abs(z + 1) < .7) continue;
        const f = back + dir * .75, bx0 = Math.min(back, f), bx1 = Math.max(back, f);
        K.box(bx0, 0, z - .45, bx1, 1.75, z + .45, '#8a1a2a', true);
        K.screen(dir > 0 ? '+x' : '-x', f + dir * .01, 1.25, z, .6, .42, 1);
        K.neon(bx0, 1.75, z - .45, bx1, 1.95, z + .45, '#ffd84f');
        K.box(f - .05, .7, z + .46, f + .05, 1.2, z + .5, '#d9d9e2');
        const sx = f + dir * .75;
        K.box(sx - .22, 0, z - .22, sx + .22, .62, z + .22, '#c9a04a', true);
        seat(.35, K.spot({ kind: 'sit', x: sx, z, y: .66, heading: dir > 0 ? -Math.PI / 2 : Math.PI / 2, mix: 'downtown', home: true }));
        slots.push({ x: f + dir * .5, z });
      }
      // cashier's cage
      K.box(-4, 0, 12.6, 4, 1.1, 13.2, '#5a2a1a', true); for (let x = -4; x < 4; x += .2) K.box(x, 1.1, 12.85, x + .04, 2.6, 12.9, '#c9a04a');
      spots.push(K.spot({ kind: 'idle', x: 0, z: 13.6, heading: Math.PI, type: 'croupier', home: true }));
      K.picture('-z', 0, 3.6, 13.83, 6, 1.3, T.sign('ROYAL NEON CASINO', 'удача любит смелых', '#ffd84f', '#24080f'));
      for (const [x, z] of [[0, 1.5], [0, 9.5]]) { K.neon(x - 1, 4.7, z - 1, x + 1, 4.76, z + 1, '#fff0cc'); K.glow(x - 1.6, 3.9, z - 1.6, x + 1.6, 4.9, z + 1.6, '#fff0cc', .5); }
      pl.attach = () => {
        pl.interactions = [{ ...pl.P(0, 3.2), r: 1.9, short: 'РУЛЕТКА', label: () => 'Рулетка', use: () => G.ui.roulette() }]
          .concat(slots.map(s => ({ ...pl.P(s.x, s.z), r: .95, short: 'СЛОТЫ', label: () => 'Игровой автомат', use: () => G.ui.slots() })));
      };
      pl.render = (t) => { wheel.rotation.y = t * .8; };
    }

    /* ---------------------------------------------------------------
       8b. NEON BAY INTERNATIONAL: the airport terminal on Bayview. A tall hall: check-in desks with
       queues and luggage belts, departure boards that keep changing, security with metal detectors,
       a Duty Free shop, a café, and the gates with rows of seats in front of a window onto the runway
       --------------------------------------------------------------- */
    if (doors.airport) {
      const pl = interior('airport', 'Аэропорт LEHA NEPLOXO International', doors.airport, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-30, -6, 30, 34], light: lit('#f6f8fc', '#8a8a96', 1.05), music: 'lounge' });
      K.at(pl.ox, pl.oz);
      const H = 8;
      K.room(-30, -6, 30, 34, H, { wall: '#e8e6e0', ceil: '#dde2ea', trim: '#8a8a96', neon: '#3fe6e0', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.floor(-30, -6, 30, 24, T.marble, 2.5);
      const blueCarpet = K.tex(64, 64, (g, s) => { g.fillStyle = '#2a4a7a'; g.fillRect(0, 0, s, s); U.speckle(g, s, s, 700, ['#24406c', '#335a8e'], .3, .6, 1, 2); });
      K.floor(-30, 24, 30, 34, blueCarpet, 1.5);
      // tall glass on the front wall, strip lights under the roof, white columns
      for (const [a, b] of [[-29, -2], [2, 29]]) { K.box(a, .6, -5.8, b, 6.8, -5.75, '#a8c8dc'); for (let x = a; x <= b; x += 3) K.box(x - .06, .6, -5.82, x + .06, 6.8, -5.7, '#d0d4dc'); }
      for (const z of [-1, 7, 15, 23, 31]) K.neon(-27, H - .45, z, 27, H - .4, z + .35, '#f4f8ff', false);
      for (const x of [-15, 15]) for (const z of [3, 19]) K.box(x - .45, 0, z - .45, x + .45, H, z + .45, '#f5f5f0', true);
      // hanging direction signs over the main corridor
      K.box(-4, 5.2, 1.4, 4, 6.2, 1.6, '#1c2a4a'); K.picture('-z', 0, 5.7, 1.38, 7.6, .9, T.sign('К САМОЛЁТАМ →', 'GATES · DUTY FREE · CAFÉ', '#ffd84f', '#1c2a4a'));
      K.picture('+z', 0, 5.7, 1.62, 7.6, .9, T.sign('← В ГОРОД', 'EXIT · TAXI', '#3fe6e0', '#1c2a4a'));

      /* --- departure boards: flights, gates and times; the statuses move on every so often --- */
      const CITIES = ['МАЙАМИ', 'НЬЮ-ЙОРК', 'ГАВАНА', 'ЛОС-АНДЖЕЛЕС', 'РИО', 'ЧИКАГО', 'НАССАУ', 'МЕХИКО', 'ЛАС-ВЕГАС', 'КАНКУН', 'БОСТОН', 'САН-ХУАН'];
      const STATUS = [['ПО ГРАФИКУ', '#8cff6b'], ['РЕГИСТРАЦИЯ', '#3fe6e0'], ['ПОСАДКА', '#ffd84f'], ['ВЫЛЕТЕЛ', '#b0b0c0'], ['ЗАДЕРЖАН', '#ff4f5a']];
      const flights = CITIES.slice(0, 8).map((c, i) => ({ city: c, code: ['NB', 'PA', 'EA', 'VX'][i % 4] + ' ' + (100 + i * 37 % 900), gate: 1 + i % 3, min: 13 * 60 + 20 + i * 35, st: i % 3 }));
      const boards = [];
      const drawBoard = (g, w, h, title) => {
        g.fillStyle = '#0c0e16'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffd84f'; g.font = 'bold 34px Rubik, Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
        g.fillText(title, 24, 30); g.fillStyle = '#8a8fa8'; g.font = '600 20px Rubik, Arial, sans-serif';
        g.fillText('ВРЕМЯ', 24, 70); g.fillText('НАПРАВЛЕНИЕ', 150, 70); g.fillText('РЕЙС', 520, 70); g.fillText('ВЫХОД', 660, 70); g.fillText('СТАТУС', 780, 70);
        flights.forEach((f, i) => {
          const y = 104 + i * 27; g.fillStyle = i % 2 ? '#141826' : '#10131e'; g.fillRect(16, y - 13, w - 32, 26);
          g.font = 'bold 22px "Courier New", monospace'; g.fillStyle = '#f5e8c8';
          g.fillText(String((f.min / 60 | 0) % 24).padStart(2, '0') + ':' + String(f.min % 60).padStart(2, '0'), 24, y);
          g.fillText(f.city, 150, y); g.fillText(f.code, 520, y); g.fillText(String(f.gate), 690, y);
          g.fillStyle = STATUS[f.st][1]; g.fillText(STATUS[f.st][0], 780, y);
        });
      };
      const board = (face, cx, cy, cz, w, hh) => { const t = K.tex(1024, 320, (g, W, Hh) => drawBoard(g, W, Hh, 'ВЫЛЕТ · DEPARTURES'), false); K.picture(face, cx, cy, cz, w, hh, t); boards.push(t); };
      function tickBoards() {
        for (const f of flights) { f.st++; if (f.st > 3) { f.st = Math.random() < .2 ? 4 : 0; f.min += 8 * 60 + ((Math.random() * 12) | 0) * 5; f.city = CITIES[(Math.random() * CITIES.length) | 0]; } }
        flights.sort((a, b) => a.min - b.min);
        for (const t of boards) { const g = t.image.getContext('2d'); drawBoard(g, t.image.width, t.image.height, 'ВЫЛЕТ · DEPARTURES'); t.needsUpdate = true; }
      }

      /* --- check-in: four airline desks with agents, belts, queues, airline boards behind --- */
      K.box(-28.5, 0, 11.6, -8.5, 3.4, 11.95, '#1c2a4a', true);
      K.neon(-28.5, 3.4, 11.55, -8.5, 3.48, 11.6, '#ff4fa3', false);
      const AIR = [['NEON AIR', '#ff4fa3'], ['PAN ATLANTIC', '#3fe6e0'], ['EASTWIND', '#ffd84f'], ['VICE EXPRESS', '#8cff6b']];
      [-25, -20.5, -16, -11.5].forEach((x, i) => {
        K.box(x - 1.6, 0, 9, x + 1.6, 1.05, 9.8, '#f5f5f0', true); K.box(x - 1.65, 1.05, 8.95, x + 1.65, 1.12, 9.85, '#8a8a96');
        K.box(x - 1.6, .25, 8.96, x + 1.6, .34, 9.0, AIR[i][1]);
        K.box(x + 1.7, 0, 9, x + 2.5, .55, 11.4, '#3a3a42', true); K.box(x + 1.75, .55, 9.05, x + 2.45, .58, 11.35, '#1a1a1e');   // the luggage belt
        K.picture('-z', x, 2.3, 11.55, 3.6, .9, T.sign(AIR[i][0], 'стойка регистрации ' + (i + 1), AIR[i][1], '#101828'));
        spots.push(K.spot({ kind: 'idle', x, z: 10.5, heading: Math.PI, type: i % 2 ? 'business_m' : 'business_f', home: true }));
        // a queue between ribbon posts
        for (const px of [x - 1.1, x + 1.1]) for (let z = 3.6; z <= 7.6; z += 2) { K.box(px - .05, 0, z - .05, px + .05, .95, z + .05, '#c8c8d0'); }
        for (const px of [x - 1.1, x + 1.1]) K.box(px - .02, .85, 3.6, px + .02, .92, 7.6, '#2a4a8a');
        for (let z = 7.8, n = 0; z > 3.4 && n < 4; z -= 1.1, n++) if (Math.random() < .7) spots.push(K.spot({ kind: 'idle', x: x + (Math.random() - .5) * .3, z, heading: 0, mix: 'town', home: true }));
      });
      board('-z', -18.5, 5.6, 11.52, 14, 4.3);
      K.box(-28.5, 0, -2, -26.5, .9, 1, '#8a6a4a', true); K.box(-28.45, .9, -1.9, -26.55, 1.5, .9, '#6a4a3a');   // a stack of luggage by the wall
      // seats by the entrance for people waiting to be picked up
      for (let x = 8; x < 26; x += 1) { K.box(x, 0, 2.2, x + .8, .45, 3, '#2a4a7a'); K.box(x, .45, 2.95, x + .8, 1, 3.05, '#2a4a7a'); seat(.3, K.spot({ kind: 'sit', x: x + .4, z: 2.6, y: .5, heading: Math.PI, mix: 'town', home: true })); }
      K.solid(8, 0, 2.2, 26, .5, 3.05);
      board('-z', 17, 5.6, 11.52, 14, 4.3); K.box(9, 3.2, 11.6, 25, 7.8, 11.95, '#1c2a4a', true);

      /* --- security: glass partitions, two metal detector arches with scanners, officers --- */
      for (const [a, b] of [[-29.8, -5.2], [5.2, 29.8]]) { K.box(a, 0, 12.9, b, 2.2, 13.1, '#a8c8dc', true); K.box(a, 2.2, 12.85, b, 2.3, 13.15, '#8a8a96'); }
      for (const x of [-2, 2]) {
        for (const s of [-1, 1]) K.box(x + s * .8 - .1, 0, 12.8, x + s * .8 + .1, 2.3, 13.2, '#d0d4dc', true);
        K.box(x - .9, 2.3, 12.8, x + .9, 2.55, 13.2, '#d0d4dc'); K.neon(x - .6, 2.32, 12.78, x + .6, 2.4, 12.8, '#8cff6b', false);
        const bx = x + (x < 0 ? -1.9 : 1.9);
        K.box(bx - .45, 0, 11, bx + .45, .85, 15, '#5a5a64', true); K.box(bx - .5, .85, 12.5, bx + .5, 1.6, 13.5, '#8a8a96');   // the X-ray belt
        K.screen(x < 0 ? '+z' : '+z', bx, 1.4, 13.52, .7, .45, 3);
        spots.push(K.spot({ kind: 'guard', x: x + (x < 0 ? -1 : 1) * 1.5, z: 14.1, heading: Math.PI, mix: 'guard', home: true }));
      }
      K.box(-5.2, 0, 12.9, -2.9, 1, 13.1, '#a8c8dc', true); K.box(2.9, 0, 12.9, 5.2, 1, 13.1, '#a8c8dc', true);

      /* --- Duty Free: shelves of bottles, perfume counters, a cashier --- */
      K.floor(8, 16, 29.8, 25.5, T.darkTile, 1.2, .006);
      K.box(8, 5.2, 15.6, 29.8, 6.3, 15.9, '#141018'); K.picture('-z', 19, 5.75, 15.58, 9, 1.05, T.sign('DUTY FREE', 'духи · виски · сигары · сувениры', '#ff4fa3', '#141018'));
      const BOT = ['#ffd84f', '#3fe6e0', '#ff4fa3', '#8cff6b', '#f5e8c8', '#c28bff', '#ff8a3d'];
      const shelf = (x0, z0, x1, z1, alongX) => {
        K.box(x0, 0, z0, x1, 2.2, z1, '#3a2a30', true);
        for (let lv = 0; lv < 3; lv++) for (let s = (alongX ? x0 : z0) + .25; s < (alongX ? x1 : z1) - .2; s += .32) {
          const y = .55 + lv * .6, c = BOT[(Math.random() * BOT.length) | 0];
          if (alongX) K.neon(s, y, z0 - .12, s + .16, y + .32, z0 - .02, c, false); else K.neon(x0 - .12, y, s, x0 - .02, y + .32, s + .16, c, false);
        }
      };
      shelf(28.8, 17, 29.6, 25, false); shelf(10, 25, 28, 25.6, true);
      for (const x of [13, 19, 25]) { K.box(x - 1.2, 0, 19.2, x + 1.2, .95, 20.4, '#f5f5f0', true); K.box(x - 1.15, .95, 19.25, x + 1.15, 1.35, 20.35, '#bfe0f0'); for (let k = 0; k < 5; k++) K.neon(x - 1 + k * .45, .98, 19.6, x - .8 + k * .45, 1.2, 19.9, BOT[(k + x) % BOT.length], false); K.neon(x - 1.2, .2, 19.18, x + 1.2, .26, 19.22, '#ff4fa3', false); }
      K.box(9, 0, 22.5, 12.5, 1.05, 23.4, '#141018', true); K.neon(9, 1.05, 22.45, 12.5, 1.1, 23.45, '#ff4fa3', false);
      spots.push(K.spot({ kind: 'idle', x: 10.7, z: 24, heading: Math.PI, type: 'business_f', home: true }));
      spots.push(K.spot({ kind: 'walk', x: 12, z: 17.2, heading: 0, mix: 'town', patrol: [[12, 17.3], [26, 17.3], [26, 21.8], [15, 21.8]] }));
      spots.push(K.spot({ kind: 'walk', x: 24, z: 21.6, heading: 0, mix: 'town', patrol: [[26.5, 21.7], [16, 21.7], [16, 17.4], [26.5, 17.4]] }));

      /* --- the café: a counter, a coffee machine, tables --- */
      K.box(-29.6, 0, 16.5, -28.2, 1.05, 24.5, '#8a5a3a', true); K.box(-29.65, 1.05, 16.45, -28.15, 1.12, 24.55, '#f5f0e6');
      K.box(-29.8, 1.12, 18, -29.3, 1.8, 19, '#3a3a42'); K.neon(-29.3, 1.5, 18.2, -29.28, 1.6, 18.8, '#ff4f5a', false);
      K.picture('+x', -29.78, 3.4, 20.5, 6, 1.1, T.sign('CAFÉ AEROPORT', 'кофе · сэндвичи · пончики', '#ffd84f', '#2a1810'));
      spots.push(K.spot({ kind: 'idle', x: -29.05, z: 21, heading: Math.PI / 2, type: 'waitress', home: true }));
      for (const x of [-24, -19.5]) for (const z of [18.5, 22.5]) {
        K.box(x - .5, 0, z - .5, x + .5, .78, z + .5, '#f5f5f0', true);
        for (const s of [-1, 1]) { K.box(x + s * .95 - .25, 0, z - .25, x + s * .95 + .25, .48, z + .25, '#8a5a3a', true); seat(.6, K.spot({ kind: 'sit', x: x + s * .95, z, y: .52, heading: s < 0 ? Math.PI / 2 : -Math.PI / 2, mix: 'town', home: true })); }
      }

      /* --- the gates: rows of seats facing the window, three desks, the runway outside --- */
      const view = K.tex(1024, 180, (g, w, h) => {
        const sky = g.createLinearGradient(0, 0, 0, h * .6); sky.addColorStop(0, '#6fa8e0'); sky.addColorStop(1, '#f4c0a0'); g.fillStyle = sky; g.fillRect(0, 0, w, h * .6);
        g.fillStyle = '#4fb8c8'; g.fillRect(0, h * .5, w, h * .1); g.fillStyle = '#6aa860'; g.fillRect(0, h * .6, w, h * .4);
        g.fillStyle = '#48454f'; g.fillRect(0, h * .68, w, h * .16); g.fillStyle = '#f5f5f0'; for (let x = 10; x < w; x += 60) g.fillRect(x, h * .755, 30, 3);
        const plane = (x, y, s, liv) => { g.fillStyle = '#f5f5f0'; g.fillRect(x, y, 200 * s, 26 * s); g.beginPath(); g.moveTo(x + 200 * s, y); g.lineTo(x + 230 * s, y + 13 * s); g.lineTo(x + 200 * s, y + 26 * s); g.fill();
          g.fillStyle = liv; g.fillRect(x, y + 17 * s, 200 * s, 4 * s); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 * s, y - 36 * s); g.lineTo(x + 36 * s, y - 36 * s); g.lineTo(x + 44 * s, y); g.fill();
          g.fillStyle = '#d8d8e0'; g.fillRect(x + 80 * s, y + 18 * s, 60 * s, 8 * s); g.fillStyle = '#22304a'; for (let k = 0; k < 16; k++) g.fillRect(x + 50 * s + k * 9 * s, y + 8 * s, 5 * s, 5 * s); };
        plane(140, h * .6, .9, '#ff4fa3'); plane(620, h * .52, .55, '#2a6fe8');
        g.fillStyle = '#d8d8e0'; g.fillRect(880, h * .3, 14, h * .35); g.fillStyle = '#28405a'; g.fillRect(870, h * .26, 34, 14);
      }, false);
      K.picture('-z', 0, 4.4, 33.8, 58, 6.2, view);
      for (let x = -28; x <= 28; x += 4) K.box(x - .08, .8, 33.7, x + .08, 7.5, 33.85, '#d0d4dc');
      for (const z of [28, 30.6]) for (const [a, b] of [[-26, -3], [3, 26]]) {
        for (let x = a; x < b - .2; x += .9) { K.box(x, 0, z - .35, x + .8, .45, z + .35, '#3a5a8a'); K.box(x, .45, z - .42, x + .8, 1, z - .34, '#3a5a8a'); seat(.16, K.spot({ kind: 'sit', x: x + .4, z, y: .5, heading: 0, mix: 'town', home: true })); }
        K.box(a, 0, z - .1, b, .2, z + .1, '#8a8a96'); K.solid(a, 0, z - .42, b, .5, z + .35);
      }
      [[-16, 1, 'МАЙАМИ'], [0, 2, 'НЬЮ-ЙОРК'], [16, 3, 'ГАВАНА']].forEach(([x, n, city]) => {
        K.box(x - 1.3, 0, 32.2, x + 1.3, 1.05, 33, '#1c2a4a', true); K.box(x - 1.35, 1.05, 32.15, x + 1.35, 1.12, 33.05, '#8a8a96');
        K.picture('-z', x, 7.1, 33.5, 3.6, .9, T.sign('GATE ' + n, city, ['#ff4fa3', '#3fe6e0', '#ffd84f'][n - 1], '#101828'));
        spots.push(K.spot({ kind: 'idle', x, z: 33.4, heading: Math.PI, type: n % 2 ? 'business_f' : 'business_m', home: true }));
        for (let k = 0; k < 3; k++) if (Math.random() < .7) spots.push(K.spot({ kind: 'idle', x: x - .8 + k * .8, z: 31.6, heading: 0, mix: 'town', home: true }));
      });
      board('-z', -24, 5.6, 26.2, 9, 2.8); K.box(-28.6, 3.9, 26.25, -19.4, 7.3, 26.4, '#1c2a4a');
      // people on the move between the entrance, security, the café and the gates
      for (const pts of [[[-4, -1], [-4, 25.5], [4, 25.5], [4, -1]], [[-5, 15.3], [-26.3, 15.3], [-26.3, 25], [-5, 25]], [[-26, 26.7], [26, 26.7], [26, 27], [-26, 27]], [[-26, -2.5], [-7, -2.5], [-7, 1.6], [-26, 1.6]], [[26, -2.5], [6, -2.5], [6, .5], [26, .5]]])
        for (const off of [0, 2]) spots.push(K.spot({ kind: 'walk', x: pts[off][0], z: pts[off][1], heading: 0, mix: 'town', patrol: off ? pts.slice(off).concat(pts.slice(0, off)) : pts }));

      let bt = 0;
      pl.update = (dt) => { bt += dt; if (bt > 14) { bt = 0; tickBoards(); } };
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(10.7, 21.7), r: 1.8, short: 'КУПИТЬ', label: () => 'Duty Free', use: () => G.ui.menu({ eyebrow: 'Аэропорт', title: 'Duty Free', items: () => [
            { name: 'Шоколад «Neon»', desc: '+15 здоровья', price: 8, buy: () => { G.player.hp = Math.min(100, G.player.hp + 15); return 'Тает во рту'; } },
            { name: 'Виски «Neon Gold»', desc: '+40 здоровья, для храбрости', price: 60, buy: () => { G.player.hp = Math.min(100, G.player.hp + 40); return 'Мягкий, с дымком'; } },
            { name: 'Сигары «Habana Royal»', desc: 'коробка из 10 штук', price: 50, buy: () => 'Настоящий Майами-стиль' },
            { name: 'Духи «Pink Flamingo»', desc: 'для особого случая', price: 120, buy: () => 'Пахнет закатом и деньгами' },
            { name: 'Очки-авиаторы', desc: 'как у пилотов', price: 90, buy: () => 'Сидят идеально' },
            { name: 'Золотые часы', desc: 'швейцарские, почти', price: 1500, buy: () => 'Время — деньги' }
          ] }) },
          { ...pl.P(-27.6, 20.5), r: 1.9, short: 'КАФЕ', label: () => 'Café Aeroport', use: () => G.ui.menu({ eyebrow: 'Аэропорт', title: 'Café Aeroport', items: () => [
            { name: 'Капучино', desc: '+10 здоровья', price: 4, buy: () => { G.player.hp = Math.min(100, G.player.hp + 10); return 'С корицей'; } },
            { name: 'Сэндвич с тунцом', desc: '+30 здоровья', price: 9, buy: () => { G.player.hp = Math.min(100, G.player.hp + 30); return 'Свежий!'; } },
            { name: 'Пончик в глазури', desc: '+15 здоровья', price: 3, buy: () => { G.player.hp = Math.min(100, G.player.hp + 15); return 'Розовая глазурь, конечно'; } }
          ] }) },
          { ...pl.P(-18.5, 7.2), r: 3, short: 'ТАБЛО', label: () => 'Табло вылетов', use: () => { const f = flights.find(q => q.st === 1 || q.st === 2) || flights[0]; G.flash('Рейс ' + f.code + ' в ' + f.city + ': ' + STATUS[f.st][0].toLowerCase() + ', выход ' + f.gate, 3); } }
        ];
      };
    }

    /* ---------------------------------------------------------------
       9. THE VILLA: bought on the beach, with a garage for two cars and a pool;
          inside a living room with a TV and a bedroom with a round bed and a wardrobe
       --------------------------------------------------------------- */
    const VILLA_PRICE = 500000;   // the beach villa with a pool and a garage: luxury, on the same ladder as the homes in shops.js (rent there)
    let villaDoor = null, garage = null;
    {
      K.at(0, 0);
      const WHITE = '#f6f2ec', GLASS = '#1f3a4a', PINK = '#ff7eb6';
      // garage: two bays, a roller door facing the promenade
      K.box(111.2, 0, 80.4, 119, 3.2, 80.7, WHITE, true); K.box(111.2, 0, 88.7, 119, 3.2, 89, WHITE, true); K.box(118.7, 0, 80.4, 119, 3.2, 89, WHITE, true);
      K.box(111.2, 0, 80.4, 111.5, 3.2, 81, WHITE, true); K.box(111.2, 0, 88.4, 111.5, 3.2, 89, WHITE, true);
      K.box(111.2, 2.8, 81, 111.5, 3.2, 88.4, WHITE, true);
      K.box(111, 3.2, 80.2, 119.2, 3.45, 89.2, '#e4ddd2', true);
      K.box(111.5, .02, 80.7, 118.7, .04, 88.7, '#8a8690');
      K.neon(110.95, 2.95, 81, 111.05, 3.05, 88.4, '#3fe6e0');
      K.box(109.5, .03, 81, 111.2, .05, 88.4, '#9a96a0');
      K.ceil(111.5, 80.7, 118.7, 88.7, 3.19, '#d8d0c4');
      const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(.12, 2.8, 7.4).translate(0, 1.4, 0), new THREE.MeshLambertMaterial({ color: 0xd8d4cc }));
      doorMesh.position.set(111.33, 0, 84.7); scene.add(doorMesh);
      for (let k = 1; k < 7; k++) { const line = new THREE.Mesh(new THREE.BoxGeometry(.13, .03, 7.4), new THREE.MeshLambertMaterial({ color: 0xb8b2a8 })); line.position.set(0, k * .4, 0); doorMesh.add(line); }
      const doorCol = col.add(111.1, 0, 81, 111.55, 2.8, 88.4);
      garage = { bays: [{ x: 115.2, z: 82.85, h: -Math.PI / 2 }, { x: 115.2, z: 86.55, h: -Math.PI / 2 }], rect: { x0: 111.6, x1: 118.6, z0: 80.8, z1: 88.6 }, doorMesh, doorCol, open: 0 };
      // perimeter wall with a gate
      K.box(111.2, 0, 103.4, 133.5, 1.3, 103.7, WHITE, true);
      K.box(111.2, 0, 89, 111.5, 1.3, 92.4, WHITE, true); K.box(111.2, 0, 96.6, 111.5, 1.3, 103.7, WHITE, true);
      K.box(119, 0, 80.1, 133.5, 1.3, 80.4, WHITE, true);
      for (const z of [92.1, 96.6]) { K.box(111, 0, z - .15, 111.7, 1.8, z + .15, WHITE, true); K.neon(111.2, 1.8, z - .1, 111.5, 2.05, z + .1, PINK); }
      // the house: two white storeys, bands of dark glass, a pink stripe and neon under the roof
      K.box(119.5, 0, 90, 127.5, 3.6, 101.5, WHITE, true);
      K.box(119.44, .5, 91, 119.5, 3.1, 93.6, GLASS); K.box(119.44, .5, 95.6, 119.5, 3.1, 100.6, GLASS);
      K.box(127.5, .5, 90.8, 127.56, 3.1, 100.8, GLASS);
      K.box(119.4, 3.5, 89.9, 127.6, 3.72, 101.6, PINK);
      K.box(120.5, 3.72, 91, 127, 7, 100.5, WHITE, true);
      K.box(120.44, 4.3, 91.8, 120.5, 6.4, 99.8, GLASS); K.box(127, 4.3, 91.8, 127.06, 6.4, 99.8, GLASS);
      K.box(119.2, 7, 89.7, 127.8, 7.25, 101.8, '#e4ddd2', true); K.neon(119.2, 6.93, 89.7, 127.8, 7.0, 89.8, PINK); K.neon(119.2, 6.93, 101.7, 127.8, 7.0, 101.8, PINK); K.neon(127.7, 6.93, 89.7, 127.8, 7.0, 101.8, PINK); K.neon(119.2, 6.93, 89.7, 119.3, 7.0, 101.8, PINK);
      K.box(117.8, 2.9, 93.2, 119.5, 3.1, 95.8, '#e4ddd2');
      K.box(119.44, 0, 93.9, 119.5, 2.5, 95.1, '#3a2a30'); K.neon(119.4, 2.5, 93.8, 119.46, 2.6, 95.2, '#3fe6e0');
      villaDoor = { x: 118.2, z: 94.5, y: .02, heading: -Math.PI / 2, nx: -1, nz: 0, hex: '#ff7eb6' };
      // terrace with a pool facing the ocean
      const dy = .38;
      for (const [a, b, c, d] of [[127.5, 81, 133.5, 85], [127.5, 95, 133.5, 103.2], [127.5, 85, 128.6, 95], [132.4, 85, 133.5, 95]]) K.box(a, 0, b, c, dy, d, '#efe4d6', true);
      K.box(128.6, 0, 85, 132.4, .03, 95, '#3fb3c7');
      for (const [a, b, c, d] of [[128.6, 85, 128.7, 95], [132.3, 85, 132.4, 95], [128.6, 85, 132.4, 85.1], [128.6, 94.9, 132.4, 95]]) K.box(a, 0, b, c, dy - .01, d, '#4fc9d6');
      const water = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 9.8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5fd6e6, transparent: true, opacity: .75 }));
      water.position.set(130.5, .3, 90); scene.add(water);
      // deep enough to swim; you climb out over the edge onto the deck
      NB.water.add({ name: 'villapool', test: (x, z) => x > 128.7 && x < 132.3 && z > 85.1 && z < 94.9, surface: () => .3, floor: () => -1.3 });
      for (const z of [97.5, 100]) { K.box(129, dy, z, 131.5, dy + .32, z + .7, '#ffffff', true); K.box(131.1, dy + .32, z, 131.5, dy + .8, z + .7, '#ffffff'); K.box(129.1, dy + .33, z + .1, 131, dy + .35, z + .6, PINK); }
      palms.push([133, .02, 80.8], [133, .38, 102.6], [110.2, .02, 98.2], [128.2, .38, 82]);
      mapShapes.push({ x0: 111.2, z0: 80.4, x1: 119, z1: 89, c: '#f6f2ec', k: 'b' }, { x0: 119.5, z0: 90, x1: 127.5, z1: 101.5, c: '#ffd6e6', k: 'b' }, { x0: 128.6, z0: 85, x1: 132.4, z1: 95, c: '#4fc9d6', k: 'p' });
      // for-sale board at the gate
      const saleTex = K.tex(256, 160, (g, w, h) => {
        g.fillStyle = '#fff6ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#e0286a'; g.fillRect(0, 0, w, 44);
        g.fillStyle = '#fff'; g.font = 'bold 30px Rubik, Arial, sans-serif'; g.textAlign = 'center'; g.fillText('ПРОДАЁТСЯ', w / 2, 32);
        g.fillStyle = '#2a1a24'; g.font = 'bold 26px Rubik, Arial, sans-serif'; g.fillText('Вилла у океана', w / 2, 84);
        g.fillStyle = '#1a8a5a'; g.font = '900 38px Rubik, Arial, sans-serif'; g.fillText('$' + VILLA_PRICE.toLocaleString('ru-RU'), w / 2, 132);
      }, false);
      const sale = new THREE.Group();
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.25).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: saleTex }));
      board.position.set(110.1, 1.6, 90.6); sale.add(board);
      for (const z of [89.8, 91.4]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.4, .08).translate(0, .7, 0), new THREE.MeshLambertMaterial({ color: 0xffffff })); post.position.set(110.15, 0, z); sale.add(post); }
      scene.add(sale);
      const pl = interior('villa', 'Вилла', villaDoor, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-8, -6, 8, 14], light: lit('#fff6f0', '#806a70', 1.0) });
      pl.enabled = () => !!G && G.progress.villa && (!G.homeOk || G.homeOk('villa'));
      pl.locked = () => G && G.progress.villa ? 'Аренда виллы не оплачена — как только будут наличные, она спишется сама' : 'Вилла продаётся — купите её у ворот за $' + VILLA_PRICE.toLocaleString('ru-RU');
      K.at(pl.ox, pl.oz);
      K.room(-8, -6, 8, 6, 3.4, { wall: '#f8f4f0', ceil: '#f0ebe4', trim: '#d8cfc4', neon: '#ff7eb6', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }], '+z': [{ c: 4, w: 1.4, h: 2.5 }] } });
      K.floor(-8, -6, 8, 6, T.whiteTile, 1.2); K.floor(-5.5, -3.5, 1.5, 2, T.carpetPink, 1.5, .01);
      // the big window with the ocean at sunset
      K.picture('-z', -3, 1.9, 5.83, 8, 2, K.tex(512, 128, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h * .6); gr.addColorStop(0, '#3a2466'); gr.addColorStop(.6, '#f26b9e'); gr.addColorStop(1, '#ffb070'); g.fillStyle = gr; g.fillRect(0, 0, w, h * .6);
        g.fillStyle = '#ffd86a'; g.beginPath(); g.arc(w * .6, h * .6, 30, Math.PI, 0); g.fill();
        g.fillStyle = '#244d8c'; g.fillRect(0, h * .6, w, h * .4); g.fillStyle = 'rgba(255,200,140,.6)'; for (let k = 0; k < 12; k++) g.fillRect(w * .6 - 30 + Math.random() * 60, h * .62 + k * 4, 20 + Math.random() * 30, 2);
        g.fillStyle = '#1a1a22'; for (let x = 0; x < w; x += w / 4) g.fillRect(x, 0, 4, h);
      }, false));
      K.box(-6.5, 0, -1, -2, .5, -.2, '#ffffff', true); K.box(-6.5, .5, -1, -2, 1.15, -.75, '#ffffff'); K.box(-6.5, 0, -1, -5.7, .5, 3, '#ffffff', true); K.box(-6.5, .5, -.2, -6.25, 1.15, 3, '#ffffff');
      for (let x = -6; x < -2; x += 1.1) K.box(x, .5, -.7, x + .6, .7, -.45, pick(['#ff7eb6', '#3fe6e0', '#ffd84f']));
      K.box(-4.6, 0, .6, -2.6, .42, 1.8, '#9fdfff', true);
      K.box(7.2, 0, -2.5, 7.9, .7, 2.5, '#2a2a30', true); K.box(7.35, .7, -1.6, 7.45, 2.1, 1.6, '#141418'); K.screen('-x', 7.33, 1.4, 0, 3, 1.3, 2);
      K.box(-7.9, 0, -5.8, -7.2, 1.1, -2, '#3a2a30', true); for (let z = -5.5; z < -2.2; z += .35) K.box(-7.8, 1.1, z, -7.65, 1.1 + rand(.25, .4), z + .12, pick(['#5fd38a', '#ffb347', '#ff6b8a', '#f5e6a8']));
      K.neon(-7.84, 1.6, -1.2, -7.8, 2.8, -1.1, '#ff7eb6'); K.neon(-7.84, 2.7, -1.1, -7.8, 2.8, .1, '#ff7eb6'); K.neon(-7.84, 1.6, .1, -7.8, 2.7, .2, '#3fe6e0');
      const pot = (x, z) => { K.box(x - .3, 0, z - .3, x + .3, .6, z + .3, '#ffffff', true); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; K.box(x + Math.cos(a) * .12 - .05, .6, z + Math.sin(a) * .12 - .05, x + Math.cos(a) * .6, 1.4 + (k % 2) * .3, z + Math.sin(a) * .6, '#2f8a44'); } };
      pot(7, -5.2); pot(-7, 5.2); pot(7, 5.2);
      // bedroom
      K.room(0, 6.3, 8, 14, 3.4, { wall: '#f8eef2', ceil: '#f0e4ea', trim: '#d8cfc4', neon: '#3fe6e0', gaps: { '-z': [{ c: 4, w: 1.4, h: 2.5 }] } });
      K.floor(0, 6.3, 8, 14, T.wood, 2);
      const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, .55, 32).translate(0, .275, 0), new THREE.MeshLambertMaterial({ color: 0xffffff })); bed.position.set(K.wx(4.6), 0, K.wz(10.8)); scene.add(bed);
      const cover = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, .12, 32).translate(0, .6, 0), new THREE.MeshLambertMaterial({ color: 0xff7eb6 })); cover.position.copy(bed.position); scene.add(cover);
      K.solid(3.2, 0, 9.4, 6, .66, 12.2); K.box(3.2, 0, 12.3, 6, 1.4, 12.6, '#ffffff', true);
      K.box(.3, 0, 8, .9, 2.6, 12.5, '#e8dce4', true); K.box(.9, .2, 8.2, .92, 2.4, 10.2, '#bcd8e8'); K.box(.9, .2, 10.3, .92, 2.4, 12.3, '#bcd8e8');
      K.picture('-z', 4.6, 2.3, 13.83, 2.4, 1.4, K.tex(256, 160, (g, w, h) => { g.fillStyle = '#1a1030'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff7eb6'; g.lineWidth = 6; g.shadowColor = '#ff7eb6'; g.shadowBlur = 12; g.beginPath(); g.moveTo(90, 130); g.lineTo(96, 80); g.quadraticCurveTo(80, 40, 110, 30); g.quadraticCurveTo(150, 30, 140, 70); g.quadraticCurveTo(120, 80, 130, 100); g.stroke(); g.beginPath(); g.moveTo(96, 80); g.lineTo(110, 130); g.stroke(); }, false));
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(4.6, 8.8), r: 1.7, short: 'СПАТЬ', label: () => 'Спать и сохраниться', use: () => G.sleep('Вы выспались. Игра сохранена.') },
          { ...pl.P(1.6, 10.2), r: 1.5, short: 'ОДЕЖДА', label: () => 'Гардероб', use: () => G.ui.wardrobe() }
        ];
      };
      K.at(0, 0);
      // online the villa has one owner on the server, like every home (shops.js)
      const villaOwner = () => !G.progress.villa && NB.net ? NB.net.owner('home', 'villa') : null;
      outdoor.push({ x: 109.3, z: 90.6, r: 1.8, short: 'КУПИТЬ', label: () => G.progress.villa ? null : villaOwner() ? 'Вилла · владелец ' + villaOwner() : 'Купить виллу · $' + VILLA_PRICE.toLocaleString('ru-RU'),
        use: () => {
          const why = NB.net ? NB.net.cantBuy('home', 'villa') : 'Нет связи с сервером';
          if (why) { G.flash(why, 2.6); G.audio.deny(); return; }
          if (!G.money.spend(VILLA_PRICE, 'Покупка виллы', 'home:villa')) return;
          G.progress.villa = true; G.save(); G.flash('Вилла ваша! Дверь открыта, гараж на две машины — ваш', 4); G.audio.fare();
          NB.net.claim('home', 'villa').then(ok => {
            if (ok || !G.progress.villa) return;
            G.progress.villa = false; G.money.add(VILLA_PRICE, 'Возврат: вилла', 'home:villa'); G.save();
            G.flash('Виллу купили чуть раньше вас — деньги вернули', 4);
          });
        } });
      pl.renderOutdoor = () => { sale.visible = !G || !G.progress.villa; };
    }

    /* ---------------------------------------------------------------
       10. TIKI BAR on the sand: thatched roof on stilts, a round bar, torches, hammocks
       --------------------------------------------------------------- */
    const tiki = { x: 125, z: -67 };
    const torches = [];
    {
      K.at(0, 0);
      const dy = .38, BAMBOO = '#c9a06a';
      K.box(120, 0, -72, 130, dy, -62, '#a8743c', true);
      for (let z = -71.6; z < -62; z += .5) K.box(120, dy, z, 130, dy + .005, z + .04, '#7a5028');
      for (const [x, z] of [[120.3, -71.7], [129.7, -71.7], [120.3, -62.3], [129.7, -62.3]]) K.box(x - .15, dy, z - .15, x + .15, 3.7, z + .15, '#7a5028', true);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(7.8, 2.6, 4, 1).rotateY(Math.PI / 4).translate(0, 1.3, 0), new THREE.MeshLambertMaterial({ color: 0xc9a86a }));
      roof.position.set(125, 3.6, -67); scene.add(roof);
      const fringe = new THREE.Mesh(new THREE.CylinderGeometry(7.1, 7.4, .35, 4, 1, true).rotateY(Math.PI / 4).translate(0, 3.55, 0), new THREE.MeshLambertMaterial({ color: 0xa8864a, side: THREE.DoubleSide }));
      fringe.position.set(125, 0, -67); scene.add(fringe);
      // the round bar and its shelves
      for (const [a, b, c, d] of [[122.6, -69.4, 127.4, -68.8], [122.6, -65.2, 127.4, -64.6], [122.6, -68.8, 123.2, -65.2], [126.8, -68.8, 127.4, -65.2]]) { K.box(a, dy, b, c, 1.45, d, BAMBOO, true); K.box(a - .05, 1.45, b - .05, c + .05, 1.52, d + .05, '#8a5a2a'); }
      K.box(124.5, dy, -67.5, 125.5, 2.6, -66.5, '#7a5028', true);
      for (let y = 1.2; y < 2.5; y += .45) for (const [x0, z0, x1, z1] of [[124.4, -67.6, 124.5, -66.4], [125.5, -67.6, 125.6, -66.4]]) for (let k = 0; k < 4; k++) K.box(x0, y, z0 + k * .3, x1 + (x0 < 125 ? -.05 : .05), y + .3, z0 + k * .3 + .1, pick(['#5fd38a', '#ffb347', '#ff6b8a', '#f5e6a8', '#9fd8ff']));
      spots.push(K.spot({ kind: 'idle', x: 123.8, z: -67, heading: -Math.PI / 2, type: 'tourist_m', home: true }));
      const stools = [[121.9, -68.2], [121.9, -65.8], [124, -70.1], [126, -70.1], [128.1, -68.2], [128.1, -65.8], [124, -63.9], [126, -63.9]];
      for (const [x, z] of stools) {
        K.box(x - .05, dy, z - .05, x + .05, 1.0, z + .05, '#7a5028'); K.box(x - .22, 1.0, z - .22, x + .22, 1.06, z + .22, BAMBOO); K.solid(x - .18, 0, z - .18, x + .18, 1.06, z + .18);
        const face = Math.atan2(125 - x, -67 - z);
        seat(.5, K.spot({ kind: 'sit', x: x - Math.sin(face) * .05, z: z - Math.cos(face) * .05, y: 1.12, heading: face, mix: 'beach', home: true }));
      }
      // string lights under the roof edge, torches at the corners
      const BULBS = ['#ff4fa3', '#ffd84f', '#3fe6e0', '#8cff6b', '#ff8a3d'];
      let bi = 0;
      for (const [x0, z0, x1, z1] of [[120, -72, 130, -72], [130, -72, 130, -62], [130, -62, 120, -62], [120, -62, 120, -72]]) for (let t = 0; t < 1; t += .1) { const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; K.neon(x - .07, 3.35 - Math.sin(t * Math.PI) * .25, z - .07, x + .07, 3.49 - Math.sin(t * Math.PI) * .25, z + .07, BULBS[bi++ % BULBS.length]); }
      const flameTex = K.tex(64, 64, (g, s) => { const gr = g.createRadialGradient(s / 2, s * .6, 0, s / 2, s * .6, s / 2); gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(.35, 'rgba(255,150,40,.9)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, false);
      for (const [x, z] of [[119.4, -72.6], [130.6, -72.6], [119.4, -61.4], [130.6, -61.4]]) {
        K.box(x - .06, 0, z - .06, x + .06, 1.9, z + .06, '#5a3a1a', true); K.box(x - .12, 1.9, z - .12, x + .12, 2.1, z + .12, '#3a2a1a');
        const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        f.position.set(x, 2.35, z); f.scale.set(.6, .8, 1); scene.add(f); torches.push(f);
      }
      // hammock between two palms
      palms.push([133.4, .02, -73.2], [133.4, .02, -66.4]);
      for (let k = 0; k <= 12; k++) { const z = -72.6 + k * .5, sag = Math.sin(k / 12 * Math.PI) * .45; K.box(133.05, 1.35 - sag, z, 133.75, 1.4 - sag, z + .5, k % 2 ? '#ff7eb6' : '#fff0d8'); }
      K.solid(133, 0, -72, 133.8, .9, -67);
      spots.push(K.spot({ kind: 'lie', x: 133.4, z: -71.4, y: 1.05, heading: 0, mix: 'beach', home: true }));
      const tikiSign = K.tex(256, 96, (g, w, h) => { g.fillStyle = '#6a3a18'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a1a08'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = '#ffd84f'; g.font = 'bold 50px "Trebuchet MS", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ff8a3d'; g.shadowBlur = 10; g.fillText('TIKI BAR', w / 2, h / 2 + 2); }, false);
      K.picture('-x', 119.3, 2.6, -67, 3, 1.1, tikiSign, true);
      K.box(119.35, 0, -68.3, 119.45, 2.1, -68.1, '#5a3a1a', true); K.box(119.35, 0, -65.9, 119.45, 2.1, -65.7, '#5a3a1a', true);
      mapShapes.push({ x0: 120, z0: -72, x1: 130, z1: -62, c: '#c9a06a', k: 'b' });
      outdoor.push({ x: 121.7, z: -67, r: 1.9, short: 'БАР', label: () => 'Тики-бар: коктейли', use: () => G.ui.menu({ eyebrow: 'Тики-бар', title: 'Коктейли', items: () => [
        { name: 'Коктейль «Закат»', desc: '+30 здоровья', price: 15, buy: () => { G.player.hp = Math.min(100, G.player.hp + 30); return 'Освежает!'; } },
        { name: 'Пина колада', desc: '+20 здоровья', price: 10, buy: () => { G.player.hp = Math.min(100, G.player.hp + 20); return 'Кокос и ананас'; } },
        { name: 'Кокосовая вода', desc: '+10 здоровья', price: 4, buy: () => { G.player.hp = Math.min(100, G.player.hp + 10); return 'Прямо из кокоса'; } }
      ] }) });
    }

    /* ---------------------------------------------------------------
       11. THE YACHT "LEHA NEPLOXO": at anchor out in the open sea south-east of the city. Swim to the stern, climb onto the bathing
           platform and up the steps: a party on the aft deck, a bar, a DJ, a jacuzzi and sunbeds up top
       --------------------------------------------------------------- */
    // drawn round (173, -25) and moved as a whole to where it lies at anchor, (200, 200)
    const YDX = 27, YDZ = 225;
    const yacht = { x: 173 + YDX, z: -25 + YDZ, x0: 168.4 + YDX, x1: 177.6 + YDX, z0: -43.3 + YDZ, z1: -8 + YDZ, deck: 2 };
    let jacuzziMat = null, underGlow = null;
    {
      K.at(YDX, YDZ);
      const WH = '#f7f6f2', TEAK = '#b07a48', NAVY = '#1c2a4a', GLASS = '#16263a', CHROME = '#d9d9e2', D = 2, UP = 4.4;
      NB.water.hole({ x0: yacht.x0, x1: yacht.x1, z0: yacht.z0, z1: yacht.z1 });
      // hull: the main body, two stern wings either side of the steps, and a bow narrowing to a point
      K.box(168.5, -1.2, -39.65, 177.5, D, -15, WH, true);
      K.box(168.5, -1.2, -41, 171, D, -39.65, WH, true); K.box(175, -1.2, -41, 177.5, D, -39.65, WH, true); K.box(171, -1.2, -41, 175, .25, -39.65, WH, true);
      const bow = [];
      for (let k = 0; k < 7; k++) { const f = Math.pow((k + 1) / 7, 1.5), hw = 4.5 * (1 - f * .92), za = -15 + k; bow.push([hw, za]); K.box(173 - hw, -1.2 + k * .15, za, 173 + hw, D, za + 1, WH, true); K.box(173 - hw + .15, D, za, 173 + hw - .15, D + .02, za + 1, TEAK); }
      for (const s of [-1, 1]) {
        const xo = s < 0 ? 168.44 : 177.5, xi = s < 0 ? 168.5 : 177.56;
        K.box(xo, .12, -41, xi, .6, -15, NAVY); K.box(xo, 1.9, -41, xi, 2.02, -15, CHROME);
        for (const [a, b] of [[-37, -30.5], [-28.5, -22.5], [-20.5, -16.5]]) K.box(xo, .95, a, xi, 1.45, b, GLASS);
        K.neon(s < 0 ? 168.38 : 177.56, 1.78, -41, s < 0 ? 168.44 : 177.62, 1.84, -15, '#ff4fa3');
      }
      K.box(168.5, .12, -41.06, 177.5, .6, -41, NAVY);
      // teak decks with plank lines
      K.box(168.7, D, -39.65, 177.3, D + .02, -15, TEAK); K.box(168.7, D, -41, 171, D + .02, -39.65, TEAK); K.box(175, D, -41, 177.3, D + .02, -39.65, TEAK);
      for (let x = 169.1; x < 177.2; x += .45) K.box(x, D + .021, -39.6, x + .025, D + .024, -15.1, '#8a5a32');
      // bathing platform and the steps up to the deck (a low invisible edge keeps the party on board)
      K.box(168.8, .25, -43.2, 177.2, .45, -41, TEAK, true);
      [.84, 1.23, 1.62].forEach((top, i) => K.box(171, .25, -41 + i * .45, 175, top, -40.55 + i * .45, TEAK, true));
      K.solid(168.8, .45, -43.35, 177.2, 1.15, -43.2); K.solid(168.65, .45, -43.2, 168.8, 1.15, -41); K.solid(177.2, .45, -43.2, 177.35, 1.15, -41);
      for (let x = 169; x <= 177.1; x += 1.35) K.box(x - .03, .45, -43.28, x + .03, 1.05, -43.22, CHROME);
      K.box(168.8, 1.0, -43.3, 177.2, 1.05, -43.2, CHROME);
      // chrome railings round the main deck (open at the steps) and along the bow
      const rail = (x0, z0, x1, z1, y = D) => {
        K.solid(x0, y, z0, x1, y + 1.05, z1); K.box(x0, y + .95, z0, x1, y + 1.0, z1, CHROME); K.box(x0, y + .5, z0, x1, y + .53, z1, CHROME);
        const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.3));
        for (let i = 0; i <= n; i++) { const px = x0 + (x1 - x0) * i / n, pz = z0 + (z1 - z0) * i / n; K.box(px - .025, y, pz - .025, px + .025, y + .95, pz + .025, CHROME); }
      };
      rail(168.6, -41, 168.7, -15); rail(177.3, -41, 177.4, -15); rail(168.6, -41, 171, -40.92); rail(175, -41, 177.4, -40.92);
      for (const [hw, za] of bow) { rail(173 - hw - .05, za, 173 - hw + .05, za + 1); rail(173 + hw - .05, za, 173 + hw + .05, za + 1); }
      // main cabin with a wraparound glass band, sliding doors onto the aft deck
      K.box(169.5, D, -30, 176.5, UP, -15, WH, true);
      K.box(169.44, 2.6, -29.4, 169.5, 3.9, -15.6, GLASS); K.box(176.5, 2.6, -29.4, 176.56, 3.9, -15.6, GLASS);
      K.box(170.1, D + .1, -30.06, 175.9, 4.0, -30, GLASS); K.neon(170.1, 4.02, -30.1, 175.9, 4.08, -30.04, '#3fe6e0', false);
      // the upper deck: an overhang over the aft deck, stairs up the port side
      K.box(169.5, 4.25, -33, 176.5, UP, -30, WH, true);
      for (const x of [169.6, 176.2]) K.box(x, D, -32.95, x + .2, 4.25, -32.75, CHROME, true);
      K.box(169.6, UP, -33, 176.4, UP + .02, -18.2, TEAK);
      for (let i = 0; i < 6; i++) K.box(175.4, .25, -36 + i * .5, 176.6, D + (i + 1) * .4, -35.5 + i * .5, TEAK, true);
      rail(169.45, -33, 169.55, -18.2, UP); rail(176.45, -33, 176.55, -18.2, UP); rail(169.45, -33.08, 175.35, -32.98, UP);
      // jacuzzi on the upper deck
      for (const [a, b, c, d] of [[171, -28, 175, -27.75], [171, -24.85, 175, -24.6], [171, -27.75, 171.25, -24.85], [174.75, -27.75, 175, -24.85]]) K.box(a, UP, b, c, UP + .55, d, '#e8f4f6', true);
      for (const [a, b, c, d] of [[171.25, -27.75, 174.75, -27.35], [171.25, -25.25, 174.75, -24.85], [171.25, -27.35, 171.65, -25.25], [174.35, -27.35, 174.75, -25.25]]) K.box(a, UP, b, c, UP + .12, d, '#bfe8ee');
      K.box(171.25, UP + .005, -27.75, 174.75, UP + .01, -24.85, '#4fc9d6');
      jacuzziMat = new THREE.ShaderMaterial({ transparent: true, uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vU;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
          void main(){ vec2 g = vU * vec2(14.0, 11.0); vec2 id = floor(g + vec2(0.0, uTime * 1.3)); vec2 f = fract(g + vec2(0.0, uTime * 1.3));
            float bub = step(0.8, h(id)) * smoothstep(0.28, 0.12, length(f - 0.5));
            float w = sin(vU.x * 18.0 + uTime * 3.0) * sin(vU.y * 15.0 - uTime * 2.4);
            gl_FragColor = vec4(mix(vec3(0.25,0.8,0.9), vec3(0.9,1.0,1.0), clamp(bub + smoothstep(0.6, 1.0, w) * 0.5, 0.0, 1.0)), 0.7); }` });
      const jw = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.9).rotateX(-Math.PI / 2), jacuzziMat); jw.position.set(K.wx(173), UP + .45, K.wz(-26.3)); scene.add(jw);
      NB.water.add({ name: 'jacuzzi', test: (x, z) => x > K.wx(171.25) && x < K.wx(174.75) && z > K.wz(-27.75) && z < K.wz(-24.85), surface: () => UP + .45 });
      // sunbeds up top, the wheelhouse and the radar arch
      for (const x of [170.6, 173, 175.4]) { K.box(x - .6, UP, -22, x + .6, UP + .35, -19.9, '#ffffff', true); K.box(x - .55, UP + .36, -22, x + .55, UP + .38, -20.2, '#ff7eb6'); }
      K.box(170, UP, -18, 176, 6.3, -15, GLASS, true); K.box(169.6, 6.3, -18.4, 176.4, 6.45, -14.8, WH, true);
      for (const x of [170.3, 175.5]) K.box(x, UP, -19.3, x + .25, 7.3, -19, WH, true);
      K.box(170.3, 7.0, -19.3, 175.75, 7.3, -19, WH); K.box(172.6, 7.3, -19.4, 173.4, 7.6, -18.9, '#e8e8ee'); K.neon(172.95, 7.6, -19.2, 173.05, 8.8, -19.1, '#ff3344');
      // foredeck sun pads
      K.box(171, D, -14, 175, D + .3, -11.2, '#ffffff', true); K.box(171.1, D + .3, -13.9, 174.9, D + .32, -11.3, '#3fe6e0');
      for (let k = 0; k < 10; k++) K.box(172.94, 1.9 - k * .2, -8.3 + k * .06, 173.06, 2.0 - k * .2, -8.2 + k * .06, '#5a5a62');
      // bar on the starboard side of the aft deck, shelves of bottles, champagne on ice
      K.box(170.6, D, -37, 171.2, 3.1, -32.5, '#1a1a22', true); K.box(170.55, 3.1, -37.05, 171.25, 3.16, -32.45, '#e8e2d6'); K.neon(171.2, 2.2, -37, 171.24, 2.26, -32.5, '#ff4fa3', false);
      K.box(168.75, 2.5, -36.8, 169.1, 3.7, -32.7, '#2a2a30', true);
      const BOT = ['#5fd38a', '#ffb347', '#ff6b8a', '#f5e6a8', '#9fd8ff', '#c28bff'];
      for (const y of [2.6, 3.05]) for (let z = -36.7; z < -32.8; z += .28) K.neon(169.12, y, z, 169.2, y + rand(.28, .4), z + .1, pick(BOT), false);
      for (const z of [-36, -34.2]) { K.box(170.7, 3.16, z - .15, 171.0, 3.4, z + .15, CHROME); K.box(170.82, 3.4, z - .03, 170.88, 3.6, z + .03, '#1f5a2a'); K.box(170.82, 3.6, z - .02, 170.88, 3.64, z + .02, '#e8c547'); }
      for (let z = -33.6; z < -32.6; z += .3) K.box(170.8, 3.16, z, 170.86, 3.32, z + .06, '#dff4ff');
      // DJ desk and speakers against the cabin
      K.box(171.8, D, -31.6, 174.2, 3.05, -31.0, '#141418', true); K.neon(171.8, 2.85, -31.64, 174.2, 2.9, -31.6, '#3fe6e0', false);
      for (const x of [171.2, 174.3]) K.box(x, D, -31.6, x + .5, 3.4, -31.0, '#0e0e12', true);
      // sofas on the stern wings
      for (const [a, b] of [[168.8, 171], [175, 177.2]]) { K.box(a, D, -40.9, b, D + .6, -40.3, '#f2eee6', true); K.box(a, D + .6, -41, b, D + 1.15, -40.8, '#f2eee6'); K.box(a + .1, D + .6, -40.85, b - .1, D + .64, -40.35, '#ff7eb6'); }
      // the name on the bow and the stern
      const nameTex = K.tex(512, 96, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#1c2a4a'; let fs = 60; g.font = 'italic bold 60px "Trebuchet MS", Arial, sans-serif'; while (g.measureText('LEHA NEPLOXO').width > w - 20) { fs -= 2; g.font = 'italic bold ' + fs + 'px "Trebuchet MS", Arial, sans-serif'; } g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('LEHA NEPLOXO', w / 2, h / 2 + 4); }, false);
      K.picture('-x', 168.42, 1.2, -19.5, 5, .95, nameTex, true); K.picture('+x', 177.58, 1.2, -19.5, 5, .95, nameTex, true); K.picture('-z', 173, 1.35, -41.08, 4.2, .8, nameTex, true);
      // string lights from the radar arch down to the bow and the stern
      const BULB = ['#ff4fa3', '#ffd84f', '#3fe6e0', '#ffffff'];
      for (const [x1, y1, z1] of [[173, 2.9, -8.4], [169.5, 5.2, -33], [176.5, 5.2, -33]]) for (let i = 1; i < 14; i++) { const t = i / 14, x = 173 + (x1 - 173) * t, y = 7.3 + (y1 - 7.3) * t - Math.sin(t * Math.PI) * .5, z = -19.15 + (z1 + 19.15) * t; K.neon(x - .06, y - .06, z - .06, x + .06, y + .06, z + .06, BULB[i % 4]); }
      // a pool of light in the water round the hull after dark
      const glowTex = K.tex(64, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * .9); gr.addColorStop(0, 'rgba(90,220,255,1)'); gr.addColorStop(.5, 'rgba(60,160,255,.5)'); gr.addColorStop(1, 'rgba(40,120,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
      underGlow = new THREE.Mesh(new THREE.PlaneGeometry(18, 46).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      underGlow.position.set(K.wx(173), .08, K.wz(-25.5)); scene.add(underGlow);
      mapShapes.push({ x0: K.wx(168.5), z0: K.wz(-41), x1: K.wx(177.5), z1: K.wz(-15), c: '#ffffff', k: 'b' }, { x0: K.wx(170.5), z0: K.wz(-15), x1: K.wx(175.5), z1: K.wz(-8.5), c: '#ffffff', k: 'b' });
      // the party
      const party = { yacht: true }, Y = (s, y) => Object.assign(s, { x: K.wx(s.x), z: K.wz(s.z), y, fixedY: true, home: true });
      for (const x of [172.3, 173.5, 174.7]) for (const z of [-38.7, -37.3, -35.9, -34.5]) if (Math.random() < .8) spots.push(Y({ kind: 'dance', x: x + rand(-.2, .2), z: z + rand(-.2, .2), heading: Math.PI + rand(-.8, .8), mix: 'yacht', grp: party }, D));
      spots.push(Y({ kind: 'dj', x: 173, z: -30.45, heading: Math.PI, type: 'tourist_m' }, D));
      spots.push(Y({ kind: 'idle', x: 169.75, z: -34.7, heading: Math.PI / 2, type: 'croupier' }, D));
      spots.push(Y({ kind: 'guard', x: 170.3, z: -39.25, heading: Math.PI, type: 'business_m' }, D));
      for (const x of [169.4, 170.4, 175.6, 176.6]) if (Math.random() < .8) spots.push(Y({ kind: 'sit', x, z: -40.6, heading: 0, mix: 'yacht' }, D + .66));
      for (const [x, z, h] of [[171.55, -26.3, Math.PI / 2], [174.45, -26.3, -Math.PI / 2], [173, -27.45, 0]]) spots.push(Y({ kind: 'sit', x, z, heading: h, type: pick(['beach_f', 'beach_f', 'beach_m']) }, UP + .18));
      for (const x of [170.6, 173, 175.4]) if (Math.random() < .85) spots.push(Y({ kind: 'lie', x, z: -21.9, heading: 0, type: 'beach_f' }, UP + .47));
      for (const x of [172, 174]) spots.push(Y({ kind: 'lie', x, z: -13.85, heading: 0, type: 'beach_f' }, D + .42));
      outdoor.push({ x: K.wx(171.95), z: K.wz(-34.7), y: D, r: 1.7, short: 'БАР', label: () => 'Бар яхты', use: () => G.ui.menu({ eyebrow: 'Яхта LEHA NEPLOXO', title: 'Бар', items: () => [
        { name: 'Шампанское', desc: 'Бокал из ведёрка со льдом · +20 здоровья, кружит голову', price: 60, buy: () => { G.player.hp = Math.min(100, G.player.hp + 20); G.drunk(40); return 'За удачу!'; } },
        { name: 'Мохито', desc: '+15 здоровья', price: 15, buy: () => { G.player.hp = Math.min(100, G.player.hp + 15); G.drunk(12); return 'Мята и лайм'; } },
        { name: 'Виски со льдом', desc: '+10 здоровья, крепко', price: 25, buy: () => { G.player.hp = Math.min(100, G.player.hp + 10); G.drunk(30); return 'Ух!'; } },
        { name: 'Вода с лимоном', desc: 'Протрезветь', price: 2, buy: () => { G.drunk(0); return 'Голова прояснилась'; } }
      ] }) });
    }

    K.at(0, 0);

    /* ---------------------------------------------------------------
       12. NEON BAY MARINA: a wooden pier out into the sea with speedboats and jet skis alongside,
           and a floating landing at the end to climb out of the water
       --------------------------------------------------------------- */
    const marina = { slots: [
      { id: 'jetski', x: 146, z: 49.2, h: Math.PI / 2 }, { id: 'jetski', x: 149.5, z: 49.2, h: Math.PI / 2 },
      { id: 'speedboat', x: 156, z: 49.85, h: Math.PI / 2 }, { id: 'speedboat', x: 153, z: 42.15, h: Math.PI / 2 }] };
    if (heliPad) marina.slots.push({ id: 'heli', x: heliPad.x, z: heliPad.z, h: Math.PI / 2 });   // the helicopter comes back to its pad the same way
    if (towerPad && towerPad.heli) marina.slots.push({ id: 'heli', ...towerPad.heli });   // and one on top of NEPLOXO TOWER
    {
      K.at(0, 0);
      const TEAK = '#a8743c', PILE = '#5a3a1e', Z0 = 44, Z1 = 48, DY = 1.0;
      // steps up from the sand, the deck, planks and pilings
      K.box(121.6, 0, Z0, 122.4, .34, Z1, TEAK, true); K.box(122.4, 0, Z0, 123.2, .67, Z1, TEAK, true);
      K.box(123.2, .7, Z0, 160.3, DY, Z1, TEAK, true);
      for (let x = 123.5; x < 160.3; x += .5) K.box(x, DY, Z0, x + .03, DY + .005, Z1, '#7a5028');
      for (let x = 125; x < 160.5; x += 3.5) for (const z of [Z0 - .15, Z1 + .15]) { K.box(x - .17, -3.6, z - .17, x + .17, DY + .45, z + .17, PILE, true); K.box(x - .2, DY + .45, z - .2, x + .2, DY + .5, z + .2, '#3a2a1a'); }
      // end of the pier: a step down onto a floating landing just above the water
      K.box(160.3, .25, Z0 - .5, 161, .72, Z1 + .5, TEAK, true);
      K.box(161, -.5, Z0 - .5, 164, .45, Z1 + .5, '#c9a06a', true);
      for (const z of [Z0 - .5, Z1 + .5]) K.box(161, .1, z - .06, 164, .3, z + .06, '#ff8a3d');
      NB.water.hole({ x0: 160.3, x1: 164.05, z0: Z0 - .55, z1: Z1 + .55 });
      // lamps along the pier, life rings, and an arch with the marina's name at the start
      for (let x = 128; x < 160; x += 8) { K.box(x - .06, DY, Z1 - .2, x + .06, DY + 2.6, Z1 - .08, '#2b2735'); K.neon(x - .15, DY + 2.6, Z1 - .3, x + .15, DY + 2.75, Z1, '#ffe2b0'); }
      for (const x of [136, 152]) { K.neon(x - .3, DY + .5, Z0 + .02, x + .3, DY + 1.1, Z0 + .08, '#ff5a3a', false); K.box(x - .12, DY + .68, Z0 + .01, x + .12, DY + .92, Z0 + .09, '#ffffff'); }
      for (const z of [Z0 - .1, Z1 + .1]) K.box(123.1, .7, z - .12, 123.35, 4.1, z + .12, '#f6f2ec', true);
      K.box(123.1, 3.8, Z0 - .2, 123.35, 4.4, Z1 + .2, '#f6f2ec');
      K.picture('-x', 123.08, 4.1, (Z0 + Z1) / 2, 4, .55, T.sign('NEPLOXO MARINA', null, '#3fe6e0', '#10202a'));
      K.neon(123.05, 3.78, Z0 - .2, 123.1, 3.84, Z1 + .2, '#3fe6e0');
      mapShapes.push({ x0: 123.2, z0: Z0, x1: 164, z1: Z1, c: '#c9a06a', k: 'b' });
    }

    /* ---------------------------------------------------------------
       NEON FASHION: an expensive boutique. White marble and gold, chandeliers, a black runway down the
       middle with mannequins; shirts hanging along the left wall, trousers and a wall of shoes on the right,
       hats, glasses, chains and watches at the back, a women's corner, a fitting room with a big mirror.
       A shop assistant stands in every department: walk up to one and pick what you like.
       --------------------------------------------------------------- */
    if (doors.fashion) {
      const pl = interior('fashion', 'Бутик NOT BAD Fashion', doors.fashion, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-9, -6, 9, 14], light: lit('#fff8ee', '#b8a890', 1.05), music: 'lounge' });
      K.at(pl.ox, pl.oz);
      const GOLD = '#c9a04a', CREAM = '#f3ece2';
      K.room(-9, -6, 9, 14, 4.6, { wall: CREAM, ceil: '#fbf7f0', trim: GOLD, neon: '#e8c547', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.floor(-9, -6, 9, 14, T.marble, 2.5);
      // the runway: black with gold edges, from the door to the counter
      K.box(-1.1, 0, -3.2, 1.1, .03, 10.6, '#141418'); K.box(-1.16, 0, -3.2, -1.1, .035, 10.6, GOLD); K.box(1.1, 0, -3.2, 1.16, .035, 10.6, GOLD);
      // gold pilasters on the walls and the name over the counter
      for (const z of [-2, 2.5, 7, 11.5]) for (const x of [-8.9, 8.9]) K.box(x - .1, 0, z - .15, x + .1, 4.6, z + .15, GOLD);
      K.picture('-z', 0, 3.7, 13.83, 5.2, .9, T.sign('NOT BAD FASHION', null, '#c9a04a', '#141418'));
      // chandeliers: a gold ring hung with glowing crystals
      for (const z of [1.5, 8]) {
        K.box(-.02, 3.6, z - .02, .02, 4.6, z + .02, GOLD);
        for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, x = Math.cos(a) * .7, zz = z + Math.sin(a) * .7; K.box(x - .05, 3.55, zz - .05, x + .05, 3.62, zz + .05, GOLD); K.neon(x - .03, 3.3, zz - .03, x + .03, 3.55, zz + .03, '#fff6dc', k % 2 === 0); }
        K.neon(-.08, 3.2, z - .08, .08, 3.5, z + .08, '#fff6dc');
      }
      const C = NB.CLOTHES;
      const tex = it => { if (!it.map && it.tex) it.map = it.tex(); return it.map; };
      const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(pl.X(x), y, pl.Z(z)); scene.add(o); return o; };
      const lam = c => new THREE.MeshLambertMaterial({ color: c });
      // LEFT WALL: tops on two chrome rails, each shirt showing its real print
      const tops = Object.keys(C.top).filter(k => !C.top[k].hidden).sort((a, b) => C.top[a].price - C.top[b].price);
      const shirtGeo = new THREE.BoxGeometry(.06, .6, .46);
      tops.slice(0, 26).forEach((k, i) => {
        const row = i < 13 ? 0 : 1, j = row ? i - 13 : i, z = .3 + j * .78 + row * .39, y = row ? 1.2 : 2.55;
        const s = add(shirtGeo, new THREE.MeshLambertMaterial({ map: tex(C.top[k]) }), -8.35, y, z);
        s.rotation.x = row ? .02 : -.02;
        K.box(-8.39, y + .3, z - .015, -8.33, y + .42, z + .015, '#c9c9d4');
      });
      for (const y of [2.97, 1.62]) K.box(-8.45, y, 0, -8.35, y + .04, 10.6, '#d8dce4', false);
      for (const z of [0, 10.6]) K.box(-8.9, 1.6, z - .03, -8.35, 1.66, z + .03, '#d8dce4');
      // RIGHT WALL: trousers folded on low tables, and a lit wall of shoes
      const pk = Object.keys(C.pants).filter(k => !C.pants[k].hidden);
      for (const [tz, from] of [[1.2, 0], [4.2, 8]]) {
        K.box(5.6, 0, tz - 1, 7.6, .8, tz + 1, '#2a2226', true); K.box(5.55, .8, tz - 1.05, 7.65, .85, tz + 1.05, GOLD);
        pk.slice(from, from + 8).forEach((k, i) => {
          const it = C.pants[k], x = 5.95 + (i % 2) * .9, z = tz - .7 + ((i / 2) | 0) * .45;
          for (let n = 0; n < 3; n++) { const m = it.tex ? new THREE.MeshLambertMaterial({ map: tex(it) }) : lam(it.color); add(new THREE.BoxGeometry(.7, .07, .36), m, x, .89 + n * .075, z); }
        });
      }
      K.box(8.3, 0, 6.6, 8.9, 3.6, 12.6, '#2a2226', true);
      const sk = Object.keys(C.shoes);
      for (let r = 0; r < 4; r++) {
        const y = .5 + r * .8; K.box(8.1, y - .04, 6.7, 8.35, y, 12.5, GOLD); K.neon(8.3, y + .6, 6.7, 8.33, y + .64, 12.5, '#fff6dc', false);
        for (let i = 0; i < 7; i++) { const it = C.shoes[sk[(r * 7 + i) % sk.length]], z = 7.1 + i * .78; for (const dz of [-.1, .1]) add(new THREE.BoxGeometry(.3, .1, .14), lam(it.color), 8.18, y + .05, z + dz); }
      }
      // BACK: hats on busts along the wall, a glass counter with chains and watches, a tower of glasses
      const hk = Object.keys(C.hat).filter(k => C.hat[k].kind && !C.hat[k].hidden);
      K.box(-8.2, 0, 12.4, -3.6, .9, 13.8, '#2a2226', true); K.box(-8.25, .9, 12.35, -3.55, .95, 13.85, GOLD);
      hk.forEach((k, i) => {
        const it = C.hat[k], x = -7.8 + (i % 6) * .8, y = i < 6 ? 1.3 : 2.4, z = 13.2;
        if (i >= 6) K.box(x - .3, 1.95, 12.9, x + .3, 2.0, 13.85, GOLD);
        add(new THREE.BoxGeometry(.2, .26, .2), lam(0xf4f1ea), x, y - .2, z);
        const w = it.kind === 'cowboy' ? .46 : it.kind === 'fedora' || it.kind === 'tophat' ? .34 : .26, hh = it.kind === 'tophat' ? .3 : it.kind === 'cap' || it.kind === 'bandana' ? .08 : .14;
        add(new THREE.BoxGeometry(w, .025, w), lam(it.color), x, y - .06, z); add(new THREE.BoxGeometry(.22, hh, .22), lam(it.color), x, y - .05 + hh / 2, z);
      });
      K.box(-1.6, 0, 11.6, 3.6, .95, 12.4, '#2a2226', true);
      K.box(-1.65, .95, 11.55, 3.65, 1.0, 12.45, '#bfe4ee'); K.neon(-1.6, .9, 11.54, 3.6, .94, 11.58, '#e8c547', false);
      [...Object.keys(C.chain), ...Object.keys(C.watch)].forEach((k, i) => {
        const it = C.chain[k] && C.chain[k].color != null ? C.chain[k] : C.watch[k]; if (!it || it.color == null) return;
        const x = -1.2 + i * .55; add(new THREE.BoxGeometry(.3, .03, .16), lam(it.color), x, 1.02, 12);
        add(new THREE.BoxGeometry(.06, .06, .06), new THREE.MeshBasicMaterial({ color: it.color }), x, 1.07, 12);
      });
      K.box(4.8, 0, 11.3, 5.8, 2.2, 12.3, '#2a2226', true);
      Object.keys(C.glasses).filter(k => C.glasses[k].kind).forEach((k, i) => {
        const it = C.glasses[k], y = .6 + (i % 4) * .4, x = 4.95 + ((i / 4) | 0) * .45;
        for (const s of [-1, 1]) add(new THREE.BoxGeometry(.12, .07, .02), lam(it.kind === 'nerd' ? 0xbfd8e8 : it.color), x + s * .09, y, 11.28);
      });
      // mannequins on the runway wearing whole looks
      const mannequin = (x, z, h, look) => {
        const g = new THREE.Group(); g.position.set(pl.X(x), 0, pl.Z(z)); g.rotation.y = h; scene.add(g);
        const b = (w, hh, d, m, px, py, pz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); o.position.set(px, py, pz); g.add(o); };
        const white = lam(0xf4f1ea), plinth = lam(0x141418);
        b(.9, .2, .9, plinth, 0, .1, 0); b(.92, .03, .92, lam(0xc9a04a), 0, .21, 0);
        if (look.dress) { b(.4, .62, .3, lam(look.dress), 0, 1.5, 0); b(.5, .5, .36, lam(look.dress), 0, .98, 0); b(.12, .5, .12, white, -.09, .45, 0); b(.12, .5, .12, white, .09, .45, 0); b(.12, .46, .12, white, -.26, 1.5, 0); b(.12, .46, .12, white, .26, 1.5, 0); }
        else {
          const top = C.top[look.top], sm = new THREE.MeshLambertMaterial({ map: tex(top) }), pn = C.pants[look.pants], pm = pn.tex ? new THREE.MeshLambertMaterial({ map: tex(pn) }) : lam(pn.color);
          b(.4, .52, .24, sm, 0, 1.55, 0); b(.36, .16, .22, pm, 0, 1.22, 0);
          for (const s of [-1, 1]) { b(.15, .86, .17, pm, s * .1, .7, 0); b(.14, .08, .27, lam(C.shoes[look.shoes].color), s * .1, .26, .05); b(.13, .22, .14, top.sleeves === 'tank' ? white : sm, s * .27, 1.68, 0); b(.09, .42, .09, top.sleeves === 'long' ? lam(top.sleeve) : white, s * .27, 1.36, 0); }
        }
        b(.1, .1, .1, white, 0, 1.87, 0); b(.22, .25, .23, white, 0, 2.02, 0);
        if (look.hat) { const it = C.hat[look.hat]; b(.34, .025, .34, lam(it.color), 0, 2.15, 0); b(.24, .13, .25, lam(it.color), 0, 2.22, 0); }
      };
      mannequin(-2.2, 2, Math.PI / 2, { top: 'miami', pants: 'white', shoes: 'whiteleather', hat: 'panama' });
      mannequin(2.2, 4.5, -Math.PI / 2, { top: 'leopard', pants: 'leather', shoes: 'black' });
      mannequin(-2.2, 7, Math.PI / 2, { top: 'croc', pants: 'black', shoes: 'croc', hat: 'fedora' });
      mannequin(2.2, 9.2, -Math.PI / 2, { top: 'flamingo', pants: 'sh_white', shoes: 'flip' });
      // the women's corner: pink carpet, three mannequins in dresses, a sign
      K.box(3.2, 0, -5.8, 8.8, .02, -.6, '#f7c6d6');
      mannequin(4.4, -4.4, 0, { dress: 0xd0102a }); mannequin(6, -4.4, 0, { dress: 0xe8c547 }); mannequin(7.6, -4.4, 0, { dress: 0x39ff6a });
      K.picture('+z', 6, 3.2, -5.83, 3.4, .6, T.sign('WOMEN · СКОРО', null, '#ff4fa3', '#1a0f24'));
      // the fitting room: a curtain, a gold-framed mirror, a pouf
      K.box(-8.9, 0, -5.9, -5.8, 3, -5.8, '#6a1e3a', true); K.box(-5.9, 0, -5.9, -5.8, 3, -2.9, '#6a1e3a', true);
      K.box(-8.85, .3, -4.6, -8.8, 2.6, -3.4, '#c9a04a'); K.box(-8.8, .4, -4.5, -8.75, 2.5, -3.5, '#dbe8f0');
      K.box(-7.6, 0, -4.4, -6.8, .45, -3.6, '#f3ece2', true);
      // a white leather sofa and a low table with champagne, for the one waiting
      K.box(-4.6, 0, -1.2, -2.2, .45, -.4, '#faf6ee', true); K.box(-4.6, .45, -1.2, -2.2, 1.0, -1.0, '#faf6ee');
      K.box(-4, 0, .2, -2.8, .4, .9, '#141418', true); K.neon(-3.5, .4, .45, -3.42, .7, .53, '#5fd38a', false);
      // shop assistants, one per department
      for (const [x, z, h, type] of [[-7, 5.2, Math.PI / 2, 'business_f'], [6.6, 2.8, -Math.PI / 2, 'business_m'], [7.3, 9.6, -Math.PI / 2, 'business_f'],
        [-5.8, 11.4, Math.PI, 'business_m'], [1, 13, Math.PI, 'business_f'], [5.3, 10.5, Math.PI, 'business_m'], [5.2, -2, -Math.PI / 2, 'business_f']])
        spots.push(K.spot({ kind: 'idle', x, z, heading: h, type, home: true }));
      for (const [x, z] of [[-3, 6], [3, 3]]) spots.push(K.spot({ kind: 'idle', x, z, heading: Math.random() * 6, type: Math.random() < .5 ? 'tourist_f' : 'business_f' }));
      const dept = (x, z, short, label, fn) => ({ ...pl.P(x, z), r: 1.7, short, label: () => label, use: fn });
      pl.attach = () => {
        pl.interactions = [
          dept(-6, 5.2, 'ВЕРХ', 'Рубашки, футболки и пиджаки', () => G.ui.clothes('top')),
          dept(5.6, 2.8, 'БРЮКИ', 'Брюки и шорты', () => G.ui.clothes('pants')),
          dept(6.3, 9.6, 'ОБУВЬ', 'Обувь', () => G.ui.clothes('shoes')),
          dept(-5.8, 10.4, 'ШЛЯПЫ', 'Шляпы и кепки', () => G.ui.clothes('hat')),
          dept(4.3, 10.3, 'ОЧКИ', 'Очки', () => G.ui.clothes('glasses')),
          dept(0, 10.9, 'УКРАШЕНИЯ', 'Цепи и часы', () => G.ui.jewels()),
          dept(5.2, -1, 'ЖЕНСКОЕ', 'Женская коллекция', () => G.ui.womens()),
          dept(-7.2, -2.6, 'ПРИМЕРКА', 'Примерочная: ваш гардероб', () => G.ui.wardrobe())
        ];
      };
    }

    /* ---------------------------------------------------------------
       NORTH SIDE PRISON, BLOCK A: two tiers of cells behind bars down both sides of a long hall, a gallery
       round the top tier with a stair up to it, a guard desk at the door and steel tables where the
       inmates play cards. Visitors walk the hall and look in; the cells stay locked.
       --------------------------------------------------------------- */
    if (doors.prison) {
      const pl = interior('prison', 'Тюрьма Района 21 · Блок А', doors.prison, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-8, -6, 8, 27], light: lit('#e6ecf5', '#4a4e58', .85) });
      K.at(pl.ox, pl.oz);
      const W = '#b4b8bc', BAR = '#3a3e44', STEEL = '#8a8e94', UP = 3.6, CH = 3.4;
      K.room(-8, -6, 8, 27, 7.6, { wall: W, ceil: '#3a3e44', trim: '#4a4e54', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.floor(-8, -6, 8, 27, T.concrete, 3);
      for (const x of [-2, 2]) K.box(x - .06, 0, -1, x + .06, .01, 25, '#e8c547');
      // strip lights down the hall
      for (let z = -3; z < 26; z += 4) K.neon(-.5, 7.4, z, .5, 7.5, z + 1.2, '#eef4ff', false);
      // the desk by the door: a counter, a glass screen, monitors; a metal-detector arch
      K.box(3, 0, -3.2, 6.8, 1.1, -2.3, '#4a4e54', true); K.box(3, 1.1, -2.35, 6.8, 2.2, -2.3, '#9fc0d0');
      K.box(3.5, 1.1, -3, 4.3, 1.6, -2.8, '#141418'); K.screen('-z', 3.9, 1.35, -3.01, .7, .4, 3); K.box(5.2, 1.1, -3, 6, 1.6, -2.8, '#141418'); K.screen('-z', 5.6, 1.35, -3.01, .7, .4, 3);
      for (const s of [-1, 1]) K.box(s * .75 - .1, 0, -3.1, s * .75 + .1, 2.4, -2.9, '#c9c9d4', true);
      K.box(-.85, 2.4, -3.1, .85, 2.6, -2.9, '#c9c9d4'); K.neon(-.3, 2.45, -3.12, .3, 2.55, -3.1, '#ff3a3a', false);
      // steel tables for cards
      for (const [x, z] of [[-5.2, -3], [-5.2, .4]]) {
        K.box(x - 1, 0, z - .45, x + 1, .78, z + .45, STEEL, true);
        for (const s of [-1, 1]) K.box(x - 1, 0, z + s * .85 - .18, x + 1, .45, z + s * .85 + .18, STEEL, true);
        for (let k = 0; k < 5; k++) K.box(x - .6 + k * .28, .78, z - .1, x - .45 + k * .28, .79, z + .1, k % 2 ? '#f2f2ec' : '#c81e2a');
        for (const s of [-1, 1]) for (const dx of [-.5, .5]) seat(.75, K.spot({ kind: 'sit', x: x + dx, z: z + s * .9, y: .51, heading: s > 0 ? Math.PI : 0, type: 'prisoner' }));
      }
      // the cells: seven a side on each tier, 3 m wide, bars in front
      const cells = [];
      for (const tier of [0, 1]) for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
        const y0 = tier * UP, z0 = 4 + i * 3, z1 = z0 + 3, xf = s * 3.2, xb = s * 8, lo = Math.min(xf, xb), hi = Math.max(xf, xb);
        K.box(lo, y0, z0 - .1, hi, y0 + CH, z0 + .1, W, true); if (i === 6) K.box(lo, y0, z1 - .1, hi, y0 + CH, z1 + .1, W, true);
        for (let z = z0 + .15; z < z1 - .1; z += .22) K.box(xf - .03, y0, z - .02, xf + .03, y0 + CH, z + .02, BAR);
        for (const y of [y0 + 1.1, y0 + CH - .1]) K.box(xf - .05, y, z0, xf + .05, y + .08, z1, BAR);
        K.solid(xf - .05, y0 < 1 ? 0 : y0, z0, xf + .05, y0 + CH, z1);
        // bunks along the back wall, a steel toilet, a poster
        const bx = s * 7.4;
        K.box(bx - .45, y0, z0 + .35, bx + .45, y0 + .5, z0 + 2.4, '#5a5e64'); K.box(bx - .42, y0 + .5, z0 + .38, bx + .42, y0 + .6, z0 + 2.37, '#e2e2d8');
        K.box(bx - .45, y0 + 1.55, z0 + .35, bx + .45, y0 + 1.65, z0 + 2.4, '#5a5e64'); K.box(bx - .42, y0 + 1.65, z0 + .38, bx + .42, y0 + 1.75, z0 + 2.37, '#d8d0c0');
        for (const zz of [z0 + .35, z0 + 2.3]) K.box(bx + s * .4 - .05, y0, zz, bx + s * .4 + .05, y0 + 1.8, zz + .08, '#5a5e64');
        K.box(s * 4.4 - .25, y0, z1 - .75, s * 4.4 + .25, y0 + .45, z1 - .25, '#c9ccd2'); K.box(s * 5.2 - .25, y0 + .8, z1 - .45, s * 5.2 + .25, y0 + 1, z1 - .15, '#c9ccd2');
        if (Math.random() < .6) K.box(s * 7.97 - .01, y0 + 1.9, z0 + 2.5, s * 7.97 + .01, y0 + 2.7, z1 - .3, ['#e0286a', '#3f8fe6', '#ffd23d', '#2bd67b'][i % 4]);
        cells.push({ s, y0, z0, z1, bx });
      }
      // the top tier's floor over the cells, the gallery in front of it, the bridge across the far end, railings, the stair
      for (const s of [-1, 1]) {
        K.box(Math.min(s * 2, s * 8), UP - .2, 4, Math.max(s * 2, s * 8), UP, 25, '#8a8e94', true);
        K.box(s * 2 - .04, UP, 4, s * 2 + .04, UP + 1, 25, BAR); K.box(s * 2 - .06, UP + .95, 4, s * 2 + .06, UP + 1.05, 25, '#e8c547');
        for (let z = 4; z <= 25; z += 1.5) K.box(s * 2 - .05, UP, z - .03, s * 2 + .05, UP + 1, z + .03, BAR);
        K.solid(s * 2 - .06, UP, 4, s * 2 + .06, UP + 1.05, 25);
        K.box(Math.min(s * 1, s * 2), UP, 24.95, Math.max(s * 1, s * 2), UP + 1, 25.05, BAR); K.solid(Math.min(s * 1, s * 2), UP, 24.94, Math.max(s * 1, s * 2), UP + 1.05, 25.06);
      }
      K.box(-8, UP - .2, 25, 8, UP, 27, '#8a8e94', true);
      { const N = 10, z0 = 16, d = (25 - z0) / N; for (let k = 0; k < N; k++) { const top = UP * (k + 1) / N; K.box(-1, 0, z0 + k * d, 1, top, z0 + (k + 1) * d, k % 2 ? '#7a7e84' : '#848890', true); K.box(-1, top - .03, z0 + k * d, 1, top, z0 + k * d + .05, '#e8c547'); }
        for (const s of [-1, 1]) { K.box(s * 1.02 - .03, 0, z0 + .4, s * 1.02 + .03, UP + 1, 25, BAR); K.solid(s * 1.02 - .05, 0, z0 + .4, s * 1.02 + .05, UP + 1, 25); } }
      // the people: inmates in their cells (on the bunks, at the bars), officers on the floor, the gallery and the desk
      for (const c of cells) {
        const r = Math.random(), mid = (c.z0 + c.z1) / 2;
        if (r < .3) spots.push(K.spot({ kind: 'sit', x: c.bx - c.s * .35, z: c.z0 + 1.4, y: c.y0 + .66, heading: c.s > 0 ? -Math.PI / 2 : Math.PI / 2, type: 'prisoner' }));
        else if (r < .55) spots.push(K.spot({ kind: 'lie', x: c.bx, z: c.z0 + 1.35, y: c.y0 + .62, heading: 0, type: 'prisoner' }));
        else if (r < .8) spots.push(K.spot({ kind: 'idle', x: c.s * 3.7, z: mid, y: c.y0, fixedY: true, heading: c.s > 0 ? -Math.PI / 2 : Math.PI / 2, type: 'prisoner' }));
      }
      spots.push(K.spot({ kind: 'guard', x: 4.9, z: -3.8, heading: Math.PI, type: 'cop' }));
      spots.push(K.spot({ kind: 'walk', x: -2.5, z: 2, y: 0, fixedY: true, heading: 0, type: 'cop', patrol: [[-2.5, 2], [-2.5, 24], [2.5, 24], [2.5, 2]] }));
      spots.push(K.spot({ kind: 'walk', x: -2.6, z: 5, y: UP, fixedY: true, heading: 0, type: 'cop', patrol: [[-2.6, 5], [-2.6, 26], [2.6, 26], [2.6, 5]] }));
    }

    /* ---------------------------------------------------------------
       TRAINING: the hero's strength (harder punches), stamina (runs faster) and toughness (takes less
       damage), 0..100 each, saved. A session is eight seconds of hammering the punch button; at most
       +10 of each a game day, so it takes a while to get strong.
       --------------------------------------------------------------- */
    const STAT_NAME = { str: 'Сила', sta: 'Выносливость', tough: 'Крепость' }, DAY_CAP = 10;
    function stats() {
      const P = G.progress; if (!P.stats || typeof P.stats !== 'object') P.stats = {};
      const S = P.stats; for (const k of ['str', 'sta', 'tough']) S[k] = Math.max(0, Math.min(100, +S[k] || 0));
      const day = G.day ? G.day() : 0; if (S.day !== day) { S.day = day; S.got = { str: 0, sta: 0, tough: 0 }; }
      if (!S.got) S.got = { str: 0, sta: 0, tough: 0 };
      return S;
    }
    // one training session in a place: pl gets busy() and onInput() while it runs
    function trainer(pl) {
      const T = { on: false, t: 0, n: 0, last: false, stat: null, label: '' };
      let x0 = 0, z0 = 0, h0 = 0;   // where the hero stands up after a set on the bench
      pl.busy = () => T.on;
      pl.onInput = input => { if (!T.on) return; if (input.fire && !T.last) { T.n++; G.player.punch(); G.audio.punch(null, false); } T.last = input.fire; input.fire = false; input.jump = false; };
      const start = (stat, label, x, z, heading, lie) => {
        if (T.on) return;
        const S = stats();
        if (S[stat] >= 100) { G.flash(STAT_NAME[stat] + ' уже на максимуме — 100', 2.4); return; }
        if (S.got[stat] >= DAY_CAP) { G.flash('На сегодня хватит: ' + STAT_NAME[stat].toLowerCase() + ' +' + DAY_CAP + ' за день. Приходите завтра', 3); return; }
        Object.assign(T, { on: true, t: 8, n: 0, last: true, stat, label }); x0 = x; z0 = z; h0 = heading;
        if (lie) G.player.sitAt(pl.X(lie.x), pl.Z(lie.z), lie.heading, lie.y, 'bench', true); else G.player.place(pl.X(x), pl.Z(z), heading);
        if (G.view) G.view(heading + Math.PI, lie ? .55 : .25);
      };
      const update = dt => {
        if (!T.on) return;
        T.t -= dt;
        pl.hudInfo = { tag: 'ТРЕНИРОВКА', text: T.label + ' — жмите УДАР как можно чаще! Повторов: ' + T.n, time: '0:0' + Math.max(0, Math.ceil(T.t)), warn: T.t < 3 };
        if (T.t > 0) return;
        T.on = false; pl.hudInfo = null;
        if (G.player.seat) G.player.standUp(pl.X(x0), pl.Z(z0), h0);
        const S = stats(), gain = Math.max(T.n > 3 ? 1 : 0, Math.min(DAY_CAP - S.got[T.stat], 100 - S[T.stat], Math.round(T.n / 5)));
        S[T.stat] += gain; S.got[T.stat] += gain; G.save();
        G.flash(gain ? T.label + ': +' + gain + ' · ' + STAT_NAME[T.stat] + ' ' + S[T.stat] + '/100' : 'Слабовато. Жмите чаще!', 3);
      };
      return { start, update, get on() { return T.on; } };
    }
    const statsMenu = (eyebrow) => G.ui.menu({ eyebrow, title: 'Ваша форма', items: () => { const S = stats(); return ['str', 'sta', 'tough'].map(k => ({
      name: STAT_NAME[k] + ': ' + S[k] + ' / 100', desc: (k === 'str' ? 'Удар кулаком сильнее, до ×2' : k === 'sta' ? 'Бегаете быстрее, до +10%' : 'Меньше урона от всего, до −25%') + ' · сегодня +' + S.got[k] + ' из ' + DAY_CAP,
      price: 0, disabled: k === 'str' ? 'Жим, груша' : k === 'sta' ? 'Дорожка' : 'Турник', buy: () => '' })); } });

    /* ---------------------------------------------------------------
       NOT BAD BOXING: a ring in the middle, heavy bags, benches of spectators. Talk to the coach to call
       someone out: five fighters, each harder than the last, three rounds of 45 seconds, win by knockout
       or on points. УДАР punches, ПРЫЖОК raises the guard, moving about makes him miss.
       (Built so the one in the other corner could be another player one day.)
       --------------------------------------------------------------- */
    if (doors.boxing) {
      const pl = interior('boxing', 'NOT BAD BOXING', doors.boxing, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-12, -6, 12, 20], light: lit('#fff2e0', '#5a4a48', .95), music: 'arcade' });
      K.at(pl.ox, pl.oz);
      K.room(-12, -6, 12, 20, 6, { wall: '#3a3438', ceil: '#1e1a1e', trim: '#141214', neon: '#ff3a3a', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.floor(-12, -6, 12, 20, T.wood, 2);
      K.picture('-z', 0, 4.6, 19.83, 9, 1.4, T.sign('NOT BAD BOXING', 'чемпионы Района 21', '#ff3a3a', '#141418'));
      // the ring: a raised canvas, corner posts, three ropes
      const RY = .9, R0 = { x0: -3.4, x1: 3.4, z0: 5.6, z1: 12.4 };
      K.box(R0.x0 - .4, 0, R0.z0 - .4, R0.x1 + .4, RY - .05, R0.z1 + .4, '#1c2a4a', true);
      K.box(R0.x0 - .3, RY - .05, R0.z0 - .3, R0.x1 + .3, RY, R0.z1 + .3, '#e8e2d4');
      if (NB.drawLogo) { const lt = K.tex(256, 256, (g, w) => { g.clearRect(0, 0, w, w); NB.drawLogo(g, w / 2, w / 2, w * .46); }, false); const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lt, transparent: true, opacity: .85 })); m.position.set(pl.X(0), RY + .01, pl.Z(9)); scene.add(m); }
      for (const [x, z, c] of [[R0.x0, R0.z0, '#e02a2a'], [R0.x1, R0.z1, '#2a5ae0'], [R0.x0, R0.z1, '#f2f2f2'], [R0.x1, R0.z0, '#f2f2f2']]) { K.box(x - .15, 0, z - .15, x + .15, RY + 1.5, z + .15, c, true); }
      for (const [y, c] of [[RY + .45, '#e02a2a'], [RY + .85, '#f2f2f2'], [RY + 1.25, '#2a5ae0']]) {
        K.box(R0.x0, y, R0.z0 - .04, R0.x1, y + .05, R0.z0 + .04, c); K.box(R0.x0, y, R0.z1 - .04, R0.x1, y + .05, R0.z1 + .04, c);
        K.box(R0.x0 - .04, y, R0.z0, R0.x0 + .04, y + .05, R0.z1, c); K.box(R0.x1 - .04, y, R0.z0, R0.x1 + .04, y + .05, R0.z1, c);
      }
      for (const [a, b, c, d] of [[R0.x0, R0.z0 - .1, R0.x1, R0.z0], [R0.x0, R0.z1, R0.x1, R0.z1 + .1], [R0.x0 - .1, R0.z0, R0.x0, R0.z1], [R0.x1, R0.z0, R0.x1 + .1, R0.z1]]) K.solid(a, RY, b, c, RY + 1.4, d);
      // lights over the ring
      for (const [x, z] of [[-2, 7.5], [2, 7.5], [-2, 10.5], [2, 10.5]]) { K.box(x - .02, 4.6, z - .02, x + .02, 6, z + .02, '#444450'); K.neon(x - .4, 4.4, z - .4, x + .4, 4.6, z + .4, '#fff6dc'); }
      // heavy bags along the left wall, benches of spectators on the right, a scoreboard
      for (const z of [1, 5, 9, 13]) { K.box(-9.1, 3.1, z - .02, -9.06, 6, z + .02, '#6a6a70'); K.box(-9.45, 1.1, z - .35, -8.75, 3.1, z + .35, '#b0202a', true); K.box(-9.47, 2.9, z - .37, -8.73, 3.1, z + .37, '#1a1a1e'); }
      for (let z = 1; z < 17; z += 2.6) { K.box(8.4, 0, z - .9, 9.6, .45, z + .9, '#5a4030', true); for (const dz of [-.5, .5]) seat(.6, K.spot({ kind: 'sit', x: 9, z: z + dz, y: .51, heading: -Math.PI / 2, type: Math.random() < .5 ? 'beach_m' : 'worker' })); }
      for (const [x, z] of [[-7.5, 3], [-7.5, 11]]) spots.push(K.spot({ kind: 'guard', x, z, heading: -Math.PI / 2, type: 'beach_m' }));
      spots.push(K.spot({ kind: 'idle', x: 5.9, z: 9, heading: -Math.PI / 2, type: 'business_m' }));   // the coach
      // five fighters, each harder than the last
      const LV = [
        { name: 'Вася «Новичок»', hp: 90, dmg: [4, 7], rate: 1.3, guard: .1, speed: 2.2, prize: 100 },
        { name: 'Гоша «Крепыш»', hp: 140, dmg: [6, 9], rate: 1.1, guard: .2, speed: 2.5, prize: 250 },
        { name: 'Рома «Молот»', hp: 200, dmg: [7, 11], rate: .95, guard: .3, speed: 2.8, prize: 600 },
        { name: 'Зверь из Района 21', hp: 280, dmg: [9, 13], rate: .85, guard: .35, speed: 3, prize: 1500 },
        { name: '«Железный» Макс — чемпион зала', hp: 380, dmg: [11, 16], rate: .75, guard: .45, speed: 3.2, prize: 5000 }];
      const Bx = { state: 'off', t: 0, round: 0, opp: null, lv: null, i: 0, hpBefore: 100, weapon: 0, blockT: 0, taken: 0, cd: 0, side: 1, sideT: 0 };
      const rec = () => (G.progress.records.boxing | 0);
      const fade = on => { const f = document.getElementById('fade'); if (f) f.classList.toggle('on', on); };
      const corners = () => { const P = G.player; P.place(pl.X(-2.5), pl.Z(6.5), Math.PI * .25); P.y = RY; const o = Bx.opp; if (o) { o.x = pl.X(2.5); o.z = pl.Z(11.5); o.y = RY; o.heading = -Math.PI * .75; } if (G.view) G.view(Math.PI * .25 + Math.PI, .3); };
      function startBout(i) {
        if (Bx.state !== 'off') return;
        const lv = LV[i], opp = G.crowd.spawnPuppet('beach_m', pl.X(2.5), pl.Z(11.5), -Math.PI * .75);
        if (!opp) { G.flash('Соперник не пришёл, попробуйте ещё раз', 2); return; }
        opp.boxer = { guardT: 0 }; opp.hp = opp.maxHp = lv.hp; opp.puppet.anim = 'ready'; opp.y = RY;
        Object.assign(Bx, { state: 'intro', t: 3, round: 1, opp, lv, i, hpBefore: G.player.hp, blockT: 0, taken: 0, cd: 1.5 });
        const w = G.combat.weapon; Bx.weapon = NB.WEAPON_ORDER.indexOf(w ? w.id : 'fists'); G.combat.select(0);
        G.player.hp = 100; corners(); G.say(opp, pick(['Ну давай, покажи что умеешь', 'Сейчас узнаешь, что такое Район 21', 'Не плачь потом', 'Разомнёмся']));
      }
      function endBout(win, how) {
        Bx.state = 'end'; Bx.t = 3;
        const lv = Bx.lv;
        pl.hudInfo = { tag: win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ', text: (win ? 'Вы победили' : 'Вы проиграли') + how + (win ? ' · приз $' + lv.prize.toLocaleString('ru-RU') : ''), time: '', warn: !win };
        if (win) { G.money.add(lv.prize, 'Бокс'); if (Bx.i + 1 > rec()) G.progress.records.boxing = Bx.i + 1; G.save(); G.flash('ПОБЕДА' + how + '! ' + lv.name + ' повержен. Приз $' + lv.prize, 4); }
        else G.flash('Поражение' + how + '. ' + lv.name + ' сильнее — тренируйтесь в зале', 4);
        if (Bx.opp && !Bx.opp.down) G.say(Bx.opp, win ? pick(['Неплохо... очень неплохо', 'Ты силён', 'Реванш за мной']) : pick(['Приходи, когда подкачаешься', 'Слабовато', 'Следующий!']));
      }
      function cleanup() {
        const o = Bx.opp; Bx.state = 'off'; Bx.opp = null; pl.hudInfo = null;
        if (o && G.crowd.people.includes(o)) { o.boxer = null; if (o.down) G.crowd.revive(o, 40); o.x = pl.X(6.5); o.z = pl.Z(11); o.y = 0; G.crowd.releasePuppet(o); }
        G.player.hp = Math.max(1, Bx.hpBefore); G.player.place(pl.X(5), pl.Z(7.5), -Math.PI / 2); G.player.y = 0;
        if (Bx.weapon > 0) G.combat.select(Bx.weapon);
      }
      const tr = trainer(pl), trInput = pl.onInput;
      pl.busy = () => Bx.state === 'intro' || Bx.state === 'rest' || Bx.state === 'end' || tr.on;
      pl.onInput = input => {
        if (tr.on) { trInput(input); return; }
        if (Bx.state === 'fight' && input.jump) { Bx.blockT = .7; input.jump = false; }
      };
      pl.update = dt => {
        tr.update(dt);
        if (Bx.state === 'off') return;
        const P = G.player, o = Bx.opp, lv = Bx.lv;
        Bx.t -= dt; if (Bx.blockT > 0) Bx.blockT -= dt;
        if (!o || !G.crowd.people.includes(o)) { cleanup(); return; }
        const dealt = Math.max(0, lv.hp - o.hp);
        const clock = s => Math.floor(s / 60) + ':' + String(Math.max(0, Math.ceil(s) % 60)).padStart(2, '0');
        if (Bx.state === 'intro') {
          pl.hudInfo = { tag: 'БОКС', text: lv.name + ' · бой через ' + Math.ceil(Bx.t) + '… УДАР — бить, ПРЫЖОК — блок, двигайтесь, чтобы уклоняться', time: '', warn: true };
          if (Bx.t <= 0) { Bx.state = 'fight'; Bx.t = 45; G.flash('Раунд ' + Bx.round + '! Бой!', 1.5); }
          return;
        }
        if (Bx.state === 'rest') { pl.hudInfo = { tag: 'ПЕРЕРЫВ', text: 'Раунд ' + (Bx.round + 1) + ' через ' + Math.ceil(Bx.t) + ' · вы нанесли ' + Math.round(dealt) + ', пропустили ' + Math.round(Bx.taken), time: '', warn: false }; if (Bx.t <= 0) { Bx.round++; Bx.state = 'fight'; Bx.t = 45; G.flash('Раунд ' + Bx.round + '!', 1.5); } return; }
        if (Bx.state === 'end') { if (Bx.t <= 0) { fade(true); setTimeout(() => fade(false), 250); cleanup(); } return; }
        // the fight
        pl.hudInfo = { tag: 'РАУНД ' + Bx.round + '/3', text: 'Вы ' + Math.max(0, Math.round(P.hp)) + ' · ' + lv.name + ' ' + Math.max(0, Math.round(o.hp)) + (Bx.blockT > 0 ? ' · БЛОК' : ''), time: clock(Bx.t), warn: Bx.t < 10 };
        if (o.down || o.hp <= 0) { endBout(true, ' нокаутом'); return; }
        if (P.hp <= 0) { P.hp = 1; endBout(false, ' нокаутом'); return; }
        if (Bx.t <= 0) {
          if (Bx.round < 3) { Bx.state = 'rest'; Bx.t = 4; corners(); return; }
          endBout(dealt > Bx.taken * 1.05, ' по очкам (' + Math.round(dealt) + ' : ' + Math.round(Bx.taken) + ')'); return;
        }
        // keep both on the canvas
        const inRing = (x, z) => [U.clamp(x, pl.X(R0.x0 + .35), pl.X(R0.x1 - .35)), U.clamp(z, pl.Z(R0.z0 + .35), pl.Z(R0.z1 - .35))];
        [P.x, P.z] = inRing(P.x, P.z); if (P.y < RY - .2) P.y = RY;
        // the opponent: closes in, circles, raises his guard, throws punches
        const dx = P.x - o.x, dz = P.z - o.z, d = Math.hypot(dx, dz) || .001;
        o.heading = Math.atan2(dx, dz);
        if (o.boxer.guardT > 0) o.boxer.guardT -= dt; else if (d < 1.8 && Math.random() < lv.guard * dt * 1.5) o.boxer.guardT = U.rand(.5, 1.1);
        if ((Bx.sideT -= dt) <= 0) { Bx.sideT = U.rand(.8, 2); Bx.side = Math.random() < .5 ? -1 : 1; }
        let vx = 0, vz = 0;
        if (d > 1.15) { vx = dx / d * lv.speed; vz = dz / d * lv.speed; }
        else { vx = -dz / d * Bx.side * .9; vz = dx / d * Bx.side * .9; }
        [o.x, o.z] = inRing(o.x + vx * dt, o.z + vz * dt); o.y = RY; o.speed = Math.hypot(vx, vz);
        Bx.cd -= dt;
        if (o.punchT > 0) o.punchT -= dt;
        o.puppet.anim = o.punchT > 0 ? 'punch' : o.boxer.guardT > 0 ? 'guard' : 'ready';
        if (d < 1.35 && Bx.cd <= 0 && o.boxer.guardT <= 0) {
          Bx.cd = lv.rate * U.rand(.8, 1.25); o.punchT = .35;
          let dmg = U.rand(lv.dmg[0], lv.dmg[1]);
          if (Bx.blockT > 0) dmg *= .25;
          else if (P.speed > 2.2 && Math.random() < .45) dmg = 0;   // slipped it
          if (dmg > 0) { P.hp -= dmg; Bx.taken += dmg; G.audio.punch(null, false); }
        }
      };
      pl.onLeave = () => { if (Bx.state !== 'off') cleanup(); };
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(5, 9), r: 1.6, short: 'ВЫЗОВ', label: () => 'Бросить вызов: бой на ринге', use: () => G.ui.menu({ eyebrow: 'NOT BAD BOXING', title: 'Кого вызвать на бой?', items: () => LV.map((lv, i) => ({
            name: lv.name, desc: 'Здоровье ' + lv.hp + ' · приз $' + lv.prize.toLocaleString('ru-RU') + (i < rec() ? ' · уже побеждён' : ''), price: 0, label: 'На ринг',
            disabled: i > rec() ? 'Сначала победите предыдущего' : '', buy: () => { G.ui.close(); setTimeout(() => startBout(i), 60); return ''; } })) }) },
          ...[1, 5, 9, 13].map(z => ({ ...pl.P(-8.1, z), r: 1.2, short: 'ГРУША', label: () => 'Бить грушу (сила)', use: () => tr.start('str', 'Груша', -8.3, z, -Math.PI / 2) })),
          { ...pl.P(4.5, 3), r: 1.4, short: 'ФОРМА', label: () => 'Ваша форма', use: () => statsMenu('NOT BAD BOXING') }
        ];
      };
    }

    /* ---------------------------------------------------------------
       NEPLOXO GYM: bench presses, treadmills, a pull-up bar, dumbbells and mirrors; people working out
       --------------------------------------------------------------- */
    if (doors.gym) {
      const pl = interior('gym', 'NEPLOXO GYM', doors.gym, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-10, -6, 10, 16], light: lit('#f2f8ff', '#5a6068', 1), music: 'arcade' });
      K.at(pl.ox, pl.oz);
      K.room(-10, -6, 10, 16, 5, { wall: '#d8dce4', ceil: '#2a2e36', trim: '#2a2e36', neon: '#3fe6e0', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.floor(-10, -6, 10, 16, T.darkTile, 1.5);
      K.picture('-z', 0, 3.9, 15.83, 7, 1.2, T.sign('NEPLOXO GYM', 'no pain · no gain', '#3fe6e0', '#10202a'));
      K.box(-6, .8, 15.8, 6, 3.2, 15.85, '#bfe4ee');   // mirrors
      const tr = trainer(pl);
      const ints = [];
      // bench presses on the left
      for (const z of [1.5, 6, 10.5]) {
        K.box(-8.4, 0, z - .3, -6.6, .45, z + .3, '#1a1a1e', true);
        for (const s of [-1, 1]) K.box(-7.9 - .04, 0, z + s * .7 - .04, -7.9 + .04, 1.25, z + s * .7 + .04, '#8a8a90');
        K.box(-7.95, 1.2, z - 1.1, -7.85, 1.26, z + 1.1, '#c9c9d4'); for (const s of [-1, 1]) K.box(-8.15, .95, z + s * .95 - .06, -7.65, 1.5, z + s * .95 + .06, '#1a1a1e');
        ints.push({ ...pl.P(-5.9, z), r: 1.2, short: 'ЖИМ', label: () => 'Жим лёжа (сила)', use: () => tr.start('str', 'Жим лёжа', -6.2, z, -Math.PI / 2, { x: -6.5, z, heading: -Math.PI / 2, y: .45 }) });   // on the bench, the bar over the chest
      }
      // treadmills on the right
      for (const z of [1.5, 6, 10.5]) {
        K.box(6.8, 0, z - .45, 8.8, .25, z + .45, '#2a2a30', true); K.box(6.85, .25, z - .35, 8.75, .27, z + .35, '#141418');
        for (const s of [-1, 1]) K.box(8.5, .25, z + s * .4 - .03, 8.56, 1.3, z + s * .4 + .03, '#8a8a90');
        K.box(8.45, 1.2, z - .45, 8.8, 1.5, z + .45, '#3a3a44'); K.screen('-x', 8.44, 1.35, z, .5, .25, 3);
        ints.push({ ...pl.P(6.2, z), r: 1.2, short: 'ДОРОЖКА', label: () => 'Беговая дорожка (выносливость)', use: () => tr.start('sta', 'Беговая дорожка', 7.6, z, Math.PI / 2) });
      }
      // the pull-up bar at the back, dumbbell racks in the middle
      for (const s of [-1, 1]) K.box(s * 1.2 - .06, 0, 13.4, s * 1.2 + .06, 2.6, 13.52, '#8a8a90', true);
      K.box(-1.2, 2.5, 13.4, 1.2, 2.56, 13.52, '#c9c9d4');
      ints.push({ ...pl.P(0, 12.4), r: 1.3, short: 'ТУРНИК', label: () => 'Подтягивания (крепость)', use: () => tr.start('tough', 'Подтягивания', 0, 13, 0) });
      for (const x of [-2.5, 2.5]) { K.box(x - .9, 0, 5.5, x + .9, .8, 6.3, '#3a3a44', true); for (let k = 0; k < 5; k++) K.box(x - .8 + k * .38, .8, 5.7, x - .62 + k * .38, .95, 6.1, '#1a1a1e'); }
      // people working out, a coach at the desk by the door
      for (const [x, z, h] of [[-7, 3.7, Math.PI / 2], [7.8, 8.2, -Math.PI / 2], [-1, 8.5, 0], [1.5, 3, Math.PI], [-6, 12.5, Math.PI / 2]]) spots.push(K.spot({ kind: 'idle', x, z, heading: h, type: Math.random() < .5 ? 'beach_m' : 'jogger' }));
      K.box(3, 0, -3.2, 6, 1.05, -2.4, '#2a2e36', true); K.neon(3, 1.0, -3.22, 6, 1.05, -3.18, '#3fe6e0', false);
      spots.push(K.spot({ kind: 'idle', x: 4.5, z: -3.8, heading: 0, type: 'jogger' }));
      ints.push({ ...pl.P(4.5, -1.7), r: 1.5, short: 'ТРЕНЕР', label: () => 'Тренер: ваша форма', use: () => statsMenu('NEPLOXO GYM') });
      pl.busy = () => tr.on;
      pl.update = dt => tr.update(dt);
      pl.attach = () => { pl.interactions = ints; };
    }

    /* ---------------------------------------------------------------
       NOT BAD GIRLS: the strip club, open round the clock. A stage with three poles and a runway, dancers,
       chairs round the stage, a bar, two VIP booths, a bouncer. Tip the girls, buy a drink, or pay for a
       private dance in a VIP booth.
       --------------------------------------------------------------- */
    if (doors.strip) {
      const pl = interior('strip', 'NOT BAD GIRLS', doors.strip, { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-11, -6, 11, 20], light: lit('#ff9ad0', '#3a1030', .75), music: 'club' });
      K.at(pl.ox, pl.oz);
      K.room(-11, -6, 11, 20, 5, { wall: '#2a0f24', ceil: '#12060e', trim: '#ff2d7a', neon: '#ff2d7a', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.floor(-11, -6, 11, 20, T.carpetPink, 2); K.box(-11, 0, -6, 11, .01, 20, '#3a1030');
      K.picture('-z', 0, 4.1, 19.83, 7, 1.1, T.sign('NOT BAD GIRLS', 'открыто круглосуточно', '#ff2d7a', '#12060e'));
      const SY = .8;
      // the stage and the runway, lit round the edges, three chrome poles
      K.box(-4.5, 0, 13, 4.5, SY, 19.8, '#1a0a14', true); K.box(-1.3, 0, 7, 1.3, SY, 13, '#1a0a14', true);
      for (const [a, b, c, d] of [[-4.5, 12.96, -1.3, 13.02], [1.3, 12.96, 4.5, 13.02], [-1.34, 7, -1.28, 13], [1.28, 7, 1.34, 13], [-1.3, 6.96, 1.3, 7.02]]) K.neon(a, SY - .08, b, c, SY, d, '#ff2d7a', false);
      for (const [x, z] of [[-2.8, 16], [2.8, 16], [0, 8.6]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 5 - SY, 8), new THREE.MeshLambertMaterial({ color: 0xe8e8f0, emissive: 0x222228 })); p.position.set(pl.X(x), SY + (5 - SY) / 2, pl.Z(z)); scene.add(p); K.solid(x - .08, SY, z - .08, x + .08, 5, z + .08); spots.push(K.spot({ kind: 'dance', x: x, z: z - .45, y: SY, fixedY: true, heading: Math.PI, type: 'stripper' })); }
      spots.push(K.spot({ kind: 'dance', x: 0, z: 15.5, y: SY, fixedY: true, heading: Math.PI, type: 'stripper' }));
      // coloured spotlights on the stage
      for (const [x, z, c] of [[-2.8, 14, 0xff2d7a], [2.8, 14, 0x9b30ff], [0, 9.5, 0x3fe6e0]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(.1, 1.2, 4.2, 14, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.set(pl.X(x), SY + 2.1, pl.Z(z)); scene.add(m); }
      // chairs and small tables round the runway, men watching
      for (const s of [-1, 1]) for (const z of [7.8, 9.6, 11.4]) {
        const x = s * 2.3; K.box(x - .25, 0, z - .25, x + .25, .45, z + .25, '#6a1e3a', true); K.box(x + s * .2 - .03, .45, z - .25, x + s * .25, 1, z + .25, '#6a1e3a');
        seat(.7, K.spot({ kind: 'sit', x: x - s * .02, z, y: .51, heading: -s * Math.PI / 2, type: Math.random() < .6 ? 'business_m' : 'tourist_m' }));
        K.box(x + s * 1 - .25, 0, z - .25, x + s * 1 + .25, .7, z + .25, '#1a0a14', true); K.neon(x + s * 1 - .05, .7, z - .05, x + s * 1 + .05, .85, z + .05, '#ffd84f', false);
      }
      // the bar along the left wall
      K.box(-10.9, 0, 0, -8.6, 1.1, 11, '#1a0a14', true); K.box(-8.65, 1.05, 0, -8.5, 1.12, 11, '#ff2d7a');
      for (const y of [1.6, 2.3]) { K.neon(-10.95, y - .05, 0.5, -10.9, y, 10.5, '#9b30ff', false); for (let z = .8; z < 10.3; z += .38) K.neon(-10.88, y, z, -10.78, y + .3, z + .09, ['#5fd38a', '#ffb347', '#ff6b8a', '#9fd8ff'][(z * 7 | 0) % 4], false); }
      spots.push(K.spot({ kind: 'idle', x: -10, z: 5.5, heading: Math.PI / 2, type: 'stripper' }));   // the waitress too: a swimsuit
      for (const z of [2, 4, 7]) spots.push(K.spot({ kind: 'idle', x: -8, z, heading: -Math.PI / 2, type: Math.random() < .5 ? 'business_m' : 'stripper' }));
      // two VIP booths on the right with curtains and a sofa
      for (const z0 of [1, 8]) {
        K.box(7, 0, z0 - .1, 11, 3, z0 + .1, '#6a1e3a', true); K.box(7, 0, z0 + 5.9, 11, 3, z0 + 6.1, '#6a1e3a', true);
        K.box(9.9, 0, z0 + 1, 10.9, .5, z0 + 5, '#b0102a', true); K.box(10.6, .5, z0 + 1, 10.9, 1.2, z0 + 5, '#b0102a');
        K.neon(7, 2.9, z0 + .1, 11, 3, z0 + .2, '#ff2d7a', false);
        for (const s of [-1, 1]) K.box(6.95, 0, z0 + 3 + s * 2.2 - .7, 7.05, 3, z0 + 3 + s * 2.2 + .7, '#8a1a44');
      }
      K.picture('-x', 6.9, 3.4, 7.5, 3, .6, T.sign('VIP', null, '#ffd84f', '#12060e'));
      spots.push(K.spot({ kind: 'guard', x: 2.2, z: -3.4, heading: 0, type: 'bouncer' }));
      // money thrown on the stage flutters down
      const bills = [], billMat = new THREE.MeshBasicMaterial({ color: 0x7ad07a, side: THREE.DoubleSide });
      for (let k = 0; k < 18; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(.22, .1), billMat); m.visible = false; scene.add(m); bills.push({ m, t: 0 }); }
      const rain = (x, z) => { let n = 0; for (const b of bills) if (b.t <= 0 && n < 8) { n++; b.t = 1.6; b.x = pl.X(x) + U.rand(-.6, .6); b.z = pl.Z(z) + U.rand(-.6, .6); b.y = 2.4 + U.rand(0, .8); b.m.visible = true; } };
      // the private dance: a girl dances for you alone in a booth
      const V = { on: false, t: 0, girl: null };
      const fade = on => { const f = document.getElementById('fade'); if (f) f.classList.toggle('on', on); };
      pl.busy = () => V.on;
      pl.update = dt => {
        for (const b of bills) if (b.t > 0) { b.t -= dt; b.y = Math.max(SY + .02, b.y - dt * 1.4); b.m.position.set(b.x + Math.sin(b.t * 6) * .1, b.y, b.z); b.m.rotation.set(b.t * 3, b.t * 5, 0); if (b.t <= 0) b.m.visible = false; }
        if (!V.on) return;
        V.t -= dt; const g = V.girl;
        if (g && G.crowd.people.includes(g)) { g.puppet.anim = V.t % 4 < 2 ? 'dance' : 'flirt'; g.heading = Math.PI / 2 + Math.sin(V.t * 1.3) * .6; }
        pl.hudInfo = { tag: 'VIP', text: 'Приватный танец…', time: '0:' + String(Math.max(0, Math.ceil(V.t))).padStart(2, '0'), warn: false };
        if (V.t <= 0) {
          V.on = false; pl.hudInfo = null; fade(true);
          setTimeout(() => { fade(false); if (g && G.crowd.people.includes(g)) { G.say(g, pick(['Приходи ещё, красавчик', 'Ты мой любимый клиент', 'Неплохо провели время'])); G.crowd.releasePuppet(g); } G.player.standUp(pl.X(5.5), pl.Z(4), -Math.PI / 2); }, 260);
          G.flash('Неплохо! Приватный танец окончен', 2.6);
        }
      };
      pl.onLeave = () => { if (V.on) { V.on = false; pl.hudInfo = null; if (V.girl) G.crowd.releasePuppet(V.girl); G.player.standUp(); } };
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(0, 6.2), r: 1.6, short: 'ЧАЕВЫЕ', label: () => 'Бросить на сцену $20', use: () => {
            if (!G.money.spend(20, 'Чаевые')) return;
            rain(0, 8.2); G.audio.cash(false);
            const d = G.crowd.people.filter(p => p.look.type === 'stripper' && p.spot && Math.abs(p.x - pl.X(0)) < 5 && p.z > pl.Z(7)).sort((a, b) => a.z - b.z)[0];
            if (d) G.say(d, pick(['Спасибо, милый!', 'Ещё, ещё!', 'Ты такой щедрый', 'Этот танец для тебя']));
          } },
          { ...pl.P(-8, 9.5), r: 1.6, short: 'БАР', label: () => 'Коктейль · $15', use: () => { if (!G.money.spend(15, 'Коктейль')) return; if (G.drunk) G.drunk(25); G.audio.pickup(); G.flash('Коктейль «Неплохо»: голова приятно кружится', 2.4); } },
          { ...pl.P(6.3, 4), r: 1.6, short: 'ПРИВАТ', label: () => 'Приватный танец в VIP · $300', use: () => {
            if (V.on) return;
            if (!G.money.spend(300, 'Приватный танец')) return;
            fade(true);
            setTimeout(() => {
              fade(false);
              const g = G.crowd.spawnPuppet('stripper', pl.X(8.6), pl.Z(4), Math.PI / 2); if (!g) return;
              g.puppet.anim = 'dance'; V.on = true; V.t = 14; V.girl = g;
              G.player.sitAt(pl.X(10.35), pl.Z(4), -Math.PI / 2, .56 - .95, 'sit', true); if (G.view) G.view(Math.PI / 2, .3);   // on the sofa
              G.say(g, pick(['Расслабься, красавчик…', 'Это только для тебя', 'Садись поудобнее']));
            }, 260);
          } }
        ];
      };
    }

    /* ---------------------------------------------------------------
       MOTEL ROOM at the Pink Flamingo: a girl from the kerb brings you up here. A heart-shaped headboard,
       red satin, a mirror on the ceiling, a TV nobody watches. What happens stays under the blanket.
       --------------------------------------------------------------- */
    {
      // the door is set by main.js once the street (and the motel) is built; you only come in with a girl
      const pl = interior('motel', 'Мотель Pink Flamingo', null, { inside: [0, -2.4, 0], exit: [0, -2.7], bounds: [-3.5, -3.5, 3.5, 4.5], light: lit('#ffc4dc', '#5a2440', .8), music: 'lounge' });
      K.at(pl.ox, pl.oz);
      K.room(-3.5, -3.5, 3.5, 4.5, 3, { wall: '#6a2448', ceil: '#2a1020', trim: '#2a1020', neon: '#ff4fa3', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.4 }] } });
      K.floor(-3.5, -3.5, 3.5, 4.5, T.carpetPink, 2);
      // the bed against the far wall: a frame, red satin, pillows, a glowing heart for a headboard
      K.box(-1.15, 0, 2.1, 1.15, .42, 4.45, '#3a1420', true);
      K.box(-1.1, .42, 2.15, 1.1, .56, 4.4, '#f2dce6');
      K.box(-1.12, .56, 2.12, 1.12, .6, 3.75, '#b0102a');
      for (const x of [-.55, .55]) K.box(x - .38, .56, 3.85, x + .38, .72, 4.32, '#fbe8f0');
      K.box(-1.2, .42, 4.42, 1.2, 1.6, 4.5, '#2a0e18');
      { const hx = 0, hy = 1.55, R = .38; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, x = 16 * Math.pow(Math.sin(a), 3) / 16, y = (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16; K.neon(hx + x * R * 1.6 - .04, hy + y * R * 1.3 - .04, 4.38, hx + x * R * 1.6 + .04, hy + y * R * 1.3 + .04, 4.42, '#ff2d7a', k % 3 === 0); } }
      // a mirror on the ceiling over the bed, lamps on the bedside tables
      K.box(-1.1, 2.93, 2.2, 1.1, 2.98, 4.3, '#a8b8c8'); K.neon(-1.12, 2.9, 2.18, 1.12, 2.93, 2.22, '#ff4fa3', false); K.neon(-1.12, 2.9, 4.28, 1.12, 2.93, 4.32, '#ff4fa3', false);
      for (const x of [-1.65, 1.65]) { K.box(x - .3, 0, 3.8, x + .3, .55, 4.4, '#3a1420', true); K.box(x - .04, .55, 4.06, x + .04, .8, 4.14, '#c9a04a'); K.neon(x - .16, .8, 3.94, x + .16, 1.05, 4.26, '#ffb070'); }
      // a dresser with a TV on the left, a champagne bucket, a chair with clothes thrown over it
      K.box(-3.45, 0, -.8, -2.9, .85, 1.6, '#3a1420', true);
      K.box(-3.4, .85, -.1, -3.3, 1.55, .9, '#141418'); K.screen('+x', -3.29, 1.2, .4, .9, .6, 3);
      K.box(-3.2, .85, 1.1, -3.0, 1.1, 1.3, '#c9c9d4'); K.neon(-3.15, 1.1, 1.15, -3.1, 1.35, 1.2, '#5fd38a', false);
      K.box(2.4, 0, -.6, 2.95, .45, -.05, '#b0102a', true); K.box(2.85, .45, -.6, 2.95, 1.05, -.05, '#b0102a'); K.box(2.45, .45, -.45, 2.85, .5, -.2, '#141418');
      // a window with pink blinds, a round rug, a door to the bathroom
      K.box(3.44, 1.0, 1.2, 3.5, 2.3, 3.0, '#ff9fc8'); for (let y = 1.05; y < 2.3; y += .12) K.box(3.4, y, 1.2, 3.44, y + .05, 3.0, '#f7c6d6');
      K.box(-3.44, 0, 2.6, -3.38, 2.2, 3.5, '#f2e6ea'); K.box(-3.38, 1.0, 3.3, -3.34, 1.08, 3.4, '#c9a04a');
      { const rug = new THREE.Mesh(new THREE.CircleGeometry(1.1, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xff7eb6 })); rug.position.set(pl.X(0), .01, pl.Z(1.0)); scene.add(rug); }
      K.neon(-3.45, 2.2, -2.2, -3.41, 2.3, 1.8, '#3fe6e0', false);

      // the scene: a blanket with two heads on the pillows, rocking, hearts floating up
      const grp = new THREE.Group(); grp.position.set(pl.X(0), 0, pl.Z(0)); grp.visible = false; scene.add(grp);
      const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.9, .34, 1.7), new THREE.MeshLambertMaterial({ color: 0xc0102a }));
      blanket.position.set(0, .74, 2.95); grp.add(blanket);
      const bump = new THREE.Mesh(new THREE.BoxGeometry(1.1, .22, 1.1), new THREE.MeshLambertMaterial({ color: 0xb00e26 }));
      bump.position.set(0, .95, 2.9); grp.add(bump);
      const heads = [-.3, .3].map(x => {
        const h = new THREE.Group(); h.position.set(x * 1.3, 1.0, 4.02); h.scale.setScalar(1.35); grp.add(h);
        const face = new THREE.Mesh(new THREE.BoxGeometry(.26, .26, .26), new THREE.MeshLambertMaterial({ color: 0xc58c5c })); h.add(face);
        const hair = new THREE.Mesh(new THREE.BoxGeometry(.28, .1, .28), new THREE.MeshLambertMaterial({ color: 0x2a1a10 })); hair.position.set(0, .13, .02); h.add(hair);
        const back = new THREE.Mesh(new THREE.BoxGeometry(.28, .2, .08), new THREE.MeshLambertMaterial({ color: 0x2a1a10 })); back.position.set(0, .02, .14); h.add(back);
        return { h, face, hair, back };
      });
      const heartTex = K.tex(64, 64, (g, w) => { g.clearRect(0, 0, w, w); g.fillStyle = '#ff2d7a'; g.shadowColor = '#ff7eb6'; g.shadowBlur = 8; g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(4, 34, 8, 8, 32, 20); g.bezierCurveTo(56, 8, 60, 34, 32, 54); g.fill(); }, false);
      const hearts = [];
      for (let i = 0; i < 9; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false, opacity: 0 })); s.scale.set(.3, .3, .3); grp.add(s); hearts.push({ s, t: i / 9 * 2.2, x: 0 }); }

      const S = { state: 'off', t: 0, girl: null };
      const fade = on => { const f = document.getElementById('fade'); if (f) f.classList.toggle('on', on); };
      const say = (p, t) => { if (G && G.say && p) G.say(p, t); };
      pl.busy = () => S.state === 'enter' || S.state === 'scene';
      pl.update = dt => {
        const P = G.player;
        if (S.state === 'off' && pl.guest) {
          // just in: she walks to the bed, he follows her in
          S.girl = pl.guest; pl.guest = null; S.state = 'enter'; S.t = 0;
          const g = S.girl; g.x = pl.X(.7); g.z = pl.Z(-1.6); g.y = 0; g.heading = 0; g.puppet.anim = 'walk';
          say(g, ['Располагайся, красавчик', 'Закрой дверь', 'Ну, иди ко мне…'][(Math.random() * 3) | 0]);
        }
        const g = S.girl; if (!g) return;
        S.t += dt;
        if (S.state === 'enter') {
          const tx = pl.X(1.45), tz = pl.Z(2.4), dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
          if (d > .1) { const sp = Math.min(1.6, d / dt); g.x += dx / d * sp * dt; g.z += dz / d * sp * dt; g.speed = sp; g.puppet.anim = 'walk'; g.heading = Math.atan2(dx, dz); }
          else { g.speed = 0; g.puppet.anim = 'flirt'; g.heading = -Math.PI / 2; }
          if (S.t > 3.2 && S.t - dt <= 3.2) fade(true);
          if (S.t > 3.6) {
            // lights down: the blanket, the two of them under it
            S.state = 'scene'; S.t = 0; grp.visible = true; fade(false);
            P.m.root.visible = false; P.blob.visible = false; g.y = -40; g.noBlob = true;
            P.place(pl.X(0), pl.Z(.9), 0); if (G.view) G.view(Math.PI, .85);
            const L = g.look.col; heads[0].face.material.color.set(L.head || '#e0b090'); for (const k of ['hair', 'back']) heads[0][k].material.color.set(L.hairTop || '#141010');
          }
        } else if (S.state === 'scene') {
          const t = S.t, beat = Math.sin(t * 7.5);
          P.blob.visible = false;
          bump.position.y = .95 + Math.max(0, beat) * .1; bump.scale.y = 1 + Math.max(0, beat) * .3;
          blanket.position.y = .74 + beat * .02; grp.position.y = Math.abs(beat) * .012;
          heads[0].h.rotation.x = -.15 + beat * .06; heads[1].h.rotation.x = -.1 - beat * .05;
          for (const h of hearts) { h.t += dt; const k = (h.t % 2.2) / 2.2; if (k < dt / 2.2 * 1.5) h.x = (Math.random() - .5) * 1.4; h.s.position.set(h.x + Math.sin(h.t * 3) * .1, 1.1 + k * 1.6, 3.1); h.s.material.opacity = Math.sin(k * Math.PI) * .95; h.s.scale.setScalar(.2 + k * .25); }
          if (t > 8.5 && t - dt <= 8.5) fade(true);
          if (t > 9) {
            // done: dressed again, both on their feet (no time skip: the clock runs the same for everyone)
            S.state = 'after'; S.t = 0; grp.visible = false; fade(false);
            P.m.root.visible = true; P.blob.visible = true; P.place(pl.X(.4), pl.Z(1.4), Math.PI);
            g.x = pl.X(1.5); g.z = pl.Z(2.0); g.y = 0; g.noBlob = false; g.heading = -Math.PI * .75; g.puppet.anim = 'flirt'; g.speed = 0;
            P.hp = 100;
            say(g, ['Приходи ещё, красавчик', 'Ты был великолепен', 'Мой номер ты знаешь', 'Для тебя — всегда'][(Math.random() * 4) | 0]);
            G.flash('Здоровье восстановлено', 3.2);
          }
        } else if (S.state === 'after') { g.puppet.anim = 'flirt'; g.speed = 0; }
      };
      // leaving the room: she goes back down to the kerb
      pl.onLeave = () => {
        const g = S.girl; S.girl = null; S.state = 'off'; grp.visible = false; fade(false);
        if (G) { G.player.m.root.visible = true; G.player.blob.visible = true; }
        if (g && G && G.crowd.people.includes(g) && pl.after) { g.x = pl.after.x + 1; g.z = pl.after.z; g.y = .17; g.noBlob = false; g.speed = 0; G.crowd.releasePuppet(g); }
      };
    }

    /* ---------------------------------------------------------------
       SHARED ROOMS: one boutique, one café, one 24/7 store and three kinds of home, each built once.
       Many doors in the city lead into the same room (shops.js hands each door its own name, menu and
       sign); whoever comes in through a door goes back out through it.
       --------------------------------------------------------------- */
    // a sign whose words change with the door you came in by
    function liveSign(face, cx, cy, cz, w, h) {
      const t = K.tex(512, 128, () => {}, false), cv = t.image, g = cv.getContext('2d');
      K.picture(face, cx, cy, cz, w, h, t);
      return (text, sub, col) => {
        const W = cv.width, H = cv.height;
        g.clearRect(0, 0, W, H); g.fillStyle = '#140a1c'; g.fillRect(0, 0, W, H);
        g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 14; g.strokeRect(10, 10, W - 20, H - 20);
        g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = sub ? 50 : 62;
        g.font = `800 ${fs}px Rubik, Arial, sans-serif`; while (g.measureText(text).width > W - 50 && fs > 20) { fs -= 2; g.font = `800 ${fs}px Rubik, Arial, sans-serif`; }
        g.fillStyle = col; g.fillText(text, W / 2, sub ? H / 2 - 14 : H / 2); g.shadowBlur = 3; g.fillStyle = '#fff'; g.globalAlpha = .7; g.fillText(text, W / 2, sub ? H / 2 - 14 : H / 2); g.globalAlpha = 1;
        if (sub) { g.shadowBlur = 0; g.font = '600 24px Rubik, Arial, sans-serif'; g.fillStyle = '#f5e8ff'; g.fillText(sub, W / 2, H / 2 + 32); }
        t.needsUpdate = true;
      };
    }
    // the room's own interactions ask the door's info what to do (shops.js fills it in)
    const ask = (pl, what) => () => { if (pl.info && pl.info.use) pl.info.use(what, pl); };
    const shared = (id, name, o) => { const pl = interior(id, name, null, o); pl.shared = true; return pl; };

    /* --- boutique: rails of clothes down both walls, mirrors, a till and a fitting room --- */
    {
      const pl = shared('shop_clothes', 'Бутик', { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-8, -6, 8, 12], light: lit('#fff6f0', '#9a8a90', 1.0), music: 'lounge' });
      K.at(pl.ox, pl.oz);
      K.room(-8, -6, 8, 12, 4.2, { wall: '#f4eef2', ceil: '#fbf8fa', trim: '#2a2230', neon: '#ff7eb6', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.floor(-8, -6, 8, 12, T.marble, 2.5);
      K.box(-1.2, 0, -3, 1.2, .02, 9, '#2a2230');
      const SH = ['#ff7eb6', '#3fe6e0', '#ffd84f', '#f5f5f0', '#18181c', '#b388ff', '#ff8a3d', '#5fd38a', '#4f7ad8', '#c9a04a'];
      for (const x of [-7.6, 7.6]) {
        const s = x < 0 ? 1 : -1;
        for (const y of [1.3, 2.6]) {
          K.box(x - .04, y + .32, -4, x + .04, y + .36, 10, '#d8dce4');
          for (let z = -3.6; z < 9.8; z += .42) K.box(x + s * .02 - .03, y - .3, z - .17, x + s * .02 + .03, y + .3, z + .17, pick(SH));
        }
        K.neon(x - .03, 3.5, -4, x + .03, 3.56, 10, '#ff7eb6');
      }
      // tables of folded jeans in the middle, a mirror wall at the back
      for (const z of [0, 5]) for (const x of [-3.6, 3.6]) {
        K.box(x - 1.1, 0, z - .7, x + 1.1, .8, z + .7, '#2a2230', true); K.box(x - 1.15, .8, z - .75, x + 1.15, .84, z + .75, '#c9a04a');
        for (let k = 0; k < 6; k++) K.box(x - .9 + (k % 3) * .62, .84, z - .5 + ((k / 3) | 0) * .55, x - .4 + (k % 3) * .62, .84 + .08 * (1 + (k % 2)), z - .1 + ((k / 3) | 0) * .55, pick(['#2f4f8a', '#1a2a4a', '#f5f5f0', '#c8b48a', '#18181c']));
      }
      K.box(-6, .3, 11.8, -2, 3.4, 11.85, '#cfe2ee'); K.neon(-6.05, 3.4, 11.75, -1.95, 3.46, 11.85, '#3fe6e0');
      // the till
      K.box(1.5, 0, 9.4, 6, 1.05, 10.3, '#2a2230', true); K.box(1.45, 1.05, 9.35, 6.05, 1.1, 10.35, '#f4eef2'); K.neon(1.5, .2, 9.34, 6, .26, 9.38, '#ff7eb6', false);
      K.box(4.8, 1.1, 9.6, 5.3, 1.45, 10, '#18181c');
      // the fitting room behind a red curtain
      K.box(-7.9, 0, 9.6, -6.2, 2.6, 9.7, '#2a2230', true); K.box(-6.2, .3, 9.7, -6.15, 2.5, 11.9, '#b0102a');
      pl.sign = liveSign('-z', 0, 3.5, 11.83, 4.6, 1.1);
      spots.push(K.spot({ kind: 'idle', x: 3.8, z: 11, heading: Math.PI, type: 'business_f', home: true }));
      spots.push(K.spot({ kind: 'idle', x: -5.8, z: 3, heading: Math.PI / 2, type: 'business_m', home: true }));
      for (const [x, z] of [[-2.5, 2.5], [2.6, 7]]) spots.push(K.spot({ kind: 'idle', x, z, heading: Math.random() * 6, type: pick(['tourist_f', 'business_f', 'beach_f']) }));
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(3.8, 8.7), r: 1.8, short: 'КАССА', label: () => pl.info ? 'Каталог · ' + pl.info.title : 'Каталог', use: ask(pl, 'buy') },
          { ...pl.P(-6.9, 8.7), r: 1.5, short: 'ПРИМЕРКА', label: () => 'Примерочная: ваш гардероб', use: () => G.ui.wardrobe() }
        ];
      };
    }

    /* --- café: a counter with the menu over it, a kitchen behind, tables and booths --- */
    {
      const pl = shared('shop_food', 'Кафе', { inside: [0, -3.4, 0], exit: [0, -4.3], bounds: [-9, -5, 9, 9], light: lit('#fff2e2', '#7a5a50', .95), music: 'diner' });
      K.at(pl.ox, pl.oz);
      K.room(-9, -5, 9, 9, 3.8, { wall: '#f7efe2', ceil: '#2a1c18', trim: '#3a2620', neon: '#ffb347', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.floor(-9, -5, 9, 9, T.checker, 1.2);
      // counter and register, the kitchen line behind it
      K.box(-6, 0, 5, 6, 1.05, 5.8, '#b0302a', true); K.box(-6.05, 1.05, 4.95, 6.05, 1.12, 5.85, '#e8e2d6'); K.neon(-6, .2, 4.94, 6, .26, 4.98, '#ffb347', false);
      K.box(-3.2, 1.12, 5.1, -2.6, 1.5, 5.6, '#18181c');
      K.box(-8.9, 0, 7, 8.9, 1.0, 8.9, '#9aa2ae', true); K.box(-8.9, 1.0, 7, 8.9, 1.05, 8.9, '#c8ccd4');
      for (const x of [-6, -3, 0, 3]) { K.box(x, 1.05, 7.5, x + 1.6, 1.15, 8.6, '#2a2a30'); K.neon(x + .3, 1.15, 7.8, x + 1.3, 1.18, 8.3, '#ff6a3a', false); }
      K.box(-8.9, 2.0, 8.4, 8.9, 2.4, 8.9, '#c8ccd4');
      for (const [x, title, col] of [[-6, 'МЕНЮ', '#ffb347'], [6, 'ГОРЯЧЕЕ', '#ff4fa3']]) K.picture('-z', x, 3.05, 8.83, 3, 1.0, T.sign(title, 'вкусно · быстро · неплохо', col));
      pl.sign = liveSign('-z', 0, 3.05, 8.82, 4, 1.1);
      // tables with chairs, booths down the left wall
      for (const [x, z] of [[3, -2], [6.5, -2], [3, 1.6], [6.5, 1.6]]) {
        K.box(x - .5, 0, z - .5, x + .5, .76, z + .5, '#e8e2d6', true); K.box(x - .06, 0, z - .06, x + .06, .74, z + .06, '#9aa2ae');
        for (const s of [-1, 1]) K.box(x - .25, 0, z + s * .85 - .2, x + .25, .46, z + s * .85 + .2, '#b0302a');
      }
      for (const z of [-2.5, 1.2]) {
        K.box(-8.9, 0, z - 1.3, -6.4, .5, z - .8, '#b0302a', true); K.box(-8.9, .5, z - 1.3, -6.4, 1.3, z - 1.1, '#b0302a');
        K.box(-8.9, 0, z + .8, -6.4, .5, z + 1.3, '#b0302a', true); K.box(-8.9, .5, z + 1.1, -6.4, 1.3, z + 1.3, '#b0302a');
        K.box(-8.6, 0, z - .6, -6.8, .76, z + .6, '#e8e2d6', true);
        K.neon(-8.95, 2.2, z - .8, -8.9, 2.3, z + .8, '#ffb347');
      }
      spots.push(K.spot({ kind: 'idle', x: 0, z: 6.4, heading: Math.PI, type: 'cook', home: true }));
      spots.push(K.spot({ kind: 'idle', x: -4.5, z: 6.3, heading: Math.PI, type: 'waitress', home: true }));
      for (const [x, z] of [[2.4, -.2], [7.2, 3.2]]) spots.push(K.spot({ kind: 'idle', x, z, heading: Math.random() * 6, mix: 'downtown' }));
      pl.attach = () => {
        pl.interactions = [{ ...pl.P(-1.5, 4.2), r: 2.0, short: 'МЕНЮ', label: () => pl.info ? 'Меню · ' + pl.info.title : 'Меню', use: ask(pl, 'menu') }];
      };
    }

    /* --- 24/7 store: aisles of shelves, glowing fridges, a till by the door --- */
    {
      const pl = shared('shop_market', 'Магазин 24/7', { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-8, -6, 8, 10], light: lit('#f2fbff', '#6a7a80', 1.05) });
      K.at(pl.ox, pl.oz);
      K.room(-8, -6, 8, 10, 3.6, { wall: '#eef3f4', ceil: '#f6f8fa', trim: '#2a8a5a', neon: '#5fd38a', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }] } });
      K.floor(-8, -6, 8, 10, T.tiles, 1);
      const GOODS = ['#ff4f4f', '#ffd84f', '#3fa8ff', '#5fd38a', '#ff8a3d', '#c28bff', '#f5f5f0', '#ff7eb6'];
      for (const x of [-4.2, 0, 4.2]) {
        K.box(x - .5, 0, -1, x + .5, 1.9, 7, '#d8dce4', true);
        for (const y of [.35, .85, 1.35]) for (let z = -.8; z < 6.8; z += .38) for (const s of [-1, 1]) K.box(x + s * .5 - (s > 0 ? 0 : .22), y, z, x + s * .5 + (s > 0 ? .22 : 0), y + rand(.25, .42), z + .3, pick(GOODS));
      }
      // fridges down the back wall
      for (let x = -7.5; x < 7.4; x += 1.5) { K.box(x, 0, 9.2, x + 1.4, 2.4, 9.95, '#c8ccd4', true); K.neon(x + .08, .2, 9.18, x + 1.32, 2.25, 9.2, '#bfefff', false); for (const y of [.5, 1.1, 1.7]) K.box(x + .15, y, 9.12, x + 1.25, y + .3, 9.17, pick(GOODS)); }
      // the till with a lottery stand
      K.box(4, 0, -4.4, 7.9, 1.0, -3.4, '#2a8a5a', true); K.box(3.95, 1.0, -4.45, 7.95, 1.05, -3.35, '#e8e2d6'); K.box(6.4, 1.05, -4.2, 6.9, 1.4, -3.7, '#18181c');
      K.box(7.5, 1.05, -4.3, 7.9, 1.9, -3.5, '#ffd84f');
      pl.sign = liveSign('-x', 7.83, 2.7, 3, 4, 1.1);
      spots.push(K.spot({ kind: 'idle', x: 5.8, z: -2.9, heading: Math.PI, type: 'business_m', home: true }));
      for (const [x, z] of [[-2, 2], [2.1, 4.5]]) spots.push(K.spot({ kind: 'idle', x, z, heading: Math.random() * 6, mix: 'downtown' }));
      // a hold-up: a gun in hand at the till, stay by it while the cashier empties it. Each store's till is robbed
      // once for everybody and again 10 minutes later (server/world.js, key store_<id>); offline: once per player
      const R = { t: 0, id: null, alarmT: 0 }, TAKE = 6;
      const key = () => 'store_' + ((pl.info && pl.info.biz) || 'x');
      const online = () => !!(NB.net && NB.net.connected);
      const robbed = () => { const P = G.progress; if (!P.storeT || typeof P.storeT !== 'object') P.storeT = {}; return P.storeT; };
      const ready = () => online() ? NB.net.lootLeft(key()) <= 0 : Date.now() - (robbed()[key()] || 0) > 10 * 60 * 1000;
      let asking = false;
      function holdUp() {
        if (R.id) return;
        if (!ready()) { G.flash('Кассу недавно уже выгребли — пусто. Загляните минут через десять', 2.6); G.audio.deny(); return; }
        if (G.combat.isMelee()) { G.flash('Для ограбления нужен ствол в руках', 2.2); G.audio.deny(); return; }
        if (asking) return;
        asking = true;
        const k = key();
        (online() ? NB.net.loot(k) : Promise.resolve(null)).then(r => {
          asking = false;
          if (r === false) { G.flash('Этот магазин только что ограбил другой игрок — касса пустая', 3); G.audio.deny(); return; }
          if (api.current !== pl) return;
          robbed()[k] = Date.now(); G.save();
          R.id = k; R.t = TAKE; R.alarmT = 40;
          G.police.robbery(2); G.crowd.panic(pl.X(5.6), pl.Z(-3), 20, true);
          G.flash('Кассир: «Не стреляйте! Всё отдам!» — стойте у кассы', 3);
        });
      }
      pl.attach = () => {
        pl.interactions = [{ ...pl.P(5.6, -5), r: 1.8, short: 'КАССА', label: () => pl.info ? 'Касса · ' + pl.info.title : 'Касса', use: ask(pl, 'menu') },
          { ...pl.P(4.6, -4.9), r: 1.6, short: 'ГРАБИТЬ', label: () => R.id || G.combat.isMelee() || !ready() ? null : 'Ограбить кассу', use: holdUp }];
      };
      pl.update = (dt) => {
        if (R.alarmT > 0) R.alarmT -= dt;
        if (!R.id) { pl.hudInfo = null; return; }
        const p = G.player, near = Math.hypot(p.x - pl.X(5.6), p.z - pl.Z(-3.2)) < 3.2 && !p.dead;
        if (near) R.t -= dt;
        pl.hudInfo = { tag: 'ОГРАБЛЕНИЕ', text: near ? 'Кассир выгребает кассу…' : 'Вернитесь к кассе!', time: Math.ceil(Math.max(0, R.t)) + ' с', warn: !near };
        if (R.t <= 0) { R.id = null; pl.hudInfo = null; G.money.add(Math.round(rand(150, 400)), 'Касса'); G.flash('Деньги ваши! Уходите, пока не приехала полиция', 3); }
      };
      pl.alarm = () => R.alarmT > 0;
      pl.onLeave = () => { if (R.id) { R.id = null; pl.hudInfo = null; G.flash('Вы ушли без денег', 2); } };
    }

    /* --- homes: the same three things to do in each --- */
    function homeInteractions(pl, bed, closet, desk) {
      pl.attach = () => {
        pl.interactions = [
          { ...pl.P(bed[0], bed[1]), r: 1.8, short: 'СПАТЬ', label: () => 'Спать и сохраниться', use: ask(pl, 'sleep') },
          { ...pl.P(closet[0], closet[1]), r: 1.5, short: 'ОДЕЖДА', label: () => 'Гардероб', use: () => G.ui.wardrobe() },
          { ...pl.P(desk[0], desk[1]), r: 1.5, short: 'ДОМ', label: () => 'Жильё: оплата и продажа', use: ask(pl, 'home') }
        ];
      };
    }
    const sofa = (x0, z0, x1, z1, hex, back) => { K.box(x0, 0, z0, x1, .45, z1, hex, true); if (back === '+z') K.box(x0, .45, z1 - .25, x1, 1.05, z1, hex); if (back === '-x') K.box(x0, .45, z0, x0 + .25, 1.05, z1, hex); };
    const bedAt = (x, z, w, l, cover) => { K.box(x - w / 2, 0, z - l / 2, x + w / 2, .45, z + l / 2, '#3a2a30', true); K.box(x - w / 2 + .05, .45, z - l / 2 + .05, x + w / 2 - .05, .6, z + l / 2 - .05, '#f5f0ec'); K.box(x - w / 2 + .05, .6, z - l / 2 + .05, x + w / 2 - .05, .64, z + l / 4, cover); K.box(x - w / 2, .45, z + l / 2 - .1, x + w / 2, 1.3, z + l / 2, '#3a2a30'); };
    const windowView = (face, x, y, z, w, h, night) => K.picture(face, x, y, z, w, h, K.tex(512, 256, (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, night ? '#1a1240' : '#7ac8ff'); gr.addColorStop(1, night ? '#ff6aa8' : '#ffd9a8'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let k = 0; k < 14; k++) { const bw = 20 + Math.random() * 30, bh = 40 + Math.random() * 140, bx = Math.random() * W; g.fillStyle = night ? '#2a1c40' : '#8aa0b8'; g.fillRect(bx, H - bh, bw, bh); g.fillStyle = night ? '#ffd58a' : '#d8e4f0'; for (let y = H - bh + 6; y < H - 6; y += 12) for (let xx = bx + 4; xx < bx + bw - 4; xx += 8) if (Math.random() < .5) g.fillRect(xx, y, 4, 6); }
      g.fillStyle = '#1a1a22'; g.fillRect(0, 0, W, 6); g.fillRect(0, H - 6, W, 6); g.fillRect(W / 2 - 3, 0, 6, H);
    }, false));

    // an apartment: one big room — sofa and TV, a kitchen corner, the bed behind a half wall
    {
      const pl = shared('home_flat', 'Квартира', { inside: [0, -3.4, 0], exit: [0, -4.3], bounds: [-6, -5, 6, 7], light: lit('#fff4ea', '#7a6a64', 1.0) });
      K.at(pl.ox, pl.oz);
      K.room(-6, -5, 6, 7, 3.0, { wall: '#efe8e0', ceil: '#f6f2ee', trim: '#6a5040', neon: '#3fe6e0', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.5 }] } });
      K.floor(-6, -5, 6, 7, T.wood, 2); K.floor(-4.8, -1.6, -1.6, 1.6, T.carpetPink, 1.5, .01);
      windowView('-z', -3, 1.7, 6.83, 3.6, 1.6, true);
      sofa(-5.9, -1.2, -5.0, 1.2, '#4a5a8a', '-x'); K.box(-4.2, 0, -.5, -3.2, .4, .5, '#6a5040', true);
      K.box(-1.2, 0, -.8, -.9, .7, .8, '#2a2a30', true); K.box(-1.15, .7, -.6, -1.05, 1.5, .6, '#141418'); K.screen('-x', -1.16, 1.1, 0, 1.15, .65, 2);
      // kitchen corner
      K.box(3.6, 0, -4.9, 5.9, .9, -2.4, '#f2f2f2', true); K.box(3.55, .9, -4.95, 5.95, .95, -2.35, '#3a3a40'); K.box(5.3, 0, -2.3, 5.9, 2.0, -1.5, '#d8dce4', true);
      K.box(4.0, .95, -4.6, 4.6, 1.0, -4.0, '#18181c');
      // the bedroom behind a half wall
      K.box(.5, 0, 2.6, 6, 1.4, 2.8, '#e2dad2', true);
      bedAt(3.6, 5.4, 2.0, 2.6, '#3fa8c8');
      K.box(.6, 0, 5.8, 1.3, 2.2, 6.9, '#8a6a50', true);
      K.neon(5.94, 1.8, 4, 5.98, 1.9, 6.6, '#ff7eb6');
      homeInteractions(pl, [3.6, 3.5], [1.8, 6.2], [-1.8, -3.6]);
    }

    // a house: a living room with a fireplace and a dining table, a kitchen, a bedroom through a door
    {
      const pl = shared('home_house', 'Дом', { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-8, -6, 8, 12], light: lit('#fff6ec', '#7a6a58', 1.0) });
      K.at(pl.ox, pl.oz);
      K.room(-8, -6, 8, 5, 3.2, { wall: '#f3ece0', ceil: '#faf6f0', trim: '#7a5a3a', neon: '#ffb347', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.5 }], '+z': [{ c: 4, w: 1.4, h: 2.4 }] } });
      K.floor(-8, -6, 8, 5, T.wood, 2); K.floor(-7, -3, -2, 1.5, T.casino, 2, .01);
      windowView('+x', 7.83, 1.7, -3.5, 3, 1.4, false);
      sofa(-7.9, -2.6, -6.9, 1.2, '#7a3a3a', '-x'); sofa(-6.5, 1.2, -3, 2.1, '#7a3a3a', '+z');
      // the fireplace, glowing
      K.box(-5.5, 0, 4.4, -2.5, 1.6, 4.9, '#8a7a6a', true); K.box(-4.6, .1, 4.35, -3.4, 1.0, 4.4, '#1a1010'); K.neon(-4.4, .15, 4.36, -3.6, .5, 4.38, '#ff8a3d');
      K.box(-5.7, 1.6, 4.3, -2.3, 1.72, 4.95, '#6a5040');
      // the dining table, the kitchen along the right wall
      K.box(1, 0, -1.5, 3.6, .78, .1, '#8a6a50', true); for (const z of [-1.1, -.3]) for (const x of [.6, 4.0]) K.box(x - .2, 0, z - .2, x + .2, .48, z + .2, '#5a4030');
      K.box(6.2, 0, -1, 7.9, .9, 2.8, '#f2f2f2', true); K.box(6.15, .9, -1.05, 7.95, .95, 2.85, '#3a3a40'); K.box(6.2, 0, 3.2, 7.9, 2.1, 4.6, '#d8dce4', true);
      K.box(6.4, .95, .2, 7.2, 1.0, 1.0, '#18181c');
      // the bedroom
      K.room(0, 5.3, 8, 12, 3.2, { wall: '#eef0f6', ceil: '#f6f6fa', trim: '#7a5a3a', neon: '#b388ff', gaps: { '-z': [{ c: 4, w: 1.4, h: 2.4 }] } });
      K.floor(0, 5.3, 8, 12, T.wood, 2);
      bedAt(4.6, 10.4, 2.2, 2.8, '#b388ff');
      K.box(.3, 0, 7.6, 1.0, 2.4, 11.6, '#8a6a50', true);
      windowView('-z', 4.6, 2.3, 11.83, 2.6, 1.0, true);
      homeInteractions(pl, [4.6, 8.4], [1.7, 9.6], [-1.8, -4.4]);
    }

    // a mansion: a tall marble hall, a bar, a white piano, an aquarium wall, a master bedroom
    {
      const pl = shared('home_mansion', 'Особняк', { inside: [0, -4.4, 0], exit: [0, -5.3], bounds: [-12, -6, 12, 18], light: lit('#fff8f0', '#8a7a70', 1.05), music: 'lounge' });
      K.at(pl.ox, pl.oz);
      const GOLD = '#c9a04a';
      K.room(-12, -6, 12, 10, 6, { wall: '#f8f4ee', ceil: '#fbf8f2', trim: GOLD, neon: '#ffd84f', gaps: { '-z': [{ c: 0, w: 1.6, h: 2.6 }], '+z': [{ c: 6, w: 1.6, h: 2.6 }] } });
      K.floor(-12, -6, 12, 10, T.marble, 3); K.floor(-3, -2, 3, 6, T.casino, 2.5, .01);
      for (const x of [-11.9, 11.9]) for (const z of [-3, 1.5, 6]) K.box(x - .12, 0, z - .2, x + .12, 6, z + .2, GOLD);
      // a chandelier
      K.box(-.03, 4.6, 2 - .03, .03, 6, 2 + .03, GOLD);
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, x = Math.cos(a) * 1.1, z = 2 + Math.sin(a) * 1.1; K.neon(x - .04, 4.2, z - .04, x + .04, 4.55, z + .04, '#fff6dc', k % 2 === 0); }
      // sofas round a glass table, the white piano, the bar with bottles
      sofa(-3, -1.8, 3, -1, '#f5f0ec', '+z'); sofa(-3, 5, 3, 5.8, '#f5f0ec', '+z'); K.box(-1.2, 0, 1.4, 1.2, .42, 2.6, '#9fdfff', true);
      K.box(7, 0, 2, 9.2, 1.0, 4.4, '#f8f8f8', true); K.box(7, 1.0, 3.9, 9.2, 1.6, 4.4, '#f8f8f8'); K.box(7.1, 1.0, 2.0, 9.1, 1.04, 2.5, '#18181c');
      K.box(-11.9, 0, -5, -10, 1.1, 1, '#2a1a20', true); K.box(-11.95, 1.1, -5.05, -9.95, 1.16, 1.05, GOLD);
      for (let z = -4.6; z < .8; z += .32) K.box(-11.8, 1.6, z, -11.6, 1.6 + rand(.3, .5), z + .14, pick(['#5fd38a', '#ffb347', '#c9a04a', '#ff6b8a', '#bfefff']));
      K.box(-11.9, 1.55, -5, -11.5, 1.6, 1, '#d8dce4'); K.neon(-11.88, 2.4, -5, -11.84, 2.5, 1, '#ffd84f');
      // the aquarium wall
      K.box(-11.9, .4, 3, -11.4, 3.6, 9, '#1a3a6a'); K.screen('+x', -11.38, 2, 6, 5.8, 3.0, 3);
      K.neon(-11.4, 3.6, 3, -11.3, 3.68, 9, '#3fe6e0');
      windowView('-z', -3, 3.4, 9.83, 9, 3.6, true);
      // the master bedroom through the back door
      K.room(0, 10.3, 12, 18, 3.6, { wall: '#f6eef2', ceil: '#fbf6f8', trim: GOLD, neon: '#ff7eb6', gaps: { '-z': [{ c: 6, w: 1.6, h: 2.6 }] } });
      K.floor(0, 10.3, 12, 18, T.pinkMarble, 2.5);
      const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, .55, 32).translate(0, .275, 0), new THREE.MeshLambertMaterial({ color: 0xffffff })); bed.position.set(K.wx(6), 0, K.wz(15.4)); scene.add(bed);
      const cover = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.65, .12, 32).translate(0, .6, 0), new THREE.MeshLambertMaterial({ color: 0xc9a04a })); cover.position.copy(bed.position); scene.add(cover);
      K.solid(4.3, 0, 13.7, 7.7, .66, 17.1);
      K.box(.3, 0, 12, 1.1, 2.8, 17, '#e8dce4', true);
      windowView('+x', 11.83, 2, 14, 4, 1.8, true);
      homeInteractions(pl, [6, 13.1], [1.8, 14.5], [-2.2, -4.4]);
    }

    // an economy studio in a block of flats: one small room — a single bed, a sink and a hotplate, an old TV
    {
      const pl = shared('home_studio', 'Студия', { inside: [0, -2.4, 0], exit: [0, -3.3], bounds: [-3.5, -4, 3.5, 4], light: lit('#f6f0e6', '#6a6058', .9) });
      K.at(pl.ox, pl.oz);
      K.room(-3.5, -4, 3.5, 4, 2.7, { wall: '#d8d0c0', ceil: '#e8e4dc', trim: '#5a4a3a', neon: '#8cff6b', gaps: { '-z': [{ c: 0, w: 1.4, h: 2.3 }] } });
      K.floor(-3.5, -4, 3.5, 4, T.darkTile, 1);
      windowView('-z', 1.6, 1.6, 3.83, 1.6, 1.1, true);
      // a single bed along the right wall, a rug
      K.box(2.4, 0, .6, 3.45, .4, 3.9, '#5a4a3a', true); K.box(2.45, .4, .65, 3.4, .52, 3.85, '#e8e2d6'); K.box(2.45, .52, .65, 3.4, .56, 2.8, '#6a7ab8');
      K.box(-.9, 0, .4, .9, .01, 1.8, '#8a3a3a');
      // the kitchen corner: a sink, a hotplate, a little fridge
      K.box(-3.45, 0, 1.5, -2.6, .9, 3.9, '#c8c8c8', true); K.box(-3.4, .9, 2.0, -2.8, .93, 2.6, '#8a9aa8'); K.box(-3.4, .9, 3.0, -2.8, .95, 3.6, '#18181c');
      K.box(-3.45, 0, -1.2, -2.7, 1.4, -.3, '#e8e8ec', true);
      // an old TV on a crate
      K.box(-1.2, 0, 3.3, -.2, .5, 3.9, '#8a6a4a', true); K.box(-1.1, .5, 3.4, -.3, 1.15, 3.85, '#2a2a30'); K.screen('-z', -.7, .82, 3.38, .6, .45, 2);
      homeInteractions(pl, [2.0, 2.2], [-2.0, -.8], [1.8, -2.6]);
    }

    K.finish();

    /* =====================================================================
       runtime
       ===================================================================== */
    for (const pl of places) if (!pl.update) pl.update = () => {};
    const api = {
      list: places, spots, freeSeats, VILLA_PRICE, garage, tiki, heliPad, towerRoof, yacht, dealer,
      current: null,
      byId: id => places.find(p => p.id === id),
      // which interior a point is in
      at(x, z) { for (const p of places) { const b = p.bounds; if (x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1) return p; } return null; },
      attach(g) {
        G = g; for (const p of places) if (p.attach) p.attach();
        for (const s of marina.slots) s.boat = G.vehicles.spawnParked(s.id, s.x, s.z, s.h);
      },
      // walking into a door circle: returns { place, dir } to go through
      doors(player, onFoot) {
        for (const m of markers) {
          const d = Math.hypot(player.x - m.x, player.z - m.z);
          if (d > 1.8) { m.armed = true; continue; }
          if (!m.armed || !onFoot || d > .85 || Math.abs(player.y - m.g.position.y) > 1.5) continue;
          m.armed = false;
          if (m.dir === 'in' && m.info) {
            // one of the many doors into a shared room: it may be locked (a home you don't own), and it
            // tells the room who it is this time — the name, the sign, the menu, the way back out
            if (m.info.enabled && !m.info.enabled()) { if (m.info.locked) m.info.locked(); continue; }
            const pl = m.place; pl.door = m.door; pl.info = m.info; pl.name = m.info.name || pl.name;
            if (pl.sign) pl.sign(m.info.title, m.info.sub, m.info.hex);
            return m;
          }
          if (m.dir === 'in' && !m.place.enabled()) { G.flash(m.place.locked ? m.place.locked() : 'Закрыто', 2.4); continue; }
          return m;
        }
        return null;
      },
      disarm() { for (const m of markers) m.armed = false; },
      // another door into a shared room (shops.js): door { x, z, y, nx, nz, heading, hex }, info { name, title, sub, hex, use, enabled, locked }
      addDoor(id, door, info) {
        const pl = api.byId(id); if (!pl) return null;
        // a place that had one door of its own (the gun shop) now has several: its own door must also say
        // which way is out, or you'd leave by whichever door was used last
        if (!pl.shared && !pl.manyDoors) {
          pl.manyDoors = true;
          const own = markers.find(m => m.place === pl && m.dir === 'in' && !m.info);
          if (own) { own.door = pl.door; own.info = { name: pl.name, title: pl.name }; }
        }
        const m = marker(door.x, door.y != null ? door.y : .15, door.z, door.hex || '#ffd84f', pl, 'in');
        m.door = door; m.info = info; markers.push(m); return m;
      },
      // things to use right here: inside the current interior, or out in the city
      interactions() { return api.current ? api.current.interactions : outdoor; },
      update(dt) {
        if (api.current) api.current.update(dt);
        // a boat taken from the marina is replaced once you're well away from the pier
        if (G && (marina.t = (marina.t || 0) - dt) <= 0) {
          marina.t = 2;
          const p = G.player;
          for (const s of marina.slots) {
            const b = s.boat, gone = !b || !G.vehicles.cars.includes(b) || Math.hypot(b.x - s.x, b.z - s.z) > 20;
            if (gone && Math.hypot(p.x - s.x, p.z - s.z) > 70 && G.vehicles.driving !== b) s.boat = G.vehicles.spawnParked(s.id, s.x, s.z, s.h);
          }
        }
        // the garage door rolls up for the owner
        if (G && garage) {
          const p = G.player, near = G.progress.villa && Math.hypot(p.x - 111.3, p.z - 84.7) < 13;
          garage.open = U.damp(garage.open, near ? 1 : 0, 3, dt);
          garage.doorMesh.scale.y = Math.max(.06, 1 - garage.open); garage.doorMesh.position.y = 2.8 * (1 - Math.max(.06, 1 - garage.open));
          garage.doorCol.maxY = garage.open > .85 ? -1 : 2.8;
          // a car left inside is kept: marked parked so the city never tidies it away
          const r = garage.rect;
          for (const c of G.vehicles.cars) if (!c.ai && c.driver !== 'player' && c.x > r.x0 && c.x < r.x1 && c.z > r.z0 && c.z < r.z1) c.parked = true;
        }
      },
      get hud() { return api.current && api.current.hudInfo; },
      render(t, env) {
        K.screenMat.uniforms.uTime.value = t;
        for (const m of markers) { m.beam.material.opacity = .08 + Math.sin(t * 3 + m.x) * .04; }
        for (const p of places) { if (p.render) p.render(t); if (p.renderRoof) p.renderRoof(t); if (p.renderOutdoor) p.renderOutdoor(t); }
        const night = env ? env.night : 0;
        if (jacuzziMat) jacuzziMat.uniforms.uTime.value = t;
        if (underGlow) underGlow.material.opacity = .15 + night * .55;
        for (const f of torches) { const k = 1 + Math.sin(t * 13 + f.position.x) * .12 + Math.sin(t * 7.3 + f.position.z) * .08; f.scale.set(.55 * k, .8 * k, 1); f.material.opacity = .6 + night * .4; }
      },
      // which in-city venue music is audible here
      venueAt(x, z) {
        const dy = Math.hypot(x - yacht.x, z - yacht.z);
        if (dy < 70) return { name: 'club', level: Math.max(0, 1 - dy / 70) * (dy < 16 ? 1 : .6) };   // the party on the yacht
        const d = Math.hypot(x - tiki.x, z - tiki.z); return d < 42 ? { name: 'tiki', level: Math.max(0, 1 - d / 42) * (d < 7 ? 1 : .6) } : null;
      }
    };
    return api;
  };
})(window.NB);
