export type Vec = { x: number; y: number };
export type LobeId = 'left' | 'right';

// A finger boundary can be defined two ways:
// 1. Simple: p0-p3 for a single cubic bezier (backwards compatible)
// 2. Complex: SVG path data string for multi-segment paths
export type Finger = {
  id: string;
  lobe: LobeId;
  // Single segment (backwards compatible)
  p0: Vec;
  p1: Vec;
  p2: Vec;
  p3: Vec;
  // Optional SVG path data for complex multi-segment paths
  // Example: "M 375 275 C 365 275 340 255 325 255 C 310 255 290 295 275 295"
  pathData?: string;
};

export interface HeartDesign {
  id: string;
  name: string;
  author: string;
  description?: string;
  gridSize: number;
  fingers: Finger[];
}

export interface HeartCollection {
  hearts: HeartDesign[];
}
