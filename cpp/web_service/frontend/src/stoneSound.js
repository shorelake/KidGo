import { createVictoryBuffer } from "./victoryMusic";

let context, stoneBuffer, victoryBuffer, activeVictory;

export function stopVictoryMusic() {
  if (!activeVictory) return;
  const { source, gain, done } = activeVictory;
  activeVictory = null;
  source.stop();
  source.disconnect();
  gain.disconnect();
  done();
}

export function playVictoryMusic(done = () => {}) {
  if (!context || context.state !== "running" || document.hidden) return false;
  stopVictoryMusic();
  victoryBuffer ||= createVictoryBuffer(context);
  const source = context.createBufferSource(),
    gain = context.createGain();
  source.buffer = victoryBuffer;
  gain.gain.value = 0.45;
  source.connect(gain).connect(context.destination);
  activeVictory = { source, gain, done };
  source.onended = () => {
    if (activeVictory?.source !== source) return;
    activeVictory = null;
    source.disconnect();
    gain.disconnect();
    done();
  };
  source.start(context.currentTime + 0.14);
  return true;
}

export function createStoneBuffer(audioContext) {
  const rate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, Math.ceil(rate * 0.15), rate);
  const samples = buffer.getChannelData(0);
  let seed = 17329,
    low = 0,
    peak = 0;
  // A hard contact, two tiny rebounds, and a damped wooden-board response.
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += 0.28 * (noise - low);
    const high = noise - low;
    const attack = 1 - Math.exp(-t / 0.00018);
    const contact = 0.9 * high * Math.exp(-t / 0.0035);
    const rebound = [0.012, 0.025].reduce((sum, delay, index) => {
      const dt = t - delay;
      return (
        sum +
        (dt < 0
          ? 0
          : high *
            (index ? 0.12 : 0.25) *
            (1 - Math.exp(-dt / 0.0002)) *
            Math.exp(-dt / 0.002))
      );
    }, 0);
    const wood =
      0.32 * Math.sin(2 * Math.PI * 310 * t) * Math.exp(-t / 0.023) +
      0.21 * Math.sin(2 * Math.PI * 730 * t) * Math.exp(-t / 0.014) +
      0.15 * Math.sin(2 * Math.PI * 1680 * t) * Math.exp(-t / 0.006);
    const scrape = 0.16 * low * Math.exp(-t / 0.017);
    samples[i] =
      (attack * (contact + wood + scrape) + rebound) *
      Math.min(1, (0.15 - t) / 0.015);
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  for (let i = 0; i < samples.length; i++) samples[i] *= 0.72 / (peak || 1);
  return buffer;
}
export function unlockStoneSound() {
  try {
    context ||= new (window.AudioContext || window.webkitAudioContext)();
    stoneBuffer ||= createStoneBuffer(context);
    if (context.state === "suspended") context.resume().catch(() => {});
  } catch {
    /* Audio is optional on unsupported browsers. */
  }
}
export function playStoneSound() {
  if (!context || context.state !== "running") return;
  const source = context.createBufferSource(),
    gain = context.createGain();
  source.buffer = stoneBuffer;
  gain.gain.value = 0.55;
  source.connect(gain).connect(context.destination);
  source.start();
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
}
