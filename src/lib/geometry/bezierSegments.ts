import type { Finger, Vec } from '$lib/types/heart';
import { vecLerp } from '$lib/geometry/vec';

export interface BezierSegment {
  p0: Vec;
  p1: Vec;
  p2: Vec;
  p3: Vec;
}

type InternalFinger = Finger & { __segments?: BezierSegment[] };

export function getInternalSegments(finger: Finger): BezierSegment[] | null {
  const internal = finger as InternalFinger;
  const segs = internal.__segments;
  if (
    Array.isArray(segs) &&
    segs.length &&
    !Object.prototype.propertyIsEnumerable.call(internal, '__segments')
  ) {
    return segs;
  }
  return null;
}

export function setInternalSegments<T extends Finger>(finger: T, segments: BezierSegment[]): T & { __segments: BezierSegment[] } {
  Object.defineProperty(finger as InternalFinger, '__segments', { value: segments, enumerable: false });
  return finger as T & { __segments: BezierSegment[] };
}

export function cloneSegments(segments: BezierSegment[]): BezierSegment[] {
  return segments.map((seg) => ({
    p0: { ...seg.p0 },
    p1: { ...seg.p1 },
    p2: { ...seg.p2 },
    p3: { ...seg.p3 }
  }));
}

export function fingerToSegments(finger: Finger): BezierSegment[] {
  const internalSegs = getInternalSegments(finger);
  if (internalSegs) return internalSegs;
  if (finger.pathData) return parsePathDataToSegments(finger.pathData);
  return [{ p0: finger.p0, p1: finger.p1, p2: finger.p2, p3: finger.p3 }];
}

export function segmentsToPathData(segments: BezierSegment[]): string {
  if (segments.length === 0) return '';
  let d = `M ${segments[0].p0.x} ${segments[0].p0.y}`;
  for (const seg of segments) {
    d += ` C ${seg.p1.x} ${seg.p1.y} ${seg.p2.x} ${seg.p2.y} ${seg.p3.x} ${seg.p3.y}`;
  }
  return d;
}

export function parsePathDataToSegments(pathData: string): BezierSegment[] {
  const segments: BezierSegment[] = [];
  const commands = pathData.match(/[MLCQAZ][^MLCQAZ]*/gi) || [];
  let currentX = 0;
  let currentY = 0;

  for (const cmd of commands) {
    const type = cmd[0]?.toUpperCase();
    const args = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    if (type === 'M') {
      currentX = args[0] ?? currentX;
      currentY = args[1] ?? currentY;
    } else if (type === 'C') {
      segments.push({
        p0: { x: currentX, y: currentY },
        p1: { x: args[0] ?? currentX, y: args[1] ?? currentY },
        p2: { x: args[2] ?? currentX, y: args[3] ?? currentY },
        p3: { x: args[4] ?? currentX, y: args[5] ?? currentY }
      });
      currentX = args[4] ?? currentX;
      currentY = args[5] ?? currentY;
    }
  }
  return segments;
}

export function updateFingerSegments(finger: Finger, segments: BezierSegment[]): Finger {
  // Ensure our internal scratch data doesn't leak into stored fingers/JSON.
  const base = { ...finger } as Finger & { __segments?: unknown };
  delete (base as unknown as { __segments?: unknown }).__segments;

  if (segments.length === 1) {
    return {
      ...base,
      p0: segments[0].p0,
      p1: segments[0].p1,
      p2: segments[0].p2,
      p3: segments[0].p3,
      pathData: undefined
    };
  }

  return {
    ...base,
    p0: segments[0]?.p0 ?? base.p0,
    p1: segments[0]?.p1 ?? base.p1,
    p2: segments[0]?.p2 ?? base.p2,
    p3: segments[segments.length - 1]?.p3 ?? base.p3,
    pathData: segmentsToPathData(segments)
  };
}

export function splitBezierAt(seg: BezierSegment, t: number): [BezierSegment, BezierSegment] {
  const p0 = seg.p0;
  const p1 = seg.p1;
  const p2 = seg.p2;
  const p3 = seg.p3;

  const p01 = vecLerp(p0, p1, t);
  const p12 = vecLerp(p1, p2, t);
  const p23 = vecLerp(p2, p3, t);

  const p012 = vecLerp(p01, p12, t);
  const p123 = vecLerp(p12, p23, t);

  const p0123 = vecLerp(p012, p123, t);

  return [
    { p0, p1: p01, p2: p012, p3: p0123 },
    { p0: p0123, p1: p123, p2: p23, p3 }
  ];
}

