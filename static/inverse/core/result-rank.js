/** How far a finished result (engine.js finish) falls short of what the export
 * asks, for choosing the best of several when none passes: a template is never
 * thrown away for missing a limit by a hair (santa's designer template comes
 * 0.02 mm closer to itself than the 1.5 mm asked), the person always gets the
 * best there is. Compared in order: passing every check; then the number of
 * kinds of failure that are not clearances (crossings, lost regions, the
 * paper, the image limit); then the clearances' total shortfall in mm; then
 * the share of the picture the weave gets wrong. Lower is better. */
const CLEARANCE = new Set(['short_self_clearance', 'inter_slit_clearance', 'nonlocal_self_clearance', 'outer_side_clearance']);

export function resultSeverity(value) {
  const report = value?.report ?? {}, issues = report.validation?.issues ?? [], width = report.settings?.nominalWidth ?? 2;
  const kinds = new Set(issues.filter(issue => !CLEARANCE.has(issue.type)).map(issue => issue.type));
  if (report.imageFidelity?.features?.passed === false) kinds.add('features');
  if (report.imageFidelity && report.imageFidelity.passed === false && report.imageFidelity.features?.passed !== false) kinds.add('image');
  if (report.settings?.requireMaterialCore && report.manufacturing?.status && report.manufacturing.status !== 'pass') kinds.add('paper');
  let shortfall = 0;
  for (const issue of issues) if (CLEARANCE.has(issue.type)) {
    const distance = issue.distanceUpper ?? issue.distanceLower ?? issue.distance, required = issue.required ?? width;
    shortfall += Number.isFinite(distance) ? Math.max(0, required - distance) : required;
  }
  return [report.templateChecksPassed === true ? 0 : 1, kinds.size, Math.round(shortfall * 1000) / 1000, report.imageError?.mismatchFraction ?? 1];
}

/** The better of two finished results (the first on a tie); either may be missing. */
export function betterResult(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const x = resultSeverity(a), y = resultSeverity(b);
  for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return x[k] < y[k] ? a : b;
  return a;
}
