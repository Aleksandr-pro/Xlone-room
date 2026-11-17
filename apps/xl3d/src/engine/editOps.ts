import { add3, dot3, len3, norm3, rotateOnlyVec3, scale3, sub3, uid } from '../core/math3d';
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

export function getCameraFacingFace(mesh: MeshData, camForwardLocal?: Vec3): Face | undefined {
  if (mesh.faces.length === 0) return undefined;
  if (!camForwardLocal) return mesh.faces[1] ?? mesh.faces[0];
  let best: Face = mesh.faces[0];
  let bestDot = Infinity;
  for (const f of mesh.faces) {
    if (f.hidden) continue;
    const d = dot3(f.normal, camForwardLocal);
    if (d < bestDot) {
      bestDot = d;
      best = f;
    }
  }
  return best;
}

export function selectMeshElementByHit(
  mesh: MeshData,
  mode: EditSelectMode,
  faceIdx: number,
  hitLocal: Vec3,
  additive = false
): void {
  if (!additive) {
    mesh.vertices.forEach((v) => { v.selected = false; });
    mesh.edges.forEach((e) => { e.selected = false; });
    mesh.faces.forEach((f) => { f.selected = false; });
  }
  const face = mesh.faces[faceIdx];
  if (!face) return;

  if (mode === 'face') {
    face.selected = true;
    face.verts.forEach((vi) => {
      if (mesh.vertices[vi]) mesh.vertices[vi].selected = true;
    });
  } else if (mode === 'vertex') {
    let bestVi = face.verts[0];
    let bestD = Infinity;
    for (const vi of face.verts) {
      const v = mesh.vertices[vi];
      if (!v) continue;
      const d = len3(sub3(v.pos, hitLocal));
      if (d < bestD) {
        bestD = d;
        bestVi = vi;
      }
    }
    if (mesh.vertices[bestVi]) mesh.vertices[bestVi].selected = true;
  } else if (mode === 'edge') {
    let bestEdgeIdx = -1;
    let bestD = Infinity;
    mesh.edges.forEach((e, idx) => {
      if (!face.verts.includes(e.a) || !face.verts.includes(e.b)) return;
      const mid = scale3(add3(mesh.vertices[e.a].pos, mesh.vertices[e.b].pos), 0.5);
      const d = len3(sub3(mid, hitLocal));
      if (d < bestD) {
        bestD = d;
        bestEdgeIdx = idx;
      }
    });
    if (bestEdgeIdx >= 0) {
      const edge = mesh.edges[bestEdgeIdx];
      edge.selected = true;
      mesh.vertices[edge.a].selected = true;
      mesh.vertices[edge.b].selected = true;
    }
  }
}

export function getSelectedVertexIndices(mesh: MeshData, mode: EditSelectMode, camForwardLocal?: Vec3): Set<number> {
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
    const fallback = getCameraFacingFace(mesh, camForwardLocal);
    fallback?.verts.forEach((vi) => set.add(vi));
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

export function translateSelection(
  mesh: MeshData,
  mode: EditSelectMode,
  delta: Vec3,
  proportionalRadius = 0,
  camForwardLocal?: Vec3
): void {
  const sel = getSelectedVertexIndices(mesh, mode, camForwardLocal);
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

export function rotateSelection(
  mesh: MeshData,
  mode: EditSelectMode,
  rotDeg: Vec3,
  pivot?: Vec3
): void {
  const sel = Array.from(getSelectedVertexIndices(mesh, mode));
  if (sel.length === 0) return;
  const center =
    pivot ??
    scale3(
      sel.reduce((acc, vi) => add3(acc, mesh.vertices[vi].pos), { x: 0, y: 0, z: 0 }),
      1 / sel.length
    );
  sel.forEach((vi) => {
    const v = mesh.vertices[vi];
    if (!v) return;
    v.pos = add3(center, rotateOnlyVec3(sub3(v.pos, center), rotDeg));
  });
  recomputeNormals(mesh);
}

export function scaleSelection(
  mesh: MeshData,
  mode: EditSelectMode,
  factor: number,
  pivot?: Vec3
): void {
  const sel = Array.from(getSelectedVertexIndices(mesh, mode));
  if (sel.length === 0) return;
  const center =
    pivot ??
    scale3(
      sel.reduce((acc, vi) => add3(acc, mesh.vertices[vi].pos), { x: 0, y: 0, z: 0 }),
      1 / sel.length
    );
  sel.forEach((vi) => {
    const v = mesh.vertices[vi];
    if (!v) return;
    v.pos = add3(center, scale3(sub3(v.pos, center), factor));
  });
  recomputeNormals(mesh);
}

// Extrude selected faces along their normal
export function extrudeFaces(mesh: MeshData, distance = 0.45, camForwardLocal?: Vec3): void {
  let targetFaces = mesh.faces.filter((f) => f.selected);
  if (targetFaces.length === 0 && mesh.faces.length > 0) {
    const fallback = getCameraFacingFace(mesh, camForwardLocal);
    if (fallback) {
      fallback.selected = true;
      targetFaces = [fallback];
    }
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
export function insetFaces(mesh: MeshData, thickness = 0.25, camForwardLocal?: Vec3): void {
  let targetFaces = mesh.faces.filter((f) => f.selected);
  if (targetFaces.length === 0 && mesh.faces.length > 0) {
    const fallback = getCameraFacingFace(mesh, camForwardLocal);
    if (fallback) {
      fallback.selected = true;
      targetFaces = [fallback];
    }
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

export function flipNormals(mesh: MeshData): void {
  let flipped = false;
  for (const f of mesh.faces) {
    if (f.selected) {
      f.verts.reverse();
      flipped = true;
    }
  }
  if (!flipped) {
    for (const f of mesh.faces) f.verts.reverse();
  }
  recomputeNormals(mesh);
}

export function pokeFaces(mesh: MeshData): void {
  const out: Face[] = [];
  for (const f of mesh.faces) {
    if (!f.selected || f.verts.length < 3) {
      out.push(f);
      continue;
    }
    const cPos = scale3(
      f.verts.reduce((acc, vi) => add3(acc, mesh.vertices[vi].pos), { x: 0, y: 0, z: 0 }),
      1 / f.verts.length
    );
    const ci = mesh.vertices.length;
    mesh.vertices.push(cloneVert(mesh.vertices[f.verts[0]], add3(cPos, scale3(f.normal, 0.2))));
    for (let i = 0; i < f.verts.length; i++) {
      out.push({
        ...f,
        verts: [f.verts[i], f.verts[(i + 1) % f.verts.length], ci],
        selected: true,
      });
    }
  }
  mesh.faces = out;
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

export function toggleSharpEdges(mesh: MeshData): void {
  mesh.edges.forEach((e) => {
    if (e.selected || (mesh.vertices[e.a]?.selected && mesh.vertices[e.b]?.selected)) {
      e.sharp = !e.sharp;
    }
  });
}

// Bridge Edge Loops / Fill (F)
export function bridgeOrFillSelection(mesh: MeshData, mode: EditSelectMode): void {
  const selFaces = mesh.faces.filter((f) => f.selected);
  if (selFaces.length >= 2) {
    const f1 = selFaces[0];
    const f2 = selFaces[1];
    const n = Math.min(f1.verts.length, f2.verts.length);
    if (n >= 3) {
      // Remove the two interior caps and bridge corresponding edges
      mesh.faces = mesh.faces.filter((f) => f !== f1 && f !== f2);
      for (let i = 0; i < n; i++) {
        const a1 = f1.verts[i];
        const b1 = f1.verts[(i + 1) % n];
        const a2 = f2.verts[i];
        const b2 = f2.verts[(i + 1) % n];
        mesh.faces.push({
          verts: [a1, b1, b2, a2],
          normal: { x: 0, y: 0, z: 1 },
          smooth: f1.smooth || f2.smooth,
          materialIndex: f1.materialIndex,
          faceSet: f1.faceSet,
          selected: true,
        });
      }
      mesh.edges = buildEdgesFromFaces(mesh.faces);
      recomputeNormals(mesh);
      return;
    }
  }

  const selVerts = Array.from(getSelectedVertexIndices(mesh, mode));
  if (selVerts.length < 3) return;
  const center = scale3(
    selVerts.reduce((acc, vi) => add3(acc, mesh.vertices[vi].pos), { x: 0, y: 0, z: 0 }),
    1 / selVerts.length
  );
  const sorted = [...selVerts].sort((ia, ib) => {
    const pa = sub3(mesh.vertices[ia].pos, center);
    const pb = sub3(mesh.vertices[ib].pos, center);
    return Math.atan2(pa.y, pa.x) - Math.atan2(pb.y, pb.x);
  });
  mesh.faces.push({
    verts: sorted,
    normal: { x: 0, y: 0, z: 1 },
    smooth: false,
    materialIndex: 0,
    faceSet: 1,
    selected: true,
  });
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

// Dissolve selected vertices / faces cleanly
export function dissolveSelection(mesh: MeshData, mode: EditSelectMode): void {
  if (mode === 'face') {
    const kept = mesh.faces.filter((f) => !f.selected);
    if (kept.length > 0 && kept.length < mesh.faces.length) {
      mesh.faces = kept;
      mesh.edges = buildEdgesFromFaces(mesh.faces);
      recomputeNormals(mesh);
    }
    return;
  }
  const sel = getSelectedVertexIndices(mesh, mode);
  if (sel.size === 0) return;
  const boundaryVerts = new Set<number>();
  const keptFaces: Face[] = [];
  for (const f of mesh.faces) {
    if (f.verts.some((vi) => sel.has(vi))) {
      f.verts.forEach((vi) => {
        if (!sel.has(vi)) boundaryVerts.add(vi);
      });
    } else {
      keptFaces.push(f);
    }
  }
  if (keptFaces.length === 0) return;
  mesh.faces = keptFaces;
  if (boundaryVerts.size >= 3) {
    const arr = Array.from(boundaryVerts);
    const center = scale3(
      arr.reduce((acc, vi) => add3(acc, mesh.vertices[vi].pos), { x: 0, y: 0, z: 0 }),
      1 / arr.length
    );
    arr.sort((a, b) => {
      const pa = sub3(mesh.vertices[a].pos, center);
      const pb = sub3(mesh.vertices[b].pos, center);
      return Math.atan2(pa.y, pa.x) - Math.atan2(pb.y, pb.x);
    });
    mesh.faces.push({
      verts: arr,
      normal: { x: 0, y: 0, z: 1 },
      smooth: false,
      materialIndex: 0,
      faceSet: 1,
      selected: true,
    });
  }
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

// Shrink / Fatten (Alt+S) along vertex normals
export function shrinkFattenSelection(mesh: MeshData, mode: EditSelectMode, distance = 0.15): void {
  const sel = getSelectedVertexIndices(mesh, mode);
  sel.forEach((vi) => {
    const v = mesh.vertices[vi];
    if (v) v.pos = add3(v.pos, scale3(v.normal, distance));
  });
  recomputeNormals(mesh);
}

// Duplicate selected faces inside current mesh (Shift+D in Edit Mode)
export function duplicateSelectedFaces(mesh: MeshData, offset: Vec3 = { x: 0.35, y: 0, z: 0.35 }): void {
  const selFaces = mesh.faces.filter((f) => f.selected);
  if (selFaces.length === 0) return;
  const mapVert = new Map<number, number>();
  for (const f of selFaces) {
    f.selected = false;
    const newVerts: number[] = [];
    for (const vi of f.verts) {
      let nvIdx = mapVert.get(vi);
      if (nvIdx === undefined) {
        const src = mesh.vertices[vi];
        src.selected = false;
        nvIdx = mesh.vertices.length;
        mesh.vertices.push(cloneVert(src, add3(src.pos, offset)));
        mapVert.set(vi, nvIdx);
      }
      newVerts.push(nvIdx);
    }
    mesh.faces.push({
      ...f,
      verts: newVerts,
      normal: { ...f.normal },
      selected: true,
    });
  }
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

// Separate selected faces into a new standalone MeshData (P -> Selection)
export function extractSelectedFacesAsMesh(mesh: MeshData): MeshData | null {
  const selFaces = mesh.faces.filter((f) => f.selected);
  if (selFaces.length === 0 || selFaces.length >= mesh.faces.length) return null;

  const newVerts: Vertex[] = [];
  const remap = new Map<number, number>();
  const newFaces: Face[] = [];

  for (const f of selFaces) {
    const vIdx: number[] = [];
    for (const oldVi of f.verts) {
      let mapped = remap.get(oldVi);
      if (mapped === undefined) {
        mapped = newVerts.length;
        newVerts.push(cloneVert(mesh.vertices[oldVi], mesh.vertices[oldVi].pos));
        remap.set(oldVi, mapped);
      }
      vIdx.push(mapped);
    }
    newFaces.push({ ...f, verts: vIdx, normal: { ...f.normal }, selected: false });
  }

  mesh.faces = mesh.faces.filter((f) => !f.selected);
  mesh.vertices.forEach((v) => { v.selected = false; });
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);

  const out: MeshData = {
    vertices: newVerts,
    edges: buildEdgesFromFaces(newFaces),
    faces: newFaces,
    autoSmoothAngle: mesh.autoSmoothAngle,
    customSplitNormals: mesh.customSplitNormals,
    udimTile: mesh.udimTile,
    uvSyncSelection: mesh.uvSyncSelection,
  };
  recomputeNormals(out);
  return out;
}

// Spin selected faces/verts around Z axis
export function spinSelection(mesh: MeshData, mode: EditSelectMode, angleDeg = 90, steps = 4): void {
  const selVerts = Array.from(getSelectedVertexIndices(mesh, mode));
  if (selVerts.length < 2) return;
  const stepRad = ((angleDeg * Math.PI) / 180) / Math.max(1, steps);
  let prevRing = selVerts;
  for (let s = 1; s <= steps; s++) {
    const a = stepRad * s;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const nextRing: number[] = [];
    for (const vi of selVerts) {
      const p = mesh.vertices[vi].pos;
      const np = { x: p.x * c - p.y * sn, y: p.x * sn + p.y * c, z: p.z };
      const idx = mesh.vertices.length;
      mesh.vertices.push(cloneVert(mesh.vertices[vi], np));
      nextRing.push(idx);
    }
    for (let i = 0; i < selVerts.length - 1; i++) {
      mesh.faces.push({
        verts: [prevRing[i], prevRing[i + 1], nextRing[i + 1], nextRing[i]],
        normal: { x: 0, y: 0, z: 1 },
        smooth: true,
        materialIndex: 0,
        faceSet: 1,
        selected: s === steps,
      });
    }
    prevRing = nextRing;
  }
  mesh.edges = buildEdgesFromFaces(mesh.faces);
  recomputeNormals(mesh);
}

// Grow / Shrink selection (Ctrl++ / Ctrl+-)
export function growOrShrinkSelection(mesh: MeshData, grow: boolean): void {
  if (grow) {
    const selVerts = new Set<number>();
    mesh.faces.forEach((f) => {
      if (f.selected) f.verts.forEach((vi) => selVerts.add(vi));
    });
    mesh.vertices.forEach((v, idx) => {
      if (v.selected) selVerts.add(idx);
    });
    mesh.faces.forEach((f) => {
      if (f.verts.some((vi) => selVerts.has(vi))) {
        f.selected = true;
        f.verts.forEach((vi) => {
          if (mesh.vertices[vi]) mesh.vertices[vi].selected = true;
        });
      }
    });
  } else {
    const borderVerts = new Set<number>();
    mesh.faces.forEach((f) => {
      if (!f.selected) f.verts.forEach((vi) => borderVerts.add(vi));
    });
    mesh.faces.forEach((f) => {
      if (f.selected && f.verts.some((vi) => borderVerts.has(vi))) {
        f.selected = false;
      }
    });
    mesh.vertices.forEach((v, idx) => {
      if (borderVerts.has(idx)) v.selected = false;
    });
  }
}
