export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// 1. Все 12+ типов объектов Blender 5.x
export type ObjectType =
  | 'mesh'
  | 'curve'
  | 'surface'
  | 'metaball'
  | 'text'
  | 'lattice'
  | 'empty'
  | 'armature'
  | 'volume'
  | 'pointcloud'
  | 'greasepencil'
  | 'light'
  | 'camera';

export type InteractionMode = 'object' | 'edit' | 'sculpt' | 'paint' | 'pose' | 'grease';
export type EditSelectMode = 'vertex' | 'edge' | 'face';
export type TransformOrientation = 'global' | 'local' | 'normal' | 'cursor';
export type SnapTarget = 'none' | 'increment' | 'vertex' | 'edge' | 'face' | 'volume';
export type ToolGizmo = 'select' | 'move' | 'rotate' | 'scale' | 'cursor';

export interface Vertex {
  id: string;
  pos: Vec3;
  normal: Vec3;
  uv: Vec2;
  color: [number, number, number]; // 0..1 RGB (Vertex Paint / сохраняется при Voxel Remesh 5.2)
  mask: number; // 0..1 Sculpt mask
  weights: Record<string, number>; // Weight Paint: boneId -> 0..1
  selected: boolean;
  hidden?: boolean;
}

export interface Edge {
  a: number; // vertex index
  b: number; // vertex index
  seam?: boolean;
  sharp?: boolean;
  crease?: number;
  selected?: boolean;
}

export interface Face {
  verts: number[]; // indices in MeshData.vertices
  uvs?: Vec2[];
  normal: Vec3;
  smooth: boolean;
  materialIndex: number;
  faceSet: number;
  selected: boolean;
  hidden?: boolean;
}

export interface MeshData {
  vertices: Vertex[];
  edges: Edge[];
  faces: Face[];
  autoSmoothAngle: number; // degrees, node-based smooth in 5.x
  customSplitNormals: boolean;
  udimTile: number; // 1001..1004
  uvSyncSelection: boolean;
}

export interface CurvePoint {
  pos: Vec3;
  handleLeft: Vec3;
  handleRight: Vec3;
  radius: number;
  tilt: number;
  selected?: boolean;
}

export interface CurveData {
  kind: 'bezier' | 'nurbs';
  closed: boolean;
  resolution: number;
  bevelDepth: number;
  extrude: number;
  points: CurvePoint[];
}

export interface SurfaceData {
  uCount: number;
  vCount: number;
  points: Vec3[];
}

export interface MetaballData {
  elements: Array<{ pos: Vec3; radius: number; stiffness: number }>;
  threshold: number;
  resolution: number;
}

export interface Text3DData {
  text: string;
  size: number;
  extrude: number;
  bevelDepth: number;
  align: 'left' | 'center' | 'right';
}

export interface LatticeData {
  pointsU: number;
  pointsV: number;
  pointsW: number;
  deformStrength: number;
  offsets: Vec3[];
}

export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  collection: string; // Bone Collections
  head: Vec3;
  tail: Vec3;
  poseRot: Vec3; // Euler deg
  poseLoc: Vec3;
  ikChainLength: number;
  ikTargetId?: string;
  constraints: Array<{ type: 'ik' | 'copyRot' | 'trackTo' | 'limitRot'; targetId?: string; influence: number }>;
}

export interface ArmatureData {
  bones: Bone[];
  rigifyTemplate: 'human' | 'quadruped' | 'simple';
  autoRigged: boolean;
}

export interface VolumeData {
  density: number;
  absorption: number;
  emission: number;
  anisotropy: number;
  color: string;
  resolution: number;
  vdbSource?: string;
}

export interface PointCloudData {
  points: Array<{ pos: Vec3; color: string; radius: number; opacity: number }>;
  pointType: 'sphere' | 'disc' | 'gaussianSplat'; // 5.3 Set Point Cloud Type / SPZ
}

export interface GreaseStroke {
  id: string;
  points: Array<{ pos: Vec3; pressure: number }>;
  color: string;
  fillColor?: string;
  filled: boolean;
  thickness: number;
}

export interface GreaseLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  frames: Record<number, GreaseStroke[]>;
}

export interface GreasePencilData {
  layers: GreaseLayer[];
  activeLayerId: string;
  onionSkin: boolean;
  onionBefore: number;
  onionAfter: number;
  fillAlgorithm: 'exact52' | 'classic'; // Blender 5.2 Fill
  effects: Array<{ type: 'blur' | 'glow' | 'pixelate'; intensity: number; enabled: boolean }>;
}

export type LightKind = 'point' | 'sun' | 'spot' | 'area' | 'mesh';
export interface LightData {
  kind: LightKind;
  color: string;
  power: number; // Watts / Lux
  radius: number;
  spotAngle: number;
  castShadow: boolean;
  iesProfile?: string;
}

export type CameraProjection =
  | 'perspective'
  | 'orthographic'
  | 'panoramic_equirect'
  | 'panoramic_fisheye'
  | 'panoramic_mirror'
  | 'stereo_3d';

export interface CameraData {
  projection: CameraProjection;
  focalLength: number; // mm
  sensorWidth: number;
  dofEnabled: boolean;
  dofDistance: number;
  fStop: number;
  clipStart: number;
  clipEnd: number;
}

// 5. Модификаторы (20+)
export type ModifierType =
  | 'subsurf'
  | 'mirror'
  | 'array'
  | 'boolean'
  | 'bevel'
  | 'solidify'
  | 'decimate'
  | 'remesh'
  | 'weld'
  | 'wireframe'
  | 'displace'
  | 'shrinkwrap'
  | 'curve'
  | 'lattice'
  | 'armature'
  | 'cast'
  | 'screw'
  | 'skin'
  | 'weightedNormal'
  | 'geometryNodes';

export interface ModifierInstance {
  id: string;
  type: ModifierType;
  name: string;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
  nodeTreeId?: string; // for Geometry Nodes modifier
}

// 4, 7, 11. Универсальная Нодовая Система (Shader, Geometry Nodes, Compositor, Texture)
export type NodeGraphKind = 'shader' | 'geometry' | 'compositor' | 'texture';

export interface NodeInstance {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  params: Record<string, number | string | boolean>;
}

export interface NodeLink {
  id: string;
  fromNodeId: string;
  fromSocket: string;
  toNodeId: string;
  toSocket: string;
}

export interface NodeGraph {
  id: string;
  name: string;
  graphKind: NodeGraphKind;
  nodes: NodeInstance[];
  links: NodeLink[];
}

// 4. Материалы
export type ShaderModel = 'principled' | 'emission' | 'glass' | 'volume' | 'toon' | 'hair';
export type ProcTextureType = 'none' | 'noise' | 'voronoi' | 'musgrave' | 'wave' | 'gradient' | 'brick' | 'checker' | 'magic';

export interface MaterialData {
  id: string;
  name: string;
  shaderModel: ShaderModel;
  baseColor: string;
  metallic: number; // 0..1
  roughness: number; // 0..1
  ior: number; // 1.0..2.5
  transmission: number; // 0..1
  dispersion: number; // 0..1 (Blender 5.3 Glass Dispersion!)
  anisotropy: number; // 0..1 (Blender 5.3 Anisotropic Glass Roughness!)
  subsurface: number; // 0..1
  coat: number; // 0..1
  sheen: number; // 0..1
  thinFilm: number; // 0..1
  thinWall: boolean; // Blender 5.2 Principled Thin Wall!
  emissionColor: string;
  emissionStrength: number;
  procTexture: ProcTextureType;
  procScale: number;
  bumpStrength: number;
  shaderToRgb: boolean; // EEVEE Toon Shader to RGB
  oslEnabled: boolean; // Cycles CPU OSL flag
  paintCanvasDataUrl?: string; // Texture Paint canvas
  nodeGraphId?: string;
}

// 2. Скульптинг
export type SculptBrush =
  | 'draw'
  | 'clay'
  | 'grab'
  | 'smooth'
  | 'pinch'
  | 'inflate'
  | 'crease'
  | 'snakeHook'
  | 'cloth'
  | 'boundary'
  | 'pose'
  | 'elasticDeform'
  | 'multiplaneScrape'
  | 'sceneProject'; // Blender 5.2

export interface SculptSettings {
  brush: SculptBrush;
  radius: number; // 0.1..2.0 world units
  strength: number; // 0..1
  invert: boolean;
  symX: boolean;
  symY: boolean;
  symZ: boolean;
  radialSymmetry: number; // 1..8
  dyntopo: boolean;
  voxelSize: number; // 0.05..0.5
  multiresLevel: number; // 0..3
  activeFaceSet: number;
}

// 3. Текстурирование / Покраска и Запекание
export type PaintMode = 'texture' | 'vertex' | 'weight';
export type TextureBrushType = 'draw' | 'soften' | 'smear' | 'clone' | 'mask' | 'projCamera';
export type BakeType = 'combined' | 'diffuse' | 'normal' | 'ao' | 'roughness' | 'position' | 'uv';

export interface PaintSettings {
  mode: PaintMode;
  brush: TextureBrushType;
  color: string;
  radius: number;
  strength: number;
  activeBoneId: string;
  bakedMaps: Partial<Record<BakeType, string>>; // dataURL
}

// 8. Анимация и Shape Keys
export type AnimPropPath = 'locX' | 'locY' | 'locZ' | 'rotX' | 'rotY' | 'rotZ' | 'scaleX' | 'scaleY' | 'scaleZ';
export type FCurveInterp = 'linear' | 'bezier' | 'constant';

export interface AnimKeyframe {
  id: string;
  frame: number;
  value: number;
  interp: FCurveInterp;
}

export interface ShapeKey {
  id: string;
  name: string;
  value: number; // 0..1
  offsets: Vec3[];
}

// 9. Физика и Симуляции
export type PhysicsType = 'none' | 'rigidBody' | 'softBody' | 'cloth' | 'collision' | 'forceField' | 'fluid' | 'particles' | 'hair';

export interface PhysicsSettings {
  type: PhysicsType;
  mass: number;
  gravityScale: number;
  bounciness: number;
  friction: number;
  stiffness: number;
  windForce: number;
  fluidRole: 'domain' | 'flow' | 'effector';
  fluidKind: 'liquid' | 'smoke' | 'fire';
  particleCount: number;
  hairLength: number;
}

export interface SceneObject {
  id: string;
  name: string;
  type: ObjectType;
  collection: string;
  parentId: string | null;
  visible: boolean;
  renderable: boolean;
  locked: boolean;
  location: Vec3;
  rotation: Vec3; // degrees
  scale: Vec3;
  materialId: string;
  modifiers: ModifierInstance[];
  keyframes: Partial<Record<AnimPropPath, AnimKeyframe[]>>;
  drivers: Partial<Record<AnimPropPath, string>>; // expression driver e.g. "sin(frame * 0.1)"
  shapeKeys: ShapeKey[];
  physics: PhysicsSettings;
  mesh?: MeshData;
  curve?: CurveData;
  surface?: SurfaceData;
  metaball?: MetaballData;
  text3d?: Text3DData;
  lattice?: LatticeData;
  armature?: ArmatureData;
  volume?: VolumeData;
  pointCloud?: PointCloudData;
  greasePencil?: GreasePencilData;
  light?: LightData;
  camera?: CameraData;
}

// 5. Рендер и Color Management
export type RenderEngine = 'workbench' | 'eevee' | 'cycles';
export type WorkbenchShading = 'solid' | 'wireframe' | 'matcap' | 'xray' | 'cavity' | 'outline';
export type ColorTransform = 'agx' | 'filmic' | 'standard' | 'aces' | 'wideGamut';
export type CameraInputSpace = 'sRGB' | 'AppleLog' | 'ARRI_LogC4' | 'Blackmagic' | 'CanonLog2' | 'SonySLog3'; // 5.2

export interface RenderSettings {
  engine: RenderEngine;
  workbenchShading: WorkbenchShading;
  freestyle: boolean;
  freestyleThickness: number;
  cyclesSamples: number;
  adaptiveSampling: boolean;
  denoise: boolean;
  lightTree: boolean;
  causticsMNEE: boolean;
  shadowCatcher: boolean;
  cryptomatte: boolean;
  aovPass: 'combined' | 'normal' | 'depth' | 'ao' | 'cryptomatte';
  eeveeRaytracing: boolean;
  eeveeGI: boolean;
  eeveeBloom: boolean;
  eeveeDof: boolean;
  textureCache52: boolean; // 5.2 Texture Cache
  resolutionX: number;
  resolutionY: number;
  colorTransform: ColorTransform;
  lookPreset: 'none' | 'highContrast' | 'punchy' | 'cinematic';
  inputSpace: CameraInputSpace;
  exposure: number;
}

// 6. Окружение
export interface WorldSettings {
  mode: 'sky53' | 'solid' | 'hdri';
  skyColor: string;
  horizonColor: string;
  sunElevation: number; // degrees (5.3 working sun disk in Sky Texture)
  sunAzimuth: number;
  fogDensity: number; // Atmosphere volume fog
  fogColor: string;
  hdriStrength: number;
}

// 12. VSE & Motion Tracking
export interface VseClip {
  id: string;
  name: string;
  track: number;
  startFrame: number;
  durationFrames: number;
  kind: 'video' | 'image' | 'audio' | 'text' | 'transition';
  color: string;
  exposure: number;
  scale: number;
  textContent?: string;
}

export interface TrackingMarker {
  id: string;
  name: string;
  x: number; // 0..1
  y: number; // 0..1
  mode: 'camera' | 'object' | 'planar';
  stabilize: boolean;
}

export interface VseState {
  clips: VseClip[];
  rippleEdit: boolean; // Blender 5.3 Ripple Edit
  blade20: boolean; // Blender 5.3 Blade 2.0
  proxies: boolean;
  markers: TrackingMarker[];
  cameraSolved: boolean;
}

export type WorkspaceTab = 'outliner' | 'tools' | 'properties' | 'nodes' | 'animation' | 'editors';
export type SubEditorKind = 'uv' | 'vse' | 'spreadsheet' | 'assets' | 'preferences';

export interface XL3DScene {
  version: string;
  app: 'XL3D';
  name: string;
  objects: SceneObject[];
  materials: MaterialData[];
  nodeGraphs: NodeGraph[];
  activeObjectId: string | null;
  activeMaterialId: string;
  activeNodeGraphId: string;
  cursor3D: Vec3;
  currentFrame: number;
  startFrame: number;
  endFrame: number;
  fps: number;
  render: RenderSettings;
  world: WorldSettings;
  vse: VseState;
}
