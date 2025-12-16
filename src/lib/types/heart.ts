export type Vec = { x: number; y: number };
export type LobeId = 'left' | 'right';

export type Finger = {
  id: string;
  lobe: LobeId;
  // SVG path data using absolute `M` + one or more cubic `C` segments.
  pathData: string;
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

// On-disk format for gallery hearts and shared designs.
export type HeartDesignJson = Omit<HeartDesign, 'fingers'> & {
  fingers: Array<{ id: string; lobe: LobeId; pathData: string }>;
};
