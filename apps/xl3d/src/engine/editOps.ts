import { add3, computeFaceNormal, len3, norm3, scale3, sub3, uid } from '../core/math3d';
import type { EditSelectMode, Face, MeshData, Vec3, Vertex } from '../core/types';
import { buildEdgesFromFaces, recomputeNormals } from './primitives';

function cloneVert(v: Vertex, pos: Vec3): Vertex {
  return {
    ...v,
    id: uid('v'),
    pos: { ...pos },
    normal: { ...v.normal },
    uv: { ...v.uv },
    color: [...v.color] as [number, number, number],
    weights: { ...v.weights },
    selected: true,
  };
}

export function getSelectedVertexIndices(mesh: MeshData, mode: EditSelectMode): Set<number> {
  const set = new Set<number>();
  if (mode === 'vertex') {
    mesh.vertices.forEach((v, i) => {
      if (v.selected && !v.hidden) set.add(i);
    });
  } else if (mode === 'edge') {
    mesh.edges.forEach((e) => {
      if (e.selected) {
        set.add(e.a);
        set.add(e.b);
      }
    });
  } else {
    mesh.faces.forEach((f) => {
      if (f.selected && !f.hidden) f.verts.forEach((vi) => set.add(vi));
    });
  }
  if (set.size === 0 && mesh.faces.length > 0) {
    // Fallback: if nothing selected, select first face for quick mobile editing
    mesh.faces[0].verts.forEach((vi) => set.add(vi));
  }
  return set;
}

export function selectAll(mesh: MeshData, select: boolean | 'invert'): void {
  mesh.vertices.forEach((v) => {
    v.selected = select === 'invert' ? !v.selected : select;
  });
  mesh.edges.forEach((e) => {
    e.selected = select === 'invert' ? !e.selected : select;
  });
  mesh.faces.forEach((f) => {
    f.selected = select === 'invert' ? !f.selected : select;
  });
}

export function selectSimilar(mesh: MeshData): void {
  const ref = mesh.faces.find((f) => f.selected) ?? mesh.faces[0];
  if (!ref) return;
  const targetLen = ref.verts.length;
  mesh.faces.forEach((f) => {
    f.selected = f.verts.length === targetLen;
    if (f.selected) f.verts.forEach((vi) => { if (mesh.vertices[vi]) mesh.vertices[vi].selected = true; });
  });
}

export function selectLoopOrRing(mesh: MeshData): void {
  const ref = mesh.faces.find((f) => f.selected) ?? mesh.faces[0];
  if (!ref) return;
  const nz = Math.abs(ref.normal.z);
  mesh.faces.forEach((f) => {
    if (Math.abs(Math.abs(f.normal.z) - nz) < 0.25) {
      f.selected = true;
      f.verts.forEach((vi) => { if (mesh.vertices[vi]) mesh.vertices[vi].selected = true; });
    }
  });
}

export function selectLinked(mesh: MeshData): void {
  const seed = getSelectedVertexIndices(mesh, 'vertex');
  const queue = Array.from(seed);
  const visited = new Set(queue);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const f of mesh.faces) {
      if (f.verts.includes(cur)) {
        f.selected = true;
        for (const vi of f.verts) {
          if (!visited.has(vi)) {
            visited.add(vi);
            queue.push(vi);
          }
        }
      }
    }
  }
  visited.forEach((vi) => { if (mesh.vertices[vi]) mesh.vertices[vi].selected = true; });
}

export function selectRandom(mesh: MeshData, ratio = 0.4): void {
  mesh.faces.forEach((f, idx) => {
    f.selected = ((idx * 9301 + 49297) % 233280) / 233280 < ratio;
  });
  mesh.vertices.forEach((v, idx) => {
    v.selected = ((idx * 4391 + 12347) % 233280) / 233280 < ratio;
  });
}

export function selectChecker(mesh: MeshData): void {
  mesh.faces.forEach((f, idx) => {
    f.selected = idx % 2 === 0;
  });
  mesh.vertices.forEach((v, idx) => {
    v.selected = idx % 2 === 0;
  });
}

export function translateSelection(mesh: MeshData, mode: EditSelectMode, delta: Vec3, proportionalRadius = 0): void {
  const sel = getSelectedVertexIndices(mesh, mode);
  if (proportionalRadius <= 0) {
    sel.forEach((vi) => {
      const v = mesh.vertices[vi];
      if (v) v.pos = add3(v.pos, delta);
    });
  } else {
    const centers = Array.from(sel).map((vi) => mesh.vertices[vi].pos);
    for (const v of mesh.vertices) {
      let minDist = Infinity;
      for (const c of centers) {
        const d = len3(sub3(v.pos, c));
        if (d < minDist) minDist = d;
      }
      if (minDist <= proportionalRadius) {
        const w = 0.5 * (1 + Math.cos((Math.PI * minDist) / proportionalRadius));
        v.pos = add3(v.pos, scale3(delta, w));
      }
    }
  }
  recomputeNormals(mesh);
}

// Extrude selected faces along their normal
export function extrudeFaces(mesh: MeshData, distance = 0.45): void {
  let targetFaces = mesh.faces.filter((f) => f.selected);
  if (targetFaces.length === 0 && mesh.faces.length > 0) {
    targetFaces = [mesh.faces[0]];
    mesh.faces[0].selected = true;
  }
  for (const face of targetFaces) {
    const n = face.normal;
    const oldVerts = [...face.verts];
    const newVerts: number[] = [];
    for (const vi of oldVerts) {
      const src = mesh.vertices[vi];
      const nv = cloneVert(src, add3(src.pos, scale3(n, distance)));
      newVerts.push(mesh.vertices.length);
      mesh.vertices.push(nv);
      src.selected = false;
    }
    // Side quads
    for (let i = 0; i < oldVerts.length; i++) {
      const a = oldVerts[i];
      const b = oldVerts[(i + 1) % oldVerts.length];
      const c = newVerts[(i + 1) % newVerts.length];
      const d = newVerts[i];
      mesh.faces.push({
        verts: [a, b, c, d],
        normal: { x: 0, y: 0, z: 1 },
        smooth: face.smooth,
        materialIndex: face.materialIndex,
        faceSet: face.faceSet,
        selected: false,
      });
    }
    face.verts = newVerts;
  }
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

// Inset selected faces toward their center
export function insetFaces(mesh: MeshData, thickness = 0.25): void {
  let targetFaces = mesh.faces.filter((f) => f.selected);
  if (targetFaces.length === 0 && mesh.faces.length > 0) {
    targetFaces = [mesh.faces[0]];
    mesh.faces[0].selected = true;
  }
  for (const face of targetFaces) {
    const oldVerts = [...face.verts];
    const center = oldVerts.reduce(
      (acc, vi) => add3(acc, mesh.vertices[vi].pos),
      { x: 0, y: 0, z: 0 }
    );
    const cPos = scale3(center, 1 / Math.max(1, oldVerts.length));
    const newVerts: number[] = [];
    for (const vi of oldVerts) {
      const src = mesh.vertices[vi];
      const p = add3(src.pos, scale3(sub3(cPos, src.pos), Math.min(0.9, Math.max(0.05, thickness))));
      newVerts.push(mesh.vertices.length);
      mesh.vertices.push(cloneVert(src, p));
    }
    for (let i = 0; i < oldVerts.length; i++) {
      const a = oldVerts[i];
      const b = oldVerts[(i + 1) % oldVerts.length];
      const c = newVerts[(i + 1) % newVerts.length];
      const d = newVerts[i];
      mesh.faces.push({
        verts: [a, b, c, d],
        normal: { x: 0, y: 0, z: 1 },
        smooth: face.smooth,
        materialIndex: face.materialIndex,
        faceSet: face.faceSet,
        selected: false,
      });
    }
    face.verts = newVerts;
  }
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

// Bevel selected faces / mesh corners
export function bevelSelection(mesh: MeshData, width = 0.18): void {
  insetFaces(mesh, Math.min(0.45, Math.max(0.05, width)));
  extrudeFaces(mesh, width * 0.45);
}

// Subdivide / Loop Cut / Catmull-like quad split
export function subdivideMesh(mesh: MeshData, selectedOnly = false): void {
  const newFaces: Face[] = [];
  const edgeMidCache = new Map<string, number>();

  const getMid = (a: number, b: number): number => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const k = `${lo}:${hi}`;
    const hit = edgeMidCache.get(k);
    if (hit !== undefined) return hit;
    const va = mesh.vertices[a];
    const vb = mesh.vertices[b];
    const midPos = scale3(add3(va.pos, vb.pos), 0.5);
    const mv = cloneVert(va, midPos);
    mv.uv = { x: (va.uv.x + vb.uv.x) * 0.5, y: (va.uv.y + vb.uv.y) * 0.5 };
    mv.selected = va.selected || vb.selected;
    const idx = mesh.vertices.length;
    mesh.vertices.push(mv);
    edgeMidCache.set(k, idx);
    return idx;
  };

  for (const f of mesh.faces) {
    if (selectedOnly && !f.selected) {
      newFaces.push(f);
      continue;
    }
    if (f.verts.length === 4) {
      const [v0, v1, v2, v3] = f.verts;
      const m01 = getMid(v0, v1);
      const m12 = getMid(v1, v2);
      const m23 = getMid(v2, v3);
      const m30 = getMid(v3, v0);
      const cPos = scale3(
        add3(add3(mesh.vertices[v0].pos, mesh.vertices[v1].pos), add3(mesh.vertices[v2].pos, mesh.vertices[v3].pos)),
        0.25
      );
      const mc = mesh.vertices.length;
      mesh.vertices.push(cloneVert(mesh.vertices[v0], cPos));
      newFaces.push(
        { ...f, verts: [v0, m01, mc, m30] },
        { ...f, verts: [m01, v1, m12, mc] },
        { ...f, verts: [mc, m12, v2, m23] },
        { ...f, verts: [m30, mc, m23, v3] }
      );
    } else if (f.verts.length === 3) {
      const [v0, v1, v2] = f.verts;
      const m01 = getMid(v0, v1);
      const m12 = getMid(v1, v2);
      const m20 = getMid(v2, v0);
      newFaces.push(
        { ...f, verts: [v0, m01, m20] },
        { ...f, verts: [m01, v1, m12] },
        { ...f, verts: [m20, m12, v2] },
        { ...f, verts: [m01, m12, m20] }
      );
    } else {
      newFaces.push(f);
    }
  }
  mesh.faces = newFaces;
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

// Loop Cut: slices quads along dominant ring or subdivides mesh
export function loopCutMesh(mesh: MeshData, cuts = 1): void {
  for (let i = 0; i < Math.max(1, cuts); i++) {
    subdivideMesh(mesh, false);
  }
}

// Knife / Bisect across plane (defaults to Z=0 split)
export function knifeBisect(mesh: MeshData, planeZ = 0, clearOuter = false): void {
  if (clearOuter) {
    mesh.faces = mesh.faces.filter((f) =>
      f.verts.some((vi) => (mesh.vertices[vi]?.pos.z ?? 0) <= planeZ)
    );
  } else {
    subdivideMesh(mesh, true);
  }
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

// Bridge Edge Loops / Fill / Grid Fill
export function bridgeOrFill(mesh: MeshData): void {
  const sel = Array.from(getSelectedVertexIndices(mesh, 'vertex'));
  if (sel.length >= 3) {
    mesh.faces.push({
      verts: sel.slice(0, 6),
      normal: { x: 0, y: 0, z: 1 },
      smooth: false,
      materialIndex: 0,
      faceSet: 1,
      selected: true,
    });
    mesh.edges = buildEdgesFromFaces(mesh.faces);
    recomputeNormals(mesh);
  }
}

// Merge selected vertices to center (At Center)
export function mergeVerticesToCenter(mesh: MeshData, mode: EditSelectMode): void {
  const sel = Array.from(getSelectedVertexIndices(mesh, mode));
  if (sel.length < 2) return;
  const center = sel.reduce((acc, vi) => add3(acc, mesh.vertices[vi].pos), { x: 0, y: 0, z: 0 });
  const cPos = scale3(center, 1 / sel.length);
  const keep = sel[0];
  mesh.vertices[keep].pos = cPos;
  const dropSet = new Set(sel.slice(1));
  mesh.faces = mesh.faces
    .map((f) => ({
      ...f,
      verts: f.verts
        .map((vi) => (dropSet.has(vi) ? keep : vi))
        .filter((vi, i, arr) => arr.indexOf(vi) === i),
    }))
    .filter((f) => f.verts.length >= 3);
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

// Dissolve selected faces
export function dissolveSelected(mesh: MeshData): void {
  const remaining = mesh.faces.filter((f) => !f.selected);
  if (remaining.length > 0) {
    mesh.faces = remaining;
    mesh.edges = buildEdgesFromFaces(mesh.faces);
    recomputeNormals(mesh);
  }
}

// Spin / Screw around Z axis
export function spinMesh(mesh: MeshData, steps = 6, angleDeg = 180): void {
  const origVerts = mesh.vertices.length;
  const stepRad = ((angleDeg * Math.PI) / 180) / Math.max(1, steps);
  const rings: number[][] = [Array.from({ length: origVerts }, (_, i) => i)];
  for (let s = 1; s <= steps; s++) {
    const a = s * stepRad;
    const c = Math.cos(a), sn = Math.sin(a);
    const ring: number[] = [];
    for (let i = 0; i < origVerts; i++) {
      const v = mesh.vertices[i];
      const nv = cloneVert(v, {
        x: v.pos.x * c - v.pos.y * sn,
        y: v.pos.x * sn + v.pos.y * c,
        z: v.pos.z,
      });
      ring.push(mesh.vertices.length);
      mesh.vertices.push(nv);
    }
    rings.push(ring);
  }
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < origVerts; i++) {
      const ni = (i + 1) % origVerts;
      mesh.faces.push({
        verts: [rings[s][i], rings[s][ni], rings[s + 1][ni], rings[s + 1][i]],
        normal: { x: 0, y: 0, z: 1 },
        smooth: true,
        materialIndex: 0,
        faceSet: 1,
        selected: false,
      });
    }
  }
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

export function polyBuildQuad(mesh: MeshData, at: Vec3): void {
  const s = 0.35;
  const base = mesh.vertices.length;
  mesh.vertices.push(
    cloneVert({ ...mesh.vertices[0], id: uid('v'), pos: at, normal: { x: 0, y: 0, z: 1 }, uv: { x: 0, y: 0 }, color: [0.85, 0.85, 0.88], mask: 0, weights: {}, selected: true }, { x: at.x - s, y: at.y - s, z: at.z }),
    cloneVert({ ...mesh.vertices[0], id: uid('v'), pos: at, normal: { x: 0, y: 0, z: 1 }, uv: { x: 1, y: 0 }, color: [0.85, 0.85, 0.88], mask: 0, weights: {}, selected: true }, { x: at.x + s, y: at.y - s, z: at.z }),
    cloneVert({ ...mesh.vertices[0], id: uid('v'), pos: at, normal: { x: 0, y: 0, z: 1 }, uv: { x: 1, y: 1 }, color: [0.85, 0.85, 0.88], mask: 0, weights: {}, selected: true }, { x: at.x + s, y: at.y + s, z: at.z }),
    cloneVert({ ...mesh.vertices[0], id: uid('v'), pos: at, normal: { x: 0, y: 0, z: 1 }, uv: { x: 0, y: 1 }, color: [0.85, 0.85, 0.88], mask: 0, weights: {}, selected: true }, { x: at.x - s, y: at.y + s, z: at.z })
  );
  mesh.faces.push({ verts: [base, base + 1, base + 2, base + 3], normal: { x: 0, y: 0, z: 1 }, smooth: false, materialIndex: 0, faceSet: 1, selected: true });
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

export function triangulateMesh(mesh: MeshData): void {
  const tris: Face[] = [];
  for (const f of mesh.faces) {
    if (f.verts.length <= 3) {
      tris.push(f);
    } else {
      for (let i = 1; i < f.verts.length - 1; i++) {
        tris.push({ ...f, verts: [f.verts[0], f.verts[i], f.verts[i + 1]] });
      }
    }
  }
  mesh.faces = tris;
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

export function trisToQuads(mesh: MeshData): void {
  const out: Face[] = [];
  for (let i = 0; i < mesh.faces.length; i++) {
    const f1 = mesh.faces[i];
    const f2 = mesh.faces[i + 1];
    if (f1 && f2 && f1.verts.length === 3 && f2.verts.length === 3) {
      const shared = f1.verts.filter((v) => f2.verts.includes(v));
      if (shared.length === 2) {
        const extra2 = f2.verts.find((v) => !f1.verts.includes(v));
        if (extra2 !== undefined) {
          out.push({ ...f1, verts: [...f1.verts, extra2] });
          i++;
          continue;
        }
      }
    }
    out.push(f1);
  }
  mesh.faces = out;
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

export function shrinkFatten(mesh: MeshData, mode: EditSelectMode, offset = 0.15): void {
  const sel = getSelectedVertexIndices(mesh, mode);
  sel.forEach((vi) => {
    const v = mesh.vertices[vi];
    if (v) v.pos = add3(v.pos, scale3(v.normal, offset));
  });
  recomputeNormals(mesh);
}

export function smoothVertices(mesh: MeshData, mode: EditSelectMode, factor = 0.4): void {
  const sel = getSelectedVertexIndices(mesh, mode);
  const neighbors = new Map<number, Set<number>>();
  for (const e of mesh.edges) {
    if (!neighbors.has(e.a)) neighbors.set(e.a, new Set());
    if (!neighbors.has(e.b)) neighbors.set(e.b, new Set());
    neighbors.get(e.a)!.add(e.b);
    neighbors.get(e.b)!.add(e.a);
  }
  const nextPos = new Map<number, Vec3>();
  sel.forEach((vi) => {
    const nb = Array.from(neighbors.get(vi) ?? []);
    if (nb.length === 0) return;
    const avg = scale3(
      nb.reduce((acc, ni) => add3(acc, mesh.vertices[ni].pos), { x: 0, y: 0, z: 0 }),
      1 / nb.length
    );
    const cur = mesh.vertices[vi].pos;
    nextPos.set(vi, add3(cur, scale3(sub3(avg, cur), factor)));
  });
  nextPos.forEach((p, vi) => {
    mesh.vertices[vi].pos = p;
  });
  recomputeNormals(mesh);
}

// Blender 5.2 Core LoopTools: Circle, Space, Flatten
export function loopToolsCircle(mesh: MeshData, mode: EditSelectMode): void {
  const sel = Array.from(getSelectedVertexIndices(mesh, mode));
  if (sel.length < 3) return;
  const center = scale3(
    sel.reduce((acc, vi) => add3(acc, mesh.vertices[vi].pos), { x: 0, y: 0, z: 0 }),
    1 / sel.length
  );
  const avgR =
    sel.reduce((acc, vi) => acc + len3(sub3(mesh.vertices[vi].pos, center)), 0) / sel.length || 0.5;
  sel.forEach((vi) => {
    const v = mesh.vertices[vi];
    const dir = norm3(sub3(v.pos, center));
    v.pos = add3(center, scale3(dir, avgR));
  });
  recomputeNormals(mesh);
}

export function loopToolsFlatten(mesh: MeshData, mode: EditSelectMode): void {
  const sel = Array.from(getSelectedVertexIndices(mesh, mode));
  if (sel.length < 3) return;
  const center = scale3(
    sel.reduce((acc, vi) => add3(acc, mesh.vertices[vi].pos), { x: 0, y: 0, z: 0 }),
    1 / sel.length
  );
  const avgN = norm3(
    sel.reduce((acc, vi) => add3(acc, mesh.vertices[vi].normal), { x: 0, y: 0, z: 0 })
  );
  sel.forEach((vi) => {
    const v = mesh.vertices[vi];
    const d = sub3(v.pos, center);
    const proj = d.x * avgN.x + d.y * avgN.y + d.z * avgN.z;
    v.pos = sub3(v.pos, scale3(avgN, proj));
  });
  recomputeNormals(mesh);
}

export function loopToolsSpace(mesh: MeshData, mode: EditSelectMode): void {
  const sel = Array.from(getSelectedVertexIndices(mesh, mode));
  if (sel.length < 3) return;
  const first = mesh.vertices[sel[0]].pos;
  const last = mesh.vertices[sel[sel.length - 1]].pos;
  sel.forEach((vi, i) => {
    const t = i / (sel.length - 1);
    mesh.vertices[vi].pos = add3(first, scale3(sub3(last, first), t));
  });
  recomputeNormals(mesh);
}

// Normals & UV
export function shadeSmoothByAngle(mesh: MeshData, angleDeg = 35): void {
  mesh.autoSmoothAngle = angleDeg;
  for (const f of mesh.faces) {
    f.smooth = angleDeg >= 15;
  }
  recomputeNormals(mesh);
}

export function uvUnwrap(mesh: MeshData, smart = false): void {
  for (const v of mesh.vertices) {
    if (smart) {
      // Box/Smart UV projection based on dominant normal axis
      const ax = Math.abs(v.normal.x);
      const ay = Math.abs(v.normal.y);
      const az = Math.abs(v.normal.z);
      if (az >= ax && az >= ay) {
        v.uv = { x: v.pos.x * 0.25 + 0.5, y: v.pos.y * 0.25 + 0.5 };
      } else if (ax >= ay) {
        v.uv = { x: v.pos.y * 0.25 + 0.5, y: v.pos.z * 0.25 + 0.5 };
      } else {
        v.uv = { x: v.pos.x * 0.25 + 0.5, y: v.pos.z * 0.25 + 0.5 };
      }
    } else {
      v.uv = {
        x: Math.max(0, Math.min(1, 0.5 + Math.atan2(v.pos.y, v.pos.x) / (Math.PI * 2))),
        y: Math.max(0, Math.min(1, 0.5 + v.pos.z * 0.25)),
      };
    }
  }
}

export function markSeam(mesh: MeshData): void {
  mesh.edges.forEach((e) => {
    if (e.selected || (mesh.vertices[e.a]?.selected && mesh.vertices[e.b]?.selected)) {
      e.seam = !e.seam;
    }
  });
}

export function packUvIslands(mesh: MeshData): void {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const v of mesh.vertices) {
    minU = Math.min(minU, v.uv.x);
    maxU = Math.max(maxU, v.uv.x);
    minV = Math.min(minV, v.uv.y);
    maxV = Math.max(maxV, v.uv.y);
  }
  const spanU = Math.max(1e-4, maxU - minU);
  const spanV = Math.max(1e-4, maxV - minV);
  for (const v of mesh.vertices) {
    v.uv = {
      x: 0.05 + ((v.uv.x - minU) / spanU) * 0.9,
      y: 0.05 + ((v.uv.y - minV) / spanV) * 0.9,
    };
  }
}
