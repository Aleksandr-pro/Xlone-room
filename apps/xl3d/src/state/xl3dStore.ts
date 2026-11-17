import { detectLocale, getXL3DDict, saveLocale, type Locale } from '../core/i18n';
import { getCameraBasis, inverseRotateVec3, uid, type OrbitCamera } from '../core/math3d';
import type {
  BakeType,
  CameraData,
  EditSelectMode,
  InteractionMode,
  LightData,
  MaterialData,
  ModifierType,
  ObjectType,
  PaintMode,
  PaintSettings,
  PhysicsSettings,
  SceneObject,
  SculptBrush,
  SculptSettings,
  SubEditorKind,
  TextureBrushType,
  ToolGizmo,
  Vec3,
  VseClip,
  WorkspaceTab,
  WorldSettings,
  XL3DScene,
} from '../core/types';
import * as editOps from '../engine/editOps';
import { createDefaultModifier } from '../engine/modifiers';
import { bakeMeshMap, paintVertexColor, paintVertexWeight } from '../engine/paintAndBake';
import {
  gaussianSmoothKeyframes,
  generateRigifyHumanoidArmature,
  insertKeyframe,
  solveTwoBoneIK,
  vseBladeCut,
  vseRippleDelete,
} from '../engine/physicsAndAnim';
import { createDefaultXL3DScene, createSceneObject, type MeshPrimitiveKind } from '../engine/primitives';
import { applySculptStroke, clearSculptMask, invertSculptMask, paintMaskAt, quadRemesh, voxelRemesh } from '../engine/sculpt';

type Listener = () => void;

const AUTOSAVE_KEY = 'xl3d_autosave_v1';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class XL3DStore {
  scene: XL3DScene;
  camera: OrbitCamera = {
    target: { x: 0, y: 0, z: 0.6 },
    yaw: 0.78,
    pitch: 0.45,
    distance: 7.2,
    fovDeg: 45,
    ortho: false,
    panoramic: false,
  };

  mode: InteractionMode = 'object';
  editSelectMode: EditSelectMode = 'face';
  tool: ToolGizmo = 'select';
  activeTab: WorkspaceTab = 'tools';
  activeSubEditor: SubEditorKind = 'assets';
  panelHeightMode: 'compact' | 'half' | 'tall' = 'half';
  showOverlays = true;
  proportionalEditing = false;
  proportionalRadius = 1.2;
  editOpAmount = 0.4;
  pivotMode: 'median' | 'cursor' = 'median';
  additiveSelect = false;

  selectedBoneId: string | null = null;
  selectedNodeId: string | null = null;
  selectedClipId: string | null = null;
  consoleLog: string[] = ['XL3D Python / Macro Console Ready (Blender 5.3 API)'];

  sculpt: SculptSettings = {
    brush: 'draw',
    radius: 0.8,
    strength: 0.5,
    invert: false,
    symX: false,
    symY: false,
    symZ: false,
    radialSymmetry: 1,
    dyntopo: false,
    voxelSize: 0.25,
    multiresLevel: 0,
    activeFaceSet: 1,
    frontFacesOnly: true,
  };

  paint: PaintSettings = {
    mode: 'vertex',
    brush: 'draw',
    color: '#ff6e40',
    radius: 0.8,
    strength: 0.65,
    activeBoneId: 'Bone',
    bakedMaps: {},
  };

  paintWeightValue = 1.0;
  locale: Locale = detectLocale();
  theme: 'dark' | 'light' = 'dark';
  isPlaying = false;
  lastBakeUrl: string | null = null;
  texturePaintCanvas: HTMLCanvasElement | null = null;

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private listeners = new Set<Listener>();
  private viewportListeners = new Set<Listener>();
  private rafId: number | null = null;
  private lastTick = 0;

  constructor() {
    this.scene = this.loadAutosave() ?? createDefaultXL3DScene();
  }

  private loadAutosave(): XL3DScene | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<XL3DScene>;
      if (!parsed || !Array.isArray(parsed.objects) || parsed.objects.length === 0) return null;
      const def = createDefaultXL3DScene();
      return {
        ...def,
        ...parsed,
        render: { ...def.render, ...(parsed.render ?? {}) },
        world: { ...def.world, ...(parsed.world ?? {}) },
        vse: { ...def.vse, ...(parsed.vse ?? {}) },
        cursor3D: parsed.cursor3D ?? def.cursor3D,
        materials: Array.isArray(parsed.materials) && parsed.materials.length > 0 ? parsed.materials : def.materials,
        nodeGraphs: Array.isArray(parsed.nodeGraphs) && parsed.nodeGraphs.length > 0 ? parsed.nodeGraphs : def.nodeGraphs,
      };
    } catch {
      return null;
    }
  }

  saveAutosave(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(this.scene));
    } catch {
      // ignore quota issues
    }
  }

  t() {
    return getXL3DDict(this.locale);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeViewport(fn: Listener): () => void {
    this.viewportListeners.add(fn);
    return () => this.viewportListeners.delete(fn);
  }

  private emitAll(): void {
    this.saveAutosave();
    this.listeners.forEach((l) => l());
    this.viewportListeners.forEach((l) => l());
  }

  private emitViewport(): void {
    this.viewportListeners.forEach((l) => l());
  }

  commitLiveChange(): void {
    this.emitAll();
  }

  pushUndo(): void {
    try {
      this.undoStack.push(JSON.stringify(this.scene));
      if (this.undoStack.length > 35) this.undoStack.shift();
      this.redoStack = [];
    } catch {
      // ignore
    }
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.scene));
    this.scene = JSON.parse(prev) as XL3DScene;
    this.emitAll();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.scene));
    this.scene = JSON.parse(next) as XL3DScene;
    this.emitAll();
  }

  getActiveObject(): SceneObject | undefined {
    return this.scene.objects.find((o) => o.id === this.scene.activeObjectId);
  }

  getCamForwardLocal(obj: SceneObject): Vec3 {
    const basis = getCameraBasis(this.camera);
    return inverseRotateVec3(basis.forward, obj.rotation);
  }

  setActiveObject(id: string | null): void {
    this.scene.activeObjectId = id;
    this.emitAll();
  }

  setMode(mode: InteractionMode): void {
    this.mode = mode;
    this.emitAll();
  }

  setPaintMode(pm: PaintMode): void {
    this.paint.mode = pm;
    this.mode = 'paint';
    this.emitAll();
  }

  setEditSelectMode(sm: EditSelectMode): void {
    this.editSelectMode = sm;
    this.emitAll();
  }

  setTool(tool: ToolGizmo): void {
    this.tool = tool;
    this.emitAll();
  }

  setActiveTab(tab: WorkspaceTab): void {
    this.activeTab = tab;
    this.emitAll();
  }

  setActiveSubEditor(sub: SubEditorKind): void {
    this.activeSubEditor = sub;
    this.activeTab = 'editors';
    this.emitAll();
  }

  cyclePanelHeight(): void {
    this.panelHeightMode =
      this.panelHeightMode === 'compact' ? 'half' : this.panelHeightMode === 'half' ? 'tall' : 'compact';
    this.emitAll();
  }

  setLocaleAndTheme(lang?: Locale, theme?: 'dark' | 'light'): void {
    if (lang) {
      this.locale = lang;
      saveLocale(lang);
    }
    if (theme) {
      this.theme = theme;
    }
    this.emitAll();
  }

  toggleOverlays(): void {
    this.showOverlays = !this.showOverlays;
    this.emitAll();
  }

  orbitCamera(dYaw: number, dPitch: number): void {
    this.camera.yaw += dYaw;
    this.camera.pitch = clamp(this.camera.pitch + dPitch, -1.45, 1.45);
    this.emitViewport();
  }

  zoomCamera(factor: number): void {
    this.camera.distance = clamp(this.camera.distance * factor, 1.4, 45);
    this.emitViewport();
  }

  panCamera(dx: number, dy: number): void {
    const basis = getCameraBasis(this.camera);
    const step = this.camera.distance * 0.0022;
    this.camera.target.x += basis.right.x * dx * step + basis.up.x * dy * step;
    this.camera.target.y += basis.right.y * dx * step + basis.up.y * dy * step;
    this.camera.target.z += basis.right.z * dx * step + basis.up.z * dy * step;
    this.emitViewport();
  }

  setCameraPreset(preset: 'front' | 'right' | 'top' | 'ortho' | 'pano'): void {
    if (preset === 'front') { this.camera.yaw = -Math.PI / 2; this.camera.pitch = 0.02; }
    else if (preset === 'right') { this.camera.yaw = 0; this.camera.pitch = 0.02; }
    else if (preset === 'top') { this.camera.yaw = -Math.PI / 2; this.camera.pitch = 1.45; }
    else if (preset === 'ortho') { this.camera.ortho = !this.camera.ortho; }
    else if (preset === 'pano') { this.camera.panoramic = !this.camera.panoramic; }
    this.emitAll();
  }

  addObject(type: ObjectType, prim: MeshPrimitiveKind = 'cube', name?: string): SceneObject {
    this.pushUndo();
    const obj = createSceneObject(type, name, prim, this.scene.activeMaterialId);
    obj.location = { ...this.scene.cursor3D };
    if (this.scene.objects.length > 0 && this.scene.cursor3D.x === 0 && this.scene.cursor3D.y === 0) {
      obj.location.x = ((this.scene.objects.length % 4) - 1.5) * 0.85;
      obj.location.z = 0.8;
    }
    this.scene.objects.push(obj);
    this.scene.activeObjectId = obj.id;
    this.emitAll();
    return obj;
  }

  duplicateActiveObject(): void {
    const src = this.getActiveObject();
    if (!src) return;
    this.pushUndo();
    const copy = JSON.parse(JSON.stringify(src)) as SceneObject;
    copy.id = uid('obj');
    copy.name = `${src.name}.001`;
    copy.location.x += 1.2;
    this.scene.objects.push(copy);
    this.scene.activeObjectId = copy.id;
    this.emitAll();
  }

  deleteActiveObject(): void {
    if (!this.scene.activeObjectId) return;
    this.pushUndo();
    this.scene.objects = this.scene.objects.filter((o) => o.id !== this.scene.activeObjectId);
    this.scene.activeObjectId = this.scene.objects[0]?.id ?? null;
    this.emitAll();
  }

  toggleObjectVisibility(id: string): void {
    const o = this.scene.objects.find((x) => x.id === id);
    if (!o) return;
    o.visible = !o.visible;
    this.emitAll();
  }

  updateActiveTransform(
    section: 'location' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    val: number,
    livePreviewOnly = false
  ): void {
    const obj = this.getActiveObject();
    if (!obj) return;
    if (!livePreviewOnly) this.pushUndo();
    obj[section][axis] = val;
    if (livePreviewOnly) this.emitViewport();
    else this.emitAll();
  }

  transformObjectInCameraSpace(
    worldDelta: Vec3,
    dxPx: number,
    dyPx: number,
    livePreviewOnly = true
  ): void {
    const obj = this.getActiveObject();
    if (!obj) return;
    if (this.tool === 'move') {
      obj.location.x += worldDelta.x;
      obj.location.y += worldDelta.y;
      obj.location.z += worldDelta.z;
    } else if (this.tool === 'rotate') {
      obj.rotation.z += dxPx * 0.65;
      obj.rotation.x += dyPx * 0.55;
    } else if (this.tool === 'scale') {
      const sf = Math.max(0.15, 1 + (dxPx - dyPx) * 0.008);
      obj.scale.x *= sf;
      obj.scale.y *= sf;
      obj.scale.z *= sf;
    }
    if (livePreviewOnly) this.emitViewport();
    else this.emitAll();
  }

  // Accurate Edit Mode selection & camera-aligned transformation
  pickEditElement(faceIdx: number, hitLocal: Vec3): void {
    const obj = this.getActiveObject();
    if (!obj?.mesh) return;
    this.pushUndo();
    editOps.selectMeshElementByHit(obj.mesh, this.editSelectMode, faceIdx, hitLocal, this.additiveSelect);
    this.emitAll();
  }

  transformEditSelection(worldDelta: Vec3, dxPx: number, dyPx: number): void {
    const obj = this.getActiveObject();
    if (!obj?.mesh) return;
    const propR = this.proportionalEditing ? this.proportionalRadius : 0;
    const camFwdLocal = this.getCamForwardLocal(obj);
    if (this.tool === 'move') {
      const localDelta = inverseRotateVec3(worldDelta, obj.rotation);
      localDelta.x /= Math.max(0.1, obj.scale.x);
      localDelta.y /= Math.max(0.1, obj.scale.y);
      localDelta.z /= Math.max(0.1, obj.scale.z);
      editOps.translateSelection(obj.mesh, this.editSelectMode, localDelta, propR, camFwdLocal);
    } else if (this.tool === 'rotate') {
      const pivot = this.pivotMode === 'cursor' ? this.scene.cursor3D : undefined;
      editOps.rotateSelection(obj.mesh, this.editSelectMode, { x: dyPx * 0.6, y: 0, z: dxPx * 0.6 }, pivot);
    } else if (this.tool === 'scale') {
      const pivot = this.pivotMode === 'cursor' ? this.scene.cursor3D : undefined;
      const sf = Math.max(0.25, 1 + (dxPx - dyPx) * 0.008);
      editOps.scaleSelection(obj.mesh, this.editSelectMode, sf, pivot);
    }
    this.emitViewport();
  }

  runEditOp(opName: string): void {
    const obj = this.getActiveObject();
    if (!obj?.mesh) return;
    this.pushUndo();
    const m = obj.mesh;
    const amt = this.editOpAmount;
    const camFwdLocal = this.getCamForwardLocal(obj);

    switch (opName) {
      case 'extrude': editOps.extrudeFaces(m, amt, camFwdLocal); break;
      case 'inset': editOps.insetFaces(m, clamp(amt * 0.6, 0.06, 0.75), camFwdLocal); break;
      case 'bevel': editOps.bevelSelection(m, clamp(amt * 0.4, 0.05, 0.45)); break;
      case 'loopcut': editOps.loopCutMesh(m, 1); break;
      case 'knife': editOps.knifeBisect(m, 0, false); break;
      case 'bridge': editOps.bridgeOrFill(m); break;
      case 'merge': editOps.mergeVerticesToCenter(m, this.editSelectMode); break;
      case 'dissolve': editOps.dissolveSelected(m); break;
      case 'spin': editOps.spinMesh(m, 4, 90); break;
      case 'polybuild': editOps.polyBuildQuad(m, { x: 0, y: 0, z: 1.1 }); break;
      case 'subdivide': editOps.subdivideMesh(m, false); break;
      case 'triangulate': editOps.triangulateMesh(m); break;
      case 'tris_to_quads': editOps.trisToQuads(m); break;
      case 'shrink_fatten': editOps.shrinkFatten(m, this.editSelectMode, amt * 0.4); break;
      case 'smooth_verts': editOps.smoothVertices(m, this.editSelectMode, 0.4); break;
      case 'poke_faces': editOps.pokeFaces(m); break;
      case 'flip_normals': editOps.flipNormals(m); break;
      case 'toggle_sharp': editOps.toggleSharpEdges(m); break;
      case 'looptools_circle': editOps.loopToolsCircle(m, this.editSelectMode); break;
      case 'looptools_flatten': editOps.loopToolsFlatten(m, this.editSelectMode); break;
      case 'looptools_space': editOps.loopToolsSpace(m, this.editSelectMode); break;
      case 'select_all': editOps.selectAll(m, true); break;
      case 'select_none': editOps.selectAll(m, false); break;
      case 'select_invert': editOps.selectAll(m, 'invert'); break;
      case 'select_similar': editOps.selectSimilar(m); break;
      case 'select_loop': editOps.selectLoopOrRing(m); break;
      case 'select_linked': editOps.selectLinked(m); break;
      case 'select_random': editOps.selectRandom(m, 0.4); break;
      case 'select_checker': editOps.selectChecker(m); break;
      case 'shade_smooth': editOps.shadeSmoothByAngle(m, 35); break;
      case 'shade_flat': editOps.shadeSmoothByAngle(m, 0); break;
      case 'uv_unwrap': editOps.uvUnwrap(m, false); break;
      case 'uv_smart': editOps.uvUnwrap(m, true); break;
      case 'mark_seam': editOps.markSeam(m); break;
      case 'uv_pack': editOps.packUvIslands(m); break;
    }
    this.emitAll();
  }

  addModifier(type: ModifierType): void {
    const obj = this.getActiveObject();
    if (!obj) return;
    this.pushUndo();
    obj.modifiers.push(createDefaultModifier(type));
    this.emitAll();
  }

  removeModifier(modId: string): void {
    const obj = this.getActiveObject();
    if (!obj) return;
    this.pushUndo();
    obj.modifiers = obj.modifiers.filter((m) => m.id !== modId);
    this.emitAll();
  }

  toggleModifier(modId: string): void {
    const mod = this.getActiveObject()?.modifiers.find((m) => m.id === modId);
    if (!mod) return;
    mod.enabled = !mod.enabled;
    this.emitAll();
  }

  updateModifierParam(modId: string, key: string, value: number | boolean | string, livePreviewOnly = false): void {
    const mod = this.getActiveObject()?.modifiers.find((m) => m.id === modId);
    if (!mod) return;
    mod.params[key] = value;
    if (livePreviewOnly) this.emitViewport();
    else this.emitAll();
  }

  setSculptBrush(brush: SculptBrush): void {
    this.sculpt.brush = brush;
    this.emitAll();
  }

  setPaintBrush(brush: TextureBrushType): void {
    this.paint.brush = brush;
    this.emitAll();
  }

  strokeAtLocalPoint(hitLocal: Vec3, worldDelta: Vec3): void {
    const obj = this.getActiveObject();
    if (!obj) return;
    const localDelta = inverseRotateVec3(worldDelta, obj.rotation);
    localDelta.x /= Math.max(0.1, obj.scale.x);
    localDelta.y /= Math.max(0.1, obj.scale.y);
    localDelta.z /= Math.max(0.1, obj.scale.z);
    const camFwdLocal = this.getCamForwardLocal(obj);

    if (this.mode === 'sculpt' && obj.mesh) {
      const others = this.scene.objects.filter((o) => o.id !== obj.id && o.mesh);
      applySculptStroke(obj.mesh, hitLocal, localDelta, this.sculpt, others, camFwdLocal);
      this.emitViewport();
    } else if (this.mode === 'paint' && obj.mesh) {
      if (this.paint.mode === 'weight') paintVertexWeight(obj.mesh, hitLocal, this.paint, this.paintWeightValue);
      else paintVertexColor(obj.mesh, hitLocal, this.paint);
      this.emitViewport();
    } else if ((this.mode === 'grease' || obj.type === 'greasepencil') && obj.greasePencil) {
      const layer = obj.greasePencil.layers[0];
      if (layer) {
        const frameStrokes = layer.frames[this.scene.currentFrame] ?? layer.frames[1] ?? [];
        if (frameStrokes.length === 0) {
          frameStrokes.push({
            id: uid('gps'),
            points: [{ pos: hitLocal, pressure: 1 }],
            color: this.paint.color,
            filled: false,
            thickness: 4,
          });
        } else {
          frameStrokes[frameStrokes.length - 1].points.push({ pos: hitLocal, pressure: 1 });
        }
        layer.frames[this.scene.currentFrame] = frameStrokes;
        this.emitViewport();
      }
    }
  }

  runSculptUtility(op: 'clear_mask' | 'invert_mask' | 'mask_dab' | 'voxel_remesh' | 'quad_remesh' | 'toggle_dyntopo' | 'multires_subdiv'): void {
    const obj = this.getActiveObject();
    if (!obj?.mesh) return;
    this.pushUndo();
    if (op === 'clear_mask') clearSculptMask(obj.mesh);
    else if (op === 'invert_mask') invertSculptMask(obj.mesh);
    else if (op === 'mask_dab') paintMaskAt(obj.mesh, { x: 0, y: 0, z: 0.5 }, 0.9, 0.7);
    else if (op === 'voxel_remesh') voxelRemesh(obj.mesh, this.sculpt.voxelSize);
    else if (op === 'quad_remesh') quadRemesh(obj.mesh);
    else if (op === 'toggle_dyntopo') this.sculpt.dyntopo = !this.sculpt.dyntopo;
    else if (op === 'multires_subdiv') {
      this.sculpt.multiresLevel++;
      editOps.subdivideMesh(obj.mesh, false);
    }
    this.emitAll();
  }

  runBake(mapType: BakeType): void {
    const obj = this.getActiveObject();
    if (!obj?.mesh) return;
    const res = bakeMeshMap(obj.mesh, mapType, 128);
    this.paint.bakedMaps[mapType] = res.dataUrl;
    this.lastBakeUrl = res.dataUrl;
    this.emitAll();
  }

  getActiveMaterial(): MaterialData | undefined {
    const obj = this.getActiveObject();
    const id = obj?.materialId ?? this.scene.activeMaterialId;
    return this.scene.materials.find((m) => m.id === id) ?? this.scene.materials[0];
  }

  updateMaterial(patch: Partial<MaterialData>, livePreviewOnly = false): void {
    const mat = this.getActiveMaterial();
    if (!mat) return;
    Object.assign(mat, patch);
    if (livePreviewOnly) this.emitViewport();
    else this.emitAll();
  }

  updateWorld(patch: Partial<WorldSettings>, livePreviewOnly = false): void {
    Object.assign(this.scene.world, patch);
    if (livePreviewOnly) this.emitViewport();
    else this.emitAll();
  }

  updateLight(patch: Partial<LightData>, livePreviewOnly = false): void {
    const obj = this.getActiveObject();
    if (!obj?.light) return;
    Object.assign(obj.light, patch);
    if (livePreviewOnly) this.emitViewport();
    else this.emitAll();
  }

  updateCameraData(patch: Partial<CameraData>, livePreviewOnly = false): void {
    const obj = this.getActiveObject();
    if (!obj?.camera) return;
    Object.assign(obj.camera, patch);
    if (patch.focalLength) {
      this.camera.fovDeg = clamp(2 * Math.atan(36 / (2 * patch.focalLength)) * (180 / Math.PI), 15, 110);
    }
    if (livePreviewOnly) this.emitViewport();
    else this.emitAll();
  }

  addShapeKey(): void {
    const obj = this.getActiveObject();
    if (!obj?.mesh) return;
    this.pushUndo();
    const offsets = obj.mesh.vertices.map((v) =>
      v.pos.z > 0 ? { x: 0, y: 0, z: 0.45 } : { x: 0, y: 0, z: 0 }
    );
    obj.shapeKeys.push({
      id: uid('sk'),
      name: `Key ${obj.shapeKeys.length + 1}`,
      value: 0.5,
      offsets,
    });
    this.emitAll();
  }

  updateShapeKeyValue(skId: string, val: number, livePreviewOnly = false): void {
    const sk = this.getActiveObject()?.shapeKeys.find((s) => s.id === skId);
    if (!sk) return;
    sk.value = val;
    if (livePreviewOnly) this.emitViewport();
    else this.emitAll();
  }

  generateRigifyOnScene(): void {
    this.pushUndo();
    const arm = createSceneObject('armature', 'Rigify_Human');
    arm.armature = generateRigifyHumanoidArmature();
    this.scene.objects.push(arm);
    this.scene.activeObjectId = arm.id;
    this.selectedBoneId = arm.armature.bones[0]?.id ?? null;
    this.emitAll();
  }

  nudgeIKHand(dz: number): void {
    const armObj = this.scene.objects.find((o) => o.type === 'armature' && o.armature);
    if (!armObj?.armature) return;
    const bone = armObj.armature.bones.find((b) => b.id === this.selectedBoneId) ?? armObj.armature.bones[armObj.armature.bones.length - 1];
    if (!bone) return;
    solveTwoBoneIK(armObj.armature, bone.name, {
      x: bone.tail.x,
      y: bone.tail.y,
      z: clamp(bone.tail.z + dz, 0.2, 2.2),
    });
    this.emitAll();
  }

  setCurrentFrame(frame: number, livePreviewOnly = false): void {
    this.scene.currentFrame = clamp(Math.round(frame), this.scene.startFrame, this.scene.endFrame);
    if (livePreviewOnly) this.emitViewport();
    else this.emitAll();
  }

  insertTransformKeyframe(): void {
    const obj = this.getActiveObject();
    if (!obj) return;
    this.pushUndo();
    const f = this.scene.currentFrame;
    insertKeyframe(obj, 'locX', f, obj.location.x);
    insertKeyframe(obj, 'locY', f, obj.location.y);
    insertKeyframe(obj, 'locZ', f, obj.location.z);
    insertKeyframe(obj, 'rotZ', f, obj.rotation.z);
    this.emitAll();
  }

  applyGaussianSmoothToFCurves(): void {
    const obj = this.getActiveObject();
    if (!obj) return;
    this.pushUndo();
    for (const k of Object.keys(obj.keyframes) as Array<keyof typeof obj.keyframes>) {
      const list = obj.keyframes[k];
      if (list) obj.keyframes[k] = gaussianSmoothKeyframes(list, 1.2);
    }
    this.emitAll();
  }

  togglePlayback(): void {
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this.lastTick = performance.now();
      const step = (now: number) => {
        if (!this.isPlaying) return;
        const dt = (now - this.lastTick) / 1000;
        const frameStep = dt * this.scene.fps;
        if (frameStep >= 1) {
          this.lastTick = now;
          let nf = this.scene.currentFrame + Math.floor(frameStep);
          if (nf > this.scene.endFrame) nf = this.scene.startFrame;
          this.scene.currentFrame = nf;
          this.emitViewport();
        }
        this.rafId = requestAnimationFrame(step);
      };
      this.rafId = requestAnimationFrame(step);
    } else if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.emitAll();
  }

  setPhysics(patch: Partial<PhysicsSettings>): void {
    const obj = this.getActiveObject();
    if (!obj) return;
    this.pushUndo();
    Object.assign(obj.physics, patch);
    this.emitAll();
  }

  // Node Graph interactive helpers
  addNodeToActiveGraph(kind: string, label: string): void {
    const g = this.scene.nodeGraphs.find((x) => x.id === this.scene.activeNodeGraphId);
    if (!g) return;
    this.pushUndo();
    const n = {
      id: uid('nd'),
      kind,
      label,
      x: 40 + (g.nodes.length % 4) * 110,
      y: 30 + Math.floor(g.nodes.length / 4) * 75,
      params: { amount: 0.1, scale: 4.0, enabled: true },
    };
    g.nodes.push(n);
    if (g.nodes.length >= 2) {
      const prev = g.nodes[g.nodes.length - 2];
      g.links.push({ id: uid('lnk'), fromNodeId: prev.id, fromSocket: 'Out', toNodeId: n.id, toSocket: 'In' });
    }
    this.selectedNodeId = n.id;
    this.emitAll();
  }

  moveNodeInGraph(nodeId: string, x: number, y: number): void {
    const g = this.scene.nodeGraphs.find((x) => x.id === this.scene.activeNodeGraphId);
    const n = g?.nodes.find((nd) => nd.id === nodeId);
    if (!n) return;
    n.x = x;
    n.y = y;
  }

  // VSE & Tracking
  addVseClip(kind: VseClip['kind']): void {
    this.pushUndo();
    const start = this.scene.currentFrame;
    this.scene.vse.clips.push({
      id: uid('vc'),
      name: `${kind.toUpperCase()} ${this.scene.vse.clips.length + 1}`,
      track: kind === 'audio' ? 3 : kind === 'text' ? 2 : 1,
      startFrame: start,
      durationFrames: 30,
      kind,
      color: kind === 'audio' ? '#10b981' : kind === 'text' ? '#f97316' : '#3b82f6',
      exposure: 0,
      scale: 1,
    });
    this.emitAll();
  }

  vseCutSelectedAtCurrentFrame(): void {
    const target = this.scene.vse.clips.find((c) => c.id === this.selectedClipId) ?? this.scene.vse.clips[0];
    if (!target) return;
    this.pushUndo();
    this.scene.vse.clips = vseBladeCut(this.scene.vse.clips, target.id, this.scene.currentFrame);
    this.emitAll();
  }

  vseRippleDeleteLast(): void {
    const target = this.scene.vse.clips.find((c) => c.id === this.selectedClipId) ?? this.scene.vse.clips[this.scene.vse.clips.length - 1];
    if (!target) return;
    this.pushUndo();
    this.scene.vse.clips = vseRippleDelete(this.scene.vse.clips, target.id);
    this.emitAll();
  }

  solveMotionTracking(): void {
    this.pushUndo();
    this.scene.vse.cameraSolved = true;
    this.scene.vse.markers.push({
      id: uid('tm'),
      name: `TrackPt_${this.scene.vse.markers.length + 1}`,
      x: 0.35 + (this.scene.vse.markers.length * 0.13) % 0.5,
      y: 0.45,
      mode: 'camera',
      stabilize: true,
    });
    this.emitAll();
  }

  addDriver(expr: string): void {
    const obj = this.getActiveObject();
    if (!obj) return;
    this.pushUndo();
    obj.drivers.rotZ = expr;
    this.emitAll();
  }

  saveProjectJson(): string {
    return JSON.stringify(this.scene, null, 2);
  }

  loadProjectJson(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as XL3DScene;
      if (!parsed || !Array.isArray(parsed.objects)) return false;
      this.pushUndo();
      this.scene = parsed;
      this.emitAll();
      return true;
    } catch {
      return false;
    }
  }

  resetScene(): void {
    this.pushUndo();
    this.scene = createDefaultXL3DScene();
    this.emitAll();
  }

  runMacroCommand(cmd: string): void {
    const c = cmd.trim();
    if (!c) return;
    if (c.includes('primitive_monkey_add')) this.addObject('mesh', 'monkey', 'Suzanne');
    else if (c.includes('primitive_cube_add')) this.addObject('mesh', 'cube', 'Cube');
    else if (c.includes('primitive_torus_add')) this.addObject('mesh', 'torus', 'Torus');
    else if (c.includes('subdivision_set')) this.addModifier('subsurf');
    else if (c.includes('reset_scene')) this.resetScene();
    else if (c.includes('rigify')) this.generateRigifyOnScene();
    this.consoleLog.push(`>>> ${c}`, `OK`);
    if (this.consoleLog.length > 16) this.consoleLog = this.consoleLog.slice(-16);
    this.emitAll();
  }
}

export const store = new XL3DStore();
