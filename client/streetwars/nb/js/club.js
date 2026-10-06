// NEPLOXO 21: a pink art-deco disco club on the ocean front, in the spirit of the Malibu in Vice City.
// Outside: a neon script sign on a tower above the entrance, glass-block windows, a canopy, palms and
// searchlights sweeping the night sky. Inside, a real room you can walk around: a flashing dance floor,
// a DJ on a stage in front of an LED wall, a bar with glowing shelves, velvet booths, a mirror ball
// throwing light specks on the walls and moving-head beams. The music itself lives in audio.js.
(function (NB) {
  'use strict';
  const { U } = NB;
  const BPS = 118 / 60;   // beats per second, shared with the music

  NB.buildClub = function (ctx) {
    const { scene, col, C, bPlain, bNeon, bGlow, neonRing, mapShapes, palms } = ctx;
    // footprint: outer walls x 64..90, z 12..38; the entrance faces the sea (+x) at z = 25
    const X0 = 64, X1 = 90, Z0 = 12, Z1 = 38, H = 8, T = .2, DZ = 25, DW = .8, DH = 2.8;
    const IX0 = X0 + 2 * T, IX1 = X1 - 2 * T, IZ0 = Z0 + 2 * T, IZ1 = Z1 - 2 * T;
    const PINK = '#f6a9c9', WHITE = '#fbf1f4', INNER = '#3a2149', FLOOR = '#221431', CEIL = '#1a0f24';
    const R = U.rng(2121), rr = (a, b) => a + R() * (b - a);
    const box = (b, x0, y0, z0, x1, y1, z1, hex, solid, o) => { b.box(x0, y0, z0, x1, y1, z1, C(hex), o); if (solid) col.add(x0, y0 < .5 ? 0 : y0, z0, x1, y1, z1); };
    const neon = (x0, y0, z0, x1, y1, z1, hex, glow = true) => {
      bNeon.box(x0, y0, z0, x1, y1, z1, C(hex));
      if (glow) bGlow.box(x0 - .18, y0 - .18, z0 - .18, x1 + .18, y1 + .18, z1 + .18, C(hex).multiplyScalar(.8), { noTop: true });
    };

    /* ---------- shell: pink outside, dark inside, a doorway in the front ---------- */
    // each wall is two layers so the outside and the inside get their own colours
    const wall = (x0, z0, x1, z1, y0 = .15, y1 = H) => {
      const outer = [x0, z0, x1, z1], inner = [x0, z0, x1, z1];
      if (x1 - x0 < z1 - z0) { if (x0 === X0) { outer[2] = x0 + T; inner[0] = x0 + T; } else { outer[0] = x1 - T; inner[2] = x1 - T; } }
      else { if (z0 === Z0) { outer[3] = z0 + T; inner[1] = z0 + T; } else { outer[1] = z1 - T; inner[3] = z1 - T; } }
      box(bPlain, outer[0], y0, outer[1], outer[2], y1, outer[3], PINK);
      box(bPlain, inner[0], y0, inner[1], inner[2], y1, inner[3], INNER);
      if (y0 < 1) col.add(x0, 0, z0, x1, y1, z1); else col.add(x0, y0, z0, x1, y1, z1);
    };
    wall(X0, Z0, X0 + 2 * T, Z1);                   // back
    wall(X0, Z0, X1, Z0 + 2 * T);                   // south
    wall(X0, Z1 - 2 * T, X1, Z1);                   // north
    wall(X1 - 2 * T, Z0, X1, DZ - DW);              // front, left of the door
    wall(X1 - 2 * T, DZ + DW, X1, Z1);              // front, right of the door
    wall(X1 - 2 * T, DZ - DW, X1, DZ + DW, DH, H);  // lintel over the door
    // roof, and a ceiling that faces down so it's visible from inside
    box(bPlain, X0 - .15, H, Z0 - .15, X1 + .15, H + .45, Z1 + .15, WHITE, true);
    bPlain.quad([IX0, H - .01, IZ0], [IX1, H - .01, IZ0], [IX1, H - .01, IZ1], [IX0, H - .01, IZ1], 0, -1, 0, C(CEIL), [.03, .5], [.03, .5], [.03, .5], [.03, .5]);
    bPlain.flat(IX0, IZ0, IX1, IZ1, .16, C(FLOOR));
    mapShapes.push({ x0: X0, z0: Z0, x1: X1, z1: Z1, c: '#ff7ab8', k: 'b' });

    /* ---------- facade ---------- */
    // white bands, a tower above the entrance carrying the sign, fins either side of the door, a canopy
    for (const [y0, y1] of [[3.05, 3.3], [7.5, 8]]) {
      box(bPlain, X1, y0, Z0 - .08, X1 + .1, y1, Z1 + .08, WHITE);
      box(bPlain, X0 - .1, y0, Z0 - .08, X1, y1, Z0, WHITE); box(bPlain, X0 - .1, y0, Z1, X1, y1, Z1 + .08, WHITE);
    }
    box(bPlain, 85.5, H + .45, 20.4, X1 + .4, 13, 29.6, PINK, true);
    box(bPlain, 85.3, 13, 20.2, X1 + .6, 13.35, 29.8, WHITE);
    box(bPlain, 86.5, 13.35, 21.5, X1, 14.6, 28.5, PINK);
    neonRing(85.3, 20.2, X1 + .6, 29.8, 13.4, '#3fe6e0');
    neon(X1 + .42, H + .6, 20.35, X1 + .5, 12.9, 20.5, '#3fe6e0'); neon(X1 + .42, H + .6, 29.5, X1 + .5, 12.9, 29.65, '#3fe6e0');
    for (const z of [DZ - 2.4, DZ + 1.8]) {
      box(bPlain, X1, .15, z, X1 + .6, H, z + .6, WHITE, true);
      neon(X1 + .6, .6, z + .25, X1 + .66, H - .4, z + .35, '#ff4fa3');
    }
    box(bPlain, X1, 3.05, DZ - 3, X1 + 2.6, 3.3, DZ + 3, WHITE, true);
    neon(X1 + 2.6, 2.98, DZ - 3, X1 + 2.66, 3.06, DZ + 3, '#ff4fa3');
    neon(X1 - .02, DH, DZ - DW - .05, X1 + .04, DH + .08, DZ + DW + .05, '#3fe6e0', false);
    neonRing(X0 - .15, Z0 - .15, X1 + .15, Z1 + .15, H + .5, '#ff4fa3');
    // glass-block windows glowing cyan on both sides of the entrance
    for (const zs of [14.2, 30.4]) for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
      const y = 4.3 + r * .45, z = zs + c * .45;
      bNeon.box(X1 + .1, y, z, X1 + .14, y + .38, z + .38, C(r === 1 ? '#bff4ff' : '#7fe0f5'));
    }
    bGlow.box(X1 + .1, 4.1, 14, X1 + .5, 5.8, 17.9, C('#3fe6e0').multiplyScalar(.7), { noTop: true });
    bGlow.box(X1 + .1, 4.1, 30.2, X1 + .5, 5.8, 34.1, C('#3fe6e0').multiplyScalar(.7), { noTop: true });
    palms.push([X1 + 2.6, .15, DZ - 5.2], [X1 + 2.6, .15, DZ + 5.2]);

    // the sign: "NEPLOXO" in pink neon script and a big cyan "21"
    const signCv = document.createElement('canvas'); signCv.width = 1024; signCv.height = 460;
    const signTex = new THREE.CanvasTexture(signCv); signTex.anisotropy = 4;
    function drawSign(script) {
      const g = signCv.getContext('2d'), W = signCv.width, Hh = signCv.height;
      g.clearRect(0, 0, W, Hh);
      const glowText = (text, x, y, font, col, blur) => {
        g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = col; g.shadowBlur = blur; g.fillStyle = col;
        g.fillText(text, x, y); g.fillText(text, x, y);
        g.shadowBlur = blur * .25; g.fillStyle = '#fff3fa'; g.globalAlpha = .8; g.fillText(text, x, y); g.globalAlpha = 1;
      };
      glowText('NEPLOXO', W / 2, 150, script ? '150px Pacifico' : 'italic bold 150px "Trebuchet MS", Arial, sans-serif', '#ff4fa3', 36);
      glowText('21', W / 2, 345, '900 170px Rubik, "Arial Black", Arial, sans-serif', '#3fe6e0', 34);
      g.shadowBlur = 0; g.strokeStyle = '#ffd84f'; g.lineWidth = 6; g.shadowColor = '#ffd84f'; g.shadowBlur = 18;
      g.beginPath(); g.moveTo(170, 262); g.lineTo(390, 262); g.moveTo(634, 262); g.lineTo(854, 262); g.stroke();
      signTex.needsUpdate = true;
    }
    drawSign(false);
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('150px Pacifico'), document.fonts.load('900 170px Rubik')]).then(() => drawSign(true)).catch(() => {});
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.05).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthWrite: false }));
    sign.position.set(X1 + .63, 10.75, DZ); scene.add(sign);
    bGlow.panel('+x', X1 + .61, DZ, 8.6, 12.9, 4.4, C('#ff4fa3').multiplyScalar(.45));

    /* ---------- inside ---------- */
    // neon lines along the walls
    const strip = (y, hex) => {
      neon(IX0, y, IZ0, IX1, y + .06, IZ0 + .05, hex); neon(IX0, y, IZ1 - .05, IX1, y + .06, IZ1, hex);
      neon(IX0, y, IZ0, IX0 + .05, y + .06, IZ1, hex);
      neon(IX1 - .05, y, IZ0, IX1, y + .06, DZ - DW - .3, hex); neon(IX1 - .05, y, DZ + DW + .3, IX1, y + .06, IZ1, hex);
    };
    strip(2.5, '#ff4fa3'); strip(7.6, '#3fe6e0');
    // DJ stage at the back wall, one step up, with the booth
    box(bPlain, IX0, .15, 19, 67.6, .55, 31, '#2c1a3c', true);
    neon(67.6, .45, 19, 67.66, .52, 31, '#3fe6e0');
    box(bPlain, 66.2, .55, 22.5, 67, 1.6, 27.5, '#1b1024', true);
    neon(67, 1.45, 22.5, 67.05, 1.52, 27.5, '#ff4fa3');
    for (const z of [23.6, 26.4]) box(bPlain, 66.35, 1.6, z - .35, 66.85, 1.68, z + .35, '#3a3a44');
    box(bPlain, 66.4, 1.6, 24.6, 66.8, 1.75, 25.4, '#5a5a66');
    for (const z of [20, 30]) { box(bPlain, IX0 + .1, .55, z - .5, IX0 + 1.1, 2.5, z + .5, '#111018', true); box(bPlain, IX0 + 1.1, .75, z - .38, IX0 + 1.13, 2.35, z + .38, '#2a2a33'); }
    // bar along the north wall with stools, and glowing shelves full of bottles behind
    box(bPlain, 70, .15, 34.2, 84, 1.15, 35.2, '#3a1f4a', true);
    box(bPlain, 69.9, 1.15, 34.1, 84.1, 1.24, 35.3, '#d9cdea');
    neon(70, .32, 34.14, 84, .38, 34.2, '#ff4fa3');
    box(bPlain, 70, .15, IZ1 - .45, 84, 3.4, IZ1, '#1a1020', true);
    const BOTTLES = ['#5fd38a', '#ffb347', '#ff6b8a', '#9fd8ff', '#f5e6a8', '#c28bff', '#7a3a1a'];
    for (const y of [1.45, 2.1, 2.75]) {
      neon(70.1, y - .06, IZ1 - .5, 83.9, y - .02, IZ1 - .45, '#3fe6e0', false);
      for (let x = 70.3; x < 83.7; x += rr(.22, .4)) { const h = rr(.25, .4); bNeon.box(x, y, IZ1 - .42, x + .09, y + h, IZ1 - .33, C(BOTTLES[(R() * BOTTLES.length) | 0]).multiplyScalar(.75)); }
    }
    bGlow.box(70, 1.2, IZ1 - .7, 84, 3.3, IZ1 - .3, C('#3fe6e0').multiplyScalar(.35), { noTop: true });
    for (let x = 71; x < 83.5; x += 2) {
      box(bPlain, x - .05, .15, 33.25, x + .05, .78, 33.35, '#c9c9d4');
      box(bPlain, x - .22, .78, 33.08, x + .22, .86, 33.52, '#ff4fa3');
      col.add(x - .18, 0, 33.12, x + .18, .86, 33.48);
    }
    // velvet booths along the south wall, small tables in the gaps
    const seats = [];
    for (const [a, b] of [[68.4, 73.4], [74.6, 79.6], [80.8, 85.8]]) {
      box(bPlain, a, .15, IZ0, b, .6, IZ0 + 1, '#a01d55', true);
      box(bPlain, a, .6, IZ0, b, 1.35, IZ0 + .35, '#861745', true);
      neon(a, 1.35, IZ0, b, 1.4, IZ0 + .08, '#ff4fa3', false);
      for (let x = a + .7; x < b - .4; x += 1.25) seats.push(x);
    }
    for (const x of [74, 80.2]) { box(bPlain, x - .35, .15, IZ0 + .1, x + .35, .62, IZ0 + .8, '#d9cdea', true); neon(x - .2, .62, IZ0 + .3, x + .2, .72, IZ0 + .6, '#ffd84f', false); }
    // standing cocktail tables by the entrance, each with a glowing top and a few drinks
    const cocktail = [[85.2, 16.6], [85.4, 20.8], [84.6, 29.6], [72.4, 16.2]];
    for (const [x, z] of cocktail) {
      box(bPlain, x - .08, .15, z - .08, x + .08, 1.05, z + .08, '#c9c9d4');
      box(bPlain, x - .3, .15, z - .3, x + .3, .2, z + .3, '#2a2a33');
      box(bPlain, x - .42, 1.05, z - .42, x + .42, 1.12, z + .42, '#d9cdea');
      neon(x - .42, 1.0, z - .42, x + .42, 1.05, z + .42, '#3fe6e0', false);
      for (const [dx, dz, c] of [[-.15, .1, '#ff6b8a'], [.18, -.12, '#ffd84f'], [.05, .22, '#5fd38a']]) bNeon.box(x + dx - .04, 1.12, z + dz - .04, x + dx + .04, 1.3, z + dz + .04, C(c).multiplyScalar(.8));
      col.add(x - .12, 0, z - .12, x + .12, 1.12, z + .12);
    }

    /* ---------- VIP balcony: a second floor along the north wall, over the bar, up a stair by the door ---------- */
    const MY = 3.8, MZ = 31.5, SX = 88.2;   // balcony floor height, its front edge, the stair's inner side
    box(bPlain, IX0, MY - .4, MZ, IX1, MY, IZ1, '#2a1838', true);
    bPlain.flat(IX0, MZ, IX1, IZ1, MY + .01, C('#3a1f4a'));
    neon(IX0, MY - .4, MZ - .05, IX1, MY - .32, MZ, '#ff4fa3');
    neon(IX0, MY - .12, MZ - .05, IX1, MY - .06, MZ, '#3fe6e0', false);
    // the railing: posts, a glowing top rail, one solid collider
    for (let x = IX0 + .6; x < SX; x += 1.3) box(bPlain, x - .04, MY, MZ + .02, x + .04, MY + 1, MZ + .1, '#c9c9d4');
    box(bPlain, IX0, MY + .98, MZ, SX, MY + 1.06, MZ + .12, '#d9cdea');
    neon(IX0, MY + 1.06, MZ + .02, SX, MY + 1.1, MZ + .1, '#ff4fa3');
    box(bPlain, IX0, MY + .35, MZ + .04, SX, MY + .4, MZ + .08, '#8a7a9a');
    col.add(IX0, MY, MZ, SX, MY + 1.1, MZ + .15);
    // the stair along the front wall, from z 27 up to the balcony
    const STEPS = 10, SZ0 = 27, SD = (MZ - SZ0) / STEPS;
    for (let k = 0; k < STEPS; k++) {
      const top = .16 + (MY - .16) * (k + 1) / STEPS, z = SZ0 + k * SD;
      box(bPlain, SX, .15, z, IX1, top, z + SD, k % 2 ? '#3a2149' : '#34203f', true);
      neon(SX, top - .05, z - .01, IX1, top, z + .03, '#3fe6e0', false);
    }
    box(bPlain, SX - .12, .15, SZ0 + .4, SX, 1.1, MZ, '#2e1a3e', true);   // the stair's side wall, a handrail above it
    col.add(SX - .12, 0, SZ0 + .4, SX, MY + 1.1, MZ);
    { const L = MZ - SZ0 - .4; for (let k = 0; k < 9; k++) { const z = SZ0 + .4 + k * L / 9, y = 1.1 + (MY * k / 9); neon(SX - .14, y, z, SX + .02, y + .07, z + L / 9, '#ff4fa3', false); } }
    // a VIP sign on the wall over the balcony
    const vipN = (x0, y0, x1, y1) => neon(x0, MY + y0, IZ1 - .06, x1, MY + y1, IZ1 - .02, '#ffd84f');
    vipN(74, 2.6, 74.1, 3.3); vipN(74.1, 2.6, 74.5, 2.68); vipN(74.4, 2.6, 74.5, 3.3);            // V
    vipN(74.9, 2.6, 75, 3.3);                                                                      // I
    vipN(75.4, 2.6, 75.5, 3.3); vipN(75.5, 3.22, 75.95, 3.3); vipN(75.5, 2.9, 75.95, 2.98); vipN(75.9, 2.9, 76, 3.3);   // P
    // white leather sofas along the wall with low tables in front, and round tables with chairs by the railing
    const vip = [];
    for (const [a, b] of [[65.2, 70.6], [72.2, 78], [79.6, 85.4]]) {
      box(bPlain, a, MY, IZ1 - 1, b, MY + .45, IZ1, '#efe6f2', true);
      box(bPlain, a, MY + .45, IZ1 - .35, b, MY + 1.2, IZ1, '#e2d6e8', true);
      for (const x of [a, b - .3]) box(bPlain, x, MY + .45, IZ1 - 1, x + .3, MY + .75, IZ1 - .35, '#e2d6e8');
      neon(a, MY + .02, IZ1 - 1.02, b, MY + .08, IZ1 - .98, '#9b6bff', false);
      for (let x = a + .75; x < b - .5; x += 1.15) vip.push({ kind: 'sit', x, z: IZ1 - .62, y: MY + .51, heading: Math.PI });
      const tx = (a + b) / 2;
      box(bPlain, tx - 1.1, MY, IZ1 - 2.2, tx + 1.1, MY + .42, IZ1 - 1.5, '#1b1024', true);
      neon(tx - 1.1, MY + .42, IZ1 - 2.2, tx + 1.1, MY + .45, IZ1 - 1.5, '#ff4fa3', false);
      for (let k = 0; k < 4; k++) bNeon.box(tx - .8 + k * .5, MY + .45, IZ1 - 1.9, tx - .72 + k * .5, MY + .63, IZ1 - 1.82, C(BOTTLES[k % BOTTLES.length]).multiplyScalar(.8));
      bNeon.box(tx - .12, MY + .45, IZ1 - 1.95, tx + .12, MY + .5, IZ1 - 1.75, C('#ffd84f').multiplyScalar(.7));   // a candle
    }
    for (const x of [71.4, 76.2, 79.6, 85.6]) {
      const z = 33.3;
      box(bPlain, x - .06, MY, z - .06, x + .06, MY + .75, z + .06, '#c9c9d4');
      box(bPlain, x - .45, MY + .75, z - .45, x + .45, MY + .8, z + .45, '#d9cdea');
      col.add(x - .3, MY, z - .3, x + .3, MY + .8, z + .3);
      bNeon.box(x - .05, MY + .8, z - .05, x + .05, MY + .98, z + .05, C('#ff6b8a').multiplyScalar(.8));
      bNeon.box(x + .15, MY + .8, z + .1, x + .23, MY + .95, z + .18, C('#3fe6e0').multiplyScalar(.8));
      for (const s of [-1, 1]) {
        const cx = x + s * .85;
        box(bPlain, cx - .22, MY, z - .22, cx + .22, MY + .45, z + .22, '#a01d55', true);
        box(bPlain, cx + s * .18, MY + .45, z - .22, cx + s * .24, MY + 1, z + .22, '#861745');
        vip.push({ kind: 'sit', x: cx - s * .05, z, y: MY + .51, heading: -s * Math.PI / 2 });
      }
    }
    // a lamp over each sofa table so the balcony isn't dark
    for (const x of [67.9, 75.1, 82.5]) { box(bPlain, x - .02, MY + 2.3, IZ1 - 2, x + .02, H, IZ1 - 1.96, '#444450'); neon(x - .25, MY + 2.1, IZ1 - 2.23, x + .25, MY + 2.3, IZ1 - 1.73, '#ffd84f'); }

    // pillars wrapped in neon
    for (const [x, z] of [[68.6, 17.2], [68.6, 32.8], [82.4, 17.2], [82.4, 32.8]]) {
      box(bPlain, x - .35, .15, z - .35, x + .35, H, z + .35, '#2e1a3e', true);
      for (const [dx, dz] of [[-.36, -.36], [.36, -.36], [-.36, .36], [.36, .36]]) neon(x + dx - .03, .3, z + dz - .03, x + dx + .03, H - .3, z + dz + .03, (x < 75) ? '#ff4fa3' : '#3fe6e0', false);
    }
    // a rope line and a small booth for the bouncer outside
    for (const z of [DZ - 1.6, DZ + 1.6]) { box(bPlain, X1 + 2.2, .15, z - .07, X1 + 2.34, 1.05, z + .07, '#d9b44a', true); }

    /* ---------- animated parts ---------- */
    const anim = new THREE.Group(); scene.add(anim);
    const DF = { x0: 70.5, x1: 80.5, z0: 19.5, z1: 30.5 };
    const floorMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vU;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          vec2 g = vU * vec2(${(DF.x1 - DF.x0).toFixed(1)}, ${(DF.z1 - DF.z0).toFixed(1)}); vec2 id = floor(g), f = fract(g);
          float beat = floor(uTime * ${BPS.toFixed(4)}), pulse = 1.0 - fract(uTime * ${BPS.toFixed(4)});
          float r = h(id + beat * 0.37);
          vec3 c = r < .25 ? vec3(1.0,.3,.65) : r < .5 ? vec3(.25,.9,.95) : r < .75 ? vec3(1.0,.82,.3) : vec3(.62,.38,1.0);
          float on = step(.42, h(id * 1.7 + beat));
          float lvl = mix(.14, 1.0, on) * (.6 + .4 * pulse);
          float edge = step(.05, f.x) * step(.05, f.y) * step(f.x, .95) * step(f.y, .95);
          gl_FragColor = vec4(mix(vec3(.03,.02,.05), c * lvl, edge), 1.0);
        }`
    });
    const dfloor = new THREE.Mesh(new THREE.PlaneGeometry(DF.x1 - DF.x0, DF.z1 - DF.z0).rotateX(-Math.PI / 2), floorMat);
    dfloor.position.set((DF.x0 + DF.x1) / 2, .175, (DF.z0 + DF.z1) / 2); anim.add(dfloor);
    // LED wall behind the DJ: a bouncing equaliser
    const ledMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vU;
        void main(){
          float cols = 28.0, rows = 14.0; vec2 g = vec2(vU.x * cols, vU.y * rows); vec2 id = floor(g), f = fract(g);
          float kick = pow(1.0 - fract(uTime * ${BPS.toFixed(4)}), 2.0);
          float hgt = .15 + .55 * abs(sin(uTime * 2.3 + id.x * .7) * sin(uTime * 1.1 + id.x * .23)) + .3 * kick;
          float on = step(id.y / rows, hgt);
          vec3 c = mix(vec3(.25,.9,.95), vec3(1.0,.3,.65), id.y / rows);
          float cell = step(.12, f.x) * step(.12, f.y);
          gl_FragColor = vec4(mix(vec3(.05,.02,.08), c * (.35 + .65 * on), on * cell) + vec3(.08,.02,.1) * kick, 1.0);
        }`
    });
    const led = new THREE.Mesh(new THREE.PlaneGeometry(9, 4).rotateY(Math.PI / 2), ledMat);
    led.position.set(IX0 + .02, 2.75, DZ); anim.add(led);
    // mirror ball
    const BALL = new THREE.Vector3((DF.x0 + DF.x1) / 2, 6.3, DZ);
    const ballGeo = new THREE.IcosahedronGeometry(.55, 2), bc = [];
    for (let i = 0; i < ballGeo.attributes.position.count; i += 3) { const v = .45 + R() * .55; for (let k = 0; k < 3; k++) bc.push(v, v, v * 1.05); }
    ballGeo.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
    const ball = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    ball.position.copy(BALL); anim.add(ball);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(.03, H - BALL.y - .55, .03), new THREE.MeshBasicMaterial({ color: 0x444450 }));
    cable.position.set(BALL.x, (H + BALL.y + .55) / 2, BALL.z); anim.add(cable);
    // specks of light from the ball, landing on the walls, floor and ceiling and sweeping round
    const SN = 170, dirs = [], sp = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) { const y = rr(-.85, .6), a = rr(0, Math.PI * 2), r = Math.sqrt(1 - y * y); dirs.push([Math.cos(a) * r, y, Math.sin(a) * r]); }
    const specGeo = new THREE.BufferGeometry(); specGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const specks = new THREE.Points(specGeo, new THREE.PointsMaterial({ color: 0xfff4fb, size: .13, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
    specks.frustumCulled = false; anim.add(specks);
    const room = [[IX0 + .02, IX1 - .02], [.18, H - .03], [IZ0 + .02, IZ1 - .02]];
    // moving-head beams hanging from the ceiling
    const BEAM_COLS = [0xff4fa3, 0x3fe6e0, 0xffd84f, 0x9b6bff];
    const heads = [[72, 21], [79, 21], [72, 29], [79, 29]].map(([x, z], i) => {
      const g = new THREE.Group(); g.position.set(x, H - .35, z);
      const mat = new THREE.MeshBasicMaterial({ color: BEAM_COLS[i], transparent: true, opacity: .15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(.05, .95, 7.6, 14, 1, true).translate(0, -3.8, 0), mat));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(.3, .3, .3), new THREE.MeshBasicMaterial({ color: 0x222228 })));
      anim.add(g); return { g, mat, i };
    });
    // coloured room lights so the dancers are lit; always in the scene (intensity 0 when far) so shaders never recompile
    const roomLights = [[0xff4fa3, 73, 4.5, 22], [0x3fe6e0, 78, 4.5, 29]].map(([c, x, y, z]) => { const l = new THREE.PointLight(c, 0, 16, 1.2); l.position.set(x, y, z); scene.add(l); return l; });
    // searchlights on the roof, sweeping the night sky
    const lights = [[68, 15.5], [68, 34.5]].map(([x, z], i) => {
      const g = new THREE.Group(); g.position.set(x, H + .5, z);
      const mat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(.35, 3.4, 80, 16, 1, true).translate(0, 40, 0), mat));
      scene.add(g); return { g, mat, i };
    });

    /* ---------- people spots ---------- */
    const spots = [], dance = { club: true };
    for (let x = DF.x0 + 1.1; x < DF.x1 - .6; x += 2.1) for (let z = DF.z0 + 1.1; z < DF.z1 - .6; z += 2.2) {
      if (R() < .08) continue;
      const px = x + rr(-.35, .35), pz = z + rr(-.35, .35);
      spots.push({ kind: 'dance', x: px, z: pz, heading: -Math.PI / 2 + rr(-1.1, 1.1), mix: 'club', grp: dance });
    }
    spots.push({ kind: 'dj', x: 65.4, z: DZ, heading: Math.PI / 2, mix: 'club' });
    for (const x of [73.5, 80]) spots.push({ kind: 'guard', x, z: 36.2, heading: Math.PI, mix: 'club' });
    // two bouncers either side of the entrance, arms crossed, watching the street
    for (const s of [-1, 1]) spots.push({ kind: 'bouncer', x: X1 + 1.5, z: DZ + s * 1.35, heading: Math.PI / 2 - s * .25, mix: 'bouncer' });
    for (const x of seats) if (R() < .8) spots.push({ kind: 'sit', x, z: IZ0 + .62, y: .66, heading: 0, mix: 'club' });
    // groups chatting round the cocktail tables
    for (const [x, z] of cocktail) {
      const grp = {}, n = 3, seed = R() * 10, a0 = R() * 6;
      for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2; spots.push({ kind: 'talk', x: x + Math.sin(a) * .85, z: z + Math.cos(a) * .85, heading: Math.atan2(-Math.sin(a), -Math.cos(a)), mix: 'club', seed, idx: i, n, grp }); }
    }
    // up on the balcony: people on the sofas and at the tables, a few leaning on the rail watching the floor
    for (const s of vip) if (R() < .85) spots.push(Object.assign(s, { mix: 'club' }));
    for (const x of [67.2, 74, 81.4, 87.2]) spots.push({ kind: 'idle', x, z: MZ + .5, y: MY, fixedY: true, heading: Math.PI + rr(-.3, .3), mix: 'club' });
    { const grp = {}, seed = R() * 10; for (let i = 0; i < 2; i++) spots.push({ kind: 'talk', x: 69 + i * .9, z: 34.6, y: MY, fixedY: true, heading: i ? -Math.PI / 2 : Math.PI / 2, mix: 'club', seed, idx: i, n: 2, grp }); }

    /* ---------- getting in and out ---------- */
    const IN = [X1 - 1.6, DZ], OUT = [X1 + 1.2, DZ];
    const inside = (x, z) => x > IX0 && x < IX1 && z > IZ0 && z < IZ1;
    // next point towards the street for someone inside, avoiding the booth, the bar and the stage
    function exitStep(x, z, y) {
      if (y > 1) return x > SX && z < MZ + 1.6 ? [88.9, SZ0 - .7] : [88.9, MZ + 1.4];   // on the balcony or the stair: down to the floor first
      if (x > IN[0] - .9 && Math.abs(z - DZ) < .7) return OUT;
      if (x < 67.8 && z > 21.6 && z < 28.4) return [65.8, 20.6];
      if (z > 33.9 && x < 84.3) return [85.5, 36];
      if (z < 15.3) return [x, 16.4];
      return IN;
    }
    const entryStep = (x, z) => (x > IX1 - .3 && Math.abs(z - DZ) < .7 ? [IN[0] - 1.5, DZ] : OUT);

    let near = false;
    return {
      inside, exitStep, entryStep, door: { in: IN, out: OUT, z: DZ, x: X1 }, spots, name: 'NEPLOXO 21',
      center: { x: (X0 + X1) / 2, z: DZ }, bpm: BPS * 60,
      // lamps that would stand in front of the entrance
      blocksLamp: (x, z) => x > X1 && x < X1 + 5 && Math.abs(z - DZ) < 4,
      update(t, env, px, pz) {
        const d = Math.hypot(px - (X0 + X1) / 2, pz - DZ);
        near = d < 75; anim.visible = near;
        const night = env ? env.night : 0;
        for (const L of lights) {
          L.mat.opacity = night * .07; L.g.visible = night > .02;
          L.g.rotation.z = Math.sin(t * .35 + L.i * 2.1) * .45; L.g.rotation.x = Math.cos(t * .27 + L.i * 1.3) * .35;
        }
        const beat = Math.floor(t * BPS), kick = 1 - (t * BPS - beat);
        roomLights.forEach((l, i) => { l.intensity = near ? 1.1 + (i === beat % 2 ? kick * .9 : 0) : 0; });
        if (!near) return;
        floorMat.uniforms.uTime.value = t; ledMat.uniforms.uTime.value = t;
        ball.rotation.y = t * .6;
        for (const h of heads) {
          h.g.rotation.x = Math.sin(t * .8 + h.i * 1.7) * .55; h.g.rotation.z = Math.cos(t * .65 + h.i * 2.3) * .55;
          h.mat.color.setHex(BEAM_COLS[(beat + h.i) % 4]); h.mat.opacity = .08 + kick * .12;
        }
        if (d < 40) {
          const a = t * .6, ca = Math.cos(a), sa = Math.sin(a);
          for (let i = 0; i < SN; i++) {
            const [dx0, dy, dz0] = dirs[i], dx = dx0 * ca - dz0 * sa, dz = dx0 * sa + dz0 * ca;
            let tt = Infinity; const D = [dx, dy, dz], B = [BALL.x, BALL.y, BALL.z];
            for (let k = 0; k < 3; k++) if (Math.abs(D[k]) > 1e-4) { const lim = D[k] > 0 ? room[k][1] : room[k][0]; tt = Math.min(tt, (lim - B[k]) / D[k]); }
            sp[i * 3] = B[0] + dx * tt; sp[i * 3 + 1] = B[1] + dy * tt; sp[i * 3 + 2] = B[2] + dz * tt;
          }
          specGeo.attributes.position.needsUpdate = true;
        }
      }
    };
  };
})(window.NB);
