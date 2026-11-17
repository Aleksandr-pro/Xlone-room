import { add3, norm3, scale3, sub3, uid } from '../core/math3d';
import type {
  AnimKeyframe,
  AnimPropPath,
  ArmatureData,
  Bone,
  SceneObject,
  Vec3,
  VseClip,
  XL3DScene,
} from '../core/types';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function sampleKeyframes(keyframes: AnimKeyframe[], frame: number): number | null {
  if (keyframes.length === 0) return null;
  const kfs = [...keyframes].sort((a, b) => a.frame - b.frame);
  if (frame <= kfs[0].frame) return kfs[0].value;
  if (frame >= kfs[kfs.length - 1].frame) return kfs[kfs.length - 1].value;

  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      if (a.interp === 'constant') return a.value;
      const t = (frame - a.frame) / Math.max(1e-5, b.frame - a.frame);
      if (a.interp === 'bezier') {
        const s = t * t * (3 - 2 * t);
        return a.value + (b.value - a.value) * s;
      }
      return a.value + (b.value - a.value) * t;
    }
  }
  return kfs[kfs.length - 1].value;
}

// Blender 5.1 F-Curve Gaussian Smooth modifier
export function gaussianSmoothKeyframes(keyframes: AnimKeyframe[], sigma = 1.2): AnimKeyframe[] {
  if (keyframes.length < 3) return keyframes;
  const kfs = [...keyframes].sort((a, b) => a.frame - b.frame);
  return kfs.map((kf, i) => {
    let sum = 0;
    let wSum = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(kfs.length - 1, i + 2); j++) {
      const dist = i - j;
      const w = Math.exp(-(dist * dist) / (2 * sigma * sigma));
      sum += kfs[j].value * w;
      wSum += w;
    }
    return { ...kf, value: sum / Math.max(1e-5, wSum) };
  });
}

export function evaluateDriverExpr(expr: string, frame: number, timeSec: number): number {
  const clean = expr.trim().toLowerCase();
  if (clean.includes('sin(')) {
    const m = clean.match(/sin\(([^)]+)\)/);
    if (m) {
      const freq = m[1].includes('*') ? Number(m[1].split('*')[1]) || 0.1 : 0.1;
      return Math.sin(frame * freq);
    }
  }
  if (clean.includes('cos(')) {
    const m = clean.match(/cos\(([^)]+)\)/);
    if (m) {
      const freq = m[1].includes('*') ? Number(m[1].split('*')[1]) || 0.1 : 0.1;
      return Math.cos(frame * freq);
    }
  }
  if (clean.startsWith('frame*')) {
    const mul = Number(clean.slice(6)) || 0.05;
    return frame * mul;
  }
  if (clean.startsWith('time*')) {
    const mul = Number(clean.slice(5)) || 1;
    return timeSec * mul;
  }
  const num = Number(clean);
  return Number.isFinite(num) ? num : 0;
}

export function insertKeyframe(
  obj: SceneObject,
  property: AnimPropPath,
  frame: number,
  value: number,
  interp: AnimKeyframe['interp'] = 'bezier'
): void {
  const list = obj.keyframes[property] ?? [];
  const existing = list.find((k) => Math.abs(k.frame - frame) < 0.01);
  if (existing) {
    existing.value = value;
    existing.interp = interp;
  } else {
    list.push({ id: uid('kf'), frame, value, interp });
    list.sort((a, b) => a.frame - b.frame);
  }
  obj.keyframes[property] = list;
}

export function evaluateAnimatedTransform(
  obj: SceneObject,
  frame: number,
  fps: number
): { location: Vec3; rotation: Vec3; scale: Vec3 } {
  const location: Vec3 = { ...obj.location };
  const rotation: Vec3 = { ...obj.rotation };
  const scale: Vec3 = { ...obj.scale };
  const timeSec = (frame - 1) / Math.max(1, fps);

  (Object.keys(obj.keyframes) as AnimPropPath[]).forEach((prop) => {
    const kfs = obj.keyframes[prop];
    if (!kfs) return;
    const v = sampleKeyframes(kfs, frame);
    if (v !== null) applyPropValue(location, rotation, scale, prop, v);
  });

  (Object.keys(obj.drivers) as AnimPropPath[]).forEach((prop) => {
    const expr = obj.drivers[prop];
    if (!expr) return;
    const v = evaluateDriverExpr(expr, frame, timeSec);
    applyPropValue(location, rotation, scale, prop, v);
  });

  // Physics simulation preview
  if (obj.physics.type !== 'none') {
    const dt = Math.max(0, timeSec);
    if (obj.physics.type === 'rigidBody') {
      const drop = 0.5 * 9.8 * obj.physics.gravityScale * dt * dt;
      location.z = Math.max(0.5, obj.location.z - drop);
      if (location.z <= 0.501 && obj.physics.bounciness > 0.05) {
        location.z += Math.abs(Math.sin(dt * 6)) * obj.physics.bounciness * 0.45;
      }
    } else if (obj.physics.type === 'softBody') {
      const squash = 1 - Math.abs(Math.sin(dt * 4)) * 0.14;
      scale.z *= squash;
      scale.x *= 1 + (1 - squash) * 0.5;
      scale.y *= 1 + (1 - squash) * 0.5;
    } else if (obj.physics.type === 'cloth') {
      rotation.x += Math.sin(dt * 3) * (obj.physics.windForce || 1) * 3;
    } else if (obj.physics.type === 'forceField') {
      rotation.z += dt * 45;
    }
  }

  return { location, rotation, scale };
}

function applyPropValue(loc: Vec3, rot: Vec3, scl: Vec3, prop: AnimPropPath, v: number): void {
  switch (prop) {
    case 'locX': loc.x = v; break;
    case 'locY': loc.y = v; break;
    case 'locZ': loc.z = v; break;
    case 'rotX': rot.x = v; break;
    case 'rotY': rot.y = v; break;
    case 'rotZ': rot.z = v; break;
    case 'scaleX': scl.x = v; break;
    case 'scaleY': scl.y = v; break;
    case 'scaleZ': scl.z = v; break;
  }
}

export function solveTwoBoneIK(armature: ArmatureData, endBoneName: string, target: Vec3): void {
  const endBone = armature.bones.find((b) => b.name === endBoneName);
  if (!endBone) return;
  const parentBone = armature.bones.find((b) => b.id === endBone.parentId);
  if (!parentBone) {
    endBone.tail = { ...target };
    return;
  }
  const root = parentBone.head;
  const dir = norm3(sub3(target, root));
  const l1 = Math.max(0.2, Math.hypot(parentBone.tail.x - parentBone.head.x, parentBone.tail.y - parentBone.head.y, parentBone.tail.z - parentBone.head.z));
  const l2 = Math.max(0.2, Math.hypot(endBone.tail.x - endBone.head.x, endBone.tail.y - endBone.head.y, endBone.tail.z - endBone.head.z));
  const d = clamp(Math.hypot(target.x - root.x, target.y - root.y, target.z - root.z), 0.1, l1 + l2);
  const mid = add3(root, scale3(dir, d * 0.5));
  mid.y += Math.sqrt(Math.max(0, l1 * l1 - (d * 0.5) * (d * 0.5))) * 0.4;
  parentBone.tail = mid;
  endBone.head = mid;
  endBone.tail = { ...target };
}

export function generateRigifyHumanoidArmature(): ArmatureData {
  const zero = { x: 0, y: 0, z: 0 };
  const bones: Bone[] = [
    { id: 'rig-pelvis', name: 'spine', head: { x: 0, y: 0, z: 0.9 }, tail: { x: 0, y: 0, z: 1.25 }, parentId: null, collection: 'Torso', poseRot: { ...zero }, poseLoc: { ...zero }, ikChainLength: 0, constraints: [] },
    { id: 'rig-chest', name: 'spine.002', head: { x: 0, y: 0, z: 1.25 }, tail: { x: 0, y: 0, z: 1.65 }, parentId: 'rig-pelvis', collection: 'Torso', poseRot: { ...zero }, poseLoc: { ...zero }, ikChainLength: 0, constraints: [] },
    { id: 'rig-head', name: 'head', head: { x: 0, y: 0, z: 1.65 }, tail: { x: 0, y: 0, z: 1.98 }, parentId: 'rig-chest', collection: 'Head', poseRot: { ...zero }, poseLoc: { ...zero }, ikChainLength: 0, constraints: [] },
    { id: 'rig-arm-l', name: 'upper_arm.L', head: { x: -0.22, y: 0, z: 1.58 }, tail: { x: -0.58, y: 0, z: 1.32 }, parentId: 'rig-chest', collection: 'Arm.L', poseRot: { ...zero }, poseLoc: { ...zero }, ikChainLength: 2, constraints: [{ type: 'ik', influence: 1 }] },
    { id: 'rig-fore-l', name: 'forearm.L', head: { x: -0.58, y: 0, z: 1.32 }, tail: { x: -0.82, y: 0.08, z: 1.02 }, parentId: 'rig-arm-l', collection: 'Arm.L', poseRot: { ...zero }, poseLoc: { ...zero }, ikChainLength: 2, constraints: [{ type: 'ik', influence: 1 }] },
    { id: 'rig-arm-r', name: 'upper_arm.R', head: { x: 0.22, y: 0, z: 1.58 }, tail: { x: 0.58, y: 0, z: 1.32 }, parentId: 'rig-chest', collection: 'Arm.R', poseRot: { ...zero }, poseLoc: { ...zero }, ikChainLength: 2, constraints: [{ type: 'ik', influence: 1 }] },
    { id: 'rig-fore-r', name: 'forearm.R', head: { x: 0.58, y: 0, z: 1.32 }, tail: { x: 0.82, y: 0.08, z: 1.02 }, parentId: 'rig-arm-r', collection: 'Arm.R', poseRot: { ...zero }, poseLoc: { ...zero }, ikChainLength: 2, constraints: [{ type: 'ik', influence: 1 }] },
    { id: 'rig-thigh-l', name: 'thigh.L', head: { x: -0.14, y: 0, z: 0.9 }, tail: { x: -0.16, y: 0, z: 0.45 }, parentId: 'rig-pelvis', collection: 'Leg.L', poseRot: { ...zero }, poseLoc: { ...zero }, ikChainLength: 2, constraints: [{ type: 'ik', influence: 1 }] },
    { id: 'rig-shin-l', name: 'shin.L', head: { x: -0.16, y: 0, z: 0.45 }, tail: { x: -0.16, y: 0, z: 0.04 }, parentId: 'rig-thigh-l', collection: 'Leg.L', poseRot: { ...zero }, poseLoc: { ...zero }, ikChainLength: 2, constraints: [{ type: 'ik', influence: 1 }] },
    { id: 'rig-thigh-r', name: 'thigh.R', head: { x: 0.14, y: 0, z: 0.9 }, tail: { x: 0.16, y: 0, z: 0.45 }, parentId: 'rig-pelvis', collection: 'Leg.R', poseRot: { ...zero }, poseLoc: { ...zero }, ikChainLength: 2, constraints: [{ type: 'ik', influence: 1 }] },
    { id: 'rig-shin-r', name: 'shin.R', head: { x: 0.16, y: 0, z: 0.45 }, tail: { x: 0.16, y: 0, z: 0.04 }, parentId: 'rig-thigh-r', collection: 'Leg.R', poseRot: { ...zero }, poseLoc: { ...zero }, ikChainLength: 2, constraints: [{ type: 'ik', influence: 1 }] },
  ];
  return {
    bones,
    rigifyTemplate: 'human',
    autoRigged: true,
  };
}

// VSE 5.3 Blade Tool 2.0 + Ripple Edit
export function vseBladeCut(clips: VseClip[], clipId: string, cutFrame: number): VseClip[] {
  const out: VseClip[] = [];
  for (const s of clips) {
    const end = s.startFrame + s.durationFrames;
    if (s.id === clipId && cutFrame > s.startFrame && cutFrame < end) {
      out.push({ ...s, durationFrames: cutFrame - s.startFrame });
      out.push({
        ...s,
        id: uid('vc'),
        name: `${s.name} [B]`,
        startFrame: cutFrame,
        durationFrames: end - cutFrame,
      });
    } else {
      out.push(s);
    }
  }
  return out;
}

export function vseRippleDelete(clips: VseClip[], clipId: string): VseClip[] {
  const target = clips.find((s) => s.id === clipId);
  if (!target) return clips;
  const dur = Math.max(1, target.durationFrames);
  const targetEnd = target.startFrame + dur;
  return clips
    .filter((s) => s.id !== clipId)
    .map((s) => {
      if (s.track === target.track && s.startFrame >= targetEnd) {
        return { ...s, startFrame: Math.max(1, s.startFrame - dur) };
      }
      return s;
    });
}

export function exportVseToOtio(scene: XL3DScene): string {
  const otio = {
    OTIO_SCHEMA: 'Timeline.1',
    name: `${scene.name}_VSE`,
    global_start_time: { OTIO_SCHEMA: 'RationalTime.1', value: scene.startFrame, rate: scene.fps },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      children: [1, 2, 3].map((ch) => ({
        OTIO_SCHEMA: 'Track.1',
        name: `Track ${ch}`,
        kind: ch === 3 ? 'Audio' : 'Video',
        children: scene.vse.clips
          .filter((s) => s.track === ch)
          .map((s) => ({
            OTIO_SCHEMA: 'Clip.2',
            name: s.name,
            source_range: {
              OTIO_SCHEMA: 'TimeRange.1',
              start_time: { OTIO_SCHEMA: 'RationalTime.1', value: s.startFrame, rate: scene.fps },
              duration: { OTIO_SCHEMA: 'RationalTime.1', value: s.durationFrames, rate: scene.fps },
            },
          })),
      })),
    },
  };
  return JSON.stringify(otio, null, 2);
}
