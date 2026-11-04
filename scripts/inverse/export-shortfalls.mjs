/** The export's checks a template fails, by name (engine.js `finish`: templateChecksPassed is none of
 * them failing): 'rules' (the validation), 'paper' (the paper core, where required), 'picture' (too far
 * from its mask), 'lost regions' and 'joined regions' (feature-shapes.js `finalFeatureAudit`). */
export function exportShortfalls(report){
  const features=report.imageFidelity.features,error=report.imageError?.mismatchFraction;
  const out=[
    ...(report.validation.passed?[]:['rules']),
    ...(!report.settings.requireMaterialCore||report.manufacturing.status==='pass'?[]:['paper']),
    ...(error===undefined||error<=report.imageFidelity.maximumMismatchFraction?[]:['picture']),
    ...(features.passed||features.merged?.length&&!features.missing?.length?[]:['lost regions']),
    ...(features.merged?.length?['joined regions']:[])];
  if(!out.length!==report.templateChecksPassed)throw new Error(`The shortfalls ${JSON.stringify(out)} disagree with templateChecksPassed ${report.templateChecksPassed}.`);
  return out;
}

/** templateChecksPassed, but for the shortfalls named: a fixture's known one, which the test says. */
export function passedBut(report,allowed){return exportShortfalls(report).every(name=>allowed.includes(name));}
