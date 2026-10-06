// Faces: one 512x512 atlas of 64 painted faces (8 x 8 tiles of 64 px), drawn once in code. Each face has
// eyes with whites and coloured irises, brows, a hint of a nose and a mouth; women have lashes, eye shadow
// and lipstick (some a blush), men are clean-shaven or have stubble, a moustache, a goatee or a full beard
// in dark, brown or fair; older people have wrinkles, grey brows and hair, some wear reading glasses;
// and some of everyone wear sunglasses. The background is transparent: the head's skin shows through.
(function (NB) {
  'use strict';
  const { U } = NB;
  const T = 64, GRID = 8;
  let atlas = null;

  function build() {
    const R = U.rng(2105), rr = (a, b) => a + R() * (b - a), pick = a => a[(R() * a.length) | 0], chance = p => R() < p;
    const tiles = [];
    // the list of faces to paint: gender / age, facial hair, its tone, sunglasses
    const plan = [];
    for (let k = 0; k < 16; k++) plan.push({ g: 'f' });
    for (let k = 0; k < 4; k++) plan.push({ g: 'f', shades: true });
    for (let k = 0; k < 5; k++) plan.push({ g: 'm', hair: 'none' });
    for (const tone of ['dark', 'brown', 'light']) {
      plan.push({ g: 'm', hair: 'stubble', tone }, { g: 'm', hair: 'stubble', tone });
      plan.push({ g: 'm', hair: 'mustache', tone }, { g: 'm', hair: 'mustache', tone });
      plan.push({ g: 'm', hair: 'beard', tone }, { g: 'm', hair: 'beard', tone });
      plan.push({ g: 'm', hair: 'goatee', tone });
    }
    for (const hair of ['none', 'none', 'stubble', 'mustache', 'stubble']) plan.push({ g: 'm', hair, tone: 'dark', shades: true });
    for (const hair of ['mustache', 'beard', 'none', 'stubble']) plan.push({ g: 'm', old: true, hair, tone: 'grey' });
    for (let k = 0; k < 4; k++) plan.push({ g: 'f', old: true });
    while (plan.length < GRID * GRID) plan.push({ g: 'm', hair: 'none' });

    const TONE = { dark: '#1e140e', brown: '#4a2e1a', light: '#a8743c', grey: '#b8b8b8' };
    const IRIS = ['#4a2e1a', '#2e1d12', '#3a6fb0', '#4f8a5a', '#6b4423', '#1a1a1a', '#5a8ab8'];
    const LIPS = ['#c8305a', '#e05a7a', '#b0203a', '#d4787a', '#9a3a5a', '#ff4fa3', '#c86a5a'];
    const SHADOW = ['rgba(150,90,200,.45)', 'rgba(60,160,210,.4)', 'rgba(220,120,160,.4)', 'rgba(120,90,70,.35)'];
    const tex = U.canvasTex(T * GRID, T * GRID, (g) => {
      g.clearRect(0, 0, T * GRID, T * GRID);
      plan.forEach((f, i) => {
        const ox = (i % GRID) * T, oy = ((i / GRID) | 0) * T, px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(ox + x, oy + y, w, h); };
        const fem = f.g === 'f', old = !!f.old;
        const iris = pick(IRIS), eyeY = 27 + (R() * 3 | 0), gap = 13 + (R() * 3 | 0), ew = fem ? 9 : 8, cx = 32;
        const browC = old ? '#9a9a9a' : f.tone && f.tone !== 'grey' ? TONE[f.tone] : pick(['#1e140e', '#2e1d12', '#4a2e1a', '#6b4423']);
        // brows: women thin and arched, men thicker and straighter, sometimes frowning
        for (const s of [-1, 1]) {
          const bx = s < 0 ? cx - gap - ew + 1 : cx + gap - 1, by = eyeY - (fem ? 7 : 6);
          if (fem) { px(bx, by + 1, ew, 2, browC); px(s < 0 ? bx + 2 : bx + ew - 5, by, 3, 1, browC); }
          else { const frown = chance(.25) ? 1 : 0; px(bx, by, ew + 1, 3, browC); if (frown) px(s < 0 ? bx + ew - 2 : bx, by + 2, 3, 1, browC); }
        }
        // eyes: shadow, white, iris with a pupil and a glint; women: lashes and a flick at the corner
        for (const s of [-1, 1]) {
          const ex = s < 0 ? cx - gap - ew + 2 : cx + gap - 2;
          if (fem && !old && chance(.7)) px(ex - 1, eyeY - 3, ew + 2, 3, pick(SHADOW));
          px(ex, eyeY, ew, 5, '#f4f0ec');
          const ix = ex + ((ew - 4) / 2 | 0) + (chance(.2) ? s : 0);
          px(ix, eyeY, 4, 5, iris); px(ix + 1, eyeY + 1, 2, 3, '#0c0a0a'); px(ix + 2, eyeY + 1, 1, 1, '#ffffff');
          if (fem) { px(ex - 1, eyeY - 1, ew + 2, 2, '#141018'); px(s < 0 ? ex - 2 : ex + ew, eyeY - 2, 2, 1, '#141018'); }
          else px(ex, eyeY - 1, ew, 1, 'rgba(40,20,10,.55)');
          px(ex, eyeY + 5, ew, 1, 'rgba(60,30,20,.25)');
        }
        // the nose: a shadow down one side and under the tip
        px(cx - 1, eyeY + 6, 2, 7, 'rgba(90,45,25,.18)'); px(cx - 3, eyeY + 13, 7, 2, 'rgba(90,45,25,.28)');
        // wrinkles for the older ones: forehead, crow's feet, lines by the mouth
        if (old) {
          for (const y of [8, 12]) px(cx - 12, y, 24, 1, 'rgba(90,50,30,.35)');
          for (const s of [-1, 1]) { const x = s < 0 ? cx - gap - ew - 2 : cx + gap + ew - 1; px(x, eyeY + 1, 3, 1, 'rgba(90,50,30,.4)'); px(x, eyeY + 4, 3, 1, 'rgba(90,50,30,.4)'); px(s < 0 ? cx - 11 : cx + 10, eyeY + 16, 1, 6, 'rgba(90,50,30,.35)'); }
        }
        // the mouth
        const my = eyeY + 20, mw = fem ? 12 : 11 + (R() * 3 | 0);
        if (fem) {
          const lip = old ? pick(['#b0506a', '#a04050', '#c86a7a']) : pick(LIPS);
          px(cx - mw / 2, my, mw, 2, lip); px(cx - mw / 2 + 2, my + 2, mw - 4, 2, lip); px(cx - mw / 2 + 1, my + 1, mw - 2, 1, 'rgba(60,10,20,.5)');
          px(cx - 2, my + 2, 3, 1, 'rgba(255,255,255,.35)');
          if (!old && chance(.45)) for (const s of [-1, 1]) px(s < 0 ? cx - gap - 9 : cx + gap + 3, eyeY + 9, 7, 4, 'rgba(255,110,130,.28)');
        } else {
          const smile = chance(.35);
          px(cx - mw / 2, my + 1, mw, 2, 'rgba(110,40,30,.75)');
          if (smile) { px(cx - mw / 2 - 1, my, 2, 2, 'rgba(110,40,30,.75)'); px(cx + mw / 2 - 1, my, 2, 2, 'rgba(110,40,30,.75)'); }
          px(cx - mw / 2 + 2, my + 3, mw - 4, 1, 'rgba(110,40,30,.25)');
        }
        // facial hair
        const hc = TONE[f.tone || 'dark'];
        // the jaw line: from the cheekbones down to a rounded chin (stubble and beards follow it)
        const jaw = (inset) => { g.beginPath(); g.moveTo(ox + 8 + inset, oy + eyeY + 9); g.lineTo(ox + 8 + inset, oy + 48); g.quadraticCurveTo(ox + 10 + inset, oy + 61 - inset, ox + cx, oy + 61 - inset); g.quadraticCurveTo(ox + 54 - inset, oy + 61 - inset, ox + 56 - inset, oy + 48); g.lineTo(ox + 56 - inset, oy + eyeY + 9); g.lineTo(ox + 51, oy + eyeY + 9); g.quadraticCurveTo(ox + 50, oy + my - 5, ox + cx, oy + my - 6); g.quadraticCurveTo(ox + 14, oy + my - 5, ox + 13, oy + eyeY + 9); g.closePath(); };
        if (f.hair === 'stubble') {
          g.save(); jaw(1); g.clip();
          g.globalAlpha = .22; g.fillStyle = hc; g.fillRect(ox, oy, T, T); g.globalAlpha = .5;
          for (let k = 0; k < 70; k++) px(rr(8, 56) | 0, rr(eyeY + 10, 62) | 0, 1, 1, hc);
          g.restore(); g.globalAlpha = 1;
          px(cx - mw / 2, my + 1, mw, 2, 'rgba(110,40,30,.75)');
        }
        if (f.hair === 'mustache' || f.hair === 'goatee' || f.hair === 'beard') { const w = f.hair === 'mustache' ? 18 : 16; px(cx - w / 2, my - 4, w, 4, hc); if (f.hair === 'mustache' && chance(.5)) { px(cx - w / 2 - 1, my - 1, 3, 4, hc); px(cx + w / 2 - 2, my - 1, 3, 4, hc); } }
        if (f.hair === 'goatee') { px(cx - 6, my + 4, 12, 7, hc); px(cx - 4, my + 11, 8, 3, hc); }
        if (f.hair === 'beard') {
          g.fillStyle = hc; jaw(0); g.fill();
          g.globalAlpha = .35; g.fillStyle = '#000'; for (let k = 0; k < 40; k++) g.fillRect(ox + (rr(9, 55) | 0), oy + (rr(my + 4, 60) | 0), 1, 2); g.globalAlpha = 1;
          px(cx - mw / 2, my, mw, 3, 'rgba(110,40,30,.95)');
        }
        // glasses: sunglasses (two dark lenses, a bridge, a shine) or thin reading glasses for the old
        if (f.shades) {
          const lw = fem ? 14 : 13, fc = fem ? pick(['#ff4fa3', '#f4f0ec', '#141018', '#3fe6e0']) : '#141018';
          for (const s of [-1, 1]) {
            const lx = s < 0 ? cx - gap - lw + 3 : cx + gap - 3;
            px(lx - 1, eyeY - 3, lw + 2, 10, fc); px(lx, eyeY - 2, lw, 8, pick(['#141018', '#1c1430', '#20142a']));
            px(lx + 2, eyeY - 1, 3, 1, 'rgba(255,255,255,.55)'); px(lx + 3, eyeY, 2, 1, 'rgba(255,255,255,.35)');
          }
          px(cx - gap + 3, eyeY - 1, (gap - 3) * 2, 2, fc);
        } else if (old && chance(.6)) {
          for (const s of [-1, 1]) { const lx = s < 0 ? cx - gap - ew : cx + gap - 3; g.strokeStyle = '#6a5a4a'; g.lineWidth = 1; g.strokeRect(ox + lx + .5, oy + eyeY - 2.5, ew + 4, 9); }
          px(cx - gap + 4, eyeY + 1, (gap - 4) * 2, 1, '#6a5a4a');
        }
        tiles.push(f);
      });
    }, false);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;   // no bleeding between tiles
    return { tex, tiles };
  }

  NB.faces = {
    GRID,
    get atlas() { if (!atlas) atlas = build(); return atlas; },
    // a face for someone: gender, age, the colour of their hair (for the beard), whether they wear sunglasses
    pick({ female, old, hairHex, shades, type }) {
      const tiles = NB.faces.atlas.tiles, c = new THREE.Color(hairHex || '#2e1d12'), l = (c.r + c.g + c.b) / 3;
      const tone = old ? 'grey' : l < .12 ? 'dark' : l < .3 ? 'brown' : 'light';
      let ok = tiles.map((t, i) => i).filter(i => {
        const t = tiles[i];
        if (female) return t.g === 'f' && !!t.old === !!old && !!t.shades === !!shades;
        if (t.g !== 'm' || !!t.old !== !!old || !!t.shades !== !!shades) return false;
        if (shades || old) return true;
        if (type === 'business_m' && (t.hair === 'beard' || t.hair === 'goatee')) return false;   // office men keep it neat
        return t.hair === 'none' || t.tone === tone;
      });
      if (!ok.length) ok = tiles.map((t, i) => i).filter(i => tiles[i].g === (female ? 'f' : 'm'));
      return ok[(Math.random() * ok.length) | 0];
    },
    // the texture coordinates of a tile: [u0, v0, u1, v1]
    uv(i) { const c = i % GRID, r = (i / GRID) | 0; return [c / GRID, 1 - (r + 1) / GRID, (c + 1) / GRID, 1 - r / GRID]; }
  };
})(window.NB);
