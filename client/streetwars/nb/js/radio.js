// Car radio: five stations of original 80s-style music, synthesised on the fly. Every song is generated
// from its own seed (key, tempo, chord progressions, a verse and a chorus melody) and has a structure:
// intro, verse, chorus, verse, chorus, outro. Between songs a station jingle plays and the DJ (the browser's
// speech voice, in English) talks over the next intro. Plays only while you're in a vehicle.
(function (NB) {
  'use strict';
  const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  // chord progressions as scale degrees (0 = the key's own chord)
  const PROG = { maj: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [3, 0, 4, 5], [0, 3, 5, 4], [0, 2, 3, 4]], min: [[0, 5, 6, 0], [0, 3, 5, 4], [0, 6, 5, 6], [0, 5, 2, 6], [0, 3, 6, 4]] };
  const WORD1 = ['Midnight', 'Electric', 'Neon', 'Ocean', 'Crazy', 'Golden', 'Tropical', 'Lonely', 'Wild', 'Summer', 'Pink', 'Burning', 'Silver', 'Endless', 'Dangerous', 'Sweet'];
  const WORD2 = ['Drive', 'Heart', 'Lights', 'Love', 'Dream', 'Fever', 'City', 'Nights', 'Girl', 'Boulevard', 'Paradise', 'Rain', 'Sunset', 'Highway', 'Kiss', 'Radio'];
  const STATIONS = [
    { name: 'FLASH 88', style: 'pop', bpm: [112, 124], minor: .3, dens: .45, rate: 1.08, pitch: 1.1,
      artists: ['Neon Hearts', 'The Palm Tones', 'Crystal Avenue', 'Laser Kids', 'Mandy Starr'],
      dj: ['This is Flash eighty-eight, the brightest hits in Neploxo City!', 'Flash eighty-eight. Keep it locked, keep it loud!', 'You are cruising with Flash eighty-eight. Here is {artist} with {title}!'] },
    { name: 'WAVE 103', style: 'wave', bpm: [126, 138], minor: .85, dens: .4, rate: .95, pitch: .8,
      artists: ['Cold Mirrors', 'Static Division', 'The Glass Faces', 'Vector Nine', 'Black Orchid'],
      dj: ['Wave one oh three. New wave, new sounds, no apologies.', 'Cold synths for hot nights. This is Wave one oh three.', 'Next up, {artist}. {title}.'] },
    { name: 'FEVER 105', style: 'disco', bpm: [112, 120], minor: .5, dens: .45, rate: 1.1, pitch: 1.2,
      artists: ['Boogie Mercury', 'The Velvet Groove', 'Sister Sunshine', 'Disco Dynamite', 'Funkadelic Five'],
      dj: ['Fever one oh five! Get up and dance, Neploxo City!', 'Oh, it is getting hot in here. Fever one oh five!', 'Put on your dancing shoes, here is {artist}!'] },
    { name: 'K-ROCK 97', style: 'rock', bpm: [128, 150], minor: .6, dens: .35, rate: 1.05, pitch: .7,
      artists: ['Iron Coyote', 'Steel Rattler', 'The Loud Boys', 'Thunder Road', 'Mad Dog Rex'],
      dj: ['K rock ninety seven! Turn it up to eleven!', 'Only real rock on K rock ninety seven.', 'Crank it up! {artist}, {title}!'] },
    { name: 'EMOTION 98', style: 'ballad', bpm: [68, 82], minor: .4, dens: .35, rate: .88, pitch: .95,
      artists: ['Johnny Velvet', 'Diana Rose', 'Silk and Satin', 'The Moonlighters', 'Grace Monroe'],
      dj: ['Emotion ninety eight, for lovers on the ocean drive.', 'Slow down, baby. This is Emotion ninety eight.', 'Here is a little something for the night. {title}, by {artist}.'] }
  ];
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const note = (s, deg, oct) => s.root + oct + s.sc[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
  // the chord tone nearest to a melody degree, so the tune lands on the harmony on the strong beats
  const snap = (deg, tri) => { let best = deg, bd = 99; for (const c of tri) for (let k = -2; k <= 2; k++) { const d = c + 7 * k, e = Math.abs(d - deg); if (e < bd) { bd = e; best = d; } } return best; };

  function makeSong(si, seed) {
    const st = STATIONS[si], R = rng(seed), pick = a => a[(R() * a.length) | 0];
    const minor = R() < st.minor, P = PROG[minor ? 'min' : 'maj'];
    const verse = pick(P); let chorus = pick(P); if (chorus === verse) chorus = P[(P.indexOf(verse) + 1) % P.length];
    // a two-bar melody: [sixteenth, degree, length]
    const phrase = (lo, span, dens) => {
      const out = []; let deg = lo + ((R() * span) | 0);
      for (let x = 0; x < 32;) {
        const strong = x % 4 === 0;
        if (R() < (strong ? dens + .3 : dens)) {
          const len = Math.min(32 - x, pick(x % 8 === 0 ? [2, 3, 4, 6] : [1, 2, 2, 3]));
          deg = Math.max(lo, Math.min(lo + span, deg + pick([-2, -1, -1, 0, 1, 1, 2, -3, 3])));
          out.push([x, deg, len]); x += len;
        } else x += strong ? 2 : 1;
      }
      return out;
    };
    const d = st.dens;
    const secs = [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['outro', 4]], map = [];
    for (const [k, b] of secs) for (let i = 0; i < b; i++) map.push([k, i]);
    return { st, si, minor, sc: minor ? MIN : MAJ, bpm: st.bpm[0] + Math.round(R() * (st.bpm[1] - st.bpm[0])), root: 38 + ((R() * 9) | 0),
      verse, chorus, mel: { verse: [phrase(2, 6, d), phrase(2, 6, d)], chorus: [phrase(5, 6, d + .12), phrase(4, 7, d + .12)] },
      map, bars: map.length, artist: pick(st.artists), title: pick(WORD1) + ' ' + pick(WORD2) };
  }

  NB.RADIO_STATIONS = STATIONS.map(s => s.name);
  NB.createRadio = function (audio) {
    let AC = null, out = null, dly = null, dist = null, songOut = null, timer = 0;
    let on = false, song = null, step = 0, next = 0, gapUntil = 0;
    const OFF = STATIONS.length, seedBase = (Math.random() * 100000) | 0, count = STATIONS.map(() => 0);
    let idx = (Math.random() * OFF) | 0;
    try { const v = localStorage.getItem('nb_radio'); if (v != null && +v >= 0 && +v <= OFF) idx = +v; } catch (e) {}
    const R = {};
    try { if (window.speechSynthesis) speechSynthesis.getVoices(); } catch (e) {}

    function setup() {
      AC = audio.ctx(); if (!AC) return false; if (out) return true;
      out = AC.createGain(); out.gain.value = 0;
      const tone = AC.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 7500;
      out.connect(tone); tone.connect(audio.bus());
      dly = AC.createDelay(1.5); const fb = AC.createGain(), wet = AC.createGain(); fb.gain.value = .3; wet.gain.value = .2;
      dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(out);
      dist = AC.createWaveShaper(); const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) c[i] = Math.tanh((i / 512 - 1) * 7) * .5; dist.curve = c;
      const dg = AC.createGain(); dg.gain.value = .55; dist.connect(dg); dg.connect(out);
      return true;
    }

    /* ---------- instruments ---------- */
    function env(g, t, a, peak, dur) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
    // one note: o.cut (+cut2) lowpass, o.vib vibrato depth, o.a attack, o.sus hold then release, o.send echo, o.to another destination
    function osc(type, f, t, dur, peak, o) {
      o = o || {};
      const x = AC.createOscillator(), g = AC.createGain(); x.type = type; x.frequency.value = f; if (o.det) x.detune.value = o.det;
      let node = x;
      if (o.cut) { const fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.cut, t); if (o.cut2) fl.frequency.exponentialRampToValueAtTime(o.cut2, t + Math.max(.05, dur)); fl.Q.value = o.q || 1; x.connect(fl); node = fl; }
      if (o.vib) { const l = AC.createOscillator(), lg = AC.createGain(); l.frequency.value = 5.4; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * o.vib, t + Math.min(.35, dur)); l.connect(lg); lg.connect(x.frequency); l.start(t); l.stop(t + dur + .2); }
      const a = o.a || .005, rel = o.rel || .08;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a);
      if (o.sus) { g.gain.setValueAtTime(peak, t + Math.max(a + .01, dur - .05)); g.gain.exponentialRampToValueAtTime(.0001, t + dur + rel); }
      else g.gain.exponentialRampToValueAtTime(.0001, t + Math.max(a + .02, dur));
      node.connect(g); g.connect(o.to || songOut); if (o.send) g.connect(dly);
      x.start(t); x.stop(t + dur + rel + .05);
    }
    function hiss(t, dur, type, f, q, peak, dest, f2) {
      const s = AC.createBufferSource(); s.buffer = audio.noiseBuf();
      const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
      const g = AC.createGain(); env(g, t, .003, peak, dur); s.connect(fl); fl.connect(g); g.connect(dest || songOut); s.start(t, Math.random()); s.stop(t + dur + .05);
      return g;
    }
    const kick = (t, v) => { const x = AC.createOscillator(), g = AC.createGain(); x.frequency.setValueAtTime(150, t); x.frequency.exponentialRampToValueAtTime(42, t + .12); env(g, t, .002, v, .26); x.connect(g); g.connect(songOut); x.start(t); x.stop(t + .3); };
    const snare = (t, v, big) => { const g = hiss(t, big ? .28 : .14, 'bandpass', 1700, .7, v); if (big) g.connect(dly); osc('triangle', 185, t, .09, v * .5); };
    const clap = (t, v) => { for (const k of [0, .011, .023]) hiss(t + k, .1, 'bandpass', 1400, 1.2, v); };
    const hat = (t, v, open) => hiss(t, open ? .16 : .035, 'highpass', 8000, .7, v);
    const tom = (t, f, v) => { const x = AC.createOscillator(), g = AC.createGain(); x.frequency.setValueAtTime(f, t); x.frequency.exponentialRampToValueAtTime(f * .55, t + .25); env(g, t, .003, v, .3); x.connect(g); g.connect(songOut); g.connect(dly); x.start(t); x.stop(t + .32); };
    const crash = (t, v) => hiss(t, 1.3, 'highpass', 5000, .5, v);

    /* ---------- one sixteenth of a song ---------- */
    function play(s, n, t) {
      const bar = (n / 16) | 0, x = n % 16, [sec, bi] = s.map[bar], style = s.st.style;
      const c = (sec === 'chorus' ? s.chorus : s.verse)[bi % 4], tri = [c, c + 2, c + 4];
      const bassM = note(s, c, 0), chordM = tri.map(d => note(s, d, 24)), spb = 60 / s.bpm, q = spb / 4;
      const ch = sec === 'chorus', last = bi === (sec === 'intro' || sec === 'outro' ? 3 : 7), fill = last && x >= 12 && sec !== 'outro';
      if (bi === 0 && x === 0 && sec !== 'intro') crash(t, style === 'ballad' ? .05 : .1);
      const drumsIn = sec !== 'intro' || bi >= 2;
      switch (style) {
        case 'pop':
          if (fill) { tom(t, [220, 180, 150, 120][x - 12], .35); break; }
          if (x === 0 || x === 8 || (x === 10 && bi % 2)) kick(t, .75);
          if (drumsIn && (x === 4 || x === 12)) snare(t, .32, true);
          if (x % 2 === 0) hat(t, .045);
          if (x % 2 === 0) osc('sawtooth', hz(bassM + (x % 4 === 2 ? 12 : 0)), t, q * 1.8, .2, { cut: 950, cut2: 240 });
          if (x === 0) for (const m of chordM) osc('sawtooth', hz(m), t, spb * 3.9, .018, { cut: 1700, a: .08, sus: true, det: (Math.random() - .5) * 12 });
          if (ch && (x === 6 || x === 14)) for (const m of chordM) osc('square', hz(m + 12), t, q * 1.5, .022, { cut: 2600 });
          break;
        case 'wave':
          if (fill) { snare(t, .22 + (x - 12) * .04); break; }
          if (x % 4 === 0) kick(t, .8);
          if (drumsIn && (x === 4 || x === 12)) snare(t, .3);
          hat(t, x % 2 ? .022 : .045);
          osc('sawtooth', hz(bassM + (x % 4 === 3 ? 12 : 0)), t, q * .9, .15, { cut: 1300, cut2: 300 });
          if (drumsIn) osc('square', hz(chordM[x % 3] + (x % 6 < 3 ? 0 : 12)), t, q * .8, .02, { cut: 2600, send: true });
          if (ch && x === 0) for (const m of chordM) osc('sawtooth', hz(m - 12), t, spb * 3.9, .016, { cut: 1200, a: .15, sus: true });
          break;
        case 'disco':
          if (x % 4 === 0) kick(t, .85);
          if (drumsIn && (x === 4 || x === 12)) clap(t, .22);
          hat(t, x % 4 === 2 ? .06 : .02, x % 4 === 2);
          if (x % 2 === 0) osc('sawtooth', hz(bassM + (x % 4 === 2 ? 12 : 0)), t, q * 1.5, .24, { cut: 1000, cut2: 220 });
          if (x === 6 || x === 14) for (const m of chordM) osc('square', hz(m), t, q * 1.4, .028, { cut: 2400 });
          if (ch && x === 0) for (const m of chordM) osc('sawtooth', hz(m + 12), t, spb * 3.9, .014, { cut: 3000, a: .3, sus: true, vib: .004 });
          if (fill && x % 2 === 0) tom(t, 260 - (x - 12) * 25, .25);
          break;
        case 'rock':
          if (x === 0 || x === 6 || x === 8) kick(t, .8);
          if (drumsIn && (x === 4 || x === 12)) snare(t, .38);
          if (x % 2 === 0) hat(t, .05, ch && x % 4 === 2);
          if (fill) tom(t, [200, 170, 140, 110][x - 12], .3);
          if (x % 2 === 0) osc('sawtooth', hz(bassM), t, q * 1.6, .2, { cut: 700 });
          if (ch) { if (x === 0 || x === 8) for (const k of [12, 19, 24]) osc('sawtooth', hz(bassM + k), t, spb * 1.9, .06, { to: dist, sus: true }); }
          else if (x % 2 === 0 && drumsIn) for (const k of [12, 19]) osc('sawtooth', hz(bassM + k), t, q * 1.1, .06, { to: dist, cut: 1400 });
          break;
        case 'ballad':
          if (x === 0 || (x === 10 && bi % 2)) kick(t, .55);
          if (drumsIn && x === 8) snare(t, .22, true);
          if (x % 2 === 0) hat(t, .018);
          if (x === 0) osc('triangle', hz(bassM), t, spb * 2, .3, { cut: 600, sus: true });
          if (x === 8) osc('triangle', hz(bassM + 7), t, spb * 2, .26, { cut: 600, sus: true });
          if (x === 0 || x === 8) for (const m of chordM) { osc('sine', hz(m), t, spb * 1.9, .04); osc('sine', hz(m + 12), t, spb * .8, .012); }
          if (x === 0) for (const m of chordM) osc('triangle', hz(m - 12), t, spb * 3.9, .016, { a: .4, sus: true });
          break;
      }
      // the tune, in the verses and choruses
      if (sec === 'verse' || sec === 'chorus') {
        const ph = s.mel[sec][(bi >> 1) % 2], pos = (bi % 2) * 16 + x;
        for (const [p, d0, len] of ph) if (p === pos) {
          const f = hz(note(s, pos % 8 === 0 ? snap(d0, tri) : d0, 24)), dur = len * q;
          if (style === 'pop') { osc('square', f, t, dur, ch ? .06 : .05, { cut: 3200, vib: .008, sus: true, send: true }); if (ch) osc('triangle', f / 2, t, dur, .04, { sus: true }); }
          else if (style === 'wave') { osc('sawtooth', f, t, dur, .035, { cut: 2300, sus: true, send: true, det: -7 }); osc('sawtooth', f, t, dur, .035, { cut: 2300, sus: true, det: 7 }); }
          else if (style === 'disco') osc('sawtooth', f, t, dur, .045, { cut: 2800, a: .03, vib: .008, sus: true, send: true });
          else if (style === 'rock') { osc('sawtooth', f, t, dur, .05, { to: dist, vib: .015, sus: true }); osc('square', f, t, dur, .015, { cut: 1800, sus: true, send: true }); }
          else osc('sawtooth', f, t, dur, .045, { cut: 1400, q: 1.3, a: .05, vib: .011, sus: true, send: true, rel: .2 });
        }
      }
    }

    /* ---------- the station: songs, jingles, the DJ ---------- */
    function label() {
      if (idx === OFF) return 'РАДИО ВЫКЛ';
      return STATIONS[idx].name + (song ? ' · ' + song.artist + ' — ' + song.title : '');
    }
    const changed = () => { if (R.onChange) R.onChange(label()); };
    function speak(text) {
      try {
        if (NB.radioNoDJ || !window.speechSynthesis || audio.volume() <= 0) return;   // NB.radioNoDJ: в Street Wars говорит только диктор игры
        const st = STATIONS[idx], u = new SpeechSynthesisUtterance(text);
        const v = speechSynthesis.getVoices().find(v => /^en[-_]US/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang));
        if (v) u.voice = v; u.lang = 'en-US'; u.rate = st.rate; u.pitch = st.pitch; u.volume = Math.min(1, .9 * audio.volume());
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      } catch (e) {}
    }
    const hush = () => { if (NB.radioNoDJ) return; try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} };
    function fadeOld() {
      if (!songOut) return; const g = songOut; songOut = null;
      g.gain.setTargetAtTime(.0001, AC.currentTime, .04); setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 3000);
    }
    function startSong(midway) {
      fadeOld();
      song = makeSong(idx, seedBase + idx * 7919 + (count[idx]++) * 104729);
      songOut = AC.createGain(); songOut.gain.value = 1; songOut.connect(out);
      dly.delayTime.value = 60 / song.bpm * .75;
      step = midway ? [4, 12, 20, 28][(Math.random() * 4) | 0] * 16 : 0; next = AC.currentTime + .06;
      if (!midway) { const st = STATIONS[idx]; speak(st.dj[(Math.random() * st.dj.length) | 0].replace('{artist}', song.artist).replace('{title}', song.title)); }
      changed();
    }
    function jingle() {
      const t = AC.currentTime + .05, root = 60 + idx * 2;
      hiss(t, .5, 'bandpass', 600, 1, .08, out, 6000);
      [0, 4, 7, 12].forEach((k, i) => osc(idx === 3 ? 'sawtooth' : 'square', hz(root + k), t + .12 + i * .13, i === 3 ? .6 : .14, .05, { to: idx === 3 ? dist : out, cut: 3500, send: true, sus: i === 3 }));
    }
    function tuning() { hiss(AC.currentTime, .35, 'bandpass', 2600, .6, .12, out, 900); }
    function tick() {
      if (!on || !AC || AC.state !== 'running' || idx === OFF) return;
      const now = AC.currentTime;
      if (!song) { if (now < gapUntil) return; startSong(false); }
      const q = 60 / song.bpm / 4;
      if (next < now) next = now + .02;
      while (next < now + .2) {
        if (step >= song.bars * 16) { fadeOld(); song = null; jingle(); gapUntil = now + 1.3; return; }
        const bar = (step / 16) | 0;
        if (step % 16 === 0 && song.map[bar][0] === 'outro' && song.map[bar][1] === 0) songOut.gain.setTargetAtTime(.0001, next + spbOf(song) * 4, spbOf(song) * 3);
        play(song, step, next); step++; next += q;
      }
    }
    const spbOf = s => 60 / s.bpm;
    function start() {
      if (!setup()) return;
      on = true; out.gain.setTargetAtTime(.85, AC.currentTime, .1);
      if (!timer) timer = setInterval(tick, 40);
      if (idx !== OFF) { tuning(); startSong(true); } else changed();
    }
    function stop() {
      on = false; hush();
      if (out) out.gain.setTargetAtTime(0, AC.currentTime, .05);
      if (AC) fadeOld(); song = null;
      if (timer) { clearInterval(timer); timer = 0; }
    }
    // on: whether the hero is in a vehicle and the game is running
    R.update = function (active) { if (active && !on) start(); else if (!active && on) stop(); };
    R.next = function () {
      idx = (idx + 1) % (OFF + 1);
      try { localStorage.setItem('nb_radio', String(idx)); } catch (e) {}
      hush();
      if (!on || !AC) { changed(); return; }
      if (idx === OFF) { fadeOld(); song = null; tuning(); changed(); return; }
      tuning(); startSong(true);
    };
    R.label = label;
    return R;
  };
})(window.NB);
