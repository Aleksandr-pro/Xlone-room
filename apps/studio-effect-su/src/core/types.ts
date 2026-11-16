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
  | 'rgbSplit'
  | 'glitch'
  | 'motionTile'
  | 'dropShadow'
  | 'hueSat'
  | 'contrast'
  | 'vignette'
  | 'pixelate'
  | 'shake';

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

export type LayerType = 'text' | 'shape' | 'solid' | 'media' | 'adjustment' | 'null';

export type BlendMode =
  | 'normal'
  | 'add'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'difference'
  | 'lighten'
  | 'darken';

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
  src: string; // data URL or object URL
  fileName: string;
  naturalWidth: number;
  naturalHeight: number;
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
  startTime: number; // offset for media
  blendMode: BlendMode;
  parentId: string | null;
  transform: TransformProps;
  effects: EffectInstance[];
  textData?: TextLayerData;
  shapeData?: ShapeLayerData;
  solidData?: SolidLayerData;
  mediaData?: MediaLayerData;
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
