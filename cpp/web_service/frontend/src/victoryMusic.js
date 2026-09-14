// Original sample-free C-major celebration, rendered once per audio context.
export function createVictoryBuffer(context) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(5 * rate), rate);
  const data = buffer.getChannelData(0);
  function note(start, midi, duration, gain) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const offset = Math.round(start * rate);
    for (let i = 0; i < duration * rate && offset + i < data.length; i++) {
      const t = i / rate,
        phase = 2 * Math.PI * frequency * t;
      const envelope =
        Math.min(1, t / 0.008) *
        Math.min(1, (duration - t) / 0.12) *
        Math.exp(-(duration > 1 ? 0.9 : 1.8) * t);
      data[offset + i] +=
        gain *
        envelope *
        (Math.sin(phase) +
          0.35 * Math.sin(2 * phase) +
          0.18 * Math.sin(3 * phase) +
          0.07 * Math.sin(4 * phase));
    }
  }
  [
    [0, 72],
    [0.18, 76],
    [0.36, 79],
    [0.6, 84],
    [1.02, 79],
    [1.2, 84],
    [1.44, 88],
    [1.92, 86],
    [2.16, 84],
    [2.4, 81],
    [2.64, 83],
    [2.88, 86],
    [3.12, 79],
    [3.36, 83],
    [3.6, 84],
  ].forEach(([time, midi]) => {
    note(time, midi, time === 3.6 ? 1.35 : 0.34, 0.29);
    note(time, midi - 12, time === 3.6 ? 1.35 : 0.3, 0.09);
  });
  [
    [0, [48, 55, 60, 64]],
    [0.96, [48, 55, 60, 64]],
    [1.92, [53, 60, 65, 69]],
    [2.88, [55, 62, 67, 71]],
    [3.6, [48, 55, 60, 64, 67, 72]],
  ].forEach(([start, chord]) =>
    chord.forEach((midi) =>
      note(start, midi, start === 3.6 ? 1.35 : 0.75, 0.075),
    ),
  );

  // Snare pickups, a quick roll, and the final cymbal accent lift the cadence.
  let seed = 9271;
  function percussion(start, duration, gain, cymbal = false) {
    let low = 0;
    const offset = Math.round(start * rate);
    for (let i = 0; i < duration * rate && offset + i < data.length; i++) {
      const t = i / rate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      low += 0.2 * (noise - low);
      const envelope =
        Math.min(1, t / 0.001) * Math.exp(-t * (cymbal ? 5 : 26));
      data[offset + i] +=
        gain *
        envelope *
        ((noise - low) * (cymbal ? 1 : 0.6) +
          (cymbal ? 0 : 0.5 * Math.sin(2 * Math.PI * 150 * t)));
    }
  }
  [0, 0.48, 0.96, 1.44, 1.92, 2.4, 2.88].forEach((time) =>
    percussion(time, 0.17, 0.12),
  );
  [3.06, 3.18, 3.3, 3.42, 3.51].forEach((time, i) =>
    percussion(time, 0.12, 0.08 + i * 0.025),
  );
  percussion(3.6, 1.35, 0.24, true);
  for (let i = 0; i < data.length; i++)
    data[i] *= Math.min(1, (data.length - i - 1) / (rate * 0.22)) ** 2;
  let peak = 0;
  for (const value of data) peak = Math.max(peak, Math.abs(value));
  for (let i = 0; i < data.length; i++) data[i] *= 0.65 / (peak || 1);
  return buffer;
}

export function isHumanVictory(result, human, mode, previousResult = "") {
  return (
    !previousResult &&
    (mode === "play" || mode === "practice") &&
    result.startsWith(human + "+")
  );
}
