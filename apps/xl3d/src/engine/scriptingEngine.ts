import { degToRad, norm3, rotateOnlyVec3, uid } from '../core/math3d';
import type {
  Edge,
  Face,
  LightKind,
  MaterialData,
  MeshData,
  ModifierType,
  SceneObject,
  ScriptLanguage,
  Vec3,
  Vertex,
  XL3DScene,
} from '../core/types';
import {
  bevelSelection,
  extrudeFaces,
  flipNormals,
  insetFaces,
  mergeVerticesToCenter,
  pokeFaces,
  selectAll,
  subdivideMesh,
  triangulateMesh,
  trisToQuads,
  uvUnwrap,
} from './editOps';
import { createDefaultModifier } from './modifiers';
import {
  buildEdgesFromFaces,
  createMeshPrimitive,
  createSceneObject,
  defaultPhysics,
  recomputeNormals,
  type MeshPrimitiveKind,
} from './primitives';

export interface ScriptExecutionResult {
  ok: boolean;
  logs: string[];
  error?: string;
  durationMs: number;
  createdObjects: string[];
  modifiedObjects: string[];
}

export interface ScriptTemplate {
  id: string;
  name: string;
  language: ScriptLanguage;
  description: string;
  content: string;
}

export const BUILTIN_SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'tpl_helix',
    name: 'parametric_helix.py',
    language: 'python',
    description: 'Спиральная 3D-лента через bmesh',
    content: `import bpy
import bmesh
import math

# Создаём новый меш и bmesh
mesh = bpy.data.meshes.new("HelixMesh")
bm = bmesh.new()

turns = 3
steps = 48
radius = 1.4
height = 2.6
width = 0.35

ring_pairs = []
for i in range(steps + 1):
    t = i / steps
    ang = t * turns * 2 * math.pi
    z = t * height
    x1 = math.cos(ang) * (radius - width)
    y1 = math.sin(ang) * (radius - width)
    x2 = math.cos(ang) * (radius + width)
    y2 = math.sin(ang) * (radius + width)
    v1 = bm.verts.new((x1, y1, z))
    v2 = bm.verts.new((x2, y2, z + 0.12))
    ring_pairs.append((v1, v2))

for i in range(steps):
    a1, a2 = ring_pairs[i]
    b1, b2 = ring_pairs[i + 1]
    bm.faces.new((a1, a2, b2, b1))

bm.normal_update()
bm.to_mesh(mesh)
bm.free()

obj = bpy.data.objects.new("ParametricHelix", mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
print("Создана спираль:", len(mesh.vertices), "вершин")`,
  },
  {
    id: 'tpl_terrain',
    name: 'procedural_terrain.py',
    language: 'python',
    description: 'Ландшафт через from_pydata()',
    content: `import bpy
import math

nx = 18
ny = 18
size = 4.2
verts = []
faces = []

for iy in range(ny):
    for ix in range(nx):
        x = (ix / (nx - 1) - 0.5) * size
        y = (iy / (ny - 1) - 0.5) * size
        r = math.sqrt(x * x + y * y)
        z = math.sin(x * 2.1) * math.cos(y * 2.1) * 0.45 + math.exp(-r * 0.8) * 0.85
        verts.append((x, y, z))

for iy in range(ny - 1):
    for ix in range(nx - 1):
        i0 = iy * nx + ix
        i1 = i0 + 1
        i2 = i0 + nx + 1
        i3 = i0 + nx
        faces.append((i0, i1, i2, i3))

mesh = bpy.data.meshes.new("TerrainMesh")
mesh.from_pydata(verts, [], faces)
obj = bpy.data.objects.new("ProceduralTerrain", mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
print("Ландшафт готов:", len(verts), "вершин,", len(faces), "граней")`,
  },
  {
    id: 'tpl_stairs',
    name: 'spiral_stairs.py',
    language: 'python',
    description: 'Винтовая лестница через bpy.ops',
    content: `import bpy
import math

steps = 14
for i in range(steps):
    angle = i * 0.38
    r = 1.6
    x = math.cos(angle) * r
    y = math.sin(angle) * r
    z = i * 0.24
    bpy.ops.mesh.primitive_cube_add(
        size=0.55,
        location=(x, y, z),
        rotation=(0, 0, angle)
    )
    step = bpy.context.active_object
    step.name = f"Step_{i + 1}"
    step.scale = (1.5, 0.75, 0.22)

print("Построено ступеней:", steps)`,
  },
  {
    id: 'tpl_edit_active',
    name: 'edit_active_mesh.py',
    language: 'python',
    description: 'Редактирование активного меша',
    content: `import bpy
import bmesh
import math

obj = bpy.context.active_object
if obj is None or obj.type != 'MESH':
    bpy.ops.mesh.primitive_ico_sphere_add(radius=1.1, location=(0, 0, 1))
    obj = bpy.context.active_object

bm = bmesh.new()
bm.from_mesh(obj.data)

for v in bm.verts:
    wave = math.sin(v.co.x * 3.0 + v.co.z * 3.0) * 0.22
    v.co.x = v.co.x * (1.0 + wave)
    v.co.y = v.co.y * (1.0 + wave)

bm.normal_update()
bm.to_mesh(obj.data)
bm.free()

bpy.ops.object.modifier_add(type='SUBSURF')
print("Объект изменён кодом:", obj.name)`,
  },
  {
    id: 'tpl_js_torus_flower',
    name: 'flower_ring.js',
    language: 'javascript',
    description: 'JS-скрипт для кольцевой скульптуры',
    content: `// Нативный JavaScript API с полным доступом к bpy и bmesh
const petals = 10;
for (let i = 0; i < petals; i++) {
  const a = (i / petals) * Math.PI * 2;
  const x = Math.cos(a) * 1.8;
  const y = Math.sin(a) * 1.8;
  bpy.ops.mesh.primitive_cone_add({
    radius1: 0.45,
    depth: 1.4,
    location: [x, y, 0.7],
    rotation: [0.45 * Math.sin(a), -0.45 * Math.cos(a), a]
  });
  bpy.context.active_object.name = "Petal_" + (i + 1);
}
bpy.ops.mesh.primitive_uv_sphere_add({ radius: 0.85, location: [0, 0, 0.8] });
print("Готово лепестков:", petals);`,
  },
];

// ---------- Math / Vector Helpers ----------

export class PyVector {
  x: number;
  y: number;
  z: number;

  constructor(x: number | number[] | Vec3 | PyVector = 0, y?: number, z?: number) {
    if (Array.isArray(x)) {
      this.x = Number(x[0] ?? 0);
      this.y = Number(x[1] ?? 0);
      this.z = Number(x[2] ?? 0);
    } else if (typeof x === 'object' && x !== null) {
      this.x = Number(x.x ?? 0);
      this.y = Number(x.y ?? 0);
      this.z = Number(x.z ?? 0);
    } else {
      this.x = Number(x ?? 0);
      this.y = Number(y ?? 0);
      this.z = Number(z ?? 0);
    }
  }

  get 0(): number { return this.x; }
  set 0(v: number) { this.x = v; }
  get 1(): number { return this.y; }
  set 1(v: number) { this.y = v; }
  get 2(): number { return this.z; }
  set 2(v: number) { this.z = v; }

  get length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  copy(): PyVector {
    return new PyVector(this.x, this.y, this.z);
  }

  normalized(): PyVector {
    const l = this.length;
    return l > 1e-8 ? new PyVector(this.x / l, this.y / l, this.z / l) : new PyVector(0, 0, 1);
  }

  dot(other: PyVector | number[] | Vec3): number {
    const o = toVec3(other);
    return this.x * o.x + this.y * o.y + this.z * o.z;
  }

  cross(other: PyVector | number[] | Vec3): PyVector {
    const o = toVec3(other);
    return new PyVector(
      this.y * o.z - this.z * o.y,
      this.z * o.x - this.x * o.z,
      this.x * o.y - this.y * o.x
    );
  }

  lerp(other: PyVector | number[] | Vec3, t: number): PyVector {
    const o = toVec3(other);
    return new PyVector(
      this.x + (o.x - this.x) * t,
      this.y + (o.y - this.y) * t,
      this.z + (o.z - this.z) * t
    );
  }

  toVec3(): Vec3 {
    return { x: this.x, y: this.y, z: this.z };
  }
}

function toVec3(val: unknown, fallback: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  if (!val) return { ...fallback };
  if (val instanceof PyVector) return { x: val.x, y: val.y, z: val.z };
  if (Array.isArray(val)) {
    return {
      x: Number(val[0] ?? fallback.x),
      y: Number(val[1] ?? fallback.y),
      z: Number(val[2] ?? fallback.z),
    };
  }
  if (typeof val === 'object') {
    const o = val as Record<string, unknown>;
    return {
      x: Number(o.x ?? fallback.x),
      y: Number(o.y ?? fallback.y),
      z: Number(o.z ?? fallback.z),
    };
  }
  return { ...fallback };
}

function radToDeg3(v: Vec3): Vec3 {
  return { x: (v.x * 180) / Math.PI, y: (v.y * 180) / Math.PI, z: (v.z * 180) / Math.PI };
}

function degToRad3(v: Vec3): Vec3 {
  return { x: degToRad(v.x), y: degToRad(v.y), z: degToRad(v.z) };
}

function extractKw(args: unknown[]): { pos: unknown[]; kw: Record<string, unknown> } {
  const last = args[args.length - 1];
  if (last && typeof last === 'object' && !Array.isArray(last) && '__kw' in (last as Record<string, unknown>)) {
    return { pos: args.slice(0, -1), kw: last as Record<string, unknown> };
  }
  // Also allow plain JS object options as single arg: bpy.ops.mesh.primitive_cube_add({ size: 2 })
  if (args.length === 1 && last && typeof last === 'object' && !Array.isArray(last) && !(last instanceof PyVector)) {
    return { pos: [], kw: last as Record<string, unknown> };
  }
  return { pos: args, kw: {} };
}

// ---------- Mesh & BMesh Proxies ----------

class BpyMeshProxy {
  name: string;
  mesh: MeshData;
  onMutate: () => void;

  constructor(name: string, mesh: MeshData, onMutate: () => void) {
    this.name = name;
    this.mesh = mesh;
    this.onMutate = onMutate;
  }

  get vertices(): Vertex[] {
    return this.mesh.vertices;
  }

  get edges(): Edge[] {
    return this.mesh.edges;
  }

  get faces(): Face[] {
    return this.mesh.faces;
  }

  get polygons(): Face[] {
    return this.mesh.faces;
  }

  from_pydata(vertsArg: unknown[], edgesArg: unknown[] = [], facesArg: unknown[] = []): void {
    const verts: Vertex[] = [];
    for (let i = 0; i < vertsArg.length; i++) {
      const p = toVec3(vertsArg[i]);
      verts.push({
        id: uid('v'),
        pos: p,
        normal: { x: 0, y: 0, z: 1 },
        uv: { x: (p.x + 1) * 0.5, y: (p.y + 1) * 0.5 },
        color: [0.85, 0.85, 0.88],
        mask: 0,
        weights: {},
        selected: false,
      });
    }

    const faces: Face[] = [];
    for (const fRaw of facesArg) {
      if (!Array.isArray(fRaw) || fRaw.length < 3) continue;
      const idxs = fRaw.map((n) => Number(n)).filter((n) => n >= 0 && n < verts.length);
      if (idxs.length >= 3) {
        faces.push({
          verts: idxs,
          normal: { x: 0, y: 0, z: 1 },
          smooth: false,
          materialIndex: 0,
          faceSet: 1,
          selected: false,
        });
      }
    }

    let edges: Edge[] = [];
    if (Array.isArray(edgesArg) && edgesArg.length > 0) {
      for (const eRaw of edgesArg) {
        if (Array.isArray(eRaw) && eRaw.length >= 2) {
          edges.push({ a: Number(eRaw[0]), b: Number(eRaw[1]), selected: false });
        }
      }
    } else {
      edges = buildEdgesFromFaces(faces);
    }

    this.mesh.vertices = verts;
    this.mesh.edges = edges;
    this.mesh.faces = faces;
    recomputeNormals(this.mesh);
    this.onMutate();
  }

  update(): void {
    recomputeNormals(this.mesh);
    this.onMutate();
  }
}

class BMVert {
  co: PyVector;
  normal: PyVector;
  select = false;
  index: number;
  uv: { x: number; y: number };
  color: [number, number, number];

  constructor(co: Vec3, index: number, uv = { x: 0.5, y: 0.5 }, color: [number, number, number] = [0.85, 0.85, 0.88]) {
    this.co = new PyVector(co);
    this.normal = new PyVector(0, 0, 1);
    this.index = index;
    this.uv = { ...uv };
    this.color = [...color];
  }
}

class BMEdge {
  verts: [BMVert, BMVert];
  select = false;
  seam = false;
  smooth = true;
  index: number;

  constructor(a: BMVert, b: BMVert, index: number) {
    this.verts = [a, b];
    this.index = index;
  }
}

class BMFace {
  verts: BMVert[];
  normal: PyVector;
  select = false;
  smooth = false;
  material_index = 0;
  index: number;

  constructor(verts: BMVert[], index: number) {
    this.verts = verts;
    this.normal = new PyVector(0, 0, 1);
    this.index = index;
  }

  calc_center_median(): PyVector {
    if (this.verts.length === 0) return new PyVector(0, 0, 0);
    let sx = 0, sy = 0, sz = 0;
    for (const v of this.verts) {
      sx += v.co.x; sy += v.co.y; sz += v.co.z;
    }
    const n = this.verts.length;
    return new PyVector(sx / n, sy / n, sz / n);
  }
}

class BMSeq<T extends { index: number }> extends Array<T> {
  ensure_lookup_table(): void {
    for (let i = 0; i < this.length; i++) this[i].index = i;
  }
}

class BMVertSeq extends BMSeq<BMVert> {
  new(co: Vec3 | number[] | PyVector = [0, 0, 0]): BMVert {
    const v = new BMVert(toVec3(co), this.length);
    this.push(v);
    return v;
  }
}

class BMEdgeSeq extends BMSeq<BMEdge> {
  new(pair: [BMVert, BMVert]): BMEdge {
    const e = new BMEdge(pair[0], pair[1], this.length);
    this.push(e);
    return e;
  }
}

class BMFaceSeq extends BMSeq<BMFace> {
  new(verts: BMVert[]): BMFace {
    const f = new BMFace([...verts], this.length);
    this.push(f);
    return f;
  }
}

class BMeshInstance {
  verts = new BMVertSeq();
  edges = new BMEdgeSeq();
  faces = new BMFaceSeq();

  from_mesh(proxy: BpyMeshProxy | MeshData): void {
    const mesh = proxy instanceof BpyMeshProxy ? proxy.mesh : proxy;
    this.clear();
    const bmVerts = mesh.vertices.map((v, i) => {
      const bv = new BMVert(v.pos, i, v.uv, v.color);
      bv.select = v.selected;
      bv.normal = new PyVector(v.normal);
      this.verts.push(bv);
      return bv;
    });
    for (let i = 0; i < mesh.edges.length; i++) {
      const e = mesh.edges[i];
      const va = bmVerts[e.a];
      const vb = bmVerts[e.b];
      if (va && vb) {
        const be = new BMEdge(va, vb, this.edges.length);
        be.select = Boolean(e.selected);
        be.seam = Boolean(e.seam);
        this.edges.push(be);
      }
    }
    for (const f of mesh.faces) {
      const fv = f.verts.map((vi) => bmVerts[vi]).filter(Boolean);
      if (fv.length >= 3) {
        const bf = new BMFace(fv, this.faces.length);
        bf.select = f.selected;
        bf.smooth = f.smooth;
        bf.material_index = f.materialIndex;
        bf.normal = new PyVector(f.normal);
        this.faces.push(bf);
      }
    }
  }

  to_mesh(proxy: BpyMeshProxy | MeshData): void {
    const mesh = proxy instanceof BpyMeshProxy ? proxy.mesh : proxy;
    this.verts.ensure_lookup_table();
    const indexMap = new Map<BMVert, number>();
    const vertices: Vertex[] = this.verts.map((bv, idx) => {
      indexMap.set(bv, idx);
      return {
        id: uid('v'),
        pos: bv.co.toVec3(),
        normal: bv.normal.toVec3(),
        uv: { x: (bv.co.x + 1) * 0.5, y: (bv.co.y + 1) * 0.5 },
        color: [...bv.color],
        mask: 0,
        weights: {},
        selected: bv.select,
      };
    });
    const faces: Face[] = [];
    for (const bf of this.faces) {
      const idxs = bf.verts.map((v) => indexMap.get(v)).filter((i): i is number => i !== undefined);
      if (idxs.length >= 3) {
        faces.push({
          verts: idxs,
          normal: bf.normal.toVec3(),
          smooth: bf.smooth,
          materialIndex: bf.material_index,
          faceSet: 1,
          selected: bf.select,
        });
      }
    }
    let edges: Edge[] = buildEdgesFromFaces(faces);
    if (faces.length === 0 && this.edges.length > 0) {
      edges = [];
      for (const e of this.edges) {
        const a = indexMap.get(e.verts[0]);
        const b = indexMap.get(e.verts[1]);
        if (a !== undefined && b !== undefined) {
          edges.push({ a, b, selected: e.select, seam: e.seam });
        }
      }
    }
    mesh.vertices = vertices;
    mesh.faces = faces;
    mesh.edges = edges;
    recomputeNormals(mesh);
    if (proxy instanceof BpyMeshProxy) proxy.onMutate();
  }

  normal_update(): void {
    for (const f of this.faces) {
      if (f.verts.length < 3) continue;
      const a = f.verts[0].co;
      const b = f.verts[1].co;
      const c = f.verts[2].co;
      const n = norm3({
        x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
        y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
        z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
      });
      f.normal = new PyVector(n);
    }
  }

  clear(): void {
    this.verts.length = 0;
    this.edges.length = 0;
    this.faces.length = 0;
  }

  free(): void {
    // no-op for GC
  }
}

function appendPrimitiveToBMesh(bm: BMeshInstance, prim: MeshPrimitiveKind, size = 1): { verts: BMVert[] } {
  const m = createMeshPrimitive(prim, size);
  const created: BMVert[] = [];
  const offset = bm.verts.length;
  for (const v of m.vertices) {
    const bv = bm.verts.new(v.pos);
    created.push(bv);
  }
  for (const f of m.faces) {
    const fVerts = f.verts.map((vi) => bm.verts[offset + vi]).filter(Boolean);
    if (fVerts.length >= 3) bm.faces.new(fVerts);
  }
  bm.normal_update();
  return { verts: created };
}

// ---------- Main Sandbox Runner ----------

export function executeBlenderScript(
  scene: XL3DScene,
  code: string,
  language: ScriptLanguage
): ScriptExecutionResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const logs: string[] = [];
  const createdIds = new Set<string>();
  const modifiedIds = new Set<string>();
  const unlinkedObjects = new Map<string, { obj: SceneObject; meshProxy?: BpyMeshProxy }>();

  const markMutated = (id: string) => modifiedIds.add(id);

  // Proxy cache so object references stay consistent during script run
  const objectProxies = new Map<string, any>();

  const wrapObject = (obj: SceneObject): any => {
    if (objectProxies.has(obj.id)) return objectProxies.get(obj.id);
    const meshProxy = obj.mesh ? new BpyMeshProxy(obj.name, obj.mesh, () => markMutated(obj.id)) : null;

    const makeVecProp = (vec: Vec3, scaleFactor = 1) => {
      const p: Record<string | number, any> = {
        get x() { return vec.x * scaleFactor; },
        set x(v: number) { vec.x = v / scaleFactor; markMutated(obj.id); },
        get y() { return vec.y * scaleFactor; },
        set y(v: number) { vec.y = v / scaleFactor; markMutated(obj.id); },
        get z() { return vec.z * scaleFactor; },
        set z(v: number) { vec.z = v / scaleFactor; markMutated(obj.id); },
        get 0() { return vec.x * scaleFactor; },
        set 0(v: number) { vec.x = v / scaleFactor; markMutated(obj.id); },
        get 1() { return vec.y * scaleFactor; },
        set 1(v: number) { vec.y = v / scaleFactor; markMutated(obj.id); },
        get 2() { return vec.z * scaleFactor; },
        set 2(v: number) { vec.z = v / scaleFactor; markMutated(obj.id); },
      };
      return p;
    };

    const proxy: Record<string, any> = {
      __raw: obj,
      get id() { return obj.id; },
      get name() { return obj.name; },
      set name(v: string) { obj.name = String(v); markMutated(obj.id); },
      get type() { return obj.type.toUpperCase(); },
      get data() { return meshProxy; },
      get location() { return makeVecProp(obj.location); },
      set location(v: unknown) {
        const nv = toVec3(v);
        obj.location.x = nv.x; obj.location.y = nv.y; obj.location.z = nv.z;
        markMutated(obj.id);
      },
      get rotation_euler() { return makeVecProp(obj.rotation, Math.PI / 180); },
      set rotation_euler(v: unknown) {
        const nv = radToDeg3(toVec3(v));
        obj.rotation.x = nv.x; obj.rotation.y = nv.y; obj.rotation.z = nv.z;
        markMutated(obj.id);
      },
      get rotation_degrees() { return makeVecProp(obj.rotation); },
      set rotation_degrees(v: unknown) {
        const nv = toVec3(v);
        obj.rotation.x = nv.x; obj.rotation.y = nv.y; obj.rotation.z = nv.z;
        markMutated(obj.id);
      },
      get scale() { return makeVecProp(obj.scale); },
      set scale(v: unknown) {
        const nv = toVec3(v, { x: 1, y: 1, z: 1 });
        obj.scale.x = nv.x; obj.scale.y = nv.y; obj.scale.z = nv.z;
        markMutated(obj.id);
      },
      get hide_viewport() { return !obj.visible; },
      set hide_viewport(v: boolean) { obj.visible = !v; markMutated(obj.id); },
      select_set(flag: boolean) {
        if (flag) scene.activeObjectId = obj.id;
      },
      modifiers: {
        new(name: string, modType: string) {
          const map: Record<string, ModifierType> = {
            SUBSURF: 'subsurf',
            MIRROR: 'mirror',
            SOLIDIFY: 'solidify',
            BEVEL: 'bevel',
            ARRAY: 'array',
            BOOLEAN: 'boolean',
            DECIMATE: 'decimate',
            REMESH: 'remesh',
            DISPLACE: 'displace',
            WIREFRAME: 'wireframe',
            CAST: 'cast',
            SCREW: 'screw',
            NODES: 'geometryNodes',
          };
          const mt = map[String(modType).toUpperCase()] ?? 'subsurf';
          const mod = createDefaultModifier(mt);
          mod.name = name || mod.name;
          obj.modifiers.push(mod);
          markMutated(obj.id);
          return mod.params;
        },
      },
      keyframe_insert(...args: unknown[]) {
        const { pos, kw } = extractKw(args);
        const dataPath = String(kw.data_path ?? pos[0] ?? 'location');
        const frame = Number(kw.frame ?? scene.currentFrame);
        if (dataPath.includes('location')) {
          obj.keyframes.locX = [...(obj.keyframes.locX ?? []), { id: uid('kf'), frame, value: obj.location.x, interp: 'bezier' }];
          obj.keyframes.locY = [...(obj.keyframes.locY ?? []), { id: uid('kf'), frame, value: obj.location.y, interp: 'bezier' }];
          obj.keyframes.locZ = [...(obj.keyframes.locZ ?? []), { id: uid('kf'), frame, value: obj.location.z, interp: 'bezier' }];
        } else if (dataPath.includes('rotation')) {
          obj.keyframes.rotZ = [...(obj.keyframes.rotZ ?? []), { id: uid('kf'), frame, value: obj.rotation.z, interp: 'bezier' }];
        } else if (dataPath.includes('scale')) {
          obj.keyframes.scaleX = [...(obj.keyframes.scaleX ?? []), { id: uid('kf'), frame, value: obj.scale.x, interp: 'bezier' }];
        }
        markMutated(obj.id);
      },
    };
    objectProxies.set(obj.id, proxy);
    return proxy;
  };

  const getActiveObj = (): SceneObject | undefined =>
    scene.objects.find((o) => o.id === scene.activeObjectId) ?? scene.objects.find((o) => o.type === 'mesh');

  const addPrimitiveOp = (kind: MeshPrimitiveKind, args: unknown[]) => {
    const { kw } = extractKw(args);
    const size = Number(kw.size ?? kw.radius ?? kw.radius1 ?? 1);
    const loc = toVec3(kw.location, { x: scene.cursor3D.x, y: scene.cursor3D.y, z: scene.cursor3D.z });
    const rotRad = toVec3(kw.rotation, { x: 0, y: 0, z: 0 });
    const scl = toVec3(kw.scale, { x: 1, y: 1, z: 1 });
    const customName = kw.name ? String(kw.name) : kind[0].toUpperCase() + kind.slice(1);
    const obj = createSceneObject('mesh', customName, kind);
    if (size !== 1 && obj.mesh) {
      const factor = kind === 'cube' || kind === 'plane' ? size * 0.5 : size;
      for (const v of obj.mesh.vertices) {
        v.pos.x *= factor; v.pos.y *= factor; v.pos.z *= factor;
      }
      recomputeNormals(obj.mesh);
    }
    obj.location = loc;
    obj.rotation = radToDeg3(rotRad);
    obj.scale = scl;
    scene.objects.push(obj);
    scene.activeObjectId = obj.id;
    createdIds.add(obj.id);
    return { FINISHED: true };
  };

  // Build bpy.data.objects Proxy so indexing by name or number works in both JS and Python
  const objectsCollectionTarget = {
    new(name: string, data: unknown = null) {
      let obj: SceneObject;
      if (data instanceof BpyMeshProxy) {
        obj = {
          id: uid('obj'),
          name: String(name || 'ScriptMesh'),
          type: 'mesh',
          collection: 'Collection',
          parentId: null,
          visible: true,
          renderable: true,
          locked: false,
          location: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          materialId: scene.activeMaterialId,
          modifiers: [],
          keyframes: {},
          drivers: {},
          shapeKeys: [],
          physics: defaultPhysics(),
          mesh: data.mesh,
        };
      } else {
        obj = createSceneObject('empty', String(name || 'Empty'));
      }
      unlinkedObjects.set(obj.id, { obj, meshProxy: data instanceof BpyMeshProxy ? data : undefined });
      return wrapObject(obj);
    },
    remove(objOrProxy: any) {
      const raw = objOrProxy?.__raw ?? objOrProxy;
      if (!raw) return;
      scene.objects = scene.objects.filter((o) => o.id !== raw.id);
      if (scene.activeObjectId === raw.id) scene.activeObjectId = scene.objects[0]?.id ?? null;
    },
    get(name: string) {
      const found = scene.objects.find((o) => o.name === name);
      return found ? wrapObject(found) : null;
    },
    [Symbol.iterator]() {
      const arr = scene.objects.map(wrapObject);
      return arr[Symbol.iterator]();
    },
    get length() {
      return scene.objects.length;
    },
  };

  const bpyDataObjects = new Proxy(objectsCollectionTarget, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      if (typeof prop === 'string') {
        const idx = Number(prop);
        if (!Number.isNaN(idx) && Number.isInteger(idx) && scene.objects[idx]) {
          return wrapObject(scene.objects[idx]);
        }
        const byName = scene.objects.find((o) => o.name === prop);
        if (byName) return wrapObject(byName);
      }
      return undefined;
    },
  });

  const linkObjectToScene = (objProxy: any) => {
    const raw: SceneObject | undefined = objProxy?.__raw;
    if (!raw) return;
    if (!scene.objects.some((o) => o.id === raw.id)) {
      scene.objects.push(raw);
      createdIds.add(raw.id);
    }
    unlinkedObjects.delete(raw.id);
    if (!scene.activeObjectId) scene.activeObjectId = raw.id;
  };

  const bmeshOps = {
    create_cube(...args: unknown[]) {
      const { pos, kw } = extractKw(args);
      const bm = (kw.bm ?? pos[0]) as BMeshInstance;
      return appendPrimitiveToBMesh(bm, 'cube', Number(kw.size ?? 1) * 0.5);
    },
    create_icosphere(...args: unknown[]) {
      const { pos, kw } = extractKw(args);
      const bm = (kw.bm ?? pos[0]) as BMeshInstance;
      return appendPrimitiveToBMesh(bm, 'icosphere', Number(kw.radius ?? 1));
    },
    create_uvsphere(...args: unknown[]) {
      const { pos, kw } = extractKw(args);
      const bm = (kw.bm ?? pos[0]) as BMeshInstance;
      return appendPrimitiveToBMesh(bm, 'sphere', Number(kw.radius ?? 1));
    },
    create_cone(...args: unknown[]) {
      const { pos, kw } = extractKw(args);
      const bm = (kw.bm ?? pos[0]) as BMeshInstance;
      return appendPrimitiveToBMesh(bm, 'cone', Number(kw.radius1 ?? 1));
    },
    translate(...args: unknown[]) {
      const { pos, kw } = extractKw(args);
      const bm = (kw.bm ?? pos[0]) as BMeshInstance;
      const verts = (kw.verts ?? bm.verts) as BMVert[];
      const vec = toVec3(kw.vec ?? pos[1]);
      for (const v of verts) {
        v.co.x += vec.x; v.co.y += vec.y; v.co.z += vec.z;
      }
    },
    scale(...args: unknown[]) {
      const { pos, kw } = extractKw(args);
      const bm = (kw.bm ?? pos[0]) as BMeshInstance;
      const verts = (kw.verts ?? bm.verts) as BMVert[];
      const vec = toVec3(kw.vec ?? pos[1], { x: 1, y: 1, z: 1 });
      for (const v of verts) {
        v.co.x *= vec.x; v.co.y *= vec.y; v.co.z *= vec.z;
      }
    },
    rotate(...args: unknown[]) {
      const { pos, kw } = extractKw(args);
      const bm = (kw.bm ?? pos[0]) as BMeshInstance;
      const verts = (kw.verts ?? bm.verts) as BMVert[];
      const cent = toVec3(kw.cent);
      const deg = radToDeg3(toVec3(kw.angles ?? kw.rot ?? [0, 0, 0]));
      for (const v of verts) {
        const rel = { x: v.co.x - cent.x, y: v.co.y - cent.y, z: v.co.z - cent.z };
        const r = rotateOnlyVec3(rel, deg);
        v.co.x = cent.x + r.x; v.co.y = cent.y + r.y; v.co.z = cent.z + r.z;
      }
    },
    extrude_face_region(...args: unknown[]) {
      const { pos, kw } = extractKw(args);
      const bm = (kw.bm ?? pos[0]) as BMeshInstance;
      const geom = (kw.geom ?? bm.faces) as unknown[];
      const faces = geom.filter((g): g is BMFace => g instanceof BMFace);
      const newGeom: Array<BMVert | BMFace> = [];
      for (const f of faces) {
        bm.normal_update();
        const clonedVerts = f.verts.map((v) => {
          const nv = bm.verts.new({ x: v.co.x, y: v.co.y, z: v.co.z });
          newGeom.push(nv);
          return nv;
        });
        for (let i = 0; i < f.verts.length; i++) {
          const j = (i + 1) % f.verts.length;
          bm.faces.new([f.verts[i], f.verts[j], clonedVerts[j], clonedVerts[i]]);
        }
        f.verts = clonedVerts;
        newGeom.push(f);
      }
      bm.normal_update();
      return { geom: newGeom };
    },
    subdivide_edges(...args: unknown[]) {
      const { pos, kw } = extractKw(args);
      const bm = (kw.bm ?? pos[0]) as BMeshInstance;
      const tmp = { vertices: [], edges: [], faces: [], autoSmoothAngle: 35, customSplitNormals: false, udimTile: 1001, uvSyncSelection: false } as MeshData;
      bm.to_mesh(tmp);
      subdivideMesh(tmp, false);
      bm.from_mesh(tmp);
      return { geom: [...bm.verts, ...bm.faces] };
    },
    recalc_face_normals(...args: unknown[]) {
      const { pos, kw } = extractKw(args);
      const bm = (kw.bm ?? pos[0]) as BMeshInstance;
      bm.normal_update();
    },
  };

  const bpy = {
    context: {
      get active_object() {
        const o = getActiveObj();
        return o ? wrapObject(o) : null;
      },
      set active_object(proxy: any) {
        const raw = proxy?.__raw;
        if (raw) {
          linkObjectToScene(proxy);
          scene.activeObjectId = raw.id;
        }
      },
      get object() {
        const o = getActiveObj();
        return o ? wrapObject(o) : null;
      },
      get selected_objects() {
        const o = getActiveObj();
        return o ? [wrapObject(o)] : [];
      },
      collection: {
        objects: {
          link: linkObjectToScene,
          unlink(objProxy: any) {
            const raw = objProxy?.__raw;
            if (raw) scene.objects = scene.objects.filter((o) => o.id !== raw.id);
          },
        },
      },
      view_layer: {
        objects: {
          get active() {
            const o = getActiveObj();
            return o ? wrapObject(o) : null;
          },
          set active(proxy: any) {
            const raw = proxy?.__raw;
            if (raw) {
              linkObjectToScene(proxy);
              scene.activeObjectId = raw.id;
            }
          },
        },
      },
      scene: {
        get frame_current() { return scene.currentFrame; },
        set frame_current(v: number) { scene.currentFrame = Math.round(v); },
        collection: {
          objects: { link: linkObjectToScene },
        },
      },
    },
    data: {
      objects: bpyDataObjects,
      meshes: {
        new(name: string) {
          const emptyMesh: MeshData = {
            vertices: [],
            edges: [],
            faces: [],
            autoSmoothAngle: 35,
            customSplitNormals: false,
            udimTile: 1001,
            uvSyncSelection: false,
          };
          return new BpyMeshProxy(String(name || 'Mesh'), emptyMesh, () => {});
        },
      },
      materials: {
        new(name: string) {
          const mat: MaterialData = {
            id: uid('mat'),
            name: String(name || 'Material'),
            shaderModel: 'principled',
            baseColor: '#d9dde6',
            metallic: 0,
            roughness: 0.45,
            ior: 1.45,
            transmission: 0,
            dispersion: 0,
            anisotropy: 0,
            thinWall: false,
            subsurface: 0,
            coat: 0,
            sheen: 0.1,
            thinFilm: 0,
            emissionColor: '#000000',
            emissionStrength: 0,
            procTexture: 'none',
            procScale: 4,
            bumpStrength: 0.2,
            shaderToRgb: false,
            oslEnabled: false,
          };
          scene.materials.push(mat);
          scene.activeMaterialId = mat.id;
          return {
            __raw: mat,
            get name() { return mat.name; },
            set name(v: string) { mat.name = v; },
            get metallic() { return mat.metallic; },
            set metallic(v: number) { mat.metallic = v; },
            get roughness() { return mat.roughness; },
            set roughness(v: number) { mat.roughness = v; },
            get diffuse_color() { return [1, 1, 1, 1]; },
            set diffuse_color(rgba: number[]) {
              const r = Math.max(0, Math.min(255, Math.round((rgba[0] ?? 1) * 255)));
              const g = Math.max(0, Math.min(255, Math.round((rgba[1] ?? 1) * 255)));
              const b = Math.max(0, Math.min(255, Math.round((rgba[2] ?? 1) * 255)));
              mat.baseColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            },
          };
        },
      },
    },
    ops: {
      mesh: {
        primitive_cube_add: (...a: unknown[]) => addPrimitiveOp('cube', a),
        primitive_uv_sphere_add: (...a: unknown[]) => addPrimitiveOp('sphere', a),
        primitive_ico_sphere_add: (...a: unknown[]) => addPrimitiveOp('icosphere', a),
        primitive_cylinder_add: (...a: unknown[]) => addPrimitiveOp('cylinder', a),
        primitive_cone_add: (...a: unknown[]) => addPrimitiveOp('cone', a),
        primitive_torus_add: (...a: unknown[]) => addPrimitiveOp('torus', a),
        primitive_plane_add: (...a: unknown[]) => addPrimitiveOp('plane', a),
        primitive_monkey_add: (...a: unknown[]) => addPrimitiveOp('monkey', a),
        subdivide(...args: unknown[]) {
          const o = getActiveObj();
          if (!o?.mesh) return { CANCELLED: true };
          const { kw } = extractKw(args);
          const cuts = Math.max(1, Math.min(3, Number(kw.number_cuts ?? 1)));
          for (let i = 0; i < cuts; i++) subdivideMesh(o.mesh, false);
          markMutated(o.id);
          return { FINISHED: true };
        },
        extrude_region_move(...args: unknown[]) {
          const o = getActiveObj();
          if (!o?.mesh) return { CANCELLED: true };
          const { kw } = extractKw(args);
          const tr = (kw.TRANSFORM_OT_translate as Record<string, unknown> | undefined)?.value;
          const dist = tr ? Math.hypot(toVec3(tr).x, toVec3(tr).y, toVec3(tr).z) : Number(kw.distance ?? 0.45);
          extrudeFaces(o.mesh, dist || 0.45);
          markMutated(o.id);
          return { FINISHED: true };
        },
        inset_faces(...args: unknown[]) {
          const o = getActiveObj();
          if (!o?.mesh) return { CANCELLED: true };
          const { kw } = extractKw(args);
          insetFaces(o.mesh, Number(kw.thickness ?? 0.2));
          markMutated(o.id);
          return { FINISHED: true };
        },
        bevel(...args: unknown[]) {
          const o = getActiveObj();
          if (!o?.mesh) return { CANCELLED: true };
          const { kw } = extractKw(args);
          bevelSelection(o.mesh, Number(kw.offset ?? 0.14));
          markMutated(o.id);
          return { FINISHED: true };
        },
        poke() {
          const o = getActiveObj();
          if (o?.mesh) { pokeFaces(o.mesh); markMutated(o.id); }
          return { FINISHED: true };
        },
        flip_normals() {
          const o = getActiveObj();
          if (o?.mesh) { flipNormals(o.mesh); markMutated(o.id); }
          return { FINISHED: true };
        },
        quads_convert_to_tris() {
          const o = getActiveObj();
          if (o?.mesh) { triangulateMesh(o.mesh); markMutated(o.id); }
          return { FINISHED: true };
        },
        tris_convert_to_quads() {
          const o = getActiveObj();
          if (o?.mesh) { trisToQuads(o.mesh); markMutated(o.id); }
          return { FINISHED: true };
        },
        select_all(...args: unknown[]) {
          const o = getActiveObj();
          if (o?.mesh) {
            const { kw } = extractKw(args);
            const act = String(kw.action ?? 'SELECT').toUpperCase();
            selectAll(o.mesh, act === 'DESELECT' ? false : act === 'INVERT' ? 'invert' : true);
            markMutated(o.id);
          }
          return { FINISHED: true };
        },
        merge() {
          const o = getActiveObj();
          if (o?.mesh) { mergeVerticesToCenter(o.mesh, 'vertex'); markMutated(o.id); }
          return { FINISHED: true };
        },
        uv_unwrap() {
          const o = getActiveObj();
          if (o?.mesh) { uvUnwrap(o.mesh, false); markMutated(o.id); }
          return { FINISHED: true };
        },
        smart_project() {
          const o = getActiveObj();
          if (o?.mesh) { uvUnwrap(o.mesh, true); markMutated(o.id); }
          return { FINISHED: true };
        },
      },
      object: {
        mode_set: () => ({ FINISHED: true }),
        shade_smooth() {
          const o = getActiveObj();
          if (o?.mesh) { o.mesh.faces.forEach((f) => (f.smooth = true)); markMutated(o.id); }
          return { FINISHED: true };
        },
        shade_flat() {
          const o = getActiveObj();
          if (o?.mesh) { o.mesh.faces.forEach((f) => (f.smooth = false)); markMutated(o.id); }
          return { FINISHED: true };
        },
        modifier_add(...args: unknown[]) {
          const o = getActiveObj();
          if (!o) return { CANCELLED: true };
          const { kw } = extractKw(args);
          wrapObject(o).modifiers.new(String(kw.type ?? 'Subsurf'), String(kw.type ?? 'SUBSURF'));
          return { FINISHED: true };
        },
        light_add(...args: unknown[]) {
          const { kw } = extractKw(args);
          const lObj = createSceneObject('light', 'Light');
          if (lObj.light && kw.type) lObj.light.kind = String(kw.type).toLowerCase() as LightKind;
          lObj.location = toVec3(kw.location, { x: 2, y: -2, z: 4 });
          scene.objects.push(lObj);
          scene.activeObjectId = lObj.id;
          createdIds.add(lObj.id);
          return { FINISHED: true };
        },
        camera_add(...args: unknown[]) {
          const { kw } = extractKw(args);
          const cObj = createSceneObject('camera', 'Camera');
          cObj.location = toVec3(kw.location, { x: 0, y: -6, z: 3 });
          scene.objects.push(cObj);
          scene.activeObjectId = cObj.id;
          createdIds.add(cObj.id);
          return { FINISHED: true };
        },
        empty_add(...args: unknown[]) {
          const { kw } = extractKw(args);
          const eObj = createSceneObject('empty', 'Empty');
          eObj.location = toVec3(kw.location);
          scene.objects.push(eObj);
          scene.activeObjectId = eObj.id;
          createdIds.add(eObj.id);
          return { FINISHED: true };
        },
        delete() {
          const o = getActiveObj();
          if (!o) return { CANCELLED: true };
          scene.objects = scene.objects.filter((x) => x.id !== o.id);
          scene.activeObjectId = scene.objects[0]?.id ?? null;
          return { FINISHED: true };
        },
      },
      transform: {
        translate(...args: unknown[]) {
          const o = getActiveObj();
          if (!o) return { CANCELLED: true };
          const { kw } = extractKw(args);
          const d = toVec3(kw.value);
          o.location.x += d.x; o.location.y += d.y; o.location.z += d.z;
          markMutated(o.id);
          return { FINISHED: true };
        },
        rotate(...args: unknown[]) {
          const o = getActiveObj();
          if (!o) return { CANCELLED: true };
          const { kw } = extractKw(args);
          const rad = Number(kw.value ?? 0);
          const deg = (rad * 180) / Math.PI;
          const ax = String(kw.orient_axis ?? 'Z').toUpperCase();
          if (ax === 'X') o.rotation.x += deg;
          else if (ax === 'Y') o.rotation.y += deg;
          else o.rotation.z += deg;
          markMutated(o.id);
          return { FINISHED: true };
        },
        resize(...args: unknown[]) {
          const o = getActiveObj();
          if (!o) return { CANCELLED: true };
          const { kw } = extractKw(args);
          const s = toVec3(kw.value, { x: 1, y: 1, z: 1 });
          o.scale.x *= s.x; o.scale.y *= s.y; o.scale.z *= s.z;
          markMutated(o.id);
          return { FINISHED: true };
        },
      },
    },
  };

  const bmesh = {
    new: () => new BMeshInstance(),
    ops: bmeshOps,
  };

  const pyMath = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sqrt: Math.sqrt,
    pow: Math.pow,
    exp: Math.exp,
    log: Math.log,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    radians: (d: number) => (d * Math.PI) / 180,
    degrees: (r: number) => (r * 180) / Math.PI,
    pi: Math.PI,
    tau: Math.PI * 2,
    e: Math.E,
  };

  const print = (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
  };

  const range = (startOrStop: number, stop?: number, step = 1): number[] => {
    const start = stop === undefined ? 0 : startOrStop;
    const end = stop === undefined ? startOrStop : stop;
    const out: number[] = [];
    if (step === 0) return out;
    if (step > 0) {
      for (let i = start; i < end && out.length < 50000; i += step) out.push(i);
    } else {
      for (let i = start; i > end && out.length < 50000; i += step) out.push(i);
    }
    return out;
  };

  const enumerate = <T>(arr: Iterable<T>, start = 0): Array<[number, T]> => {
    const out: Array<[number, T]> = [];
    let i = start;
    for (const item of arr) out.push([i++, item]);
    return out;
  };

  const zip = <A, B>(a: Iterable<A>, b: Iterable<B>): Array<[A, B]> => {
    const arrA = Array.from(a);
    const arrB = Array.from(b);
    const len = Math.min(arrA.length, arrB.length);
    const out: Array<[A, B]> = [];
    for (let i = 0; i < len; i++) out.push([arrA[i], arrB[i]]);
    return out;
  };

  const len = (x: unknown): number => {
    if (Array.isArray(x) || typeof x === 'string') return x.length;
    if (x && typeof x === 'object' && 'length' in x) return Number((x as { length: number }).length);
    return 0;
  };

  let iterTicks = 0;
  const __guard = () => {
    if (++iterTicks > 120000) {
      throw new Error('Превышен лимит итераций (защита от бесконечного цикла)');
    }
  };

  const Vector = (x: any = 0, y?: number, z?: number) => new PyVector(x, y, z);
  const Euler = (x: any = 0, y?: number, z?: number) => new PyVector(x, y, z);

  try {
    const jsBody = language === 'python' ? transpilePythonToJs(code) : code;
    const fn = new Function(
      'bpy',
      'bmesh',
      'math',
      'Math',
      'Vector',
      'Euler',
      'print',
      'range',
      'enumerate',
      'zip',
      'len',
      'abs',
      'min',
      'max',
      'round',
      'int',
      'float',
      'str',
      'sum',
      'list',
      'tuple',
      '__guard',
      `"use strict";\n${jsBody}`
    );

    fn(
      bpy,
      bmesh,
      pyMath,
      Math,
      Vector,
      Euler,
      print,
      range,
      enumerate,
      zip,
      len,
      Math.abs,
      Math.min,
      Math.max,
      Math.round,
      (v: unknown) => Math.trunc(Number(v) || 0),
      (v: unknown) => Number(v) || 0,
      (v: unknown) => String(v),
      (arr: number[]) => arr.reduce((a, b) => a + b, 0),
      (it: Iterable<unknown>) => Array.from(it),
      (it: Iterable<unknown>) => Array.from(it),
      __guard
    );

    // Ensure any unlinked objects that received geometry via bpy.data.objects.new without explicit link aren't silently lost if user expected creation?
    // Wait: in Blender objects only appear when linked; we keep Blender semantics, and all templates call collection.objects.link(obj).

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      ok: true,
      logs,
      durationMs: Math.max(0.1, Number((t1 - t0).toFixed(1))),
      createdObjects: Array.from(createdIds),
      modifiedObjects: Array.from(modifiedIds),
    };
  } catch (err) {
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      ok: false,
      logs,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.max(0.1, Number((t1 - t0).toFixed(1))),
      createdObjects: Array.from(createdIds),
      modifiedObjects: Array.from(modifiedIds),
    };
  }
}

// ---------- Practical Blender Python -> JS Transpiler ----------

export function transpilePythonToJs(pyCode: string): string {
  // 1. Mask string literals and strip # comments while joining multiline brackets
  const stringLiterals: string[] = [];
  const maskStrings = (src: string): string => {
    let out = '';
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (
        (ch === 'f' || ch === 'F') &&
        (src[i + 1] === '"' || src[i + 1] === "'")
      ) {
        const quote = src[i + 1];
        let j = i + 2;
        while (j < src.length && src[j] !== quote) {
          if (src[j] === '\\') j++;
          j++;
        }
        const inner = src.slice(i + 2, j);
        const tpl = '`' + inner.replace(/\{([^}]+)\}/g, (_m, expr) => `\${${transformPyExpr(expr)}}`) + '`';
        const token = `__STR_${stringLiterals.length}__`;
        stringLiterals.push(tpl);
        out += token;
        i = j + 1;
        continue;
      }
      if (src.slice(i, i + 3) === '"""' || src.slice(i, i + 3) === "'''") {
        const q3 = src.slice(i, i + 3);
        const end = src.indexOf(q3, i + 3);
        const j = end === -1 ? src.length : end + 3;
        const raw = src.slice(i + 3, end === -1 ? src.length : end);
        const token = `__STR_${stringLiterals.length}__`;
        stringLiterals.push(JSON.stringify(raw));
        out += token;
        i = j;
        continue;
      }
      if (ch === '"' || ch === "'") {
        let j = i + 1;
        while (j < src.length && src[j] !== ch) {
          if (src[j] === '\\') j++;
          j++;
        }
        const raw = src.slice(i, j + 1);
        const token = `__STR_${stringLiterals.length}__`;
        stringLiterals.push(raw);
        out += token;
        i = j + 1;
        continue;
      }
      if (ch === '#') {
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  };

  const masked = maskStrings(pyCode.replace(/\r\n/g, '\n'));

  // 2. Join lines wrapped across (), [], {}
  const rawLines = masked.split('\n');
  const logicalLines: Array<{ indent: number; text: string }> = [];
  let acc = '';
  let accIndent = 0;
  let depth = 0;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed && depth === 0) continue;
    const indent = line.length - line.trimStart().length;
    if (depth === 0) {
      acc = trimmed;
      accIndent = indent;
    } else {
      acc += ' ' + trimmed;
    }
    for (const c of trimmed) {
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && acc.trim()) {
      logicalLines.push({ indent: accIndent, text: acc.trim() });
      acc = '';
    }
  }
  if (acc.trim()) logicalLines.push({ indent: accIndent, text: acc.trim() });

  // 3. Convert indentation blocks to JS braces + scope-aware let declarations
  const indentStack = [0];
  const scopeVars: Array<Set<string>> = [new Set()];
  const outLines: string[] = [];

  const closeToIndent = (target: number) => {
    while (indentStack.length > 1 && target < indentStack[indentStack.length - 1]) {
      indentStack.pop();
      scopeVars.pop();
      outLines.push(' '.repeat(indentStack[indentStack.length - 1]) + '}');
    }
  };

  for (const { indent, text } of logicalLines) {
    closeToIndent(indent);
    const pad = ' '.repeat(indent);

    // Handle import statements
    if (/^(import|from)\s+/.test(text)) {
      if (/^from\s+math\s+import\s+(.+)$/.test(text)) {
        const items = RegExp.$1.split(',').map((s) => s.trim()).filter((s) => s && s !== '*');
        if (items.length > 0) {
          outLines.push(`${pad}const { ${items.join(', ')} } = math;`);
        }
      } else if (/^import\s+([A-Za-z_]\w*)\s+as\s+([A-Za-z_]\w*)$/.test(text)) {
        const mod = RegExp.$1;
        const alias = RegExp.$2;
        if (mod === 'bpy' || mod === 'bmesh' || mod === 'math') {
          outLines.push(`${pad}const ${alias} = ${mod};`);
        }
      }
      continue;
    }

    if (text === 'pass') continue;

    if (/^def\s+([A-Za-z_]\w*)\s*\((.*)\)\s*:$/.test(text)) {
      const fnName = RegExp.$1;
      const args = RegExp.$2;
      outLines.push(`${pad}function ${fnName}(${args}) {`);
      indentStack.push(indent + 4);
      scopeVars.push(new Set(args.split(',').map((a) => a.trim().split('=')[0].trim()).filter(Boolean)));
      continue;
    }

    if (/^for\s+(.+?)\s+in\s+(.+)\s*:$/.test(text)) {
      const target = RegExp.$1.trim();
      const iter = transformPyExpr(RegExp.$2.trim());
      const isTuple = target.includes(',');
      const lhs = isTuple ? `[${target.replace(/[()]/g, '')}]` : target;
      const vars = target.replace(/[()]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
      const curScope = scopeVars[scopeVars.length - 1];
      vars.forEach((v) => curScope.add(v));
      outLines.push(`${pad}for (const ${lhs} of (${iter})) { __guard();`);
      indentStack.push(indent + 4);
      scopeVars.push(new Set(curScope));
      continue;
    }

    if (/^while\s+(.+)\s*:$/.test(text)) {
      const cond = transformPyExpr(RegExp.$1.trim());
      outLines.push(`${pad}while (${cond}) { __guard();`);
      indentStack.push(indent + 4);
      scopeVars.push(new Set(scopeVars[scopeVars.length - 1]));
      continue;
    }

    if (/^if\s+(.+)\s*:$/.test(text)) {
      const cond = transformPyExpr(RegExp.$1.trim());
      outLines.push(`${pad}if (${cond}) {`);
      indentStack.push(indent + 4);
      scopeVars.push(new Set(scopeVars[scopeVars.length - 1]));
      continue;
    }

    if (/^elif\s+(.+)\s*:$/.test(text)) {
      const cond = transformPyExpr(RegExp.$1.trim());
      outLines.push(`${pad}else if (${cond}) {`);
      indentStack.push(indent + 4);
      scopeVars.push(new Set(scopeVars[scopeVars.length - 1]));
      continue;
    }

    if (text === 'else:') {
      outLines.push(`${pad}else {`);
      indentStack.push(indent + 4);
      scopeVars.push(new Set(scopeVars[scopeVars.length - 1]));
      continue;
    }

    if (text === 'try:') {
      outLines.push(`${pad}try {`);
      indentStack.push(indent + 4);
      scopeVars.push(new Set(scopeVars[scopeVars.length - 1]));
      continue;
    }

    if (/^except(?:\s+.*)?\s*:$/.test(text)) {
      outLines.push(`${pad}catch (_pyErr) {`);
      indentStack.push(indent + 4);
      scopeVars.push(new Set(scopeVars[scopeVars.length - 1]));
      continue;
    }

    // Tuple unpacking assignment: a, b = expr
    const tupleAssign = text.match(/^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)+)\s*=\s*(.+)$/);
    if (tupleAssign && !tupleAssign[1].includes('.')) {
      const vars = tupleAssign[1].split(',').map((s) => s.trim());
      const rhs = transformPyExpr(tupleAssign[2]);
      const curScope = scopeVars[scopeVars.length - 1];
      const allNew = vars.every((v) => !curScope.has(v));
      vars.forEach((v) => curScope.add(v));
      outLines.push(`${pad}${allNew ? 'let ' : ''}[${vars.join(', ')}] = ${rhs};`);
      continue;
    }

    // Simple variable assignment: x = expr (avoid ==)
    const assign = text.match(/^([A-Za-z_]\w*)\s*=\s*([^=].*)$/);
    if (assign) {
      const vName = assign[1];
      const rhs = transformPyExpr(assign[2]);
      const curScope = scopeVars[scopeVars.length - 1];
      const isNew = !curScope.has(vName);
      curScope.add(vName);
      outLines.push(`${pad}${isNew ? 'let ' : ''}${vName} = ${rhs};`);
      continue;
    }

    outLines.push(`${pad}${transformPyExpr(text)};`);
  }

  closeToIndent(0);

  let js = outLines.join('\n');
  // Restore string literals
  js = js.replace(/__STR_(\d+)__/g, (_m, idx) => stringLiterals[Number(idx)] ?? '""');
  return js;
}

function transformPyExpr(expr: string): string {
  let s = expr;

  // Python booleans, None, logical operators, integer floor division, and list/string methods
  s = s.replace(/\bTrue\b/g, 'true');
  s = s.replace(/\bFalse\b/g, 'false');
  s = s.replace(/\bNone\b/g, 'null');
  s = s.replace(/\bis\s+not\s+null\b/g, '!= null');
  s = s.replace(/\bis\s+null\b/g, '== null');
  s = s.replace(/\band\b/g, '&&');
  s = s.replace(/\bor\b/g, '||');
  s = s.replace(/\bnot\s+/g, '!');
  s = s.replace(/(\S+)\s*\/\/\s*(\S+)/g, 'Math.floor(($1)/($2))');
  s = s.replace(/\.append\s*\(/g, '.push(');
  s = s.replace(/\.extend\s*\(/g, '.push(...');
  s = s.replace(/\.upper\s*\(\)/g, '.toUpperCase()');
  s = s.replace(/\.lower\s*\(\)/g, '.toLowerCase()');
  s = s.replace(/\.strip\s*\(\)/g, '.trim()');
  s = s.replace(/\.startswith\s*\(/g, '.startsWith(');
  s = s.replace(/\.endswith\s*\(/g, '.endsWith(');

  // List comprehension (supports nested brackets like res["geom"]): [expr for x in iter (if cond)?]
  s = convertListComprehensions(s);

  // Convert Python keyword arguments inside function calls: fn(a=1, b=(2, 3)) -> fn({ __kw: true, a: 1, b: [2, 3] })
  s = convertCallKwArgs(s);

  // Convert remaining Python tuples (a, b, ...) into JS arrays [a, b, ...] carefully
  s = convertTuplesToArrays(s);

  return s;
}

function convertListComprehensions(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '[') {
      let depth = 1;
      let j = i + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === '[' || src[j] === '(' || src[j] === '{') depth++;
        else if (src[j] === ']' || src[j] === ')' || src[j] === '}') depth--;
        j++;
      }
      const inner = src.slice(i + 1, j - 1);
      // Find top-level " for <var> in " inside inner
      let topForIdx = -1;
      let d = 0;
      for (let k = 0; k < inner.length; k++) {
        const c = inner[k];
        if (c === '[' || c === '(' || c === '{') d++;
        else if (c === ']' || c === ')' || c === '}') d = Math.max(0, d - 1);
        else if (d === 0 && inner.slice(k).startsWith(' for ')) {
          topForIdx = k;
          break;
        }
      }
      if (topForIdx > 0) {
        const body = inner.slice(0, topForIdx).trim();
        const rest = inner.slice(topForIdx + 5).trim();
        const varMatch = rest.match(/^([A-Za-z_]\w*)\s+in\s+(.+)$/);
        if (varMatch) {
          const v = varMatch[1];
          const afterIn = varMatch[2];
          let topIfIdx = -1;
          let d2 = 0;
          for (let k = 0; k < afterIn.length; k++) {
            const c = afterIn[k];
            if (c === '[' || c === '(' || c === '{') d2++;
            else if (c === ']' || c === ')' || c === '}') d2 = Math.max(0, d2 - 1);
            else if (d2 === 0 && afterIn.slice(k).startsWith(' if ')) {
              topIfIdx = k;
              break;
            }
          }
          const iter = convertListComprehensions(
            (topIfIdx >= 0 ? afterIn.slice(0, topIfIdx) : afterIn).trim()
          );
          const cond = topIfIdx >= 0 ? convertListComprehensions(afterIn.slice(topIfIdx + 4).trim()) : '';
          const mappedBody = convertListComprehensions(body);
          out += cond
            ? `Array.from(${iter}).filter((${v}) => (${cond})).map((${v}) => (${mappedBody}))`
            : `Array.from(${iter}).map((${v}) => (${mappedBody}))`;
          i = j;
          continue;
        }
      }
      out += `[${convertListComprehensions(inner)}]`;
      i = j;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

function convertCallKwArgs(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '(' && i > 0 && /[A-Za-z0-9_$\]]/.test(src[i - 1])) {
      // Find matching ')'
      let depth = 1;
      let j = i + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === '(' || src[j] === '[' || src[j] === '{') depth++;
        else if (src[j] === ')' || src[j] === ']' || src[j] === '}') depth--;
        j++;
      }
      const inner = src.slice(i + 1, j - 1);
      const args = splitTopLevelComma(inner);
      const posArgs: string[] = [];
      const kwPairs: string[] = [];
      for (const arg of args) {
        const t = arg.trim();
        if (!t) continue;
        const m = t.match(/^([A-Za-z_]\w*)\s*=\s*([^=].*)$/);
        if (m) {
          kwPairs.push(`${m[1]}: ${convertCallKwArgs(m[2])}`);
        } else {
          posArgs.push(convertCallKwArgs(t));
        }
      }
      if (kwPairs.length > 0) {
        const kwObj = `{ __kw: true, ${kwPairs.join(', ')} }`;
        out += `(${[...posArgs, kwObj].join(', ')})`;
      } else {
        out += `(${posArgs.join(', ')})`;
      }
      i = j;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

function convertTuplesToArrays(src: string): string {
  // Replace parenthesized expressions that contain a top-level comma and are NOT function calls or control headers
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '(') {
      const prev = i > 0 ? src[i - 1] : '';
      const isCall = /[A-Za-z0-9_$]/.test(prev) && !/\b(?:return|typeof)$/.test(src.slice(Math.max(0, i - 6), i));
      let depth = 1;
      let j = i + 1;
      let hasTopComma = false;
      while (j < src.length && depth > 0) {
        const c = src[j];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 1) hasTopComma = true;
        j++;
      }
      const inner = src.slice(i + 1, j - 1);
      if (!isCall && hasTopComma) {
        out += `[${convertTuplesToArrays(inner)}]`;
      } else {
        out += `(${convertTuplesToArrays(inner)})`;
      }
      i = j;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

function splitTopLevelComma(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}
