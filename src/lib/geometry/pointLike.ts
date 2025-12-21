export interface PointLike<P> {
  x: number;
  y: number;
  add(other: P): P;
  subtract(other: P): P;
  multiply(scalar: number): P;
  dot(other: P): number;
  getDistance(other: P): number;
  readonly length: number;
  normalize(): P;
  clone(): P;
}

