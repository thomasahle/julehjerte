/** Source-only confidence in larger motif enclosures. A checker junction can
 * split a raster region without providing a stable surrounding colour band.
 * This is a confidence heuristic, not a proof of the original artwork. */
import {distanceTransform} from './material.js';
import {sourceWeights} from './image-reference.js';

const cache=new WeakMap();

function reachable(grown,observed,n){
  const reached=new Uint8Array(grown.length),queue=new Int32Array(grown.length);let tail=0;
  const add=i=>{if(grown[i]&&!reached[i]){reached[i]=1;queue[tail++]=i;}};
  for(let i=0;i<grown.length;i++)if(!observed[i]||i<n||i>=n*(n-1)||i%n===0||i%n===n-1)add(i);
  for(let head=0;head<tail;head++){
    const i=queue[head],x=i%n,y=Math.floor(i/n);
    if(x)add(i-1);if(x+1<n)add(i+1);if(y)add(i-n);if(y+1<n)add(i+n);
  }
  return reached;
}

function enclosureSupport(source){
  const {mask,resolution:n}=source,weights=sourceWeights(source),observed=Uint8Array.from(mask,(_,i)=>Number(!weights||weights[i]>0));
  const saved=cache.get(source);
  // Inputs can be reused by an editor. Object identity alone must not retain
  // a confidence decision after pixels or the observed region have changed.
  if(saved?.n===n&&saved.mask.length===mask.length&&saved.mask.every((v,i)=>v===mask[i]&&saved.observed[i]===observed[i]))return saved;
  // Use the substantial-feature core scale, with half a pixel diagonal as a
  // sampling guard. Near point contacts are ambiguous; broad bands survive.
  const radiusPixels=Math.max(1.5,.005*n)+Math.SQRT1_2;
  const borderReachable=[0,1].map(value=>{
    const distance=distanceTransform(Uint8Array.from(mask,(v,i)=>Number(v===value||!observed[i])),n,n);
    return reachable(Uint8Array.from(distance,d=>Number(d<=radiusPixels**2)),observed,n);
  });
  const result={n,mask:mask.slice(),observed,radiusPixels,borderReachable};cache.set(source,result);return result;
}

/** Larger-feature enclosure evidence; small-feature protection is separate.
 * Same-colour neighbours may merge inside a protected group. What matters here
 * is whether that group can reach the square or an unobserved region after a
 * small dilation. No source or predicted pixels are changed. */
export function stableInteriorFeatures(source,features,cfg){
  if(!source)return [];
  const n=source.resolution,scale=cfg.width/n;
  const candidates=features.filter(f=>f.areaMm2>4*cfg.nominalWidth**2&&f.pixels.every(i=>
    Math.min(i%n+.5,Math.floor(i/n)+.5,n-i%n-.5,n-Math.floor(i/n)-.5)*scale>cfg.nominalWidth));
  if(!candidates.length)return [];
  const support=enclosureSupport(source);
  return candidates.filter(f=>f.pixels.every(i=>source.mask[i]===f.value&&support.observed[i]&&!support.borderReachable[f.value][i]));
}
