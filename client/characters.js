const NAME_TAG_COLORS = [
  '#FF4444', '#FF9900', '#FFEE00', '#44FF44',
  '#00FFFF', '#4499FF', '#FF44FF', '#FF8844',
  '#44FFAA', '#FF6688'
];

// Car body colors — vivid, varied
const CAR_BODY_COLORS = [
  0xFF2222, 0x2266FF, 0xFFCC00, 0x22BB44,
  0xFF6600, 0xCC22FF, 0xFF2288, 0x00CCCC,
  0xFFFFFF, 0x111111, 0xBB8833, 0x44AA88
];

// 0=Sedan  1=Jeep  2=Truck  3=Tank  4=Sports
const CAR_TYPES = ['sedan', 'jeep', 'truck', 'tank', 'sports'];

class Car3D {
  constructor(player, colorIndex, scene) {
    this.player     = player;
    this.scene      = scene;
    this.colorIndex = colorIndex;

    this.group    = new THREE.Group();
    this.targetZ  = 0;
    this.targetX  = 0;

    // Tornado / fall state (used externally by game.js)
    this._inTornado = false;
    this._falling   = false;
    this._fallVy    = 0;

    this._wheelAngle = Math.random() * Math.PI * 2;
    this._wheels     = [];

    this._build();
    this.group.scale.setScalar(0.5);  // cars are half-scale
    scene.add(this.group);

    // Start off-screen so it slides in
    this.group.position.set(this.targetX, 0, 5);
  }

  _r(seed) { const x = Math.sin(seed) * 10000; return x - Math.floor(x); }

  _build() {
    const ci  = this.colorIndex;
    const pid = parseInt(this.player.playerId, 10) || ci;

    const typeIndex = pid % CAR_TYPES.length;
    this._carType = CAR_TYPES[typeIndex];

    const bodyColor = CAR_BODY_COLORS[ci % CAR_BODY_COLORS.length];
    const bodyMat  = new THREE.MeshLambertMaterial({ color: bodyColor });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x88CCFF, transparent: true, opacity: 0.65 });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const rimMat   = new THREE.MeshLambertMaterial({ color: 0xBBBBBB });

    switch (this._carType) {
      case 'sedan':  this._buildSedan (bodyMat, glassMat, wheelMat, rimMat); break;
      case 'jeep':   this._buildJeep  (bodyMat, glassMat, wheelMat, rimMat); break;
      case 'truck':  this._buildTruck (bodyMat, glassMat, wheelMat, rimMat); break;
      case 'tank':   this._buildTank  (bodyMat, glassMat, wheelMat, rimMat); break;
      case 'sports': this._buildSports(bodyMat, glassMat, wheelMat, rimMat); break;
    }

    // All cars face forward (front = -Z model space, toward finish = -Z world)
    this.group.rotation.y = 0;
  }

  // Helper: create a wheel group and register it for spinning
  _addWheel(wx, wy, wz, radius, width, wheelMat, rimMat) {
    const wg = new THREE.Group();

    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, width, 12),
      wheelMat
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width + 0.01, 8),
      rimMat
    );
    rim.rotation.z = Math.PI / 2;

    wg.add(tire, rim);
    wg.position.set(wx, wy, wz);
    this.group.add(wg);
    this._wheels.push(wg);
    return wg;
  }

  // ── SEDAN ────────────────────────────────────────────────────────────────────
  _buildSedan(bodyMat, glassMat, wheelMat, rimMat) {
    // Lower chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.45, 3.6), bodyMat);
    chassis.position.y = 0.52;
    chassis.castShadow = true;
    this.group.add(chassis);

    // Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.50, 1.85), bodyMat);
    cabin.position.set(0, 1.0, 0.08);
    cabin.castShadow = true;
    this.group.add(cabin);

    // Windshield
    const wf = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.42, 0.05), glassMat);
    wf.position.set(0, 0.98, -0.84);
    this.group.add(wf);

    // Rear window
    const rw = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.38, 0.05), glassMat);
    rw.position.set(0, 0.97, 1.02);
    this.group.add(rw);

    // Headlights
    const litMat = new THREE.MeshLambertMaterial({ color: 0xFFFFAA });
    [-0.55, 0.55].forEach(lx => {
      const lit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.04), litMat);
      lit.position.set(lx, 0.56, -1.81);
      this.group.add(lit);
    });

    const wr = 0.28, ww = 0.22;
    this._addWheel(-0.88, wr, -1.1, wr, ww, wheelMat, rimMat);
    this._addWheel( 0.88, wr, -1.1, wr, ww, wheelMat, rimMat);
    this._addWheel(-0.88, wr,  1.1, wr, ww, wheelMat, rimMat);
    this._addWheel( 0.88, wr,  1.1, wr, ww, wheelMat, rimMat);
  }

  // ── JEEP ─────────────────────────────────────────────────────────────────────
  _buildJeep(bodyMat, glassMat, wheelMat, rimMat) {
    // Boxy chassis — higher clearance
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.62, 3.3), bodyMat);
    chassis.position.y = 0.72;
    chassis.castShadow = true;
    this.group.add(chassis);

    // Tall boxy cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.78, 2.05), bodyMat);
    cabin.position.set(0, 1.38, 0.1);
    cabin.castShadow = true;
    this.group.add(cabin);

    // Windshield
    const wf = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.62, 0.05), glassMat);
    wf.position.set(0, 1.38, -0.96);
    this.group.add(wf);

    // Side windows
    [-0.86, 0.86].forEach(lx => {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 1.6), glassMat);
      sw.position.set(lx, 1.38, 0.1);
      this.group.add(sw);
    });

    // Bull-bar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.06), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    bar.position.set(0, 0.72, -1.68);
    this.group.add(bar);

    // Big off-road wheels
    const wr = 0.40, ww = 0.30;
    this._addWheel(-1.05, wr, -1.05, wr, ww, wheelMat, rimMat);
    this._addWheel( 1.05, wr, -1.05, wr, ww, wheelMat, rimMat);
    this._addWheel(-1.05, wr,  1.05, wr, ww, wheelMat, rimMat);
    this._addWheel( 1.05, wr,  1.05, wr, ww, wheelMat, rimMat);
  }

  // ── TRUCK ────────────────────────────────────────────────────────────────────
  _buildTruck(bodyMat, glassMat, wheelMat, rimMat) {
    // Cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.05, 1.9), bodyMat);
    cab.position.set(0, 0.98, -1.35);
    cab.castShadow = true;
    this.group.add(cab);

    // Windshield
    const wf = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.6, 0.05), glassMat);
    wf.position.set(0, 1.02, -2.3);
    this.group.add(wf);

    // Exhaust pipes
    const exhMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    [0.6, 0.82].forEach(ex => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 7), exhMat);
      pipe.position.set(ex, 1.55, -0.8);
      this.group.add(pipe);
    });

    // Cargo bed
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.68, 3.0), bodyMat);
    bed.position.set(0, 0.62, 0.9);
    bed.castShadow = true;
    this.group.add(bed);

    // Bed walls
    const wallMat = bodyMat;
    const bwall = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.5, 0.08), wallMat);
    bwall.position.set(0, 1.08, 2.38);
    this.group.add(bwall);
    [-1.0, 1.0].forEach(sx => {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 3.0), wallMat);
      sw.position.set(sx, 1.08, 0.9);
      this.group.add(sw);
    });

    // 6 wheels (2 front + 4 rear dual)
    const wr = 0.38, ww = 0.26;
    this._addWheel(-1.12, wr, -1.6, wr, ww, wheelMat, rimMat);
    this._addWheel( 1.12, wr, -1.6, wr, ww, wheelMat, rimMat);
    this._addWheel(-1.12, wr,  0.5, wr, ww, wheelMat, rimMat);
    this._addWheel( 1.12, wr,  0.5, wr, ww, wheelMat, rimMat);
    this._addWheel(-1.12, wr,  1.25, wr, ww, wheelMat, rimMat);
    this._addWheel( 1.12, wr,  1.25, wr, ww, wheelMat, rimMat);
  }

  // ── TANK ─────────────────────────────────────────────────────────────────────
  _buildTank(bodyMat, glassMat, wheelMat, rimMat) {
    const greenMat  = new THREE.MeshLambertMaterial({ color: 0x3d5a1e });
    const trackMat  = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
    const metalMat  = new THREE.MeshLambertMaterial({ color: 0x555544 });

    // Tracks
    [-0.98, 0.98].forEach(tx => {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 3.8), trackMat);
      track.position.set(tx, 0.22, 0); // 0.22 = half-height, so bottom sits at Y=0
      track.castShadow = true;
      this.group.add(track);
    });

    // Hull
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.58, 3.5), greenMat);
    hull.position.y = 0.58;
    hull.castShadow = true;
    this.group.add(hull);

    // Turret base
    const tBase = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.38, 10), greenMat);
    tBase.position.set(0, 1.08, 0.1);
    tBase.castShadow = true;
    this.group.add(tBase);

    // Turret
    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.36, 1.45), greenMat);
    turret.position.set(0, 1.4, 0.1);
    turret.castShadow = true;
    this.group.add(turret);

    // Gun barrel
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.0, 8), metalMat);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0, 1.42, -1.2);
    this.group.add(gun);

    // Small road wheels (decorative, they spin too) — Y=0.22 = radius, so bottom at Y=0
    for (let i = -1.4; i <= 1.4; i += 0.7) {
      this._addWheel(-1.05, 0.22, i, 0.22, 0.16, trackMat, rimMat);
      this._addWheel( 1.05, 0.22, i, 0.22, 0.16, trackMat, rimMat);
    }
  }

  // ── SPORTS CAR ───────────────────────────────────────────────────────────────
  _buildSports(bodyMat, glassMat, wheelMat, rimMat) {
    // Very low, wide chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.32, 3.7), bodyMat);
    chassis.position.y = 0.40;
    chassis.castShadow = true;
    this.group.add(chassis);

    // Sleek, low cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.38, 1.65), bodyMat);
    cabin.position.set(0, 0.76, 0.12);
    cabin.castShadow = true;
    this.group.add(cabin);

    // Windshield (angled)
    const wf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.30, 0.05), glassMat);
    wf.position.set(0, 0.74, -0.68);
    this.group.add(wf);

    // Rear spoiler wing
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.32), bodyMat);
    wing.position.set(0, 1.02, 1.72);
    this.group.add(wing);
    [-0.78, 0.78].forEach(sx => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.14), bodyMat);
      post.position.set(sx, 0.88, 1.72);
      this.group.add(post);
    });

    // Front splitter
    const split = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.22), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    split.position.set(0, 0.26, -1.88);
    this.group.add(split);

    // Side skirts
    [-0.94, 0.94].forEach(sx => {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 3.0), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      skirt.position.set(sx, 0.32, 0);
      this.group.add(skirt);
    });

    // Low-profile wide wheels
    const wr = 0.26, ww = 0.28;
    this._addWheel(-0.97, wr, -1.22, wr, ww, wheelMat, rimMat);
    this._addWheel( 0.97, wr, -1.22, wr, ww, wheelMat, rimMat);
    this._addWheel(-0.97, wr,  1.22, wr, ww, wheelMat, rimMat);
    this._addWheel( 0.97, wr,  1.22, wr, ww, wheelMat, rimMat);
  }

  // ── UPDATE ───────────────────────────────────────────────────────────────────
  update(dt) {
    // Inside tornado: spin in place
    if (this._inTornado) {
      this.group.rotation.y += dt * 0.012;
      this.group.rotation.z = Math.sin(this.group.rotation.y * 0.5) * 0.45;
      // Spin wheels fast
      for (const w of this._wheels) w.rotation.x += dt * 0.018;
      return;
    }

    // Falling after tornado drop
    if (this._falling) {
      this._fallVy -= 14 * dt * 0.001;
      this.group.position.y += this._fallVy * dt * 0.001;
      this.group.rotation.z += dt * 0.005;
      if (this.group.position.y <= 0) {
        this.group.position.y = 0;
        this._falling = false;
        this._fallVy  = 0;
        // Fully restore car orientation so it drives straight after landing
        this.group.rotation.set(0, 0, 0);
      }
      return;
    }

    // Normal driving — keep orientation locked forward at all times
    this.group.position.z += (this.targetZ - this.group.position.z) * 0.055;
    this.group.position.x += (this.targetX - this.group.position.x) * 0.055;
    this.group.rotation.x = 0;
    this.group.rotation.y = 0;
    this.group.rotation.z = 0;

    // Spin wheels
    this._wheelAngle += dt * 0.012;
    for (const w of this._wheels) w.rotation.x = this._wheelAngle;

    // Slight body bounce
    this.group.position.y = Math.abs(Math.sin(this._wheelAngle * 2)) * 0.025;
  }

  updatePlayer(player) {
    this.player = player;
  }

  remove() {
    this.scene.remove(this.group);
  }
}

// Keep Character3D as alias so any leftover references still work
const Character3D = Car3D;

// game.js uses SHIRT_COLORS for nickname label colour — point it at car body colours
const SHIRT_COLORS = CAR_BODY_COLORS;

function _rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}
