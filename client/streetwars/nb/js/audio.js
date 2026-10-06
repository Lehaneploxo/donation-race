// The game's sound. Recorded where it matters (sfx/*.mp3, CC0 — see sfx/CREDITS.txt): engines that follow the revs,
// tyres, crashes, fights, guns, doors, footsteps, water, rain, the street. Synthesised: the music, sirens, alarms,
// money and menu blips, animals — and every recorded sound's stand-in until the recordings have loaded.
(function (NB) {
  'use strict';
  NB.createAudio = function () {
    let AC = null, master = null, noiseBuf = null, eng = null, skid = null;
    const A = {};
    let volume = 1;
    // overall volume 0..1 (0 = sound off), applied to the master bus
    A.setVolume = function (v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.setTargetAtTime(.7 * volume, AC.currentTime, .05);
    };
    A.init = function () {
      if (AC) { if (AC.state === 'suspended') AC.resume(); loadSfx(); return; }
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      const comp = AC.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
      master = AC.createGain(); master.gain.value = .7 * volume; master.connect(comp); comp.connect(AC.destination);
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      loadSfx();
    };
    const ok = () => AC && AC.state === 'running';
    // for the car radio (radio.js): the context, the master bus, white noise, the volume setting
    A.ctx = () => AC; A.bus = () => master; A.noiseBuf = () => noiseBuf; A.volume = () => volume;
    function out(pos) {
      const g = AC.createGain();
      if (pos) {
        const p = AC.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 6; p.rolloffFactor = 1.2;
        if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; } else p.setPosition(pos[0], pos[1], pos[2]);
        g.connect(p); p.connect(master);
      } else g.connect(master);
      return g;
    }
    /* ---------- recorded sounds (sfx/*.mp3, CC0, see sfx/CREDITS.txt) ----------
       Loaded once the sound is switched on; until a sound has arrived its synthesised stand-in below plays instead.
       A loop file holds its period twice over: the middle period is looped, clear of the mp3's padding at the ends. */
    const SFX = {}, META = {};
    let sfxAsked = false, voices = 0;
    const MAX_VOICES = 24;
    function loadSfx() {
      if (sfxAsked || NB.noSfx) return; sfxAsked = true;   // NB.noSfx: Street Wars (TikTok) — звуков игры нет, только радио
      const v = (document.querySelector('script[src*="audio.js"]') || { src: '' }).src.split('?v=')[1] || '1';
      fetch('sfx/sfx.json?v=' + v).then(r => r.json()).then(list => {
        // one at a time, the short ones first: a phone decodes them without a hiccup
        const names = Object.keys(list).sort((a, b) => (list[a].loop ? 1 : 0) - (list[b].loop ? 1 : 0));
        let i = 0;
        const next = () => {
          if (i >= names.length) return;
          const n = names[i++]; META[n] = list[n];
          fetch('sfx/' + n + '.mp3?v=' + v).then(r => r.arrayBuffer())
            .then(b => new Promise((ok, no) => AC.decodeAudioData(b, ok, no)))
            .then(buf => { SFX[n] = buf; }, () => {}).then(next, next);
        };
        next(); next();
      }).catch(() => {});
    }
    const has = n => !!SFX[n];
    const variant = (base, n) => { const k = (Math.random() * n) | 0; for (let j = 0; j < n; j++) { const s = base + ((k + j) % n); if (SFX[s]) return s; } return null; };
    // a recorded sound once: false if it hasn't loaded (the caller then synthesises)
    function play(name, o) {
      o = o || {};
      if (!ok() || !name || !SFX[name]) return false;
      if (voices >= MAX_VOICES && (o.vol || 1) < .5) return true;   // too busy: quiet ones are skipped
      const src = AC.createBufferSource(); src.buffer = SFX[name];
      src.playbackRate.value = (o.rate || 1) * (o.vary === false ? 1 : 1 + (Math.random() - .5) * .1);
      const g = out(o.pos); g.gain.value = o.vol == null ? 1 : o.vol;
      let last = src;
      if (o.lp) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; src.connect(f); last = f; }
      last.connect(g); voices++;
      src.onended = () => { voices--; g.disconnect(); };
      src.start(AC.currentTime + (o.at || 0));
      return true;
    }
    // a looping recorded sound with its own gain (and filter, and optional position)
    function loopVoice(name, o) {
      o = o || {};
      const src = AC.createBufferSource(), P = META[name].loop;
      src.buffer = SFX[name]; src.loop = true; src.loopStart = P / 2; src.loopEnd = P * 1.5;
      const g = AC.createGain(); g.gain.value = 0;
      const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp || 20000;
      src.connect(f); f.connect(g);
      let p = null;
      if (o.pan) { p = AC.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = o.ref || 6; p.rolloffFactor = 1.3; g.connect(p); p.connect(master); }
      else g.connect(master);
      src.start(0, P / 2 + Math.random() * P * .9);
      return { src, g, f, p, name };
    }
    const setPos = (p, x, y, z) => { if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); };
    function env(g, t, a, peak, dur) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
    function noise(dest, t, dur, type, f, q, peak, f2) {
      const s = AC.createBufferSource(); s.buffer = noiseBuf;
      const flt = AC.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur); flt.Q.value = q;
      const g = AC.createGain(); env(g, t, .004, peak, dur);
      s.connect(flt); flt.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + .05);
    }
    A.listener = function (x, y, z, fx, fz) {
      if (!AC) return; const L = AC.listener;
      if (L.positionX) { L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      else { L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
    };
    // engine. Recorded: one engine at three revs (eng0/1/2), each sped up or slowed down to the wanted pitch and
    // crossfaded by how close it is (a sample sounds right near the pitch it was recorded at); the throttle opens
    // a low-pass filter and adds volume. Boats have their own outboard, every model its own voice (VOICE).
    // Until the recordings arrive: two detuned oscillators through a low-pass filter, as before.
    let rec = null, engOn = false, curId = null, lastSkid = 0;
    const ENG_F = [43, 65, 77];   // the recordings' firing pitch, Hz
    const BOATS = { speedboat: 1, jetski: 1, sailboat: 1, cruiser: 1, policeboat: 1 };
    const NO_START = { vento: 1, hog: 1, vespino: 1, hyper21: 1, jet: 1, heli: 1, milheli: 1, volt: 1, speedboat: 1, jetski: 1, sailboat: 1, cruiser: 1, policeboat: 1 };
    function recEngine() {
      if (rec || !has('eng0') || !has('eng1') || !has('eng2') || !has('skid')) return rec;
      rec = { eng: ['eng0', 'eng1', 'eng2'].map(n => loopVoice(n)), skid: loopVoice('skid'), boat: has('boat') ? loopVoice('boat', { lp: 1800 }) : null };
      if (eng) eng.g.gain.setTargetAtTime(0, AC.currentTime, .05);
      if (skid) skid.sg.gain.setTargetAtTime(0, AC.currentTime, .05);
      return rec;
    }
    function recSilence() { if (!rec) return; const t = AC.currentTime; for (const v of rec.eng) v.g.gain.setTargetAtTime(0, t, .12); rec.skid.g.gain.setTargetAtTime(0, t, .05); if (rec.boat) rec.boat.g.gain.setTargetAtTime(0, t, .2); }
    // on: the hero gets in (id: the model, a car's engine is heard starting) or out
    A.engineOn = function (on, id) {
      if (!ok()) return;
      if (on && !engOn && id && !NO_START[id]) play('start', { vol: .5, vary: false, rate: VOICE[id] > 1.2 ? 1.2 : VOICE[id] < .75 ? .85 : 1 });
      engOn = on; if (id) curId = id;
      if (!on) recSilence();
      if (recEngine()) return;
      if (on && !eng) {
        const o1 = AC.createOscillator(), o2 = AC.createOscillator(), o3 = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
        o1.type = 'sawtooth'; o2.type = 'square'; o3.type = 'sine'; f.type = 'lowpass'; f.Q.value = 2; g.gain.value = 0;
        o1.connect(f); o2.connect(f); o3.connect(g); f.connect(g); g.connect(master);
        o1.start(); o2.start(); o3.start();
        eng = { o1, o2, o3, f, g };
        const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        const sf = AC.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1500; sf.Q.value = 3;
        const sg = AC.createGain(); sg.gain.value = 0; s.connect(sf); sf.connect(sg); sg.connect(master); s.start();
        skid = { s, sg, sf };
      }
      if (eng) eng.g.gain.setTargetAtTime(on ? .05 : 0, AC.currentTime, .15);
      if (!on && skid) skid.sg.gain.setTargetAtTime(0, AC.currentTime, .05);
    };
    const VOICE = { zefiro: 1.25, corsaro: .8, hayride: .7, beachcomber: .75, outbacker: .75, royale: .85, piccolo: 1.35, speedboat: .72, jetski: 1.55, vento: 1.6, hog: .6, vespino: 1.9, jet: 2.6, tank: .45,
      firetruck: .62, mtruck: .62, mjeep: .8, gwagon: .82, raptor: .78, cobra: .82, veloce: 1.3, gt21: 1.2, panamo: 1.05, phantom: .9, prezident: .9, hyper21: 1.7, ambulance: .85 };
    // rpm 0..1, load = throttle 0..1, brake 0..1 (the brake pressed while rolling forward)
    A.engine = function (rpm, load, id, brake) {
      if (!ok()) return;
      if (!engOn) A.engineOn(true);
      curId = id;
      const R = recEngine();
      if (!R) {
        if (rec) recSilence();
        if (!eng) { A.engineOn(true); if (!eng) return; }
        const t = AC.currentTime, base = 34 * (VOICE[id] || 1), f = base + rpm * base * 2.4;
        eng.g.gain.cancelScheduledValues(t);
        eng.o1.frequency.setTargetAtTime(f, t, .04); eng.o2.frequency.setTargetAtTime(f * .5 + 1.5, t, .04); eng.o3.frequency.setTargetAtTime(f * .5, t, .04);
        eng.f.frequency.setTargetAtTime(260 + rpm * 900 + load * 900, t, .06);
        eng.g.gain.setTargetAtTime(.045 + load * .05 + rpm * .02, t, .08);
        return;
      }
      const t = AC.currentTime, voice = VOICE[id] || 1;
      if (BOATS[id] && R.boat) {
        for (const v of R.eng) v.g.gain.setTargetAtTime(0, t, .1);
        R.boat.src.playbackRate.setTargetAtTime((.7 + rpm * .75) * (id === 'jetski' ? 1.5 : id === 'cruiser' ? .7 : 1), t, .08);
        R.boat.f.frequency.setTargetAtTime(700 + load * 2500, t, .1);
        R.boat.g.gain.setTargetAtTime(.25 + load * .3, t, .12);
        return;
      }
      if (R.boat) R.boat.g.gain.setTargetAtTime(0, t, .1);
      // the pitch the engine should have, and how much of each recording
      const f = (36 + rpm * 92) * Math.pow(voice, .85), lf = Math.log(f), L = ENG_F.map(Math.log);
      const w = L.map((c, i) => {
        if (lf <= L[0]) return i === 0 ? 1 : 0;
        if (lf >= L[2]) return i === 2 ? 1 : 0;
        const j = lf < L[1] ? 0 : 1, k = (lf - L[j]) / (L[j + 1] - L[j]);
        return i === j ? Math.cos(k * Math.PI / 2) : i === j + 1 ? Math.sin(k * Math.PI / 2) : 0;
      });
      const vol = (.2 + load * .28 + rpm * .1) * (voice < .75 ? 1.15 : 1), cut = 700 + load * 3800 + rpm * 2200;
      R.eng.forEach((v, i) => {
        v.src.playbackRate.setTargetAtTime(Math.min(4, f / ENG_F[i]), t, .05);
        v.f.frequency.setTargetAtTime(cut, t, .07);
        v.g.gain.setTargetAtTime(w[i] * vol, t, .07);
      });
      // braking hard at speed: the tyres complain a little
      if (brake > 0) A.skid(Math.max(lastSkid, brake * .35), true);
    };
    A.skid = function (k, fromBrake) {
      if (!ok()) return;
      if (!fromBrake) lastSkid = k;
      if (rec) { if (!engOn) k = 0; rec.skid.g.gain.setTargetAtTime(Math.min(1, k) * .5, AC.currentTime, .06); rec.skid.src.playbackRate.setTargetAtTime(.9 + Math.min(1, k) * .25, AC.currentTime, .1); return; }
      if (skid) skid.sg.gain.setTargetAtTime(Math.min(1, k) * .22, AC.currentTime, .05);
    };
    let lastHornAt = -99;
    A.horn = function (pos) {
      if (!ok()) return;
      if (pos) { const now = AC.currentTime; if (now - lastHornAt < 5) return; lastHornAt = now; }   // somebody else's horn: one at a time, now and then
      if (play('horn', { pos, vol: pos ? .3 : .5, lp: pos ? 2200 : 0, vary: !!pos, rate: curId && VOICE[curId] > 1.4 ? 1.25 : curId && VOICE[curId] < .75 ? .8 : 1 })) return;
      const t = AC.currentTime, d = out(pos), f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; f.connect(d);
      for (const hz of [392, 494]) { const o = AC.createOscillator(); o.type = 'square'; o.frequency.value = hz; const g = AC.createGain(); env(g, t, .01, pos ? .5 : .12, .45); o.connect(g); g.connect(f); o.start(t); o.stop(t + .5); }
    };
    // a crash: a light knock of metal, a heavy one with a crunch, the hardest ones with glass
    A.impact = function (strength, pos) {
      if (!ok()) return;
      const k = Math.min(1, strength / 14);
      if (has('crash')) {
        const vol = (.35 + k * .65) * (pos ? .55 : 1);   // others' crashes quieter than your own
        if (strength < 4) play(variant('bump', 3), { pos, vol: vol * .8 });
        else { play(variant('metal', 2), { pos, vol }); if (strength > 7) play('crash', { pos, vol, rate: .9 + Math.random() * .2 }); if (strength > 12) play('glass', { pos, vol: vol * .7, at: .03 }); }
        return;
      }
      const t = AC.currentTime, d = out(pos);
      noise(d, t, .25 + k * .3, 'lowpass', 900, .8, .3 + k * .6, 120);
      noise(d, t, .12, 'bandpass', 2600, 2, .15 + k * .3);
      const o = AC.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + .2);
      const g = AC.createGain(); env(g, t, .004, .3 + k * .4, .25); o.connect(g); g.connect(d); o.start(t); o.stop(t + .3);
    };
    // kind: 'car' (a car door), otherwise a building's door
    A.door = function (kind) {
      if (!ok()) return;
      if (play(kind === 'car' ? 'carClose' : 'doorOpen', { vol: kind === 'car' ? .6 : .45 })) return;
      const t = AC.currentTime, d = out(null);
      noise(d, t, .09, 'lowpass', 700, 1, .5); noise(d, t + .02, .05, 'bandpass', 2400, 3, .25);
    };
    const tone = (dest, t, dur, type, f, peak, f2) => {
      const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const g = AC.createGain(); env(g, t, .003, peak, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .05);
    };
    // gunshots: recorded (pistol, SMG, shotgun, rifle; the police pistol a little lower). Stand-in: a noise crack,
    // a low thump and a filtered tail, each weapon with its own weight
    const GUN = { pistol: [1, 150, .7], smg: [.7, 190, .45], shotgun: [1.4, 110, 1], rifle: [1.1, 135, .75], cop: [.9, 160, .6] };
    const GUN_REC = { pistol: ['pistol', 1, 1], smg: ['smg', 1, .85], shotgun: ['shotgun', 1, 1], rifle: ['rifle', 1, 1], cop: ['pistol', .92, .9] };
    A.shot = function (kind, pos) {
      if (!ok()) return;
      const r = GUN_REC[kind] || GUN_REC.pistol;
      if (play(r[0], { pos, rate: r[1], vol: r[2] })) return;
      const [w, thump, len] = GUN[kind] || GUN.pistol, t = AC.currentTime, d = out(pos);
      noise(d, t, .06, 'highpass', 2200, .7, .5 * w);
      noise(d, t, .22 * len + .1, 'lowpass', 4200, .9, .8 * w, 300);
      tone(d, t, .14 * len, 'sine', thump, .8 * w, 42);
    };
    A.dry = function () { if (!ok()) return; const d = out(null); noise(d, AC.currentTime, .02, 'highpass', 4000, .7, .3); };
    // a punch landing (heavy: the bat); pos null = the hero is the one hit
    A.punch = function (pos, heavy) {
      if (!ok()) return;
      if (heavy ? (play(variant('bat', 2), { pos, vol: .9 }) ? (play(variant('punchH', 3), { pos, vol: .5 }), true) : false)
        : play(pos ? variant('punch', 4) : variant('punchH', 3), { pos, vol: pos ? .8 : .7 })) return;
      const t = AC.currentTime, d = out(pos);
      noise(d, t, .12, 'lowpass', 700, 1, .7, 150); tone(d, t, .1, 'sine', 110, .5, 55);
      if (heavy) { noise(d, t, .08, 'bandpass', 1200, 3, .5); tone(d, t, .16, 'triangle', 190, .35, 70); }   // wooden crack of the bat
    };
    // money: a cash-register ring; bigger sums ring twice
    A.cash = function (big) {
      if (!ok()) return; const t = AC.currentTime, d = out(null);
      noise(d, t, .05, 'highpass', 5000, .7, .18);
      [1568, 2093].forEach((f, i) => tone(d, t + .04 + i * .07, .35, 'triangle', f, .12));
      if (big) [2637, 3136].forEach((f, i) => tone(d, t + .22 + i * .07, .4, 'triangle', f, .09));
    };
    A.deny = function () { if (!ok()) return; const t = AC.currentTime, d = out(null); tone(d, t, .12, 'square', 220, .07); tone(d, t + .13, .18, 'square', 165, .07); };
    A.fare = function () { if (!ok()) return; const t = AC.currentTime, d = out(null); [784, 988, 1175].forEach((f, i) => tone(d, t + i * .09, .16, 'square', f, .05)); };
    A.hurt = function () {
      if (!ok()) return;
      if (play(variant('punchH', 3), { vol: .6, rate: .85, lp: 2500 })) return;
      const t = AC.currentTime, d = out(null); noise(d, t, .2, 'lowpass', 500, 1, .5, 90); tone(d, t, .18, 'sine', 90, .4, 45);
    };
    A.scream = function (pos) {
      if (!ok()) return; const t = AC.currentTime, d = out(pos), f = 500 + Math.random() * 500;
      const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.5, t + .15); o.frequency.linearRampToValueAtTime(f * .9, t + .6);
      const flt = AC.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 1400; flt.Q.value = 2;
      const g = AC.createGain(); env(g, t, .04, .25, .65); o.connect(flt); flt.connect(g); g.connect(d); o.start(t); o.stop(t + .7);
    };
    A.groan = function (pos) {
      if (!ok()) return; const t = AC.currentTime, d = out(pos);
      const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(95, t + .7);
      const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; const g = AC.createGain(); env(g, t, .08, .12, .8);
      o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + .85);
    };
    A.pickup = function () { if (!ok()) return; const t = AC.currentTime, d = out(null); [660, 880, 1320].forEach((f, i) => tone(d, t + i * .06, .14, 'triangle', f, .15)); };
    A.sting = function (kind) {
      if (!ok()) return; const t = AC.currentTime, d = out(null);
      if (kind === 'wasted') { tone(d, t, 1.6, 'sawtooth', 220, .12, 55); tone(d, t, 1.6, 'triangle', 110, .2, 40); }
      else { [523, 415, 330].forEach((f, i) => tone(d, t + i * .22, .3, 'square', f, .08)); }
    };
    A.starUp = function () { if (!ok()) return; const t = AC.currentTime, d = out(null); tone(d, t, .12, 'square', 988, .06); tone(d, t + .12, .18, 'square', 1318, .06); };
    // NEPLOXO 21 music: an 80s disco loop at 118 BPM (four-on-the-floor kick, claps, hats, octave bass,
    // offbeat chord stabs and a quiet arpeggio over Am-F-C-G), scheduled ahead on the audio clock.
    // Outside the club it is quieter and muffled through the walls.
    let club = null;
    const CHORDS = [[55, [220, 261.63, 329.63]], [43.65, [174.61, 220, 261.63]], [65.41, [261.63, 329.63, 392]], [49, [196, 246.94, 293.66]]];
    function clubStep(step, t, bus) {
      const s = step % 16, bar = ((step / 16) | 0) % 4, [root, chord] = CHORDS[bar];
      if (s % 4 === 0) {   // kick
        const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
        env(g, t, .002, .9, .28); o.connect(g); g.connect(bus); o.start(t); o.stop(t + .3);
      }
      if (s === 4 || s === 12) { noise(bus, t, .16, 'bandpass', 1500, .9, .35); noise(bus, t + .012, .12, 'bandpass', 1100, 1.2, .25); }
      if (s % 4 === 2) noise(bus, t, .14, 'highpass', 7000, .7, .18); else noise(bus, t, .03, 'highpass', 9000, .7, .06);
      if (s % 2 === 0) {   // octave bass on the eighths
        const f = root * ((s / 2) % 2 ? 2 : 1), o = AC.createOscillator(), flt = AC.createBiquadFilter(), g = AC.createGain();
        o.type = 'sawtooth'; o.frequency.value = f; flt.type = 'lowpass'; flt.frequency.setValueAtTime(900, t); flt.frequency.exponentialRampToValueAtTime(220, t + .14);
        env(g, t, .005, .32, .16); o.connect(flt); flt.connect(g); g.connect(bus); o.start(t); o.stop(t + .2);
      }
      if (s === 6 || s === 14 || (s === 3 && bar % 2)) {   // chord stabs
        const flt = AC.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 2400; flt.connect(bus);
        for (const f of chord) { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'square'; o.frequency.value = f; o.detune.value = (Math.random() - .5) * 8; env(g, t, .004, .045, .2); o.connect(g); g.connect(flt); o.start(t); o.stop(t + .25); }
      }
      { const f = chord[s % 3] * (s % 6 < 3 ? 2 : 4), o = AC.createOscillator(), g = AC.createGain(); o.type = 'triangle'; o.frequency.value = f; env(g, t, .003, .03, .09); o.connect(g); g.connect(bus); o.start(t); o.stop(t + .12); }
    }
    /* ---------- music for every venue, one at a time ---------- */
    // small instruments shared by the tracks below
    const kick = (bus, t, v = .8) => { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + .1); env(g, t, .002, v, .22); o.connect(g); g.connect(bus); o.start(t); o.stop(t + .25); };
    const snare = (bus, t, v = .3) => { noise(bus, t, .14, 'bandpass', 1800, .8, v); tone(bus, t, .08, 'triangle', 190, v * .6, 150); };
    const hat = (bus, t, v = .08, len = .03) => noise(bus, t, len, 'highpass', 8000, .7, v);
    const pluck = (bus, t, f, type, v, dur, cut) => {
      const o = AC.createOscillator(), g = AC.createGain(), flt = AC.createBiquadFilter(); o.type = type; o.frequency.value = f;
      flt.type = 'lowpass'; flt.frequency.value = cut || 3000; env(g, t, .004, v, dur); o.connect(flt); flt.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + .05);
    };
    const pad = (bus, t, fs, dur, v, type = 'triangle') => { for (const f of fs) { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - .5) * 10; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .08); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + .05); } };
    const steel = (bus, t, f, v) => { pluck(bus, t, f, 'sine', v, .35); pluck(bus, t, f * 2.76, 'sine', v * .35, .18); };
    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
    const TRACKS = {
      club: { bpm: 118, step: clubStep },
      // rock'n'roll: walking bass, backbeat, piano stabs on the offbeat (A–D–E–A)
      diner: { bpm: 150, step(step, t, bus) {
        const s = step % 16, bar = ((step / 16) | 0) % 4, root = [110, 146.83, 164.81, 110][bar];
        if (s === 0 || s === 8) kick(bus, t, .6); if (s === 4 || s === 12) snare(bus, t, .28); if (s % 2 === 0) hat(bus, t, .06);
        if (s % 2 === 0) pluck(bus, t, root / 2 * [1, 1.26, 1.5, 1.68, 2, 1.68, 1.5, 1.26][(s / 2) | 0], 'sawtooth', .22, .18, 700);
        if (s % 4 === 2) for (const k of [1, 1.26, 1.5]) pluck(bus, t, root * 2 * k, 'square', .035, .12, 2200);
      } },
      // surf rock: tremolo guitar on Em–C–D–Em
      diner2: { bpm: 168, step(step, t, bus) {
        const s = step % 16, bar = ((step / 16) | 0) % 4, root = [164.81, 130.81, 146.83, 164.81][bar];
        if (s % 8 === 0) kick(bus, t, .55); if (s === 4 || s === 12) snare(bus, t, .25); hat(bus, t, .04);
        pluck(bus, t, root * [1, 1.5, 2, 1.5][((s / 4) | 0)] * (s % 2 ? 1 : 2), 'sawtooth', .06, .09, 1800);
        if (s % 4 === 0) pluck(bus, t, root / 2, 'triangle', .3, .3, 600);
      } },
      // slow doo-wop in 12/8: C–Am–F–G
      diner3: { bpm: 72, step(step, t, bus) {
        const s = step % 12, bar = ((step / 12) | 0) % 4, ch = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]][bar];
        if (s % 3 === 0) pad(bus, t, ch, .5, .045);
        if (s === 0 || s === 6) pluck(bus, t, ch[0] / 2, 'triangle', .3, .5, 500);
        if (s === 3 || s === 9) snare(bus, t, .15);
        if (s === 0) kick(bus, t, .5);
      } },
      // lounge bossa for the casino: soft maj7 chords, root–fifth bass, rim clicks
      casino: { bpm: 100, step(step, t, bus) {
        const s = step % 16, bar = ((step / 16) | 0) % 4, ch = [[261.6, 329.6, 392, 493.9], [220, 261.6, 329.6, 392], [293.7, 349.2, 440, 523.3], [196, 246.9, 293.7, 349.2]][bar];
        if (s === 0 || s === 8) pad(bus, t, ch, 1.1, .03, 'sine');
        if (s === 0 || s === 6) pluck(bus, t, ch[0] / 2, 'triangle', .28, .4, 500); if (s === 8 || s === 14) pluck(bus, t, ch[2] / 2, 'triangle', .22, .35, 500);
        if ([0, 3, 6, 10, 12].includes(s)) noise(bus, t, .03, 'bandpass', 2600, 4, .12);
        hat(bus, t, .025, .05);
        if (s % 4 === 2 && Math.random() < .5) pluck(bus, t, ch[(Math.random() * 4) | 0] * 2, 'sine', .05, .4);
      } },
      // chiptune for the arcade
      arcade: { bpm: 140, step(step, t, bus) {
        const s = step % 16, bar = ((step / 16) | 0) % 4, ch = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]][bar];
        pluck(bus, t, ch[s % 3] * 2, 'square', .045, .07, 5000);
        if (s % 2 === 0) pluck(bus, t, ch[0] / 2, 'square', .09, .1, 1200);
        if (s % 4 === 0) kick(bus, t, .5); if (s === 4 || s === 12) noise(bus, t, .08, 'highpass', 3000, .7, .15); if (s % 2) hat(bus, t, .04);
        if (s === 0 || s === 6 || s === 10) pluck(bus, t, ch[(bar + s) % 3] * 4, 'square', .03, .18, 6000);
      } },
      // elevator-style lounge in the hotel lobby
      lounge: { bpm: 84, step(step, t, bus) {
        const s = step % 16, bar = ((step / 16) | 0) % 4, ch = [[261.6, 329.6, 392, 493.9], [293.7, 349.2, 440, 523.3], [220, 277.2, 329.6, 415.3], [246.9, 293.7, 370, 440]][bar];
        if (s === 0) pad(bus, t, ch, 2.6, .025, 'sine');
        if (s % 4 === 0) pluck(bus, t, ch[0] / 2, 'sine', .2, .6, 400);
        if (s % 4 === 2 && Math.random() < .6) pluck(bus, t, 523.3 * Math.pow(2, PENTA[(Math.random() * PENTA.length) | 0] / 12), 'sine', .05, .5);
      } },
      // tropical: steel drum melody, marimba chords, shaker and bongos
      tiki: { bpm: 104, step(step, t, bus) {
        const s = step % 16, bar = ((step / 16) | 0) % 4, root = [392, 523.3, 440, 392][bar];
        if ([0, 3, 6, 8, 11, 14].includes(s)) steel(bus, t, root * Math.pow(2, PENTA[(s + bar * 3) % 6] / 12), .12);
        if (s % 4 === 2) for (const k of [1, 1.26, 1.5]) pluck(bus, t, root / 2 * k, 'sine', .05, .15);
        hat(bus, t, s % 2 ? .05 : .025, .05);
        if (s === 0 || s === 10) pluck(bus, t, 180, 'sine', .3, .12); if (s === 7 || s === 13) pluck(bus, t, 260, 'sine', .22, .1);
        if (s === 0 || s === 8) pluck(bus, t, root / 4, 'triangle', .25, .35, 500);
      } },
      // buskers: a saxophone on the promenade, a fingerpicked guitar in the park, bucket drums on the plaza
      busk_sax: { bpm: 92, step(step, t, bus) {
        const s = step % 64, n = SAX_TUNE.find(m => m[0] === s);
        if (n) sax(bus, t, 220 * Math.pow(2, n[1] / 12), n[2] * 60 / 92 / 4, .11);
        if (s % 8 === 4) noise(bus, t, .03, 'bandpass', 2400, 5, .08);   // finger snaps
      } },
      busk_guitar: { bpm: 100, step(step, t, bus) {
        const s = step % 16, bar = ((step / 16) | 0) % 4, ch = [[110, 220, 261.6, 329.6], [87.3, 174.6, 220, 261.6], [130.8, 196, 261.6, 329.6], [98, 196, 246.9, 293.7]][bar];
        if (s === 0 || s === 8) { pluck(bus, t, ch[0], 'triangle', .22, .9, 900); pluck(bus, t, ch[0] * 2, 'sawtooth', .03, .5, 1200); }
        if (s % 2 === 0) { const f = ch[1 + ((s / 2) | 0) % 3] * (s === 6 || s === 14 ? 2 : 1); pluck(bus, t, f, 'triangle', .1, .6, 2600); pluck(bus, t, f * 2, 'sine', .025, .3); }
      } },
      busk_drum: { bpm: 112, step(step, t, bus) {
        const s = step % 16, bar = ((step / 16) | 0) % 4, fill = bar === 3 && s >= 8;
        const low = v => { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(60, t + .12); env(g, t, .003, v, .2); o.connect(g); g.connect(bus); o.start(t); o.stop(t + .22); };
        const tok = (v, f) => { noise(bus, t, .06, 'bandpass', f || 1100, 3, v); tone(bus, t, .05, 'triangle', (f || 1100) / 3.5, v * .5); };
        if (fill) { if (s % 2 === 0) tok(.3, 900 + s * 40); else low(.35); return; }
        if (s === 0 || s === 6 || s === 10) low(.55);
        if (s === 4 || s === 12) tok(.35);
        if (s % 2 === 1 && Math.random() < .5) noise(bus, t, .02, 'highpass', 5000, .7, .06);
        if (s === 14 && Math.random() < .5) tok(.2, 1500);
      } }
    };
    // a saxophone voice: a little breath at the start, then vibrato
    const SAX_TUNE = [[0, 7, 6], [6, 10, 2], [8, 12, 8], [18, 10, 2], [20, 7, 4], [24, 5, 4], [28, 3, 4],
      [32, 0, 6], [38, 3, 2], [40, 5, 4], [44, 7, 8], [52, 10, 3], [55, 12, 3], [58, 15, 6]];
    function sax(bus, t, f, dur, v) {
      const o = AC.createOscillator(), o2 = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(), flt = AC.createBiquadFilter(), g = AC.createGain();
      o.type = 'sawtooth'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2.002;
      lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * .012, t + Math.min(.4, dur * .5));
      lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      flt.type = 'lowpass'; flt.frequency.setValueAtTime(900, t); flt.frequency.linearRampToValueAtTime(1900, t + .08); flt.Q.value = 1.5;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .05); g.gain.setValueAtTime(v, t + Math.max(.06, dur - .08)); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .05);
      const g2 = AC.createGain(); g2.gain.value = .3; o.connect(flt); o2.connect(g2); g2.connect(flt); flt.connect(g); g.connect(bus);
      noise(bus, t, .07, 'bandpass', 2500, 1, v * .5);
      for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + dur + .1); }
    }
    let venue = null;
    // name: which track; level 0..1; inside: full sound, otherwise muffled as if through walls
    A.venue = function (name, level, inside) {
      if (!ok()) return;
      const t = AC.currentTime;
      if (!venue) {
        const bus = AC.createGain(), flt = AC.createBiquadFilter(), out = AC.createGain();
        bus.gain.value = .55; flt.type = 'lowpass'; flt.frequency.value = 600; out.gain.value = 0;
        bus.connect(flt); flt.connect(out); out.connect(master);
        venue = { bus, flt, out, timer: 0, next: 0, step: 0, level: 0, name: null };
      }
      if (!TRACKS[name]) level = 0;
      if (name && name !== venue.name && TRACKS[name]) { venue.name = name; venue.step = 0; venue.next = t + .08; }
      venue.out.gain.setTargetAtTime(level * .8, t, .25);
      venue.flt.frequency.setTargetAtTime(inside ? 15000 : 380 + level * 900, t, .25);
      if (level > .005 && !venue.timer) {
        venue.next = Math.max(venue.next, t + .06);
        venue.timer = setInterval(() => {
          if (!AC || AC.state !== 'running' || !TRACKS[venue.name]) return;
          const tr = TRACKS[venue.name], step = 60 / tr.bpm / 4;
          if (venue.next < AC.currentTime) venue.next = AC.currentTime + .02;
          while (venue.next < AC.currentTime + .18) { tr.step(venue.step++, venue.next, venue.bus); venue.next += step; }
        }, 40);
      } else if (level <= .005 && venue.timer && venue.level <= .005) { clearInterval(venue.timer); venue.timer = 0; }
      venue.level = level;
    };
    A.club = (level, inside) => A.venue('club', level, inside);
    // bank alarm bell: a hard ringing tone chopped by a fast tremolo
    let alarm = null;
    A.alarm = function (on) {
      if (!ok()) return;
      if (!alarm && on) {
        const o = AC.createOscillator(), trem = AC.createOscillator(), depth = AC.createGain(), am = AC.createGain(), g = AC.createGain(), f = AC.createBiquadFilter();
        o.type = 'square'; o.frequency.value = 1150; trem.type = 'square'; trem.frequency.value = 14;
        depth.gain.value = .5; am.gain.value = .5; g.gain.value = 0;   // am swings 0..1, g is the on/off level
        f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
        trem.connect(depth); depth.connect(am.gain); o.connect(f); f.connect(am); am.connect(g); g.connect(master); o.start(); trem.start();
        alarm = { g };
      }
      if (alarm) alarm.g.gain.setTargetAtTime(on ? .05 : 0, AC.currentTime, .05);
    };
    // helicopter: the recorded blades, faster and louder with the spool and the climb. Stand-in: filtered noise
    // chopped by a pulse over a turbine whine
    let rotorV = null, rotorRec = null;
    A.rotor = function (level, pitch) {
      if (!ok()) return;
      const t = AC.currentTime;
      if (!rotorRec && has('heli') && level > .01) { rotorRec = loopVoice('heli', { lp: 6000 }); if (rotorV) rotorV.out.gain.setTargetAtTime(0, t, .1); }
      if (rotorRec) {
        rotorRec.g.gain.setTargetAtTime(Math.min(1, level) * .8, t, .15);
        rotorRec.src.playbackRate.setTargetAtTime(Math.max(.4, Math.min(1.6, .45 + level * .55 * pitch)), t, .2);
        return;
      }
      if (!rotorV && level > .01) {
        const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const bp = AC.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 420; bp.Q.value = 1.2;
        const chop = AC.createGain(), lfo = AC.createOscillator(), depth = AC.createGain();
        lfo.type = 'sawtooth'; lfo.frequency.value = 5; depth.gain.value = .5; chop.gain.value = .55;
        lfo.connect(depth); depth.connect(chop.gain);
        const out = AC.createGain(); out.gain.value = 0;
        src.connect(bp); bp.connect(chop); chop.connect(out);
        const whine = AC.createOscillator(), wf = AC.createBiquadFilter(), wg = AC.createGain();
        whine.type = 'sawtooth'; whine.frequency.value = 180; wf.type = 'bandpass'; wf.frequency.value = 900; wf.Q.value = 3; wg.gain.value = .12;
        whine.connect(wf); wf.connect(wg); wg.connect(out);
        out.connect(master); src.start(); lfo.start(); whine.start();
        rotorV = { out, lfo, whine };
      }
      if (!rotorV) return;
      rotorV.out.gain.setTargetAtTime(Math.min(1, level) * .55, t, .15);
      rotorV.lfo.frequency.setTargetAtTime(2 + level * 9 * pitch, t, .2);
      rotorV.whine.frequency.setTargetAtTime(90 + level * 380 * pitch, t, .25);
    };
    // water: a splash when jumping in, a swish for each swimming stroke
    A.splash = function (big) {
      if (!ok()) return;
      if (play(big ? 'splashBig' : 'splash', { vol: big ? .9 : .6 })) return;
      const t = AC.currentTime, d = out(null);
      noise(d, t, big ? .9 : .5, 'lowpass', big ? 2600 : 1800, .7, big ? .55 : .3, 300);
      noise(d, t + .03, big ? .6 : .35, 'bandpass', 900, 1.2, big ? .35 : .2, 200);
      tone(d, t, .18, 'sine', big ? 120 : 160, big ? .35 : .15, 50);
    };
    A.stroke = function () {
      if (!ok()) return;
      if (play(variant('stroke', 2), { vol: .3, lp: 3000 })) return;
      const t = AC.currentTime, d = out(null); noise(d, t, .32, 'bandpass', 700 + Math.random() * 400, 1.1, .09, 250);
    };
    // slot machine reel tick and roulette ball
    A.tick = function () { if (!ok()) return; const d = out(null); noise(d, AC.currentTime, .015, 'bandpass', 3500, 3, .25); };

    // an explosion: the recording over a deep thump of its own (phones' speakers lose the low end of a recording)
    A.explosion = function (pos) {
      if (!ok()) return; const t = AC.currentTime, d = out(pos);
      tone(d, t, .9, 'sine', 90, .7, 28);
      if (play('explosion', { pos, vol: 1, rate: .85 + Math.random() * .2 })) return;
      noise(d, t, 1.8, 'lowpass', 2400, .6, .9, 90);
      noise(d, t + .05, .5, 'bandpass', 700, .8, .5, 200);
      for (let k = 0; k < 8; k++) noise(d, t + .4 + Math.random() * 1.2, .05, 'highpass', 2500, 1, .12);
    };

    /* ---------- weather ---------- */
    // rain: a recorded downpour, louder the harder it rains (stand-in: a bed of filtered noise)
    let rainV = null, rainRec = null;
    A.rain = function (level) {
      if (!ok()) return;
      const t = AC.currentTime;
      if (!rainRec && has('rain') && level > .01) { rainRec = loopVoice('rain'); if (rainV) rainV.g.gain.setTargetAtTime(0, t, .3); }
      if (rainRec) { rainRec.g.gain.setTargetAtTime(Math.min(1, level) * .7 * (indoors ? .35 : 1), t, .5); rainRec.f.frequency.setTargetAtTime(indoors ? 900 : 20000, t, .3); return; }
      if (!rainV) {
        const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
        const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
        const g = AC.createGain(); g.gain.value = 0; s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master); s.start();
        rainV = { g };
      }
      rainV.g.gain.setTargetAtTime(Math.min(1, level) * .16, t, .4);
    };
    // thunder: a crack close by, a long rolling rumble further off
    A.thunder = function (dist) {
      if (!ok()) return; const t = AC.currentTime, d = out(null), near = Math.max(0, 1 - dist / 300);
      if (near > .5) noise(d, t, .25, 'highpass', 1500, .7, .35 * near);
      noise(d, t, 3.2, 'lowpass', 180 + near * 300, .8, .55 + near * .3, 50);
      noise(d, t + .4, 2.4, 'lowpass', 120, 1, .35, 40);
    };

    /* ---------- animals ---------- */
    // a gull's "kyow-kyow": a squawk sliding down, twice or three times
    A.gull = function (pos) {
      if (!ok()) return; const t0 = AC.currentTime, d = out(pos), n = 2 + ((Math.random() * 2) | 0), f0 = 1300 + Math.random() * 500;
      for (let k = 0; k < n; k++) {
        const t = t0 + k * (.22 + Math.random() * .08), o = AC.createOscillator(), flt = AC.createBiquadFilter(), g = AC.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * (k ? .95 : 1.05), t); o.frequency.exponentialRampToValueAtTime(f0 * .62, t + .17);
        flt.type = 'bandpass'; flt.frequency.value = 2000; flt.Q.value = 2.5; env(g, t, .015, .09, .2);
        o.connect(flt); flt.connect(g); g.connect(d); o.start(t); o.stop(t + .22);
      }
    };
    // pigeons taking off: a clatter of wings
    A.flutter = function (pos) {
      if (!ok()) return; const t = AC.currentTime, d = out(pos);
      for (let k = 0; k < 10; k++) noise(d, t + k * .045 + Math.random() * .02, .04, 'bandpass', 700 + Math.random() * 600, 1.2, .22 * (1 - k / 12));
    };
    // woof (woof): a bigger dog barks lower
    A.bark = function (pos, size) {
      if (!ok()) return; const t0 = AC.currentTime, d = out(pos), f = 430 / Math.max(.5, size || 1), n = Math.random() < .5 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const t = t0 + k * .2, o = AC.createOscillator(), flt = AC.createBiquadFilter(), g = AC.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.25, t); o.frequency.exponentialRampToValueAtTime(f * .75, t + .11);
        flt.type = 'bandpass'; flt.frequency.value = f * 2.4; flt.Q.value = 1.2; env(g, t, .006, .3, .13);
        o.connect(flt); flt.connect(g); g.connect(d); o.start(t); o.stop(t + .15);
        noise(d, t, .07, 'bandpass', f * 3, 1.5, .18);
      }
    };
    A.yelp = function (pos) {
      if (!ok()) return; const t = AC.currentTime, d = out(pos), o = AC.createOscillator(), g = AC.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(900, t); o.frequency.linearRampToValueAtTime(1500, t + .08); o.frequency.exponentialRampToValueAtTime(650, t + .35);
      env(g, t, .01, .22, .38); o.connect(g); g.connect(d); o.start(t); o.stop(t + .4);
    };
    A.whine = function (pos) {
      if (!ok()) return; const t = AC.currentTime, d = out(pos), o = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(), g = AC.createGain();
      o.type = 'sine'; o.frequency.value = 760; lfo.frequency.value = 4; lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency);
      env(g, t, .15, .12, 1.3); o.connect(g); g.connect(d); o.start(t); lfo.start(t); o.stop(t + 1.35); lfo.stop(t + 1.35);
    };
    // a pleased dog: a couple of snuffles and a little whine
    A.happyDog = function (pos) {
      if (!ok()) return; const t = AC.currentTime, d = out(pos);
      noise(d, t, .08, 'bandpass', 1200, 2, .15); noise(d, t + .14, .08, 'bandpass', 1300, 2, .12);
      const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(900, t + .3); o.frequency.linearRampToValueAtTime(1150, t + .55);
      env(g, t + .3, .04, .08, .3); o.connect(g); g.connect(d); o.start(t + .3); o.stop(t + .65);
    };

    /* ---------- the street ---------- */
    A.splashAt = function (pos) {
      if (!ok()) return;
      if (play(has('splash') ? 'splash' : 'splashS', { pos, vol: .8 })) return;
      const t = AC.currentTime, d = out(pos);
      noise(d, t, .6, 'lowpass', 2200, .7, .4, 300); noise(d, t + .03, .4, 'bandpass', 900, 1.2, .25, 200);
    };
    // a wave building and breaking under a surfer
    A.wave = function (pos) {
      if (!ok()) return;
      if (play('wave' + (1 + ((Math.random() * 3) | 0)), { pos, vol: 1 })) return;
      const t = AC.currentTime, d = out(pos); noise(d, t, 1.8, 'lowpass', 300, .8, .25, 1400);
    };
    // a volleyball: slap of a hand, or a soft thud on the sand
    A.volley = function (pos, sand) {
      if (!ok()) return; const t = AC.currentTime, d = out(pos);
      if (sand) { noise(d, t, .1, 'lowpass', 500, .7, .25); return; }
      noise(d, t, .05, 'bandpass', 1800, 1.5, .35); tone(d, t, .08, 'sine', 220, .2, 110);
    };
    // the spray shop: the roller door rattling, then the guns hissing
    A.rollerDoor = function () {
      if (!ok()) return; const t = AC.currentTime, d = out(null);
      for (let k = 0; k < 22; k++) noise(d, t + k * .05, .04, 'bandpass', 380 + Math.random() * 200, 2, .16);
      noise(d, t + 1.1, .12, 'lowpass', 300, 1, .4); tone(d, t + 1.1, .12, 'sine', 70, .3, 40);
    };
    A.spray = function (dur) {
      if (!ok()) return; const t = AC.currentTime, d = out(null);
      const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const flt = AC.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 2500;
      const g = AC.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.22, t + .15);
      for (let k = 1; k < 5; k++) g.gain.setTargetAtTime(k % 2 ? .08 : .22, t + k * dur / 5, .05);
      g.gain.setTargetAtTime(.0001, t + dur - .15, .06);
      s.connect(flt); flt.connect(g); g.connect(d); s.start(t); s.stop(t + dur + .2);
    };

    // two siren voices that follow the nearest police cars: a wailing oscillator driven by a slow LFO
    const sirenV = [];
    A.sirens = function (list) {
      if (!ok()) return;
      while (sirenV.length < 2) {
        const o = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(), f = AC.createBiquadFilter(), g = AC.createGain(), p = AC.createPanner();
        o.type = 'square'; o.frequency.value = 950; lfo.frequency.value = .55 + sirenV.length * .07; lg.gain.value = 380;
        lfo.connect(lg); lg.connect(o.frequency); f.type = 'lowpass'; f.frequency.value = 2200; g.gain.value = 0;
        p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 8; p.rolloffFactor = 1.1;
        o.connect(f); f.connect(g); g.connect(p); p.connect(master); o.start(); lfo.start();
        sirenV.push({ g, p });
      }
      sirenV.forEach((v, i) => {
        const pos = list[i];
        v.g.gain.setTargetAtTime(pos ? .09 : 0, AC.currentTime, .1);
        if (pos) { if (v.p.positionX) { v.p.positionX.value = pos[0]; v.p.positionY.value = pos[1]; v.p.positionZ.value = pos[2]; } else v.p.setPosition(pos[0], pos[1], pos[2]); }
      });
    };
    /* ---------- the hero's footsteps, the city around, the traffic going by ---------- */
    // surface: 'stone' (streets), 'sand', 'floor' (indoors); run: 0..1
    A.step = function (surface, run) {
      if (!ok()) return;
      const base = surface === 'sand' ? 'stepS' : surface === 'floor' ? 'stepW' : 'stepC';
      play(variant(base, 4), { vol: (surface === 'sand' ? .2 : .26) + run * .18, rate: .95 + run * .1, lp: surface === 'sand' ? 2500 : 0 });
    };
    // the background: o = { sea 0..1, inside, inCar } — waves on the shore
    let indoors = false, waveT = 0;
    A.ambience = function (o, dt) {
      if (!ok()) return;
      indoors = !!o.inside;
      // waves breaking now and then while you're by the water
      if ((waveT -= dt || 0) <= 0) {
        waveT = 3 + Math.random() * 4;
        if (!o.inside && (o.sea || 0) > .05) play('wave' + (1 + ((Math.random() * 3) | 0)), { vol: Math.min(1, o.sea) * (o.inCar ? .35 : .7), lp: o.inCar ? 1200 : 0 });
      }
    };
    // two voices for the nearest moving cars of the traffic: list of [x, y, z, speed 0..1]
    const traffic = [];
    A.traffic = function (list) {
      if (!ok() || !has('eng1')) return;
      while (traffic.length < 2) traffic.push(loopVoice('eng1', { pan: true, ref: 5, lp: 2200 }));
      const t = AC.currentTime;
      traffic.forEach((v, i) => {
        const c = list[i];
        v.g.gain.setTargetAtTime(c ? .22 + c[3] * .3 : 0, t, .25);
        if (c) { setPos(v.p, c[0], c[1], c[2]); v.src.playbackRate.setTargetAtTime(.8 + c[3] * .9, t, .2); v.f.frequency.setTargetAtTime(1200 + c[3] * 2500, t, .2); }
      });
    };
    return A;
  };
})(window.NB);
