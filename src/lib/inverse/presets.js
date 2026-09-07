/** Appearance-based routing presets. No published cutting paths are loaded. */
export const MATCHING_GRID_PRESET = {
  algorithm: 'trace', polygonal: true, identicalSheets: true, resolution: 600,
  fitTolerance: .35, maxSpan: 40, smoothRadius: 0, snapRadius: 0, borderRadius: 0,
  gridPortals: true, neighbors: 12, connectorVariants: 1,
  junctionBalancePenalty: 300, gridPreference: 500,
  sharpPenalty: 0, acutePenalty: 0, turnPenalty: 0,
  maxTurn: 175, localNeighborhoodFactor: 8, roundHidden: false,
};

export const GENERAL_PRESET = {
  algorithm: 'trace', polygonal: false, identicalSheets: false, resolution: 400,
  // Automatic physical-edge crops include blur/background fringes. Read beyond
  // those fringes before extending slit endpoints through the bounded edge band.
  fitTolerance: .5, maxSpan: 15, smoothRadius: 0, snapRadius: 1.5, borderRadius: 3,
  gridPortals: false, neighbors: 16, connectorVariants: 2,
  junctionBalancePenalty: 0, gridPreference: 0,
  sharpPenalty: 50, acutePenalty: 30, turnPenalty: 3,
  maxTurn: 150, localNeighborhoodFactor: 3, roundHidden: true,
};

/** Shared with the Simplify button and photo benchmarks. */
export const SIMPLIFIED_PREPROCESSING = {
  fitTolerance: .75, smoothRadius: .3, snapRadius: 1.5,
  maxSpan: 30, borderRadius: 3,
};

Object.freeze(SIMPLIFIED_PREPROCESSING);
Object.freeze(MATCHING_GRID_PRESET);
Object.freeze(GENERAL_PRESET);

export const DIRECT_PRESET = Object.freeze({...GENERAL_PRESET, algorithm:'direct', roundHidden:false});
