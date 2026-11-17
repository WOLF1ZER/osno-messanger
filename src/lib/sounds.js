// UI sounds made with the Web Audio API (no audio files):
// ringback while calling, ringtone for incoming calls, end-of-call tone, message ping.
// Browsers only allow sound after the user has tapped the page, so `unlockAudio()` is
// called on the first tap anywhere (see main.jsx) and again on call buttons.

let ctx = null;

const getCtx = () => {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
};

/** Call inside a click/tap handler: lets sounds and call audio play afterwards (iOS/Safari need this). */
export const unlockAudio = () => {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === "suspended") c.resume();
    // a 1-sample silent buffer "warms up" iOS
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  } catch {
    /* sound is optional */
  }
};

/** Play a list of notes: [{ f: Hz or [Hz, Hz], at: seconds, d: seconds }] */
const play = (notes, volume = 0.08) => {
  const c = getCtx();
  if (!c || c.state !== "running") return;
  const t0 = c.currentTime + 0.02;
  for (const { f, at = 0, d } of notes) {
    for (const freq of [].concat(f)) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + at;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.015);
      gain.gain.setValueAtTime(volume, start + Math.max(0.02, d - 0.04));
      gain.gain.linearRampToValueAtTime(0, start + d);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + d + 0.02);
    }
  }
};

const loop = (fn, everyMs) => {
  fn();
  const t = setInterval(fn, everyMs);
  return () => clearInterval(t);
};

/** Outgoing call: the "tuuu … tuuu" you hear while it rings on the other side. */
export const startRingback = () => loop(() => play([{ f: [425], d: 1.0 }], 0.05), 4000);

/** Incoming call: two-tone ring + vibration on phones. */
export const startRingtone = () => {
  const stopSound = loop(
    () =>
      play(
        [
          { f: [880, 1320], at: 0, d: 0.18 },
          { f: [660, 990], at: 0.22, d: 0.18 },
          { f: [880, 1320], at: 0.44, d: 0.18 },
          { f: [660, 990], at: 0.66, d: 0.25 },
        ],
        0.06,
      ),
    2600,
  );
  const vibrate = () => navigator.vibrate?.([400, 200, 400]);
  vibrate();
  const v = setInterval(vibrate, 2600);
  return () => {
    stopSound();
    clearInterval(v);
    navigator.vibrate?.(0);
  };
};

/** Call ended. */
export const playEndTone = () =>
  play(
    [
      { f: 620, at: 0, d: 0.14 },
      { f: 480, at: 0.18, d: 0.14 },
      { f: 360, at: 0.36, d: 0.22 },
    ],
    0.06,
  );

/** New message while the app is open. */
export const playMessagePing = () =>
  play(
    [
      { f: 1046.5, at: 0, d: 0.09 },
      { f: 1568, at: 0.08, d: 0.16 },
    ],
    0.045,
  );
