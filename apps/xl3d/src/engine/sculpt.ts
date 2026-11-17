import { add3, dot3, len3, norm3, scale3, sub3 } from '../core/math3d';
import type { MeshData, SceneObject, SculptSettings, Vec3 } from '../core/types';
import { loopCutMesh } from './editOps';
import { recomputeNormals } from './primitives';

function mirrorPoints(pt: Vec3, sculpt: SculptSettings): Vec3[] {
  const pts: Vec3[] = [pt];
  if (sculpt.symX) pts.push({ x: -pt.x, y: pt.y, z: pt.z });
  if (sculpt.symY) {
    const cur = [...pts];
    for (const p of cur) pts.push({ x: p.x, y: -p.y, z: p.z });
  }
  if (sculpt.symZ) {
    const cur = [...pts];
    for (const p of cur) pts.push({ x: p.x, y: p.y, z: -p.z });
  }
  if (sculpt.radialSymmetry > 1) {
    const base = [...pts];
    for (let k = 1; k < sculpt.radialSymmetry; k++) {
      const a = (k / sculpt.radialSymmetry) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      for (const p of base) {
        pts.push({ x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z });
      }
    }
  }
  return pts;
}

function mirrorDelta(d: Vec3, idx: number, sculpt: SculptSettings): Vec3 {
  // Mirror grab delta when symmetry is active so symmetrical strokes match naturally
  if (idx === 0) return d;
  return {
    x: sculpt.symX ? -d.x : d.x,
    y: sculpt.symY ? -d.y : d.y,
    z: sculpt.symZ ? -d.z : d.z,
  };
}

export function applySculptStroke(
  mesh: MeshData,
  hitLocal: Vec3,
  dragDeltaLocal: Vec3,
  sculpt: SculptSettings,
  sceneProjectTargets: SceneObject[] = [],
  camForwardLocal?: Vec3
): void {
  const r = Math.max(0.05, sculpt.radius);
  const strength = sculpt.strength * (sculpt.invert ? -1 : 1);
  const centers = mirrorPoints(hitLocal, sculpt);
  const frontOnly = sculpt.frontFacesOnly !== false;

  if (sculpt.dyntopo && mesh.faces.length < 480) {
    loopCutMesh(mesh, 1);
  }

  centers.forEach((center, cIdx) => {
    let avgN: Vec3 = { x: 0, y: 0, z: 0 };
    let avgPos: Vec3 = { x: 0, y: 0, z: 0 };
    let count = 0;

    for (const v of mesh.vertices) {
      if (v.hidden) continue;
      if (frontOnly && camForwardLocal && cIdx === 0) {
        // Skip vertices pointing away from camera (dot(normal, camForward) > 0.25)
        if (dot3(v.normal, camForwardLocal) > 0.25) continue;
      }
      const d = len3(sub3(v.pos, center));
      if (d < r) {
        avgN = add3(avgN, v.normal);
        avgPos = add3(avgPos, v.pos);
        count++;
      }
    }
    if (count === 0) return;
    avgN = norm3(avgN);
    avgPos = scale3(avgPos, 1 / count);
    const localDelta = mirrorDelta(dragDeltaLocal, cIdx, sculpt);

    for (const v of mesh.vertices) {
      if (v.hidden) continue;
      if (frontOnly && camForwardLocal && cIdx === 0) {
        if (dot3(v.normal, camForwardLocal) > 0.25) continue;
      }
      const dist = len3(sub3(v.pos, center));
      if (dist >= r) continue;
      const maskFactor = 1 - Math.max(0, Math.min(1, v.mask));
      if (maskFactor <= 0.01) continue;
      const t = 1 - dist / r;
      const falloff = t * t * (3 - 2 * t) * maskFactor;

      switch (sculpt.brush) {
        case 'draw':
        case 'boundary':
        case 'cloth':
          v.pos = add3(v.pos, scale3(v.normal, falloff * strength * 0.16));
          break;
        case 'clay':
          v.pos = add3(v.pos, scale3(avgN, falloff * strength * 0.14));
          break;
        case 'inflate':
          v.pos = add3(v.pos, scale3(v.normal, falloff * strength * 0.2));
          break;
        case 'crease': {
          const toCenter = sub3(center, v.pos);
          v.pos = add3(v.pos, scale3(toCenter, falloff * strength * 0.25));
          v.pos = add3(v.pos, scale3(v.normal, -falloff * strength * 0.12));
          break;
        }
        case 'pinch': {
          const toCenter = sub3(center, v.pos);
          v.pos = add3(v.pos, scale3(toCenter, falloff * strength * 0.32));
          break;
        }
        case 'smooth': {
          v.pos = add3(v.pos, scale3(sub3(avgPos, v.pos), falloff * Math.abs(strength) * 0.35));
          break;
        }
        case 'multiplaneScrape': {
          const delta = sub3(v.pos, avgPos);
          const proj = delta.x * avgN.x + delta.y * avgN.y + delta.z * avgN.z;
          v.pos = sub3(v.pos, scale3(avgN, proj * falloff * Math.abs(strength) * 0.55));
          break;
        }
        case 'grab':
        case 'snakeHook':
        case 'pose':
        case 'elasticDeform': {
          v.pos = add3(v.pos, scale3(localDelta, falloff * Math.max(0.35, Math.abs(strength) * 1.4)));
          break;
        }
        case 'sceneProject': {
          let nearestPos: Vec3 = { x: v.pos.x, y: v.pos.y, z: 0 };
          let bestDist = Math.abs(v.pos.z);
          for (const target of sceneProjectTargets) {
            if (!target.mesh) continue;
            for (const tv of target.mesh.vertices) {
              const worldTv = add3(tv.pos, target.location);
              const d = len3(sub3(worldTv, v.pos));
              if (d < bestDist) {
                bestDist = d;
                nearestPos = worldTv;
              }
            }
          }
          v.pos = add3(v.pos, scale3(sub3(nearestPos, v.pos), falloff * Math.abs(strength) * 0.6));
          break;
        }
      }
    }

    if (sculpt.activeFaceSet > 1) {
      for (const f of mesh.faces) {
        if (f.verts.some((vi) => len3(sub3(mesh.vertices[vi].pos, center)) < r)) {
          f.faceSet = sculpt.activeFaceSet;
        }
      }
    }
  });
  recomputeNormals(mesh);
}

export function clearSculptMask(mesh: MeshData): void {
  for (const v of mesh.vertices) v.mask = 0;
}

export function invertSculptMask(mesh: MeshData): void {
  for (const v of mesh.vertices) v.mask = 1 - v.mask;
}

export function paintMaskAt(mesh: MeshData, hitLocal: Vec3, radius: number, strength: number): void {
  for (const v of mesh.vertices) {
    const d = len3(sub3(v.pos, hitLocal));
    if (d < radius) {
      v.mask = Math.max(0, Math.min(1, v.mask + (1 - d / radius) * strength));
    }
  }
}

export function voxelRemesh(mesh: MeshData, voxelSize = 0.25): void {
  const step = Math.max(0.08, voxelSize);
  for (const v of mesh.vertices) {
    v.pos = {
      x: Math.round(v.pos.x / step) * step,
      y: Math.round(v.pos.y / step) * step,
      z: Math.round(v.pos.z / step) * step,
    };
  }
  if (mesh.faces.length < 250) {
    loopCutMesh(mesh, 1);
  }
  recomputeNormals(mesh);
}

export function quadRemesh(mesh: MeshData): void {
  if (mesh.faces.length < 300) {
    loopCutMesh(mesh, 1);
  }
  recomputeNormals(mesh);
}

export function snapRetopoToSurface(mesh: MeshData, targetObj: SceneObject): void {
  if (!targetObj.mesh || targetObj.mesh.vertices.length === 0) return;
  for (const v of mesh.vertices) {
    let best = v.pos;
    let bestD = Infinity;
    for (const tv of targetObj.mesh.vertices) {
      const wp = add3(tv.pos, targetObj.location);
      const d = len3(sub3(wp, v.pos));
      if (d < bestD) {
        bestD = d;
        best = wp;
      }
    }
    v.pos = best;
  }
  recomputeNormals(mesh);
}
