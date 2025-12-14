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

// A finger path that can have multiple Bézier segments chained together
export interface FingerPath {
  id: string;
  lobe: 'left' | 'right'; // which lobe this finger belongs to
  segments: CubicBezierSegment[];
  // Border positions (0-1) where endpoints attach to the heart outline
  startBorderT: number;
  endBorderT: number;
}

// The outline of a single lobe (half of the heart)
export interface LobeOutline {
  id: 'left' | 'right';
  // Path points defining the lobe shape (for rendering and constraints)
  pathPoints: Point[];
}

// Symmetry settings
export interface SymmetrySettings {
  // Mirror between left and right lobes (diagonal)
  betweenLobes: boolean;
  // Mirror within each lobe (horizontal axis)
  withinLobe: boolean;
}

// Which cell is on top in the weave
export type WeaveCell = 'left' | 'right';

// Matrix of which lobe is on top at each crossing
export type WeaveMatrix = WeaveCell[][];

// Complete heart state
export interface HeartState {
  gridSize: number; // number of fingers per lobe (typically 3-6)
  lobes: {
    left: LobeOutline;
    right: LobeOutline;
  };
  fingers: Record<string, FingerPath>;
  symmetry: SymmetrySettings;
}

// Editor modes
export type EditorMode = 'select' | 'draw' | 'addPoint';

// Editor state (UI state, not persisted)
export interface EditorState {
  mode: EditorMode;
  selectedPathId: string | null;
  selectedPointIndex: number | null; // which control point is selected
  isDrawing: boolean;
  drawingPoints: Point[]; // points collected while drawing
}

// Control point types for rendering different handle shapes
export type ControlPointType = 'endpoint' | 'handle';

// A renderable control point
export interface ControlPoint {
  id: string;
  pathId: string;
  segmentIndex: number;
  pointKey: 'p0' | 'p1' | 'p2' | 'p3';
  position: Point;
  type: ControlPointType;
  isConstrained: boolean; // true for endpoints (constrained to border)
}
