// The hero: a jointed low-poly model, walk/run/jump animation, physics against the city, and the follow camera.
(function (NB) {
  'use strict';
  const { U } = NB;
  const STEP = .42, RADIUS = .34, HEIGHT = 1.8;
  // falls: a drop of up to about two storeys is walked away from; higher, it hurts, ~17 m kills
  const SAFE_DROP = 7, DROP_HURT = 10;
  const JOG = 4.6, SPRINT = 7.6, GRAVITY = 20, JUMP = 7.2;

  function flowerShirt(base, leaf, petals) {
    return U.canvasTex(128, 128, (g, s) => {
      g.fillStyle = base; g.fillRect(0, 0, s, s);
      const flower = (x, y, r, c) => {
        g.fillStyle = c;
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .55, r * .5, 0, 7); g.fill(); }
        g.fillStyle = '#ffe36e'; g.beginPath(); g.arc(x, y, r * .25, 0, 7); g.fill();
      };
      g.fillStyle = leaf;
      for (let k = 0; k < 14; k++) { g.save(); g.translate(Math.random() * s, Math.random() * s); g.rotate(Math.random() * 6); g.fillRect(-10, -3, 20, 6); g.restore(); }
      for (let k = 0; k < 9; k++) flower(Math.random() * s, Math.random() * s, U.rand(9, 15), petals[k % petals.length]);
    }, true, 4);
  }
  const shirtTexture = () => flowerShirt('#17b3a6', '#0d7f6f', ['#ffffff', '#ff5fa2']);
  // outfits from the wardrobe (and the police uniform from the station lockers): shirt texture, trousers, cap
  const OUTFITS = {
    hawaii: { name: 'Гавайская рубашка', tex: shirtTexture, pants: 0x3b5a8a },
    vice: { name: 'Белый костюм', tex: () => U.canvasTex(128, 128, (g, s) => { g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, s, s); g.fillStyle = '#ff9fc3'; g.fillRect(s * .36, 0, s * .28, s); g.fillStyle = '#d8d2c6'; g.fillRect(s * .33, 0, 3, s); g.fillRect(s * .66, 0, 3, s); }, true, 4), pants: 0xf2efe6 },
    pink: { name: 'Розовая рубашка', tex: () => flowerShirt('#ff7eb6', '#2f8a44', ['#ffffff', '#ffe36e']), pants: 0xe8dcc0 },
    sport: { name: 'Спортивный костюм', tex: () => U.canvasTex(128, 128, (g, s) => { g.fillStyle = '#1a1a22'; g.fillRect(0, 0, s, s); g.fillStyle = '#3fe6e0'; g.fillRect(0, s * .3, s, 10); g.fillStyle = '#ff4fa3'; g.fillRect(0, s * .3 + 12, s, 6); g.fillStyle = '#ffffff'; g.fillRect(s * .48, 0, 4, s); }, true, 4), pants: 0x1a1a22 },
    cop: { name: 'Полицейская форма', tex: () => U.canvasTex(128, 128, (g, s) => { g.fillStyle = '#23407a'; g.fillRect(0, 0, s, s); g.fillStyle = '#e8c547'; g.beginPath(); g.moveTo(34, 30); g.lineTo(44, 36); g.lineTo(40, 48); g.lineTo(28, 48); g.lineTo(24, 36); g.closePath(); g.fill(); g.fillStyle = '#1a2f5a'; g.fillRect(s * .49, 0, 3, s); for (let y = 12; y < s; y += 22) { g.fillStyle = '#d9d9e2'; g.beginPath(); g.arc(s * .5 + 7, y, 3, 0, 7); g.fill(); } }, true, 4), pants: 0x18223c, cap: true }
  };
  // the rest are sold at Neon Fashion in the city (price in dollars); a jacket over a shirt is a band down the middle
  const T = draw => () => U.canvasTex(128, 128, draw, true, 4);
  const jacket = (coat, shirt, extra) => T((g, s) => { g.fillStyle = coat; g.fillRect(0, 0, s, s); g.fillStyle = shirt; g.fillRect(s * .38, 0, s * .24, s); if (extra) extra(g, s); });
  Object.assign(OUTFITS, {
    tank: { name: 'Белая майка', price: 60, tex: T((g, s) => { g.fillStyle = '#f5f5f0'; g.fillRect(0, 0, s, s); }), pants: 0x2b3d6b },
    mechanic: { name: 'Комбинезон механика', price: 120, tex: T((g, s) => { g.fillStyle = '#c86a1e'; g.fillRect(0, 0, s, s); g.fillStyle = '#9a4f14'; g.fillRect(s * .47, 0, 4, s); g.fillStyle = '#f5f5f0'; g.fillRect(s * .2, s * .25, 16, 8); }), pants: 0xc86a1e },
    tommy: { name: 'Синяя гавайка, как у Томми', price: 150, tex: () => flowerShirt('#2a6fe8', '#1a4fb0', ['#ffffff', '#ffd23d']), pants: 0x3b5a8a },
    denim: { name: 'Джинсовая рубашка', price: 180, tex: T((g, s) => { g.fillStyle = '#4a6fa0'; g.fillRect(0, 0, s, s); for (let y = 8; y < s; y += 18) { g.fillStyle = '#e8e2d4'; g.fillRect(s * .5 - 2, y, 4, 4); } g.fillStyle = '#3a5a88'; g.fillRect(s * .25, s * .2, 20, 14); g.fillRect(s * .6, s * .2, 20, 14); }), pants: 0x2a2a30 },
    golf: { name: 'Поло для гольфа', price: 300, tex: T((g, s) => { g.fillStyle = '#ffd6e4'; g.fillRect(0, 0, s, s); g.fillStyle = '#f5f5f0'; g.fillRect(0, 0, s, 10); g.fillStyle = '#3fb3c7'; g.fillRect(s * .2, s * .3, 10, 10); }), pants: 0xf5f0e6 },
    camo: { name: 'Камуфляж', price: 350, tex: T((g, s) => { g.fillStyle = '#5a6a3a'; g.fillRect(0, 0, s, s); for (let k = 0; k < 40; k++) { g.fillStyle = ['#3a4a2a', '#7a7a4a', '#2a2a1e'][k % 3]; g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, U.rand(6, 14), U.rand(4, 9), Math.random() * 3, 0, 7); g.fill(); } }), pants: 0x4a5a3a },
    leather: { name: 'Кожаная куртка', price: 400, tex: jacket('#1a1a1e', '#f5f5f0', (g, s) => { g.fillStyle = '#3a3a40'; g.fillRect(s * .36, 0, 3, s); g.fillRect(s * .62, 0, 3, s); }), pants: 0x2b3d6b },
    tiger: { name: 'Тигровая рубашка', price: 500, tex: T((g, s) => { g.fillStyle = '#ff8a1e'; g.fillRect(0, 0, s, s); g.strokeStyle = '#141418'; g.lineWidth = 5; for (let k = 0; k < 14; k++) { const x = Math.random() * s; g.beginPath(); g.moveTo(x, Math.random() * s); g.quadraticCurveTo(x + 10, Math.random() * s, x + U.rand(-8, 8), Math.random() * s); g.stroke(); } }), pants: 0x141418 },
    neon: { name: 'Неоновая ветровка', price: 600, tex: T((g, s) => { g.fillStyle = '#9b5cff'; g.fillRect(0, 0, s, s * .4); g.fillStyle = '#ff4fa3'; g.fillRect(0, s * .4, s, s * .3); g.fillStyle = '#3fe6e0'; g.fillRect(0, s * .7, s, s * .3); g.fillStyle = '#f5f5f0'; g.fillRect(s * .49, 0, 3, s); }), pants: 0x141418 },
    miami: { name: 'Пастельный пиджак, как в «Полиции Майами»', price: 900, tex: jacket('#a9d8f5', '#ff9fc3'), pants: 0xf5f0e6 },
    tuxedo: { name: 'Смокинг', price: 1200, tex: jacket('#141418', '#f5f5f0', (g, s) => { g.fillStyle = '#141418'; g.fillRect(s * .42, 6, s * .16, 7); for (let y = 24; y < s; y += 16) g.fillRect(s * .5 - 2, y, 4, 4); }), pants: 0x141418 },
    redsuit: { name: 'Красный костюм', price: 1500, tex: jacket('#b0203a', '#141418', (g, s) => { g.fillStyle = '#8a1f2a'; g.fillRect(s * .33, 0, 3, s); g.fillRect(s * .64, 0, 3, s); }), pants: 0x8a1f2a },
    gold: { name: 'Золотой пиджак', price: 2500, tex: jacket('#c9a227', '#141418', (g, s) => { for (let k = 0; k < 160; k++) { g.fillStyle = Math.random() < .5 ? '#fff3b0' : '#8a6a14'; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); } }), pants: 0x141418 }
  });
  NB.OUTFITS = OUTFITS;
  NB.STARTER_OUTFITS = ['hawaii', 'vice', 'pink', 'sport'];

  function makeHero() {
    const L = c => new THREE.MeshLambertMaterial(c);
    const shirt = L({ map: shirtTexture() }), skin = L({ color: 0xc98f65 }), jeans = L({ color: 0x3b5a8a }),
      shoe = L({ color: 0xf2f2f2 }), hair = L({ color: 0x2a1c14 }), shades = L({ color: 0x141018 }), belt = L({ color: 0x3a2a1c });
    const root = new THREE.Group();
    const B = (w, h, d, mat, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const G = (x, y, z, parent) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    const hips = G(0, .95, 0, root);
    B(.34, .14, .21, jeans, 0, .01, 0, hips);
    B(.35, .04, .22, belt, 0, .08, 0, hips);
    const torso = G(0, .08, 0, hips);
    B(.4, .5, .23, shirt, 0, .27, 0, torso);
    B(.12, .1, .02, skin, 0, .46, .112, torso);
    const head = G(0, .52, 0, torso);
    B(.1, .08, .1, skin, 0, .04, 0, head);
    B(.22, .25, .23, skin, 0, .2, .005, head);
    const hairTop = B(.235, .07, .245, hair, 0, .33, -.005, head);
    B(.235, .17, .07, hair, 0, .24, -.095, head);
    B(.045, .055, .035, skin, 0, .17, .128, head); B(.03, .065, .055, skin, -.118, .2, 0, head); B(.03, .065, .055, skin, .118, .2, 0, head);
    {
      const A = NB.faces.atlas, i = A.tiles.findIndex(t => t.g === 'm' && t.hair === 'stubble' && t.tone === 'dark' && !t.shades), [u0, v0, u1, v1] = NB.faces.uv(Math.max(0, i));
      const fg = new THREE.PlaneGeometry(.205, .215), uv = fg.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
      const face = new THREE.Mesh(fg, L({ map: A.tex, alphaTest: .5 })); face.position.set(0, .19, .1235); head.add(face);
    }
    // police cap, only with the uniform
    const cap = G(0, 0, 0, head); cap.visible = false;
    B(.25, .09, .26, L({ color: 0x18223c }), 0, .38, -.005, cap); B(.25, .03, .16, L({ color: 0x111111 }), 0, .34, .1, cap); B(.06, .05, .02, L({ color: 0xe8c547 }), 0, .39, .13, cap);
    const arm = side => {
      const sh = G(side * .255, .46, 0, torso);
      const up = B(.13, .2, .14, shirt, 0, -.08, 0, sh);
      const elb = B(.09, .1, .09, skin, 0, -.22, 0, sh);
      const el = G(0, -.27, 0, sh);
      const fore = B(.085, .24, .085, skin, 0, -.12, 0, el);
      B(.09, .09, .065, skin, 0, -.28, 0, el);
      const hand = G(0, -.3, 0, el);
      return { sh, el, hand, up, elb, fore };
    };
    const leg = side => {
      const hip = G(side * .1, 0, 0, hips);
      B(.15, .46, .17, jeans, 0, -.23, 0, hip);
      const kn = G(0, -.46, 0, hip);
      const shin = B(.13, .42, .15, jeans, 0, -.21, 0, kn);
      B(.14, .08, .27, shoe, 0, -.45, .05, kn);
      return { hip, kn, shin };
    };
    const aL = arm(-1), aR = arm(1), lL = leg(-1), lR = leg(1);
    root.rotation.order = 'YXZ';
    // guns held in the right hand, pointing forward when the arm is raised
    const metal = L({ color: 0x1e1e22 }), wood = L({ color: 0x6b4226 });
    const guns = {};
    const gun = (id, parts, tip) => { const g = G(0, 0, 0, aR.hand); for (const [w, h, d, mat, x, y, z] of parts) B(w, h, d, mat, x, y, z, g); g.visible = false; g.tip = tip; guns[id] = g; };
    gun('pistol', [[.05, .07, .2, metal, 0, -.02, .08], [.045, .1, .05, metal, 0, -.07, 0]], [0, -.02, .19]);
    gun('smg', [[.06, .08, .3, metal, 0, -.02, .1], [.04, .16, .05, metal, 0, -.1, .08], [.04, .08, .05, metal, 0, -.06, -.02]], [0, -.02, .26]);
    gun('shotgun', [[.05, .06, .7, metal, 0, -.01, .2], [.06, .08, .28, wood, 0, -.04, -.18], [.06, .05, .25, wood, 0, -.06, .3]], [0, -.01, .56]);
    gun('rifle', [[.05, .07, .62, metal, 0, -.01, .2], [.045, .14, .05, metal, 0, -.1, .12], [.05, .09, .26, metal, 0, -.03, -.2], [.035, .05, .16, metal, 0, .05, .08]], [0, -.01, .52]);
    const batWood = L({ color: 0xc9a06a }), grip = L({ color: 0x1e1e22 });
    // the bat hangs down from the fist and swings forward with the punch animation
    gun('bat', [[.045, .2, .045, grip, 0, -.04, .01], [.06, .38, .06, batWood, 0, -.32, .03], [.08, .3, .08, batWood, 0, -.64, .05]], [0, -.78, .05]);
    // the parachute: a curved canopy of coloured panels high over the head, lines down to the shoulders
    const canopy = G(0, 0, 0, root); canopy.visible = false;
    { const cols = [0xff4fa3, 0xf5f5f0, 0x3fe6e0, 0xf5f5f0, 0xff4fa3, 0xf5f5f0, 0x3fe6e0];
      cols.forEach((c, i) => { const a = (i - 3) * .3, p = B(.95, .08, 2.4, L({ color: c, side: THREE.DoubleSide }), Math.sin(a) * 3.2, 1.3 + Math.cos(a) * 3.2, 0, canopy); p.rotation.z = -a; p.castShadow = true; });
      const line = L({ color: 0xdddddd });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const ln = B(.02, 3.4, .02, line, sx * 1.3, 2.85, sz * .9, canopy); ln.rotation.z = sx * .33; ln.rotation.x = -sz * .2; } }
    return { root, hips, torso, head, aL, aR, lL, lR, guns, shirt, jeans, cap, skin, shoe, hairTop, canopy };
  }

  const MELEE = { fists: true, bat: true };

  // Rings spreading on the water surface, and a spray of droplets for splashes and strokes.
  function makeWaterFx(scene) {
    const rings = [], ringGeo = new THREE.RingGeometry(.42, .52, 28).rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; m.life = 0; m.max = 1; scene.add(m); rings.push(m);
    }
    const N = 160, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), floorY = new Float32Array(N);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xeafcff, size: .11, transparent: true, opacity: .9, depthWrite: false }));
    pts.frustumCulled = false; scene.add(pts);
    let rh = 0, ph = 0, alive = 0;
    const fx = {
      ripple(x, y, z, size) {
        const m = rings[rh]; rh = (rh + 1) % rings.length;
        m.position.set(x, y + .02, z); m.life = 1.5; m.max = 1.5; m.size = size; m.scale.setScalar(.6); m.visible = true;
      },
      drops(x, y, z, n, power = 1) {
        for (let k = 0; k < n; k++) {
          const i = ph; ph = (ph + 1) % N;
          pos[i * 3] = x + U.rand(-.25, .25); pos[i * 3 + 1] = y + .05; pos[i * 3 + 2] = z + U.rand(-.25, .25);
          const a = Math.random() * Math.PI * 2, s = U.rand(.4, 1.6) * power;
          vel[i * 3] = Math.cos(a) * s; vel[i * 3 + 1] = U.rand(1.5, 3.6) * power; vel[i * 3 + 2] = Math.sin(a) * s;
          life[i] = 1.4; floorY[i] = y;
        }
        alive = 1.6;
      },
      // a jump into the water: a crown of spray and two rings
      splash(x, y, z, k) {
        fx.drops(x, y, z, Math.round(18 + k * 50), .8 + k * .8);
        fx.ripple(x, y, z, 1.4 + k); setTimeout(() => fx.ripple(x, y, z, 1 + k), 180);
      },
      update(dt) {
        for (const m of rings) if (m.visible) {
          m.life -= dt; const f = 1 - m.life / m.max;
          m.scale.setScalar(.6 + f * 2.4 * m.size); m.material.opacity = Math.max(0, (1 - f) * (1 - f) * .42);
          if (m.life <= 0) m.visible = false;
        }
        if (alive <= 0) return;
        alive -= dt;
        for (let i = 0; i < N; i++) {
          if (life[i] <= 0) continue;
          life[i] -= dt; vel[i * 3 + 1] -= 9.8 * dt;
          pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          if (life[i] <= 0 || pos[i * 3 + 1] < floorY[i]) { life[i] = 0; pos[i * 3 + 1] = -999; }
        }
        geo.attributes.position.needsUpdate = true;
      }
    };
    return fx;
  }

  class Player {
    constructor(scene, col, opt) {
      this.col = col;
      this.m = makeHero(); scene.add(this.m.root);
      this.blob = new THREE.Mesh(new THREE.CircleGeometry(.45, 16).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false }));
      scene.add(this.blob);
      this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vz = 0; this.vy = 0;
      this.heading = 0; this.onGround = true; this.phase = 0; this.run = 0; this.air = 0; this.tmp = [];
      this.hp = 100; this.dead = false; this.deadT = 0; this.punchT = 0; this.aimT = 0; this.aimYaw = 0; this.aimPitch = 0; this.recoil = 0; this.weapon = 'fists';
      // in the water: swim (deep), wade (waist-deep, slower); tilt 0.25 treading water .. 1 front crawl
      this.swim = false; this.wade = 0; this.tilt = .25; this.rippleT = 0; this.strokeT = 0;
      this.onSplash = null; this.onStroke = null; this.onStep = null;
      // another player (net.js) is only drawn: no splashes of their own
      this.fx = opt && opt.remote ? { ripple() {}, drops() {}, splash() {}, update() {} } : makeWaterFx(scene);
    }
    place(x, z, heading) { this.x = x; this.z = z; this.y = this.floorAt(x, z, 10); this.vx = this.vz = this.vy = 0; this.heading = heading; this.swim = false; this.fallTop = this.y; this.standCar = null; }
    get speed() { return Math.hypot(this.vx, this.vz); }
    // the police uniform from the station lockers; everything else is worn piece by piece (setLook)
    setOutfit(id) {
      if (id === 'cop') { NB.dressHero(this.m, { top: 'cop', pants: 'navy', shoes: 'black', hat: 'police' }); this.outfit = 'cop'; }
      else if (id === 'medic') { NB.dressHero(this.m, { top: 'medic', pants: 'white', shoes: 'white', hat: 'medcap' }); this.outfit = 'medic'; }
      else if (id === 'fire') { NB.dressHero(this.m, { top: 'fire', pants: 'olive', shoes: 'black', hat: 'helmet' }); this.outfit = 'fire'; }
      else this.setLook(this.look);
    }
    setLook(look) { this.look = NB.dressHero(this.m, look || {}); this.outfit = 'own'; }
    // sitting on a chair or a sofa ('sit', y: where the feet are so the hips land on the seat), lying on a lounger,
    // a bed or a gym bench on your back ('lie' / 'bench', y: the top of what you lie on). locked: a scene holds you
    // there (a private dance, a training set) and lets you up itself; otherwise moving or jumping gets you up
    sitAt(x, z, heading, y, pose, locked) {
      this.seat = { x, z, heading, y, pose: pose || 'sit', locked: !!locked };
      this.x = x; this.z = z; this.y = y; this.vx = this.vz = this.vy = 0; this.heading = heading;
      this.onGround = true; this.air = 0; this.fallTop = y; this.swim = false; this.aimT = 0;
      for (const k in this.m.guns) this.m.guns[k].visible = false;
    }
    standUp(x, z, heading) {
      const s = this.seat; if (!s) return;
      this.seat = null; this.m.root.rotation.x = 0; this.m.hips.rotation.x = 0;
      if (x == null) {
        // a step off the seat: forward from a chair, to the side from a bed or a bench
        const h = s.heading, d = s.pose === 'sit' ? .8 : 1.0;
        x = s.pose === 'sit' ? s.x + Math.sin(h) * d : s.x + Math.cos(h) * d; z = s.pose === 'sit' ? s.z + Math.cos(h) * d : s.z - Math.sin(h) * d; heading = h;
      }
      this.place(x, z, heading == null ? s.heading : heading);
      this.setWeapon(this.weapon);
    }
    // the seated / lying pose, every frame while seated
    animateSeat(dt) {
      const m = this.m, s = this.seat, L = (a, b) => a + (b - a) * Math.min(1, dt * 10);
      m.root.position.set(s.x, s.pose === 'sit' ? s.y : s.y + .13, s.z);
      if (s.pose === 'sit') {
        m.root.rotation.y = s.heading; m.root.rotation.x = 0;
        for (const l of [m.lL, m.lR]) { l.hip.rotation.x = L(l.hip.rotation.x, -1.5); l.kn.rotation.x = L(l.kn.rotation.x, 1.5); }
        for (const a of [m.aL, m.aR]) { a.sh.rotation.x = L(a.sh.rotation.x, -.55); a.el.rotation.x = L(a.el.rotation.x, -.7); }
        m.aL.sh.rotation.z = -.15; m.aR.sh.rotation.z = .15;
      } else {
        // on the back, head along the heading: turned round and tipped over backwards
        m.root.rotation.y = s.heading + Math.PI; m.root.rotation.x = -Math.PI / 2;
        for (const l of [m.lL, m.lR]) { l.hip.rotation.x = L(l.hip.rotation.x, -.05); l.kn.rotation.x = L(l.kn.rotation.x, .08); }
        if (s.pose === 'bench') {
          // pressing the bar: arms straight up, bending down between pushes
          const k = this.punchT > 0 ? Math.sin((1 - this.punchT / .3) * Math.PI) : 0;
          for (const a of [m.aL, m.aR]) { a.sh.rotation.x = -Math.PI / 2 + .1; a.el.rotation.x = -1.2 + k * 1.15; }
        } else {
          for (const a of [m.aL, m.aR]) { a.sh.rotation.x = L(a.sh.rotation.x, -.15); a.el.rotation.x = L(a.el.rotation.x, -.3); }
          m.aL.sh.rotation.z = -.25; m.aR.sh.rotation.z = .25;
        }
      }
      m.torso.rotation.x = 0; m.torso.rotation.y = 0; m.hips.position.y = .95; m.head.rotation.x = 0;
      this.blob.visible = false;
    }
    setWeapon(id) { this.weapon = id; for (const k in this.m.guns) this.m.guns[k].visible = k === id && !this.swim; }   // no gun in hand while swimming
    punch() { this.punchT = .3; }
    fired() { this.recoil = 1; this.aimT = Math.max(this.aimT, .8); }
    // world position of the gun barrel (or the fist)
    muzzle(out) {
      this.m.root.updateMatrixWorld(true);
      const g = this.m.guns[this.weapon];
      if (g) { out.set(g.tip[0], g.tip[1], g.tip[2]); return g.localToWorld(out); }
      out.set(0, 0, 0); return this.m.aR.hand.localToWorld(out);
    }

    floorAt(x, z, fromY) {
      let f = NB.water.floorAt(x, z); const r = RADIUS * .6;   // the sea bed slopes below 0
      this.lastCar = null;
      for (const b of this.col.query(x - 1, z - 1, x + 1, z + 1, this.tmp)) {
        if (b.terrain) {   // island ground: follow the smooth slope, not the 2.5 m steps of its colliders
          if (x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ) { const h = b.terrain(x, z); if (h <= fromY + STEP && h > f) f = h; }
          continue;
        }
        if (b.maxY > fromY + STEP) continue;
        if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ && b.maxY > f) f = b.maxY;
      }
      // the top of a car (bonnet, roof, boot) is a floor too
      if (this.carFloor) { const c = this.carFloor(x, z, fromY + STEP); if (c && c.y > f) { f = c.y; this.lastCar = c.car; } }
      return f;
    }
    // Push the body circle out of any box that is too tall to step onto.
    collide() {
      for (let it = 0; it < 2; it++) {
        for (const b of this.col.query(this.x - 1.5, this.z - 1.5, this.x + 1.5, this.z + 1.5, this.tmp)) {
          if (b.terrain || b.npcOnly || b.maxY <= this.y + STEP || b.minY >= this.y + HEIGHT) continue;   // hills are walked up, never walls
          const cx = U.clamp(this.x, b.minX, b.maxX), cz = U.clamp(this.z, b.minZ, b.maxZ);
          let dx = this.x - cx, dz = this.z - cz; const d = Math.hypot(dx, dz);
          if (d >= RADIUS) continue;
          if (d > 1e-6) { this.x += dx / d * (RADIUS - d); this.z += dz / d * (RADIUS - d); }
          else { // centre inside the box: leave by the nearest side
            const pen = [this.x - b.minX, b.maxX - this.x, this.z - b.minZ, b.maxZ - this.z], k = pen.indexOf(Math.min(...pen));
            if (k === 0) this.x = b.minX - RADIUS; else if (k === 1) this.x = b.maxX + RADIUS; else if (k === 2) this.z = b.minZ - RADIUS; else this.z = b.maxZ + RADIUS;
          }
        }
      }
    }

    update(dt, input, camYaw) {
      if (this.dead) {
        this.deadT += dt; this.vx = this.vz = 0;
        const f = Math.min(1, this.deadT / .6);
        this.m.root.rotation.x = -Math.PI / 2 * f * f;
        this.m.root.position.set(this.x, this.y + .12 * f, this.z);
        this.blob.visible = false;
        return;
      }
      if (this.seat) {
        const wants = Math.hypot(input.move.x, input.move.y) > .35 || input.jump;
        if (this.punchT > 0) this.punchT -= dt;
        if (wants && !this.seat.locked) { input.jump = false; this.standUp(); }
        else { input.jump = false; this.animateSeat(dt); return; }
      }
      this.m.root.rotation.x = 0;
      if (this.aimT > 0) this.aimT -= dt;
      if (this.punchT > 0) this.punchT -= dt;
      this.recoil = Math.max(0, this.recoil - dt * 8);
      // desired velocity relative to the camera
      const mx = input.move.x, my = input.move.y, mag = Math.min(1, Math.hypot(mx, my));
      const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
      let wx = mx * cy - my * sy, wz = -mx * sy - my * cy;
      const wl = Math.hypot(wx, wz);
      // swimming is slow, wading slows you down the deeper it gets
      let top = (input.sprint ? SPRINT : JOG) * (this.speedMul || 1);
      if (this.swim) top = input.sprint ? 3.3 : 2.2;
      else if (this.wade > 0) top *= 1 - Math.min(.55, this.wade * .6);
      if (wl > 1e-4) { wx = wx / wl * top * mag; wz = wz / wl * top * mag; }
      const k = this.swim ? 2.2 : this.onGround ? 10 : 2.5;
      this.vx = U.damp(this.vx, wx, k, dt); this.vz = U.damp(this.vz, wz, k, dt);
      const jumpPressed = input.jump;
      if (input.jump && this.onGround && !this.swim && this.wade < .9) { this.vy = JUMP; this.onGround = false; }
      input.jump = false;
      // the parachute (you get one in every helicopter and plane): JUMP in a long fall opens it
      if (this.chute && wl > 1e-4) { const L2 = Math.hypot(wx, wz) || 1; wx = wx / L2 * 7 * mag; wz = wz / L2 * 7 * mag; }   // gliding under the canopy
      if (jumpPressed && !this.chute && this.hasChute && !this.onGround && !this.swim && this.vy < 1 && this.y - this.floorAt(this.x, this.z, this.y) > 6) {   // high enough above the ground
        this.chute = 1; this.hasChute = false; this.vy = Math.max(this.vy, -9); if (this.onChute) this.onChute(true);
      }

      // horizontal move, then walls
      const px = this.x, pz = this.z;
      this.x += this.vx * dt; this.z += this.vz * dt;
      this.collide();
      const floor = this.floorAt(this.x, this.z, this.y), floorCar = this.lastCar;
      const W = NB.water.at(this.x, this.z), surf = W ? W.surface() : 0, t = performance.now() / 1000;
      if (W && surf - floor > 1.3 && (this.swim || this.y <= surf - 1.0)) {
        // afloat: shoulders at the surface, bobbing on the swell
        if (this.chute) { this.chute = 0; if (this.onChute) this.onChute(false); }
        if (!this.swim) { this.swim = true; this.fx.splash(this.x, surf, this.z, Math.min(1, -this.vy / 9) + .25); if (this.onSplash) this.onSplash(this.vy < -5); this.setWeapon(this.weapon); }
        this.tilt = U.damp(this.tilt, this.speed > .7 ? 1 : .25, 3, dt);
        const want = surf - 1.5 * Math.cos(this.tilt) + Math.sin(t * 2.1 + this.x * .3) * .04;
        this.y = U.damp(this.y, want, 5, dt); this.vy = 0; this.onGround = false; this.air = 0; this.wade = 0; this.fallTop = this.y; this.standCar = null;
        // swim against the edge of a pool and you climb out onto it
        const moved = Math.hypot(this.x - px, this.z - pz), wantMove = Math.hypot(wx, wz) * dt;
        if (wantMove > .02 && moved < wantMove * .35) {
          const dl = Math.hypot(wx, wz), ax = this.x + wx / dl * .7, az = this.z + wz / dl * .7;
          const ledge = this.floorAt(ax, az, surf + .4);
          if (ledge > surf - .5 && ledge <= surf + .85 && !NB.water.at(ax, az)) {
            this.x = ax; this.z = az; this.y = ledge; this.swim = false; this.onGround = true; this.tilt = .25;
            this.fx.splash(px, surf, pz, .35); this.setWeapon(this.weapon);
          }
        }
      } else {
        if (this.swim) { this.swim = false; this.setWeapon(this.weapon); }
        // vertical: gravity (or the parachute's slow drop), landing, stepping onto curbs
        if (this.chute) { this.vy = U.damp(this.vy, -3.6, 2.5, dt); this.fallTop = this.y; } else this.vy -= GRAVITY * dt;
        this.y += this.vy * dt;
        const was = this.onGround;
        if (this.y <= floor || (was && this.vy <= 0 && this.y - floor < .25)) {
          if (!was && W && this.vy < -4 && surf > floor) { this.fx.splash(this.x, surf, this.z, .6); if (this.onSplash) this.onSplash(false); }
          // a hard landing: the higher the fall, the more it hurts (into deep water it never does)
          if (!was && this.fallTop != null && this.fallTop - floor > SAFE_DROP && this.onFall) this.onFall((this.fallTop - floor - SAFE_DROP) * DROP_HURT, this.fallTop - floor);
          this.y = floor; this.vy = 0; this.onGround = true;
          if (this.chute) { this.chute = 0; if (this.onChute) this.onChute(false); }
        } else this.onGround = false;
        this.fallTop = this.onGround ? this.y : Math.max(this.fallTop == null ? this.y : this.fallTop, this.y);
        this.standCar = this.onGround ? floorCar : null;
        this.air = this.onGround ? 0 : this.air + dt;
        this.wade = W ? Math.max(0, surf - this.y) : 0;
      }
      // rings spreading around you in the water, and the sound of strokes
      if (W && (this.swim || this.wade > .15)) {
        this.rippleT -= dt * (this.speed > .5 ? 1.6 : .6);
        if (this.rippleT <= 0) { this.rippleT = .45; this.fx.ripple(this.x, surf, this.z, this.swim ? 1 : .6); }
        if (this.swim && this.speed > .7 && (this.strokeT -= dt) <= 0) { this.strokeT = .62; if (this.onStroke) this.onStroke(); this.fx.drops(this.x + Math.sin(this.heading) * .6, surf, this.z + Math.cos(this.heading) * .6, 5); }
      }
      this.fx.update(dt);

      // face the direction of travel
      const sp = this.speed;
      if (this.aimT > 0 && !MELEE[this.weapon]) this.heading += U.angDiff(this.heading, this.aimYaw) * Math.min(1, dt * 16);
      else if (sp > .4) this.heading += U.angDiff(this.heading, Math.atan2(this.vx, this.vz)) * Math.min(1, dt * 12);
      this.animate(dt, sp);
    }

    // front crawl when moving, treading water when still; the body tilts forward and floats at the surface
    animateSwim(dt, sp) {
      const m = this.m, t = performance.now() / 1000, TAU = Math.PI * 2;
      this.phase += dt * (2.2 + sp * 1.1);
      const ph = this.phase, crawl = U.clamp((this.tilt - .25) / .75, 0, 1), L = (a, b) => a + (b - a) * Math.min(1, dt * 12);
      const wrap = a => ((a % TAU) + TAU) % TAU;
      // crawl: arms windmill in turn, legs flutter; treading: arms scull out to the sides, legs cycle slowly
      const kick = Math.sin(ph * 2.4);
      // each arm comes forward over the back, out of the water, reaches ahead, then pulls back under the body
      const crawlAL = wrap(ph), crawlAR = wrap(ph + Math.PI);
      const scull = Math.sin(t * 3.2);
      const aLx = crawl > .5 ? crawlAL : -.45 + scull * .25, aRx = crawl > .5 ? crawlAR : -.45 - scull * .25;
      m.aL.sh.rotation.x = crawl > .5 ? aLx : L(m.aL.sh.rotation.x, aLx); m.aR.sh.rotation.x = crawl > .5 ? aRx : L(m.aR.sh.rotation.x, aRx);
      m.aL.sh.rotation.z = L(m.aL.sh.rotation.z, -(1 - crawl) * (.9 + scull * .25) - .07); m.aR.sh.rotation.z = L(m.aR.sh.rotation.z, (1 - crawl) * (.9 - scull * .25) + .07);
      m.aL.el.rotation.x = L(m.aL.el.rotation.x, crawl > .5 ? -.25 : -.9); m.aR.el.rotation.x = L(m.aR.el.rotation.x, crawl > .5 ? -.25 : -.9);
      m.lL.hip.rotation.x = L(m.lL.hip.rotation.x, crawl * kick * .35 + (1 - crawl) * Math.sin(t * 2.5) * .5);
      m.lR.hip.rotation.x = L(m.lR.hip.rotation.x, -crawl * kick * .35 - (1 - crawl) * Math.sin(t * 2.5) * .5);
      m.lL.kn.rotation.x = L(m.lL.kn.rotation.x, .2 + (1 - crawl) * (.5 + Math.max(0, Math.sin(t * 2.5)) * .6));
      m.lR.kn.rotation.x = L(m.lR.kn.rotation.x, .2 + (1 - crawl) * (.5 + Math.max(0, -Math.sin(t * 2.5)) * .6));
      m.torso.rotation.x = L(m.torso.rotation.x, 0); m.torso.rotation.y = crawl * Math.sin(ph) * .22;
      m.hips.position.y = .95; m.head.rotation.x = -this.tilt * .75;   // keep the face up out of the water
      m.root.position.set(this.x, this.y, this.z); m.root.rotation.y = this.heading; m.root.rotation.x = this.tilt;
      this.blob.visible = false;
    }
    animate(dt, sp) {
      if (this.swim) { this.animateSwim(dt, sp); return; }
      this.tilt = U.damp(this.tilt, .25, 6, dt);
      const m = this.m;
      this.run = U.damp(this.run, U.clamp((sp - JOG * .6) / (SPRINT - JOG * .6), 0, 1), 6, dt);
      const moving = U.clamp(sp / 2, 0, 1);
      const was = Math.floor(this.phase / Math.PI);
      this.phase += dt * (sp < .1 ? 0 : 2.6 + sp * 1.25);
      // a foot comes down twice a cycle: a footstep
      if (this.onStep && this.onGround && !this.inCar && sp > .6 && Math.floor(this.phase / Math.PI) !== was) this.onStep(this.run);
      const ph = this.phase, s = Math.sin(ph), c = Math.cos(ph);
      const A = (.55 + this.run * .45) * moving;
      let thL = -s * A, thR = s * A;
      let knL = (.08 + Math.max(0, c) * (.7 + this.run * .7)) * moving, knR = (.08 + Math.max(0, -c) * (.7 + this.run * .7)) * moving;
      let arL = s * A * .9, arR = -s * A * .9, elb = -(.25 + this.run * 1.0) * moving - .12;
      let bob = Math.abs(s) * .045 * moving * (1 + this.run), lean = .06 * moving + .16 * this.run;
      if (!this.onGround && this.air > .08) { thL = -.7; thR = .15; knL = 1.0; knR = .5; arL = -.6; arR = .5; elb = -.8; bob = 0; lean = .05; }
      if (this.chute) { thL = .25; thR = .15; knL = .35; knR = .3; arL = -2.75; arR = -2.75; elb = -.25; bob = 0; lean = 0; }
      m.canopy.visible = !!this.chute;
      const t = performance.now() / 1000;
      const idle = (1 - moving) * Math.sin(t * 1.8) * .012;
      const L = (a, b) => a + (b - a) * Math.min(1, dt * 16);
      m.lL.hip.rotation.x = L(m.lL.hip.rotation.x, thL); m.lR.hip.rotation.x = L(m.lR.hip.rotation.x, thR);
      m.lL.kn.rotation.x = L(m.lL.kn.rotation.x, knL); m.lR.kn.rotation.x = L(m.lR.kn.rotation.x, knR);
      m.aL.sh.rotation.x = L(m.aL.sh.rotation.x, arL); m.aR.sh.rotation.x = L(m.aR.sh.rotation.x, arR);
      m.aL.el.rotation.x = L(m.aL.el.rotation.x, elb); m.aR.el.rotation.x = L(m.aR.el.rotation.x, elb);
      m.aL.sh.rotation.z = -.07; m.aR.sh.rotation.z = .07;
      // arms: aiming a gun, or throwing a punch
      if (this.aimT > 0 && !MELEE[this.weapon]) {
        const up = -Math.PI / 2 - this.aimPitch - this.recoil * .15;
        m.aR.sh.rotation.x = up; m.aR.el.rotation.x = -.05; m.aR.sh.rotation.z = .05;
        if (this.weapon !== 'pistol') { m.aL.sh.rotation.x = up + .25; m.aL.el.rotation.x = -.7; m.aL.sh.rotation.z = .55; }
        m.torso.rotation.y = 0;
      } else if (this.punchT > 0) {
        const k = Math.sin((1 - this.punchT / .3) * Math.PI);
        m.aR.sh.rotation.x = -.4 - 1.25 * k; m.aR.el.rotation.x = -1.3 + 1.2 * k; m.aL.sh.rotation.x = -1; m.aL.el.rotation.x = -1.6;
        m.torso.rotation.y = -.3 * k;
      }
      m.torso.rotation.x = L(m.torso.rotation.x, lean); m.torso.rotation.y = s * .08 * moving;
      m.hips.position.y = .95 + bob - (1 - moving) * 0 + idle;
      m.head.rotation.x = -lean * .6;
      m.root.position.set(this.x, this.y, this.z); m.root.rotation.y = this.heading;
      this.blob.visible = m.root.visible;
      this.blob.position.set(this.x, this.floorAt(this.x, this.z, this.y) + .025, this.z);
    }
  }

  // Third-person camera: orbits the hero, never passes through walls, drifts behind while running.
  class CameraRig {
    constructor(camera, col) {
      this.cam = camera; this.col = col; this.yaw = 0; this.pitch = .28; this.dist = 4.8; this.cur = 4.8;
      this.py = 0; this.idle = 0; this.aimBlend = 0;
    }
    look(dx, dy) { if (dx || dy) { this.yaw -= dx; this.pitch = U.clamp(this.pitch + dy, -.35, 1.15); this.idle = 0; } }
    snap(p) { this.yaw = p.heading + Math.PI; this.py = p.y; }
    update(dt, p) {
      this.idle += dt;
      // in a car the camera swings behind quickly; on foot it waits until you stop steering it
      const car = !!p.camDist;
      if (car ? (this.idle > .6 && Math.abs(p.speed) > 1.5) : (this.idle > 1.6 && p.speed > 1.5)) {
        const behind = car && p.speed < -1 ? p.heading : p.heading + Math.PI;
        this.yaw += U.angDiff(this.yaw, behind) * Math.min(1, dt * (car ? 2.4 : 1.3));
        if (car) this.pitch = U.damp(this.pitch, .2, 1.5, dt);
      }
      this.py = U.damp(this.py, p.y, 12, dt);
      const px = p.x, py = this.py + (p.camH || 1.55), pz = p.z;
      const cp = Math.cos(this.pitch);
      const dx = Math.sin(this.yaw) * cp, dy = Math.sin(this.pitch), dz = Math.cos(this.yaw) * cp;
      const want = car ? p.camDist + (this.dist - 4.8) * .6 : this.dist + (p.run || 0) * .9;
      const hit = this.col.raycast(px, py, pz, dx, dy, dz, want + .4);
      const allowed = Math.max(.6, Math.min(want, hit - .35));
      this.cur = allowed < this.cur ? allowed : U.damp(this.cur, allowed, 3, dt);
      const ab = this.aimBlend, rx = Math.cos(this.yaw) * .6 * ab, rz = -Math.sin(this.yaw) * .6 * ab;
      const dist = this.cur + (Math.min(this.cur, 2.4) - this.cur) * ab;
      let x = px + rx + dx * dist, y = py + dy * dist + .1 * ab, z = pz + rz + dz * dist;
      if (y < .35) y = .35;
      this.cam.position.set(x, y, z);
      this.cam.lookAt(px + rx, py + .15 + .1 * ab, pz + rz);
    }
  }

  NB.Player = Player;
  NB.CameraRig = CameraRig;
})(window.NB);
