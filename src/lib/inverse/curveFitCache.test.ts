import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BezierSegment } from '$lib/geometry/bezierSegments';
import { splitBezierAt } from '$lib/geometry/bezierSegments';
import * as fitting from './simplifyCurves';
import { createTranslatedCurveFitter } from './curveFitCache';

const curve: BezierSegment = {
  p0: { x: 0, y: 0 }, p1: { x: 40, y: 5 },
  p2: { x: 60, y: 95 }, p3: { x: 100, y: 100 }
};
const source = () => splitBezierAt(structuredClone(curve), .5);
function translate(segments: BezierSegment[], x: number, y: number): BezierSegment[] {
  const move = (p: BezierSegment['p0']) => ({ x: p.x + x, y: p.y + y });
  return segments.map(s => ({ p0: move(s.p0), p1: move(s.p1), p2: move(s.p2), p3: move(s.p3) }));
}
afterEach(() => vi.restoreAllMocks());

describe('translated curve fitting cache', () => {
  it('reuses a translated outline while retaining its endpoints and fitting accuracy', () => {
    const spy = vi.spyOn(fitting, 'simplifyCubicChain'), fit = createTranslatedCurveFitter();
    const first = fit(source(), .05), shifted = translate(source(), 17.25, -31.5);
    const result = fit(shifted, .05);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(translate(first, 17.25, -31.5));
    expect(result[0].p0).toEqual(shifted[0].p0);
    expect(result.at(-1)!.p3).toEqual(shifted.at(-1)!.p3);
    expect(fitting.chainDeviation(result, fitting.sampleChain(shifted, .1))).toBeLessThan(.05);
  });

  it('isolates cached controls from later edits to returned fits and source points', () => {
    const fit = createTranslatedCurveFitter(), input = source();
    const first = fit(input, .05), expected = translate(first, 20, 15);
    first[0].p1.x += 50;
    input[0].p0.x -= 40;
    const second = fit(translate(source(), 20, 15), .05);
    expect(second).toEqual(expected);
    second[0].p2.y -= 70;
    expect(fit(translate(source(), 20, 15), .05)).toEqual(expected);
  });

  it('does not reuse a nearby control polygon or a different tolerance', () => {
    const spy = vi.spyOn(fitting, 'simplifyCubicChain'), fit = createTranslatedCurveFitter();
    fit(source(), .05);
    const changed = source();
    // Same rounded key, but outside the stricter roundoff comparison.
    changed[0].p1.x += 2e-10;
    fit(changed, .05);
    fit(source(), .025);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('keeps independent conversions isolated and preserves unsimplified curves', () => {
    const spy = vi.spyOn(fitting, 'simplifyCubicChain');
    createTranslatedCurveFitter()(source(), .05);
    const second = createTranslatedCurveFitter();
    second(source(), .05);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(second(source(), 0)).toEqual(source());
  });
});
