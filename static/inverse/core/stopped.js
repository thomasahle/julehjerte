/** Recheck owned checkpoint snapshots against the original prepared artwork.
 * Stopping never turns a progress picture into an unchecked printable result.
 */
import {loadSolutionJSON,solutionJSON} from './graph.js';
import {finish} from './engine.js';
import {validate,sampleWeave} from './validate.js';
import {materialAudit,verifiedPaperSettings} from './material.js';
import {sampleTarget} from './input.js';
import {referenceError} from './image-reference.js';
import {auditImageFeatures,imageFeatures} from './image-features.js';
import {matchingSummary} from './direct/matching.js';
import {symmetryReport} from './direct/symmetry.js';
import {loadNumericalKernel} from './numerical-kernel.js';
import {finalizeFittedSolution} from './direct/finalize.js';
import {matchingErrorLimit} from './direct/prefer-matching.js';

const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
export function stoppedWithoutCandidate(){
  const error=new Error('The search did not find a validated template before it was stopped.');
  error.report={status:'no_validated_solution',termination:'user_stop'};return error;
}

export async function finishStopped(target,cfg,packets,onProgress=()=>{},{cancelled=()=>false,yieldControl=yieldTask,startedAt=performance.now(),cleanup=finalizeFittedSolution}={}){
  const alive=()=>{if(cancelled())throw new DOMException('Cancelled','AbortError');};
  alive();if(!packets.length)throw stoppedWithoutCandidate();
  await loadNumericalKernel();alive();
  const source=target.sourceImage??{resolution:400,mask:sampleTarget(target,400)};
  const attachSource=solution=>{
    solution.graph.target.sourceImage=source;
    solution.graph.target.metadata={...target.metadata,input:'Stopped image fit',paperColors:solution.graph.target.metadata.paperColors};
    return solution;
  };
  const features=imageFeatures(source,cfg.width),seen=new Set(),valid=[];
  for(const [index,packet]of packets.entries()){
    if(index%4===0){await yieldControl();alive();}
    if(typeof packet.geometry!=='string'||seen.has(packet.geometry))continue;
    seen.add(packet.geometry);
    let solution;try{solution=loadSolutionJSON(packet.geometry);}catch{continue;}
    if(solution.graph.target.width!==cfg.width)continue;
    attachSource(solution);
    const geometry=validate(solution,cfg),symmetry=symmetryReport(solution,cfg.symmetry);
    if(!geometry.passed||symmetry.requested.some(name=>!symmetry.honoured.includes(name)))continue;
    onProgress({stage:'paper'});
    // The packet carries only a bounded resolution hint, never a cached pass.
    // Recheck these exact coordinates and all the original physical settings.
    const paperCfg=verifiedPaperSettings({report:{paperVerification:{resolution:packet.materialResolution}}},cfg);
    const paper=materialAudit(solution,paperCfg);
    if(cfg.requireMaterialCore&&!paper.passed)continue;
    if(paper.passed&&paperCfg.materialResolution>cfg.materialResolution)
      solution.report={paperVerification:{requestedResolution:cfg.materialResolution,resolution:paperCfg.materialResolution,status:'pass',source:'retained-checkpoint'}};
    const woven=sampleWeave(solution,source.resolution),error=referenceError(source,woven).mismatchFraction;
    if(!Number.isFinite(error))continue;
    const featuresPassed=auditImageFeatures(source,woven,cfg.width,features).passed;
    valid.push({solution,error,packet,featuresPassed,imagePassed:featuresPassed&&error<=cfg.maxImageError,identical:matchingSummary(solution).identical});
  }
  alive();if(!valid.length)throw stoppedWithoutCandidate();
  valid.sort((a,b)=>Number(b.imagePassed)-Number(a.imagePassed)||a.error-b.error||a.solution.graph.edges.length-b.solution.graph.edges.length);
  const first=valid[0],matching=cfg.preferMatchingSheets&&valid.find(v=>v.identical&&v.featuresPassed&&v.error<=matchingErrorLimit(first.error,cfg));
  const best=matching||first,ordered=[best,...valid.filter(v=>v!==best)];
  const alternatives=ordered.map(v=>({counts:v.solution.paths.map(p=>p.length),error:v.error,checkpointError:v.packet.error,geometry:v.packet.geometry}));
  best.solution.report={...best.solution.report,algorithm:'stopped-checkpoint',seconds:(performance.now()-startedAt)/1000,imported:false,termination:'user_stop',stoppedEarly:true,
    selectedCounts:best.solution.paths.map(p=>p.length),estimatedMaskMismatch:best.error,
    matchingPreference:{enabled:cfg.preferMatchingSheets,identical:best.identical,baselineImageError:first.error,additionalImageError:best.error-first.error,maximumAdditionalImageError:cfg.matchingErrorAllowance,maximumMatchingImageError:matchingErrorLimit(first.error,cfg)},
    alternativeErrorMethod:'Forward sampling against the original prepared source, including its validity mask and image-importance weights; checkpoint error retained separately.'};
  await yieldControl();alive();
  // Stop ends the global search, but a retained hat still needs the same exact
  // shared-cut repair and primitive cleanup as a normally completed fit. The
  // matching choice above uses already retained candidates, without a new fit.
  const beforeCleanup=structuredClone(best.solution.report);
  const finalized=cleanup(best.solution,cfg,{timeLimit:3.2,onProgress,searchMatching:false});
  const geometry=JSON.stringify(solutionJSON(finalized)),error=referenceError(source,sampleWeave(finalized,source.resolution)).mismatchFraction;
  const selected={...alternatives.find(a=>a.geometry===geometry),counts:finalized.paths.map(p=>p.length),error,geometry};
  const finalAlternatives=[selected,...alternatives.filter(a=>a.geometry!==geometry)];
  finalized.report.seconds=(performance.now()-startedAt)/1000;
  finalized.report.estimatedMaskMismatch=error;
  Object.assign(finalized.report.matchingPreference,matchingSummary(finalized),{selectedImageError:error,additionalImageError:error-first.error});
  await yieldControl();alive();
  const result=finish(finalized,cfg,onProgress,{refine:false,stoppedEarly:true,alternatives:finalAlternatives});
  const passed=value=>value.report.validation.passed&&(!cfg.requireMaterialCore||value.report.manufacturing.status==='pass')&&value.report.symmetry.requested.every(name=>value.report.symmetry.honoured.includes(name));
  if(passed(result))return result;
  // Never lose an independently validated checkpoint to a rejected cleanup.
  const fallback=attachSource(loadSolutionJSON(best.packet.geometry));
  fallback.report={...beforeCleanup,seconds:(performance.now()-startedAt)/1000,finalizationRejected:{geometry:result.report.validation.passed,paper:result.report.manufacturing.status,symmetry:result.report.symmetry}};
  const restored=finish(fallback,cfg,onProgress,{refine:false,stoppedEarly:true,alternatives});
  if(!passed(restored))throw stoppedWithoutCandidate();
  return restored;
}
