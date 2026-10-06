// Day and night: the sun and moon travel across the sky, the sky, fog, light and sea change colour
// through keyframes (night, dawn, day, golden hour, the signature sunset, dusk), stars come out,
// and the city switches on its windows, street lamps and neon glow after dark.
(function (NB) {
  'use strict';
  const { U } = NB;
  const C = h => new THREE.Color(h);

  // hour, sky horizon / middle / top, fog, hemisphere sky / ground / intensity, stars, lamps, windows, neon glow, sea shallow / deep, sea rim tint
  const KEYS = [
    [0, '#2a2350', '#1a1740', '#07061a', '#1d1a38', '#5f6bbd', '#1c1830', .64, 1, 1, .95, .55, '#0f3a55', '#08183a', '#3a3a7a'],
    [4.6, '#2a2350', '#1a1740', '#07061a', '#1d1a38', '#5f6bbd', '#1c1830', .64, 1, 1, .9, .55, '#0f3a55', '#08183a', '#3a3a7a'],
    [5.4, '#8a4f7a', '#3a2f6a', '#0e0d2c', '#4a3a66', '#8a7ab8', '#2a2440', .64, .55, 1, .75, .5, '#1f5a73', '#12275a', '#8a5a8a'],
    [6.3, '#ffa36a', '#e87aa0', '#3a4a8a', '#e3a08e', '#ffc8c0', '#4b3a6b', .72, 0, .35, .35, .34, '#35a9b5', '#224a88', '#ff9aa0'],
    [7.6, '#ffe0c0', '#a8d0f0', '#3f7fd0', '#d6d6e2', '#dde9ff', '#5a4a68', .64, 0, 0, 0, .24, '#3cc0c8', '#245193', '#ffc8b0'],
    [12.5, '#f2e8de', '#8cc4f0', '#2f6ec8', '#bfd5ea', '#d6e6ff', '#5a4c66', .58, 0, 0, 0, .24, '#40c8cc', '#1f5596', '#c8e0ff'],
    [16.8, '#ffd8b0', '#a0c8f0', '#3a70c0', '#d8ccd4', '#ffe6d6', '#5a4a6a', .64, 0, 0, 0, .24, '#3cc2c7', '#24508f', '#ffc0b0'],
    [18.5, '#ffb070', '#f08aa0', '#45306f', '#eb9a86', '#ffc6c8', '#4b3a6b', .78, 0, .1, .1, .26, '#3dc2c7', '#244d8c', '#ff8c99'],
    [19.4, '#ff9e6b', '#f26b9e', '#302466', '#e98a86', '#ffc2d6', '#4b3a6b', .78, 0, .45, .3, .3, '#3dc2c7', '#244d8c', '#ff8c99'],
    [20.3, '#b0507a', '#5a3278', '#151238', '#6a3c6a', '#a47ab8', '#2e2448', .68, .5, 1, .85, .48, '#1f5a73', '#12275a', '#b05a8a'],
    [21.4, '#2a2350', '#1a1740', '#07061a', '#1d1a38', '#5f6bbd', '#1c1830', .64, 1, 1, .95, .55, '#0f3a55', '#08183a', '#3a3a7a'],
    [24, '#2a2350', '#1a1740', '#07061a', '#1d1a38', '#5f6bbd', '#1c1830', .64, 1, 1, .95, .55, '#0f3a55', '#08183a', '#3a3a7a']
  ].map(k => ({ h: k[0], hor: C(k[1]), mid: C(k[2]), top: C(k[3]), fog: C(k[4]), hs: C(k[5]), hg: C(k[6]), hi: k[7], stars: k[8], lamps: k[9], windows: k[10], glow: k[11], seaA: C(k[12]), seaB: C(k[13]), rim: C(k[14]) }));
  const COLS = ['hor', 'mid', 'top', 'fog', 'hs', 'hg', 'seaA', 'seaB', 'rim'], NUMS = ['hi', 'stars', 'lamps', 'windows', 'glow'];

  NB.createDayNight = function (scene, hemi, sun) {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uSun: { value: new THREE.Vector3(1, .1, .12).normalize() }, uMoon: { value: new THREE.Vector3(-1, .3, -.3).normalize() },
        uHor: { value: C('#ff9e6b') }, uMid: { value: C('#f26b9e') }, uTop: { value: C('#302466') }, uGround: { value: C('#e88a85') },
        uSunCol: { value: C('#ff8c4d') }, uSunVis: { value: 1 }, uStripe: { value: 1 }, uStars: { value: 0 }, uTime: { value: 0 }
      },
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD;
        uniform vec3 uSun, uMoon, uHor, uMid, uTop, uGround, uSunCol; uniform float uSunVis, uStripe, uStars, uTime;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vD); float h = d.y;
          vec3 c = h < 0.14 ? mix(uHor, uMid, clamp(h/0.14,0.0,1.0)) : mix(uMid, uTop, pow(clamp((h-0.14)/0.86,0.0,1.0), 0.65));
          float s = dot(d, uSun);
          c += uSunCol * pow(max(s,0.0), 6.0) * 0.45 * uSunVis;
          // the sun: a striped retro disc low on the horizon, a plain bright one higher up
          float disc = smoothstep(0.9965, 0.9975, s) * uSunVis;
          float stripes = step(0.5, fract((d.y - uSun.y) * 160.0 + 0.25));
          if (d.y < uSun.y - 0.01) disc *= mix(1.0, stripes, uStripe);
          vec3 dc = mix(vec3(1.0,0.35,0.55), vec3(1.0,0.9,0.45), clamp((d.y - uSun.y + 0.06)/0.12,0.0,1.0));
          c = mix(c, mix(vec3(1.0,0.97,0.86), dc, uStripe), disc);
          // stars that twinkle, and the moon with a soft halo
          if (uStars > 0.01 && h > 0.0) {
            vec3 q = floor(d * 240.0); float r = hash(q);
            float st = step(0.9962, r) * (0.55 + 0.45 * sin(uTime * (1.5 + r * 3.0) + r * 90.0));
            c += vec3(0.95, 0.95, 1.0) * st * uStars * smoothstep(0.02, 0.3, h);
          }
          float m = dot(d, uMoon);
          c += vec3(0.6,0.65,0.95) * pow(max(m,0.0), 40.0) * 0.25 * uStars;
          c = mix(c, vec3(0.94,0.94,1.0), smoothstep(0.99955, 0.9997, m) * uStars);
          if (h < 0.0) c = mix(uHor, uGround, clamp(-h*8.0,0.0,1.0));
          gl_FragColor = vec4(c, 1.0);
        }`
    }));
    scene.add(sky);
    const su = sky.material.uniforms;

    const cur = {}; for (const k of COLS) cur[k] = new THREE.Color();
    const env = {
      hour: 19.2, night: 0, stars: 0, lamps: 0, windows: 0, glow: .24, foam: 1,
      sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), lightDir: new THREE.Vector3(), specDir: new THREE.Vector3(),
      spec: new THREE.Color(), seaA: cur.seaA, seaB: cur.seaB, rim: cur.rim
    };
    const SUN_LOW = C('#ff8a50'), SUN_HIGH = C('#fff0d6'), MOON = C('#9fb2ff'), sunCol = new THREE.Color();
    const ss = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

    function update(hour, t) {
      hour = ((hour % 24) + 24) % 24; env.hour = hour;
      let k = 0; while (k < KEYS.length - 2 && KEYS[k + 1].h <= hour) k++;
      const A = KEYS[k], B = KEYS[k + 1];
      let f = (hour - A.h) / (B.h - A.h); f = f * f * (3 - 2 * f);
      for (const n of COLS) cur[n].copy(A[n]).lerp(B[n], f);
      for (const n of NUMS) env[n] = A[n] + (B[n] - A[n]) * f;
      env.night = env.stars;

      // the sun rises behind the city (-x) at 6:00 and sets over the ocean (+x) at 20:00; the moon does the night shift
      const th = (hour - 6) / 14 * Math.PI;
      env.sunDir.set(-Math.cos(th), Math.sin(th) * .9, .22).normalize();
      const tm = (((hour - 19.6) % 24 + 24) % 24) / 11 * Math.PI;
      env.moonDir.set(-Math.cos(tm), Math.sin(tm) * .8, -.35).normalize();
      const sunUp = ss(-.03, .14, env.sunDir.y), moonUp = ss(-.03, .15, env.moonDir.y) * env.stars;
      sunCol.copy(SUN_LOW).lerp(SUN_HIGH, ss(.02, .45, env.sunDir.y));
      const sunI = (1.05 - .33 * ss(.3, .85, env.sunDir.y)) * sunUp, moonI = .32 * moonUp;
      const byMoon = moonI > sunI;
      sun.color.copy(byMoon ? MOON : sunCol); sun.intensity = Math.max(sunI, moonI);
      // shadows come from whichever light is stronger, kept high enough for the shadow box to cover the hero
      const L = byMoon ? env.moonDir : env.sunDir;
      env.lightDir.set(L.x, Math.max(L.y, .42), L.z).normalize();
      env.specDir.copy(byMoon ? env.moonDir : env.sunDir);
      env.spec.copy(byMoon ? MOON : sunCol).multiplyScalar(byMoon ? .7 * moonUp : sunUp);
      env.foam = .45 + .55 * (1 - env.stars * .6);

      hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = env.hi;
      scene.fog.color.copy(cur.fog);
      su.uSun.value.copy(env.sunDir); su.uMoon.value.copy(env.moonDir);
      su.uHor.value.copy(cur.hor); su.uMid.value.copy(cur.mid); su.uTop.value.copy(cur.top);
      su.uGround.value.copy(cur.hor).lerp(cur.fog, .5);
      su.uSunCol.value.copy(sunCol); su.uSunVis.value = ss(-.07, .01, env.sunDir.y);
      su.uStripe.value = 1 - ss(.08, .3, env.sunDir.y);
      su.uStars.value = env.stars; su.uTime.value = t;
      return env;
    }
    return { sky, update, env };
  };
})(window.NB);
