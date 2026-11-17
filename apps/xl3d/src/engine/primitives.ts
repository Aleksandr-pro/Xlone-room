import { computeFaceNormal, norm3, uid } from '../core/math3d';
import type {
  CurveData,
  Edge,
  Face,
  MaterialData,
  MeshData,
  NodeGraph,
  ObjectType,
  PhysicsSettings,
  SceneObject,
  Text3DData,
  Vec3,
  Vertex,
  XL3DScene,
} from '../core/types';

export type MeshPrimitiveKind = 'cube' | 'sphere' | 'icosphere' | 'cylinder' | 'cone' | 'torus' | 'plane' | 'monkey';

export function defaultPhysics(): PhysicsSettings {
  return {
    type: 'none',
    mass: 1,
    gravityScale: 1,
    bounciness: 0.4,
    friction: 0.5,
    stiffness: 0.7,
    windForce: 0,
    fluidRole: 'flow',
    fluidKind: 'liquid',
    particleCount: 150,
    hairLength: 0.4,
  };
}

export function buildEdgesFromFaces(faces: Face[]): Edge[] {
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const f of faces) {
    for (let i = 0; i < f.verts.length; i++) {
      const a = f.verts[i];
      const b = f.verts[(i + 1) % f.verts.length];
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}:${hi}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ a: lo, b: hi, selected: false });
      }
    }
  }
  return edges;
}

export function recomputeNormals(mesh: MeshData): void {
  for (const v of mesh.vertices) {
    v.normal = { x: 0, y: 0, z: 0 };
  }
  for (const f of mesh.faces) {
    if (f.verts.length < 3) continue;
    const p0 = mesh.vertices[f.verts[0]]?.pos;
    const p1 = mesh.vertices[f.verts[1]]?.pos;
    const p2 = mesh.vertices[f.verts[2]]?.pos;
    if (!p0 || !p1 || !p2) continue;
    f.normal = computeFaceNormal(p0, p1, p2);
    for (const vi of f.verts) {
      const v = mesh.vertices[vi];
      if (!v) continue;
      v.normal.x += f.normal.x;
      v.normal.y += f.normal.y;
      v.normal.z += f.normal.z;
    }
  }
  for (const v of mesh.vertices) {
    v.normal = norm3(v.normal);
  }
  if (mesh.edges.length === 0 && mesh.faces.length > 0) {
    mesh.edges = buildEdgesFromFaces(mesh.faces);
  }
}

function makeVert(pos: Vec3, u = 0, v = 0): Vertex {
  return {
    id: uid('v'),
    pos: { ...pos },
    normal: { x: 0, y: 0, z: 1 },
    uv: { x: u, y: v },
    color: [0.85, 0.85, 0.88],
    mask: 0,
    weights: {},
    selected: false,
  };
}

export function createMeshPrimitive(kind: MeshPrimitiveKind, size = 1): MeshData {
  const vertices: Vertex[] = [];
  const faces: Face[] = [];
  const r = size;

  if (kind === 'plane') {
    vertices.push(
      makeVert({ x: -r, y: -r, z: 0 }, 0, 0),
      makeVert({ x: r, y: -r, z: 0 }, 1, 0),
      makeVert({ x: r, y: r, z: 0 }, 1, 1),
      makeVert({ x: -r, y: r, z: 0 }, 0, 1)
    );
    faces.push({ verts: [0, 1, 2, 3], normal: { x: 0, y: 0, z: 1 }, smooth: false, materialIndex: 0, faceSet: 1, selected: false });
  } else if (kind === 'cube') {
    const pts: Vec3[] = [
      { x: -r, y: -r, z: -r },
      { x: r, y: -r, z: -r },
      { x: r, y: r, z: -r },
      { x: -r, y: r, z: -r },
      { x: -r, y: -r, z: r },
      { x: r, y: -r, z: r },
      { x: r, y: r, z: r },
      { x: -r, y: r, z: r },
    ];
    pts.forEach((p, idx) => vertices.push(makeVert(p, (idx % 2), Math.floor(idx / 2) % 2)));
    const quads = [
      [0, 3, 2, 1], // bottom
      [4, 5, 6, 7], // top
      [0, 1, 5, 4], // front
      [1, 2, 6, 5], // right
      [2, 3, 7, 6], // back
      [3, 0, 4, 7], // left
    ];
    for (const q of quads) {
      faces.push({ verts: q, normal: { x: 0, y: 0, z: 1 }, smooth: false, materialIndex: 0, faceSet: 1, selected: false });
    }
  } else if (kind === 'sphere' || kind === 'icosphere') {
    const segs = kind === 'icosphere' ? 10 : 14;
    const rings = kind === 'icosphere' ? 6 : 10;
    for (let j = 0; j <= rings; j++) {
      const phi = (j / rings) * Math.PI;
      for (let i = 0; i < segs; i++) {
        const theta = (i / segs) * Math.PI * 2;
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        vertices.push(makeVert({ x, y, z }, i / segs, j / rings));
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segs; i++) {
        const nextI = (i + 1) % segs;
        const a = j * segs + i;
        const b = j * segs + nextI;
        const c = (j + 1) * segs + nextI;
        const d = (j + 1) * segs + i;
        faces.push({ verts: [a, d, c, b], normal: { x: 0, y: 0, z: 1 }, smooth: true, materialIndex: 0, faceSet: 1, selected: false });
      }
    }
  } else if (kind === 'cylinder' || kind === 'cone') {
    const segs = 14;
    const h = r;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      vertices.push(makeVert({ x: r * Math.cos(a), y: r * Math.sin(a), z: -h }, i / segs, 0));
    }
    if (kind === 'cylinder') {
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        vertices.push(makeVert({ x: r * Math.cos(a), y: r * Math.sin(a), z: h }, i / segs, 1));
      }
      for (let i = 0; i < segs; i++) {
        const n = (i + 1) % segs;
        faces.push({ verts: [i, n, segs + n, segs + i], normal: { x: 0, y: 0, z: 1 }, smooth: true, materialIndex: 0, faceSet: 1, selected: false });
      }
      faces.push({ verts: Array.from({ length: segs }, (_, i) => segs - 1 - i), normal: { x: 0, y: 0, z: -1 }, smooth: false, materialIndex: 0, faceSet: 2, selected: false });
      faces.push({ verts: Array.from({ length: segs }, (_, i) => segs + i), normal: { x: 0, y: 0, z: 1 }, smooth: false, materialIndex: 0, faceSet: 3, selected: false });
    } else {
      const tip = vertices.length;
      vertices.push(makeVert({ x: 0, y: 0, z: h }, 0.5, 1));
      for (let i = 0; i < segs; i++) {
        const n = (i + 1) % segs;
        faces.push({ verts: [i, n, tip], normal: { x: 0, y: 0, z: 1 }, smooth: true, materialIndex: 0, faceSet: 1, selected: false });
      }
      faces.push({ verts: Array.from({ length: segs }, (_, i) => segs - 1 - i), normal: { x: 0, y: 0, z: -1 }, smooth: false, materialIndex: 0, faceSet: 2, selected: false });
    }
  } else if (kind === 'torus') {
    const majorR = r * 0.9;
    const minorR = r * 0.34;
    const majSeg = 18;
    const minSeg = 10;
    for (let i = 0; i < majSeg; i++) {
      const u = (i / majSeg) * Math.PI * 2;
      for (let j = 0; j < minSeg; j++) {
        const v = (j / minSeg) * Math.PI * 2;
        const x = (majorR + minorR * Math.cos(v)) * Math.cos(u);
        const y = (majorR + minorR * Math.cos(v)) * Math.sin(u);
        const z = minorR * Math.sin(v);
        vertices.push(makeVert({ x, y, z }, i / majSeg, j / minSeg));
      }
    }
    for (let i = 0; i < majSeg; i++) {
      const ni = (i + 1) % majSeg;
      for (let j = 0; j < minSeg; j++) {
        const nj = (j + 1) % minSeg;
        const a = i * minSeg + j;
        const b = ni * minSeg + j;
        const c = ni * minSeg + nj;
        const d = i * minSeg + nj;
        faces.push({ verts: [a, b, c, d], normal: { x: 0, y: 0, z: 1 }, smooth: true, materialIndex: 0, faceSet: 1, selected: false });
      }
    }
  } else {
    // Suzanne-inspired stylized sculpted head/crystal
    const base = createMeshPrimitive('icosphere', r * 0.92);
    for (const v of base.vertices) {
      if (Math.abs(v.pos.x) > r * 0.65 && v.pos.z > -0.2 && v.pos.z < 0.45) {
        v.pos.x *= 1.32; // ears
      }
      if (v.pos.y < -r * 0.45 && v.pos.z < 0.1) {
        v.pos.y *= 1.25; // snout
      }
    }
    recomputeNormals(base);
    return base;
  }

  const mesh: MeshData = {
    vertices,
    edges: buildEdgesFromFaces(faces),
    faces,
    autoSmoothAngle: 35,
    customSplitNormals: false,
    udimTile: 1001,
    uvSyncSelection: true,
  };
  recomputeNormals(mesh);
  return mesh;
}

function makeFace(verts: number[], smooth = false): Face {
  return {
    verts,
    normal: { x: 0, y: 0, z: 1 },
    smooth,
    materialIndex: 0,
    faceSet: 1,
    selected: false,
  };
}

export function buildMeshFromCurve(curve: CurveData): MeshData {
  const pts = curve.points;
  if (pts.length < 2) return createMeshPrimitive('cylinder', 0.2);

  const samplePts: Vec3[] = [];
  const segCount = curve.closed ? pts.length : pts.length - 1;
  const steps = Math.max(4, Math.min(24, curve.resolution || 10));

  for (let i = 0; i < segCount; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    const c0 = p0.pos;
    const c1 = p0.handleRight;
    const c2 = p1.handleLeft;
    const c3 = p1.pos;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      const b0 = u * u * u;
      const b1 = 3 * u * u * t;
      const b2 = 3 * u * t * t;
      const b3 = t * t * t;
      samplePts.push({
        x: b0 * c0.x + b1 * c1.x + b2 * c2.x + b3 * c3.x,
        y: b0 * c0.y + b1 * c1.y + b2 * c2.y + b3 * c3.y,
        z: b0 * c0.z + b1 * c1.z + b2 * c2.z + b3 * c3.z,
      });
    }
  }
  if (!curve.closed) samplePts.push({ ...pts[pts.length - 1].pos });

  const sides = 6;
  const r = Math.max(0.03, curve.bevelDepth || 0.08);
  const verts: Vertex[] = [];
  const faces: Face[] = [];

  for (let i = 0; i < samplePts.length; i++) {
    const cur = samplePts[i];
    const prev = samplePts[Math.max(0, i - 1)];
    const next = samplePts[Math.min(samplePts.length - 1, i + 1)];
    const tang = norm3({ x: next.x - prev.x, y: next.y - prev.y, z: next.z - prev.z });
    const up = Math.abs(tang.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    const binorm = norm3({
      x: tang.y * up.z - tang.z * up.y,
      y: tang.z * up.x - tang.x * up.z,
      z: tang.x * up.y - tang.y * up.x,
    });
    const norm = norm3({
      x: binorm.y * tang.z - binorm.z * tang.y,
      y: binorm.z * tang.x - binorm.x * tang.z,
      z: binorm.x * tang.y - binorm.y * tang.x,
    });
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const ca = Math.cos(a) * r;
      const sa = Math.sin(a) * r;
      verts.push(
        makeVert(
          {
            x: cur.x + binorm.x * ca + norm.x * sa,
            y: cur.y + binorm.y * ca + norm.y * sa,
            z: cur.z + binorm.z * ca + norm.z * sa,
          },
          i / Math.max(1, samplePts.length - 1),
          k / sides
        )
      );
    }
  }

  const ringCount = samplePts.length;
  for (let i = 0; i < ringCount - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const kn = (k + 1) % sides;
      faces.push(makeFace([i * sides + k, i * sides + kn, (i + 1) * sides + kn, (i + 1) * sides + k], true));
    }
  }
  if (curve.closed && ringCount > 2) {
    const last = ringCount - 1;
    for (let k = 0; k < sides; k++) {
      const kn = (k + 1) % sides;
      faces.push(makeFace([last * sides + k, last * sides + kn, kn, k], true));
    }
  }

  const mesh: MeshData = {
    vertices: verts,
    edges: buildEdgesFromFaces(faces),
    faces,
    autoSmoothAngle: 45,
    customSplitNormals: false,
    udimTile: 1001,
    uvSyncSelection: false,
  };
  recomputeNormals(mesh);
  return mesh;
}

const FONT_3X5: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '101', '101', '101'],
  N: ['101', '111', '111', '101', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '101', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '-': ['000', '000', '111', '000', '000'],
  '!': ['010', '010', '010', '000', '010'],
  '.': ['000', '000', '000', '000', '010'],
  ' ': ['000', '000', '000', '000', '000'],
};

export function buildMeshFromText3D(t3d: Text3DData): MeshData {
  const txt = (t3d.text || 'XL3D').toUpperCase().slice(0, 14);
  const cell = Math.max(0.08, (t3d.size || 1.2) * 0.14);
  const depth = Math.max(0.04, t3d.extrude || 0.2);
  const charAdvance = cell * 4;
  const totalW = Math.max(cell, txt.length * charAdvance - cell);
  const startX = t3d.align === 'center' ? -totalW * 0.5 : t3d.align === 'right' ? -totalW : 0;

  const verts: Vertex[] = [];
  const faces: Face[] = [];

  const pushBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const b = verts.length;
    verts.push(
      makeVert({ x: x0, y: y0, z: z0 }, 0, 0),
      makeVert({ x: x1, y: y0, z: z0 }, 1, 0),
      makeVert({ x: x1, y: y1, z: z0 }, 1, 1),
      makeVert({ x: x0, y: y1, z: z0 }, 0, 1),
      makeVert({ x: x0, y: y0, z: z1 }, 0, 0),
      makeVert({ x: x1, y: y0, z: z1 }, 1, 0),
      makeVert({ x: x1, y: y1, z: z1 }, 1, 1),
      makeVert({ x: x0, y: y1, z: z1 }, 0, 1)
    );
    faces.push(
      makeFace([b + 3, b + 2, b + 1, b + 0]),
      makeFace([b + 4, b + 5, b + 6, b + 7]),
      makeFace([b + 0, b + 1, b + 5, b + 4]),
      makeFace([b + 1, b + 2, b + 6, b + 5]),
      makeFace([b + 2, b + 3, b + 7, b + 6]),
      makeFace([b + 3, b + 0, b + 4, b + 7])
    );
  };

  for (let ci = 0; ci < txt.length; ci++) {
    const glyph = FONT_3X5[txt[ci]] ?? FONT_3X5['X'];
    const gx = startX + ci * charAdvance;
    for (let row = 0; row < 5; row++) {
      const z0 = (4 - row) * cell;
      const z1 = z0 + cell * 0.96;
      let col = 0;
      while (col < 3) {
        if (glyph[row][col] === '1') {
          let endCol = col;
          while (endCol + 1 < 3 && glyph[row][endCol + 1] === '1') endCol++;
          pushBox(gx + col * cell, gx + (endCol + 1) * cell * 0.98, -depth * 0.5, depth * 0.5, z0, z1);
          col = endCol + 1;
        } else {
          col++;
        }
      }
    }
  }

  if (verts.length === 0) return createMeshPrimitive('cube', 0.4);
  const mesh: MeshData = {
    vertices: verts,
    edges: buildEdgesFromFaces(faces),
    faces,
    autoSmoothAngle: 30,
    customSplitNormals: false,
    udimTile: 1001,
    uvSyncSelection: false,
  };
  recomputeNormals(mesh);
  return mesh;
}

export function createSceneObject(
  type: ObjectType,
  name?: string,
  meshKind: MeshPrimitiveKind = 'cube',
  matId = 'mat_principled'
): SceneObject {
  const base: SceneObject = {
    id: uid('obj'),
    name: name ?? type.toUpperCase(),
    type,
    collection: 'Collection',
    parentId: null,
    visible: true,
    renderable: true,
    locked: false,
    location: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    materialId: matId,
    modifiers: [],
    keyframes: {},
    drivers: {},
    shapeKeys: [],
    physics: defaultPhysics(),
  };

  switch (type) {
    case 'mesh':
      base.name = name ?? meshKind[0].toUpperCase() + meshKind.slice(1);
      base.mesh = createMeshPrimitive(meshKind, 1);
      break;
    case 'curve':
      base.name = name ?? 'BezierCurve';
      base.curve = {
        kind: 'bezier',
        closed: false,
        resolution: 12,
        bevelDepth: 0.08,
        extrude: 0,
        points: [
          { pos: { x: -1.4, y: 0, z: 0 }, handleLeft: { x: -1.8, y: -0.4, z: 0 }, handleRight: { x: -0.8, y: 0.8, z: 0 }, radius: 1, tilt: 0 },
          { pos: { x: 0, y: 0.5, z: 0.8 }, handleLeft: { x: -0.5, y: 0.5, z: 0.8 }, handleRight: { x: 0.5, y: 0.5, z: 0.8 }, radius: 1, tilt: 0 },
          { pos: { x: 1.4, y: -0.2, z: 0.2 }, handleLeft: { x: 0.9, y: -0.8, z: 0.2 }, handleRight: { x: 1.9, y: 0.4, z: 0.2 }, radius: 1, tilt: 0 },
        ],
      };
      base.mesh = buildMeshFromCurve(base.curve);
      break;
    case 'surface':
      base.name = name ?? 'NURBS Surface';
      base.surface = {
        uCount: 4,
        vCount: 4,
        points: Array.from({ length: 16 }, (_, idx) => {
          const u = (idx % 4) - 1.5;
          const v = Math.floor(idx / 4) - 1.5;
          return { x: u * 0.8, y: v * 0.8, z: Math.sin(u) * Math.cos(v) * 0.45 };
        }),
      };
      base.mesh = createMeshPrimitive('plane', 1.2);
      break;
    case 'metaball':
      base.name = name ?? 'Metaball';
      base.metaball = {
        elements: [
          { pos: { x: -0.45, y: 0, z: 0 }, radius: 0.75, stiffness: 2 },
          { pos: { x: 0.48, y: 0.15, z: 0.1 }, radius: 0.68, stiffness: 2 },
        ],
        threshold: 0.6,
        resolution: 0.2,
      };
      base.mesh = createMeshPrimitive('sphere', 0.95);
      break;
    case 'text':
      base.name = name ?? '3D Text';
      base.text3d = { text: 'XL3D', size: 1.2, extrude: 0.2, bevelDepth: 0.04, align: 'center' };
      base.mesh = buildMeshFromText3D(base.text3d);
      break;
    case 'lattice':
      base.name = name ?? 'Lattice';
      base.lattice = { pointsU: 2, pointsV: 2, pointsW: 2, deformStrength: 1, offsets: [] };
      break;
    case 'empty':
      base.name = name ?? 'Empty';
      break;
    case 'armature':
      base.name = name ?? 'Armature';
      base.armature = {
        rigifyTemplate: 'simple',
        autoRigged: true,
        bones: [
          {
            id: uid('bone'),
            name: 'Root',
            parentId: null,
            collection: 'Main',
            head: { x: 0, y: 0, z: 0 },
            tail: { x: 0, y: 0, z: 1.0 },
            poseRot: { x: 0, y: 0, z: 0 },
            poseLoc: { x: 0, y: 0, z: 0 },
            ikChainLength: 0,
            constraints: [],
          },
          {
            id: uid('bone'),
            name: 'Spine',
            parentId: null,
            collection: 'Main',
            head: { x: 0, y: 0, z: 1.0 },
            tail: { x: 0, y: 0, z: 2.0 },
            poseRot: { x: 0, y: 0, z: 0 },
            poseLoc: { x: 0, y: 0, z: 0 },
            ikChainLength: 2,
            constraints: [{ type: 'ik', influence: 1 }],
          },
        ],
      };
      base.armature.bones[1].parentId = base.armature.bones[0].id;
      break;
    case 'volume':
      base.name = name ?? 'Volume Smoke';
      base.volume = { density: 0.75, absorption: 0.35, emission: 0.1, anisotropy: 0.2, color: '#cbd5e1', resolution: 32 };
      break;
    case 'pointcloud':
      base.name = name ?? 'Point Cloud';
      base.pointCloud = {
        pointType: 'gaussianSplat',
        points: Array.from({ length: 120 }, (_, i) => {
          const a = i * 2.39996;
          const r = 0.9 * Math.sqrt((i + 1) / 120);
          return {
            pos: { x: Math.cos(a) * r, y: Math.sin(a) * r, z: (Math.sin(i * 0.4) * 0.5) },
            color: i % 2 === 0 ? '#38bdf8' : '#f97316',
            radius: 0.09,
            opacity: 0.85,
          };
        }),
      };
      break;
    case 'greasepencil':
      base.name = name ?? 'Grease Pencil';
      {
        const layerId = uid('gpl');
        base.greasePencil = {
          activeLayerId: layerId,
          onionSkin: true,
          onionBefore: 1,
          onionAfter: 1,
          fillAlgorithm: 'exact52',
          effects: [{ type: 'glow', intensity: 0.4, enabled: false }],
          layers: [
            {
              id: layerId,
              name: 'Lines',
              visible: true,
              opacity: 1,
              frames: {
                1: [
                  {
                    id: uid('gps'),
                    points: [
                      { pos: { x: -1, y: 0, z: 0.2 }, pressure: 1 },
                      { pos: { x: -0.3, y: 0, z: 1.1 }, pressure: 1 },
                      { pos: { x: 0.4, y: 0, z: 0.3 }, pressure: 1 },
                      { pos: { x: 1.0, y: 0, z: 1.0 }, pressure: 1 },
                    ],
                    color: '#38bdf8',
                    filled: false,
                    thickness: 4,
                  },
                ],
              },
            },
          ],
        };
      }
      break;
    case 'light':
      base.name = name ?? 'Point Light';
      base.location = { x: 2.8, y: -2.6, z: 3.6 };
      base.light = { kind: 'point', color: '#fff4e0', power: 650, radius: 0.4, spotAngle: 45, castShadow: true };
      break;
    case 'camera':
      base.name = name ?? 'Camera';
      base.location = { x: 4.5, y: -4.5, z: 3.2 };
      base.rotation = { x: 64, y: 0, z: 45 };
      base.camera = {
        projection: 'perspective',
        focalLength: 50,
        sensorWidth: 36,
        dofEnabled: false,
        dofDistance: 6,
        fStop: 2.8,
        clipStart: 0.1,
        clipEnd: 200,
      };
      break;
  }

  return base;
}

export function createDefaultXL3DScene(): XL3DScene {
  const matDefault: MaterialData = {
    id: 'mat_principled',
    name: 'Principled Studio',
    shaderModel: 'principled',
    baseColor: '#4f86f7',
    metallic: 0.15,
    roughness: 0.35,
    ior: 1.45,
    transmission: 0,
    dispersion: 0,
    anisotropy: 0,
    subsurface: 0,
    coat: 0.1,
    sheen: 0,
    thinFilm: 0,
    thinWall: false,
    emissionColor: '#f97316',
    emissionStrength: 0,
    procTexture: 'none',
    procScale: 4,
    bumpStrength: 0.2,
    shaderToRgb: false,
    oslEnabled: false,
  };

  const matGround: MaterialData = {
    ...matDefault,
    id: 'mat_ground',
    name: 'Studio Floor',
    baseColor: '#2a303d',
    roughness: 0.65,
    metallic: 0.05,
    procTexture: 'checker',
    procScale: 6,
  };

  const matGlass: MaterialData = {
    ...matDefault,
    id: 'mat_glass',
    name: 'Blender 5.3 Glass',
    shaderModel: 'glass',
    baseColor: '#bae6fd',
    roughness: 0.08,
    transmission: 0.9,
    dispersion: 0.45,
    anisotropy: 0.25,
    ior: 1.52,
  };

  const cube = createSceneObject('mesh', 'Cube', 'cube', matDefault.id);
  cube.location = { x: 0, y: 0, z: 1.0 };

  const sphere = createSceneObject('mesh', 'Glass Sphere', 'sphere', matGlass.id);
  sphere.location = { x: -2.3, y: 0.6, z: 0.85 };
  sphere.scale = { x: 0.8, y: 0.8, z: 0.8 };

  const floor = createSceneObject('mesh', 'Studio Plane', 'plane', matGround.id);
  floor.location = { x: 0, y: 0, z: 0 };
  floor.scale = { x: 4.5, y: 4.5, z: 1 };

  const sun = createSceneObject('light', 'Sun Key', 'cube', matDefault.id);
  sun.light = { kind: 'sun', color: '#fff7ed', power: 3.5, radius: 0.5, spotAngle: 45, castShadow: true };
  sun.location = { x: 3.5, y: -3.2, z: 4.5 };

  const cam = createSceneObject('camera', 'Main Camera', 'cube', matDefault.id);

  const shaderGraph: NodeGraph = {
    id: 'ng_shader',
    name: 'Shader Nodes',
    graphKind: 'shader',
    nodes: [
      { id: 'sn1', kind: 'Texture Coordinate', label: 'TexCoord', x: 20, y: 30, params: { space: 'UV' } },
      { id: 'sn2', kind: 'Noise Texture', label: 'Noise', x: 140, y: 30, params: { scale: 5, detail: 3 } },
      { id: 'sn3', kind: 'Principled BSDF', label: 'Principled BSDF (5.3)', x: 270, y: 30, params: { thinWall: false, dispersion: 0 } },
    ],
    links: [
      { id: 'sl1', fromNodeId: 'sn1', fromSocket: 'UV', toNodeId: 'sn2', toSocket: 'Vector' },
      { id: 'sl2', fromNodeId: 'sn2', fromSocket: 'Fac', toNodeId: 'sn3', toSocket: 'Roughness' },
    ],
  };

  const geoGraph: NodeGraph = {
    id: 'ng_geo',
    name: 'Geometry Nodes (5.3)',
    graphKind: 'geometry',
    nodes: [
      { id: 'gn1', kind: 'Group Input', label: 'Mesh Input', x: 18, y: 35, params: {} },
      { id: 'gn2', kind: 'Mesh Bevel (5.2)', label: 'Mesh Bevel', x: 145, y: 35, params: { amount: 0.08, segments: 2 } },
      { id: 'gn3', kind: 'Group Output', label: 'Geometry Out', x: 280, y: 35, params: {} },
    ],
    links: [
      { id: 'gl1', fromNodeId: 'gn1', fromSocket: 'Geometry', toNodeId: 'gn2', toSocket: 'Mesh' },
      { id: 'gl2', fromNodeId: 'gn2', fromSocket: 'Mesh', toNodeId: 'gn3', toSocket: 'Geometry' },
    ],
  };

  const compGraph: NodeGraph = {
    id: 'ng_comp',
    name: 'Compositor (GPU)',
    graphKind: 'compositor',
    nodes: [
      { id: 'cn1', kind: 'Render Layers', label: 'Render Layers', x: 18, y: 35, params: {} },
      { id: 'cn2', kind: 'Glare / Bloom', label: 'Glare', x: 150, y: 35, params: { threshold: 0.85, mix: 0.2 } },
      { id: 'cn3', kind: 'Composite', label: 'Composite Out', x: 280, y: 35, params: {} },
    ],
    links: [
      { id: 'cl1', fromNodeId: 'cn1', fromSocket: 'Image', toNodeId: 'cn2', toSocket: 'Image' },
      { id: 'cl2', fromNodeId: 'cn2', fromSocket: 'Image', toNodeId: 'cn3', toSocket: 'Image' },
    ],
  };

  return {
    version: '5.3.0',
    app: 'XL3D',
    name: 'Startup Scene',
    objects: [cube, sphere, floor, sun, cam],
    materials: [matDefault, matGround, matGlass],
    nodeGraphs: [shaderGraph, geoGraph, compGraph],
    activeObjectId: cube.id,
    activeMaterialId: matDefault.id,
    activeNodeGraphId: shaderGraph.id,
    cursor3D: { x: 0, y: 0, z: 0 },
    currentFrame: 1,
    startFrame: 1,
    endFrame: 120,
    fps: 24,
    render: {
      engine: 'eevee',
      workbenchShading: 'solid',
      freestyle: false,
      freestyleThickness: 1.5,
      cyclesSamples: 16,
      adaptiveSampling: true,
      denoise: true,
      lightTree: true,
      causticsMNEE: true,
      shadowCatcher: false,
      cryptomatte: false,
      aovPass: 'combined',
      eeveeRaytracing: true,
      eeveeGI: true,
      eeveeBloom: true,
      eeveeDof: false,
      textureCache52: true,
      resolutionX: 640,
      resolutionY: 480,
      colorTransform: 'agx',
      lookPreset: 'none',
      inputSpace: 'sRGB',
      exposure: 0,
    },
    world: {
      mode: 'sky53',
      skyColor: '#1e3a8a',
      horizonColor: '#475569',
      sunElevation: 38,
      sunAzimuth: 45,
      fogDensity: 0.0,
      fogColor: '#94a3b8',
      hdriStrength: 1.0,
    },
    vse: {
      clips: [
        { id: 'vc1', name: 'Scene Camera 01', track: 1, startFrame: 1, durationFrames: 60, kind: 'video', color: '#3b82f6', exposure: 0, scale: 1 },
        { id: 'vc2', name: 'Title Overlay', track: 2, startFrame: 15, durationFrames: 45, kind: 'text', color: '#f97316', exposure: 0, scale: 1, textContent: 'XL3D' },
      ],
      rippleEdit: true,
      blade20: true,
      proxies: false,
      markers: [{ id: 'tm1', name: 'TrackPt_01', x: 0.5, y: 0.5, mode: 'camera', stabilize: true }],
      cameraSolved: false,
    },
  };
}
