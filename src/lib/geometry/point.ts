export class Point {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  clone(): Point {
    return new Point(this.x, this.y);
  }

  add(other: Point): Point {
    return new Point(this.x + other.x, this.y + other.y);
  }

  subtract(other: Point): Point {
    return new Point(this.x - other.x, this.y - other.y);
  }

  multiply(scalar: number): Point {
    return new Point(this.x * scalar, this.y * scalar);
  }

  dot(other: Point): number {
    return this.x * other.x + this.y * other.y;
  }

  getDistance(other: Point): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.hypot(dx, dy);
  }

  get length(): number {
    return Math.hypot(this.x, this.y);
  }

  normalize(): Point {
    const len = this.length;
    if (len < 1e-9) return new Point(0, 0);
    return new Point(this.x / len, this.y / len);
  }
}

