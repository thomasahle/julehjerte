/** Alternative routing from the same classified image; no reference templates. */
import {preprocessMask} from './input.js';
import {buildGraph} from './graph.js';
import {solveGraph} from './solver.js';
import {sampleWeave,validate} from './validate.js';
import {materialAudit} from './material.js';
import {auditImageFeatures} from './image-features.js';

export async function recoverImageFeatures(input,cfg,seconds,onProgress=()=>{}){
  const start=performance.now(),report={method:'trace-milp',budgetSeconds:seconds,accepted:false};
  try{
    onProgress({stage:'graph'});
    const source=input.sourceImage,target=preprocessMask(source.mask,source.resolution,{...cfg,algorithm:'trace',fitTolerance:.75,smoothRadius:.3,snapRadius:1.5,maxSpan:30,borderRadius:3},input.metadata.preprocessing);
    target.sourceImage=source;
    target.metadata.preprocessing.traceUsed=true;
    target.metadata.sourceImage=input.metadata.sourceImage;
    const graph=buildGraph(target,cfg,{onProgress}),remaining=seconds-(performance.now()-start)/1000;
    if(remaining<=0)throw new Error('Feature recovery used its budget while preparing the candidate graph.');
    const solution=await solveGraph(graph,{...cfg,timeLimit:remaining},{onProgress,coefficientQuantum:1e-7,coreGate:cfg.requireMaterialCore?s=>materialAudit(s,cfg):null});
    const woven=sampleWeave(solution,source.resolution);
    let mismatch=0,observed=0;for(let i=0;i<woven.length;i++){if(source.validMask&&!source.validMask[i])continue;observed++;mismatch+=woven[i]!==source.mask[i];}
    report.imageError=mismatch/observed;report.features=auditImageFeatures(source,woven,cfg.width);
    report.geometryPassed=validate(solution,cfg).passed;report.paperPassed=materialAudit(solution,cfg).passed;
    report.accepted=report.imageError<=cfg.maxImageError&&report.features.passed&&report.geometryPassed&&(!cfg.requireMaterialCore||report.paperPassed);
    report.solver=solution.report;
    if(report.accepted)return{solution,report};
  }catch(error){report.error=error.message;report.solver=error.report;}
  finally{report.seconds=(performance.now()-start)/1000;}
  return{solution:null,report};
}
