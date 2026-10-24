import {repairFinalPaper} from './direct/final-paper-repair.js';
import {finalMaterialAudit} from './geometric-material.js';
import {repairFinalReturns} from './direct/final-return-repair.js';
/** Shared browser/Node API. Production execution is JavaScript + local WASM. */
import {prepareAutomatic,solveAutomatic} from './automatic.js';
import {auditFeatureFidelity} from './feature-shapes.js';
import {progressReporter} from './progress.js';
import {fitDirect} from './direct/fit.js';
import {transposeTarget} from './symmetry.js';
import {symmetryReport} from './direct/symmetry.js';
import {Cubic} from './bezier.js';
import {settings} from './settings.js';
import {loadSVG,preprocessPixels,preprocessBinaryMask,colorsSafe,sampleTarget} from './input.js';
import {referenceError} from './image-reference.js';
import {loadSolutionJSON,reindex} from './graph.js';
import {solveBoundary} from './routing.js';
import {validate,easeMetrics,sampleWeave} from './validate.js';
import {materialAudit,perturbationAudit,verifiedPaperSettings} from './material.js';
import {roundHidden} from './rounding.js';
import {boundarySVG,targetSVG,resultFiles} from './export.js';
import {solvePolynomialTarget} from './direct/polynomial.js';
import {exactSearch,exactSymmetry,exactTarget,exactCannotStart,assess,better} from './exact/stage.js';
/** Structured cloning retains coordinates but not Cubic methods, including
 * the cached boundary seed used by the topology initializer. Rebuild derived
 * curve caches locally; a transferred cache must not hide edited coordinates. */
export function restorePrepared(target){return{...target,curves:target.curves.map(c=>new Cubic(c.p)),...(target.boundarySeed?{boundarySeed:restorePrepared(target.boundarySeed)}:{})};}
export function scaleTarget(target,width,colors){const factor=width/target.width;return{...target,width,curves:target.curves.map(c=>new Cubic(c.p.map(p=>p.map(v=>v*factor)))),metadata:{...target.metadata,paperColors:colorsSafe(colors||target.metadata.paperColors)}};}
/** The most curves the traced routes take; the automatic route fits more as an image. */
export const MAX_TRACED_CURVES=1000;
export function prepare(input,raw={},onProgress=()=>{}){if(raw.algorithm==='auto')return prepareAutomatic(input,raw,onProgress);const cfg=settings(raw),pre={resolution:400,fitTolerance:.5,maxSpan:15,...raw,width:cfg.width,nominalWidth:cfg.nominalWidth,paperColors:colorsSafe(cfg.paperColors),geometryTolerance:cfg.geometryTolerance};for(const[k,lo,hi]of[['fitTolerance',.01,3],['maxSpan',2,40],['snapRadius',0,3]])if(pre[k]!==undefined&&(!Number.isFinite(pre[k])||pre[k]<lo||pre[k]>hi))throw new Error(`${k} must be between ${lo} and ${hi}.`);onProgress({stage:'preprocessing'});let target,rgb=null,mask=null,n=240;
  if(input.type==='svg'){target=loadSVG(input.text,{width:cfg.width,maxSpan:pre.maxSpan||12,tolerance:cfg.geometryTolerance});target.metadata.paperColors=colorsSafe(cfg.paperColors);if(raw.invert)target.phase^=1;mask=sampleTarget(target,n);}else if(input.type==='pixels'){({target,rgb,mask,n}=preprocessPixels({...input,settings:pre}));}else if(input.type==='mask'){if(!['direct','polynomial'].includes(cfg.algorithm))throw new Error('Binary masks use automatic, direct or polynomial fitting.');({target,mask,n}=preprocessBinaryMask(input,{...pre,algorithm:'direct'}));}else throw new Error('Prepare accepts pixels, a binary mask or a plain SVG.');if(cfg.algorithm==='direct'&&input.type==='svg'){const source=sampleTarget(target,256);target={...target,curves:[],sourceImage:{mask:source,probability:Float32Array.from(source),resolution:256},metadata:{...target.metadata,direct:true,input:'Rasterized visible SVG for direct fitting'}};n=256;mask=source;}if(raw.identicalSheets&&cfg.algorithm!=='direct'&&cfg.algorithm!=='polynomial')target=transposeTarget(target);if(target.curves.length>MAX_TRACED_CURVES&&!raw.manyCurves)throw new Error('Too much traced detail. Increase fitting tolerance or remove small details.');const vector=target.metadata.direct?maskSVG(mask,n):targetSVG(target);return{target,preview:{vector,boundaries:boundarySVG(target),mask,rgb,resolution:n,...(target.sourceImage?.validMask?{validMask:target.sourceImage.validMask}:{}),...(target.sourceImage?.weights?{weights:target.sourceImage.weights}:{}),metadata:{...target.metadata,curves:target.curves.length,width:target.width}}};}
export async function solveTarget(target,raw={},onProgress=()=>{},{onCandidate}={}){const cfg=settings(raw),scaled=scaleTarget(target,cfg.width,cfg.paperColors);onProgress=progressReporter(onProgress,cfg.progressGeometry,{onCandidate});if(cfg.algorithm==='auto')return solveAutomatic(scaled,cfg,onProgress);if(cfg.algorithm==='polynomial')return solvePolynomialTarget(scaled,cfg);if(cfg.algorithm==='direct'){if(!target.metadata.direct)throw new Error('Prepare the image with direct fitting selected first.');return fitDirect(scaled,cfg,onProgress);}return solveBoundary(scaled,cfg,{onProgress,coreGate:cfg.requireMaterialCore?s=>materialAudit(s,cfg):null});}
/** The most seconds a design with the exact-outline rescue takes, fitter
 * included, of which the last EXACT_FINISH_SECONDS are the final checks' and export's. */
export const EXACT_SECONDS=60,EXACT_FINISH_SECONDS=10;
/** With `exactCompete`, the least time left for the exact search to compete
 * with a passing fitted template. */
const COMPETE_SECONDS=15;
export async function design(target,raw={},onProgress=()=>{},options={}){const cfg=settings(raw),symmetry=exactSymmetry(cfg.symmetry);
  // A picture in Mal (`exactOutline`, a mask without curves): the fitter's
  // template stands when it passes. Otherwise the exact search lays the cuts
  // on the outline traced from the mask, with the requested symmetry's ties,
  // and its template is taken only when it passes and ranks better (stage.js).
  // It cannot keep identical sheets, a free frame band or a symmetry within
  // each curve, so those keep the fitter's alone; with it a design takes at
  // most EXACT_SECONDS.
  const exactOn=cfg.exactOutline&&!target.curves?.length&&!raw.identicalSheets&&!target.sourceImage?.weights&&symmetry!==null;
  if(!exactOn){const deadline=performance.now()+1000*cfg.timeLimit,solution=await solveTarget(target,raw,onProgress,options);return finish(solution,settings(solution.automaticSettings||raw),onProgress,{deadline});}
  const seconds=Math.min(cfg.timeLimit,EXACT_SECONDS),start=performance.now(),deadline=start+1000*seconds,searchEnd=deadline-1000*EXACT_FINISH_SECONDS;
  // The outline traced from the mask first (tens of milliseconds): where its
  // cut ends cannot pair up the exact search cannot start, and the fitter
  // takes three quarters of the minute instead of half.
  let outline=null,cannot='No outline was traced from the mask.';
  try{const traced=exactTarget(target,cfg),scaled=traced&&scaleTarget(traced,cfg.width,cfg.paperColors);if(scaled){cannot=exactCannotStart(scaled,cfg);outline=cannot?null:scaled;}}catch(error){cannot=String(error.message||error);}
  let solution=await solveTarget(target,{...raw,timeLimit:Math.max(.1,seconds*(outline?.5:.75))},onProgress,options);
  // The fitter's template as it would be exported: the final repairs make
  // most failing fits pass, and the exact search is only for those that still
  // fail. (Also for those losing a region of the picture, a letter or an eye,
  // it found nothing in time: on text and photographs its start runs out of
  // time or the ends do not pair up.)
  const cfgFitted=settings(solution.automaticSettings||raw);
  let repaired=repairFinal(solution,cfgFitted,{onProgress,deadline:searchEnd});
  const fitted=assess(repaired.solution,cfgFitted,{material:repaired.paperRepair.material});
  let report={chosen:'fitter',fitter:fitted,...(outline?{}:{error:cannot})};
  // With `exactCompete` it also competes with a passing one, given the time:
  // on drawn pictures it often cuts far less hidden.
  if(outline&&(!fitted.passes||cfg.exactCompete&&searchEnd-performance.now()>=1000*COMPETE_SECONDS)){
    const search=await exactSearch(outline,solution,settings({...(solution.automaticSettings||raw),symmetry:cfg.symmetry}),{deadline:searchEnd,onProgress,symmetry,geometry:cfg.progressGeometry});
    report={...search.report,chosen:'fitter',fitter:fitted};
    // Only a passing one: a search that ends with rules broken may still
    // rank above a failing fit, but its cuts can cross, which Mal cannot show.
    if(search.found?.assessment.passes&&better(search.found.assessment,fitted)){solution=search.found.solution;repaired=null;report.chosen='exact';}
  }
  solution.report={...solution.report,exactOutline:report};
  if(repaired)repaired.solution.report=solution.report;
  return finish(repaired?.solution??solution,settings(solution.automaticSettings||raw),onProgress,{deadline,repaired});}
export function inspectSaved(text,raw={},onProgress=()=>{}){const cfg=settings(raw),solution=loadSolutionJSON(text),factor=cfg.width/solution.graph.target.width;solution.graph.edges.forEach(e=>e.curve=new Cubic(e.curve.p.map(p=>p.map(x=>x*factor))));solution.graph.target=scaleTarget(solution.graph.target,cfg.width,cfg.paperColors);reindex(solution.graph);return finish(solution,cfg,onProgress);}
export function inputImageError(solution){
  const source=solution.graph.target.sourceImage;
  return source?errorFromSamples(source,sampleWeave(solution,source.resolution)):null;
}
function errorFromSamples(source,rendered){
  if(!source)return null;
  const error=referenceError(source,rendered);
  if(!Number.isFinite(error.mismatchFraction))throw new Error('The crop contains no observed image pixels.');
  return{reference:source.validMask?'Observed image pixels; outside-source padding is excluded and observed coverage is reported separately':source.weights?'Original artwork with image-importance weights; whole-image and permitted changes reported separately':'Classified input crop before border repair, cleanup or tracing',resolution:source.resolution,...error,method:'Forward sampling of both slit families at input resolution',independentExportRenderer:false};
}
/** The repairs before export: hidden cuts rounded, then the editor's
 * complete-cut rule and the paper audit's bounded repairs. design() runs them
 * before deciding whether the exact search must rescue a template, and hands
 * them to finish() as `repaired`. */
export function repairFinal(solution,cfg,{onProgress=()=>{},refine=true,deadline=Infinity}={}){
  cfg=verifiedPaperSettings(solution,cfg);
  onProgress({stage:'validating'});
  let refinement=null;
  if(refine&&cfg.roundHidden&&cfg.minRadius>0&&validate(solution,cfg).passed){
    onProgress({stage:'rounding'});
    refinement=roundHidden(solution,cfg,{onProgress,budgetSeconds:15});
  }
  // Keep the cheaper search guidance inside fitting. The final pair uses the
  // same complete-cut rule as the editor, with bounded repair before export.
  const returnRepair=repairFinalReturns(solution,cfg,{deadline});
  // A detected disconnected core needs real curve updates after its initial
  // audit. Use otherwise idle caller time, retaining a second for final
  // checks, instead of imposing the short-request cap on a longer request.
  // Saved-template inspection has no finite caller budget and keeps its cap.
  const paperRepairMilliseconds=Number.isFinite(deadline)?Math.min(4500,Math.max(1500,deadline-performance.now()-1000)):1500;
  const paperRepair=repairFinalPaper(returnRepair.solution,cfg,{deadline,maxMilliseconds:paperRepairMilliseconds,includeMaps:true});
  return {solution:paperRepair.solution,cfg,refinement,returnRepair,paperRepair};
}
export function finish(solution,cfg,onProgress=()=>{},{refine=true,stoppedEarly=false,alternatives=[],deadline=Infinity,repaired=null}={}){
  const started=performance.now();
  const done=repaired??repairFinal(solution,cfg,{onProgress,refine,deadline}),{refinement,returnRepair,paperRepair}=done;
  solution=paperRepair.solution;
  cfg=verifiedPaperSettings(solution,done.cfg);
  const check=validate(solution,cfg,{finalGeometry:true});
  onProgress({stage:'paper'});const material=paperRepair.material||finalMaterialAudit(solution,cfg,{includeMaps:true}),perturbation=check.passed?perturbationAudit(solution,cfg,{onProgress}):{summary:{trials:0,skipped:'Nominal geometry failed validation.'},trials:[],worst:null},metrics=easeMetrics(solution,cfg),source=solution.graph.target.sourceImage,comparison={resolution:source?.resolution??240,wovenMask:sampleWeave(solution,source?.resolution??240),validMask:source?.validMask,...(source?.weights?{weights:source.weights}:{})},imageError=errorFromSamples(source,comparison.wovenMask),imagePassed=!imageError||imageError.mismatchFraction<=cfg.maxImageError,features=auditFeatureFidelity(source,comparison.wovenMask,cfg),allowTemplates=features.passed&&check.passed&&(!cfg.requireMaterialCore||material.passed)&&imagePassed,symmetry=symmetryReport(solution,cfg.symmetry),warnings=[];
  // A dropped symmetry request belongs in the warnings the app already reads,
  // not only in a report field: the traced routes cannot enforce one at all.
  const unhonoured=symmetry.requested.filter(name=>!symmetry.honoured.includes(name));
  if(unhonoured.length)warnings.push(`The exported cuts do not satisfy the requested symmetry ${unhonoured.join(', ')} (${symmetry.maxDeviationMm===null?'no paired cuts exist for these slit counts':`largest deviation ${symmetry.maxDeviationMm.toFixed(3)} mm`}). Only the direct fitter enforces a requested symmetry.`);
  if(!features.passed)warnings.push(`${features.missing.length} substantial interior artwork region(s) lost their colour or enclosure. Inspect the original mask and comparison.`);
  if(!imagePassed)warnings.push(`The exported weave differs from the original classified artwork by ${(100*imageError.mismatchFraction).toFixed(2)}%, above the ${(100*cfg.maxImageError).toFixed(2)}% limit. This limit measures image fidelity, not similarity to unknown original cutting paths.`);
  if(!check.passed)warnings.push('Nominal geometry failed independent validation. Inspect the template and paper-support views.');if(material.status!=='pass')warnings.push(`The paper-core test is ${material.status}. Inspect the unfolded paper-support views; a disconnected core needs a geometry change.`);if(!cfg.requireMaterialCore)warnings.push('Strict paper-core rejection was disabled. Treat any exported template as an unchecked manufacturing candidate.');if(metrics.hiddenCurvesBelowRadius)warnings.push(`${metrics.hiddenCurvesBelowRadius} hidden curve(s) remain below the desired radius. The radius is a refinement goal, not a globally enforced feasibility guarantee.`);if(perturbation.summary.invalidTopologyTrials)warnings.push(`${perturbation.summary.invalidTopologyTrials} synthetic cutting-error trials had invalid topology. These trials are failures, not zero-error successes.`);const trace=solution.graph.target.metadata.preprocessing;if(trace&&trace.sourceMaskComponents!==trace.vectorSampleComponents)warnings.push('Tracing changed the sampled component count. Inspect the processed artwork.');if(!solution.paths[0].length||!solution.paths[1].length)warnings.push('This pattern has no slits in at least one sheet. A normal woven basket construction is not established.');
  const report={application:'juleflet JavaScript',version:'1.0.0',createdAt:new Date().toISOString(),settings:cfg,input:solution.graph.target.metadata,templateExportAllowed:true,templateChecksPassed:allowTemplates,slits:{left:solution.paths[1].length,right:solution.paths[0].length},solver:solution.report,validation:check,manufacturing:material.summary,refinement,ease:metrics,tolerance:perturbation.summary,toleranceTrials:perturbation.trials,warnings,postprocessSeconds:(performance.now()-started)/1000,assurance:{physicalAssemblyTested:false,stressSimulation:false,exactAreaCertificate:false,curveIntersections:'adaptive chord approximation; floating-point predicates',paperAnalysis:'guarded rolling-disk lattice and independent polygon offsets of unfolded cuts; finite numerical probes',continuousOptimization:stoppedEarly?'Retained a validated checkpoint and applied standard shared-cut and primitive cleanup':solution.report.algorithm==='hybrid-bezier-trace'?'Fresh image-based grid initialization followed by traced MILP routing to preserve missing features':solution.report.algorithm==='direct-bezier'?'Analytic grid gradients and continuous boundary-motion Bézier gradients with Adam and geometry checkpoints':'local shared-fillet and handle search, not SciPy SLSQP',candidateGraph:solution.graph.metadata.candidateMethod||'Imported cutting paths'}};
  report.finalPaperRepair=paperRepair.report;report.finalReturnRepair=returnRepair.report;report.imageError=imageError;report.symmetry=symmetry;report.imageFidelity={passed:imagePassed&&features.passed,features,maximumMismatchFraction:cfg.maxImageError,referenceAvailable:!!imageError};
  if(stoppedEarly){report.stoppedEarly=true;report.alternatives=alternatives;}
  onProgress({stage:'exporting'});const files=resultFiles(solution,cfg,report,material,perturbation);return{report,files,comparison};
}

function maskSVG(mask,n){const runs=[];for(let y=0;y<n;y++){for(let x=0;x<n;){if(!mask[y*n+x]){x++;continue;}const start=x;while(x<n&&mask[y*n+x])x++;runs.push(`M${start},${y}h${x-start}v1h${start-x}Z`);}}return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"><rect width="${n}" height="${n}" fill="white"/><path d="${runs.join(' ')}" fill="#bd1111"/></svg>`;}
