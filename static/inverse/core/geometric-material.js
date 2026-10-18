/** Fine unfolded-paper check for final candidates. The worker loads this
 * backend with the engine; merely opening the editor does not load it. */
import factory from '../vendor/clipper2/clipper2z.mjs';
import {createOffsetPaperAudit,exportedPaperPaths} from './paper-offset.js';
import {solutionJSON} from './graph.js';
import {materialAudit} from './material.js';

let inspect=null,unavailable=null;
try{
  // Keep this relative URL at runtime: bundlers must not turn the Node
  // filesystem path into an HTTP asset URL during application tests.
  const binaryPath='../vendor/clipper2/clipper2z.wasm';
  const url=new URL(binaryPath,import.meta.url);
  const bytes=typeof process!=='undefined'&&process.versions?.node
    ?await(await import('node:fs/promises')).readFile(url)
    :await(await fetch(url)).arrayBuffer();
  inspect=createOffsetPaperAudit(await factory({wasmBinary:bytes}));
}catch(error){unavailable=error.message;}

function samePaths(a,b){return a.length===b.length&&a.every((line,i)=>line.length===b[i].length&&line.every((p,j)=>p[0]===b[i][j][0]&&p[1]===b[i][j][1]));}
const statusOf=values=>values.every(v=>v==='pass')?'pass':values.some(v=>v==='fail')?'fail':'uncertain';

export function geometricMaterialAudit(solution,cfg,{includePolygons=false,tolerance=.0005,probeRadii=true}={}){
  const start=performance.now();
  const summary={status:'uncertain',method:'Round polygon offsets of adaptively flattened unfolded cuts (Clipper2)',flatteningTolerance:tolerance,arcTolerance:tolerance,
    nominalDiameter:cfg.nominalWidth,requiredRemainingWidth:cfg.minWidth,minFeatureArea:cfg.minFeatureArea,families:[],
    limitations:['Finite flattening and radius probes, not an exact topology or physical strength certificate.','Offset topology need not vary monotonically with radius; passing probes do not certify all intermediate radii.','Features below the stated core-area threshold are not certified.']};
  if(!inspect){summary.unavailable=unavailable;summary.seconds=(performance.now()-start)/1000;return{passed:false,status:'uncertain',families:[],summary};}
  try{
    const data=solutionJSON(solution),width=data.square_width_mm,radius=cfg.nominalWidth/2,lines=[0,1].map(f=>exportedPaperPaths(data,f,tolerance));
    const deltas=probeRadii?[0,-tolerance,tolerance]:[0];
    const evaluate=(paths,family)=>{
      const probes=deltas.map(delta=>({delta,...inspect(paths,width,radius+delta,cfg.minFeatureArea,{arcTolerance:tolerance,includePolygons:includePolygons&&delta===0})}));
      const status=probes.every(p=>p.passed)?'pass':probes.every(p=>!p.passed)?'fail':'uncertain';
      return{family,status,...probes[0],passed:status==='pass',probes:probes.map(({delta,passed,significantFloatingCount,significantFloatingArea,foldIntervals})=>({delta,passed,significantFloatingCount,significantFloatingArea,foldIntervals}))};
    };
    const first=evaluate(lines[0],0),families=[first,samePaths(lines[0],lines[1])?{...structuredClone(first),family:1}:evaluate(lines[1],1)],status=statusOf(families.map(f=>f.status));
    summary.status=status;summary.families=families.map(({family,status,significantFloatingCount,significantFloatingArea,foldIntervals,probes})=>({family,status,significantFloatingCount,significantFloatingArea,foldIntervals,probes}));
    summary.seconds=(performance.now()-start)/1000;
    return{passed:status==='pass',status,families,summary};
  }catch(error){
    summary.unavailable=error.message;summary.seconds=(performance.now()-start)/1000;
    return{passed:false,status:'uncertain',families:[],summary};
  }
}

/** Retain the existing lattice rule as well as the geometric check. Raster
 * maps remain explicitly labelled as lattice diagnostics, not offset results. */
export function finalMaterialAudit(solution,cfg,{includeMaps=false,...options}={}){
  const lattice=materialAudit(solution,cfg,{includeMaps}),offset=geometricMaterialAudit(solution,cfg,{includePolygons:includeMaps,...options}),status=statusOf([lattice.status,offset.status]);
  return{...lattice,offset,passed:status==='pass',status,summary:{...lattice.summary,status,method:'Guarded lattice and independent unfolded polygon offsets',latticeStatus:lattice.status,offset:offset.summary,seconds:lattice.summary.seconds+offset.summary.seconds}};
}
