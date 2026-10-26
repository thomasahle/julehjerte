import type { BezierSegment } from '$lib/geometry/bezierSegments';
import { FIT_TOLERANCE, simplifyCubicChain } from './simplifyCurves';

type Point = BezierSegment['p0'];
type Entry = { source: number[]; origin: Point; result: BezierSegment[] };
const MAX_ENTRIES = 256;

const clone = (segments: BezierSegment[]): BezierSegment[] => segments.map(s => ({
  p0: { ...s.p0 }, p1: { ...s.p1 }, p2: { ...s.p2 }, p3: { ...s.p3 }
}));

/** Candidate layouts often reuse exactly the same outline runs. Retain their
 * fits for one generation request, with no coordinate quantisation or movement,
 * the `size` most recently used. Include the tolerance and clone both on
 * storage and reuse: conversion snaps endpoints and can edit handles after
 * fitting. */
export function createExactCurveFitter(size = MAX_ENTRIES): typeof simplifyCubicChain {
  const entries = new Map<string, BezierSegment[]>();
  return (segments, tolerance = FIT_TOLERANCE) => {
    if (segments.length <= 1 || !(tolerance > 0)) return simplifyCubicChain(segments, tolerance);
    const key = tolerance + ':' + JSON.stringify(segments);
    const previous = entries.get(key);
    if (previous) {
      entries.delete(key);
      entries.set(key, previous);
      return clone(previous);
    }
    const result = simplifyCubicChain(segments, tolerance);
    entries.set(key, clone(result));
    if (entries.size > size) entries.delete(entries.keys().next().value!);
    return result;
  };
}

/** Repeating letters reuse outline sections at different positions. Fit each
 * section once per conversion, then translate its fitted controls. Matching is
 * limited to roundoff in the 0–100 coordinate frame; tolerance and every input
 * control point participate. The caller still validates the complete design.
 * A bounded, local cache avoids retaining artwork across requests. */
export function createTranslatedCurveFitter(fit = simplifyCubicChain): typeof simplifyCubicChain {
  const entries = new Map<string, Entry>();
  return (segments, tolerance = FIT_TOLERANCE) => {
    if (segments.length <= 1 || !(tolerance > 0)) return fit(segments, tolerance);
    const origin = segments[0].p0;
    const source = segments.flatMap(s => [s.p0, s.p1, s.p2, s.p3]
      .flatMap(p => [p.x - origin.x, p.y - origin.y]));
    // The rounded key finds candidates. The tighter comparison below decides
    // reuse, so neighbouring curves in the same bucket cannot share a fit.
    const key = tolerance + ':' + source.map(v => Math.round(v * 1e9) / 1e9).join(',');
    const previous = entries.get(key);
    if (previous && source.length === previous.source.length &&
      source.every((v, i) => Math.abs(v - previous.source[i]) < 1e-10)) {
      const move = (p: Point): Point => ({
        x: p.x + origin.x - previous.origin.x,
        y: p.y + origin.y - previous.origin.y
      });
      const result = previous.result.map(s => ({
        p0: move(s.p0), p1: move(s.p1), p2: move(s.p2), p3: move(s.p3)
      }));
      // Shared cuts and neighbouring runs must meet the original endpoints
      // exactly, including their last few floating-point bits.
      result[0].p0 = { ...segments[0].p0 };
      result[result.length - 1].p3 = { ...segments[segments.length - 1].p3 };
      return result;
    }
    const result = fit(segments, tolerance);
    // Conversion may snap endpoints or enforce symmetry on the returned fit.
    // Keep an independent copy so those edits cannot affect a later reuse.
    entries.set(key, { source, origin: { ...origin }, result: clone(result) });
    if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    return result;
  };
}
