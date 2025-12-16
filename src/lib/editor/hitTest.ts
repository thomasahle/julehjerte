export type CurveHit = { fingerId: string; segmentIndex: number; t: number };

export function getClickCount(paperEvent: any): number {
  return typeof paperEvent?.event?.detail === "number" ? paperEvent.event.detail : 1;
}

export function curveHitFromPaperHit(hit: any): { segmentIndex: number | null; t: number | null } {
  const curveIdx =
    typeof hit?.location?.curve?.index === "number" ? hit.location.curve.index : null;
  const curveT = typeof hit?.location?.time === "number" ? hit.location.time : null;
  return { segmentIndex: curveIdx, t: curveT };
}

