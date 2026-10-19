/** Refine an existing candidate without reverting its verified paper lattice. */
import {CurveGraph} from './curves.js';
import {refineCurves} from './refine.js';
import {materialAudit,verifiedPaperSettings} from '../material.js';
import {geometricMaterialAudit} from '../geometric-material.js';
import {requestedSymmetry} from '../settings.js';
import {outlineDetailPlan} from './outline-details.js';
import {featurePolishPlan} from './feature-details.js';
import {imageFeatures} from '../image-features.js';
import {paperRecoveryFamilies} from './paper-recovery.js';

export function polishCandidate(candidate,prob,n,cfg,options={}){
  const verification=candidate.paperVerification;
  // A coarser lattice has a larger numerical margin. Reverting to it pulls
  // a fine-verified boundary inward before optimization even starts.
  const polishingCfg=verifiedPaperSettings({report:{paperVerification:verification}},cfg);
  // A recovered opening can improve for only a few steps before a return
  // becomes too tight. Preserve those short valid steps, and keep distant
  // strips fixed so their paper margins cannot displace the useful checkpoint.
  const source=options.input?.sourceImage,independent=!options.weights&&!options.identicalSheets&&!requestedSymmetry(cfg.symmetry).length;
  const local=candidate.seed==='fitted-boundary-rerouting'&&candidate.imagePassed&&source&&independent
    ?featurePolishPlan(candidate.graph,candidate.points,source,imageFeatures(source,cfg.width),polishingCfg,n):null;
  // A valid coarse fit can sit just outside the image limit because its spans
  // cannot follow the outline yet. Subdivision only proposes extra parameters;
  // the caller still requires the unchanged source, feature and paper gates.
  const closeFeatureFit=candidate.geometryPassed&&candidate.paperPassed&&candidate.originalFeatures?.passed
    &&Number.isFinite(candidate.originalImageError)&&candidate.originalImageError<=cfg.maxImageError+.01;
  const detail=!local&&(candidate.imagePassed||closeFeatureFit)&&independent
    ?outlineDetailPlan(candidate.graph,candidate.points,candidate.phase,options.input?.sourceImage,polishingCfg):null;
  const graph=local?.graph||detail?.graph||new CurveGraph(candidate.graph.nested(candidate.points),cfg.width);
  // A raster pass can conceal a thin island, particularly across the fold.
  // Check every polishing pass while there is still time to change the curves.
  // Existing spans can hide the same disconnected cores as subdivided ones.
  // Temporary border locks must not prevent correcting a detected fold defect;
  // the graph's original endpoint constraints remain fixed.
  const paperRecovery={foldFamilies:[],localFamilies:[]};let releasedCoordinates=0;
  const paperAudit=cfg.requireMaterialCore?(solution,settings)=>{
    const lattice=materialAudit(solution,settings);
    if(lattice.status==='fail')return lattice;
    const offset=geometricMaterialAudit(solution,settings,{tolerance:.002,probeRadii:false});
    const recovery=paperRecoveryFamilies(offset,cfg.width);
    for(const family of recovery.foldFamilies){
      if(!paperRecovery.foldFamilies.includes(family)){
        paperRecovery.foldFamilies.push(family);
        if(detail)for(const path of graph.families[family])for(const[e]of graph.paths[path])for(const id of graph.edges[e]){
          if(cfg.width-graph.points[2*id+1-family]>detail.report.fixedBorderMm)continue;
          for(let axis=0;axis<2;axis++){
            const index=2*id+axis;
            if(graph.fixed[index]&&!detail.originalFixed[index]){graph.fixed[index]=0;releasedCoordinates++;}
          }
        }
      }
    }
    for(const family of recovery.localFamilies)if(!paperRecovery.localFamilies.includes(family))paperRecovery.localFamilies.push(family);
    const status=offset.status==='fail'?'fail':offset.status==='uncertain'?'uncertain':lattice.status;
    return{...lattice,status,passed:status==='pass',summary:{...lattice.summary,status,offset:offset.summary}};
  }:materialAudit;
  let polished;
  try{
    // An already fine-verified fit can still encounter lattice uncertainty.
    // Recheck that checkpoint before rollback, within the existing reserve;
    // the fitting forces and physical tolerances retain the incoming settings.
    polished=refineCurves(graph,local?.objective.probability||prob,n,candidate.phase,polishingCfg,{...options,
      ...(polishingCfg.materialResolution===700&&!local?{resolvePaperBeforeRollback:true,paperVerificationResolution:1000,paperVerificationReserve:250}:{}),
      ...(local?{weights:local.objective.weights,steps:Math.min(options.steps??16,16),checkpointEvery:4}:{}),...(detail?{rate:.035,retryPaperSeparation:true}:{}),
      ...(cfg.requireMaterialCore?{paperRecovery,paperAudit}:{}),onProgress:(r,solution)=>{
        const active=r.paperVerification||verification;
        if(active)solution.report={...solution.report,paperVerification:{...active,status:r.paper}};
        options.onProgress?.(r,solution);
      }});
  }finally{
    // The temporary scope must not constrain a later final repair or edit.
    if(local)graph.fixed.set(local.originalFixed);
  }
  // Keep the provenance of an earlier checked repair when polishing finds a
  // better checkpoint. Its current geometry and paper status are rechecked.
  const active=polished.paperVerification||verification;
  const outlineDetail=detail?{...detail.report,...(paperRecovery.foldFamilies.length||paperRecovery.localFamilies.length?{paperRecovery:{...paperRecovery,releasedCoordinates}}:{}),...(polished.paperSeparationRetry?{paperSeparationRetry:polished.paperSeparationRetry}:{})}:undefined;
  return{...polished,counts:candidate.counts,sharing:candidate.sharing,seed:candidate.seed,clampedFeatureRecovery:candidate.clampedFeatureRecovery,outlineDetail,localFeaturePolish:local?.report,
    ...(active?{paperVerification:{...active,status:polished.paper?.status}}:{})};
}
