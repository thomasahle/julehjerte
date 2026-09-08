/** Alternative routing from the same classified image; no reference templates. */
import {preprocessMask} from './input.js';
import {buildGraph} from './graph.js';
import {solveGraph} from './solver.js';
import {sampleWeave,validate} from './validate.js';
import {materialAudit} from './material.js';
import {auditImageFeatures} from './image-features.js';

export async function recoverImageFeatures(input,cfg,seconds,onProgress=()=>{}){
  const start=performance.now(),report={method:'trace-milp',budgetSeconds:seconds,accepted:false,attempts:[]};
  try{
    onProgress({stage:'graph'});
    const source=input.sourceImage,target=preprocessMask(source.mask,source.resolution,{...cfg,algorithm:'trace',fitTolerance:.75,smoothRadius:.3,snapRadius:1.5,maxSpan:30,borderRadius:3},input.metadata.preprocessing);
    target.sourceImage=source;
    target.metadata.preprocessing.traceUsed=true;
    target.metadata.sourceImage=input.metadata.sourceImage;
    // Preserve every visible boundary. First reduce optional hidden connectors;
    // coarsening the contours themselves can remove necessary routing choices.
    const choices=[{neighbors:Math.min(8,cfg.neighbors),connectorVariants:1},{neighbors:cfg.neighbors,connectorVariants:cfg.connectorVariants}];
    let solution=null;
    for(let i=0;i<choices.length;i++){
      if(i&&choices[i].neighbors===choices[0].neighbors&&choices[i].connectorVariants===choices[0].connectorVariants)break;
      const at=performance.now(),graphCfg={...cfg,...choices[i]},graph=buildGraph(target,graphCfg,{onProgress}),remaining=seconds-(performance.now()-start)/1000;
      if(remaining<=0)break;
      const onlyChoice=choices[0].neighbors===choices[1].neighbors&&choices[0].connectorVariants===choices[1].connectorVariants,budget=i||onlyChoice?remaining:Math.min(2,remaining*.6),attempt={...choices[i],budgetSeconds:budget};report.attempts.push(attempt);
      try{
        solution=await solveGraph(graph,{...graphCfg,timeLimit:budget},{onProgress,coefficientQuantum:1e-7,stopAfterValidated:true,coreGate:cfg.requireMaterialCore?s=>materialAudit(s,cfg):null});
        attempt.solver=solution.report;break;
      }catch(error){attempt.error=error.message;attempt.solver=error.report;report.solver=error.report;}
      finally{attempt.seconds=(performance.now()-at)/1000;}
    }
    if(!solution)throw new Error('Feature recovery found no validated routing within its budget.');
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
