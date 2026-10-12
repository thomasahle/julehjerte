/** Extra curve freedom around small interior details, after the routing fits.
 * Subdivision is exact and shared edges are split once for both sheets.
 * The surrounding opposite colour receives the same image weight as the
 * feature itself: retaining its pixels alone permits inflated or open shapes.
 */
import {Cubic} from '../bezier.js';
import {distanceTransform} from '../material.js';
import {CurveGraph} from './curves.js';
import {resizeObjective} from './image-objective.js';
import {smallInteriorFeatures} from '../feature-shapes.js';
export {smallInteriorFeatures} from '../feature-shapes.js';

export function featureDetailPlan(graph,points,source,features,cfg,n=256){
  const selected=smallInteriorFeatures(source,features,cfg);
  if(!selected.length)return null;
  const regions=selected.map(f=>({center:f.centerMm,radius:Math.sqrt(f.areaMm2/Math.PI)+cfg.nominalWidth}));
  const maximumLength=Math.max(cfg.minWidth,2*cfg.width/source.resolution);
  let added=0;
  const split=(curve,depth=0)=>{
    const near=regions.some(({center:[x,y],radius:r})=>Math.min(...curve.p.map(p=>p[0]))<=x+r&&Math.max(...curve.p.map(p=>p[0]))>=x-r&&Math.min(...curve.p.map(p=>p[1]))<=y+r&&Math.max(...curve.p.map(p=>p[1]))>=y-r);
    if(!near||curve.length()<=maximumLength||depth===8||added>=64)return [curve.p];
    added++;return curve.split().flatMap(c=>split(c,depth+1));
  };
  const pieces=graph.controls(points).map(p=>split(new Cubic(p)));
  // Abort a crowded proposal rather than arbitrarily detailing only the first
  // few regions. The ordinary candidate remains available and unchanged.
  if(!added||added>=64)return null;
  const detailed=new CurveGraph(graph.families.map(f=>f.map(pi=>graph.paths[pi].flatMap(([e,d])=>d===1?pieces[e]:pieces[e].toReversed().map(p=>p.toReversed())))),graph.width);
  const weights=new Float64Array(source.mask.length).fill(1/16),centres=new Uint8Array(source.mask.length);
  for(const feature of features)for(const pixel of feature.pixels)weights[pixel]=1;
  for(const feature of selected)for(const pixel of feature.pixels)centres[pixel]=1;
  const haloMm=cfg.minWidth/2,haloPixels=haloMm*source.resolution/cfg.width,distance=distanceTransform(centres,source.resolution,source.resolution);
  for(let i=0;i<weights.length;i++)if(distance[i]<=haloPixels**2)weights[i]=1;
  const objective=resizeObjective(source.probability||Float32Array.from(source.mask),source.resolution,n,weights);
  return{graph:detailed,objective,report:{regions:regions.length,addedCurves:added,maximumLengthMm:maximumLength,haloMm}};
}
