import { add3, scale3, uid } from '../core/math3d';
import type { MeshData, ModifierInstance, ModifierType, SceneObject } from '../core/types';
import { bevelSelection, loopCutMesh, subdivideMesh, triangulateMesh } from './editOps';
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

export function evaluateModifierStack(obj: SceneObject, timeSec = 0): MeshData | null {
  if (!obj.mesh) return null;
  const out = cloneMeshData(obj.mesh);
  applyShapeKeysToMesh(obj, out);

  for (const mod of obj.modifiers) {
    if (!mod.enabled) continue;
    applySingleModifier(out, mod, timeSec);
  }
  recomputeNormals(out);
  return out;
}

export function applySingleModifier(mesh: MeshData, mod: ModifierInstance, timeSec = 0): void {
  const p = mod.params;
  switch (mod.type) {
    case 'subsurf': {
      const levels = Math.min(2, Math.max(1, Number(p.levels ?? 1)));
      for (let i = 0; i < levels; i++) {
        subdivideMesh(mesh, false);
        if (p.catmullClark !== false) {
          for (const v of mesh.vertices) {
            v.pos = scale3(v.pos, 0.94);
          }
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
      const keep = Math.max(1, Math.floor(mesh.faces.length * ratio));
      mesh.faces = mesh.faces.slice(0, keep);
      mesh.edges = buildEdgesFromFaces(mesh.faces);
      break;
    }
    case 'remesh': {
      loopCutMesh(mesh, 1);
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
      triangulateMesh(mesh);
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
