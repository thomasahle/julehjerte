/** Experimental review-required fallback for slightly clipped photographs.
 * Coverage is measured in the rectified overlap square, without image colors,
 * fitted paths or interpolation padding entering the decision.
 */
import {homography,convexQuad} from '../../../static/inverse/locator/math.js';
import {detectHeartCrops,supportedCropOutline} from '../../../static/inverse/core/crop.js';

export function overlapCoverage(quad,width,height) {
  if(![width,height].every(v=>Number.isInteger(v)&&v>0)||!Array.isArray(quad)||
    quad.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||
    !(convexQuad(quad,1)||convexQuad([...quad].reverse(),1)))return null;
  const square=[[0,0],[1,0],[1,1],[0,1]];
  let H;try{H=homography(square,quad);}catch{return null;}
  if(square.some(([x,y])=>H[6]*x+H[7]*y+1<=1e-9))return null;
  // Projective halfplanes pull back to straight halfplanes in the unit square.
  const planes=[[H[0],H[1],H[2]],[width*H[6]-H[0],width*H[7]-H[1],width-H[2]],
    [H[3],H[4],H[5]],[height*H[6]-H[3],height*H[7]-H[4],height-H[5]]];
  let polygon=square;
  for(const [a,b,c] of planes) {
    const output=[];
    for(let i=0;i<polygon.length;i++) {
      const p=polygon[i],q=polygon[(i+1)%polygon.length],u=a*p[0]+b*p[1]+c,v=a*q[0]+b*q[1]+c;
      if(u>=0)output.push(p);
      if((u>=0)!==(v>=0)){const t=u/(u-v);output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }
    polygon=output;
  }
  const area=Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-p[1]*q[0];},0))/2;
  const maximumExtrapolation=Math.max(...quad.flatMap(([x,y])=>[Math.max(0,-x,x-width)/width,Math.max(0,-y,y-height)/height]));
  return {observedFraction:Math.max(0,Math.min(1,area)),maximumExtrapolation};
}

export async function selectReviewedPhotoCrop(source,{learnedCrop,productionCrop=detectHeartCrops}={}) {
  if(typeof learnedCrop!=='function')throw new TypeError('A learned crop provider is required.');
  const production=await productionCrop(source),decision={policy:'retain-production-reviewed-partial-fallback-v1',
    selected:'production',neuralAttempted:false,minimumObservedFraction:.99,maximumExtrapolation:.05};
  // Preserve every existing editable proposal, including weak ones; the model
  // only adds a suggestion when the production detector returned none.
  if(production.candidates?.length)return {production,detection:production,decision};
  decision.neuralAttempted=true;
  try {
    const learned=await learnedCrop(source),candidate=learned?.candidates?.[0];
    decision.learnedSupported=!!candidate&&supportedCropOutline(candidate.locator??learned.proposal);
    decision.coverage=overlapCoverage(candidate?.quad,source.imageWidth,source.imageHeight);
    if(decision.learnedSupported&&decision.coverage&&decision.coverage.observedFraction>=decision.minimumObservedFraction&&
      decision.coverage.maximumExtrapolation<=decision.maximumExtrapolation) {
      decision.selected='learned';decision.requiresReview=true;
      return {production,detection:learned,decision};
    }
  }catch(error){decision.neuralError=error.message;}
  return {production,detection:production,decision};
}
