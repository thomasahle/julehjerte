import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';

// Approximate straight-span annotation of the Danish Things tree template,
// used only to render the input pixels. No reference paths enter the fitter.
// https://danishthings.com/wp-content/uploads/2022/11/Danish-Things-Julehjerte-med-juletrae-1.pdf
export function treeMask({noisyEdges=[],invert=false}={}){
  const vertices=[[[608,438],[608,823]],[[644,438],[644,515],[730,518],[692,548],[778,550],[736,582],[844,583],[794,618],[900,619],[839,696],[862,746],[862,823]],[[918,438],[918,823]]];
  const a=vertices.map(p=>p.map(([x,y])=>[(x-570)/385*100,(y-438)/385*100])).map(p=>p.slice(1).map((v,i)=>Cubic.line(p[i],v).p));
  const graph=new CurveGraph([a,a.map(p=>p.map(c=>c.map(([x,y])=>[y,x])))]),n=400;
  const mask=Uint8Array.from(sampleWeave(graph.solution(graph.points,1),n),v=>invert?1-v:v);
  for(const side of noisyEdges)for(let t=190;t<200;t++)for(let k=0;k<2;k++){
    const x=side%2?side===1?n-1-k:k:t,y=side%2?t:side===0?k:n-1-k;
    mask[y*n+x]^=1;
  }
  return mask;
}
