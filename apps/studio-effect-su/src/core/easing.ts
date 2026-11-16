import type { BezierHandles, EasingType } from './types';

export const EASING_PRESETS: Record<Exclude<EasingType, 'hold' | 'bezier'>, BezierHandles> = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  easeIn: { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  easeOut: { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  easyEase: { x1: 0.33, y1: 0, x2: 0.25, y2: 1 }, // Classic AE F9 feel
};

function sampleCubicBezier(t: number, p1: number, p2: number): number {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

function sampleCubicBezierDerivative(t: number, p1: number, p2: number): number {
  const u = 1 - t;
  return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/**
 * Solves cubic-bezier(x1, y1, x2, y2) for normalized progress x in [0, 1].
 */
export function cubicBezier(x: number, handles: BezierHandles): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const { x1, y1, x2, y2 } = handles;
  if (x1 === y1 && x2 === y2) return x;

  // Newton-Raphson first, fallback to bisection
  let t = x;
  for (let i = 0; i < 8; i++) {
    const currentX = sampleCubicBezier(t, x1, x2) - x;
    if (Math.abs(currentX) < 1e-6) {
      return sampleCubicBezier(t, y1, y2);
    }
    const dx = sampleCubicBezierDerivative(t, x1, x2);
    if (Math.abs(dx) < 1e-6) break;
    t -= currentX / dx;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
  }

  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 16; i++) {
    const currentX = sampleCubicBezier(t, x1, x2);
    if (Math.abs(currentX - x) < 1e-6) break;
    if (x > currentX) lo = t;
    else hi = t;
    t = 0.5 * (lo + hi);
  }

  return sampleCubicBezier(t, y1, y2);
}

export function applyEasing(progress: number, easing: EasingType, custom?: BezierHandles): number {
  if (easing === 'hold') return progress >= 1 ? 1 : 0;
  if (easing === 'linear') return progress;
  if (easing === 'bezier' && custom) {
    return cubicBezier(progress, custom);
  }
  const preset = EASING_PRESETS[easing === 'bezier' ? 'easyEase' : easing];
  return cubicBezier(progress, preset);
}

export function getEasingHandles(easing: EasingType, custom?: BezierHandles): BezierHandles {
  if (easing === 'bezier' && custom) return custom;
  if (easing === 'hold') return { x1: 1, y1: 0, x2: 1, y2: 0 };
  return EASING_PRESETS[easing === 'bezier' ? 'easyEase' : easing];
}
