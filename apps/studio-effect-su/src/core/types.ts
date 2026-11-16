export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easyEase' | 'hold' | 'bezier';

export interface BezierHandles {
  x1: number; // 0..1
  y1: number; // -1..2
  x2: number; // 0..1
  y2: number; // -1..2
}

export interface Keyframe {
  id: string;
  time: number; // seconds
  value: number;
  easing: EasingType;
  bezier?: BezierHandles;
}

export interface AnimatableProp {
  value: number;
  keyframes: Keyframe[];
  expression?: string;
}

export type TransformPropKey =
  | 'anchorX'
  | 'anchorY'
  | 'x'
  | 'y'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'opacity';

export interface TransformProps {
  anchorX: AnimatableProp;
  anchorY: AnimatableProp;
  x: AnimatableProp;
  y: AnimatableProp;
  scaleX: AnimatableProp;
  scaleY: AnimatableProp;
  rotation: AnimatableProp;
  opacity: AnimatableProp;
}

export type EffectType =
  | 'glow'
  | 'blur'
  | 'radialBlur'
  | 'directionalBlur'
  | 'rgbSplit'
  | 'glitch'
  | 'waveWarp'
  | 'motionTile'
  | 'shake'
  | 'dropShadow'
  | 'hueSat'
  | 'contrast'
  | 'tint'
  | 'exposure'
  | 'vignette'
  | 'pixelate';

export interface EffectParamMeta {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
}

export interface EffectDefinition {
  type: EffectType;
  name: string;
  category: string;
  description: string;
  params: EffectParamMeta[];
}

export interface EffectInstance {
  id: string;
  type: EffectType;
  name: string;
  enabled: boolean;
  params: Record<string, AnimatableProp>;
}

export type LayerType =
  | 'text'
  | 'shape'
  | 'solid'
  | 'media'
  | 'audio'
  | 'precomp'
  | 'adjustment'
  | 'null';

export type BlendMode =
  | 'normal'
  | 'add'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'difference'
  | 'lighten'
  | 'darken';

export type TrackMatteMode = 'none' | 'alpha' | 'alphaInverted';

export interface LayerMask {
  enabled: boolean;
  shape: 'rect' | 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  feather: number;
  inverted: boolean;
  opacity: number; // 0..100
}

export type ShapeKind = 'rect' | 'roundedRect' | 'ellipse' | 'star' | 'polygon';

export interface TextLayerData {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: '400' | '600' | '700' | '900';
  color: string;
  strokeColor: string;
  strokeWidth: number;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  revealProgress?: number; // 0..100%
}

export interface ShapeLayerData {
  kind: ShapeKind;
  width: number;
  height: number;
  cornerRadius: number;
  points: number;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
}

export interface SolidLayerData {
  width: number;
  height: number;
  color: string;
  gradientColor?: string;
  useGradient: boolean;
  gradientAngle: number;
}

export interface MediaLayerData {
  mediaType: 'image' | 'video';
  src: string;
  fileName: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface AudioLayerData {
  src: string;
  fileName: string;
  volume: number; // 0..100
  duration: number; // seconds
  waveform: number[]; // normalized 0..1 visual bars
  envelope: number[]; // 30 Hz amplitude values 0..100 for expressions / beat keyframes
}

export interface PrecompLayerData {
  compId: string;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  colorLabel: string;
  visible: boolean;
  solo: boolean;
  locked: boolean;
  expanded: boolean;
  inPoint: number; // seconds
  outPoint: number; // seconds
  startTime: number; // offset for media/precomp/audio
  blendMode: BlendMode;
  trackMatte?: TrackMatteMode;
  mask?: LayerMask;
  parentId: string | null;
  transform: TransformProps;
  effects: EffectInstance[];
  textData?: TextLayerData;
  textReveal?: AnimatableProp;
  shapeData?: ShapeLayerData;
  solidData?: SolidLayerData;
  mediaData?: MediaLayerData;
  audioData?: AudioLayerData;
  precompData?: PrecompLayerData;
}

export interface Composition {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number; // seconds
  backgroundColor: string;
  layers: Layer[];
}

export interface StudioProject {
  version: string;
  app: 'StudioEffect(SU)';
  name: string;
  activeCompId: string;
  compositions: Composition[];
}

export interface EvaluatedTransform {
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  scaleX: number; // percentage (100 = 1.0)
  scaleY: number;
  rotation: number; // degrees
  opacity: number; // 0..100
}

export interface WorldMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  opacity: number;
}

export type ActiveTab = 'timeline' | 'inspector' | 'effects' | 'graph';
