/** Offline candidate policy; no fitting score or annotation selects a crop. */
import {detectHeartCrops,supportedCropOutline} from '../../../static/inverse/core/crop.js';

function supported(detection){
 const candidate=detection?.candidates?.[0];
 return !!candidate&&supportedCropOutline(candidate.locator??detection.proposal);
}

export async function selectPhotoCrop(source,{learnedCrop,productionCrop=detectHeartCrops}={}){
 if(typeof learnedCrop!=='function')throw new TypeError('A learned crop provider is required.');
 const production=await productionCrop(source);
 const decision={policy:'supported-production-first',selected:'production',neuralAttempted:false,
  productionSupported:supported(production),learnedSupported:false};
 if(decision.productionSupported)return{production,detection:production,decision};
 decision.neuralAttempted=true;
 try{
  const learned=await learnedCrop(source);
  const quad=learned?.candidates?.[0]?.quad;
  // An extrapolated learned guess must not replace the current editable guess.
  const observed=Array.isArray(quad)&&quad.length===4&&quad.every(p=>Array.isArray(p)&&p.length===2&&
   p.every(Number.isFinite)&&p[0]>=0&&p[1]>=0&&p[0]<=source.imageWidth&&p[1]<=source.imageHeight);
  decision.learnedSupported=supported(learned);decision.learnedCornersObserved=observed;
  if(decision.learnedSupported&&observed){decision.selected='learned';return{production,detection:learned,decision};}
 }catch(error){decision.neuralError=error.message;}
 return{production,detection:production,decision};
}
