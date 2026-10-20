/** Rectify offline material predictions without turning photo padding into art.
 * Field windows and crop corners use source pixel edges. Observation follows
 * the production RGB sampler, independently of model confidence/body labels.
 * This helper is not imported by the application.
 */
import {rectifyWithCoverage} from '../../../static/inverse/core/input.js';
import {bilinear,homography,project} from '../../../static/inverse/locator/math.js';

/** A classifier may already operate on the exact rectified source RGB grid.
 * Preserve those binary decisions without another prediction-field resample.
 * Source coverage still comes from the production photographic sampler.
 */
export function fixedMaterialMask(source,mask,quad,resolution){
  if(mask?.length!==resolution**2||!Array.from(mask).every(v=>v===0||v===1))throw new Error('Invalid fixed material mask.');
  const {rgba,imageWidth,imageHeight}=source;
  const {rgb,validMask}=rectifyWithCoverage(rgba,imageWidth,imageHeight,resolution,quad);
  return{rgb,validMask,resolution,mask:Uint8Array.from(mask),
    probability:Float32Array.from(mask,(v,i)=>validMask?.[i] === 0 ? .5 : v)};
}

export function rectifyMaterialPrediction(source,prediction,quad,resolution=400){
  const {values,resolution:n,window}=prediction;
  if(!Number.isInteger(n)||n<2||values?.length!==n*n||!values.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||
    !Array.isArray(window)||window.length!==4||window.some(v=>!Number.isFinite(v))||window[2]<=window[0]||window[3]<=window[1])throw new Error('Invalid material prediction or source window.');
  const {rgba,imageWidth,imageHeight}=source;
  // The caller supplies a full-photo prediction, possibly with letterboxing.
  // A narrower prediction must not silently hide photographed target pixels.
  // Inverting the letterbox scale can undershoot an exact source edge by an
  // ulp (3730 becomes 3729.9999999999995). Accept only arithmetic roundoff;
  // keep the supplied sampling coordinates and RGB observation mask unchanged.
  const roundoff=8*Number.EPSILON*Math.max(1,imageWidth,imageHeight);
  if(window[0]>roundoff||window[1]>roundoff||window[2]<imageWidth-roundoff||window[3]<imageHeight-roundoff)throw new Error('Prediction window must contain the source photograph.');
  const corners=quad??[[0,0],[imageWidth,0],[imageWidth,imageHeight],[0,imageHeight]];
  const {rgb,validMask}=rectifyWithCoverage(rgba,imageWidth,imageHeight,resolution,corners);
  const h=homography([[0,0],[1,0],[1,1],[0,1]],corners),probability=new Float32Array(resolution**2).fill(.5),mask=new Uint8Array(resolution**2);
  // The inverse transform can likewise place an exact boundary sample an ulp
  // outside the field. Do not replace it with the unknown (.5) fill value.
  const sampleRoundoff=8*Number.EPSILON*n;
  const sampleCoordinate=v=>Math.abs(v)<=sampleRoundoff?0:Math.abs(v-(n-1))<=sampleRoundoff?n-1:v;
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    const i=y*resolution+x;if(validMask&&!validMask[i])continue;
    const [sx,sy]=project(h,[(x+.5)/resolution,(y+.5)/resolution]);
    probability[i]=bilinear(values,n,n,sampleCoordinate((sx-window[0])*n/(window[2]-window[0])-.5),sampleCoordinate((sy-window[1])*n/(window[3]-window[1])-.5),.5);
    mask[i]=Number(probability[i]>=.5);
  }
  return{rgb,probability,mask,validMask,resolution};
}
