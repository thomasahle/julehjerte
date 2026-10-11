/** Prefer one reusable cutting template within an absolute image-error budget.
 * The original crop and its mask are never reflected or changed for scoring.
 */
import {curvesOf} from '../graph.js';
import {sampleWeave,validate} from '../validate.js';
import {materialAudit} from '../material.js';
import {auditImageFeatures,imageFeatures} from '../image-features.js';
import {CurveGraph} from './curves.js';
import {refineCurves} from './refine.js';
import {matchingGrid,matchingPaths,matchingSummary,symmetryEvidence} from './matching.js';
import {gridPaths} from './grid.js';
import {referenceError,sourceWeights} from '../image-reference.js';

export function matchingErrorLimit(baseline,cfg){
  // Reusing a template has an absolute accuracy allowance. Crossing the
  // image-fidelity warning must not silently shrink that preference budget.
  // Geometry, paper support and substantial image features are checked below.
  return Math.min(1,baseline+(cfg.matchingErrorAllowance??.01));
}

export function maskDisagreement(source,woven){
  return referenceError(source,woven).mismatchFraction;
}

/** Each sheet can be copied even when counts or subdivisions differ. */
export function matchingProposals(solution){
  const paths=solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p)));
  const transpose=family=>family.map(p=>p.map(c=>c.map(([x,y])=>[y,x])));
  const proposals=[];
  if(paths[0].length)proposals.push({name:'copy-first-sheet',paths:[paths[0],transpose(paths[0])]});
  if(paths[1].length)proposals.push({name:'copy-second-sheet',paths:[transpose(paths[1]),paths[1]]});
  const blend=matchingPaths(paths,.5);if(blend)proposals.push({name:'average-sheets',paths:blend});
  return proposals;
}

export function preferMatchingSolution(solution,cfg,{deadline=Infinity,steps=200,onProgress=()=>{},gridSeeds=[]}={}){
  const start=performance.now(),source=solution.graph.target.sourceImage;
  const summary=matchingSummary(solution),baseline=source?maskDisagreement(source,sampleWeave(solution,source.resolution)):null;
  const report={enabled:cfg.preferMatchingSheets,...summary,...(source?symmetryEvidence(source):{}),baselineImageError:baseline,
    baselineCounts:solution.paths.map(f=>f.length),baselinePhase:solution.graph.target.phase,
    maximumAdditionalImageError:cfg.matchingErrorAllowance??.01,maximumMatchingImageError:baseline===null?null:matchingErrorLimit(baseline,cfg),attempts:[]};
  const finish=(selected,status)=>{
    report.status=status;report.seconds=(performance.now()-start)/1000;
    Object.assign(report,matchingSummary(selected));
    report.selectedImageError=source?maskDisagreement(source,sampleWeave(selected,source.resolution)):null;
    report.additionalImageError=source?report.selectedImageError-baseline:null;
    selected.report={...solution.report,selectedCounts:selected.paths.map(f=>f.length),matchingPreference:report};
    return selected;
  };
  if(!cfg.preferMatchingSheets)return finish(solution,'disabled');
  if(!source)return finish(solution,'no_image_reference');
  if(summary.identical)return finish(solution,'already_identical');
  const limit=report.maximumMatchingImageError;
  if(report.minimumIdenticalImageError>limit)return finish(solution,'image_bound_exceeds_allowance');
  onProgress({stage:'directMatching'});
  const features=imageFeatures(source,cfg.width),phase=solution.graph.target.phase?-1:1,input=solution.graph.target;
  const inspect=(candidate,attempt)=>{
    const woven=sampleWeave(candidate,source.resolution),error=maskDisagreement(source,woven);
    Object.assign(attempt,{imageError:error,withinAllowance:error<=limit});
    if(error>limit)return false;
    attempt.featuresPassed=auditImageFeatures(source,woven,cfg.width,features).passed;
    attempt.geometryPassed=validate(candidate,cfg).passed;
    attempt.paperPassed=!cfg.requireMaterialCore||attempt.geometryPassed&&materialAudit(candidate,cfg).passed;
    return attempt.featuresPassed&&attempt.geometryPassed&&attempt.paperPassed&&matchingSummary(candidate).identical;
  };
  const proposals=matchingProposals(solution).map(({name,paths})=>{
    const graph=new CurveGraph(paths,cfg.width),candidate=graph.solution(graph.points,phase,input);
    return{name,graph,candidate,phase,error:maskDisagreement(source,sampleWeave(candidate,source.resolution))};
  }).sort((a,b)=>a.error-b.error);
  // Evaluate every exact proposal before checking the remaining gradient budget.
  // A known valid matching pair must never be skipped just because time ran out.
  for(const p of proposals){
    const attempt={proposal:p.name,refined:false};report.attempts.push(attempt);
    if(inspect(p.candidate,attempt))return finish(p.candidate,'matched');
  }
  // The two copied sheets can both be the wrong topology for a matching
  // solution. Reuse the already computed equal-count grids, including their
  // colour phases, and rank their tied geometry against the original source.
  // No count initialization is repeated and the same deadline still applies.
  for(const seed of gridSeeds){
    if(performance.now()>=deadline-80)break;
    const model=matchingGrid(seed.model);if(!model)continue;
    const graph=new CurveGraph(gridPaths(model,cfg.width,seed.floor),cfg.width),candidate=graph.solution(graph.points,seed.phase,input);
    proposals.push({name:'matching-grid',graph,candidate,phase:seed.phase,counts:model.counts,error:maskDisagreement(source,sampleWeave(candidate,source.resolution))});
  }
  const finalists=proposals.sort((a,b)=>a.error-b.error).slice(0,3);
  for(let i=0;i<finalists.length&&performance.now()<deadline-80;i++){
    const p=finalists[i],remaining=deadline-performance.now(),end=performance.now()+remaining/(finalists.length-i);
    const c=refineCurves(p.graph,Float64Array.from(source.mask),source.resolution,p.phase,{...cfg,preferMatchingSheets:false},
      {input,identicalSheets:true,steps,rate:p.counts ? .04 : .012,deadline:end,selection:'mask',weights:sourceWeights(source)});
    const candidate=c.graph.solution(c.points,p.phase,input),attempt={proposal:p.name,...(p.counts?{counts:p.counts,phase:p.phase}:{}),refined:true,steps:c.steps};report.attempts.push(attempt);
    if(inspect(candidate,attempt))return finish(candidate,'matched');
  }
  return finish(solution,performance.now()>=deadline-80?'matching_budget_exhausted':'no_valid_matching_candidate');
}
