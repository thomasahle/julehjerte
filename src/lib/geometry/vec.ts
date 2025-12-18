import type { Vec } from '$lib/types/heart';

export function vecLerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function vecAdd(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vecSub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vecScale(a: Vec, s: number): Vec {
  return { x: a.x * s, y: a.y * s };
}

export function vecDist(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function vecLength(v: Vec): number {
  return Math.hypot(v.x, v.y);
}

export function midpoint(a: Vec, b: Vec): Vec {
  return vecScale(vecAdd(a, b), 0.5);
}

export function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y;
}

export function normalize(v: Vec): Vec {
  const len = Math.hypot(v.x, v.y);
  if (!len) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function perp(v: Vec): Vec {
  return { x: -v.y, y: v.x };
}

