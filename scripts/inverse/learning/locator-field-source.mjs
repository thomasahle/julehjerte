/** Audited field-selection seam shared by the two offline crop adapters.
 * A production palette change requires reviewing this replacement for both.
 */
export const LOCATOR_FIELD_SELECTION="baseFields=options.palette==='chromatic'?makeChromaticPaletteFields(work,{roi:sampleROI})\n  :options.palette==='rgb-background'?makeRGBBackgroundFields(work,{roi:sampleROI})\n  :options.palette==='interior'?makeInteriorPaletteFields(work)\n  :options.palette==='anchored'?makeAnchoredFields(work)\n  :['adaptive','pale'].includes(options.palette)?makePaletteFields(work,{pale:options.palette==='pale'})\n  :makeFields(work);";
