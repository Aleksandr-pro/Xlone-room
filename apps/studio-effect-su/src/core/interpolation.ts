import { getAudioAmplitudeAtTime } from './audio';
import { applyEasing } from './easing';
import { evaluateExpression } from './expressions';
import type {
  AnimatableProp,
  Composition,
  EvaluatedTransform,
  Keyframe,
  Layer,
  WorldMatrix,
} from './types';

export function sortKeyframes(keyframes: Keyframe[]): Keyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time);
}

export function evaluateKeyframes(prop: AnimatableProp, time: number): number {
  const kfs = prop.keyframes;
  if (!kfs || kfs.length === 0) return prop.value;

  const sorted = kfs.length > 1 ? sortKeyframes(kfs) : kfs;
  if (time <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return last.value;

  for (let i = 0; i < sorted.length - 1; i++) {
    const k0 = sorted[i];
    const k1 = sorted[i + 1];
    if (time >= k0.time && time <= k1.time) {
      const span = k1.time - k0.time;
      if (span <= 1e-6) return k1.value;
      const rawT = (time - k0.time) / span;
      const easedT = applyEasing(rawT, k0.easing, k0.bezier);
      return k0.value + (k1.value - k0.value) * easedT;
    }
  }

  return last.value;
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 10000;
}

export function evaluateProp(
  prop: AnimatableProp,
  time: number,
  layerIndex: number,
  comp: Composition,
  propKeySeed: string
): number {
  const baseVal = evaluateKeyframes(prop, time);
  if (!prop.expression || !prop.expression.trim()) {
    return baseVal;
  }

  const sorted = prop.keyframes.length > 0 ? sortKeyframes(prop.keyframes) : [];
  const res = evaluateExpression(prop.expression, {
    time,
    index: layerIndex + 1,
    value: baseVal,
    fps: comp.fps,
    duration: comp.duration,
    seed: hashString(propKeySeed) + layerIndex * 31,
    audioAmp: getAudioAmplitudeAtTime(comp, time),
    evalAtTime: (t: number) => evaluateKeyframes(prop, t),
    firstKeyframeTime: sorted[0]?.time,
    lastKeyframeTime: sorted[sorted.length - 1]?.time,
  });

  return res.value;
}

export function evaluateLayerTransform(
  layer: Layer,
  layerIndex: number,
  comp: Composition,
  time: number
): EvaluatedTransform {
  const t = layer.transform;
  const id = layer.id;
  return {
    anchorX: evaluateProp(t.anchorX, time, layerIndex, comp, `${id}:anchorX`),
    anchorY: evaluateProp(t.anchorY, time, layerIndex, comp, `${id}:anchorY`),
    x: evaluateProp(t.x, time, layerIndex, comp, `${id}:x`),
    y: evaluateProp(t.y, time, layerIndex, comp, `${id}:y`),
    scaleX: evaluateProp(t.scaleX, time, layerIndex, comp, `${id}:scaleX`),
    scaleY: evaluateProp(t.scaleY, time, layerIndex, comp, `${id}:scaleY`),
    rotation: evaluateProp(t.rotation, time, layerIndex, comp, `${id}:rotation`),
    opacity: Math.max(0, Math.min(100, evaluateProp(t.opacity, time, layerIndex, comp, `${id}:opacity`))),
  };
}

export function localTransformToMatrix(tf: EvaluatedTransform): WorldMatrix {
  const sx = tf.scaleX / 100;
  const sy = tf.scaleY / 100;
  const rad = (tf.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  const e = tf.x - (a * tf.anchorX + c * tf.anchorY);
  const f = tf.y - (b * tf.anchorX + d * tf.anchorY);

  return {
    a,
    b,
    c,
    d,
    e,
    f,
    opacity: tf.opacity / 100,
  };
}

export function multiplyMatrices(parent: WorldMatrix, child: WorldMatrix): WorldMatrix {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    e: parent.a * child.e + parent.c * child.f + parent.e,
    f: parent.b * child.e + parent.d * child.f + parent.f,
    opacity: parent.opacity * child.opacity,
  };
}

export function transformPoint(m: WorldMatrix, px: number, py: number): { x: number; y: number } {
  return {
    x: m.a * px + m.c * py + m.e,
    y: m.b * px + m.d * py + m.f,
  };
}

export function invertMatrix(m: WorldMatrix): WorldMatrix | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-8) return null;
  const invDet = 1 / det;
  return {
    a: m.d * invDet,
    b: -m.b * invDet,
    c: -m.c * invDet,
    d: m.a * invDet,
    e: (m.c * m.f - m.d * m.e) * invDet,
    f: (m.b * m.e - m.a * m.f) * invDet,
    opacity: 1,
  };
}

export function getLayerWorldMatrix(
  layer: Layer,
  comp: Composition,
  time: number,
  visited = new Set<string>()
): WorldMatrix {
  const layerIndex = comp.layers.findIndex((l) => l.id === layer.id);
  const localTf = evaluateLayerTransform(layer, Math.max(0, layerIndex), comp, time);
  const localMat = localTransformToMatrix(localTf);

  if (!layer.parentId || visited.has(layer.id)) {
    return localMat;
  }

  visited.add(layer.id);
  const parent = comp.layers.find((l) => l.id === layer.parentId);
  if (!parent) return localMat;

  const parentMat = getLayerWorldMatrix(parent, comp, time, visited);
  // Note: in AE, parenting inherits geometric transform, not opacity!
  const combined = multiplyMatrices(parentMat, localMat);
  combined.opacity = localMat.opacity;
  return combined;
}

export function isLayerActiveAtTime(layer: Layer, time: number): boolean {
  return layer.visible && time >= layer.inPoint - 1e-4 && time <= layer.outPoint + 1e-4;
}

export function formatTimecode(seconds: number, fps: number): string {
  const clamped = Math.max(0, seconds);
  const totalFrames = Math.round(clamped * fps);
  const ff = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}
