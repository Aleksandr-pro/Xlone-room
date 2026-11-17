import { add3, len3, scale3, sub3, transformVec3, uid } from '../core/math3d';
import type { Face, MeshData, ModifierInstance, ModifierType, SceneObject, Vec3, Vertex } from '../core/types';
import { bevelSelection, loopCutMesh, smoothVertices, subdivideMesh } from './editOps';
import { buildEdgesFromFaces, recomputeNormals } from './primitives';

export function cloneMeshData(src: MeshData): MeshData {
  return {
    vertices: src.vertices.map((v) => ({
      ...v,
      pos: { ...v.pos },
      normal: { ...v.normal },
      uv: { ...v.uv },
      color: [...v.color] as [number, number, number],
      weights: { ...v.weights },
    })),
    edges: src.edges.map((e) => ({ ...e })),
    faces: src.faces.map((f) => ({
      ...f,
      verts: [...f.verts],
      normal: { ...f.normal },
    })),
    autoSmoothAngle: src.autoSmoothAngle,
    customSplitNormals: src.customSplitNormals,
    udimTile: src.udimTile,
    uvSyncSelection: src.uvSyncSelection,
  };
}

export function createDefaultModifier(type: ModifierType): ModifierInstance {
  const defaults: Record<ModifierType, Record<string, number | boolean | string>> = {
    subsurf: { levels: 1, renderLevels: 2, catmullClark: true },
    mirror: { axisX: true, axisY: false, axisZ: false, clipping: true },
    solidify: { thickness: 0.14, offset: 0 },
    bevel: { width: 0.12, segments: 2 },
    array: { count: 3, offsetX: 1.6, offsetY: 0, offsetZ: 0 },
    boolean: { operation: 'difference', targetName: 'Cube' },
    decimate: { ratio: 0.6 },
    remesh: { mode: 'voxel', voxelSize: 0.25 },
    displace: { strength: 0.22, midlevel: 0.5 },
    wireframe: { thickness: 0.05 },
    cast: { factor: 0.4 },
    screw: { angle: 360, steps: 8, screwOffset: 0.5 },
    skin: { branchSmoothing: 0.5 },
    lattice: { strength: 1.0 },
    armature: { useDeform: true },
    shrinkwrap: { offset: 0.02 },
    curve: { deformAxis: 'X' },
    weld: { distance: 0.01 },
    weightedNormal: { weight: 50, keepSharp: true },
    geometryNodes: { treeId: 'ng_geo' },
  };
  return {
    id: uid('mod'),
    name: type.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    type,
    enabled: true,
    params: defaults[type] ?? {},
  };
}

export function applyShapeKeysToMesh(obj: SceneObject, mesh: MeshData): void {
  for (const sk of obj.shapeKeys) {
    if (sk.value <= 0.001) continue;
    mesh.vertices.forEach((v, idx) => {
      const d = sk.offsets[idx];
      if (d) {
        v.pos = add3(v.pos, scale3(d, sk.value));
      }
    });
  }
}

export function evaluateModifierStack(
  obj: SceneObject,
  timeSec = 0,
  sceneObjects: SceneObject[] = []
): MeshData | null {
  if (!obj.mesh) return null;
  const out = cloneMeshData(obj.mesh);
  applyShapeKeysToMesh(obj, out);

  for (const mod of obj.modifiers) {
    if (!mod.enabled) continue;
    applySingleModifier(out, mod, timeSec, obj, sceneObjects);
  }
  recomputeNormals(out);
  return out;
}

function catmullClarkSmoothStep(mesh: MeshData, strength = 0.55): void {
  const neighbors = new Map<number, Set<number>>();
  for (const f of mesh.faces) {
    const n = f.verts.length;
    for (let i = 0; i < n; i++) {
      const a = f.verts[i];
      const b = f.verts[(i + 1) % n];
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
  }
  const next = new Map<number, Vec3>();
  mesh.vertices.forEach((v, idx) => {
    const nb = neighbors.get(idx);
    if (!nb || nb.size === 0) return;
    let sx = 0, sy = 0, sz = 0;
    nb.forEach((ni) => {
      const p = mesh.vertices[ni].pos;
      sx += p.x; sy += p.y; sz += p.z;
    });
    const inv = 1 / nb.size;
    const avg = { x: sx * inv, y: sy * inv, z: sz * inv };
    next.set(idx, add3(v.pos, scale3(sub3(avg, v.pos), strength)));
  });
  next.forEach((p, idx) => {
    mesh.vertices[idx].pos = p;
  });
}

function applyWeldByDistance(mesh: MeshData, dist: number): void {
  const d2 = dist * dist;
  const remap = new Array<number>(mesh.vertices.length);
  const kept: Vertex[] = [];
  for (let i = 0; i < mesh.vertices.length; i++) {
    const p = mesh.vertices[i].pos;
    let found = -1;
    for (let j = 0; j < kept.length; j++) {
      const q = kept[j].pos;
      const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
      if (dx * dx + dy * dy + dz * dz <= d2) {
        found = j;
        break;
      }
    }
    if (found >= 0) {
      remap[i] = found;
    } else {
      remap[i] = kept.length;
      kept.push(mesh.vertices[i]);
    }
  }
  mesh.vertices = kept;
  mesh.faces = mesh.faces
    .map((f) => {
      const dedup: number[] = [];
      for (const vi of f.verts) {
        const mi = remap[vi];
        if (dedup.length === 0 || dedup[dedup.length - 1] !== mi) dedup.push(mi);
      }
      if (dedup.length > 1 && dedup[0] === dedup[dedup.length - 1]) dedup.pop();
      return { ...f, verts: dedup };
    })
    .filter((f) => f.verts.length >= 3);
  mesh.edges = buildEdgesFromFaces(mesh.faces);
}

export function applySingleModifier(
  mesh: MeshData,
  mod: ModifierInstance,
  timeSec = 0,
  ownerObj?: SceneObject,
  sceneObjects: SceneObject[] = []
): void {
  const p = mod.params;
  switch (mod.type) {
    case 'subsurf': {
      const levels = Math.min(2, Math.max(1, Number(p.levels ?? 1)));
      for (let i = 0; i < levels; i++) {
        subdivideMesh(mesh, false);
        if (p.catmullClark !== false) {
          catmullClarkSmoothStep(mesh, 0.58);
        }
      }
      break;
    }
    case 'mirror': {
      const ax = p.axisX !== false;
      const ay = Boolean(p.axisY);
      const az = Boolean(p.axisZ);
      const mirrorAxis = (axis: 'x' | 'y' | 'z') => {
        const baseCount = mesh.vertices.length;
        const baseFaces = mesh.faces.length;
        for (let i = 0; i < baseCount; i++) {
          const v = mesh.vertices[i];
          mesh.vertices.push({
            ...v,
            id: uid('v'),
            pos: {
              x: axis === 'x' ? -v.pos.x : v.pos.x,
              y: axis === 'y' ? -v.pos.y : v.pos.y,
              z: axis === 'z' ? -v.pos.z : v.pos.z,
            },
            normal: { ...v.normal },
            uv: { ...v.uv },
            color: [...v.color] as [number, number, number],
            weights: { ...v.weights },
          });
        }
        for (let fi = 0; fi < baseFaces; fi++) {
          const f = mesh.faces[fi];
          mesh.faces.push({
            ...f,
            verts: [...f.verts].reverse().map((vi) => vi + baseCount),
            normal: { ...f.normal },
          });
        }
      };
      if (ax) mirrorAxis('x');
      if (ay) mirrorAxis('y');
      if (az) mirrorAxis('z');
      mesh.edges = buildEdgesFromFaces(mesh.faces);
      break;
    }
    case 'solidify': {
      const t = Number(p.thickness ?? 0.14);
      const baseCount = mesh.vertices.length;
      const baseFaces = mesh.faces.length;
      for (let i = 0; i < baseCount; i++) {
        const v = mesh.vertices[i];
        mesh.vertices.push({
          ...v,
          id: uid('v'),
          pos: add3(v.pos, scale3(v.normal, -t)),
          normal: { ...v.normal },
          uv: { ...v.uv },
          color: [...v.color] as [number, number, number],
          weights: { ...v.weights },
        });
      }
      for (let fi = 0; fi < baseFaces; fi++) {
        const f = mesh.faces[fi];
        mesh.faces.push({
          ...f,
          verts: [...f.verts].reverse().map((vi) => vi + baseCount),
          normal: { ...f.normal },
        });
      }
      mesh.edges = buildEdgesFromFaces(mesh.faces);
      break;
    }
    case 'bevel': {
      bevelSelection(mesh, Number(p.width ?? 0.12));
      break;
    }
    case 'array': {
      const count = Math.min(8, Math.max(1, Number(p.count ?? 3)));
      const ox = Number(p.offsetX ?? 1.6);
      const oy = Number(p.offsetY ?? 0);
      const oz = Number(p.offsetZ ?? 0);
      const baseVerts = mesh.vertices.length;
      const baseFaces = mesh.faces.length;
      for (let c = 1; c < count; c++) {
        const vOff = mesh.vertices.length;
        for (let i = 0; i < baseVerts; i++) {
          const v = mesh.vertices[i];
          mesh.vertices.push({
            ...v,
            id: uid('v'),
            pos: { x: v.pos.x + ox * c, y: v.pos.y + oy * c, z: v.pos.z + oz * c },
            normal: { ...v.normal },
            uv: { ...v.uv },
            color: [...v.color] as [number, number, number],
            weights: { ...v.weights },
          });
        }
        for (let fi = 0; fi < baseFaces; fi++) {
          const f = mesh.faces[fi];
          mesh.faces.push({
            ...f,
            verts: f.verts.map((vi) => vi + vOff),
            normal: { ...f.normal },
          });
        }
      }
      mesh.edges = buildEdgesFromFaces(mesh.faces);
      break;
    }
    case 'decimate': {
      const ratio = Math.max(0.2, Math.min(1, Number(p.ratio ?? 0.6)));
      const targetFaces = Math.max(4, Math.floor(mesh.faces.length * ratio));
      let guard = 0;
      while (mesh.faces.length > targetFaces && mesh.edges.length > 0 && guard < 120) {
        guard++;
        // Collapse shortest edge to keep overall silhouette closed
        let bestIdx = 0;
        let bestLen = Infinity;
        for (let ei = 0; ei < mesh.edges.length; ei++) {
          const e = mesh.edges[ei];
          if (e.a === e.b || !mesh.vertices[e.a] || !mesh.vertices[e.b]) continue;
          const d = len3(sub3(mesh.vertices[e.a].pos, mesh.vertices[e.b].pos));
          if (d < bestLen) {
            bestLen = d;
            bestIdx = ei;
          }
        }
        const edge = mesh.edges[bestIdx];
        if (!edge) break;
        const a = edge.a;
        const b = edge.b;
        mesh.vertices[a].pos = scale3(add3(mesh.vertices[a].pos, mesh.vertices[b].pos), 0.5);
        mesh.faces = mesh.faces
          .map((f) => {
            const mapped: number[] = [];
            for (const vi of f.verts) {
              const nv = vi === b ? a : vi;
              if (mapped.length === 0 || mapped[mapped.length - 1] !== nv) mapped.push(nv);
            }
            if (mapped.length > 1 && mapped[0] === mapped[mapped.length - 1]) mapped.pop();
            return { ...f, verts: mapped };
          })
          .filter((f) => f.verts.length >= 3);
        mesh.edges = buildEdgesFromFaces(mesh.faces);
      }
      break;
    }
    case 'remesh': {
      loopCutMesh(mesh, 1);
      smoothVertices(mesh, 'vertex', 0.25);
      break;
    }
    case 'displace': {
      const s = Number(p.strength ?? 0.22);
      const mid = Number(p.midlevel ?? 0.5);
      mesh.vertices.forEach((v, i) => {
        const n = Math.sin(v.pos.x * 3.1 + v.pos.y * 2.7 + i * 0.3 + timeSec) * 0.5 + 0.5;
        v.pos = add3(v.pos, scale3(v.normal, (n - mid) * s));
      });
      break;
    }
    case 'cast': {
      const factor = Number(p.factor ?? 0.4);
      for (const v of mesh.vertices) {
        const len = Math.hypot(v.pos.x, v.pos.y, v.pos.z) || 1;
        v.pos = {
          x: v.pos.x + ((v.pos.x / len) - v.pos.x) * factor,
          y: v.pos.y + ((v.pos.y / len) - v.pos.y) * factor,
          z: v.pos.z + ((v.pos.z / len) - v.pos.z) * factor,
        };
      }
      break;
    }
    case 'wireframe': {
      const t = Math.max(0.05, Math.min(0.45, Number(p.thickness ?? 0.12)));
      const newFaces: Face[] = [];
      for (const f of mesh.faces) {
        if (f.verts.length < 3) continue;
        const center = scale3(
          f.verts.reduce((acc, vi) => add3(acc, mesh.vertices[vi].pos), { x: 0, y: 0, z: 0 }),
          1 / f.verts.length
        );
        const innerIdx: number[] = [];
        for (const vi of f.verts) {
          const src = mesh.vertices[vi];
          const pInner = add3(src.pos, scale3(sub3(center, src.pos), t));
          const idx = mesh.vertices.length;
          mesh.vertices.push({
            ...src,
            id: uid('v'),
            pos: pInner,
            normal: { ...src.normal },
            uv: { ...src.uv },
            color: [...src.color] as [number, number, number],
            weights: { ...src.weights },
          });
          innerIdx.push(idx);
        }
        for (let i = 0; i < f.verts.length; i++) {
          const next = (i + 1) % f.verts.length;
          newFaces.push({
            ...f,
            verts: [f.verts[i], f.verts[next], innerIdx[next], innerIdx[i]],
            normal: { ...f.normal },
          });
        }
      }
      mesh.faces = newFaces;
      mesh.edges = buildEdgesFromFaces(mesh.faces);
      break;
    }
    case 'screw': {
      const angleDeg = Number(p.angle ?? 360);
      const steps = Math.max(3, Math.min(24, Number(p.steps ?? 8)));
      const screwOffset = Number(p.screwOffset ?? 0);
      const profileCount = mesh.vertices.length;
      if (profileCount < 2) break;
      const rings: number[][] = [mesh.vertices.map((_, i) => i)];
      const totalRad = (angleDeg * Math.PI) / 180;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const a = totalRad * t;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const ring: number[] = [];
        for (let i = 0; i < profileCount; i++) {
          const v = mesh.vertices[i];
          const np = {
            x: v.pos.x * ca - v.pos.y * sa,
            y: v.pos.x * sa + v.pos.y * ca,
            z: v.pos.z + screwOffset * t,
          };
          const ni = mesh.vertices.length;
          mesh.vertices.push({
            ...v,
            id: uid('v'),
            pos: np,
            normal: { ...v.normal },
            uv: { ...v.uv },
            color: [...v.color] as [number, number, number],
            weights: { ...v.weights },
          });
          ring.push(ni);
        }
        rings.push(ring);
      }
      const newFaces: Face[] = [];
      const edgePairs = mesh.edges.slice(0, Math.min(24, mesh.edges.length));
      for (let s = 0; s < rings.length - 1; s++) {
        const r0 = rings[s];
        const r1 = rings[s + 1];
        for (const e of edgePairs) {
          if (e.a < profileCount && e.b < profileCount) {
            newFaces.push({
              verts: [r0[e.a], r0[e.b], r1[e.b], r1[e.a]],
              normal: { x: 0, y: 0, z: 1 },
              smooth: true,
              materialIndex: 0,
              faceSet: 1,
              selected: false,
            });
          }
        }
      }
      if (newFaces.length > 0) {
        mesh.faces = newFaces;
        mesh.edges = buildEdgesFromFaces(mesh.faces);
      }
      break;
    }
    case 'weld': {
      const dist = Math.max(0.001, Number(p.distance ?? 0.05));
      applyWeldByDistance(mesh, dist);
      break;
    }
    case 'boolean': {
      const targetName = String(p.targetName ?? '').trim();
      const op = String(p.operation ?? 'difference');
      const cutter = sceneObjects.find(
        (o) => o.id !== ownerObj?.id && (o.name === targetName || (!targetName && o.type === 'mesh'))
      );
      if (!cutter?.mesh || !ownerObj) break;
      // World bounding box of cutter mesh
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const v of cutter.mesh.vertices) {
        const wp = transformVec3(v.pos, cutter.location, cutter.rotation, cutter.scale);
        minX = Math.min(minX, wp.x); maxX = Math.max(maxX, wp.x);
        minY = Math.min(minY, wp.y); maxY = Math.max(maxY, wp.y);
        minZ = Math.min(minZ, wp.z); maxZ = Math.max(maxZ, wp.z);
      }
      const insideCutter = (wp: Vec3) =>
        wp.x >= minX && wp.x <= maxX && wp.y >= minY && wp.y <= maxY && wp.z >= minZ && wp.z <= maxZ;

      if (op === 'difference') {
        mesh.faces = mesh.faces.filter((f) => {
          const c = scale3(
            f.verts.reduce((acc, vi) => add3(acc, mesh.vertices[vi].pos), { x: 0, y: 0, z: 0 }),
            1 / Math.max(1, f.verts.length)
          );
          const wc = transformVec3(c, ownerObj.location, ownerObj.rotation, ownerObj.scale);
          return !insideCutter(wc);
        });
      } else if (op === 'intersect') {
        mesh.faces = mesh.faces.filter((f) => {
          const c = scale3(
            f.verts.reduce((acc, vi) => add3(acc, mesh.vertices[vi].pos), { x: 0, y: 0, z: 0 }),
            1 / Math.max(1, f.verts.length)
          );
          const wc = transformVec3(c, ownerObj.location, ownerObj.rotation, ownerObj.scale);
          return insideCutter(wc);
        });
      } else if (op === 'union') {
        const offset = mesh.vertices.length;
        for (const cv of cutter.mesh.vertices) {
          const wp = transformVec3(cv.pos, cutter.location, cutter.rotation, cutter.scale);
          // Convert cutter world pos roughly into owner local space by subtracting owner location
          const lp = sub3(wp, ownerObj.location);
          mesh.vertices.push({
            ...cv,
            id: uid('v'),
            pos: lp,
            normal: { ...cv.normal },
            uv: { ...cv.uv },
            color: [...cv.color] as [number, number, number],
            weights: { ...cv.weights },
          });
        }
        for (const cf of cutter.mesh.faces) {
          mesh.faces.push({
            ...cf,
            verts: cf.verts.map((vi) => vi + offset),
            normal: { ...cf.normal },
          });
        }
      }
      mesh.edges = buildEdgesFromFaces(mesh.faces);
      break;
    }
    case 'weightedNormal': {
      for (const f of mesh.faces) f.smooth = true;
      break;
    }
    default:
      break;
  }
}
