import { describe, expect, it } from 'vitest';
import { evaluateExpression } from '../core/expressions';

const baseCtx = {
  time: 2,
  index: 3,
  value: 100,
  fps: 30,
  duration: 5,
  seed: 42,
};

describe('AE expressions engine', () => {
  it('evaluates arithmetic and built-in variables', () => {
    expect(evaluateExpression('time * 90 + index', baseCtx).value).toBe(183);
    expect(evaluateExpression('value + 50', baseCtx).value).toBe(150);
  });

  it('evaluates Math functions and clamp/linear', () => {
    expect(evaluateExpression('Math.round(Math.sin(0) * 100)', baseCtx).value).toBe(0);
    expect(evaluateExpression('clamp(150, 0, 100)', baseCtx).value).toBe(100);
    expect(evaluateExpression('linear(2, 0, 4, 10, 50)', baseCtx).value).toBe(30);
  });

  it('evaluates deterministic wiggle around base value', () => {
    const a = evaluateExpression('wiggle(4, 25)', baseCtx).value;
    const b = evaluateExpression('wiggle(4, 25)', baseCtx).value;
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(75);
    expect(a).toBeLessThanOrEqual(125);
  });

  it('evaluates loopOut cycle and pingpong', () => {
    const evalAtTime = (t: number) => t * 100;
    const cycleRes = evaluateExpression('loopOut("cycle")', {
      ...baseCtx,
      time: 2.5,
      firstKeyframeTime: 0,
      lastKeyframeTime: 1,
      evalAtTime,
    });
    expect(cycleRes.value).toBeCloseTo(50, 5);

    const pingRes = evaluateExpression('loopOut("pingpong")', {
      ...baseCtx,
      time: 1.25,
      firstKeyframeTime: 0,
      lastKeyframeTime: 1,
      evalAtTime,
    });
    expect(pingRes.value).toBeCloseTo(75, 5);
  });

  it('returns safe fallback and error on invalid syntax', () => {
    const res = evaluateExpression('unknownVar + 5', baseCtx);
    expect(res.value).toBe(100);
    expect(res.error).toBeDefined();
  });
});
