/** Keep replay inputs and exports without repeating large diagnostic drawings.
 * INVERSE_FULL_ARTIFACTS=1 opts into the full engine report for selected runs.
 * This affects benchmark storage only, never fitting or website downloads.
 */
const bulkyDiagnostics = new Set([
  'report.html',
  'manufacturability_left.svg',
  'manufacturability_right.svg'
]);

export function benchmarkArtifactEntries(files, { full = process.env.INVERSE_FULL_ARTIFACTS === '1' } = {}) {
  return Object.entries(files).filter(([name]) => full || !bulkyDiagnostics.has(name));
}
