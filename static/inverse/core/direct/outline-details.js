/** Add local curve freedom without disturbing an already verified fold.
 * The residual selects parameters only; the original image remains the loss.
 */
import {Cubic} from '../bezier.js';
import {distanceTransform} from '../material.js';
import {sampleWeave} from '../validate.js';
import {CurveGraph} from './curves.js';

export function outlineDetailPlan(graph,points,phase,source,cfg){
  if(!source?.mask||source.weights)return null;
  const n=source.resolution,w=cfg.width,band=4*cfg.minWidth,halo=cfg.nominalWidth,maximumLength=2*cfg.minWidth;
  if(!(maximumLength>0)||band>=w/2)return null;
  const woven=sampleWeave(graph.solution(points,phase),n);
  const correct=Uint8Array.from(woven,(v,i)=>Number(v===source.mask[i]));
  // Erode the disagreement by half a millimetre at the usual 2 mm cutting
  // width. Thin classification fringes must not request extra curve pieces.
  const depth=distanceTransform(correct,n,n),minimumDepth=(cfg.minWidth*n/(4*w))**2;
  const stride=n+1,integral=new Uint32Array(stride*stride);let residual=0;
  for(let y=0;y<n;y++){
    let row=0;
    for(let x=0;x<n;x++){
      const inner=Math.min(x+.5,y+.5,n-x-.5,n-y-.5)*w/n>band;
      const bad=inner&&depth[y*n+x]>minimumDepth;
      row+=bad;residual+=bad;integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
    }
  }
  if(residual<.0005*n*n)return null;
  const near=curve=>{
    const xs=curve.p.map(p=>p[0]),ys=curve.p.map(p=>p[1]);
    const bound=v=>Math.max(0,Math.min(n,v));
    const x0=bound(Math.floor((Math.min(...xs)-halo)*n/w)),y0=bound(Math.floor((Math.min(...ys)-halo)*n/w));
    const x1=bound(Math.ceil((Math.max(...xs)+halo)*n/w)),y1=bound(Math.ceil((Math.max(...ys)+halo)*n/w));
    return integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0]>0;
  };
  let added=0;
  const split=(curve,depth=0)=>{
    if(depth>=8||added>=128||curve.length()<=maximumLength||!near(curve))return [curve.p];
    added++;return curve.split().flatMap(c=>split(c,depth+1));
  };
  const pieces=graph.controls(points).map(p=>split(new Cubic(p)));
  // Keep the incumbent when this bounded pass cannot cover all its residuals.
  if(!added||added>=128)return null;
  const detailed=new CurveGraph(graph.families.map(f=>f.map(pi=>graph.paths[pi].flatMap(([e,d])=>d===1?pieces[e]:pieces[e].toReversed().map(p=>p.toReversed())))),w);
  const originalFixed=detailed.fixed.slice();
  let frozenCoordinates=0;
  for(let i=0;i<detailed.points.length;i+=2){
    const x=detailed.points[i],y=detailed.points[i+1];
    if(Math.min(x,y,w-x,w-y)<band){detailed.fixed[i]=detailed.fixed[i+1]=1;frozenCoordinates+=2;}
  }
  return{graph:detailed,originalFixed,report:{residualCoreFraction:residual/(n*n),addedCurves:added,fixedBorderMm:band,maximumLengthMm:maximumLength,frozenCoordinates}};
}
