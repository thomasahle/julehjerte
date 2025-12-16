export type Vec = { x: number; y: number };
export type LobeId = 'left' | 'right';
export type NodeType = 'corner' | 'smooth' | 'symmetric';

export type GridSize = { x: number; y: number };

export type Finger = {
  id: string;
  lobe: LobeId;
  // SVG path data using absolute `M` + one or more cubic `C` segments.
  pathData: string;
  // Optional per-anchor node types (Inkscape-like). Keys are anchor indices (0..segmentsLength).
  nodeTypes?: Record<string, NodeType>;
};

export interface HeartDesign {
  id: string;
  name: string;
  author: string;
  description?: string;
  // Number of strips in the overlap rectangle (x = columns, y = rows).
  gridSize: GridSize;
  fingers: Finger[];
}

export interface HeartCollection {
  hearts: HeartDesign[];
}

// On-disk format for gallery hearts and shared designs.
export type HeartDesignJson = Omit<HeartDesign, 'fingers'> & {
  fingers: Array<{ id: string; lobe: LobeId; pathData: string; nodeTypes?: Record<string, NodeType> }>;
};
