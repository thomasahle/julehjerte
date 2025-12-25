// Basic geometry types
export interface Point {
  x: number;
  y: number;
}

// A cubic Bézier segment with 4 control points
export interface CubicBezierSegment {
  p0: Point; // start point
  p1: Point; // control point 1
  p2: Point; // control point 2
  p3: Point; // end point
}


