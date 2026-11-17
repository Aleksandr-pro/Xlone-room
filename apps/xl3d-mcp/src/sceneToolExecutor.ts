import { uid } from '../../xl3d/src/core/math3d';
import type {
  Edge,
  Face,
  ModifierType,
  ObjectType,
  ProcTextureType,
  ScriptLanguage,
  Vec3,
  Vertex,
  XL3DScene,
} from '../../xl3d/src/core/types';
import {
  bevelSelection,
  extrudeFaces,
  flipNormals,
  insetFaces,
  loopToolsCircle,
  mergeVerticesToCenter,
  pokeFaces,
  shadeSmoothByAngle,
  subdivideMesh,
  triangulateMesh,
  trisToQuads,
  uvUnwrap,
} from '../../xl3d/src/engine/editOps';
import { exportSceneToOBJ, exportSceneToPLY, exportSceneToSTL } from '../../xl3d/src/engine/ioFormats';
import { createDefaultModifier } from '../../xl3d/src/engine/modifiers';
import {
  buildEdgesFromFaces,
  createDefaultXL3DScene,
  createSceneObject,
  defaultPhysics,
  recomputeNormals,
  type MeshPrimitiveKind,
} from '../../xl3d/src/engine/primitives';
import { executeBlenderScript } from '../../xl3d/src/engine/scriptingEngine';

export interface ToolResult {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  >;
  isError?: boolean;
  structured?: Record<string, unknown>;
}

export function createInitialHeadlessScene(): XL3DScene {
  return createDefaultXL3DScene();
}

export function summarizeScene(scene: XL3DScene, clientConnected: boolean): Record<string, unknown> {
  const active = scene.objects.find((o) => o.id === scene.activeObjectId);
  return {
    app: 'XL3D',
    version: scene.version,
    clientConnected,
    activeObjectId: scene.activeObjectId,
    activeObjectName: active?.name ?? null,
    currentFrame: scene.currentFrame,
    renderEngine: scene.render.engine,
    objectCount: scene.objects.length,
    objects: scene.objects.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      visible: o.visible,
      location: o.location,
      rotation: o.rotation,
      scale: o.scale,
      vertices: o.mesh?.vertices.length ?? 0,
      faces: o.mesh?.faces.length ?? 0,
      modifiers: o.modifiers.map((m) => ({ id: m.id, type: m.type, enabled: m.enabled })),
    })),
    materials: scene.materials.map((m) => ({
      id: m.id,
      name: m.name,
      baseColor: m.baseColor,
      metallic: m.metallic,
      roughness: m.roughness,
      procTexture: m.procTexture,
    })),
  };
}

function toVec3(v: unknown, fallback: Vec3): Vec3 {
  if (Array.isArray(v)) {
    return {
      x: Number(v[0] ?? fallback.x),
      y: Number(v[1] ?? fallback.y),
      z: Number(v[2] ?? fallback.z),
    };
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return {
      x: Number(o.x ?? fallback.x),
      y: Number(o.y ?? fallback.y),
      z: Number(o.z ?? fallback.z),
    };
  }
  return { ...fallback };
}

function findObject(scene: XL3DScene, nameOrId?: string) {
  if (!nameOrId) {
    return scene.objects.find((o) => o.id === scene.activeObjectId) ?? scene.objects.find((o) => o.type === 'mesh');
  }
  return scene.objects.find((o) => o.id === nameOrId || o.name === nameOrId);
}

// Eval-free line interpreter for Cloudflare Workers when no live mobile client is connected
function executeBasicBpyNoEval(scene: XL3DScene, code: string): { ok: boolean; logs: string[]; error?: string } {
  const logs: string[] = [];
  const lines = code
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('import ') && !l.startsWith('from '));

  const primMap: Record<string, MeshPrimitiveKind> = {
    primitive_cube_add: 'cube',
    primitive_uv_sphere_add: 'sphere',
    primitive_ico_sphere_add: 'icosphere',
    primitive_cylinder_add: 'cylinder',
    primitive_cone_add: 'cone',
    primitive_torus_add: 'torus',
    primitive_plane_add: 'plane',
    primitive_monkey_add: 'monkey',
  };

  for (const line of lines) {
    if (/^(for |while |def |if |class )/.test(line)) {
      return {
        ok: false,
        logs,
        error:
          'В облачном headless-режиме без подключённого устройства XL3D сложные Python-циклы/функции не запускаются напрямую (ограничение Workers на eval). Подключите телефон/браузер XL3D к комнате по WebSocket или используйте инструмент create_mesh_from_pydata / create_object.',
      };
    }

    const printM = line.match(/^print\((.*)\)$/);
    if (printM) {
      logs.push(printM[1].replace(/['"]/g, ''));
      continue;
    }

    const primM = line.match(/^bpy\.ops\.mesh\.(primitive_[a-z_]+_add)\((.*)\)$/);
    if (primM) {
      const kind = primMap[primM[1]];
      if (!kind) return { ok: false, logs, error: `Неизвестный примитив: ${primM[1]}` };
      const argsStr = primM[2];
      const sizeM = argsStr.match(/(?:size|radius|radius1)\s*=\s*([0-9.+-]+)/);
      const locM = argsStr.match(/location\s*=\s*\(([^)]+)\)/);
      const nameM = argsStr.match(/name\s*=\s*['"]([^'"]+)['"]/);
      const obj = createSceneObject('mesh', nameM?.[1] ?? kind[0].toUpperCase() + kind.slice(1), kind);
      if (sizeM && obj.mesh) {
        const s = Number(sizeM[1]) * (kind === 'cube' || kind === 'plane' ? 0.5 : 1);
        for (const v of obj.mesh.vertices) {
          v.pos.x *= s; v.pos.y *= s; v.pos.z *= s;
        }
        recomputeNormals(obj.mesh);
      }
      if (locM) {
        const parts = locM[1].split(',').map((n) => Number(n.trim()));
        obj.location = { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
      }
      scene.objects.push(obj);
      scene.activeObjectId = obj.id;
      logs.push(`Created ${obj.name}`);
      continue;
    }

    if (line.startsWith('bpy.ops.mesh.subdivide')) {
      const o = findObject(scene);
      if (o?.mesh) subdivideMesh(o.mesh, false);
      continue;
    }
    if (line.startsWith('bpy.ops.mesh.bevel')) {
      const o = findObject(scene);
      if (o?.mesh) bevelSelection(o.mesh, 0.14);
      continue;
    }
    if (line.startsWith('bpy.ops.object.modifier_add')) {
      const o = findObject(scene);
      const tm = line.match(/type\s*=\s*['"]([A-Z_]+)['"]/i);
      const mType = (tm?.[1]?.toLowerCase() ?? 'subsurf') as ModifierType;
      if (o) o.modifiers.push(createDefaultModifier(mType));
      continue;
    }

    return {
      ok: false,
      logs,
      error: `Выражение "${line}" требует подключения живого клиента XL3D или использования structured tools (create_mesh_from_pydata / create_object / apply_edit_op).`,
    };
  }
  return { ok: true, logs };
}

export function executeHeadlessTool(
  scene: XL3DScene,
  undoStack: string[],
  toolName: string,
  args: Record<string, unknown>,
  allowEval: boolean,
  clientConnected: boolean
): ToolResult {
  const pushUndo = () => {
    try {
      undoStack.push(JSON.stringify(scene));
      if (undoStack.length > 25) undoStack.shift();
    } catch {
      // ignore
    }
  };

  if (toolName === 'get_scene_info') {
    const info = summarizeScene(scene, clientConnected);
    return {
      content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
      structured: info,
    };
  }

  if (toolName === 'create_object') {
    pushUndo();
    const kind = String(args.kind ?? 'cube').toLowerCase();
    const name = args.name ? String(args.name) : undefined;
    const meshPrims: MeshPrimitiveKind[] = ['cube', 'sphere', 'icosphere', 'cylinder', 'cone', 'torus', 'plane', 'monkey'];
    const objType: ObjectType = meshPrims.includes(kind as MeshPrimitiveKind)
      ? 'mesh'
      : (kind as ObjectType);
    const prim = meshPrims.includes(kind as MeshPrimitiveKind) ? (kind as MeshPrimitiveKind) : 'cube';
    const obj = createSceneObject(objType, name, prim);
    obj.location = toVec3(args.location, obj.location);
    obj.rotation = toVec3(args.rotation, obj.rotation);
    obj.scale = toVec3(args.scale, obj.scale);
    scene.objects.push(obj);
    scene.activeObjectId = obj.id;
    const summary = { created: { id: obj.id, name: obj.name, type: obj.type, location: obj.location } };
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }], structured: summary };
  }

  if (toolName === 'create_mesh_from_pydata') {
    pushUndo();
    const rawVerts = Array.isArray(args.vertices) ? args.vertices : [];
    const rawFaces = Array.isArray(args.faces) ? args.faces : [];
    const verts: Vertex[] = rawVerts.map((rv) => {
      const p = toVec3(rv, { x: 0, y: 0, z: 0 });
      return {
        id: uid('v'),
        pos: p,
        normal: { x: 0, y: 0, z: 1 },
        uv: { x: (p.x + 1) * 0.5, y: (p.y + 1) * 0.5 },
        color: [0.85, 0.85, 0.88],
        mask: 0,
        weights: {},
        selected: false,
      };
    });
    const faces: Face[] = [];
    for (const rf of rawFaces) {
      if (!Array.isArray(rf) || rf.length < 3) continue;
      const idxs = rf.map((n) => Number(n)).filter((n) => n >= 0 && n < verts.length);
      if (idxs.length >= 3) {
        faces.push({
          verts: idxs,
          normal: { x: 0, y: 0, z: 1 },
          smooth: Boolean(args.smooth),
          materialIndex: 0,
          faceSet: 1,
          selected: false,
        });
      }
    }
    const edges: Edge[] = buildEdgesFromFaces(faces);
    const mesh = {
      vertices: verts,
      edges,
      faces,
      autoSmoothAngle: 35,
      customSplitNormals: false,
      udimTile: 1001,
      uvSyncSelection: false,
    };
    recomputeNormals(mesh);

    let materialId = scene.activeMaterialId;
    if (typeof args.color === 'string') {
      const mat = {
        ...scene.materials[0],
        id: uid('mat'),
        name: `${String(args.name ?? 'CustomMesh')}_Mat`,
        baseColor: args.color,
      };
      scene.materials.push(mat);
      materialId = mat.id;
    }

    const obj = {
      id: uid('obj'),
      name: String(args.name ?? 'ProceduralMesh'),
      type: 'mesh' as const,
      collection: 'Collection',
      parentId: null,
      visible: true,
      renderable: true,
      locked: false,
      location: toVec3(args.location, { x: 0, y: 0, z: 0 }),
      rotation: toVec3(args.rotation, { x: 0, y: 0, z: 0 }),
      scale: toVec3(args.scale, { x: 1, y: 1, z: 1 }),
      materialId,
      modifiers: [],
      keyframes: {},
      drivers: {},
      shapeKeys: [],
      physics: defaultPhysics(),
      mesh,
    };
    scene.objects.push(obj);
    scene.activeObjectId = obj.id;
    const out = { created: obj.name, id: obj.id, vertices: verts.length, faces: faces.length };
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structured: out };
  }

  if (toolName === 'transform_object') {
    const obj = findObject(scene, args.target ? String(args.target) : undefined);
    if (!obj) {
      return { isError: true, content: [{ type: 'text', text: 'Объект не найден' }] };
    }
    pushUndo();
    if (args.name) obj.name = String(args.name);
    if (args.location) obj.location = toVec3(args.location, obj.location);
    if (args.rotation) obj.rotation = toVec3(args.rotation, obj.rotation);
    if (args.scale) obj.scale = toVec3(args.scale, obj.scale);
    if (typeof args.visible === 'boolean') obj.visible = args.visible;
    scene.activeObjectId = obj.id;
    const out = { updated: obj.name, location: obj.location, rotation: obj.rotation, scale: obj.scale };
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structured: out };
  }

  if (toolName === 'apply_edit_op') {
    const obj = findObject(scene, args.target ? String(args.target) : undefined);
    if (!obj?.mesh) {
      return { isError: true, content: [{ type: 'text', text: 'Активный Mesh-объект не найден' }] };
    }
    pushUndo();
    const op = String(args.op ?? 'subdivide');
    const amount = Number(args.amount ?? 0.25);
    const m = obj.mesh;
    if (op === 'subdivide') subdivideMesh(m, false);
    else if (op === 'extrude') extrudeFaces(m, amount || 0.4);
    else if (op === 'inset') insetFaces(m, amount || 0.25);
    else if (op === 'bevel') bevelSelection(m, amount || 0.15);
    else if (op === 'poke') pokeFaces(m);
    else if (op === 'flip_normals') flipNormals(m);
    else if (op === 'triangulate') triangulateMesh(m);
    else if (op === 'tris_to_quads') trisToQuads(m);
    else if (op === 'merge') mergeVerticesToCenter(m, 'vertex');
    else if (op === 'looptools_circle') loopToolsCircle(m, 'face');
    else if (op === 'uv_unwrap') uvUnwrap(m, true);
    else if (op === 'shade_smooth') shadeSmoothByAngle(m, 35);
    else {
      return { isError: true, content: [{ type: 'text', text: `Неизвестная операция: ${op}` }] };
    }
    const out = { object: obj.name, op, vertices: m.vertices.length, faces: m.faces.length };
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structured: out };
  }

  if (toolName === 'add_modifier') {
    const obj = findObject(scene, args.target ? String(args.target) : undefined);
    if (!obj) return { isError: true, content: [{ type: 'text', text: 'Объект не найден' }] };
    pushUndo();
    const modType = String(args.type ?? 'subsurf') as ModifierType;
    const mod = createDefaultModifier(modType);
    if (args.params && typeof args.params === 'object') {
      Object.assign(mod.params, args.params);
    }
    obj.modifiers.push(mod);
    return {
      content: [{ type: 'text', text: JSON.stringify({ object: obj.name, modifier: mod }, null, 2) }],
      structured: { object: obj.name, modifier: mod },
    };
  }

  if (toolName === 'set_material') {
    const obj = findObject(scene, args.target ? String(args.target) : undefined);
    const mat =
      (obj ? scene.materials.find((m) => m.id === obj.materialId) : undefined) ??
      scene.materials[0];
    if (!mat) return { isError: true, content: [{ type: 'text', text: 'Материал не найден' }] };
    pushUndo();
    if (typeof args.baseColor === 'string') mat.baseColor = args.baseColor;
    if (typeof args.metallic === 'number') mat.metallic = Math.max(0, Math.min(1, args.metallic));
    if (typeof args.roughness === 'number') mat.roughness = Math.max(0, Math.min(1, args.roughness));
    if (typeof args.transmission === 'number') mat.transmission = Math.max(0, Math.min(1, args.transmission));
    if (typeof args.dispersion === 'number') mat.dispersion = Math.max(0, Math.min(1, args.dispersion));
    if (typeof args.emissionStrength === 'number') mat.emissionStrength = Math.max(0, args.emissionStrength);
    if (typeof args.procTexture === 'string') mat.procTexture = args.procTexture as ProcTextureType;
    return {
      content: [{ type: 'text', text: JSON.stringify({ material: mat.name, baseColor: mat.baseColor, metallic: mat.metallic, roughness: mat.roughness }, null, 2) }],
    };
  }

  if (toolName === 'run_blender_script') {
    const code = String(args.code ?? '');
    const language = (args.language === 'javascript' ? 'javascript' : 'python') as ScriptLanguage;
    pushUndo();
    if (allowEval) {
      const res = executeBlenderScript(scene, code, language);
      if (!res.ok) {
        return { isError: true, content: [{ type: 'text', text: `Ошибка скрипта: ${res.error}\n${res.logs.join('\n')}` }] };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ok: true, logs: res.logs, createdObjects: res.createdObjects, modifiedObjects: res.modifiedObjects, durationMs: res.durationMs }, null, 2),
        }],
      };
    }
    const basic = executeBasicBpyNoEval(scene, code);
    if (!basic.ok) {
      return { isError: true, content: [{ type: 'text', text: basic.error || 'Script error' }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, logs: basic.logs }, null, 2) }] };
  }

  if (toolName === 'undo') {
    const prev = undoStack.pop();
    if (!prev) {
      return { content: [{ type: 'text', text: 'Стек Undo пуст' }] };
    }
    const parsed = JSON.parse(prev) as XL3DScene;
    Object.assign(scene, parsed);
    return { content: [{ type: 'text', text: JSON.stringify({ undone: true, objectCount: scene.objects.length }) }] };
  }

  if (toolName === 'export_scene') {
    const fmt = String(args.format ?? 'obj').toLowerCase();
    let data = '';
    if (fmt === 'stl') data = exportSceneToSTL(scene);
    else if (fmt === 'ply') data = exportSceneToPLY(scene);
    else if (fmt === 'xl3d' || fmt === 'json') data = JSON.stringify(scene, null, 2);
    else data = exportSceneToOBJ(scene);
    return { content: [{ type: 'text', text: data }] };
  }

  if (toolName === 'get_viewport_screenshot') {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Скриншот вьюпорта доступен только при подключённом приложении XL3D (телефон/браузер) через WebSocket.',
        },
      ],
    };
  }

  return { isError: true, content: [{ type: 'text', text: `Неизвестный инструмент: ${toolName}` }] };
}
