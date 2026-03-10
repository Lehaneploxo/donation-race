// ─── Ambient Music Generator ─────────────────────────────────────────────────
// Peaceful pentatonic melody + bass drone using Web Audio API

const Music = (function() {
  let ctx = null, masterGain = null;
  let playing = false;
  let scheduledNodes = [];

  // Pentatonic scale (C major penta): C D E G A  — calm, universal
  const NOTES = [261.63, 293.66, 329.63, 392.00, 440.00,
                 523.25, 587.33, 659.25, 783.99, 880.00];

  // Gentle melodic pattern (indices into NOTES)
  const PATTERN = [0, 2, 4, 5, 4, 2, 1, 0, 2, 4, 7, 5, 4, 2, 0, 1];
  let patStep = 0;

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 3);
    masterGain.connect(ctx.destination);
    startDrone();
    schedulePattern();
  }

  // ── Soft sine tone ──────────────────────────────────────────────────────────
  function playTone(freq, startTime, duration, vol, type) {
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    var rev  = createReverb();

    osc.type = type || 'sine';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.08);
    gain.gain.setValueAtTime(vol, startTime + duration * 0.6);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(rev);
    rev.connect(masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
    scheduledNodes.push(osc);
    return osc;
  }

  // ── Simple delay-based reverb ───────────────────────────────────────────────
  function createReverb() {
    var delay = ctx.createDelay(0.6);
    var fb    = ctx.createGain();
    var dry   = ctx.createGain();
    delay.delayTime.value = 0.35;
    fb.gain.value = 0.38;
    dry.gain.value = 1;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(masterGain);
    return dry;
  }

  // ── Bass drone (low C + G power chord, very soft) ──────────────────────────
  function startDrone() {
    [65.41, 98.00, 130.81].forEach(function(freq, i) {
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.06 - i * 0.015, ctx.currentTime + 4);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();
      scheduledNodes.push(osc);
    });
  }

  // ── Schedule melodic pattern ────────────────────────────────────────────────
  function schedulePattern() {
    if (!playing) return;
    var now      = ctx.currentTime;
    var step     = 1.15;   // seconds between notes
    var ahead    = 8;      // schedule this many notes ahead

    for (var i = 0; i < ahead; i++) {
      var t    = now + i * step;
      var idx  = PATTERN[(patStep + i) % PATTERN.length];
      var freq = NOTES[idx];
      playTone(freq, t, step * 1.6, 0.12, 'sine');

      // Occasional soft high harmony
      if ((patStep + i) % 5 === 0) {
        playTone(freq * 1.5, t + step * 0.5, step, 0.05, 'sine');
      }
    }
    patStep = (patStep + ahead) % PATTERN.length;

    // Re-schedule before buffer runs out
    setTimeout(schedulePattern, (ahead - 2) * step * 1000);
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  return {
    start: function() {
      if (playing) return;
      playing = true;
      if (!ctx) {
        init();
      } else {
        ctx.resume();
        masterGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.5);
        schedulePattern();
      }
    },

    stop: function() {
      if (!playing) return;
      playing = false;
      if (masterGain) {
        masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      }
    },

    toggle: function() {
      if (playing) this.stop(); else this.start();
      return playing;
    },

    isPlaying: function() { return playing; }
  };
})();
