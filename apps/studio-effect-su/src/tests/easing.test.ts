import { describe, expect, it } from 'vitest';
import { applyEasing, cubicBezier } from '../core/easing';

describe('easing & cubicBezier', () => {
  it('evaluates boundaries at 0 and 1', () => {
    expect(cubicBezier(0, { x1: 0.33, y1: 0, x2: 0.25, y2: 1 })).toBe(0);
    expect(cubicBezier(1, { x1: 0.33, y1: 0, x2: 0.25, y2: 1 })).toBe(1);
  });

  it('evaluates linear easing identically', () => {
    expect(applyEasing(0.25, 'linear')).toBe(0.25);
    expect(applyEasing(0.75, 'linear')).toBe(0.75);
  });

  it('evaluates hold easing as step function', () => {
    expect(applyEasing(0, 'hold')).toBe(0);
    expect(applyEasing(0.99, 'hold')).toBe(0);
    expect(applyEasing(1, 'hold')).toBe(1);
  });

  it('evaluates easyEase smoothly in (0,1)', () => {
    const mid = applyEasing(0.5, 'easyEase');
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.8);
  });
});
