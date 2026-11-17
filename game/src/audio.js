// All sound is synthesized live with WebAudio: engine hum, two-tone siren,
// gunshots, chimes, jingles and a quiet sunset pad. Nothing is loaded from
// disk, so the game has no audio assets at all.
//
// Every call is guarded — if the context is suspended, missing, or the
// browser refuses to start one, the game just stays quiet instead of
// throwing. The two primitive voices (blip, noise) cover every one-shot;
// the three loops (engine, siren, pad) are built once in start().
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenPhase = 0;
  let padOsc = [];
  let padGain = null;
  let padChord = 0;
  let padTimer = 0;
  let noiseBuf = null;
  let started = false;

  /** Build the context and master bus on first use. False when impossible. */
  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  /** Start the three loops (engine, siren, pad). Safe to call repeatedly. */
  function start() {
    if (started || !ensure()) return;
    started = true;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 82;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();
    // Siren: one sine that alternates tone twice a second.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    // Sunset pad: three quiet triangles, chord changes every few seconds.
    padGain = ctx.createGain();
    padGain.gain.value = 0.045;
    padGain.connect(master);
    for (let i = 0; i < 3; i += 1) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.connect(padGain);
      o.start();
      padOsc.push(o);
    }
    setPadChord(0);
  }

  // Am — F — G — Em, the sunset progression, as note frequencies.
  const CHORDS = [
    [220, 261.6, 329.6],
    [174.6, 220, 261.6],
    [196, 246.9, 293.7],
    [146.8, 220, 293.7],
  ];
  function setPadChord(i) {
    if (!ctx) return;
    const chord = CHORDS[i % CHORDS.length];
    chord.forEach((f, k) => padOsc[k].frequency.setTargetAtTime(f, ctx.currentTime, 0.8));
  }

  /** One short oscillator tone that decays to silence. */
  function blip(freq, dur, type = 'square', vol = 0.16) {
    if (!ensure()) return;
    try {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + dur + 0.02);
    } catch {
      /* quiet */
    }
  }

  /** One burst of filtered noise that decays to silence. */
  function noise(dur, filterFreq, vol = 0.3) {
    if (!ensure()) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start();
      src.stop(ctx.currentTime + dur + 0.02);
    } catch {
      /* quiet */
    }
  }

  /** A little arpeggio helper: play freqs in sequence, `step` ms apart. */
  function arpeggio(freqs, stepMs, dur, type, vol) {
    freqs.forEach((f, i) => setTimeout(() => blip(f, dur, type, vol), i * stepMs));
  }

  return {
    start,
    shot() {
      noise(0.14, 2400, 0.4);
      blip(160, 0.08, 'square', 0.2);
    },
    enemyShot() {
      noise(0.12, 1800, 0.16);
    },
    hit() {
      blip(1150, 0.05, 'square', 0.14);
    },
    kill() {
      blip(660, 0.09, 'square', 0.16);
      setTimeout(() => blip(990, 0.12, 'square', 0.16), 90);
    },
    pickup() {
      blip(660, 0.1, 'sine', 0.2);
      setTimeout(() => blip(990, 0.16, 'sine', 0.2), 100);
    },
    crash() {
      noise(0.3, 900, 0.4);
    },
    // Tyre squeal for a handbrake slide: short band-passed noise.
    skid() {
      if (!ensure()) return;
      try {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1100;
        f.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.16, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        src.connect(f);
        f.connect(g);
        g.connect(master);
        src.start();
        src.stop(ctx.currentTime + 0.37);
      } catch {
        /* quiet */
      }
    },
    mission() {
      arpeggio([523, 659, 784, 1046], 110, 0.16, 'triangle', 0.2);
    },
    busted() {
      arpeggio([392, 330, 262], 200, 0.3, 'sawtooth', 0.14);
    },
    setEngine(speed01, driving) {
      if (!ctx || !engineGain) return;
      const target = driving ? 0.05 + speed01 * 0.075 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.12);
      const f = 52 + speed01 * 130;
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(f * 1.5, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(380 + speed01 * 900, ctx.currentTime, 0.1);
    },
    update(dt, wanted, policeNear) {
      if (!ctx) return;
      // Siren wails while the heat is on and a cruiser is close.
      const sirenTarget = wanted > 0 && policeNear ? 0.045 : 0;
      if (sirenGain) {
        sirenGain.gain.setTargetAtTime(sirenTarget, ctx.currentTime, 0.2);
        if (sirenTarget > 0) {
          sirenPhase += dt;
          sirenOsc.frequency.setTargetAtTime(
            sirenPhase % 1 < 0.5 ? 715 : 950,
            ctx.currentTime,
            0.05,
          );
        }
      }
      padTimer += dt;
      if (padTimer > 5) {
        padTimer = 0;
        padChord += 1;
        setPadChord(padChord);
      }
    },
  };
}
