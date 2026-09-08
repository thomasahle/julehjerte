/** Prefer one reusable cutting template within an absolute image-error budget.
 * The original crop and its mask are never reflected or changed for scoring.
 */
import {curvesOf} from '../graph.js';
import {sampleWeave,validate} from '../validate.js';
import {materialAudit} from '../material.js';
import {auditImageFeatures,imageFeatures} from '../image-features.js';
import {CurveGraph} from './curves.js';
import {refineCurves} from './refine.js';
import {matchingPaths,matchingSummary,symmetryEvidence} from './matching.js';

export function matchingErrorLimit(baseline,cfg){
  return Math.min(cfg.maxImageError,baseline+(cfg.matchingErrorAllowance??.01));
}

export function maskDisagreement(source,woven){
  let errors=0,observed=0;
  for(let i=0;i<woven.length;i++){
    if(source.validMask&&!source.validMask[i])continue;
    observed++;errors+=woven[i]!==source.mask[i];
  }
  return observed?errors/observed:Infinity;
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

export function preferMatchingSolution(solution,cfg,{deadline=Infinity,steps=200,onProgress=()=>{}}={}){
  const start=performance.now(),source=solution.graph.target.sourceImage;
  const summary=matchingSummary(solution),baseline=source?maskDisagreement(source,sampleWeave(solution,source.resolution)):null;
  const report={enabled:cfg.preferMatchingSheets,...summary,...(source?symmetryEvidence(source):{}),baselineImageError:baseline,
    maximumAdditionalImageError:cfg.matchingErrorAllowance??.01,maximumMatchingImageError:baseline===null?null:matchingErrorLimit(baseline,cfg),attempts:[]};
  const finish=(selected,status)=>{
    report.status=status;report.seconds=(performance.now()-start)/1000;
    Object.assign(report,matchingSummary(selected));
    report.selectedImageError=source?maskDisagreement(source,sampleWeave(selected,source.resolution)):null;
    report.additionalImageError=source?report.selectedImageError-baseline:null;
    selected.report={...solution.report,matchingPreference:report};
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
    return{name,graph,candidate,error:maskDisagreement(source,sampleWeave(candidate,source.resolution))};
  }).sort((a,b)=>a.error-b.error);
  // Evaluate every exact proposal before checking the remaining gradient budget.
  // A known valid matching pair must never be skipped just because time ran out.
  for(const p of proposals){
    const attempt={proposal:p.name,refined:false};report.attempts.push(attempt);
    if(inspect(p.candidate,attempt))return finish(p.candidate,'matched');
  }
  for(let i=0;i<proposals.length&&performance.now()<deadline-80;i++){
    const p=proposals[i],remaining=deadline-performance.now(),end=performance.now()+remaining/(proposals.length-i);
    const c=refineCurves(p.graph,Float64Array.from(source.mask),source.resolution,phase,{...cfg,preferMatchingSheets:false},
      {input,identicalSheets:true,steps,rate:.012,deadline:end,selection:'mask'});
    const candidate=c.graph.solution(c.points,phase,input),attempt={proposal:p.name,refined:true,steps:c.steps};report.attempts.push(attempt);
    if(inspect(candidate,attempt))return finish(candidate,'matched');
  }
  return finish(solution,performance.now()>=deadline-80?'matching_budget_exhausted':'no_valid_matching_candidate');
}
