// ─── Renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('gameCanvas'),
  antialias: true
});
renderer.setSize(1920, 1080);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ─── Scene ───────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffcc88, 60, 180); // updated dynamically

// ─── CAMERA ──────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(64, 1920 / 1080, 0.1, 320);
camera.position.set(-2, 9, 16);
camera.lookAt(0, 2, -16);

// ─── DAY/NIGHT CYCLE ─────────────────────────────────────────────────────────
const PHASE_MS    = 15 * 60 * 1000;  // 15 min per phase
const CYCLE_MS    = PHASE_MS * 4;    // 60 min full cycle
const gameStartMs = performance.now();

// 0=morning  1=day  2=evening  3=night
const PHASE_DATA = [
  {
    label:       '🌅 MORNING',
    zenith:      new THREE.Color(0x0d1040),
    midSky:      new THREE.Color(0xc05030),
    horizon:     new THREE.Color(0xffbb66),
    glow:        new THREE.Color(0xffee88),
    fogColor:    new THREE.Color(0xffcc88), fogNear: 60,  fogFar: 180,
    ambColor:    new THREE.Color(0xffaa55), ambInt:  0.45,
    sunLColor:   new THREE.Color(0xffcc44), sunLInt: 1.0,
    sunDiskColor:new THREE.Color(0xffa030),
    starAlpha:   0.0,
  },
  {
    label:       '☀️ DAY',
    zenith:      new THREE.Color(0x1a6ad4),
    midSky:      new THREE.Color(0x4aaaf0),
    horizon:     new THREE.Color(0xc0e0ff),
    glow:        new THREE.Color(0xffffff),
    fogColor:    new THREE.Color(0xb8e0ff), fogNear: 80,  fogFar: 210,
    ambColor:    new THREE.Color(0xfff5e0), ambInt:  0.9,
    sunLColor:   new THREE.Color(0xffffff), sunLInt: 2.2,
    sunDiskColor:new THREE.Color(0xfffff0),
    starAlpha:   0.0,
  },
  {
    label:       '🌇 EVENING',
    zenith:      new THREE.Color(0x0a0a2e),
    midSky:      new THREE.Color(0x7b2d8b),
    horizon:     new THREE.Color(0xff5500),
    glow:        new THREE.Color(0xffcc33),
    fogColor:    new THREE.Color(0xff8833), fogNear: 45,  fogFar: 145,
    ambColor:    new THREE.Color(0xff9955), ambInt:  0.6,
    sunLColor:   new THREE.Color(0xff8833), sunLInt: 1.5,
    sunDiskColor:new THREE.Color(0xffd700),
    starAlpha:   0.0,
  },
  {
    label:       '🌙 NIGHT',
    zenith:      new THREE.Color(0x000010),
    midSky:      new THREE.Color(0x050520),
    horizon:     new THREE.Color(0x0a0828),
    glow:        new THREE.Color(0x102050),
    fogColor:    new THREE.Color(0x060412), fogNear: 30,  fogFar: 120,
    ambColor:    new THREE.Color(0x102040), ambInt:  0.12,
    sunLColor:   new THREE.Color(0x2030a0), sunLInt: 0.3,
    sunDiskColor:new THREE.Color(0xdde8ff),
    starAlpha:   0.9,
  }
];

function lerpPD(a, b, t) {
  return {
    label:       t < 0.5 ? a.label : b.label,
    zenith:      new THREE.Color().lerpColors(a.zenith,      b.zenith,      t),
    midSky:      new THREE.Color().lerpColors(a.midSky,      b.midSky,      t),
    horizon:     new THREE.Color().lerpColors(a.horizon,     b.horizon,     t),
    glow:        new THREE.Color().lerpColors(a.glow,        b.glow,        t),
    fogColor:    new THREE.Color().lerpColors(a.fogColor,    b.fogColor,    t),
    fogNear:     a.fogNear  + (b.fogNear  - a.fogNear)  * t,
    fogFar:      a.fogFar   + (b.fogFar   - a.fogFar)   * t,
    ambColor:    new THREE.Color().lerpColors(a.ambColor,    b.ambColor,    t),
    ambInt:      a.ambInt   + (b.ambInt   - a.ambInt)   * t,
    sunLColor:   new THREE.Color().lerpColors(a.sunLColor,   b.sunLColor,   t),
    sunLInt:     a.sunLInt  + (b.sunLInt  - a.sunLInt)  * t,
    sunDiskColor:new THREE.Color().lerpColors(a.sunDiskColor,b.sunDiskColor,t),
    starAlpha:   a.starAlpha + (b.starAlpha - a.starAlpha) * t,
  };
}

function getCycleState(nowMs) {
  const elapsed  = nowMs - gameStartMs;
  const cyclePos = elapsed % CYCLE_MS;
  const phaseF   = cyclePos / PHASE_MS;     // 0..4
  const phase    = Math.floor(phaseF) % 4;
  const t        = phaseF % 1;
  const pd       = lerpPD(PHASE_DATA[phase], PHASE_DATA[(phase + 1) % 4], t);
  pd.phase = phase;
  pd.t     = t;

  // Sun arc: right horizon → overhead → left horizon over phases 0→3
  // Continues below horizon during night
  const sunAngle  = Math.PI * phaseF / 3;
  const sunX      = Math.cos(sunAngle) * 90;
  const sunY      = Math.sin(sunAngle) * 68 + 6;
  pd.sunPos       = { x: sunX, y: sunY, z: -150 };
  pd.sunVisible   = sunY > -4;

  // Moon: upper sky, visible during night
  pd.moonVisible  = phase === 3 || (phase === 2 && t > 0.75);
  pd.moonPos      = { x: -50, y: 55, z: -150 };

  pd.elapsed = elapsed;
  return pd;
}

// ─── DYNAMIC SKY DOME ────────────────────────────────────────────────────────
const skyUniforms = {
  uZenith:     { value: PHASE_DATA[0].zenith.clone()  },
  uMidSky:     { value: PHASE_DATA[0].midSky.clone()  },
  uHorizon:    { value: PHASE_DATA[0].horizon.clone() },
  uGlow:       { value: PHASE_DATA[0].glow.clone()    },
  uSunDir:     { value: new THREE.Vector3(0.6, 0.04, -1).normalize() },
  uSunVisible: { value: 1.0 },
};

const skyMesh = new THREE.Mesh(
  new THREE.SphereGeometry(190, 24, 14),
  new THREE.ShaderMaterial({
    uniforms:   skyUniforms,
    side:       THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform vec3  uZenith;
      uniform vec3  uMidSky;
      uniform vec3  uHorizon;
      uniform vec3  uGlow;
      uniform vec3  uSunDir;
      uniform float uSunVisible;
      varying vec3  vDir;
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = h < 0.35
          ? mix(uHorizon, uMidSky, h / 0.35)
          : mix(uMidSky,  uZenith, (h - 0.35) / 0.65);
        if (uSunVisible > 0.5) {
          float d    = dot(vDir, uSunDir);
          float glow = pow(max(0.0, d), 4.0) * 0.75;
          float beam = pow(max(0.0, d), 20.0) * 0.9;
          col += uGlow * glow * (1.0 - h * 0.8);
          col += uGlow * beam;
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `
  })
);
skyMesh.renderOrder = -1;
scene.add(skyMesh);

// ─── SUN GROUP ───────────────────────────────────────────────────────────────
const sunGroup = new THREE.Group();
const sunCore  = new THREE.Mesh(
  new THREE.CircleGeometry(7, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd700, side: THREE.DoubleSide })
);
sunGroup.add(sunCore);
[14, 22, 32].forEach((r, i) => {
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(r, 32),
    new THREE.MeshBasicMaterial({
      color: [0xff8800, 0xff4400, 0xff2200][i],
      transparent: true,
      opacity: 0.28 - i * 0.07,
      side: THREE.DoubleSide
    })
  );
  halo.position.z = (i + 1) * 0.4;
  sunGroup.add(halo);
});
sunGroup.position.set(90, 6, -150);
scene.add(sunGroup);

// ─── MOON ────────────────────────────────────────────────────────────────────
const moonGroup = new THREE.Group();
moonGroup.add(new THREE.Mesh(
  new THREE.CircleGeometry(5, 32),
  new THREE.MeshBasicMaterial({ color: 0xdde8ff, side: THREE.DoubleSide })
));
const moonGlow = new THREE.Mesh(
  new THREE.CircleGeometry(11, 32),
  new THREE.MeshBasicMaterial({ color: 0x8899cc, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
);
moonGlow.position.z = 0.2;
moonGroup.add(moonGlow);
moonGroup.visible = false;
moonGroup.position.set(-50, 55, -150);
scene.add(moonGroup);

// ─── STARS ───────────────────────────────────────────────────────────────────
(function buildStars() {
  const count = 500;
  const pos   = new Float32Array(count * 3);
  const h     = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5; return x - Math.floor(x); };
  for (let i = 0; i < count; i++) {
    const theta = h(i * 3)     * Math.PI * 2;
    const phi   = h(i * 3 + 1) * Math.PI * 0.46; // upper hemisphere
    const r     = 182;
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.cos(phi) + 5;
    pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  window._starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.6, sizeAttenuation: false,
    transparent: true, opacity: 0.0, depthWrite: false
  });
  scene.add(new THREE.Points(geo, window._starMat));
})();

// ─── DYNAMIC LIGHTING ────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffaa55, 0.45);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffcc44, 1.0);
sunLight.position.set(90, 6, -150);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width  = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.left   = -50;
sunLight.shadow.camera.right  =  50;
sunLight.shadow.camera.top    =  50;
sunLight.shadow.camera.bottom = -50;
sunLight.shadow.camera.far    = 200;
scene.add(sunLight);

scene.add(new THREE.DirectionalLight(0x4466aa, 0.2)).position.set(2, 6, 15);

// ─── GOAL MOUNTAIN — twin peaks with mountain pass (road goes through) ────────
const goalMtnGroup = new THREE.Group();

(function buildGoalMountain() {
  const _r = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // Realistic jagged peak: many overlapping displaced cones
  function buildPeak(cx, cz, W, H, seed, snow) {
    const g = new THREE.Group();
    // 5 overlapping cone layers at slight offsets & rotations
    const layers = [
      [0, W*0.50, H*1.00, 10, 0.00,  0,          0,         0          ],
      [0, W*0.42, H*0.93,  9, 0.20,  W*0.13,     W*0.09,   Math.PI/5  ],
      [0, W*0.36, H*0.85,  8, 0.40, -W*0.10,     W*0.07,   Math.PI/3  ],
      [0, W*0.27, H*0.77,  7, 0.62,  W*0.06,    -W*0.13,   Math.PI/7  ],
      [0, W*0.19, H*0.68,  6, 0.80, -W*0.09,    -W*0.05,   Math.PI/4  ],
    ];
    layers.forEach(([rt, rb, h, segs, ct, lx, lz, ry], li) => {
      const col = new THREE.Color(0x1a0804).lerp(new THREE.Color(0x4a2010), ct);
      const geo = new THREE.ConeGeometry(rb, h, segs, 4);
      const pos = geo.attributes.position;
      for (let vi = 0; vi < pos.count; vi++) {
        const yn = pos.getY(vi) / h + 0.5;
        if (yn > 0.12 && yn < 0.97) {
          const j = 0.24 * yn * rb;
          pos.setX(vi, pos.getX(vi) + (_r(vi*3 + li*31 + seed)     - 0.5) * j);
          pos.setZ(vi, pos.getZ(vi) + (_r(vi*3 + li*31 + seed + 1) - 0.5) * j);
        }
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
      m.position.set(lx, h / 2, lz);
      m.rotation.y = ry;
      m.castShadow = true;
      g.add(m);
    });

    if (snow) {
      // Rocky snow collar
      const sc = new THREE.Mesh(
        new THREE.CylinderGeometry(W*0.13, W*0.19, H*0.09, 7),
        new THREE.MeshLambertMaterial({ color: 0x8a9fb0, flatShading: true })
      );
      sc.position.y = H * 0.73;
      g.add(sc);
      // Snow slopes
      const ss = new THREE.Mesh(
        new THREE.ConeGeometry(W*0.13, H*0.19, 6, 2),
        new THREE.MeshLambertMaterial({ color: 0xd2e4f2, flatShading: true })
      );
      ss.position.y = H * 0.84;
      ss.rotation.y = Math.PI / 6;
      g.add(ss);
      // Jagged snow peak
      const sp = new THREE.Mesh(
        new THREE.ConeGeometry(W*0.055, H*0.13, 5),
        new THREE.MeshLambertMaterial({ color: 0xeef4ff, flatShading: true })
      );
      sp.position.y = H * 0.95;
      sp.rotation.y = _r(seed * 9) * Math.PI;
      g.add(sp);
    }
    g.position.set(cx, 0, cz);
    return g;
  }

  // LEFT WING — mountain half left of the road
  goalMtnGroup.add(buildPeak(-20, -4, 28, 82, 1,  true));
  // RIGHT WING — mountain half right of the road
  goalMtnGroup.add(buildPeak( 20, -4, 26, 78, 42, true));
  // Secondary peaks behind for depth
  goalMtnGroup.add(buildPeak(-40,  8, 18, 60,  7, false));
  goalMtnGroup.add(buildPeak( 38,  6, 17, 55, 15, false));
  goalMtnGroup.add(buildPeak(  7, 14, 20, 70, 23, true));

  // INNER PASS WALLS — rocky cliffs flanking the road inside the pass
  // Visible when the mountain group has moved close (the pass-through moment)
  [-1, 1].forEach((side, si) => {
    for (let i = 0; i < 5; i++) {
      const w   = 4  + _r(i*7  + si*50 + 100) * 7;
      const h   = 10 + _r(i*7  + si*50 + 101) * 18;
      const d   = 6  + _r(i*5  + si*50 + 102) * 9;
      const geo = new THREE.BoxGeometry(w, h, d);
      const pos = geo.attributes.position;
      for (let vi = 0; vi < pos.count; vi++) {
        pos.setX(vi, pos.getX(vi) + (_r(vi + i*100 + si*200)     - 0.5) * 2.0);
        pos.setY(vi, pos.getY(vi) + (_r(vi + i*100 + si*200 + 1) - 0.5) * 1.4);
        pos.setZ(vi, pos.getZ(vi) + (_r(vi + i*100 + si*200 + 2) - 0.5) * 1.4);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      const col = new THREE.Color(0x160803).lerp(new THREE.Color(0x3a1808), _r(i*13 + si*70));
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
      m.position.set(side * (7 + _r(i*3 + si*90) * 3.5), h/2 + i*8, 14 + i*9);
      m.rotation.y = (_r(i*17 + si*33) - 0.5) * 0.5;
      m.castShadow = true;
      goalMtnGroup.add(m);
    }
  });

  // Road rocks inside the pass (side of the trail)
  for (let i = 0; i < 12; i++) {
    const sz  = 0.7 + _r(i*9 + 300) * 2.5;
    const geo = new THREE.DodecahedronGeometry(sz, 0);
    const col = new THREE.Color(0x1e0e06).lerp(new THREE.Color(0x4a2810), _r(i*11 + 300));
    const m   = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
    const side = i % 2 === 0 ? -1 : 1;
    m.position.set(side * (5.2 + _r(i*3 + 300) * 4.5), sz*0.4, 16 + _r(i*7 + 300) * 32);
    m.rotation.set(_r(i)*5, _r(i*2)*5, _r(i*3)*5);
    m.castShadow = true;
    goalMtnGroup.add(m);
  }
})();

// Start far; position & scale updated dynamically every frame
goalMtnGroup.position.set(0, -2, -155);
scene.add(goalMtnGroup);

// ─── BACKGROUND MOUNTAINS — realistic displaced multi-cone ───────────────────
const bgMountains = [];
(function buildMountains() {
  const _r = s => { const x = Math.sin(s * 91.3 + 7.77) * 43758.5; return x - Math.floor(x); };

  function buildBgMtn(x, z, W, H, seed) {
    const g = new THREE.Group();
    // 3 overlapping displaced cone layers
    [[W*0.46, H,       9, 0.0],
     [W*0.36, H*0.88,  8, 0.3],
     [W*0.25, H*0.73,  7, 0.6]].forEach(([r, h, segs, ct], ci) => {
      const col = new THREE.Color(0x160703).lerp(new THREE.Color(0x3a1808), ct + _r(seed + ci*7)*0.3);
      const geo = new THREE.ConeGeometry(r, h, segs, 3);
      const pos = geo.attributes.position;
      for (let vi = 0; vi < pos.count; vi++) {
        const yn = pos.getY(vi) / h + 0.5;
        if (yn > 0.1) {
          const j = 0.22 * yn * r;
          pos.setX(vi, pos.getX(vi) + (_r(vi*3 + seed + ci*31)     - 0.5) * j);
          pos.setZ(vi, pos.getZ(vi) + (_r(vi*3 + seed + ci*31 + 1) - 0.5) * j);
        }
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
      m.position.set((_r(seed + ci*19) - 0.5)*W*0.18, h/2, (_r(seed + ci*23) - 0.5)*W*0.12);
      m.rotation.y = _r(seed + ci*11) * Math.PI * 2;
      g.add(m);
    });
    // Snow cap for taller peaks
    if (H > 28) {
      const sn = new THREE.Mesh(
        new THREE.ConeGeometry(W*0.11, H*0.19, 6),
        new THREE.MeshLambertMaterial({ color: 0xd0e4f8, flatShading: true })
      );
      sn.position.y = H * 0.83;
      sn.rotation.y = _r(seed * 5) * Math.PI;
      g.add(sn);
    }
    g.position.set(x, 0, z);
    return g;
  }

  [[-65,-122, 22,38, 1], [-40,-133, 18,32, 2],
   [ 40,-133, 20,35, 3], [ 65,-122, 24,42, 4],
   [-90,-114, 20,36, 5], [ 90,-114, 22,40, 6],
   [-48,-142, 16,28, 7], [ 48,-142, 18,30, 8],
   [-112,-106,18,32, 9], [112,-106, 20,34,10],
  ].forEach(([x, z, w, h, s]) => {
    const mesh = buildBgMtn(x, z, w, h, s);
    scene.add(mesh);
    bgMountains.push({ mesh, homeZ: z });
  });
})();

// ─── BEACH OCEAN GROUP — same scale-approach logic as mountains ───────────────
// Geometry is 2200 wide: at scale=0.04 it spans ~88 world units at distance 171
// — wide enough to fill the horizon from the very start of the beach world.
const beachOceanGroup = new THREE.Group();
window._beachWaterUniforms = null;

(function buildBeachOcean() {
  const _r = s => { const x = Math.sin(s * 73.1 + 91.7) * 43758.5; return x - Math.floor(x); };

  // ── ANIMATED WAVE SURFACE — 2200 × 800, fills horizon at every scale ────────
  const waterUniforms = {
    uTime:  { value: 0.0 },
    uDeep:  { value: new THREE.Color(0x010d1e) },  // dark navy deep water
    uMid:   { value: new THREE.Color(0x083a6c) },  // ocean blue
    uShore: { value: new THREE.Color(0x10a8cc) },  // bright turquoise near shore
    uFoam:  { value: new THREE.Color(0xeef8ff) },  // white foam
  };
  window._beachWaterUniforms = waterUniforms;

  const waterGeo = new THREE.PlaneGeometry(2200, 800, 60, 100);
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    side: THREE.FrontSide,
    vertexShader: `
      uniform float uTime;
      varying float vHeight;
      varying float vDist;
      varying float vFresnel;

      // Standard sinusoidal wave
      float wv(vec2 p, vec2 d, float f, float a, float sp) {
        return sin(dot(p, normalize(d)) * f + uTime * sp) * a;
      }
      // Gerstner-like: sharp crests, flat troughs
      float wvG(vec2 p, vec2 d, float f, float a, float sp) {
        float t = dot(p, normalize(d)) * f + uTime * sp;
        return (pow(max(0.0, sin(t)), 2.0) - 0.18) * a;
      }

      void main() {
        vDist = max(0.0, -position.z);
        vec3 p = position;

        // Long ocean swells
        p.y += wv(p.xz, vec2(0.62, 1.00), 0.032, 3.00, 0.38);
        p.y += wv(p.xz, vec2(-0.32, 0.95), 0.040, 2.20, 0.48);
        p.y += wv(p.xz, vec2(0.15, 0.99), 0.055, 1.40, 0.60);

        // Directional Gerstner wave trains (sharp crests)
        p.y += wvG(p.xz, vec2(0.08, 1.00), 0.080, 1.80, 0.85);
        p.y += wvG(p.xz, vec2(-0.05, 1.00), 0.092, 1.30, 0.78);
        p.y += wvG(p.xz, vec2(0.22, 0.97), 0.110, 0.90, 0.95);

        // Cross-swell
        p.y += wv(p.xz, vec2(0.78, 0.62), 0.095, 0.55, 1.35);
        p.y += wv(p.xz, vec2(-0.58, 0.81), 0.125, 0.38, 1.25);

        // Surface chop
        p.y += wv(p.xz, vec2(0.87, 0.49), 0.240, 0.14, 2.50);
        p.y += wv(p.xz, vec2(-0.69, 0.72), 0.310, 0.09, 2.20);
        p.y += wv(p.xz, vec2(0.52, 0.85), 0.380, 0.06, 2.80);

        // Shore break: amplify and collapse near z=0
        float ns = clamp(1.0 - vDist / 28.0, 0.0, 1.0);
        ns = ns * ns;
        p.y += wvG(p.xz, vec2(0.02, 1.00), 0.095, 4.0 * ns, 1.15);
        p.y += wvG(p.xz, vec2(0.18, 0.98), 0.110, 2.8 * ns, 1.00);

        vHeight = p.y;

        // Fresnel factor: larger at grazing angles (far water)
        float eyeDist = length((modelViewMatrix * vec4(p, 1.0)).xyz);
        vFresnel = clamp(1.0 - 9.0 / max(eyeDist, 1.0), 0.0, 1.0);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDeep;
      uniform vec3 uMid;
      uniform vec3 uShore;
      uniform vec3 uFoam;
      varying float vHeight;
      varying float vDist;
      varying float vFresnel;

      void main() {
        float d  = clamp(vDist / 90.0, 0.0, 1.0);
        float d2 = d * d;

        // Depth-based colour gradient: shore → mid → deep
        vec3 col;
        if (d < 0.28) {
          col = mix(uShore, uMid, d / 0.28);
        } else {
          col = mix(uMid, uDeep, pow((d - 0.28) / 0.72, 0.60));
        }
        col = mix(col, uDeep * 0.45, d2 * 0.65);

        // Sub-surface scattering: teal shimmer through wave faces near shore
        float sss = max(0.0, 1.0 - d * 3.5) * clamp(vHeight * 0.25 + 0.35, 0.0, 1.0) * 0.38;
        col += vec3(0.0, sss * 0.45, sss);

        // Peak brightening: light scattering inside wave crests
        float peakLight = smoothstep(-0.5, 2.2, vHeight) * (1.0 - d * 0.7);
        col = mix(col, col * 1.55 + vec3(0.0, 0.04, 0.14), peakLight * 0.38);

        // Fresnel: distant water reflects more sky (darker, bluer)
        vec3 skyRefl = mix(uMid * 1.15, uDeep * 0.65, vFresnel);
        col = mix(col, skyRefl, vFresnel * 0.52);

        // Foam on wave crests
        float foam = smoothstep(0.95, 2.3, vHeight);
        col = mix(col, uFoam, foam * 0.93);

        // Shore foam near z=0
        float sfoam = clamp(1.0 - vDist / 14.0, 0.0, 1.0);
        sfoam *= sfoam * max(0.0, sin(vHeight * 2.2 + 1.0));
        col = mix(col, uFoam, clamp(sfoam * 0.52, 0.0, 0.82));

        // Sun sparkle on moving crests
        float spark = pow(clamp(vHeight * 0.38 + 0.15, 0.0, 1.0), 14.0) * 0.82;
        col += vec3(0.82, 0.96, 1.0) * spark * (1.0 - d * 0.5);

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(0, 0.15, -80);  // spans z=+320 to z=-480 in local space
  beachOceanGroup.add(waterMesh);

  // ── WAVE CREST ROLLERS — 2200 wide, fill horizon at every scale ──────────────
  const rollerData = [
    { z:  8,  r: 1.50, col: 0x90f0ff },
    { z:  1,  r: 1.20, col: 0x60d8f0 },
    { z: -7,  r: 1.00, col: 0x38c0dc },
    { z: -18, r: 0.78, col: 0x18a8c8 },
    { z: -32, r: 0.60, col: 0x0c90b0 },
    { z: -50, r: 0.45, col: 0x087898 },
  ];
  rollerData.forEach(({ z, r, col }, i) => {
    const rGeo = new THREE.CylinderGeometry(r, r * 1.4, 2200, 14, 3);
    const rPos = rGeo.attributes.position;
    for (let vi = 0; vi < rPos.count; vi++) {
      rPos.setY(vi, rPos.getY(vi) + Math.sin(_r(vi*3+i*7) * Math.PI*4) * r * 0.45);
      rPos.setZ(vi, rPos.getZ(vi) + (_r(vi*5+i*11) - 0.5) * r * 0.6);
    }
    rPos.needsUpdate = true; rGeo.computeVertexNormals();
    const rm = new THREE.Mesh(rGeo, new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
    rm.rotation.z = Math.PI / 2;
    rm.position.set(0, r * 0.65, z);
    beachOceanGroup.add(rm);
  });

  // ── SHORE FOAM STRIPS ────────────────────────────────────────────────────────
  [{ z: 11, w: 12, op: 0.90 }, { z: 16, w: 7, op: 0.68 }, { z: 21, w: 4, op: 0.42 }]
    .forEach(({ z, w, op }) => {
      const fm = new THREE.Mesh(
        new THREE.PlaneGeometry(2200, w),
        new THREE.MeshBasicMaterial({ color: 0xf4faff, transparent: true, opacity: op })
      );
      fm.rotation.x = -Math.PI / 2;
      fm.position.set(0, 0.22, z);
      beachOceanGroup.add(fm);
    });

  // ── SEA ROCKS ────────────────────────────────────────────────────────────────
  for (let i = 0; i < 18; i++) {
    const sz = 0.6 + _r(i * 7 + 200) * 3.5;
    const geo = new THREE.DodecahedronGeometry(sz, 0);
    const col = new THREE.Color(0x122030).lerp(new THREE.Color(0x284858), _r(i * 11 + 200));
    const m   = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
    const sd  = i % 2 === 0 ? -1 : 1;
    m.position.set(sd * (8 + _r(i*3+200) * 45), sz * 0.38, -(_r(i*5+200) * 80));
    m.rotation.set(_r(i)*5, _r(i*2)*5, _r(i*3)*5);
    beachOceanGroup.add(m);
  }
})();
beachOceanGroup.position.set(0, -2, -155);
beachOceanGroup.visible = false;
scene.add(beachOceanGroup);

// ─── GROUND ──────────────────────────────────────────────────────────────────
const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 500),
  new THREE.MeshLambertMaterial({ color: 0x4a6030 })
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.set(0, -0.02, -180);
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// Sandy beach ground — visible in world 1
const sandGroundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 500),
  new THREE.MeshLambertMaterial({ color: 0xc8a855 })
);
sandGroundMesh.rotation.x = -Math.PI / 2;
sandGroundMesh.position.set(0, 0.01, -180); // sits just above grass
sandGroundMesh.receiveShadow = true;
sandGroundMesh.visible = false;
scene.add(sandGroundMesh);

// ─── TRAIL ───────────────────────────────────────────────────────────────────
[
  { w: 5.2, color: 0x9b7d50, y: 0.005 },
  { w: 2.2, color: 0x7a6038, y: 0.010 },
].forEach(({ w, color, y }) => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, 500),
    new THREE.MeshLambertMaterial({ color })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, y, -180);
  m.receiveShadow = true;
  scene.add(m);
});
[-2.7, 2.7].forEach(ox => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 500),
    new THREE.MeshLambertMaterial({ color: 0x4a3818 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(ox, 0.015, -180);
  scene.add(m);
});

// ─── POOLED WORLD OBJECTS ─────────────────────────────────────────────────────
const rng = s => { const x = Math.sin(s) * 10000; return x - Math.floor(x); };

const POOL_SPAN  = 200;
const SCROLL_SPD = 4.2;
const pooledObjects = [];

function makeTree(x, z, scale, type) {
  const g = new THREE.Group();
  const s = scale;
  const trunkCol = type === 'birch' ? 0xd0c8a8 : 0x3a1a08;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12*s, 0.22*s, 2.8*s, 7),
    new THREE.MeshLambertMaterial({ color: trunkCol })
  );
  trunk.position.y = 1.4*s;
  trunk.castShadow = true;
  g.add(trunk);

  if (type === 'pine') {
    [0x1a3a0f, 0x1d5518, 0x276b26].forEach((col, i) => {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry((2.0 - i*0.45)*s, (3.2+i*0.2)*s, 7),
        new THREE.MeshLambertMaterial({ color: col })
      );
      cone.position.y = (2.8 + i*1.9)*s;
      cone.castShadow = true;
      g.add(cone);
    });
  } else {
    [0x2d5a1e, 0x3d7a2a, 0x4da03a].forEach((col, i) => {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry((1.35-i*0.14)*s, 7, 6),
        new THREE.MeshLambertMaterial({ color: col })
      );
      sphere.position.set((i-1)*0.4*s, (3.4+i*0.5)*s, (i%2-0.5)*0.3*s);
      sphere.castShadow = true;
      g.add(sphere);
    });
  }
  g.position.set(x, 0, z);
  return g;
}

for (let i = 0; i < 34; i++) {
  const baseZ = -(i / 34) * POOL_SPAN;
  const lx = -(4.0 + rng(i*3)   * 18);
  const rx =   4.0 + rng(i*3+1) * 18;
  const ls =   0.7 + rng(i*3+2) * 1.4;
  const rs =   0.7 + rng(i*3+5) * 1.4;
  const lt = rng(i*7)   > 0.45 ? 'pine' : 'birch';
  const rt = rng(i*7+1) > 0.45 ? 'pine' : 'birch';
  [makeTree(lx, baseZ, ls, lt), makeTree(rx, baseZ, rs, rt)].forEach(t => {
    scene.add(t);
    pooledObjects.push({ mesh: t, z: baseZ });
  });
}

for (let i = 0; i < 28; i++) {
  const sz  = 0.15 + rng(i*7) * 0.55;
  const geo = new THREE.DodecahedronGeometry(sz, 0);
  const mat = new THREE.MeshLambertMaterial({ color: rng(i*11) > 0.5 ? 0x7a7060 : 0x5a5448 });
  const rock = new THREE.Mesh(geo, mat);
  const side = rng(i*3) > 0.5 ? 1 : -1;
  const baseZ = -(rng(i*9) * POOL_SPAN);
  rock.position.set(side * (3.3 + rng(i*5) * 12), sz * 0.38, baseZ);
  rock.rotation.set(rng(i)*5, rng(i*2)*5, rng(i*3)*5);
  rock.castShadow = true;
  scene.add(rock);
  pooledObjects.push({ mesh: rock, z: baseZ });
}

for (let i = 0; i < 40; i++) {
  const geo = new THREE.SphereGeometry(0.22 + rng(i)*0.42, 5, 4);
  const col = new THREE.Color(0x3d5a28).lerp(new THREE.Color(0x5a6a20), rng(i*13));
  const mat = new THREE.MeshLambertMaterial({ color: col });
  const b   = new THREE.Mesh(geo, mat);
  const side = i%2===0 ? -1 : 1;
  const baseZ = -(rng(i*8) * POOL_SPAN);
  b.position.set(side * (3.2 + rng(i*2) * 14), 0.12, baseZ);
  b.castShadow = true;
  scene.add(b);
  pooledObjects.push({ mesh: b, z: baseZ });
}

// ─── BEACH POOLED OBJECTS ─────────────────────────────────────────────────────
const beachPooledObjects = [];

function makePalm(x, z, scale, seed) {
  const _r = s => { const v = Math.sin(s * 91.3 + 47.2) * 43758.5; return v - Math.floor(v); };
  const g = new THREE.Group();
  const s = scale;

  // TRUNK — 9 arc segments, parabolically curved (more bend near crown)
  const SEGS   = 9;
  const totalH = 9.0 * s;
  const lean   = 0.10 + _r(seed)     * 0.22;   // lean amount
  const leanAz = _r(seed * 5)        * Math.PI * 2;  // lean azimuth

  for (let i = 0; i < SEGS; i++) {
    const t    = i / SEGS;
    const segH = totalH / SEGS;
    const bend = lean * t * t;                  // quadratic — trunk bends more near top
    const bx   = Math.cos(leanAz) * bend * totalH * 0.30;
    const bz   = Math.sin(leanAz) * bend * totalH * 0.30;
    const by   = i * segH;

    const rT = Math.max(0.055, (0.20 - i * 0.013)) * s;
    const rB = Math.max(0.075, (0.22 - i * 0.011)) * s;
    // Alternate ring shading for bark texture
    const col = i % 2 === 0 ? 0x7c5c12 : 0x8e6c1e;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(rT, rB, segH + 0.05, 7),
      new THREE.MeshLambertMaterial({ color: col })
    );
    seg.position.set(bx, by + segH * 0.5, bz);
    seg.rotation.z =  Math.cos(leanAz) * bend * 0.85;
    seg.rotation.x = -Math.sin(leanAz) * bend * 0.85;
    seg.castShadow = true;
    g.add(seg);
  }

  // Crown base decoration (leaf-scar collar)
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28*s, 0.22*s, 0.30*s, 7),
    new THREE.MeshLambertMaterial({ color: 0x5a4010 })
  );
  const tBend  = lean;
  const crownX = Math.cos(leanAz) * tBend * totalH * 0.30;
  const crownZ = Math.sin(leanAz) * tBend * totalH * 0.30;
  const crownY = totalH;
  collar.position.set(crownX, crownY - 0.15*s, crownZ);
  g.add(collar);

  // FRONDS — flat custom BufferGeometry with V-fold and droop
  const FRONDS = 10;
  for (let fi = 0; fi < FRONDS; fi++) {
    const fAngle = (fi / FRONDS) * Math.PI * 2 + _r(seed + fi)     * 0.35;
    const fLen   = (3.8 + _r(seed + fi * 11) * 2.0) * s;
    const fDroop = 0.30 + _r(seed + fi *  7) * 0.24;  // 0.30–0.54 parabolic sag

    // Build flat drooping frond as custom geometry
    // Spine goes along +X, leaf-halves at ±Z, droops in -Y
    const PTS  = 11;
    const verts = [];
    const idxs  = [];

    for (let p = 0; p <= PTS; p++) {
      const u  = p / PTS;                               // 0=base, 1=tip
      const bx = u * fLen;
      const by = -u * u * fDroop * fLen;                // parabolic droop
      // Half-width tapers at base (first 15%) and tip
      const taper = u < 0.15 ? u / 0.15 : 1.0 - (u - 0.15) / 0.85;
      const hw    = taper * 0.44 * s;

      // 3 verts per cross-section: left, spine-fold (slightly raised), right
      verts.push(bx, by,           -hw);   // 0: left leaflet
      verts.push(bx, by + hw*0.12,  0.0); // 1: midrib (raised fold)
      verts.push(bx, by,            hw);   // 2: right leaflet

      if (p < PTS) {
        const b = p * 3;
        idxs.push(b,   b+3, b+1,   b+3, b+4, b+1);  // left face
        idxs.push(b+1, b+4, b+2,   b+4, b+5, b+2);  // right face
      }
    }

    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    fGeo.setIndex(idxs);
    fGeo.computeVertexNormals();

    const fCol = new THREE.Color(0x1a6018).lerp(new THREE.Color(0x3c9428), _r(seed + fi * 3));
    const frond = new THREE.Mesh(fGeo,
      new THREE.MeshLambertMaterial({ color: fCol, side: THREE.DoubleSide, flatShading: true }));
    frond.position.set(crownX, crownY + 0.1*s, crownZ);
    frond.rotation.y = fAngle;
    frond.rotation.z = -0.18;  // slight initial outward tilt
    frond.castShadow = true;
    g.add(frond);
  }

  // Coconuts cluster
  for (let ci = 0; ci < 3; ci++) {
    const ca = (ci / 3) * Math.PI * 2 + _r(seed + ci * 77) * 1.0;
    const nut = new THREE.Mesh(
      new THREE.SphereGeometry(0.13*s, 6, 5),
      new THREE.MeshLambertMaterial({ color: 0x3a2808 })
    );
    nut.position.set(crownX + Math.cos(ca)*0.22*s, crownY - 0.25*s, crownZ + Math.sin(ca)*0.22*s);
    g.add(nut);
  }

  g.position.set(x, 0, z);
  return g;
}

// Palm trees — both sides of the road
for (let i = 0; i < 34; i++) {
  const baseZ = -(i / 34) * POOL_SPAN;
  const lx = -(4.0 + rng(i*3+200) * 20);
  const rx =   4.0 + rng(i*3+201) * 20;
  const ls =   0.8 + rng(i*3+202) * 1.2;
  const rs =   0.8 + rng(i*3+205) * 1.2;
  [makePalm(lx, baseZ, ls, i*37), makePalm(rx, baseZ, rs, i*37+19)].forEach(t => {
    t.visible = false;
    scene.add(t);
    beachPooledObjects.push({ mesh: t, z: baseZ });
  });
}

// Sand dunes
for (let i = 0; i < 22; i++) {
  const side = i%2===0 ? -1 : 1;
  const sx = 0.8 + rng(i*5+400) * 1.4;
  const geo = new THREE.SphereGeometry(sx, 8, 5);
  const pos = geo.attributes.position;
  for (let vi = 0; vi < pos.count; vi++) pos.setY(vi, pos.getY(vi) * 0.32);
  pos.needsUpdate = true; geo.computeVertexNormals();
  const dune = new THREE.Mesh(geo,
    new THREE.MeshLambertMaterial({ color: 0xc4a048, flatShading: true }));
  const baseZ = -(rng(i*9+400) * POOL_SPAN);
  dune.position.set(side * (4 + rng(i*5+400) * 18), sx*0.18, baseZ);
  dune.visible = false;
  scene.add(dune);
  beachPooledObjects.push({ mesh: dune, z: baseZ });
}

// Beach shells / small rocks
for (let i = 0; i < 30; i++) {
  const sz  = 0.10 + rng(i*7+500) * 0.35;
  const geo = new THREE.DodecahedronGeometry(sz, 0);
  const col = new THREE.Color(0xd8b870).lerp(new THREE.Color(0xe8d0a0), rng(i*11+500));
  const b   = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col }));
  const side = i%2===0 ? -1 : 1;
  const baseZ = -(rng(i*8+500) * POOL_SPAN);
  b.position.set(side * (3.0 + rng(i*2+500) * 16), sz*0.4, baseZ);
  b.rotation.set(rng(i+500)*5, rng(i*2+500)*5, rng(i*3+500)*5);
  b.visible = false;
  scene.add(b);
  beachPooledObjects.push({ mesh: b, z: baseZ });
}

// ─── WORLD TRACKER ────────────────────────────────────────────────────────────
let _currentWorld = 0; // 0=mountains, 1=beach — set each frame in updateDayNight

function scrollWorld(dt) {
  const step = SCROLL_SPD * dt / 1000;
  const isMtn   = (_currentWorld === 0);
  const isBeach = (_currentWorld === 1);
  pooledObjects.forEach(o => {
    o.z += step;
    if (o.z > 22) o.z -= POOL_SPAN;
    o.mesh.position.z = o.z;
    o.mesh.visible = isMtn;
  });
  beachPooledObjects.forEach(o => {
    o.z += step;
    if (o.z > 22) o.z -= POOL_SPAN;
    o.mesh.position.z = o.z;
    o.mesh.visible = isBeach;
  });
}

// ─── MOUNTAIN APPROACH CYCLE ─────────────────────────────────────────────────
// 5-min cycle: mountains grow from tiny → huge → pass through → reset
const MTN_CYCLE_MS = 5 * 60 * 1000;

function getMtnState(elapsedMs) {
  const cycleNum = Math.floor(elapsedMs / MTN_CYCLE_MS);
  const progress = (elapsedMs % MTN_CYCLE_MS) / MTN_CYCLE_MS; // 0..1, loops
  const world    = cycleNum % 2; // 0=mountains, 1=beach — alternates each cycle
  // 0→88%: approach   88→100%: pass-through transition
  const ap    = Math.min(progress / 0.88, 1.0);
  const eased = ap * ap * (3.0 - 2.0 * ap); // smoothstep — slow start, fast arrival
  return {
    world,
    scale:     0.04 + eased * 1.10,  // tiny dot on horizon → looming huge
    zOffset:   eased * 168,          // group moves -155 → +13 (past camera)
    passPhase: progress > 0.88 ? (progress - 0.88) / 0.12 : 0,
  };
}

// ─── DAY/NIGHT UPDATE ─────────────────────────────────────────────────────────
let _lastLabel = '';
function updateDayNight(nowMs) {
  const pd = getCycleState(nowMs);

  // Sky shader uniforms
  skyUniforms.uZenith.value.copy(pd.zenith);
  skyUniforms.uMidSky.value.copy(pd.midSky);
  skyUniforms.uHorizon.value.copy(pd.horizon);
  skyUniforms.uGlow.value.copy(pd.glow);
  skyUniforms.uSunVisible.value = pd.sunVisible ? 1.0 : 0.0;

  // Sun disk
  const sp = pd.sunPos;
  sunGroup.position.set(sp.x, sp.y, sp.z);
  sunGroup.visible = pd.sunVisible;
  sunGroup.lookAt(0, 0, 20); // face roughly toward camera
  sunCore.material.color.copy(pd.sunDiskColor);
  skyUniforms.uSunDir.value.set(sp.x, sp.y, sp.z).normalize();

  // Moon
  moonGroup.visible = pd.moonVisible;
  if (pd.moonVisible) {
    moonGroup.position.set(pd.moonPos.x, pd.moonPos.y, pd.moonPos.z);
    moonGroup.lookAt(0, 0, 20);
  }

  // Stars
  if (window._starMat) window._starMat.opacity = pd.starAlpha;

  // Fog
  scene.fog.color.copy(pd.fogColor);
  scene.fog.near = pd.fogNear;
  scene.fog.far  = pd.fogFar;

  // Lights
  ambientLight.color.copy(pd.ambColor);
  ambientLight.intensity = pd.ambInt;
  sunLight.color.copy(pd.sunLColor);
  sunLight.intensity = pd.sunLInt;
  sunLight.position.set(sp.x * 0.6, sp.y * 0.6 + 4, -80);

  // World approach cycle — mountains (world 0) or beach/ocean (world 1)
  const { world, scale: mtnScale, zOffset: mtnZOff, passPhase } = getMtnState(pd.elapsed);
  _currentWorld = world;

  // Show/hide world-specific objects
  const isMtn   = (world === 0);
  const isBeach = (world === 1);
  goalMtnGroup.visible   = isMtn;
  beachOceanGroup.visible = isBeach;
  bgMountains.forEach(({ mesh }) => { mesh.visible = isMtn; });
  groundMesh.visible     = isMtn;
  sandGroundMesh.visible = isBeach;

  if (isMtn) {
    // Restore default camera range for mountains
    if (camera.far !== 320) { camera.far = 320; camera.updateProjectionMatrix(); }
    // Mountains: scale + parallax
    goalMtnGroup.scale.setScalar(mtnScale);
    goalMtnGroup.position.z = -155 + mtnZOff;
    bgMountains.forEach(({ mesh, homeZ }) => {
      mesh.scale.setScalar(mtnScale * 0.85);
      mesh.position.z = homeZ + mtnZOff * 0.52;
    });
  } else {
    // Same approach logic as mountains: scale 0.04→1.10, same z travel
    if (camera.far !== 320) { camera.far = 320; camera.updateProjectionMatrix(); }
    beachOceanGroup.scale.setScalar(mtnScale);     // tiny dot → full ocean
    beachOceanGroup.position.z = -155 + mtnZOff;  // -155 → +13, same as mountains

    // Ocean atmosphere fog: blue haze, extended range for hazy horizon effect
    scene.fog.near = 40;
    scene.fog.far  = 350;
    scene.fog.color.set(0x78c8e8);
  }

  // Pass-through: rock cave darkness OR deep-ocean blue immersion
  if (passPhase > 0) {
    const pa        = Math.sin(passPhase * Math.PI);
    const throughCol = isMtn ? 0x160602 : 0x041428;
    scene.fog.near  = Math.max(4,  scene.fog.near  * (1 - pa * 0.62));
    scene.fog.far   = Math.max(15, scene.fog.far   * (1 - pa * 0.50));
    scene.fog.color.lerp(new THREE.Color(throughCol), pa * 0.78);
  }

  // Time-of-day badge
  if (pd.label !== _lastLabel) {
    _lastLabel = pd.label;
    const el = document.getElementById('timeOfDay');
    if (el) el.textContent = pd.label;
  }
}

// ─── CHARACTER POSITIONING ───────────────────────────────────────────────────
const FRONT_Z   = -30;
const BACK_Z    = -4;
const MIN_GAP   = 2.2;
const EXTRA_GAP = 6;

const LANES      = [-1.9, -0.85, 0, 0.85, 1.9];
const LANE_ORDER = [2, 0, 4, 1, 3];

const playerLanes = new Map();

function positionCharacters() {
  if (players.length === 0) return;

  const rawZ = [];
  let prevZ  = FRONT_Z;

  players.forEach((player, index) => {
    if (index === 0) {
      rawZ.push(FRONT_Z);
    } else {
      const coinDiff     = Math.max(0, players[index - 1].distance - player.distance);
      const leaderCoins  = Math.max(1, players[0].distance);
      const proportional = Math.sqrt(coinDiff / leaderCoins) * EXTRA_GAP;
      const z            = prevZ + MIN_GAP + proportional;
      rawZ.push(z);
      prevZ = z;
    }
  });

  const lastZ   = rawZ[rawZ.length - 1];
  const maxSpan = BACK_Z - FRONT_Z;
  const rawSpan = lastZ - FRONT_Z;

  players.forEach((player, index) => {
    const char = characters.get(player.playerId);
    if (!char) return;
    const scaledZ = rawSpan > maxSpan
      ? FRONT_Z + ((rawZ[index] - FRONT_Z) / rawSpan) * maxSpan
      : rawZ[index];
    char.targetZ = scaledZ;
    if (!playerLanes.has(player.playerId)) {
      const laneIdx = LANE_ORDER[index % LANE_ORDER.length];
      playerLanes.set(player.playerId, LANES[laneIdx] + (Math.random() - 0.5) * 0.25);
    }
    char.targetX = playerLanes.get(player.playerId);
  });
}

// ─── PLAYERS & WEBSOCKET ─────────────────────────────────────────────────────
let characters   = new Map();
let players      = [];
let totalPlayers = 0;

GameWebSocket.on('init',   d => applyUpdate(d.players, d.totalPlayers));
GameWebSocket.on('update', d => {
  applyUpdate(d.players, d.totalPlayers);
  if (d.event?.type === 'donation') updateProgressUI(d.players);
});

function applyUpdate(newPlayers, total) {
  players      = newPlayers;
  totalPlayers = total;

  document.getElementById('playerCountNum').textContent = total;
  Leaderboard.update(players, total);
  updateProgressUI(players);

  const topIds = new Set(players.map(p => p.playerId));
  characters.forEach((c, id) => {
    if (!topIds.has(id)) { c.remove(); characters.delete(id); playerLanes.delete(id); }
  });

  players.forEach((player, index) => {
    if (!characters.has(player.playerId)) {
      const c = new Character3D(player, index, scene);
      c.group.position.set(LANES[index % LANES.length], 0, FRONT_Z + 30);
      characters.set(player.playerId, c);
    } else {
      characters.get(player.playerId).updatePlayer(player);
    }
  });

  positionCharacters();
}

const GOAL_COINS = 1000;
function updateProgressUI(pl) {
  if (!pl?.length) return;
  const pct = Math.min((pl[0].totalCoins / GOAL_COINS) * 100, 100);
  document.getElementById('progressPct').textContent      = pct.toFixed(2) + '%';
  document.getElementById('progressBarInner').style.width = pct + '%';
}

// ─── 2D NICKNAME OVERLAY ──────────────────────────────────────────────────────
const nameCanvas = document.getElementById('nameCanvas');
const nameCtx    = nameCanvas.getContext('2d');
const _tmpVec    = new THREE.Vector3();

function drawNicknames() {
  nameCtx.clearRect(0, 0, 1920, 1080);
  const labels = [];

  characters.forEach(char => {
    char.group.getWorldPosition(_tmpVec);
    _tmpVec.y += 3.5;
    const ndc = _tmpVec.clone().project(camera);
    if (ndc.z > 1) return;
    if (ndc.x < -2 || ndc.x > 2) return;

    // Raw screen position of the character's head — used for the dot & line
    const anchorX = (ndc.x  + 1) / 2 * 1920;
    const anchorY = (-ndc.y + 1) / 2 * 1080;

    const dist     = camera.position.distanceTo(_tmpVec);
    const fontSize = Math.round(Math.max(15, Math.min(36, 680 / dist)));
    const name     = char.player.username;
    const color    = '#' + SHIRT_COLORS[char.colorIndex % SHIRT_COLORS.length].toString(16).padStart(6, '0');

    nameCtx.font = `bold ${fontSize}px Arial`;
    const tw = nameCtx.measureText(name).width + 8;
    const th = fontSize + 6;
    const MARGIN = 12;
    // Label starts above the anchor; clamped inside screen
    let sx = Math.max(MARGIN + tw/2, Math.min(1920 - MARGIN - tw/2, anchorX));
    let sy = Math.max(MARGIN + th/2, Math.min(1080 - MARGIN - th/2, anchorY));
    labels.push({ sx, sy, tw, th, fontSize, name, color, anchorX, anchorY });
  });

  // Separate overlapping labels — push both horizontally AND vertically
  const PAD = 8;
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j];
        const ox = (a.tw + b.tw) / 2 + PAD - Math.abs(a.sx - b.sx);
        const oy = (a.th + b.th) / 2 + PAD - Math.abs(a.sy - b.sy);
        if (ox > 0 && oy > 0) {
          if (oy <= ox) {
            const p = oy / 2 + 1;
            if (a.sy <= b.sy) { a.sy -= p; b.sy += p; }
            else              { a.sy += p; b.sy -= p; }
          } else {
            const p = ox / 2 + 1;
            if (a.sx <= b.sx) { a.sx -= p; b.sx += p; }
            else              { a.sx += p; b.sx -= p; }
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  labels.forEach(({ sx, sy, tw, th, fontSize, name, color, anchorX, anchorY }) => {
    const MARGIN = 12;
    sx = Math.max(MARGIN + tw/2, Math.min(1920 - MARGIN - tw/2, sx));
    sy = Math.max(MARGIN + th/2, Math.min(1080 - MARGIN - th/2, sy));

    const lineDist = Math.hypot(sx - anchorX, sy - anchorY);

    // ── Dot at character head ─────────────────────────────────────────────────
    nameCtx.save();
    nameCtx.shadowColor = color;
    nameCtx.shadowBlur  = 8;
    nameCtx.fillStyle   = color;
    nameCtx.beginPath();
    nameCtx.arc(anchorX, anchorY, 5, 0, Math.PI * 2);
    nameCtx.fill();
    // White center of dot
    nameCtx.shadowBlur  = 0;
    nameCtx.fillStyle   = '#ffffff';
    nameCtx.beginPath();
    nameCtx.arc(anchorX, anchorY, 2, 0, Math.PI * 2);
    nameCtx.fill();
    nameCtx.restore();

    // ── Dashed line from label bottom to dot ─────────────────────────────────
    if (lineDist > 12) {
      // Line end-point stops just before the dot
      const ratio = (lineDist - 7) / lineDist;
      const lineEndX = anchorX + (sx - anchorX) * (1 - ratio);
      const lineEndY = anchorY + (sy - anchorY) * (1 - ratio);

      nameCtx.save();
      nameCtx.strokeStyle  = color;
      nameCtx.lineWidth    = 1.8;
      nameCtx.globalAlpha  = 0.70;
      nameCtx.setLineDash([5, 5]);
      nameCtx.beginPath();
      nameCtx.moveTo(sx, sy + th / 2);
      nameCtx.lineTo(lineEndX, lineEndY);
      nameCtx.stroke();
      nameCtx.setLineDash([]);
      nameCtx.restore();
    }

    // ── Text: thick dark outline + colored fill ───────────────────────────────
    nameCtx.font          = `bold ${fontSize}px Arial`;
    nameCtx.textAlign     = 'center';
    nameCtx.textBaseline  = 'middle';
    nameCtx.lineJoin      = 'round';
    nameCtx.strokeStyle   = 'rgba(0,0,0,0.96)';
    nameCtx.lineWidth     = fontSize * 0.30;
    nameCtx.strokeText(name, sx, sy);
    nameCtx.fillStyle     = color;
    nameCtx.fillText(name, sx, sy);
  });
}

function _pill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── TIME SPEED (for testing) ─────────────────────────────────────────────────
const TIME_SPEEDS   = [1, 10, 60, 300];
let   timeSpeedIdx  = 0;
let   scaledElapsedMs = 0;

document.addEventListener('keydown', e => {
  if (e.key === 'T' || e.key === 't') {
    timeSpeedIdx = (timeSpeedIdx + 1) % TIME_SPEEDS.length;
    const speed = TIME_SPEEDS[timeSpeedIdx];
    const el = document.getElementById('timeSpeedBadge');
    if (el) {
      el.textContent = speed === 1 ? '⏱ 1× (real time)' : `⚡ ${speed}× speed`;
      el.style.display = 'block';
      el.style.color   = speed === 1 ? '#AAA' : speed < 100 ? '#FFD700' : '#FF4444';
      el.style.borderColor = el.style.color;
    }
  }
});

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
let lastTime = 0;

function gameLoop(ts) {
  const dt = Math.min(ts - lastTime, 50);
  lastTime = ts;

  scaledElapsedMs += dt * TIME_SPEEDS[timeSpeedIdx];

  // Animate ocean water shader
  if (window._beachWaterUniforms) window._beachWaterUniforms.uTime.value += dt * 0.0014;

  scrollWorld(dt);
  updateDayNight(gameStartMs + scaledElapsedMs);

  camera.position.x = -2 + Math.sin(ts * 0.00022) * 0.30;
  camera.position.y =  9 + Math.sin(ts * 0.00017) * 0.18;
  // Look slightly higher as the mountain looms — dramatic approach feel
  const _ms = getMtnState(scaledElapsedMs);
  camera.lookAt(0, 2 + _ms.scale * 2.8, -16);

  characters.forEach(c => c.update(dt));

  renderer.render(scene, camera);
  drawNicknames();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
