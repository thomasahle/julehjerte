/** One public workflow. Choose routing from the artwork, never its filename. */
import {prepare} from './engine.js';
import {GENERAL_PRESET,DIRECT_PRESET} from './presets.js';
import {sampleTarget} from './input.js';
import {normalizeSymmetry,requestedSymmetry,settings} from './settings.js';
import {maskDisagreement,preferMatchingSolution} from './direct/prefer-matching.js';
import {fitDirect} from './direct/fit.js';
import {sampleWeave} from './validate.js';
import {buildGraph} from './graph.js';
import {solveGraph} from './solver.js';
import {materialAudit} from './material.js';
import {auditImageFeatures} from './image-features.js';
import {prepareBoundary} from './direct/topology.js';
import {boundarySVG} from './export.js';

/** Only the direct fitter enforces requested symmetries. transpose is the one
 * the traced routes already reproduce, through their identical-sheet grid; a
 * mirror, anti-transpose, half turn or within-curve request always routes to
 * the fitter, since the MILP route selects cuts from a traced candidate graph
 * that holds no mirrored partner to constrain. */
export const fitterOnlySymmetry=spec=>requestedSymmetry(spec).some(name=>name!=='transpose');

export function prepareAutomatic(input,raw,onProgress){
  const cfg={...DIRECT_PRESET,...raw,algorithm:'direct'},fitterOnly=fitterOnlySymmetry(normalizeSymmetry(raw.symmetry));
  let value;
  if(input.type==='svg'){
    value=prepare(input,{...GENERAL_PRESET,...raw,algorithm:'trace',identicalSheets:false},onProgress);
    const resolution=raw.resolution??400,mask=sampleTarget(value.target,resolution);
    value.target.sourceImage={mask,probability:Float32Array.from(mask),resolution};
    Object.assign(value.preview,{mask,resolution});
    value.target.metadata.automatic={route:'vector',reason:'Preserve original vector boundaries'};
  }else{
    value=prepare(input,cfg,onProgress);
    value.target.metadata.automatic={route:'direct',reason:'Joint cubic and straight-span refinement against the original classified image'};
    try{
      value.target.boundarySeed=prepareBoundary(value.target,settings(cfg));
      value.preview.boundaries=boundarySVG(value.target.boundarySeed);
      value.preview.metadata.originalBoundariesAvailable=value.target.boundarySeed.curves.length>0;
    }catch(error){value.target.metadata.automatic.boundaryEvidenceError=error.message;}
  }
  if(fitterOnly)value.target.metadata.automatic={...value.target.metadata.automatic,route:'direct',reason:'Fit the requested symmetry directly; the traced routes cannot constrain mirrored cuts'};
  value.preview.metadata={...value.preview.metadata,automatic:value.target.metadata.automatic};
  return value;
}

export async function solveAutomatic(target,cfg,onProgress){
  const start=performance.now(),route=target.metadata.automatic?.route||'direct',attempts=[];
  if(route!=='direct'&&fitterOnlySymmetry(cfg.symmetry))attempts.push({route,accepted:false,reason:'Requested symmetry is enforced by the direct fitter only'});
  else if(route==='vector'){
    const traceCfg=settings({...cfg,...GENERAL_PRESET,timeLimit:Math.max(.1,Math.min(3,cfg.timeLimit*.4))});
    try{
      onProgress({stage:'graph'});
      const graph=buildGraph(target,traceCfg,{onProgress}),solution=await solveGraph(graph,traceCfg,{onProgress,coefficientQuantum:1e-7,coreGate:traceCfg.requireMaterialCore?s=>materialAudit(s,traceCfg):null});
      const woven=sampleWeave(solution,target.sourceImage.resolution),error=maskDisagreement(target.sourceImage,woven);
      // <=1% is already within the matching allowance of any possible better
      // image fit (whose error cannot be negative). Keep the original mask.
      if(error<=Math.min(.01,cfg.maxImageError)&&auditImageFeatures(target.sourceImage,woven,cfg.width).passed){
        const selected=preferMatchingSolution(solution,traceCfg,{deadline:start+Math.min(10,cfg.timeLimit)*1000-400,onProgress});
        selected.automaticSettings=traceCfg;selected.report.automatic={selected:route,attempts};selected.report.seconds=(performance.now()-start)/1000;
        return selected;
      }
      attempts.push({route,imageError:error,accepted:false,reason:'Trace did not preserve enough of the original image'});
    }catch(error){attempts.push({route,accepted:false,error:error.message,solver:error.report});}
  }
  const direct={...target,curves:[],metadata:{...target.metadata,direct:true}};
  const solution=await fitDirect(direct,{...cfg,algorithm:'direct',timeLimit:Math.max(.1,cfg.timeLimit-(performance.now()-start)/1000)},onProgress);
  solution.report.automatic={selected:'direct',attempts};solution.report.seconds=(performance.now()-start)/1000;
  return solution;
}
