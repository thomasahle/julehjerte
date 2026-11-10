/** How far a finished result (engine.js finish) falls short of what the export
 * asks, for choosing the best of several when none passes: a template is never
 * thrown away for missing a limit by a hair (santa's designer template comes
 * 0.02 mm closer to itself than the 1.5 mm asked), the person always gets the
 * best there is. Compared in order: passing every check; then the number of
 * kinds of failure that are not clearances (crossings, lost regions, the
 * paper, the image limit); then the clearances' total shortfall in mm; then
 * the share of the picture the weave gets wrong. Lower is better. */
const CLEARANCE = new Set(['short_self_clearance', 'inter_slit_clearance', 'nonlocal_self_clearance', 'outer_side_clearance']);

/** Tuples `a` and `b` compared in order at the first entry of `a` that is not
 * (!==) b's: negative where a's is less, positive where it is greater, NaN where
 * it is neither (a NaN or a missing entry: a ranks first in no order then); 0
 * where none of a's entries differs, b's further entries unread. Lower is
 * better wherever the solver ranks by tuples, so `compareTuples(a, b) < 0` is
 * "a ranks first" and `<= 0` "a ranks first or ties". */
export function compareTuples(a, b) {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : NaN;
  return 0;
}

/** The validation issues' kinds that are not clearances, and the clearances'
 * total shortfall in mm (to `width`, the nominal width, where an issue does
 * not say what it needs). */
export function issueKinds(issues, width) {
  const kinds = new Set(issues.filter(issue => !CLEARANCE.has(issue.type)).map(issue => issue.type));
  let shortfall = 0;
  for (const issue of issues) if (CLEARANCE.has(issue.type)) {
    const distance = issue.distanceUpper ?? issue.distanceLower ?? issue.distance, required = issue.required ?? width;
    shortfall += Number.isFinite(distance) ? Math.max(0, required - distance) : required;
  }
  return {kinds, shortfall: Math.round(shortfall * 1000) / 1000};
}

export function resultSeverity(value) {
  const report = value?.report ?? {}, {kinds, shortfall} = issueKinds(report.validation?.issues ?? [], report.settings?.nominalWidth ?? 2);
  if (report.imageFidelity?.features?.passed === false) kinds.add('features');
  if (report.imageFidelity && report.imageFidelity.passed === false && report.imageFidelity.features?.passed !== false) kinds.add('image');
  if (report.settings?.requireMaterialCore && report.manufacturing?.status && report.manufacturing.status !== 'pass') kinds.add('paper');
  return [report.templateChecksPassed === true ? 0 : 1, kinds.size, shortfall, report.imageError?.mismatchFraction ?? 1];
}

/** The better of two finished results (the first on a tie); either may be missing. */
export function betterResult(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  // b where a's severity is greater or neither (NaN): as the old loop, `x[k] < y[k] ? a : b` at the first difference.
  return compareTuples(resultSeverity(a), resultSeverity(b)) <= 0 ? a : b;
}
