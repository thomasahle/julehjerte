import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BezierSegment } from '$lib/geometry/bezierSegments';
import { splitBezierAt } from '$lib/geometry/bezierSegments';
import * as fitting from './simplifyCurves';
import { createExactCurveFitter, createTranslatedCurveFitter } from './curveFitCache';

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

describe('exact curve fitting cache', () => {
  it('reuses identical runs without exposing cached controls to converter edits', () => {
    const spy = vi.spyOn(fitting, 'simplifyCubicChain'), fit = createExactCurveFitter();
    const first = fit(source(), .05), expected = structuredClone(first);
    first[0].p1.x += 17;
    const second = fit(source(), .05);
    expect(second).toEqual(expected);
    second[0].p0.y = 35;
    expect(fit(source(), .05)).toEqual(expected);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refits changed controls or tolerances and does not share across requests', () => {
    const spy = vi.spyOn(fitting, 'simplifyCubicChain'), fit = createExactCurveFitter();
    const input = source();
    fit(input, .05);
    input[0].p1.x += 1e-11;
    fit(input, .05);
    fit(input, .1);
    createExactCurveFitter()(input, .1);
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('keeps the runs most recently used, however long ago they were first fitted', () => {
    const spy = vi.spyOn(fitting, 'simplifyCubicChain'), fit = createExactCurveFitter(2);
    const [a, b, c] = [0, 1, 2].map(x => translate(source(), x, 0));
    for (const run of [a, b, a, c, a]) fit(run, .05);
    expect(spy).toHaveBeenCalledTimes(3);
    fit(b, .05);
    expect(spy).toHaveBeenCalledTimes(4);
  });
});

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
    // At zero tolerance only the pieces of one cubic are joined, exactly.
    expect(second(source(), 0)).toEqual(fitting.joinSplitCubics(source()));
  });
});
