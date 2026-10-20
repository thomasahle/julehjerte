/** Offline whole-paper evidence for a crop proposal. No motif or fitting loss.
 * The probability grid and candidate coordinates both describe source pixels;
 * only observed pixels count, so clipped photographs are not padded with paper.
 */
import {supportedCropOutline,detectHeartCrops} from '../../../static/inverse/core/crop.js';
import {overlapCoverage} from './partial-photo-crop.mjs';

export const WHOLE_BODY_LIMITS=Object.freeze({recall:.85,precision:.80,diceImprovement:.05,minimumMass:100,probabilityPower:4});

export function wholeBodyEvidence(candidate,{probability,resolution,window,imageWidth,imageHeight}){
 if(!Number.isInteger(resolution)||resolution<2||resolution>1024||probability?.length!==resolution**2||
  !probability.every(p=>Number.isFinite(p)&&p>=0&&p<=1)||
  !Array.isArray(window)||window.length!==4||!window.every(Number.isFinite)||window[2]<=window[0]||window[3]<=window[1]||
  ![imageWidth,imageHeight].every(v=>Number.isInteger(v)&&v>=1))throw new TypeError('Require finite body probabilities and source coordinates.');
 const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
 if(!candidate||candidate.quad?.length!==4||!candidate.quad.every(validPoint)||candidate.outline?.length!==4||
  !candidate.outline.every(s=>Array.isArray(s)&&s.length>=2&&s.length<=4096&&s.every(validPoint)))
  return{status:'unavailable',passed:false,reason:'No complete source-coordinate outline.'};
 // Locator contours omit the actual corners; explicitly insert them between
 // the two sampled lobes and two lower sides, in their documented cyclic order.
 const polygon=candidate.outline.flatMap((segment,i)=>[candidate.quad[i],...segment]);
 const n=resolution,dx=(window[2]-window[0])/n,dy=(window[3]-window[1])/n;
 let bodyMass=0,intersectionMass=0,outlinePixels=0,observedPixels=0;
 for(let y=0;y<n;y++){
  const sy=window[1]+(y+.5)*dy;if(sy<0||sy>=imageHeight)continue;
  const crossings=[];
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i],b=polygon[(i+1)%polygon.length];
   if((a[1]>sy)!==(b[1]>sy))crossings.push(a[0]+(sy-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  crossings.sort((a,b)=>a-b);let edge=0;
  for(let x=0;x<n;x++){
   const sx=window[0]+(x+.5)*dx;if(sx<0||sx>=imageWidth)continue;
   while(edge<crossings.length&&crossings[edge]<=sx)edge++;
   const mass=probability[y*n+x]**WHOLE_BODY_LIMITS.probabilityPower;
   observedPixels++;bodyMass+=mass;
   if(edge%2){outlinePixels++;intersectionMass+=mass;}
  }
 }
 const usable=bodyMass>=WHOLE_BODY_LIMITS.minimumMass&&outlinePixels>0;
 const recall=bodyMass?intersectionMass/bodyMass:0,precision=outlinePixels?intersectionMass/outlinePixels:0;
 return{status:usable?'measured':'unavailable',passed:usable&&recall>=WHOLE_BODY_LIMITS.recall&&precision>=WHOLE_BODY_LIMITS.precision,
  recall,precision,dice:bodyMass+outlinePixels?2*intersectionMass/(bodyMass+outlinePixels):0,
  bodyMass,intersectionMass,outlinePixels,observedPixels,probabilityPower:WHOLE_BODY_LIMITS.probabilityPower,
  scope:'Agreement with an estimated whole-paper body, not original artwork or a guarantee of correct corners.'};
}

export async function selectWholeBodyPhotoCrop(source,{body,learnedCrop,productionCrop=detectHeartCrops}={}){
 if(typeof learnedCrop!=='function')throw new TypeError('A learned crop provider is required.');
 const production=await productionCrop(source),candidate=production.candidates?.[0];
 const evidence=c=>wholeBodyEvidence(c,{...body,imageWidth:source.imageWidth,imageHeight:source.imageHeight});
 const decision={policy:'review-whole-body-crop-v1',selected:'production',neuralAttempted:false,
  limits:WHOLE_BODY_LIMITS,productionSupported:!!candidate&&supportedCropOutline(candidate.locator??production.proposal),
  productionBody:evidence(candidate),requiresReview:false};
 if(decision.productionSupported&&decision.productionBody.passed)return{production,detection:production,decision};
 decision.requiresReview=true;decision.neuralAttempted=true;
 try{
  const learned=await learnedCrop(source),alternative=learned?.candidates?.[0];
  decision.learnedSupported=!!alternative&&supportedCropOutline(alternative.locator??learned.proposal);
  decision.learnedBody=evidence(alternative);
  decision.coverage=overlapCoverage(alternative?.quad,source.imageWidth,source.imageHeight);
  decision.bodyImproved=!candidate||decision.productionBody.status!=='measured'||
   decision.learnedBody.dice>=decision.productionBody.dice+WHOLE_BODY_LIMITS.diceImprovement;
  if(decision.learnedSupported&&decision.learnedBody.passed&&decision.bodyImproved&&decision.coverage?.observedFraction>=.99&&decision.coverage.maximumExtrapolation<=.05){
   decision.selected='learned';return{production,detection:learned,decision};
  }
 }catch(error){decision.neuralError=error.message;}
 // Preserve editable alternatives even when evidence is weak. Replacing an
 // existing crop requires a supported, substantially better full-body fit.
 return{production,detection:production,decision};
}
