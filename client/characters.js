const NAME_TAG_COLORS = [
  '#FF4444', '#FF9900', '#FFEE00', '#44FF44',
  '#00FFFF', '#4499FF', '#FF44FF', '#FF8844',
  '#44FFAA', '#FF6688'
];

const SHIRT_COLORS = [
  0xE74C3C, 0x3498DB, 0x9B59B6, 0x27AE60,
  0xF39C12, 0x16A085, 0xC0392B, 0x2980B9,
  0x8E44AD, 0xD35400
];
const PANTS_COLORS = [
  0x1a237e, 0x212529, 0x3b0764, 0x145a32,
  0x7b341e, 0x0d3349, 0x78281f, 0x154360,
  0x4a235a, 0x5c3a00
];
const HAIR_COLORS = [
  0x1a0a00, 0x3d1c02, 0x5c3317, 0xcc8844,
  0xddbb88, 0x222222, 0x882222, 0x555555
];
const SKIN_COLORS = [
  0xDEB887, 0xC8956C, 0x8D5524, 0xF1C27D, 0xFFDBCA
];
const PACK_COLORS = [
  0x333333, 0x4a2800, 0x003366, 0x2d4a1a, 0x5c1a1a
];

class Character3D {
  constructor(player, colorIndex, scene) {
    this.player     = player;
    this.scene      = scene;
    this.colorIndex = colorIndex;

    this.group    = new THREE.Group();
    this.walkFrame = Math.random() * Math.PI * 2;
    this.targetZ  = 0;
    this.targetX  = 0;

    this._build();
    scene.add(this.group);

    // Start off-screen left so the character slides in
    this.group.position.set(this.targetX, 0, 5);
  }

  _r(seed) { const x = Math.sin(seed) * 10000; return x - Math.floor(x); }

  _build() {
    const ci  = this.colorIndex;
    const pid = parseInt(this.player.playerId, 10) || ci;

    const shirtColor = SHIRT_COLORS[ci % SHIRT_COLORS.length];
    const pantsColor = PANTS_COLORS[ci % PANTS_COLORS.length];
    const skinColor  = SKIN_COLORS[pid % SKIN_COLORS.length];
    const hairColor  = HAIR_COLORS[pid % HAIR_COLORS.length];
    const packColor  = PACK_COLORS[ci % PACK_COLORS.length];

    const skinMat  = new THREE.MeshLambertMaterial({ color: skinColor });
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });
    const hairMat  = new THREE.MeshLambertMaterial({ color: hairColor });
    const packMat  = new THREE.MeshLambertMaterial({ color: packColor });
    const shoeMat  = new THREE.MeshLambertMaterial({ color: 0x222222 });

    // ── Legs ──────────────────────────────────────────────────────────────────
    const legGeo  = new THREE.CylinderGeometry(0.105, 0.13, 0.88, 7);
    const shoeGeo = new THREE.BoxGeometry(0.22, 0.12, 0.34);

    this.leftLegGroup  = new THREE.Group();
    this.rightLegGroup = new THREE.Group();

    [this.leftLegGroup, this.rightLegGroup].forEach((lg, i) => {
      const leg  = new THREE.Mesh(legGeo,  pantsMat);
      const shoe = new THREE.Mesh(shoeGeo, shoeMat);
      leg.position.y  = -0.44;
      leg.castShadow  = true;
      shoe.position.set(0, -0.92, 0.06);
      lg.add(leg, shoe);
      lg.position.set(i === 0 ? -0.19 : 0.19, 0.88, 0);
      this.group.add(lg);
    });

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.36, 1.08, 8),
      shirtMat
    );
    body.position.y = 1.36;
    body.castShadow = true;
    this.group.add(body);

    // ── Backpack ──────────────────────────────────────────────────────────────
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.70, 0.25), packMat);
    pack.position.set(0, 1.44, 0.37);
    pack.castShadow = true;
    this.group.add(pack);

    // Straps
    const strapGeo = new THREE.BoxGeometry(0.055, 0.68, 0.04);
    const strapMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    [-0.14, 0.14].forEach(sx => {
      const strap = new THREE.Mesh(strapGeo, strapMat);
      strap.position.set(sx, 1.44, 0.24);
      this.group.add(strap);
    });

    // ── Arms ──────────────────────────────────────────────────────────────────
    const armGeo  = new THREE.CylinderGeometry(0.085, 0.10, 0.80, 6);
    const handGeo = new THREE.SphereGeometry(0.10, 6, 6);

    this.leftArmGroup  = new THREE.Group();
    this.rightArmGroup = new THREE.Group();

    [this.leftArmGroup, this.rightArmGroup].forEach((ag, i) => {
      const arm  = new THREE.Mesh(armGeo,  shirtMat);
      const hand = new THREE.Mesh(handGeo, skinMat);
      arm.position.y  = -0.38;
      arm.castShadow  = true;
      hand.position.y = -0.44;
      ag.add(arm, hand);
      ag.position.set(i === 0 ? -0.46 : 0.46, 1.82, 0);
      this.group.add(ag);
    });

    // ── Head ──────────────────────────────────────────────────────────────────
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), skinMat);
    head.position.y = 2.22;
    head.castShadow = true;
    this.group.add(head);

    // Hair cap (half-sphere)
    const hairGeo = new THREE.SphereGeometry(0.30, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const hairMesh = new THREE.Mesh(hairGeo, hairMat);
    hairMesh.position.y = 2.28;
    this.group.add(hairMesh);

    // Random hat (some players)
    if (this._r(pid * 7) > 0.5) {
      const brimGeo = new THREE.CylinderGeometry(0.38, 0.40, 0.06, 10);
      const crownGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.28, 10);
      const hatMat = new THREE.MeshLambertMaterial({ color: shirtColor });
      const brim  = new THREE.Mesh(brimGeo, hatMat);
      const crown = new THREE.Mesh(crownGeo, hatMat);
      brim.position.y  = 2.48;
      crown.position.y = 2.60;
      this.group.add(brim, crown);
    }

    // Face forward (away from camera)
    this.group.rotation.y = Math.PI;
  }

  update(dt) {
    // Smooth interpolation toward target position
    this.group.position.z += (this.targetZ - this.group.position.z) * 0.055;
    this.group.position.x += (this.targetX - this.group.position.x) * 0.055;

    // Walk animation
    this.walkFrame += dt * 0.0048;
    const leg  = Math.sin(this.walkFrame) * 0.44;
    const arm  = Math.sin(this.walkFrame) * 0.52;
    const bob  = Math.abs(Math.sin(this.walkFrame * 2)) * 0.045;

    this.leftLegGroup.rotation.x   =  leg;
    this.rightLegGroup.rotation.x  = -leg;
    this.leftArmGroup.rotation.x   = -arm;
    this.rightArmGroup.rotation.x  =  arm;
    this.group.position.y           = bob;

    // Slight body lean forward
    this.group.rotation.x = -0.08;
  }

  updatePlayer(player) {
    this.player = player;
  }

  remove() {
    this.scene.remove(this.group);
  }
}

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
