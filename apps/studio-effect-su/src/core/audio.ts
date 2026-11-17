import { isLayerActiveAtTime } from './interpolation';
import type { AudioLayerData, Composition, Layer } from './types';

const audioElements = new Map<string, HTMLAudioElement>();

export function getAudioAmplitudeAtTime(comp: Composition, time: number): number {
  let maxAmp = 0;
  for (const layer of comp.layers) {
    if (layer.type !== 'audio' || !layer.audioData) continue;
    if (!isLayerActiveAtTime(layer, time)) continue;
    const data = layer.audioData;
    if (!data.envelope || data.envelope.length === 0) continue;

    const localTime = Math.max(0, time - layer.inPoint + layer.startTime);
    const idx = Math.min(data.envelope.length - 1, Math.floor(localTime * 30));
    const amp = (data.envelope[idx] ?? 0) * (data.volume / 100);
    if (amp > maxAmp) maxAmp = amp;
  }
  return maxAmp;
}

export function syncAudioPlayback(comp: Composition, currentTime: number, isPlaying: boolean): void {
  if (typeof Audio === 'undefined') return;
  const activeIds = new Set<string>();

  for (const layer of comp.layers) {
    if (layer.type !== 'audio' || !layer.audioData) continue;
    activeIds.add(layer.id);

    let el = audioElements.get(layer.id);
    if (!el || el.src !== layer.audioData.src) {
      el = new Audio(layer.audioData.src);
      el.preload = 'auto';
      audioElements.set(layer.id, el);
    }

    el.volume = Math.max(0, Math.min(1, layer.audioData.volume / 100));
    const active = isLayerActiveAtTime(layer, currentTime);

    if (isPlaying && active) {
      const targetTime = Math.max(0, currentTime - layer.inPoint + layer.startTime);
      if (targetTime < (el.duration || layer.audioData.duration || 999)) {
        if (Math.abs(el.currentTime - targetTime) > 0.16) {
          el.currentTime = targetTime;
        }
        if (el.paused) {
          void el.play().catch(() => {
            // Browser autoplay policy fallback
          });
        }
      } else if (!el.paused) {
        el.pause();
      }
    } else if (!el.paused) {
      el.pause();
    }
  }

  for (const [id, el] of audioElements.entries()) {
    if (!activeIds.has(id)) {
      el.pause();
      audioElements.delete(id);
    }
  }
}

export function stopAllAudio(): void {
  for (const el of audioElements.values()) {
    el.pause();
  }
}

export async function analyzeAudioBuffer(arrayBuffer: ArrayBuffer, src: string, fileName: string): Promise<AudioLayerData> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return buildFallbackAudioData(src, fileName, 5);
  }

  const ctx = new AudioCtx();
  try {
    const audioBuf = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = audioBuf.getChannelData(0);
    const duration = audioBuf.duration;

    // 1. Visual waveform (80 bars)
    const bars = 80;
    const barStep = Math.max(1, Math.floor(channel.length / bars));
    const waveform: number[] = [];
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      const start = i * barStep;
      const end = Math.min(channel.length, start + barStep);
      for (let j = start; j < end; j += Math.max(1, Math.floor((end - start) / 64))) {
        const v = Math.abs(channel[j]);
        if (v > peak) peak = v;
      }
      waveform.push(Number(Math.min(1, peak).toFixed(3)));
    }

    // 2. 30 Hz amplitude envelope (0..100) for expressions & beat keyframes
    const envCount = Math.max(1, Math.ceil(duration * 30));
    const envStep = Math.max(1, Math.floor(channel.length / envCount));
    const envelope: number[] = [];
    for (let i = 0; i < envCount; i++) {
      let sumSq = 0;
      let count = 0;
      const start = i * envStep;
      const end = Math.min(channel.length, start + envStep);
      const stride = Math.max(1, Math.floor((end - start) / 48));
      for (let j = start; j < end; j += stride) {
        sumSq += channel[j] * channel[j];
        count++;
      }
      const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
      envelope.push(Math.min(100, Math.round(rms * 220)));
    }

    return {
      src,
      fileName,
      volume: 100,
      duration,
      waveform,
      envelope,
    };
  } catch {
    return buildFallbackAudioData(src, fileName, 5);
  } finally {
    void ctx.close().catch(() => {});
  }
}

function buildFallbackAudioData(src: string, fileName: string, duration: number): AudioLayerData {
  const waveform = Array.from({ length: 64 }, (_, i) => Number((0.25 + 0.65 * Math.abs(Math.sin(i * 0.55))).toFixed(2)));
  const envLen = Math.ceil(duration * 30);
  const envelope = Array.from({ length: envLen }, (_, i) => Math.round(20 + 75 * Math.pow(Math.abs(Math.sin((i / 30) * Math.PI * 2)), 2)));
  return { src, fileName, volume: 100, duration, waveform, envelope };
}

/**
 * Synthesizes a clean 128 BPM electronic beat WAV in memory so users can test
 * audio-reactive edits immediately without importing external files.
 */
export function createBuiltInSynthBeat(durationSec = 5, bpm = 128): AudioLayerData {
  const sampleRate = 22050;
  const numSamples = Math.floor(durationSec * sampleRate);
  const samples = new Float32Array(numSamples);
  const beatDur = 60 / bpm;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatPos = (t % beatDur) / beatDur;
    const barBeat = Math.floor(t / beatDur) % 4;

    // Punchy kick on every beat
    const kickEnv = Math.exp(-beatPos * 11);
    const kickFreq = 48 + 110 * Math.exp(-beatPos * 24);
    const kick = Math.sin(2 * Math.PI * kickFreq * t) * kickEnv * 0.68;

    // Off-beat synth bass
    const bassEnv = beatPos > 0.45 ? Math.exp(-(beatPos - 0.45) * 8) : 0.15;
    const bassFreq = barBeat === 2 ? 73.42 : barBeat === 3 ? 65.41 : 55.0;
    const bass = Math.tanh(Math.sin(2 * Math.PI * bassFreq * t) * 2.2) * bassEnv * 0.25;

    // Crisp hi-hat on 8th notes
    const eighthPos = ((t % (beatDur / 2)) / (beatDur / 2));
    const hatEnv = Math.exp(-eighthPos * 28);
    const noise = Math.sin(i * 12.9898) * 43758.5453;
    const rand = (noise - Math.floor(noise)) * 2 - 1;
    const hat = rand * hatEnv * 0.14;

    samples[i] = Math.max(-0.95, Math.min(0.95, kick + bass + hat));
  }

  const wavBytes = encodeWav16(samples, sampleRate);
  const base64 = uint8ToBase64(wavBytes);
  const src = `data:audio/wav;base64,${base64}`;

  // Build exact waveform & envelope
  const bars = 80;
  const barStep = Math.floor(numSamples / bars);
  const waveform: number[] = [];
  for (let b = 0; b < bars; b++) {
    let peak = 0;
    for (let j = b * barStep; j < (b + 1) * barStep; j += 12) {
      const v = Math.abs(samples[j]);
      if (v > peak) peak = v;
    }
    waveform.push(Number(peak.toFixed(3)));
  }

  const envCount = Math.ceil(durationSec * 30);
  const envStep = Math.floor(numSamples / envCount);
  const envelope: number[] = [];
  for (let e = 0; e < envCount; e++) {
    let sumSq = 0;
    let cnt = 0;
    for (let j = e * envStep; j < (e + 1) * envStep; j += 8) {
      sumSq += samples[j] * samples[j];
      cnt++;
    }
    const rms = cnt > 0 ? Math.sqrt(sumSq / cnt) : 0;
    envelope.push(Math.min(100, Math.round(rms * 210)));
  }

  return {
    src,
    fileName: `Synth Beat ${bpm} BPM.wav`,
    volume: 85,
    duration: durationSec,
    waveform,
    envelope,
  };
}

function encodeWav16(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(bin);
}

export function isAudioMuted(layer: Layer): boolean {
  return !layer.visible || (layer.audioData?.volume ?? 0) <= 0;
}
