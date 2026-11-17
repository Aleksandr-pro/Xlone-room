import type { Vec3 } from './types';

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale3(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function len3(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function norm3(a: Vec3): Vec3 {
  const l = len3(a);
  return l > 1e-8 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 1, z: 0 };
}

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

// Euler XYZ -> TRS transform
export function transformVec3(v: Vec3, loc: Vec3, rotDeg: Vec3, scl: Vec3): Vec3 {
  let x = v.x * scl.x;
  let y = v.y * scl.y;
  let z = v.z * scl.z;

  const rx = degToRad(rotDeg.x);
  const ry = degToRad(rotDeg.y);
  const rz = degToRad(rotDeg.z);

  if (rx !== 0) {
    const c = Math.cos(rx), s = Math.sin(rx);
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny; z = nz;
  }
  if (ry !== 0) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const nx = x * c + z * s;
    const nz = -x * s + z * c;
    x = nx; z = nz;
  }
  if (rz !== 0) {
    const c = Math.cos(rz), s = Math.sin(rz);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx; y = ny;
  }

  return { x: x + loc.x, y: y + loc.y, z: z + loc.z };
}

export function rotateOnlyVec3(v: Vec3, rotDeg: Vec3): Vec3 {
  return transformVec3(v, { x: 0, y: 0, z: 0 }, rotDeg, { x: 1, y: 1, z: 1 });
}

// Inverse Euler XYZ (Z^-1 * Y^-1 * X^-1) to convert world vectors/points accurately to object local space
export function inverseRotateVec3(v: Vec3, rotDeg: Vec3): Vec3 {
  let x = v.x;
  let y = v.y;
  let z = v.z;

  const rz = -degToRad(rotDeg.z);
  if (rz !== 0) {
    const c = Math.cos(rz), s = Math.sin(rz);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx; y = ny;
  }
  const ry = -degToRad(rotDeg.y);
  if (ry !== 0) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const nx = x * c + z * s;
    const nz = -x * s + z * c;
    x = nx; z = nz;
  }
  const rx = -degToRad(rotDeg.x);
  if (rx !== 0) {
    const c = Math.cos(rx), s = Math.sin(rx);
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny; z = nz;
  }
  return { x, y, z };
}

export function inverseTransformVec3(worldPt: Vec3, loc: Vec3, rotDeg: Vec3, scl: Vec3): Vec3 {
  const rel = sub3(worldPt, loc);
  const unrot = inverseRotateVec3(rel, rotDeg);
  return {
    x: unrot.x / (Math.abs(scl.x) > 1e-5 ? scl.x : 1),
    y: unrot.y / (Math.abs(scl.y) > 1e-5 ? scl.y : 1),
    z: unrot.z / (Math.abs(scl.z) > 1e-5 ? scl.z : 1),
  };
}

export interface OrbitCamera {
  target: Vec3;
  yaw: number;   // radians
  pitch: number; // radians
  distance: number;
  fovDeg: number;
  ortho: boolean;
  panoramic: boolean;
}

export interface CameraBasis {
  pos: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

export function getCameraBasis(cam: OrbitCamera): CameraBasis {
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);

  const dirToCam: Vec3 = {
    x: cp * Math.cos(cam.yaw),
    y: cp * Math.sin(cam.yaw),
    z: sp,
  };
  const pos = add3(cam.target, scale3(dirToCam, cam.distance));
  const forward = norm3(sub3(cam.target, pos));
  const worldUp: Vec3 = Math.abs(forward.z) > 0.99 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const right = norm3(cross3(forward, worldUp));
  const up = norm3(cross3(right, forward));
  return { pos, right, up, forward };
}

export function projectPoint(
  worldPt: Vec3,
  basis: CameraBasis,
  cam: OrbitCamera,
  width: number,
  height: number
): { sx: number; sy: number; depth: number; visible: boolean } {
  const rel = sub3(worldPt, basis.pos);
  const cx = dot3(rel, basis.right);
  const cy = dot3(rel, basis.up);
  const cz = dot3(rel, basis.forward);

  if (!cam.ortho && cz <= 0.05) {
    return { sx: -9999, sy: -9999, depth: cz, visible: false };
  }

  const f = (height * 0.5) / Math.tan(degToRad(cam.fovDeg * 0.5));
  if (cam.panoramic) {
    const theta = Math.atan2(cx, cz);
    const phi = Math.atan2(cy, Math.hypot(cx, cz));
    return {
      sx: width * 0.5 + (theta / Math.PI) * (width * 0.5),
      sy: height * 0.5 - (phi / (Math.PI * 0.5)) * (height * 0.5),
      depth: len3(rel),
      visible: cz > -2,
    };
  }

  if (cam.ortho) {
    const scale = f / Math.max(0.5, cam.distance);
    return {
      sx: width * 0.5 + cx * scale,
      sy: height * 0.5 - cy * scale,
      depth: cz,
      visible: true,
    };
  }

  return {
    sx: width * 0.5 + (cx * f) / cz,
    sy: height * 0.5 - (cy * f) / cz,
    depth: cz,
    visible: true,
  };
}

export function screenToRay(
  sx: number,
  sy: number,
  width: number,
  height: number,
  basis: CameraBasis,
  cam: OrbitCamera
): { origin: Vec3; dir: Vec3 } {
  const f = (height * 0.5) / Math.tan(degToRad(cam.fovDeg * 0.5));
  const dxScreen = sx - width * 0.5;
  const dyScreen = height * 0.5 - sy;

  if (cam.ortho) {
    const scale = f / Math.max(0.5, cam.distance);
    const cx = dxScreen / scale;
    const cy = dyScreen / scale;
    const origin = add3(basis.pos, add3(scale3(basis.right, cx), scale3(basis.up, cy)));
    return { origin, dir: basis.forward };
  }

  const nx = dxScreen / f;
  const ny = dyScreen / f;
  const dir = norm3({
    x: basis.forward.x + basis.right.x * nx + basis.up.x * ny,
    y: basis.forward.y + basis.right.y * nx + basis.up.y * ny,
    z: basis.forward.z + basis.right.z * nx + basis.up.z * ny,
  });
  return { origin: basis.pos, dir };
}

export function screenDeltaToWorld(
  dx: number,
  dy: number,
  depth: number,
  height: number,
  basis: CameraBasis,
  cam: OrbitCamera
): Vec3 {
  const f = (height * 0.5) / Math.tan(degToRad(cam.fovDeg * 0.5));
  const unitsPerPx = cam.ortho ? Math.max(0.5, cam.distance) / f : Math.max(0.4, depth) / f;
  return add3(scale3(basis.right, dx * unitsPerPx), scale3(basis.up, -dy * unitsPerPx));
}

// Moller-Trumbore ray-triangle intersection
export function intersectRayTriangle(
  orig: Vec3,
  dir: Vec3,
  v0: Vec3,
  v1: Vec3,
  v2: Vec3
): number | null {
  const eps = 1e-6;
  const e1 = sub3(v1, v0);
  const e2 = sub3(v2, v0);
  const h = cross3(dir, e2);
  const a = dot3(e1, h);
  if (Math.abs(a) < eps) return null;
  const f = 1 / a;
  const s = sub3(orig, v0);
  const u = f * dot3(s, h);
  if (u < 0 || u > 1) return null;
  const q = cross3(s, e1);
  const v = f * dot3(dir, q);
  if (v < 0 || u + v > 1) return null;
  const t = f * dot3(e2, q);
  return t > eps ? t : null;
}

export function computeFaceNormal(p0: Vec3, p1: Vec3, p2: Vec3): Vec3 {
  return norm3(cross3(sub3(p1, p0), sub3(p2, p0)));
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
