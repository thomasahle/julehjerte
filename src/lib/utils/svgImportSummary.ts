import { stripsLabel, t, type Language } from '$lib/i18n';
import type { HeartDesign } from '$lib/types/heart';
import type { SvgImportReport } from '$lib/utils/heartDesign';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { inferOverlapRect } from '$lib/utils/overlapRect';

/** Curves that cross or touch another in their half — the editor's red warnings. */
function crossingWarnings(design: HeartDesign): number {
  return findFingersWithIssues(design.fingers, intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize))).size;
}

/**
 * One line saying what "Importér SVG" (and scripts/svg-to-heart.mjs) made of a file:
 * grid, cuts per half, dropped outline edges, joined subpaths, and the warnings.
 */
export function importSummary(
  design: HeartDesign,
  report: SvgImportReport,
  lang: Language
): { text: string; warnings: number } {
  const { left, right } = report.cutsPerHalf;
  const grid = stripsLabel(design.gridSize, lang);
  const parts = [
    left === right
      ? t('editorImportSummary', lang, { grid, cuts: left })
      : t('editorImportSummaryUneven', lang, { grid, left, right })
  ];
  if (report.droppedEdges) parts.push(t('editorImportEdges', lang, { n: report.droppedEdges }));
  if (report.stitchedSubpaths) parts.push(t('editorImportStitched', lang, { n: report.stitchedSubpaths }));
  const crossings = crossingWarnings(design);
  if (report.unjoined.length) parts.push(t('editorImportUnjoined', lang, { names: report.unjoined.join(', ') }));
  if (report.skipped.length) parts.push(t('editorImportSkipped', lang, { names: report.skipped.join(', ') }));
  if (crossings) parts.push(t('editorImportCrossings', lang, { n: crossings }));
  const warnings = report.unjoined.length + report.skipped.length + crossings;
  if (!warnings) parts.push(t('editorImportNoWarnings', lang));
  return { text: parts.join(' '), warnings };
}
