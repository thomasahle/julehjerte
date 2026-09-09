/** Recheck owned checkpoint snapshots against the original prepared artwork.
 * Stopping never turns a progress picture into an unchecked printable result.
 */
import {loadSolutionJSON} from './graph.js';
import {finish} from './engine.js';
import {validate,sampleWeave} from './validate.js';
import {materialAudit} from './material.js';
import {sampleTarget} from './input.js';
import {referenceError} from './image-reference.js';
import {auditImageFeatures,imageFeatures} from './image-features.js';
import {matchingSummary} from './direct/matching.js';
import {symmetryReport} from './direct/symmetry.js';
import {loadNumericalKernel} from './numerical-kernel.js';

const yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0));
export function stoppedWithoutCandidate(){
  const error=new Error('The search did not find a validated template before it was stopped.');
  error.report={status:'no_validated_solution',termination:'user_stop'};return error;
}

export async function finishStopped(target,cfg,packets,onProgress=()=>{},{cancelled=()=>false,yieldControl=yieldTask,startedAt=performance.now()}={}){
  const alive=()=>{if(cancelled())throw new DOMException('Cancelled','AbortError');};
  alive();if(!packets.length)throw stoppedWithoutCandidate();
  await loadNumericalKernel();alive();
  const source=target.sourceImage??{resolution:400,mask:sampleTarget(target,400)};
  const features=imageFeatures(source,cfg.width),seen=new Set(),valid=[];
  for(const [index,packet]of packets.entries()){
    if(index%4===0){await yieldControl();alive();}
    if(typeof packet.geometry!=='string'||seen.has(packet.geometry))continue;
    seen.add(packet.geometry);
    let solution;try{solution=loadSolutionJSON(packet.geometry);}catch{continue;}
    if(solution.graph.target.width!==cfg.width)continue;
    solution.graph.target.sourceImage=source;
    solution.graph.target.metadata={...target.metadata,input:'Stopped image fit',paperColors:solution.graph.target.metadata.paperColors};
    const geometry=validate(solution,cfg),symmetry=symmetryReport(solution,cfg.symmetry);
    if(!geometry.passed||symmetry.requested.some(name=>!symmetry.honoured.includes(name)))continue;
    onProgress({stage:'paper'});
    const paper=materialAudit(solution,cfg);
    if(cfg.requireMaterialCore&&!paper.passed)continue;
    const woven=sampleWeave(solution,source.resolution),error=referenceError(source,woven).mismatchFraction;
    if(!Number.isFinite(error))continue;
    valid.push({solution,error,packet,featuresPassed:auditImageFeatures(source,woven,cfg.width,features).passed,identical:matchingSummary(solution).identical});
  }
  alive();if(!valid.length)throw stoppedWithoutCandidate();
  valid.sort((a,b)=>Number(b.featuresPassed)-Number(a.featuresPassed)||a.error-b.error||a.solution.graph.edges.length-b.solution.graph.edges.length);
  const first=valid[0],matching=cfg.preferMatchingSheets&&valid.find(v=>v.identical&&v.featuresPassed===first.featuresPassed&&v.error<=first.error+cfg.matchingErrorAllowance);
  const best=matching||first,ordered=[best,...valid.filter(v=>v!==best)];
  const alternatives=ordered.map(v=>({counts:v.solution.paths.map(p=>p.length),error:v.error,checkpointError:v.packet.error,geometry:v.packet.geometry}));
  best.solution.report={algorithm:'stopped-checkpoint',seconds:(performance.now()-startedAt)/1000,imported:false,termination:'user_stop',stoppedEarly:true,
    selectedCounts:best.solution.paths.map(p=>p.length),estimatedMaskMismatch:best.error,
    matchingPreference:{enabled:cfg.preferMatchingSheets,identical:best.identical,baselineImageError:first.error,additionalImageError:best.error-first.error,maximumAdditionalImageError:cfg.matchingErrorAllowance},
    alternativeErrorMethod:'Forward sampling against the original prepared source, including its validity mask and image-importance weights; checkpoint error retained separately.'};
  await yieldControl();alive();
  // Keep the selected checkpoint's geometry. All final checks and exports run;
  // an explicit stop does not start another optional hidden-curve optimization.
  return finish(best.solution,cfg,onProgress,{refine:false,stoppedEarly:true,alternatives});
}
