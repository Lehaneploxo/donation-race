// Shared helpers: math, seeded random, canvas textures, merged-geometry builder, collision grid.
window.NB = {};
(function (NB) {
  'use strict';

  const U = NB.U = {
    rand: (a, b) => a + Math.random() * (b - a),
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
    angDiff: (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a)),
    rng(seed) {
      return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    canvasTex(w, h, draw, repeat, aniso) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); draw(g, w, h);
      const t = new THREE.CanvasTexture(c);
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso || 1;
      return t;
    },
    speckle(g, w, h, n, cols, a0, a1, r0, r1) {
      for (let i = 0; i < n; i++) {
        g.globalAlpha = U.rand(a0, a1); g.fillStyle = cols[i % cols.length];
        const r = U.rand(r0, r1); g.fillRect(Math.random() * w, Math.random() * h, r, r);
      }
      g.globalAlpha = 1;
    }
  };

  // Accumulates boxes and quads with vertex colours into one BufferGeometry, so a whole
  // city of buildings becomes a handful of draw calls.
  const FLAT_UV = [0.03, 0.5];
  class GeoBuilder {
    constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = []; this.n = 0; }
    quad(a, b, c, d, nx, ny, nz, color, ua, ub, uc, ud) {
      const s = this.n, P = [a, b, c, d], T = [ua, ub, uc, ud];
      for (let i = 0; i < 4; i++) {
        this.pos.push(P[i][0], P[i][1], P[i][2]); this.nor.push(nx, ny, nz);
        this.col.push(color.r, color.g, color.b); this.uv.push(T[i][0], T[i][1]);
      }
      this.idx.push(s, s + 1, s + 2, s, s + 2, s + 3); this.n += 4;
    }
    // o.tile: world metres per texture tile on the sides (0 = flat colour); o.topTile for the top;
    // o.top: top colour; o.noTop / o.noSides to skip faces.
    box(x0, y0, z0, x1, y1, z1, c, o = {}) {
      const t = o.tile || 0, ct = o.top || c;
      const S = (u, v) => (t ? [u / t, v / t] : FLAT_UV);
      if (!o.noSides) {
        const dz = z1 - z0, dx = x1 - x0;
        this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, c, S(0, y0), S(dz, y0), S(dz, y1), S(0, y1));
        this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, c, S(0, y0), S(dz, y0), S(dz, y1), S(0, y1));
        this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, c, S(0, y0), S(dx, y0), S(dx, y1), S(0, y1));
        this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, c, S(0, y0), S(dx, y0), S(dx, y1), S(0, y1));
      }
      if (!o.noTop) {
        const tt = o.topTile || 0, T = (x, z) => (tt ? [x / tt, -z / tt] : FLAT_UV);
        this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, ct, T(x0, z1), T(x1, z1), T(x1, z0), T(x0, z0));
      }
    }
    flat(x0, z0, x1, z1, y, c, tile) {
      const T = (x, z) => (tile ? [x / tile, -z / tile] : FLAT_UV);
      this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], 0, 1, 0, c, T(x0, z1), T(x1, z1), T(x1, z0), T(x0, z0));
    }
    // A vertical panel on one side of a building. face: '+x' | '-x' | '+z' | '-z'; (cx, cz) is the panel centre.
    panel(face, cx, cz, y0, y1, hw, c, uv) {
      const R = { '+x': [0, -1], '-x': [0, 1], '+z': [1, 0], '-z': [-1, 0] }[face];
      const N = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[face];
      const u = uv || [FLAT_UV[0], FLAT_UV[1], FLAT_UV[0], FLAT_UV[1]];
      const lx = cx - R[0] * hw, lz = cz - R[1] * hw, rx = cx + R[0] * hw, rz = cz + R[1] * hw;
      this.quad([lx, y0, lz], [rx, y0, rz], [rx, y1, rz], [lx, y1, lz], N[0], 0, N[1], c,
        [u[0], u[1]], [u[2], u[1]], [u[2], u[3]], [u[0], u[3]]);
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setIndex(this.idx);
      g.computeBoundingSphere();
      return g;
    }
  }
  NB.GeoBuilder = GeoBuilder;

  // Merge several (geometry, matrix, colour) parts into one non-indexed geometry with vertex colours.
  NB.mergeParts = function (parts) {
    const pos = [], nor = [], col = [];
    for (const [geo, mat, color] of parts) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(mat);
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      for (let i = 0; i < p.length; i += 3) {
        pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(color.r, color.g, color.b);
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  };

  // Axis-aligned boxes in a uniform grid, for fast "what's near me" and ray queries.
  class Colliders {
    constructor(cell = 8) { this.cell = cell; this.map = new Map(); this.boxes = []; this.q = 0; this.tmp = []; }
    key(ix, iz) { return (ix + 1000) * 4000 + (iz + 1000); }
    add(minX, minY, minZ, maxX, maxY, maxZ) {
      const b = { minX, minY, minZ, maxX, maxY, maxZ, s: 0 };
      this.boxes.push(b);
      const c = this.cell;
      for (let ix = Math.floor(minX / c); ix <= Math.floor(maxX / c); ix++)
        for (let iz = Math.floor(minZ / c); iz <= Math.floor(maxZ / c); iz++) {
          const k = this.key(ix, iz); let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(b);
        }
      return b;
    }
    query(x0, z0, x1, z1, out) {
      out = out || this.tmp; out.length = 0; const s = ++this.q, c = this.cell;
      for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++)
        for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
          const a = this.map.get(this.key(ix, iz)); if (!a) continue;
          for (const b of a) if (b.s !== s) { b.s = s; out.push(b); }
        }
      return out;
    }
    // Distance along a normalised ray to the first box, or maxT.
    raycast(ox, oy, oz, dx, dy, dz, maxT) {
      const ex = ox + dx * maxT, ez = oz + dz * maxT;
      const list = this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), []);
      let best = maxT;
      for (const b of list) { if (b.npcOnly) continue; const t = rayBox(ox, oy, oz, dx, dy, dz, b, best); if (t >= 0 && t < best) best = t; }   // invisible barriers stop nothing you can see
      return best;
    }
  }
  function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
    let tmin = 0, tmax = maxT;
    const axes = [[ox, dx, b.minX, b.maxX], [oy, dy, b.minY, b.maxY], [oz, dz, b.minZ, b.maxZ]];
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d; if (t1 > t2) { const q = t1; t1 = t2; t2 = q; }
      if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1;
    }
    return tmin;
  }
  NB.Colliders = Colliders;

  // Bodies of water (the sea, the pools). Each has a test(x, z), a surface() height, and optionally a
  // floor(x, z) — the bottom where there is no collider box underneath, e.g. the sea bed sloping away.
  NB.water = {
    vols: [], holes: [],
    add(v) { this.vols.push(v); return v; },
    // dry spots in the middle of the sea (the yacht): the sea doesn't count there
    hole(r) { this.holes.push(r); },
    // (a hole is a rectangle, or any shape given as test(x, z): the tropical island)
    dry(x, z) { for (const h of this.holes) if (h.test ? h.test(x, z) : x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return true; return false; },
    at(x, z) { for (const v of this.vols) if (v.test(x, z)) return v; return null; },
    floorAt(x, z) { const v = this.at(x, z); return v && v.floor ? v.floor(x, z) : 0; }
  };
})(window.NB);
