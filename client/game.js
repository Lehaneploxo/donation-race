// ─── Renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('gameCanvas'),
  antialias: true
});
renderer.setSize(1080, 1920);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ─── Scene ───────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffcc88, 60, 180); // updated dynamically

// ─── CAMERA ──────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(75, 1080 / 1920, 0.1, 320);
camera.position.set(0, 10, 18);
camera.lookAt(0, 2, -10);

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
    sunDiskColor:new THREE.Color(0xFFD700),
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

        // Sun sparkle on moving crests (subtle)
        float spark = pow(clamp(vHeight * 0.38 + 0.15, 0.0, 1.0), 14.0) * 0.18;
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
const SCROLL_SPD = 8.4;
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

// ─── SEA WORLD OBJECTS ───────────────────────────────────────────────────────
const seaPooledObjects = [];

// Sea water ground — deep ocean blue
const seaGroundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 500),
  new THREE.MeshLambertMaterial({ color: 0x083a6c })
);
seaGroundMesh.rotation.x = -Math.PI / 2;
seaGroundMesh.position.set(0, -0.1, -180);
seaGroundMesh.receiveShadow = false;
seaGroundMesh.visible = false;
scene.add(seaGroundMesh);

// Sea trail — dark teal wake
const seaTrailMeshes = [];
[
  { w: 5.2, color: 0x0a4a7a, y: 0.005 },
  { w: 1.8, color: 0x0e6090, y: 0.010 },
].forEach(({ w, color, y }) => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, 500),
    new THREE.MeshLambertMaterial({ color })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, y, -180);
  m.visible = false;
  scene.add(m);
  seaTrailMeshes.push(m);
});

// Sea bridge — wooden bridge over the water
const seaBridgeGroup = new THREE.Group();
(function buildSeaBridge() {
  const bridgeLen = 500;
  const bridgeW   = 5.6;
  const plankH    = 0.18;

  // Main deck — dark weathered planks
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(bridgeW, plankH, bridgeLen),
    new THREE.MeshLambertMaterial({ color: 0x6b4c2a, flatShading: true })
  );
  deck.position.set(0, 0.12, 0);
  seaBridgeGroup.add(deck);

  // Plank lines across the bridge for detail
  for (let i = 0; i < 80; i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(bridgeW + 0.1, plankH + 0.04, 0.22),
      new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? 0x5a3e1e : 0x7a5530 })
    );
    plank.position.set(0, 0.16, -250 + i * 6.4);
    seaBridgeGroup.add(plank);
  }

  // Left railing posts
  for (let i = 0; i < 50; i++) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.2, 0.16),
      new THREE.MeshLambertMaterial({ color: 0x4a2e10 })
    );
    post.position.set(-bridgeW / 2 + 0.1, 0.72, -245 + i * 10);
    seaBridgeGroup.add(post);
  }
  // Right railing posts
  for (let i = 0; i < 50; i++) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.2, 0.16),
      new THREE.MeshLambertMaterial({ color: 0x4a2e10 })
    );
    post.position.set(bridgeW / 2 - 0.1, 0.72, -245 + i * 10);
    seaBridgeGroup.add(post);
  }
  // Left top rail
  const railL = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, bridgeLen),
    new THREE.MeshLambertMaterial({ color: 0x3a2210 })
  );
  railL.position.set(-bridgeW / 2 + 0.1, 1.28, 0);
  seaBridgeGroup.add(railL);
  // Right top rail
  const railR = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, bridgeLen),
    new THREE.MeshLambertMaterial({ color: 0x3a2210 })
  );
  railR.position.set(bridgeW / 2 - 0.1, 1.28, 0);
  seaBridgeGroup.add(railR);

  // Bridge support pillars (go down into water)
  for (let i = 0; i < 20; i++) {
    const zPos = -240 + i * 25;
    [-bridgeW / 2 + 0.3, bridgeW / 2 - 0.3].forEach(xPos => {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.35, 5.0, 7),
        new THREE.MeshLambertMaterial({ color: 0x887766, flatShading: true })
      );
      pillar.position.set(xPos, -2.3, zPos);
      seaBridgeGroup.add(pillar);
    });
    // Cross beam under deck
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(bridgeW + 0.5, 0.25, 0.35),
      new THREE.MeshLambertMaterial({ color: 0x5a4420 })
    );
    beam.position.set(0, -0.1, zPos);
    seaBridgeGroup.add(beam);
  }

  // Rope chains on sides (hanging arc segments)
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 49; i++) {
      const z0 = -245 + i * 10;
      const z1 = -245 + (i + 1) * 10;
      const sag = 0.28; // chain sag amount
      const chainSeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 10.2, 4),
        new THREE.MeshLambertMaterial({ color: 0x444444 })
      );
      chainSeg.position.set(side * (bridgeW / 2 - 0.1), 1.2 - sag, (z0 + z1) / 2);
      chainSeg.rotation.x = Math.PI / 2;
      seaBridgeGroup.add(chainSeg);
    }
  }
})();
seaBridgeGroup.position.set(0, 0, -180);
seaBridgeGroup.visible = false;
scene.add(seaBridgeGroup);

function makeShip(x, z, sc, seed) {
  const _r = s => { const v = Math.sin(s * 127.1 + 13.7) * 43758.5; return v - Math.floor(v); };
  const g = new THREE.Group();
  // Hull
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(sc * 1.2, sc * 0.5, sc * 4.0),
    new THREE.MeshLambertMaterial({ color: 0x4a2c0a, flatShading: true })
  );
  hull.position.set(0, sc * 0.25, 0);
  g.add(hull);
  // Hull sides (lighter wood stripe)
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(sc * 1.22, sc * 0.12, sc * 4.02),
    new THREE.MeshLambertMaterial({ color: 0x7a5020, flatShading: true })
  );
  stripe.position.set(0, sc * 0.42, 0);
  g.add(stripe);
  // Mast
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(sc * 0.05, sc * 0.07, sc * 5.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a3a10 })
  );
  mast.position.set(0, sc * 3.25, 0);
  g.add(mast);
  // Main sail
  const sailVerts = new Float32Array([
    0, 0, -sc * 1.6,
    0, sc * 4.5, 0,
    0, 0,  sc * 1.6,
  ]);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute(sailVerts, 3));
  sailGeo.setIndex([0, 1, 2]);
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo,
    new THREE.MeshLambertMaterial({ color: 0xf0e8d0, side: THREE.DoubleSide, flatShading: true }));
  sail.position.set(sc * 0.6, sc * 0.7, 0);
  g.add(sail);
  // Flag
  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(sc * 0.6, sc * 0.3, sc * 0.04),
    new THREE.MeshLambertMaterial({ color: _r(seed) > 0.5 ? 0xcc2200 : 0x002288 })
  );
  flag.position.set(sc * 0.3, sc * 5.8, 0);
  g.add(flag);
  g.position.set(x, 0, z);
  return g;
}

function makeWhale(x, z, sc, seed) {
  const g = new THREE.Group();
  // Body — elongated sphere
  const bodyGeo = new THREE.SphereGeometry(sc, 10, 7);
  const bodyPos = bodyGeo.attributes.position;
  for (let vi = 0; vi < bodyPos.count; vi++) {
    bodyPos.setZ(vi, bodyPos.getZ(vi) * 3.5);
    bodyPos.setX(vi, bodyPos.getX(vi) * 0.7);
  }
  bodyPos.needsUpdate = true; bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo,
    new THREE.MeshLambertMaterial({ color: 0x1a2a3a, flatShading: true }));
  body.position.set(0, sc * 0.3, 0);
  g.add(body);
  // Belly (lighter underbelly)
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(sc * 0.55, 8, 5),
    new THREE.MeshLambertMaterial({ color: 0x8898a8, flatShading: true })
  );
  belly.scale.set(0.9, 0.5, 2.8);
  belly.position.set(0, sc * 0.1, 0);
  g.add(belly);
  // Dorsal fin
  const finVerts = new Float32Array([
    0, 0, -sc * 0.2,
    sc * 0.5, sc * 1.2, 0,
    0, 0,  sc * 0.2,
  ]);
  const finGeo = new THREE.BufferGeometry();
  finGeo.setAttribute('position', new THREE.Float32BufferAttribute(finVerts, 3));
  finGeo.setIndex([0, 1, 2]);
  finGeo.computeVertexNormals();
  const fin = new THREE.Mesh(finGeo,
    new THREE.MeshLambertMaterial({ color: 0x111e28, side: THREE.DoubleSide }));
  fin.position.set(0, sc * 0.9, -sc * 0.5);
  g.add(fin);
  // Tail flukes
  [-1, 1].forEach(side => {
    const flukeVerts = new Float32Array([
      0, 0, 0,
      side * sc * 1.4, -sc * 0.3, sc * 0.2,
      side * sc * 1.4, -sc * 0.3, -sc * 0.2,
    ]);
    const flukeGeo = new THREE.BufferGeometry();
    flukeGeo.setAttribute('position', new THREE.Float32BufferAttribute(flukeVerts, 3));
    flukeGeo.setIndex([0, 1, 2]);
    flukeGeo.computeVertexNormals();
    const fluke = new THREE.Mesh(flukeGeo,
      new THREE.MeshLambertMaterial({ color: 0x1a2a3a, side: THREE.DoubleSide }));
    fluke.position.set(0, sc * 0.3, sc * 3.2);
    g.add(fluke);
  });
  g.position.set(x, 0, z);
  return g;
}

// Sea island goal group (players swim toward an island)
const seaIslandGroup = new THREE.Group();
(function buildSeaIsland() {
  // Island base — flat sandy mound
  const islandGeo = new THREE.CylinderGeometry(18, 22, 3, 12);
  const island = new THREE.Mesh(islandGeo,
    new THREE.MeshLambertMaterial({ color: 0xd4aa60, flatShading: true }));
  island.position.set(0, -1, 0);
  seaIslandGroup.add(island);
  // Grassy top
  const grassGeo = new THREE.CylinderGeometry(12, 18, 1.5, 12);
  const grass = new THREE.Mesh(grassGeo,
    new THREE.MeshLambertMaterial({ color: 0x3a7020, flatShading: true }));
  grass.position.set(0, 1.5, 0);
  seaIslandGroup.add(grass);
  // Palm tree on island
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.8, 14, 7),
    new THREE.MeshLambertMaterial({ color: 0x7c5c12 })
  );
  trunk.position.set(2, 9, 0);
  trunk.rotation.z = 0.2;
  seaIslandGroup.add(trunk);
  // Palm crown leaves
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.2, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a7018 })
    );
    leaf.position.set(2 + Math.cos(angle) * 3, 15, Math.sin(angle) * 3);
    leaf.rotation.y = angle;
    leaf.rotation.z = -0.4;
    seaIslandGroup.add(leaf);
  }
  // Lighthouse
  const ltBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 2.0, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8e8e8, flatShading: true })
  );
  ltBase.position.set(-4, 7, 2);
  seaIslandGroup.add(ltBase);
  // Red stripes
  [2, 5, 8].forEach(h => {
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(1.52, 1.82 - h * 0.03, 1.2, 8),
      new THREE.MeshLambertMaterial({ color: 0xcc2200 })
    );
    stripe.position.set(-4, h + 0.8, 2);
    seaIslandGroup.add(stripe);
  });
  // Light dome
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffee88 })
  );
  dome.position.set(-4, 13, 2);
  seaIslandGroup.add(dome);
})();
seaIslandGroup.position.set(0, 0, -155);
seaIslandGroup.visible = false;
scene.add(seaIslandGroup);

// Ships — left side
for (let i = 0; i < 14; i++) {
  const baseZ = -(rng(i * 7 + 600) * POOL_SPAN);
  const ship = makeShip(
    -(10 + rng(i * 3 + 600) * 35),
    baseZ,
    1.2 + rng(i * 11 + 600) * 1.4,
    i
  );
  ship.visible = false;
  scene.add(ship);
  seaPooledObjects.push({ mesh: ship, z: baseZ });
}
// Whales — right side
for (let i = 0; i < 12; i++) {
  const baseZ = -(rng(i * 7 + 700) * POOL_SPAN);
  const whale = makeWhale(
    10 + rng(i * 3 + 700) * 35,
    baseZ,
    1.0 + rng(i * 5 + 700) * 0.8,
    i
  );
  whale.visible = false;
  scene.add(whale);
  seaPooledObjects.push({ mesh: whale, z: baseZ });
}

// Player boats — one per possible player slot (10 max)
const playerBoatPool = [];
for (let i = 0; i < 10; i++) {
  const boat = new THREE.Group();
  // Hull
  const bHull = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.25, 1.4),
    new THREE.MeshLambertMaterial({ color: 0x5a3010, flatShading: true })
  );
  bHull.position.y = 0.12;
  boat.add(bHull);
  // Rim
  const bRim = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.08, 1.42),
    new THREE.MeshLambertMaterial({ color: 0x8a5028, flatShading: true })
  );
  bRim.position.y = 0.26;
  boat.add(bRim);
  // Tiny mast
  const bMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 1.4, 5),
    new THREE.MeshLambertMaterial({ color: 0x4a2808 })
  );
  bMast.position.set(0, 0.95, -0.1);
  boat.add(bMast);
  // Tiny sail
  const bSailVerts = new Float32Array([
    0.04, 0.0, -0.45,
    0.04, 1.2, 0,
    0.04, 0.0, 0.45,
  ]);
  const bSailGeo = new THREE.BufferGeometry();
  bSailGeo.setAttribute('position', new THREE.Float32BufferAttribute(bSailVerts, 3));
  bSailGeo.setIndex([0, 1, 2]);
  bSailGeo.computeVertexNormals();
  const bSail = new THREE.Mesh(bSailGeo,
    new THREE.MeshLambertMaterial({ color: 0xf8f0e0, side: THREE.DoubleSide }));
  bSail.position.set(0, 0.25, -0.1);
  boat.add(bSail);

  boat.visible = false;
  scene.add(boat);
  playerBoatPool.push(boat);
}

// ─── CITY WORLD (WORLD 3) ─────────────────────────────────────────────────────
const cityPooledObjects = [];

// City asphalt ground
const cityGroundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 500),
  new THREE.MeshLambertMaterial({ color: 0x2a2a2e })
);
cityGroundMesh.rotation.x = -Math.PI / 2;
cityGroundMesh.position.set(0, -0.02, -180);
cityGroundMesh.receiveShadow = true;
cityGroundMesh.visible = false;
scene.add(cityGroundMesh);

// Sidewalks (light grey strips each side of road)
[-4.8, 4.8].forEach(sx => {
  const sw = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 500),
    new THREE.MeshLambertMaterial({ color: 0x888890 })
  );
  sw.rotation.x = -Math.PI / 2;
  sw.position.set(sx, 0.01, -180);
  sw.visible = false;
  scene.add(sw);
  cityPooledObjects._sidewalks = cityPooledObjects._sidewalks || [];
  cityPooledObjects._sidewalks.push(sw);
});

// Road markings — white centre dashes
const cityRoadMarkings = [];
for (let i = 0; i < 50; i++) {
  const dash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 3.5),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  dash.rotation.x = -Math.PI / 2;
  dash.position.set(0, 0.015, -10 - i * 9.5);
  dash.visible = false;
  scene.add(dash);
  cityRoadMarkings.push(dash);
}
// Yellow centre line pair
[-0.28, 0.28].forEach(lx => {
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(0.10, 500),
    new THREE.MeshLambertMaterial({ color: 0xffcc00 })
  );
  line.rotation.x = -Math.PI / 2;
  line.position.set(lx, 0.013, -180);
  line.visible = false;
  scene.add(line);
  cityRoadMarkings.push(line);
});

const _rC = s => { const x = Math.sin(s * 91.7 + 37.3) * 43758.5; return x - Math.floor(x); };

function makeBuilding(x, z, width, height, depth, type, seed) {
  const g = new THREE.Group();

  let wallColor, accentColor, windowColor;
  if (type === 'skyscraper') {
    wallColor   = new THREE.Color(0x1a2a3a).lerp(new THREE.Color(0x2a3a5a), _rC(seed));
    accentColor = 0x4488cc;
    windowColor = _rC(seed * 3) > 0.5 ? 0x88ccff : 0xaaddff;
  } else if (type === 'office') {
    wallColor   = new THREE.Color(0x7a7068).lerp(new THREE.Color(0x8a8078), _rC(seed));
    accentColor = 0xaaaaaa;
    windowColor = _rC(seed * 7) > 0.5 ? 0xddeecc : 0xccddbb;
  } else if (type === 'cafe') {
    wallColor   = new THREE.Color(0xc07840).lerp(new THREE.Color(0xb86830), _rC(seed));
    accentColor = _rC(seed) > 0.5 ? 0xcc3322 : 0x228844;
    windowColor = 0xfff8e8;
  } else { // residential
    const resColors = [0xc8b090, 0xb09878, 0xe0c8a0, 0x9a8870, 0xd0b888, 0xa89070];
    wallColor   = new THREE.Color(resColors[Math.floor(_rC(seed) * resColors.length)]);
    accentColor = 0x888070;
    windowColor = 0xd8e8f0;
  }

  // Main body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color: wallColor, flatShading: true })
  );
  body.position.set(0, height / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Roof detail
  if (type === 'skyscraper') {
    // Glass top crown
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.7, height * 0.08, depth * 0.7),
      new THREE.MeshLambertMaterial({ color: accentColor })
    );
    crown.position.set(0, height + height * 0.04, 0);
    g.add(crown);
    // Antenna
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, height * 0.12, 5),
      new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
    );
    antenna.position.set(0, height + height * 0.14, 0);
    g.add(antenna);
  } else if (type === 'residential') {
    // Pitched roof
    const roofGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.72, height * 0.22, 4);
    const roof = new THREE.Mesh(roofGeo,
      new THREE.MeshLambertMaterial({ color: 0x883322, flatShading: true }));
    roof.position.set(0, height + height * 0.11, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
  } else {
    // Flat roof parapet
    const parapet = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.3, height * 0.04, depth + 0.3),
      new THREE.MeshLambertMaterial({ color: accentColor })
    );
    parapet.position.set(0, height + height * 0.02, 0);
    g.add(parapet);
  }

  // Windows grid
  const wRows = Math.max(1, Math.floor(height / 3.5));
  const wCols = Math.max(1, Math.floor(width / 2.2));
  const wW = Math.min(1.1, width / wCols * 0.52);
  const wH = Math.min(1.6, height / wRows * 0.52);
  const wSpX = width  / wCols;
  const wSpY = height / wRows;

  for (let row = 0; row < wRows; row++) {
    for (let col = 0; col < wCols; col++) {
      const lit = _rC(seed + row * 13 + col * 7) > 0.25;
      if (!lit) continue;
      const wx = -width / 2 + wSpX * (col + 0.5);
      const wy = wSpY * (row + 0.5) + wSpY * 0.2;
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(wW, wH),
        new THREE.MeshBasicMaterial({ color: windowColor })
      );
      win.position.set(wx, wy, depth / 2 + 0.06);
      g.add(win);
      // Back windows too
      const winB = win.clone();
      winB.position.z = -depth / 2 - 0.06;
      winB.rotation.y = Math.PI;
      g.add(winB);
    }
  }

  // Ground floor — cafe/shop signage strip
  if (type === 'cafe' || (type === 'residential' && _rC(seed * 9) > 0.6)) {
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.2, 0.15, 1.2),
      new THREE.MeshLambertMaterial({ color: accentColor })
    );
    awning.position.set(0, 3.2, depth / 2 + 0.4);
    g.add(awning);
    // Shop sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.65, 0.9, 0.12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(accentColor).multiplyScalar(1.4) })
    );
    sign.position.set(0, 2.2, depth / 2 + 0.12);
    g.add(sign);
  }

  g.position.set(x, 0, z);
  return g;
}

function makeStreetLight(x, z) {
  const g = new THREE.Group();
  // Pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.1, 8.0, 6),
    new THREE.MeshLambertMaterial({ color: 0x555560 })
  );
  pole.position.y = 4.0;
  g.add(pole);
  // Arm
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.5, 5),
    new THREE.MeshLambertMaterial({ color: 0x555560 })
  );
  arm.rotation.z = Math.PI / 2;
  arm.position.set(1.0, 7.8, 0);
  g.add(arm);
  // Lamp head
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.32, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x333340 })
  );
  lamp.position.set(1.5, 7.7, 0);
  g.add(lamp);
  // Lamp glow
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.25),
    new THREE.MeshBasicMaterial({ color: 0xffee99 })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(1.5, 7.55, 0);
  g.add(glow);
  g.position.set(x, 0, z);
  return g;
}

// Generate city buildings — densely packed both sides
const CITY_SPAN = 220;
let cityBuildingSeed = 1000;

// Close buildings (shops, cafes, low-rise) — immediately beside sidewalk
for (let i = 0; i < 28; i++) {
  const baseZ = -(i / 28) * CITY_SPAN;
  const types = ['cafe', 'residential', 'cafe', 'office', 'residential'];
  const t = types[i % types.length];
  const h  = t === 'cafe' ? 4 + _rC(cityBuildingSeed) * 5
           : t === 'office' ? 12 + _rC(cityBuildingSeed) * 16
           : 8 + _rC(cityBuildingSeed) * 10;
  const w  = 5 + _rC(cityBuildingSeed + 1) * 7;
  const d  = 6 + _rC(cityBuildingSeed + 2) * 6;

  [[-1, 8 + w / 2], [1, 8 + w / 2]].forEach(([side, xOff]) => {
    const bld = makeBuilding(side * xOff, baseZ, w, h, d, t, cityBuildingSeed);
    bld.visible = false;
    scene.add(bld);
    cityPooledObjects.push({ mesh: bld, z: baseZ });
  });
  cityBuildingSeed += 3;
}

// Mid-rise buildings — a bit further back
for (let i = 0; i < 22; i++) {
  const baseZ = -(i / 22) * CITY_SPAN - 5;
  const t = _rC(cityBuildingSeed) > 0.5 ? 'office' : 'residential';
  const h = 18 + _rC(cityBuildingSeed) * 28;
  const w = 8 + _rC(cityBuildingSeed + 1) * 10;
  const d = 8 + _rC(cityBuildingSeed + 2) * 8;

  [[-1, 22 + w / 2], [1, 22 + w / 2]].forEach(([side, xOff]) => {
    const bld = makeBuilding(side * xOff, baseZ, w, h, d, t, cityBuildingSeed);
    bld.visible = false;
    scene.add(bld);
    cityPooledObjects.push({ mesh: bld, z: baseZ });
  });
  cityBuildingSeed += 3;
}

// Skyscrapers — distant background, tall
for (let i = 0; i < 16; i++) {
  const baseZ = -(i / 16) * CITY_SPAN - 8;
  const h = 55 + _rC(cityBuildingSeed) * 90;
  const w = 10 + _rC(cityBuildingSeed + 1) * 14;
  const d = 10 + _rC(cityBuildingSeed + 2) * 12;

  [[-1, 44 + w / 2], [1, 44 + w / 2]].forEach(([side, xOff]) => {
    const bld = makeBuilding(side * xOff, baseZ, w, h, d, 'skyscraper', cityBuildingSeed);
    bld.visible = false;
    scene.add(bld);
    cityPooledObjects.push({ mesh: bld, z: baseZ });
  });
  cityBuildingSeed += 3;
}

// Street lights — alternating sides
for (let i = 0; i < 50; i++) {
  const baseZ = -(i / 50) * CITY_SPAN;
  const side = i % 2 === 0 ? -6.8 : 6.8;
  const sl = makeStreetLight(side, baseZ);
  sl.visible = false;
  scene.add(sl);
  cityPooledObjects.push({ mesh: sl, z: baseZ });
}

// Parked cars (simple boxes with wheels feel) both sides
for (let i = 0; i < 20; i++) {
  const baseZ = -(_rC(i * 7 + 900) * CITY_SPAN);
  const side  = i % 2 === 0 ? -5.8 : 5.8;
  const carColor = [0xcc2222, 0x2244cc, 0x888888, 0x222222, 0xeeeeee, 0x226622][i % 6];
  const car = new THREE.Group();
  // Body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.65, 3.4),
    new THREE.MeshLambertMaterial({ color: carColor, flatShading: true })
  );
  body.position.y = 0.45;
  car.add(body);
  // Cabin
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.55, 1.8),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(carColor).multiplyScalar(0.8), flatShading: true })
  );
  cabin.position.set(0, 0.95, -0.2);
  car.add(cabin);
  // Windows
  ['front', 'back'].forEach((side2, si) => {
    const win = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x88aabb })
    );
    win.position.set(0, 1.0, si === 0 ? 0.72 : -1.1);
    if (si === 1) win.rotation.y = Math.PI;
    car.add(win);
  });
  // Wheels (4)
  [[-0.75, -1.1], [-0.75, 1.1], [0.75, -1.1], [0.75, 1.1]].forEach(([wx, wz]) => {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.22, 8),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.28, wz);
    car.add(wheel);
  });
  car.position.set(side, 0, baseZ);
  car.rotation.y = Math.PI / 2;
  car.visible = false;
  scene.add(car);
  cityPooledObjects.push({ mesh: car, z: baseZ });
}

// City goal — impressive downtown cluster with central skyscraper
const cityGoalGroup = new THREE.Group();
(function buildCityGoal() {
  // Central landmark skyscraper
  const mainH = 160;
  const mainW = 18;
  const main = new THREE.Mesh(
    new THREE.BoxGeometry(mainW, mainH, mainW),
    new THREE.MeshLambertMaterial({ color: 0x1a3050, flatShading: true })
  );
  main.position.set(0, mainH / 2, 0);
  cityGoalGroup.add(main);
  // Glass curtain wall strips
  for (let i = 0; i < 20; i++) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(mainW + 0.3, 1.0, mainW + 0.3),
      new THREE.MeshLambertMaterial({ color: 0x2a4870 })
    );
    strip.position.set(0, i * mainH / 20 + mainH / 40, 0);
    cityGoalGroup.add(strip);
  }
  // Spire
  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 40, 8),
    new THREE.MeshLambertMaterial({ color: 0x88aacc })
  );
  spire.position.set(0, mainH + 20, 0);
  cityGoalGroup.add(spire);
  // Flanking towers
  [[-28, 0.7], [28, 0.75], [-16, 0.55], [16, 0.6]].forEach(([tx, sc2]) => {
    const th = mainH * sc2;
    const tw = mainW * 0.6;
    const t  = new THREE.Mesh(
      new THREE.BoxGeometry(tw, th, tw),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(0x1a3050).lerp(new THREE.Color(0x2a4468), Math.random()), flatShading: true })
    );
    t.position.set(tx, th / 2, 0);
    cityGoalGroup.add(t);
  });
  // Glowing windows on main tower
  for (let row = 0; row < 40; row++) {
    for (let col = 0; col < 4; col++) {
      if (Math.random() > 0.55) {
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(3.2, 1.8),
          new THREE.MeshBasicMaterial({ color: Math.random() > 0.3 ? 0xffee88 : 0x88ccff })
        );
        win.position.set(-mainW / 2 * 0.6 + col * mainW / 3.5, 4 + row * mainH / 42, mainW / 2 + 0.08);
        cityGoalGroup.add(win);
      }
    }
  }
})();
cityGoalGroup.position.set(0, 0, -155);
cityGoalGroup.visible = false;
scene.add(cityGoalGroup);

// ─── MOON WORLD (WORLD 4) ─────────────────────────────────────────────────────
const moonWorldPooled = [];
const moonWorldMeshes = []; // non-pooled static meshes

// Moon surface ground — grey regolith
const moonGroundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 500),
  new THREE.MeshLambertMaterial({ color: 0x888888 })
);
moonGroundMesh.rotation.x = -Math.PI / 2;
moonGroundMesh.position.set(0, -0.02, -180);
moonGroundMesh.receiveShadow = true;
moonGroundMesh.visible = false;
scene.add(moonGroundMesh);

// ── Earth planet ──────────────────────────────────────────────────────────────
const earthGroup = new THREE.Group();
// Ocean base — deep blue
const earthMesh = new THREE.Mesh(
  new THREE.SphereGeometry(18, 32, 32),
  new THREE.MeshLambertMaterial({ color: 0x1a4a8a })
);
earthGroup.add(earthMesh);

// Continents — partial spheres using phi/theta arcs positioned on surface
// Each: [phiStart, phiLen, thetaStart, thetaLen, rotY, rotX, color]
const continentDefs = [
  // Americas (left side)
  [0, Math.PI*2, 0.35, 1.1,  0.8,  0.1,  0x2d8a3e],
  [0, Math.PI*2, 0.5,  0.7, -0.3,  0.2,  0x3a9a45],
  // Europe + Africa (centre-right)
  [0, Math.PI*2, 0.4,  0.9,  2.0, -0.1,  0x2d8a3e],
  [0, Math.PI*2, 0.55, 0.8,  2.2,  0.3,  0x8a7a2e],
  // Asia (right)
  [0, Math.PI*2, 0.3,  1.2,  3.5,  0.0,  0x2d8a3e],
  // Australia
  [0, Math.PI*2, 0.7,  0.5,  4.0,  0.5,  0x9a7a2e],
  // Antarctica
  [0, Math.PI*2, 0.0,  0.25, 0.0,  1.45, 0xdddddd],
];
continentDefs.forEach(([ps, pl, ts, tl, ry, rx, col]) => {
  const cont = new THREE.Mesh(
    new THREE.SphereGeometry(18.08, 20, 16, ps, pl, ts, tl),
    new THREE.MeshLambertMaterial({ color: col, side: THREE.FrontSide })
  );
  cont.rotation.y = ry;
  cont.rotation.x = rx;
  earthGroup.add(cont);
});

// Cloud layer — white wisps
const cloudMesh = new THREE.Mesh(
  new THREE.SphereGeometry(18.55, 28, 28),
  new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
);
earthGroup.add(cloudMesh);

// Atmosphere glow ring
const atmMesh = new THREE.Mesh(
  new THREE.SphereGeometry(19.2, 24, 24),
  new THREE.MeshLambertMaterial({ color: 0x5599ff, transparent: true, opacity: 0.12 })
);
earthGroup.add(atmMesh);

earthGroup.position.set(-38, 55, -150);
earthGroup.visible = false;
scene.add(earthGroup);
moonWorldMeshes.push(earthGroup);

// ── Craters on the ground ─────────────────────────────────────────────────────
const craterMeshes = [];
function makeCrater(x, z, r) {
  // Crater rim ring
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(r, r * 0.18, 8, 20),
    new THREE.MeshLambertMaterial({ color: 0xb0ac9e })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, 0.05, z);
  rim.visible = false;
  scene.add(rim);
  craterMeshes.push(rim);
  moonWorldMeshes.push(rim);

  // Dark crater floor
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(r * 0.82, 14),
    new THREE.MeshLambertMaterial({ color: 0x888480 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(x, 0.01, z);
  floor.visible = false;
  scene.add(floor);
  craterMeshes.push(floor);
  moonWorldMeshes.push(floor);
}

// Place craters across the surface
const craterDefs = [
  [-8, -20, 3.5], [6, -35, 2.2], [-3, -55, 5.0], [10, -70, 1.8],
  [-12, -90, 4.2], [4, -110, 2.8], [-6, -130, 3.0], [9, -145, 6.0],
  [-14, -160, 2.5], [2, -175, 3.8], [-9, -190, 4.5], [11, -210, 2.0],
  [-4, -225, 5.5], [7, -240, 1.5], [-11, -255, 3.2],
];
craterDefs.forEach(([x,z,r]) => makeCrater(x, z, r));

// ── Moon rocks / boulders ─────────────────────────────────────────────────────
const moonRockDefs = [
  [-7,  -15, 0.6], [8,  -28, 0.4], [-4, -48, 0.9], [11, -62, 0.5],
  [-9,  -80, 0.7], [5,  -95, 1.1], [-2,-115, 0.5], [12,-128, 0.8],
  [-6, -142, 0.6], [9, -158, 0.4], [-3,-172, 1.0], [7, -188, 0.6],
];
const MOON_SPAN = 260;
moonRockDefs.forEach(([x, z, s]) => {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(s, 0),
    new THREE.MeshLambertMaterial({ color: 0xaaa89a, flatShading: true })
  );
  rock.position.set(x, s * 0.5, z);
  rock.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
  rock.castShadow = true;
  rock.visible = false;
  scene.add(rock);
  moonWorldPooled.push({ mesh: rock, z: z, baseX: x });
  moonWorldMeshes.push(rock);
});

// ── NASA flags / equipment (static scene dressing) ────────────────────────────
function makeLunarFlag(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6),
    new THREE.MeshLambertMaterial({ color: 0xdddddd })
  );
  pole.position.y = 1.1;
  g.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.55),
    new THREE.MeshLambertMaterial({ color: 0xcc2222, side: THREE.DoubleSide })
  );
  flag.position.set(0.45, 2.05, 0);
  g.add(flag);
  // Stars on flag (simple white dots)
  const starDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.06, 5),
    new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  );
  starDot.position.set(0.15, 2.1, 0.01);
  g.add(starDot);
  g.position.set(x, 0, z);
  g.visible = false;
  scene.add(g);
  moonWorldMeshes.push(g);
  return g;
}
makeLunarFlag(-5, -40);
makeLunarFlag(7, -120);
makeLunarFlag(-8, -200);

// ── Lunar Rovers — right side of road, scroll toward camera like trees ─────────
const lunarRovers = [];
const ROVER_LANE_X = 7.5; // right side, away from player path (~±2)
const ROVER_SPAN   = 80;

function makeLunarRover(startZ) {
  const g = new THREE.Group();

  // Chassis
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.4, 0.9),
    new THREE.MeshLambertMaterial({ color: 0xddcc88 })
  );
  chassis.position.y = 0.55;
  chassis.castShadow = true;
  g.add(chassis);

  // Wheels (4 corners)
  const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.18, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]].forEach(([wx, wz]) => {
    const wh = new THREE.Mesh(wheelGeo, wheelMat);
    wh.rotation.z = Math.PI / 2;
    wh.position.set(wx, 0.22, wz);
    g.add(wh);
  });

  // Solar panels (flat wings)
  [-1.4, 1.4].forEach(px => {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.04, 0.65),
      new THREE.MeshLambertMaterial({ color: 0x3355cc })
    );
    panel.position.set(px, 0.82, 0);
    g.add(panel);
  });

  // Antenna dish
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.05, 0.08, 12),
    new THREE.MeshLambertMaterial({ color: 0xcccccc })
  );
  dish.position.set(0.2, 1.05, 0);
  dish.rotation.z = -0.4;
  g.add(dish);

  // Camera mast
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6),
    new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
  );
  mast.position.set(-0.1, 1.1, 0);
  g.add(mast);

  // Positioned to the RIGHT of the player road, facing forward (along -Z)
  g.position.set(ROVER_LANE_X, 0, startZ);
  g.rotation.y = 0; // face same direction as players
  g.visible = false;
  scene.add(g);
  lunarRovers.push({ group: g, z: startZ });
  moonWorldMeshes.push(g);
  return g;
}

makeLunarRover(-5);
makeLunarRover(-28);
makeLunarRover(-52);
makeLunarRover(-70);

// ── Comets — fly across sky ──────────────────────────────────────────────────
const comets = [];

function makeComet() {
  const g = new THREE.Group();
  // Comet head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0xaaccff), emissiveIntensity: 0.8 })
  );
  g.add(head);
  // Tail (stretched cone)
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.25, 6, 8),
    new THREE.MeshLambertMaterial({ color: 0x88bbff, transparent: true, opacity: 0.6 })
  );
  tail.rotation.z = Math.PI / 2;
  tail.position.x = 3.5;
  g.add(tail);
  // Inner bright core of tail
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.10, 4, 6),
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
  );
  core.rotation.z = Math.PI / 2;
  core.position.x = 2.5;
  g.add(core);

  // Random starting position (high up, off to one side)
  const side = Math.random() > 0.5 ? 1 : -1;
  g.position.set(side * 80, 30 + Math.random() * 40, -60 - Math.random() * 80);
  g.rotation.z = side > 0 ? 0.3 : -0.3;

  g.visible = false;
  scene.add(g);
  comets.push({
    group: g,
    vx: -side * (12 + Math.random() * 8),
    vy: -(2 + Math.random() * 3),
    vz: 3 + Math.random() * 4,
    life: 0,
    maxLife: 4000 + Math.random() * 3000,
    nextSpawn: Math.random() * 8000
  });
  moonWorldMeshes.push(g);
}

for (let i = 0; i < 5; i++) makeComet();

// ── Stars (moon world specific — bright, close) ───────────────────────────────
const moonStarGeo = new THREE.BufferGeometry();
const moonStarCount = 800;
const moonStarPos = new Float32Array(moonStarCount * 3);
for (let i = 0; i < moonStarCount; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos(2 * Math.random() - 1);
  const r     = 200 + Math.random() * 100;
  moonStarPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
  moonStarPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 5;
  moonStarPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
}
moonStarGeo.setAttribute('position', new THREE.BufferAttribute(moonStarPos, 3));
const moonStarMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0 });
const moonStarField = new THREE.Points(moonStarGeo, moonStarMat);
moonStarField.visible = false;
scene.add(moonStarField);
moonWorldMeshes.push(moonStarField);

// ── Sun (bright, in space — no atmosphere scattering) ─────────────────────────
const moonSunGroup = new THREE.Group();
const moonSunCore = new THREE.Mesh(
  new THREE.SphereGeometry(4.5, 16, 16),
  new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0xffffcc), emissiveIntensity: 1.0 })
);
moonSunGroup.add(moonSunCore);
// Rays
for (let i = 0; i < 8; i++) {
  const ray = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.05, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0xffffaa, transparent: true, opacity: 0.6 })
  );
  ray.rotation.z = (i / 8) * Math.PI * 2;
  ray.position.set(Math.cos((i/8)*Math.PI*2) * 6, Math.sin((i/8)*Math.PI*2) * 6, 0);
  moonSunGroup.add(ray);
}
moonSunGroup.position.set(50, 60, -180);
moonSunGroup.visible = false;
scene.add(moonSunGroup);
moonWorldMeshes.push(moonSunGroup);

// Goal marker for moon world — lunar base dome
const lunarBaseGroup = new THREE.Group();
// Main dome
const baseDome = new THREE.Mesh(
  new THREE.SphereGeometry(8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0xddddcc })
);
baseDome.position.y = 0;
lunarBaseGroup.add(baseDome);
// Base ring
const baseRing = new THREE.Mesh(
  new THREE.CylinderGeometry(8.2, 8.2, 1.2, 20, 1, true),
  new THREE.MeshLambertMaterial({ color: 0xccccbb })
);
baseRing.position.y = 0.6;
lunarBaseGroup.add(baseRing);
// Windows (glowing blue dots around dome)
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  const win = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 8),
    new THREE.MeshLambertMaterial({ color: 0x88ccff, emissive: new THREE.Color(0x4488cc), emissiveIntensity: 0.5 })
  );
  win.position.set(Math.cos(a) * 7.5, 3.5, Math.sin(a) * 7.5);
  win.lookAt(Math.cos(a) * 20, 3.5, Math.sin(a) * 20);
  lunarBaseGroup.add(win);
}
// Antenna tower
const lbAntenna = new THREE.Mesh(
  new THREE.CylinderGeometry(0.2, 0.3, 12, 8),
  new THREE.MeshLambertMaterial({ color: 0xaaaaaa })
);
lbAntenna.position.set(0, 12, 0);
lunarBaseGroup.add(lbAntenna);
const lbDish = new THREE.Mesh(
  new THREE.CylinderGeometry(3, 0.3, 1.5, 12),
  new THREE.MeshLambertMaterial({ color: 0xdddddd })
);
lbDish.position.set(0, 19, 0);
lbDish.rotation.x = 0.5;
lunarBaseGroup.add(lbDish);

lunarBaseGroup.position.set(0, 0, -155);
lunarBaseGroup.visible = false;
scene.add(lunarBaseGroup);

// ── Update function for moon world (called each frame) ────────────────────────
let _moonTime = 0;
function updateMoonWorld(dt, isActive) {
  _moonTime += dt;

  moonWorldMeshes.forEach(m => { if (m.visible !== isActive) m.visible = isActive; });
  moonGroundMesh.visible = isActive;

  if (!isActive) {
    comets.forEach(c => { c.group.visible = false; });
    lunarRovers.forEach(r => { r.group.visible = false; });
    moonStarMat.opacity = 0;
    return;
  }

  // Stars always visible on moon
  moonStarField.visible = true;
  moonStarMat.opacity = 0.9;

  // Rotate Earth slowly
  earthMesh.rotation.y += dt * 0.0001;
  cloudMesh.rotation.y += dt * 0.00015;

  // Moon sun rays rotate
  moonSunGroup.rotation.z += dt * 0.0002;

  // ── Comets ────────────────────────────────────────────────────────────────
  comets.forEach(c => {
    c.nextSpawn -= dt;
    if (c.nextSpawn > 0) { c.group.visible = false; return; }

    c.life += dt;
    if (c.life >= c.maxLife) {
      // respawn
      c.life = 0;
      c.nextSpawn = 3000 + Math.random() * 6000;
      const side = Math.random() > 0.5 ? 1 : -1;
      c.group.position.set(side * 80, 30 + Math.random() * 40, -60 - Math.random() * 60);
      c.vx = -side * (12 + Math.random() * 8);
      c.vy = -(1.5 + Math.random() * 2.5);
      c.vz = 2 + Math.random() * 4;
      c.maxLife = 4000 + Math.random() * 3000;
      c.group.visible = false;
      return;
    }

    c.group.visible = true;
    c.group.position.x += c.vx * dt * 0.001;
    c.group.position.y += c.vy * dt * 0.001;
    c.group.position.z += c.vz * dt * 0.001;
    // Tail always points away from direction of travel
    c.group.rotation.y = Math.atan2(c.vx, c.vz);
  });

  // ── Lunar rovers — scroll toward camera (parallel to player road, right side)
  const rStep = SCROLL_SPD * dt / 1000;
  lunarRovers.forEach(r => {
    r.group.visible = true;
    r.z += rStep;
    if (r.z > 22) r.z -= ROVER_SPAN;
    r.group.position.z = r.z;
    r.group.position.x = ROVER_LANE_X;
    // Animate wheels rotating
    r.group.children.forEach((child, i) => {
      if (i >= 1 && i <= 4) child.rotation.x += dt * 0.004;
    });
  });

  // ── Pool: scroll rocks with world ────────────────────────────────────────
  const step = SCROLL_SPD * dt / 1000;
  moonWorldPooled.forEach(o => {
    o.z += step;
    if (o.z > 22) o.z -= MOON_SPAN;
    o.mesh.position.z = o.z;
    o.mesh.visible = true;
  });
}

// ─── WORLD TRACKER ────────────────────────────────────────────────────────────
let _currentWorld = 0; // 0=mountains, 1=beach — set each frame in updateDayNight

function scrollWorld(dt) {
  const step    = SCROLL_SPD * dt / 1000;
  const isMtn   = (_currentWorld === 0);
  const isBeach = (_currentWorld === 1);
  const isSea   = (_currentWorld === 2);
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
  seaPooledObjects.forEach(o => {
    o.z += step;
    if (o.z > 22) o.z -= POOL_SPAN;
    o.mesh.position.z = o.z;
    o.mesh.visible = isSea;
  });
  cityPooledObjects.forEach(o => {
    if (!o.z && o.z !== 0) return; // skip non-pooled items
    o.z += step;
    if (o.z > 22) o.z -= CITY_SPAN;
    o.mesh.position.z = o.z;
    o.mesh.visible = (_currentWorld === 3);
  });
  cityRoadMarkings.forEach(m => { m.visible = (_currentWorld === 3); });
  if (cityPooledObjects._sidewalks) {
    cityPooledObjects._sidewalks.forEach(m => { m.visible = (_currentWorld === 3); });
  }
  // Moon world scrolling is handled inside updateMoonWorld()
}

// ─── MOUNTAIN APPROACH CYCLE ─────────────────────────────────────────────────
// 5-min cycle: mountains grow from tiny → huge → pass through → reset
const MTN_CYCLE_MS = 5 * 60 * 1000;

let _worldOverride = -1; // -1 = no override, 0-4 = force that world

function _showWorldBadge(text) {
  const el = document.getElementById('timeSpeedBadge');
  if (el) { el.textContent = text; el.style.color = '#aaf'; el.style.borderColor = '#aaf'; }
}

function getMtnState(elapsedMs) {
  const cycleNum = Math.floor(elapsedMs / MTN_CYCLE_MS);
  const progress = (elapsedMs % MTN_CYCLE_MS) / MTN_CYCLE_MS; // 0..1, loops
  const world    = _worldOverride >= 0 ? _worldOverride : cycleNum % 5; // 0=mountains, 1=beach, 2=sea, 3=city, 4=moon
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
  const isSea   = (world === 2);
  const isCity  = (world === 3);
  const isMoonW = (world === 4);
  goalMtnGroup.visible    = isMtn;
  beachOceanGroup.visible = isBeach;
  seaIslandGroup.visible  = isSea;
  cityGoalGroup.visible   = isCity;
  lunarBaseGroup.visible  = isMoonW;
  bgMountains.forEach(({ mesh }) => { mesh.visible = isMtn; });
  groundMesh.visible      = isMtn;
  sandGroundMesh.visible  = isBeach;
  seaGroundMesh.visible   = isSea;
  cityGroundMesh.visible  = isCity;
  moonGroundMesh.visible  = isMoonW;
  seaTrailMeshes.forEach(m => { m.visible = false; });
  seaBridgeGroup.visible  = isSea;

  if (isMtn) {
    if (camera.far !== 320) { camera.far = 320; camera.updateProjectionMatrix(); }
    goalMtnGroup.scale.setScalar(mtnScale);
    goalMtnGroup.position.z = -155 + mtnZOff;
    bgMountains.forEach(({ mesh, homeZ }) => {
      mesh.scale.setScalar(mtnScale * 0.85);
      mesh.position.z = homeZ + mtnZOff * 0.52;
    });
  } else if (isBeach) {
    if (camera.far !== 320) { camera.far = 320; camera.updateProjectionMatrix(); }
    beachOceanGroup.scale.setScalar(mtnScale);
    beachOceanGroup.position.z = -155 + mtnZOff;
    scene.fog.near = 40;
    scene.fog.far  = 350;
    scene.fog.color.set(0x78c8e8);
  } else if (isSea) {
    // Sea world — deep ocean, island on horizon
    if (camera.far !== 320) { camera.far = 320; camera.updateProjectionMatrix(); }
    seaIslandGroup.scale.setScalar(mtnScale);
    seaIslandGroup.position.z = -155 + mtnZOff;
    scene.fog.near = 35;
    scene.fog.far  = 260;
    scene.fog.color.set(0x0a2040);
  } else if (isCity) {
    // City world — urban haze
    if (camera.far !== 400) { camera.far = 400; camera.updateProjectionMatrix(); }
    cityGoalGroup.scale.setScalar(mtnScale);
    cityGoalGroup.position.z = -155 + mtnZOff;
    scene.fog.near = 50;
    scene.fog.far  = 320;
    scene.fog.color.set(0x8890a0);
  } else if (isMoonW) {
    // Moon world — space sky, bright sun from upper-right
    if (camera.far !== 500) { camera.far = 500; camera.updateProjectionMatrix(); }
    lunarBaseGroup.scale.setScalar(mtnScale);
    lunarBaseGroup.position.z = -155 + mtnZOff;
    // Black space sky
    skyUniforms.uZenith.value.setRGB(0.0, 0.0, 0.02);
    skyUniforms.uMidSky.value.setRGB(0.0, 0.0, 0.015);
    skyUniforms.uHorizon.value.setRGB(0.02, 0.02, 0.04);
    skyUniforms.uGlow.value.setRGB(0.05, 0.05, 0.1);
    skyUniforms.uSunVisible.value = 0.0; // hide day/night sun disk
    sunGroup.visible = false;
    moonGroup.visible = false;
    if (window._starMat) window._starMat.opacity = 0; // hide day/night stars (use moon world stars)
    // No fog (space is clear)
    scene.fog.near = 300;
    scene.fog.far  = 500;
    scene.fog.color.set(0x000008);
    // Bright hard sunlight from upper-right (no atmosphere diffusion)
    ambientLight.color.set(0xfff8ee);
    ambientLight.intensity = 1.2;
    sunLight.color.set(0xffffff);
    sunLight.intensity = 2.8;
    sunLight.position.set(50, 60, -80);
    // Show moon world label
    const moonEl = document.getElementById('timeOfDay');
    if (moonEl) moonEl.textContent = '🌙 MOON';
  }

  // Pass-through: rock cave darkness OR deep-ocean blue immersion
  if (passPhase > 0) {
    const pa        = Math.sin(passPhase * Math.PI);
    const throughCol = isMtn ? 0x160602 : isMoonW ? 0x000008 : 0x041428;
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
const MIN_GAP   = 5.5;   // longest car (truck) ≈5.4 + clearance
const EXTRA_GAP = 6;

const LANES      = [-1.5, 0, 1.5];   // 3 lanes — car width ≈1.85, gap between sides ≈1.1
const LANE_ORDER = [1, 0, 2];

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
      playerLanes.set(player.playerId, LANES[laneIdx]); // no random wobble — cars need clean lanes
    }
    char.targetX = playerLanes.get(player.playerId);
  });
}

// ─── PLAYERS & WEBSOCKET ─────────────────────────────────────────────────────
let characters   = new Map();
window.characters = characters;
let players      = [];
let totalPlayers = 0;

GameWebSocket.on('init', d => {
  applyUpdate(d.players, d.totalPlayers);
  if (d.totalLikes !== undefined) updateDisasterCounter(d.totalLikes);
});
GameWebSocket.on('update', d => {
  applyUpdate(d.players, d.totalPlayers);
  if (d.event?.type === 'donation') updateProgressUI(d.players);
  if (d.event?.type === 'tornado')  spawnTornado(d.event.username || 'Someone');
  if (d.event?.type === 'tsunami')  spawnTsunami();
  if (d.event?.type === 'meteor')   spawnMeteors();
  if (d.event?.type === 'crash')    spawnMassCrash();
  if (d.totalLikes !== undefined)   updateDisasterCounter(d.totalLikes);
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

const GOAL_POINTS = 2000;   // ~1000 coins × 2pts  or  200 000 likes
function updateProgressUI(pl) {
  if (!pl?.length) return;
  const pct = Math.min((pl[0].totalPoints / GOAL_POINTS) * 100, 100);
  document.getElementById('progressPct').textContent      = pct.toFixed(2) + '%';
  document.getElementById('progressBarInner').style.width = pct + '%';
}

// ─── 2D NICKNAME OVERLAY ──────────────────────────────────────────────────────
const nameCanvas = document.getElementById('nameCanvas');
const nameCtx    = nameCanvas.getContext('2d');
const _tmpVec    = new THREE.Vector3();

function drawNicknames() {
  nameCtx.clearRect(0, 0, 1080, 1920);

  // Draw rank number above each car
  players.forEach((player, index) => {
    const rank = index + 1;
    const char = characters.get(player.playerId);
    if (!char) return;

    char.group.getWorldPosition(_tmpVec);
    _tmpVec.y += 1.2;
    const ndc = _tmpVec.clone().project(camera);
    if (ndc.z > 1) return;

    const sx = (ndc.x  + 1) / 2 * 1080;
    const sy = (-ndc.y + 1) / 2 * 1920;

    const dist     = camera.position.distanceTo(_tmpVec);
    const fontSize = Math.round(Math.max(18, Math.min(48, 800 / dist)));
    const color    = '#' + SHIRT_COLORS[char.colorIndex % SHIRT_COLORS.length].toString(16).padStart(6, '0');
    const label    = String(rank);

    nameCtx.font      = `900 ${fontSize}px Arial Black, Arial`;
    nameCtx.textAlign = 'center';
    nameCtx.textBaseline = 'middle';
    nameCtx.lineJoin  = 'round';

    // Dark outline
    nameCtx.strokeStyle = 'rgba(0,0,0,0.95)';
    nameCtx.lineWidth   = fontSize * 0.35;
    nameCtx.strokeText(label, sx, sy);

    // Colored fill
    nameCtx.fillStyle = color;
    nameCtx.fillText(label, sx, sy);
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

// ─── DEV HOTKEYS ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  // T — cycle time speed
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
  // Y — test tornado
  if (e.key === 'y' || e.key === 'Y') spawnTornado('Test (Y key)');
  // U — test tsunami
  if (e.key === 'u' || e.key === 'U') spawnTsunami();
  // I — test meteors
  if (e.key === 'i' || e.key === 'I') spawnMeteors();
  // O — test mass crash
  if (e.key === 'o' || e.key === 'O') spawnMassCrash();
  // M — test moon world; 0 — back to auto sequence
  if (e.key === 'm' || e.key === 'M') { _worldOverride = 4; _showWorldBadge('🌙 MOON WORLD'); }
  if (e.key === '0') { _worldOverride = -1; _showWorldBadge('⏱ AUTO'); }
});

// ─── TORNADO SYSTEM ──────────────────────────────────────────────────────────
let _tornado = null;

function spawnTornado(triggerUsername) {
  if (_tornado) return; // one tornado at a time

  const group    = new THREE.Group();
  const FUNNEL_H = 24;
  const fromLeft = Math.random() < 0.5;
  const startX   = fromLeft ? -24 : 24;
  const endX     = fromLeft ? 24 : -24;

  // ── 1. Stacked torus rings (narrow at ground → wide at top) ────────────────
  const rings = [];
  const N = 32;
  for (let i = 0; i < N; i++) {
    const t      = i / (N - 1);                        // 0 = ground, 1 = sky
    const radius = 0.10 + t * t * 6.5;                 // quadratic funnel
    const tube   = 0.045 + t * 0.20;
    const geo    = new THREE.TorusGeometry(radius, tube, 5, 22);
    const lum    = 0.10 + t * 0.24;
    const mat    = new THREE.MeshLambertMaterial({
      color:       new THREE.Color(lum * 0.87, lum * 0.80, lum),
      transparent: true,
      opacity:     0.80 - t * 0.22,
    });
    const ring       = new THREE.Mesh(geo, mat);
    ring.position.y  = t * FUNNEL_H;
    ring.rotation.x  = Math.PI / 2;
    ring._rSpeed     = 5.8 - t * 3.2;   // fast at ground, slower at top
    ring._rPhase     = i * 0.42;
    ring._wobAmp     = 0.04 + t * 0.14;
    ring._wobFreq    = 1.6 + t * 1.2;
    group.add(ring);
    rings.push(ring);
  }

  // ── 2. Dark inner core ─────────────────────────────────────────────────────
  const coreGeo = new THREE.CylinderGeometry(0.14, 0.04, FUNNEL_H * 0.74, 8);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x060606, transparent: true, opacity: 0.94 });
  const core    = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = FUNNEL_H * 0.37;
  group.add(core);

  // ── 3. Outer rotating funnel shells (give depth and body to the funnel) ────
  const shells = [];
  for (let s = 0; s < 6; s++) {
    const sc  = 0.86 + s * 0.06;
    const geo = new THREE.CylinderGeometry(6.8 * sc, 0.22 * sc, FUNNEL_H * 0.90, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color:       0x2a2820,
      side:        THREE.DoubleSide,
      transparent: true,
      opacity:     0.052 - s * 0.006,
    });
    const mesh      = new THREE.Mesh(geo, mat);
    mesh.position.y = FUNNEL_H * 0.45;
    mesh._sRotSpd   = (s % 2 === 0 ? 0.48 : -0.33) + (Math.random() - 0.5) * 0.10;
    group.add(mesh);
    shells.push(mesh);
  }

  // ── 4. 500 spiral debris particles ─────────────────────────────────────────
  const PC   = 500;
  const pPos = new Float32Array(PC * 3);
  const pDat = [];
  for (let i = 0; i < PC; i++) {
    const t   = Math.random();
    const ang = Math.random() * Math.PI * 2;
    const r   = (0.10 + t * t * 6.5) + (Math.random() - 0.5) * 0.65;
    pPos[i*3]   = Math.cos(ang) * r;
    pPos[i*3+1] = t * FUNNEL_H;
    pPos[i*3+2] = Math.sin(ang) * r;
    pDat.push({ t, ang, baseR: 0.10 + t * t * 6.5 });
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0x7a6242, size: 0.20, transparent: true, opacity: 0.88, sizeAttenuation: true });
  const pts  = new THREE.Points(pGeo, pMat);
  group.add(pts);

  // ── 5. Ground dust swirl ───────────────────────────────────────────────────
  const dustGeo = new THREE.TorusGeometry(2.0, 1.2, 7, 26);
  const dustMat = new THREE.MeshBasicMaterial({ color: 0x7a5e30, transparent: true, opacity: 0.52 });
  const dust    = new THREE.Mesh(dustGeo, dustMat);
  dust.rotation.x = Math.PI / 2;
  dust.position.y = 0.18;
  group.add(dust);

  // ── 6. Flying debris chunks ────────────────────────────────────────────────
  const chunks = [];
  for (let i = 0; i < 20; i++) {
    const s   = 0.07 + Math.random() * 0.26;
    const geo = Math.random() < 0.55
      ? new THREE.BoxGeometry(s, s * 1.5, s * 0.8)
      : new THREE.TetrahedronGeometry(s);
    const col = new THREE.Color(0.28 + Math.random() * 0.18, 0.20 + Math.random() * 0.10, 0.12);
    const mat = new THREE.MeshLambertMaterial({ color: col });
    const m   = new THREE.Mesh(geo, mat);
    const a   = Math.random() * Math.PI * 2;
    const r   = 0.5 + Math.random() * 2.8;
    m.position.set(Math.cos(a) * r, Math.random() * 2.2, Math.sin(a) * r);
    m._ca = a; m._cr = r; m._cs = 3.2 + Math.random() * 3.5;
    group.add(m);
    chunks.push(m);
  }

  // ── 7. Dark storm-cloud cap at top ─────────────────────────────────────────
  const capGeo = new THREE.SphereGeometry(7.5, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.46);
  const capMat = new THREE.MeshBasicMaterial({ color: 0x161614, transparent: true, opacity: 0.50 });
  const cap    = new THREE.Mesh(capGeo, capMat);
  cap.position.y = FUNNEL_H - 0.3;
  cap.rotation.x = Math.PI;
  group.add(cap);

  // Tornado appears CENTER of the scene — where players are walking
  // Slight random X offset so it doesn't always land on same spot
  const centerX = (Math.random() - 0.5) * 3;
  group.position.set(centerX, 0, -13);
  group.scale.y = 0;   // funnel descends from sky at start
  scene.add(group);

  _tornado = {
    group, rings, shells, pts, pPos, pDat, pGeo, dust, chunks,
    centerX, FUNNEL_H,
    startTime:    Date.now(),
    duration:     8500,   // total: 1s down + 6s spin + 1.5s up
    capturedChars: new Map(),
    allCaptured:  false,  // flag: have we swept up all players yet?
    triggerUsername,
  };
  console.log(`[Tornado] spawned by ${triggerUsername} at x=${centerX.toFixed(1)}`);
}

function updateTornado(dt) {
  if (!_tornado) return;
  const { group, rings, shells, pts, pPos, pDat, pGeo, dust, chunks,
          centerX, FUNNEL_H, capturedChars } = _tornado;

  const now     = Date.now();
  const elapsed = now - _tornado.startTime;
  const rawT    = Math.min(elapsed / _tornado.duration, 1.0);
  const time    = elapsed / 1000;

  // ── End: release all and despawn ────────────────────────────────────────────
  if (rawT >= 1.0) {
    capturedChars.forEach((data, id) => {
      const c = characters.get(id);
      if (c) {
        c._inTornado = false;
        c._falling   = true;
        c._fallVy    = 2 + Math.random() * 3;
        c.group.rotation.z = 0;
      }
    });
    scene.remove(group);
    _tornado = null;
    return;
  }

  // ── Phases ──────────────────────────────────────────────────────────────────
  // 0.00 – 0.12  : funnel descends from sky
  // 0.12 – 0.82  : full tornado, players spin  (≈ 5.9 seconds)
  // 0.82 – 1.00  : funnel lifts back to sky

  // ScaleY: 0→1 on descent, 1 during spin, 1→0 on ascent
  const scaleY = rawT < 0.12 ? rawT / 0.12
               : rawT > 0.82 ? (1.0 - rawT) / 0.18
               : 1.0;
  group.scale.y = scaleY;

  // Position: STAYS at center with small organic sway (no side-to-side travel)
  group.position.x = centerX + Math.sin(time * 0.55) * 1.8 + Math.sin(time * 1.3) * 0.6;
  group.position.z = -13    + Math.sin(time * 0.42) * 1.2;

  // ── Rotate rings ────────────────────────────────────────────────────────────
  rings.forEach(ring => {
    ring.rotation.z = time * ring._rSpeed + ring._rPhase;
    ring.position.x = Math.sin(time * ring._wobFreq + ring._rPhase) * ring._wobAmp;
    ring.position.z = Math.cos(time * ring._wobFreq * 0.72 + ring._rPhase) * ring._wobAmp * 0.75;
  });

  // ── Outer shells counter-rotation ───────────────────────────────────────────
  shells.forEach(s => { s.rotation.y += s._sRotSpd * dt * 0.001; });

  // ── Spiral particles ────────────────────────────────────────────────────────
  for (let i = 0; i < pDat.length; i++) {
    const d = pDat[i];
    d.ang += (5.0 - d.t * 3.0) * dt * 0.001;
    const r = d.baseR + Math.sin(time * 3.2 + d.t * 7) * 0.22;
    pPos[i*3]   = Math.cos(d.ang) * r;
    pPos[i*3+2] = Math.sin(d.ang) * r;
    pPos[i*3+1] = d.t * FUNNEL_H + Math.sin(time * 2.2 + d.t * 9) * 0.30;
  }
  pGeo.attributes.position.needsUpdate = true;

  // ── Dust pulse ──────────────────────────────────────────────────────────────
  dust.rotation.z = time * 2.5;
  dust.scale.setScalar(0.88 + Math.sin(time * 6) * 0.14);

  // ── Debris chunks orbit ─────────────────────────────────────────────────────
  chunks.forEach(ch => {
    ch._ca += ch._cs * dt * 0.001;
    ch.position.x = Math.cos(ch._ca) * ch._cr;
    ch.position.z = Math.sin(ch._ca) * ch._cr;
    ch.rotation.x += 0.045; ch.rotation.y += 0.065;
  });

  // ── Capture ALL players the moment funnel fully lands ───────────────────────
  if (rawT > 0.13 && !_tornado.allCaptured) {
    _tornado.allCaptured = true;
    let slot = 0;
    characters.forEach((char, id) => {
      if (char._inTornado || char._falling) return;
      // Each player gets a unique orbit slot for visual spread
      capturedChars.set(id, {
        captureTime: now,
        angle:    (slot / Math.max(characters.size, 1)) * Math.PI * 2,  // evenly spread
        orbitR:   1.5 + (slot % 3) * 0.9,                               // 3 orbit rings
        orbitSpd: 3.5 + (slot % 5) * 0.6,                              // varied speeds
        orbitH:   3.0 + (slot % 4) * 1.6,                              // varied heights
      });
      char._inTornado = true;
      slot++;
    });
    console.log(`[Tornado] captured ${slot} players`);
  }

  // ── Animate orbiting players ─────────────────────────────────────────────────
  capturedChars.forEach((data, id) => {
    const char = characters.get(id);
    if (!char) { capturedChars.delete(id); return; }

    // Release players just before tornado lifts (rawT > 0.80)
    if (rawT > 0.80) {
      capturedChars.delete(id);
      char._inTornado = false;
      char._falling   = true;
      char._fallVy    = 1.5 + Math.random() * 2.5;
      char.group.rotation.z = 0;
      char.group.rotation.x = 0;
      return;
    }

    // Smooth lift: 0→orbitH over 0.6s
    const liftT = Math.min((now - data.captureTime) / 600, 1.0);

    // Orbit around tornado center
    data.angle += data.orbitSpd * dt * 0.001;
    char.group.position.x = group.position.x + Math.cos(data.angle) * data.orbitR;
    char.group.position.z = group.position.z + Math.sin(data.angle) * data.orbitR;
    char.group.position.y = data.orbitH * liftT
                          + Math.sin(time * 4.5 + data.angle) * 0.35;  // bobbing

    // Tumbling rotation while spinning
    char.group.rotation.z = data.angle + Math.PI * 0.5;
    char.group.rotation.x = Math.sin(time * 6.0 + data.angle) * 0.70;
  });
}

// ─── SOUND SYSTEM ─────────────────────────────────────────────────────────────
let _audioCtx = null;
function _getAC() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  return _audioCtx;
}
function _tone(freq, type, dur, vol, delay) {
  try {
    const ctx = _getAC(); if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type || 'sine'; osc.frequency.value = freq;
    const t = ctx.currentTime + (delay || 0);
    gain.gain.setValueAtTime(vol || 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
  } catch(e) {}
}
function _noise(dur, ffreq, vol, delay) {
  try {
    const ctx = _getAC(); if (!ctx) return;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = ffreq || 500;
    const gain = ctx.createGain();
    const t = ctx.currentTime + (delay || 0);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(gain); gain.connect(ctx.destination); src.start(t);
  } catch(e) {}
}
// ─── ENGINE SOUND ─────────────────────────────────────────────────────────────
let _engineOsc = null, _engineGain = null, _engineOsc2 = null;
function _startEngine() {
  if (_engineOsc) return;
  try {
    const ctx = _getAC(); if (!ctx) return;
    _engineGain = ctx.createGain();
    _engineGain.gain.value = 0.055;
    _engineGain.connect(ctx.destination);
    _engineOsc = ctx.createOscillator();
    _engineOsc.type = 'sawtooth';
    _engineOsc.frequency.value = 72;
    _engineOsc.connect(_engineGain);
    _engineOsc.start();
    _engineOsc2 = ctx.createOscillator();
    _engineOsc2.type = 'sawtooth';
    _engineOsc2.frequency.value = 78;
    _engineOsc2.connect(_engineGain);
    _engineOsc2.start();
  } catch(e) {}
}
function _playAccel() {
  // Quick rev-up "вжжж"
  try {
    const ctx = _getAC(); if (!ctx) return;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sawtooth';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(380, t + 0.35);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.7);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    osc.start(t); osc.stop(t + 0.78);
  } catch(e) {}
}
let _lastAccelTime = 0;
function _tickEngineSound(ts) {
  if (!_engineOsc) _startEngine();
  // Random acceleration rev every 4-7 seconds
  if (ts - _lastAccelTime > 4000 + Math.random() * 3000) {
    _lastAccelTime = ts;
    _playAccel();
  }
}

function _playWarningBeep() {
  _tone(440, 'sine', 0.12, 0.45, 0);
  _tone(660, 'sine', 0.12, 0.45, 0.18);
  _tone(880, 'sine', 0.18, 0.5,  0.36);
}
function _soundTornado()  { _noise(7, 280, 0.12); _noise(7, 90, 0.08); }
function _soundTsunami()  { _noise(5, 180, 0.18); _tone(52, 'sine', 4.5, 0.22); }
function _soundMeteor() {
  try {
    const ctx = _getAC(); if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 1.1);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    osc.start(t); osc.stop(t + 1.15);
  } catch(e) {}
  _noise(0.5, 1400, 0.45, 1.1);
}
function _soundCrash() { _noise(0.4, 1600, 0.5); _tone(110, 'sawtooth', 0.35, 0.3, 0.08); }

// ─── EVENT ANNOUNCEMENT ───────────────────────────────────────────────────────
function showEventAnnouncement(text, color) {
  const el = document.getElementById('eventAnnouncement');
  if (!el) return;
  el.textContent = text;
  el.style.color  = color || '#FF4444';
  el.style.opacity = '1';
  el.style.transform = 'translate(-50%, -50%) scale(1.15)';
  setTimeout(() => {
    el.style.opacity   = '0';
    el.style.transform = 'translate(-50%, -50%) scale(1)';
  }, 2800);
}

// ─── DISASTER COUNTER ─────────────────────────────────────────────────────────
let _clientTotalLikes = 0;
function updateDisasterCounter(total) {
  _clientTotalLikes = total || 0;
  const cur = _clientTotalLikes % 1000;
  const pct = (cur / 1000) * 100;
  const barEl   = document.getElementById('chaosBarInner');
  const countEl = document.getElementById('chaosCount');
  if (barEl)   barEl.style.width   = pct + '%';
  if (countEl) countEl.textContent = cur + ' / 1000 ❤️';
}

// ─── TSUNAMI ──────────────────────────────────────────────────────────────────
let _tsunami = null;
function spawnTsunami() {
  if (_tsunami) return;
  setTimeout(() => {
    _soundTsunami();
    const group = new THREE.Group();

    // Main wave body
    const waveMat = new THREE.MeshLambertMaterial({ color: 0x0044BB, transparent: true, opacity: 0.88 });
    const waveGeo = new THREE.BoxGeometry(42, 13, 7);
    const waveMesh = new THREE.Mesh(waveGeo, waveMat);
    waveMesh.position.set(0, 6.5, 0);
    group.add(waveMesh);

    // Foam / crest
    const foamMat = new THREE.MeshLambertMaterial({ color: 0x88CCFF, transparent: true, opacity: 0.75 });
    const foamMesh = new THREE.Mesh(new THREE.BoxGeometry(42, 3.5, 4), foamMat);
    foamMesh.position.set(0, 14, -1.5);
    group.add(foamMesh);

    // White tip
    const tipMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.9 });
    const tipMesh = new THREE.Mesh(new THREE.BoxGeometry(42, 1.5, 2.5), tipMat);
    tipMesh.position.set(0, 16.5, -3);
    group.add(tipMesh);

    // Underwater base (darkens as wave passes)
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x001166, transparent: true, opacity: 0.6 });
    const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(42, 4, 60), baseMat);
    baseMesh.position.set(0, 0, 30);
    group.add(baseMesh);

    group.position.set(0, 0, -95);
    scene.add(group);

    _tsunami = { group, baseMesh, startTime: Date.now(), duration: 5800, hasCaptured: false, hasReleased: false };
    console.log('[Tsunami] spawned');
  }, 900);
}

function updateTsunami(dt) {
  if (!_tsunami) return;
  const elapsed = Date.now() - _tsunami.startTime;
  const rawT = Math.min(elapsed / _tsunami.duration, 1.0);

  // Wave travels from Z=-95 to Z=+40
  const z = -95 + rawT * 135;
  _tsunami.group.position.z = z;

  // Wave height animation (slight wobble)
  _tsunami.group.position.y = Math.sin(elapsed * 0.004) * 0.4;

  // When wave front (~z+3) reaches where cars are, sweep them
  if (z > -38 && !_tsunami.hasCaptured) {
    _tsunami.hasCaptured = true;
    characters.forEach(char => {
      if (!char._inTornado && !char._falling) {
        char._falling = true;
        char._fallVy  = 6 + Math.random() * 5;
      }
    });
  }

  if (rawT >= 1.0) {
    scene.remove(_tsunami.group);
    _tsunami = null;
  }
}

// ─── METEOR RAIN ──────────────────────────────────────────────────────────────
let _meteorRain = null;
function spawnMeteors() {
  if (_meteorRain) return;
  setTimeout(() => {
    const meteors = [];
    const explosions = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      // Meteorite body
      const r = 0.25 + Math.random() * 0.22;
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.4 + Math.random()*0.2, 0.2, 0.05) });
      const body = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), mat);
      g.add(body);
      // Glow
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xFF6600, transparent: true, opacity: 0.55 });
      const glow = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 6, 4), glowMat);
      g.add(glow);
      // Trail
      const trailMat = new THREE.MeshBasicMaterial({ color: 0xFF4400, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
      const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, r * 0.8, 2.5 + Math.random(), 6, 1, true), trailMat);
      trail.position.y = 1.5;
      trail.rotation.x = Math.PI;
      g.add(trail);

      const startX = (Math.random() - 0.5) * 7;
      const startZ = -30 + Math.random() * 25;
      const startY = 40 + Math.random() * 20;
      g.position.set(startX, startY, startZ);
      scene.add(g);

      const delay = i * 300 + Math.random() * 200;
      const speed = 18 + Math.random() * 14;
      meteors.push({ g, startX, startZ, startY, vy: speed, delay, hit: false });
    }

    _meteorRain = { meteors, explosions, startTime: Date.now(), duration: 6000 };
    console.log('[Meteors] spawned');
  }, 900);
}

function updateMeteors(dt) {
  if (!_meteorRain) return;
  const elapsed = Date.now() - _meteorRain.startTime;
  const dtS = dt / 1000;

  _meteorRain.meteors.forEach(m => {
    if (elapsed < m.delay) return;
    if (m.hit) { scene.remove(m.g); return; }

    m.g.position.y -= m.vy * dtS;
    m.g.rotation.x += dtS * 2;

    // Impact
    if (m.g.position.y <= 0 && !m.hit) {
      m.hit = true;
      _soundMeteor();
      // Spawn explosion particles
      const eGroup = new THREE.Group();
      for (let p = 0; p < 18; p++) {
        const ps = 0.08 + Math.random() * 0.18;
        const pm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.3 + Math.random()*0.5, 0) });
        const pp = new THREE.Mesh(new THREE.SphereGeometry(ps, 4, 3), pm);
        const ang = Math.random() * Math.PI * 2, spd = 3 + Math.random() * 5;
        pp._vx = Math.cos(ang) * spd; pp._vy = 4 + Math.random() * 6; pp._vz = Math.sin(ang) * spd;
        eGroup.add(pp);
      }
      eGroup.position.copy(m.g.position);
      eGroup.position.y = 0;
      eGroup._born = Date.now();
      scene.add(eGroup);
      _meteorRain.explosions.push(eGroup);
      // Knock nearby cars
      characters.forEach(char => {
        const dx = char.group.position.x - m.g.position.x;
        const dz = char.group.position.z - m.g.position.z;
        if (Math.sqrt(dx*dx + dz*dz) < 3.5) {
          char._falling = true;
          char._fallVy  = 5 + Math.random() * 4;
        }
      });
      scene.remove(m.g);
    }
  });

  // Animate explosions
  _meteorRain.explosions.forEach(eg => {
    const age = (Date.now() - eg._born) / 1000;
    eg.children.forEach(p => {
      p.position.x += p._vx * dtS;
      p.position.y = Math.max(0, p.position.y + p._vy * dtS);
      p.position.z += p._vz * dtS;
      p._vy -= 12 * dtS;
      p.material.opacity = Math.max(0, 1 - age * 1.5);
    });
    if (age > 0.8) { scene.remove(eg); }
  });
  _meteorRain.explosions = _meteorRain.explosions.filter(eg => eg.parent !== null);

  if (elapsed >= _meteorRain.duration) {
    _meteorRain.meteors.forEach(m => { if (m.g.parent) scene.remove(m.g); });
    _meteorRain.explosions.forEach(eg => { if (eg.parent) scene.remove(eg); });
    _meteorRain = null;
  }
}

// ─── MASS CRASH ───────────────────────────────────────────────────────────────
let _massCrash = null;
function spawnMassCrash() {
  if (_massCrash) return;
  setTimeout(() => {
    const cars = [];
    characters.forEach((char, id) => {
      if (char._inTornado || char._falling) return;
      _soundCrash();
      cars.push({
        id,
        x: char.group.position.x,
        y: char.group.position.y,
        z: char.group.position.z,
        vx: (Math.random() - 0.5) * 16,
        vy: 4 + Math.random() * 7,
        vz: (Math.random() - 0.5) * 10,
        ay: -18,
        bounces: 0
      });
      char._inTornado = true;
    });
    _massCrash = { cars, startTime: Date.now(), duration: 6000 };
    console.log('[MassCrash] cars:', cars.length);
  }, 900);
}

function updateMassCrash(dt) {
  if (!_massCrash) return;
  const elapsed = Date.now() - _massCrash.startTime;
  const dtS = dt / 1000;

  _massCrash.cars.forEach(data => {
    const char = characters.get(data.id);
    if (!char) return;

    data.vy += data.ay * dtS;
    data.x  += data.vx * dtS;
    data.y  += data.vy * dtS;
    data.z  += data.vz * dtS;

    if (data.y < 0) {
      data.y = 0;
      if (data.vy < -1) {
        data.vy = -data.vy * 0.45;
        data.vx *= 0.7;
        data.vz *= 0.7;
        data.bounces++;
        if (data.bounces === 1) _soundCrash();
      } else {
        data.vy = 0;
      }
    }
    if (Math.abs(data.x) > 5) { data.vx *= -0.7; data.x = Math.sign(data.x) * 5; }
    if (data.z < -38)          { data.vz *= -0.7; data.z = -38; }
    if (data.z > 2)            { data.vz *= -0.7; data.z = 2; }

    // Override position (char.update() has already set _inTornado spin)
    char.group.position.set(data.x, data.y, data.z);
  });

  if (elapsed >= _massCrash.duration) {
    _massCrash.cars.forEach(data => {
      const char = characters.get(data.id);
      if (char) {
        char._inTornado = false;
        char._falling   = true;
        char._fallVy    = 1.5;
      }
    });
    _massCrash = null;
  }
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
let lastTime = 0;

function gameLoop(ts) {
  const dt = Math.min(ts - lastTime, 50);
  lastTime = ts;

  scaledElapsedMs += dt * TIME_SPEEDS[timeSpeedIdx];

  // Animate ocean water shader
  if (window._beachWaterUniforms) window._beachWaterUniforms.uTime.value += dt * 0.0014;

  // Player boats in sea world
  const isSea = (_currentWorld === 2);
  let boatIdx = 0;
  if (isSea) {
    characters.forEach((char) => {
      if (boatIdx < playerBoatPool.length) {
        const boat = playerBoatPool[boatIdx++];
        boat.visible = true;
        boat.position.set(
          char.group.position.x,
          char.group.position.y - 0.3 + Math.sin(Date.now() * 0.002 + char.group.position.z) * 0.08,
          char.group.position.z
        );
        boat.rotation.z = Math.sin(Date.now() * 0.0018 + char.group.position.z * 0.5) * 0.06;
      }
    });
  }
  for (let bi = boatIdx; bi < playerBoatPool.length; bi++) {
    playerBoatPool[bi].visible = false;
  }

  scrollWorld(dt);
  updateDayNight(gameStartMs + scaledElapsedMs);

  camera.position.x = -2 + Math.sin(ts * 0.00022) * 0.30;
  camera.position.y =  9 + Math.sin(ts * 0.00017) * 0.18;
  // Look slightly higher as the mountain looms — dramatic approach feel
  const _ms = getMtnState(scaledElapsedMs);
  camera.lookAt(0, 2 + _ms.scale * 2.8, -16);

  _tickEngineSound(ts);
  characters.forEach(c => c.update(dt));
  updateTornado(dt);
  updateTsunami(dt);
  updateMeteors(dt);
  updateMassCrash(dt);
  updateMoonWorld(dt, _currentWorld === 4);

  renderer.render(scene, camera);
  drawNicknames();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
