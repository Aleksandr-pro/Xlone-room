import { describe, expect, it } from 'vitest';
import { createComposition, createLayer, kf, prop } from '../core/factories';
import {
  evaluateKeyframes,
  getLayerWorldMatrix,
  invertMatrix,
  transformPoint,
} from '../core/interpolation';

describe('keyframe interpolation & parenting', () => {
  it('clamps before first and after last keyframe', () => {
    const p = prop(0, [kf(1, 10, 'linear'), kf(3, 50, 'linear')]);
    expect(evaluateKeyframes(p, 0)).toBe(10);
    expect(evaluateKeyframes(p, 2)).toBe(30);
    expect(evaluateKeyframes(p, 5)).toBe(50);
  });

  it('computes parent-child world transforms and inverse accurately', () => {
    const comp = createComposition('Test', 1000, 1000, 30, 5);
    const parent = createLayer('null', comp, 'Parent');
    parent.transform.x = prop(500);
    parent.transform.y = prop(500);
    parent.transform.rotation = prop(90);

    const child = createLayer('shape', comp, 'Child');
    child.parentId = parent.id;
    child.transform.x = prop(100);
    child.transform.y = prop(0);

    comp.layers = [child, parent];

    const world = getLayerWorldMatrix(child, comp, 0);
    const pt = transformPoint(world, 0, 0);
    expect(pt.x).toBeCloseTo(500, 4);
    expect(pt.y).toBeCloseTo(600, 4);

    const inv = invertMatrix(world)!;
    const back = transformPoint(inv, pt.x, pt.y);
    expect(back.x).toBeCloseTo(0, 4);
    expect(back.y).toBeCloseTo(0, 4);
  });
});
