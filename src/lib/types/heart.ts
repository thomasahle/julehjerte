import type { DifficultyLevel } from '$lib/utils/difficulty';
export type Vec = { x: number; y: number };
export type LobeId = 'left' | 'right';
export type NodeType = 'corner' | 'smooth' | 'symmetric';

export type GridSize = { x: number; y: number };

/**
 * The paper colours of the two lobes, as `#rrggbb`.
 *
 * $lib/stores/colors holds the site-wide pair and re-exports this type; a design
 * may carry its own (see `HeartDesign.colors`).
 */
export type HeartColors = { left: string; right: string };

export type BezierSegment = {
  p0: Vec;
  p1: Vec;
  p2: Vec;
  p3: Vec;
};

export type Finger = {
  id: string;
  lobe: LobeId;
  // Canonical curve representation in editor coordinates.
  segments: BezierSegment[];
  // Optional per-anchor node types (Inkscape-like). Keys are anchor indices (0..segmentsLength).
  nodeTypes?: Record<string, NodeType>;
};

// On-disk / interchange format for designs and SVG import/export.
export type FingerPathData = {
  id: string;
  lobe: LobeId;
  // SVG path data using absolute `M` + one or more cubic `C` segments.
  pathData: string;
  nodeTypes?: Record<string, NodeType>;
};

/** A heart's paragraph per site language; either may be missing. */
export interface HeartDescriptions {
  da?: string;
  en?: string;
}

/** A heart's name per site language; either may be missing (see `heartName`). */
export interface HeartNames {
  da?: string;
  en?: string;
}

export interface HeartDesign {
  id: string;
  // The heart's own name: the SVG's plain `<title>`, and the name in every
  // language that has none of its own in `names`.
  name: string;
  // The name in each site language, where it differs from `name`. A gallery SVG
  // carries them as `<title xml:lang="da">` / `<title xml:lang="en">`; hearts
  // drawn in the editor and everything saved before the field existed have none.
  // Resolve with `heartName` ($lib/utils/heartName), never read directly.
  names?: HeartNames;
  author: string;
  authorUrl?: string;
  publisher?: string;
  publisherUrl?: string;
  source?: string;
  date?: string;
  description?: string;
  // The written paragraphs in each site language. A gallery SVG carries them as
  // `<desc xml:lang="da">` / `<desc xml:lang="en">`; hearts drawn in the editor
  // and everything saved before the field existed have none.
  descriptions?: HeartDescriptions;
  // Parity base for the overlap weave. `0` means top-left cell has left lobe on top.
  // This may flip when adding/removing strips on the top/left to keep existing cells stable.
  weaveParity?: 0 | 1;
  // Number of strips in the overlap rectangle (x = columns, y = rows).
  gridSize: GridSize;
  // Optional physical overlap width / height, independent of strip counts.
  // Fitted templates use 1; older designs retain their strip-sized rectangle.
  overlapAspectRatio?: number;
  // Appearance snapshot for saved/exported files. The site's live previews use
  // the header's shared colours; changing that preference does not edit geometry.
  colors?: HeartColors;
  // The tile the heart was drawn from in Tegn's Escher tab, when it was: the tab
  // takes it up again when the heart is opened, as long as the cuts are still
  // the ones it makes. Absent on every other heart.
  pattern?: HeartPattern;
  fingers: Finger[];
}

/**
 * A tile of Tegn's Escher tab as a heart keeps it ($lib/pattern/escherTab
 * reads and writes it): the type by its key ('opposite:move:mirror', 'ih42', …),
 * the size, the curves — each segment eight numbers, p0 to p3, in its side's own
 * frame — where the tiles' corners stand off the grid (`corners`, as many numbers
 * as its type lets corners move; hearts saved before kept how far the tiles lean
 * as `offset`), where the crossings open out into joints (`joints`: which colour's
 * tiles join across them, and as many numbers as its type lets them move), how they are sized, stretched,
 * slanted and turned (`shape`, where a cell's two sides go: x and y of one, then
 * of the other), how far of that is the whole pattern turned (`turn`, radians),
 * how far the pattern has moved (`pan`), the lines of the tiling the heart cuts
 * once it has (`lines`, first and how many, each way), and the types the visitor
 * gave nodes of the curves (`nodeTypes`, by curve and by the node's place in it).
 */
export interface HeartPattern {
  rule: string;
  cuts: number;
  curves: Record<string, number[][]>;
  corners?: number[];
  joints?: { join: 'red' | 'white' | 'level' | 'upright'; free: number[] };
  inverted?: boolean;
  offset?: [number, number];
  shape?: [number, number, number, number];
  turn?: number;
  pan?: [number, number];
  nodeTypes?: Record<string, Record<string, NodeType>>;
  lines?: { V: [number, number]; H: [number, number] };
}

// On-disk format for gallery hearts and shared designs.
export type HeartDesignJson = Omit<HeartDesign, 'fingers'> & {
  fingers: FingerPathData[];
  /** Physical overlap proportions, independent of the number of strips. */
  overlapAspectRatio?: number;
};

/**
 * The credit and facts the heart detail page shows beside the drawing.
 *
 * Assembled from the build-time metadata for a gallery heart (so it is in the
 * prerendered HTML) and from the loaded design for one the visitor drew. The
 * description is not here: a gallery heart's comes from
 * `$lib/data/heartDescriptions` in the language of the URL, and every other
 * heart's straight off the design, so the page passes it to the panel itself.
 */
export interface HeartInfo {
	name: string;
	author: string | null;
	authorUrl: string | null;
	publisher: string | null;
	publisherUrl: string | null;
	source: string | null;
	date: string | null;
	gridSize: { x: number; y: number };
	difficulty: DifficultyLevel;
}
