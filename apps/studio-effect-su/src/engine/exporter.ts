import type { Composition, StudioProject } from '../core/types';
import { renderComposition } from './renderer';

export interface AndroidBridgeApi {
  saveBase64File: (fileName: string, mimeType: string, base64Data: string) => void;
  showToast?: (message: string) => void;
  getAppVersion?: () => string;
}

declare global {
  interface Window {
    AndroidBridge?: AndroidBridgeApi;
  }
}

export async function saveBlobToDevice(
  blob: Blob,
  fileName: string,
  mimeType: string
): Promise<void> {
  if (window.AndroidBridge && typeof window.AndroidBridge.saveBase64File === 'function') {
    const base64 = await blobToBase64(blob);
    window.AndroidBridge.saveBase64File(fileName, mimeType, base64);
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

export async function exportFramePng(
  comp: Composition,
  time: number,
  scale = 1,
  allCompositions?: Composition[]
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(comp.width * scale));
  canvas.height = Math.max(1, Math.round(comp.height * scale));
  const ctx = canvas.getContext('2d')!;
  renderComposition(ctx, comp, time, { renderScale: scale, allCompositions });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))),
      'image/png'
    );
  });

  const safeName = comp.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  await saveBlobToDevice(blob, `${safeName}_frame.png`, 'image/png');
}

export async function exportProjectFile(project: StudioProject): Promise<void> {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  await saveBlobToDevice(blob, `${safeName}.suep`, 'application/json');
}

export interface VideoExportOptions {
  resolutionScale: number; // 0.5 = half, 1 = full
  fps?: number;
  bitrateMbps?: number;
  allCompositions?: Composition[];
  onProgress?: (progress01: number, currentFrame: number, totalFrames: number) => void;
  signal?: AbortSignal;
}

export async function exportCompositionVideo(
  comp: Composition,
  options: VideoExportOptions
): Promise<{ fileName: string; mimeType: string; sizeBytes: number }> {
  const scale = options.resolutionScale;
  const fps = options.fps ?? comp.fps;
  const totalFrames = Math.max(1, Math.round(comp.duration * fps));
  const width = Math.max(2, Math.round((comp.width * scale) / 2) * 2);
  const height = Math.max(2, Math.round((comp.height * scale) / 2) * 2);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder / captureStream не поддерживается этим устройством');
  }

  const candidateMimes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  const supportedMime =
    candidateMimes.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';

  const stream = canvas.captureStream(fps);

  // Optional audio track mixing when unmuted audio layers exist
  let audioCtx: AudioContext | null = null;
  const audioSources: AudioBufferSourceNode[] = [];
  const audioLayers = comp.layers.filter(
    (l) => l.type === 'audio' && l.visible && l.audioData && l.audioData.volume > 0
  );
  if (audioLayers.length > 0 && typeof AudioContext !== 'undefined') {
    try {
      audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      for (const al of audioLayers) {
        const resp = await fetch(al.audioData!.src);
        const arr = await resp.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arr);
        const srcNode = audioCtx.createBufferSource();
        srcNode.buffer = decoded;
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = al.audioData!.volume / 100;
        srcNode.connect(gainNode);
        gainNode.connect(dest);
        const delay = Math.max(0, al.inPoint);
        const offset = Math.max(0, al.startTime);
        const dur = Math.max(0.05, al.outPoint - al.inPoint);
        srcNode.start(audioCtx.currentTime + delay, offset, dur);
        audioSources.push(srcNode);
      }
      for (const track of dest.stream.getAudioTracks()) {
        stream.addTrack(track);
      }
    } catch {
      if (audioCtx) void audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: supportedMime,
    videoBitsPerSecond: (options.bitrateMbps ?? 6) * 1_000_000,
  });

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  const stopPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      for (const s of audioSources) {
        try {
          s.stop();
        } catch {
          // ignore
        }
      }
      if (audioCtx) void audioCtx.close().catch(() => {});
      resolve(new Blob(chunks, { type: supportedMime }));
    };
    recorder.onerror = () => reject(new Error('Ошибка записи видео'));
  });

  recorder.start(100);
  const frameDelayMs = 1000 / fps;

  for (let frame = 0; frame < totalFrames; frame++) {
    if (options.signal?.aborted) {
      recorder.stop();
      throw new Error('Экспорт отменён пользователем');
    }

    const t = frame / fps;
    renderComposition(ctx, comp, t, {
      renderScale: width / comp.width,
      allCompositions: options.allCompositions,
    });
    options.onProgress?.((frame + 1) / totalFrames, frame + 1, totalFrames);

    await new Promise((r) => setTimeout(r, frameDelayMs));
  }

  recorder.stop();
  const videoBlob = await stopPromise;

  const ext = supportedMime.includes('mp4') ? 'mp4' : 'webm';
  const safeName = comp.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeName}_${width}x${height}.${ext}`;
  await saveBlobToDevice(videoBlob, fileName, supportedMime);

  return {
    fileName,
    mimeType: supportedMime,
    sizeBytes: videoBlob.size,
  };
}
