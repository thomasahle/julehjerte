import {quantile} from './math.js';

/** Measure an RGB difference in units of the observed colour variation.
 * The covariance supplied by correlatedBackground includes a positive ridge.
 * Use the same metric for segmentation and physical-edge refinement: a shadow
 * can have a strong RGB step while remaining an ordinary background colour.
 */
export function colorDifferenceMetric(covariance){
  const L=Array.from({length:3},()=>[0,0,0]);
  for(let r=0;r<3;r++)for(let c=0;c<=r;c++){
    let value=covariance[r][c];for(let k=0;k<c;k++)value-=L[r][k]*L[c][k];
    L[r][c]=r===c?Math.sqrt(value):value/L[c][c];
  }
  return delta=>{
    const z=[];
    for(let r=0;r<3;r++){let value=delta[r];for(let c=0;c<r;c++)value-=L[r][c]*z[c];z.push(value/L[r][r]);}
    return Math.hypot(...z);
  };
}

/** Learn correlated RGB variation at the image border. Shading can move all
 * channels together without making an equally large change of hue plausible.
 * A small ridge keeps uniform/quantized backgrounds well conditioned.
 * This is an empirical color distance, not a calibrated probability model.
 */
export function correlatedBackground(samples){
  if(samples.length<80)return null;
  const median=[0,1,2].map(c=>quantile(samples.map(p=>p[c]),.5));
  const distances=samples.map(p=>Math.hypot(...p.map((v,c)=>v-median[c])));
  const radius=quantile(distances,.8),core=samples.filter((_,i)=>distances[i]<=radius);
  const mean=[0,1,2].map(c=>core.reduce((sum,p)=>sum+p[c],0)/core.length);
  const covariance=Array.from({length:3},(_,r)=>[0,1,2].map(c=>core.reduce((sum,p)=>sum+(p[r]-mean[r])*(p[c]-mean[c]),0)/core.length+(r===c?.01**2:0)));
  // Cholesky whitening avoids a fragile explicit inverse of a near-rank-one
  // lighting covariance. The positive diagonal ridge guarantees a solution.
  const difference=colorDifferenceMetric(covariance),distance=p=>difference(p.map((v,c)=>v-mean[c]));
  const outlierFraction=samples.filter(p=>distance(p)>3.5).length/samples.length;
  if(outlierFraction>.18)return null;
  return{mean,covariance,outlierFraction,distance};
}
