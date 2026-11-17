import { uid } from '../core/math3d';
import type {
  Edge,
  Face,
  ModifierType,
  ObjectType,
  ProcTextureType,
  ScriptLanguage,
  Vec3,
  Vertex,
} from '../core/types';
import * as editOps from '../engine/editOps';
import { exportSceneToOBJ, exportSceneToPLY, exportSceneToSTL } from '../engine/ioFormats';
import { createDefaultModifier } from '../engine/modifiers';
import {
  buildEdgesFromFaces,
  createSceneObject,
  defaultPhysics,
  recomputeNormals,
  type MeshPrimitiveKind,
} from '../engine/primitives';
import { executeBlenderScript } from '../engine/scriptingEngine';
import { store } from './xl3dStore';

export type BridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpBridgeConfig {
  serverUrl: string;
  roomId: string;
  token: string;
}

const STORAGE_KEY = 'xl3d_mcp_bridge_v1';

function randomCode(len: number): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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

class XL3DMcpBridge {
  config: McpBridgeConfig;
  status: BridgeStatus = 'disconnected';
  lastError = '';
  logs: string[] = ['AI / MCP Bridge готов к подключению к Cloudflare Worker'];

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): McpBridgeConfig {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<McpBridgeConfig>;
          if (parsed.roomId && parsed.token) {
            return {
              serverUrl: String(parsed.serverUrl ?? ''),
              roomId: String(parsed.roomId),
              token: String(parsed.token),
            };
          }
        }
      } catch {
        // ignore
      }
    }
    const cfg: McpBridgeConfig = {
      serverUrl: '',
      roomId: `xl3d-${randomCode(4)}`,
      token: randomCode(14),
    };
    this.saveConfig(cfg);
    return cfg;
  }

  private saveConfig(cfg: McpBridgeConfig): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch {
      // ignore
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
    store.commitLiveChange();
  }

  private log(line: string): void {
    this.logs.push(line);
    if (this.logs.length > 25) this.logs = this.logs.slice(-25);
  }

  updateConfig(patch: Partial<McpBridgeConfig>): void {
    this.config = { ...this.config, ...patch };
    this.saveConfig(this.config);
    this.listeners.forEach((l) => l());
  }

  regenerateToken(): void {
    this.updateConfig({ roomId: `xl3d-${randomCode(4)}`, token: randomCode(14) });
  }

  getMcpHttpUrl(): string {
    const base = this.normalizeHttpBase(this.config.serverUrl);
    if (!base) return '';
    return `${base}/mcp?room=${encodeURIComponent(this.config.roomId)}&token=${encodeURIComponent(this.config.token)}`;
  }

  getOpenApiUrl(): string {
    const base = this.normalizeHttpBase(this.config.serverUrl);
    if (!base) return '';
    return `${base}/openapi.json?room=${encodeURIComponent(this.config.roomId)}`;
  }

  private normalizeHttpBase(raw: string): string {
    const s = raw.trim().replace(/\/+$/, '');
    if (!s) return '';
    if (s.startsWith('ws://')) return 'http://' + s.slice(5);
    if (s.startsWith('wss://')) return 'https://' + s.slice(6);
    if (!s.startsWith('http://') && !s.startsWith('https://')) return 'https://' + s;
    return s;
  }

  private normalizeWsUrl(): string {
    const httpBase = this.normalizeHttpBase(this.config.serverUrl);
    const wsBase = httpBase.replace(/^http/, 'ws');
    return `${wsBase}/ws?room=${encodeURIComponent(this.config.roomId)}&token=${encodeURIComponent(this.config.token)}`;
  }

  connect(): void {
    if (typeof WebSocket === 'undefined') return;
    if (!this.config.serverUrl.trim()) {
      this.status = 'error';
      this.lastError = 'Укажите URL Cloudflare Worker (https://...workers.dev)';
      this.log(`✕ ${this.lastError}`);
      this.notify();
      return;
    }

    this.disconnect(false);
    this.status = 'connecting';
    this.lastError = '';
    const wsUrl = this.normalizeWsUrl();
    this.log(`Подключение к ${this.normalizeHttpBase(this.config.serverUrl)}...`);
    this.notify();

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.status = 'connected';
        this.lastError = '';
        this.log(`🟢 Подключено (комната: ${this.config.roomId})`);
        this.syncSceneToServer();
        this.pingTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
        this.notify();
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          const msg = JSON.parse(ev.data) as Record<string, unknown>;
          if (msg.type === 'rpc' && typeof msg.callId === 'string' && typeof msg.tool === 'string') {
            const result = this.handleRpc(msg.tool, (msg.args ?? {}) as Record<string, unknown>);
            ws.send(JSON.stringify({ type: 'rpc_result', callId: msg.callId, result }));
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        this.status = 'error';
        this.lastError = 'Ошибка WebSocket соединения';
        this.log(`✕ ${this.lastError}`);
        this.notify();
      };

      ws.onclose = () => {
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        if (this.status !== 'disconnected') {
          this.status = 'disconnected';
          this.log('Отключено от AI Bridge');
          this.notify();
        }
      };
    } catch (err) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.notify();
    }
  }

  disconnect(notifyUi = true): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.status = 'disconnected';
    if (notifyUi) this.notify();
  }

  syncSceneToServer(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'scene_sync', scene: store.scene }));
      } catch {
        // ignore
      }
    }
  }

  executeLocalRpc(tool: string, args: Record<string, unknown> = {}): Record<string, unknown> {
    return this.handleRpc(tool, args);
  }

  private handleRpc(tool: string, args: Record<string, unknown>): Record<string, unknown> {
    this.log(`🤖 ${tool}`);

    const findObj = (target?: unknown) => {
      if (typeof target === 'string' && target.trim()) {
        return store.scene.objects.find((o) => o.id === target || o.name === target);
      }
      return store.getActiveObject() ?? store.scene.objects.find((o) => o.type === 'mesh');
    };

    if (tool === 'get_scene_info') {
      const active = store.getActiveObject();
      const info = {
        app: 'XL3D',
        version: store.scene.version,
        clientConnected: true,
        activeObjectId: store.scene.activeObjectId,
        activeObjectName: active?.name ?? null,
        currentFrame: store.scene.currentFrame,
        renderEngine: store.scene.render.engine,
        objectCount: store.scene.objects.length,
        objects: store.scene.objects.map((o) => ({
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
        materials: store.scene.materials.map((m) => ({
          id: m.id,
          name: m.name,
          baseColor: m.baseColor,
          metallic: m.metallic,
          roughness: m.roughness,
          procTexture: m.procTexture,
        })),
      };
      return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }], structured: info };
    }

    if (tool === 'run_blender_script') {
      const code = String(args.code ?? '');
      const language = (args.language === 'javascript' ? 'javascript' : 'python') as ScriptLanguage;
      if (typeof args.saveAs === 'string' && args.saveAs.trim()) {
        store.loadScriptFile(args.saveAs.trim(), code);
      }
      store.pushUndo();
      const res = executeBlenderScript(store.scene, code, language);
      store.commitLiveChange();
      if (!res.ok) {
        return { isError: true, content: [{ type: 'text', text: `Ошибка скрипта: ${res.error}\n${res.logs.join('\n')}` }] };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ ok: true, logs: res.logs, createdObjects: res.createdObjects, modifiedObjects: res.modifiedObjects, durationMs: res.durationMs }, null, 2),
          },
        ],
      };
    }

    if (tool === 'create_object') {
      store.pushUndo();
      const kind = String(args.kind ?? 'cube').toLowerCase();
      const name = args.name ? String(args.name) : undefined;
      const meshPrims: MeshPrimitiveKind[] = ['cube', 'sphere', 'icosphere', 'cylinder', 'cone', 'torus', 'plane', 'monkey'];
      const objType: ObjectType = meshPrims.includes(kind as MeshPrimitiveKind) ? 'mesh' : (kind as ObjectType);
      const prim = meshPrims.includes(kind as MeshPrimitiveKind) ? (kind as MeshPrimitiveKind) : 'cube';
      const obj = createSceneObject(objType, name, prim);
      obj.location = toVec3(args.location, obj.location);
      obj.rotation = toVec3(args.rotation, obj.rotation);
      obj.scale = toVec3(args.scale, obj.scale);
      store.scene.objects.push(obj);
      store.setActiveObject(obj.id);
      const summary = { created: { id: obj.id, name: obj.name, type: obj.type, location: obj.location } };
      return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }], structured: summary };
    }

    if (tool === 'create_mesh_from_pydata') {
      store.pushUndo();
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

      let materialId = store.scene.activeMaterialId;
      if (typeof args.color === 'string') {
        const mat = {
          ...store.scene.materials[0],
          id: uid('mat'),
          name: `${String(args.name ?? 'CustomMesh')}_Mat`,
          baseColor: args.color,
        };
        store.scene.materials.push(mat);
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
      store.scene.objects.push(obj);
      store.setActiveObject(obj.id);
      const out = { created: obj.name, id: obj.id, vertices: verts.length, faces: faces.length };
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structured: out };
    }

    if (tool === 'transform_object') {
      const obj = findObj(args.target);
      if (!obj) return { isError: true, content: [{ type: 'text', text: 'Объект не найден' }] };
      store.pushUndo();
      if (args.name) obj.name = String(args.name);
      if (args.location) obj.location = toVec3(args.location, obj.location);
      if (args.rotation) obj.rotation = toVec3(args.rotation, obj.rotation);
      if (args.scale) obj.scale = toVec3(args.scale, obj.scale);
      if (typeof args.visible === 'boolean') obj.visible = args.visible;
      store.setActiveObject(obj.id);
      const out = { updated: obj.name, location: obj.location, rotation: obj.rotation, scale: obj.scale };
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structured: out };
    }

    if (tool === 'apply_edit_op') {
      const obj = findObj(args.target);
      if (!obj?.mesh) return { isError: true, content: [{ type: 'text', text: 'Mesh не найден' }] };
      store.pushUndo();
      const op = String(args.op ?? 'subdivide');
      const amount = Number(args.amount ?? 0.25);
      const m = obj.mesh;
      if (op === 'subdivide') editOps.subdivideMesh(m, false);
      else if (op === 'extrude') editOps.extrudeFaces(m, amount || 0.4);
      else if (op === 'inset') editOps.insetFaces(m, amount || 0.25);
      else if (op === 'bevel') editOps.bevelSelection(m, amount || 0.15);
      else if (op === 'poke') editOps.pokeFaces(m);
      else if (op === 'flip_normals') editOps.flipNormals(m);
      else if (op === 'triangulate') editOps.triangulateMesh(m);
      else if (op === 'tris_to_quads') editOps.trisToQuads(m);
      else if (op === 'merge') editOps.mergeVerticesToCenter(m, 'vertex');
      else if (op === 'bridge_fill') editOps.bridgeOrFillSelection(m, 'face');
      else if (op === 'dissolve') editOps.dissolveSelection(m, 'face');
      else if (op === 'shrink_fatten') editOps.shrinkFattenSelection(m, 'vertex', amount || 0.15);
      else if (op === 'spin') editOps.spinSelection(m, 'vertex', 90, 4);
      else if (op === 'duplicate_faces') editOps.duplicateSelectedFaces(m);
      else if (op === 'looptools_circle') editOps.loopToolsCircle(m, 'face');
      else if (op === 'uv_unwrap') editOps.uvUnwrap(m, true);
      else if (op === 'shade_smooth') editOps.shadeSmoothByAngle(m, 35);
      store.commitLiveChange();
      return {
        content: [{ type: 'text', text: JSON.stringify({ object: obj.name, op, vertices: m.vertices.length, faces: m.faces.length }, null, 2) }],
      };
    }

    if (tool === 'object_action') {
      const obj = findObj(args.target);
      if (!obj) return { isError: true, content: [{ type: 'text', text: 'Объект не найден' }] };
      store.setActiveObject(obj.id);
      const act = String(args.action ?? 'duplicate');
      if (act === 'duplicate') store.duplicateActiveObject();
      else if (act === 'apply_transforms') store.applyAllTransforms();
      else if (act === 'origin_to_geometry') store.originToGeometry();
      else if (act === 'join') store.joinWithNextMesh();
      else if (act === 'convert_to_mesh') store.convertToMesh();
      else if (act === 'apply_modifiers') {
        const ids = obj.modifiers.map((m) => m.id);
        for (const id of ids) store.applyModifier(id);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, action: act, objectCount: store.scene.objects.length }, null, 2) }],
      };
    }

    if (tool === 'add_modifier') {
      const obj = findObj(args.target);
      if (!obj) return { isError: true, content: [{ type: 'text', text: 'Объект не найден' }] };
      store.pushUndo();
      const mod = createDefaultModifier(String(args.type ?? 'subsurf') as ModifierType);
      if (args.params && typeof args.params === 'object') Object.assign(mod.params, args.params);
      obj.modifiers.push(mod);
      store.commitLiveChange();
      return { content: [{ type: 'text', text: JSON.stringify({ object: obj.name, modifier: mod }, null, 2) }] };
    }

    if (tool === 'set_material') {
      const obj = findObj(args.target);
      const mat = (obj ? store.scene.materials.find((m) => m.id === obj.materialId) : undefined) ?? store.getActiveMaterial();
      if (!mat) return { isError: true, content: [{ type: 'text', text: 'Материал не найден' }] };
      store.pushUndo();
      if (typeof args.baseColor === 'string') mat.baseColor = args.baseColor;
      if (typeof args.metallic === 'number') mat.metallic = Math.max(0, Math.min(1, args.metallic));
      if (typeof args.roughness === 'number') mat.roughness = Math.max(0, Math.min(1, args.roughness));
      if (typeof args.transmission === 'number') mat.transmission = Math.max(0, Math.min(1, args.transmission));
      if (typeof args.dispersion === 'number') mat.dispersion = Math.max(0, Math.min(1, args.dispersion));
      if (typeof args.emissionStrength === 'number') mat.emissionStrength = Math.max(0, args.emissionStrength);
      if (typeof args.procTexture === 'string') mat.procTexture = args.procTexture as ProcTextureType;
      store.commitLiveChange();
      return { content: [{ type: 'text', text: JSON.stringify({ material: mat.name, baseColor: mat.baseColor }) }] };
    }

    if (tool === 'get_viewport_screenshot') {
      const canvas = typeof document !== 'undefined' ? (document.querySelector('.vp-canvas') as HTMLCanvasElement | null) : null;
      if (!canvas) {
        return { isError: true, content: [{ type: 'text', text: '3D canvas недоступен' }] };
      }
      const maxW = 640;
      const scale = Math.min(1, maxW / Math.max(1, canvas.width));
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(160, Math.round(canvas.width * scale));
      tmp.height = Math.max(120, Math.round(canvas.height * scale));
      const tctx = tmp.getContext('2d');
      tctx?.drawImage(canvas, 0, 0, tmp.width, tmp.height);
      const dataUrl = tmp.toDataURL('image/png');
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      return {
        content: [
          { type: 'image', data: base64, mimeType: 'image/png' },
          { type: 'text', text: `Viewport screenshot (${tmp.width}x${tmp.height}), objects: ${store.scene.objects.length}` },
        ],
      };
    }

    if (tool === 'undo') {
      store.undo();
      return { content: [{ type: 'text', text: JSON.stringify({ undone: true, objectCount: store.scene.objects.length }) }] };
    }

    if (tool === 'export_scene') {
      const fmt = String(args.format ?? 'obj').toLowerCase();
      let data = '';
      if (fmt === 'stl') data = exportSceneToSTL(store.scene);
      else if (fmt === 'ply') data = exportSceneToPLY(store.scene);
      else if (fmt === 'xl3d' || fmt === 'json') data = store.saveProjectJson();
      else data = exportSceneToOBJ(store.scene);
      return { content: [{ type: 'text', text: data }] };
    }

    return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${tool}` }] };
  }
}

export const mcpBridge = new XL3DMcpBridge();
