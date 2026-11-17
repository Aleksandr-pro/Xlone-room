import { getEffectDef } from '../engine/effectCatalog';
import type {
  AnimatableProp,
  Composition,
  EasingType,
  EffectInstance,
  EffectType,
  Keyframe,
  Layer,
  LayerType,
  ShapeKind,
  TransformProps,
} from './types';

let idCounter = 1;

export function uid(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function prop(value: number, keyframes: Keyframe[] = [], expression = ''): AnimatableProp {
  return {
    value,
    keyframes,
    expression: expression || undefined,
  };
}

export function kf(
  time: number,
  value: number,
  easing: EasingType = 'easyEase'
): Keyframe {
  return {
    id: uid('kf'),
    time,
    value,
    easing,
  };
}

export function createDefaultTransform(cx: number, cy: number): TransformProps {
  return {
    anchorX: prop(0),
    anchorY: prop(0),
    x: prop(cx),
    y: prop(cy),
    z: prop(0),
    scaleX: prop(100),
    scaleY: prop(100),
    rotation: prop(0),
    rotateX: prop(0),
    rotateY: prop(0),
    opacity: prop(100),
  };
}

export const LAYER_COLORS: Record<LayerType, string> = {
  text: '#ef4444',
  shape: '#22c55e',
  solid: '#d946ef',
  media: '#38bdf8',
  audio: '#10b981',
  precomp: '#6366f1',
  adjustment: '#a855f7',
  null: '#f59e0b',
};

export function createLayer(
  type: LayerType,
  comp: Pick<Composition, 'width' | 'height' | 'duration'>,
  name?: string
): Layer {
  const cx = Math.round(comp.width / 2);
  const cy = Math.round(comp.height / 2);

  const base: Layer = {
    id: uid('layer'),
    name: name ?? defaultLayerName(type),
    type,
    colorLabel: LAYER_COLORS[type],
    visible: true,
    solo: false,
    locked: false,
    expanded: false,
    is3D: false,
    speed: 1,
    inPoint: 0,
    outPoint: comp.duration,
    startTime: 0,
    blendMode: 'normal',
    parentId: null,
    transform: createDefaultTransform(cx, cy),
    effects: [],
  };

  if (type === 'text') {
    base.textData = {
      text: 'StudioEffect(SU)',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: Math.round(Math.min(comp.width, comp.height) * 0.085),
      fontWeight: '900',
      color: '#ffffff',
      strokeColor: '#4c8bf5',
      strokeWidth: 0,
      align: 'center',
      letterSpacing: 1,
      lineHeight: 1.15,
      revealProgress: 100,
    };
  } else if (type === 'shape') {
    const size = Math.round(Math.min(comp.width, comp.height) * 0.28);
    base.shapeData = {
      kind: 'roundedRect' as ShapeKind,
      width: size,
      height: size,
      cornerRadius: 36,
      points: 5,
      fillColor: '#4c8bf5',
      fillOpacity: 100,
      strokeColor: '#ffffff',
      strokeWidth: 6,
    };
  } else if (type === 'solid') {
    base.solidData = {
      width: comp.width,
      height: comp.height,
      color: '#111827',
      gradientColor: '#312e81',
      useGradient: true,
      gradientAngle: 135,
    };
  }

  return base;
}

function defaultLayerName(type: LayerType): string {
  switch (type) {
    case 'text':
      return 'Text Layer';
    case 'shape':
      return 'Shape Layer';
    case 'solid':
      return 'BG Solid';
    case 'media':
      return 'Media Layer';
    case 'audio':
      return 'Audio Track';
    case 'precomp':
      return 'Pre-Comp';
    case 'adjustment':
      return 'Adjustment Layer';
    case 'null':
      return 'Null Controller';
  }
}

export function createEffect(type: EffectType): EffectInstance {
  const def = getEffectDef(type);
  const params: Record<string, AnimatableProp> = {};
  for (const p of def.params) {
    params[p.key] = prop(p.defaultValue);
  }
  return {
    id: uid('fx'),
    type,
    name: def.name,
    enabled: true,
    params,
  };
}

export function createComposition(
  name = 'Comp 1',
  width = 1080,
  height = 1920,
  fps = 30,
  duration = 5
): Composition {
  return {
    id: uid('comp'),
    name,
    width,
    height,
    fps,
    duration,
    backgroundColor: '#09090d',
    layers: [],
  };
}
