import type { Finger, NodeType } from "$lib/types/heart";
import {
  cloneSegments,
  fingerToSegments,
  splitBezierAt,
  updateFingerSegments,
} from "$lib/geometry/bezierSegments";

function shiftNodeTypesOnInsert(
  nodeTypes: Record<string, NodeType> | undefined,
  insertedAnchorIdx: number,
) {
  const src = nodeTypes ?? {};
  const next: Record<string, NodeType> = {};
  for (const [k, v] of Object.entries(src)) {
    const idx = Number(k);
    if (!Number.isFinite(idx)) continue;
    const shifted = idx >= insertedAnchorIdx ? idx + 1 : idx;
    next[String(shifted)] = v;
  }
  return next;
}

export function shiftNodeTypesOnDelete(
  nodeTypes: Record<string, NodeType> | undefined,
  deletedAnchorIdx: number,
) {
  const src = nodeTypes ?? {};
  const next: Record<string, NodeType> = {};
  for (const [k, v] of Object.entries(src)) {
    const idx = Number(k);
    if (!Number.isFinite(idx)) continue;
    if (idx === deletedAnchorIdx) continue;
    const shifted = idx > deletedAnchorIdx ? idx - 1 : idx;
    next[String(shifted)] = v;
  }
  return next;
}

export function insertNodeInFinger(
  finger: Finger,
  segmentIndex: number,
  t: number,
): { finger: Finger; insertedAnchorIdx: number } | null {
  const segments = fingerToSegments(finger);
  if (!segments.length) return null;
  if (segmentIndex < 0 || segmentIndex >= segments.length) return null;

  const segs = cloneSegments(segments);
  const [s1, s2] = splitBezierAt(segs[segmentIndex]!, t);
  // New nodes should be control-point-free by default: collapse the handles at the inserted anchor.
  s1.p2 = { ...s1.p3 };
  s2.p1 = { ...s2.p0 };
  segs.splice(segmentIndex, 1, s1, s2);

  const insertedAnchorIdx = segmentIndex + 1;
  const nodeTypes = shiftNodeTypesOnInsert(finger.nodeTypes, insertedAnchorIdx);
  const nextFinger: Finger = {
    ...updateFingerSegments(finger, segs),
    nodeTypes,
  };
  return { finger: nextFinger, insertedAnchorIdx };
}
