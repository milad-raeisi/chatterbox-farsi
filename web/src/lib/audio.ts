// Browser-side audio helpers. Recordings and uploads are decoded and re-encoded as 16-bit WAV
// here, so the local server never needs ffmpeg and nothing leaves the machine.

const TARGET_RATE = 24_000;

function audioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

/** Decode any format the browser understands (webm, ogg, mp3, m4a, wav…) to mono 24 kHz. */
export async function decodeToMono(blob: Blob, targetRate = TARGET_RATE) {
  const data = await blob.arrayBuffer();
  const ctx = audioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(data);
  } finally {
    void ctx.close();
  }
  const length = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const offline = new OfflineAudioContext(1, length, targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded; // a mono destination down-mixes the channels for us
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return { samples: rendered.getChannelData(0), sampleRate: targetRate, duration: decoded.duration };
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Loudness envelope for drawing a waveform: `bars` values in 0..1. */
export function computePeaks(samples: Float32Array, bars: number): number[] {
  const size = Math.max(1, Math.floor(samples.length / bars));
  const peaks: number[] = [];
  let max = 0;
  for (let b = 0; b < bars; b++) {
    let sum = 0;
    const start = b * size;
    const end = Math.min(samples.length, start + size);
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    peaks.push(rms);
    max = Math.max(max, rms);
  }
  return peaks.map((p) => (max > 0 ? Math.max(0.04, Math.pow(p / max, 0.8)) : 0.04));
}

export async function peaksFromUrl(url: string, bars: number, signal?: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { samples } = await decodeToMono(await res.blob(), 8_000);
  return computePeaks(samples, bars);
}
