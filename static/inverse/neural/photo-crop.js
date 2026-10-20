/** Whole-image automatic suggestions. Manual regions and corners stay explicit. */
import {detectHeartCrops} from '../core/crop.js';
import {detectForegroundCrop} from './foreground-crop.js';
import {selectWholeBodyPhotoCrop} from './crop-selection.js';
import {predictPaperBody} from './runtime.js';

export async function detectPhotoCrops(input,{roi=input.roi,onProgress=()=>{},cancelled=()=>false,
 productionCrop=detectHeartCrops,predictBody=predictPaperBody,learnedCrop=detectForegroundCrop}={}){
 const production=await productionCrop(input,{roi,onProgress});
 const check=()=>{if(cancelled())throw new DOMException('Cancelled','AbortError');};check();
 // An explicit selection identifies an instance. Whole-image saliency must
 // not override it. A colour-based crowded-frame warning, however, can be a
 // false split of one heart; the learned locator applies its own component
 // and whole-body checks before replacing that unresolved suggestion.
 if(roi)return production;
 try{
  const body=await predictBody(input);check();if(!body)return production;
  const selected=await selectWholeBodyPhotoCrop(input,{body,weighting:'balanced-confidence',productionCrop:()=>production,
   learnedCrop:()=>learnedCrop(input,{...body,paletteMode:'confidence-weighted',outerBoundarySampling:true})});
  check();const {decision,detection}=selected;
  const needsReview=decision.requiresReview||decision.selected==='learned';
  return{...detection,...(needsReview&&detection.candidates.length?{status:'needs_review'}:{}),
   candidates:detection.candidates.map(candidate=>({...candidate,
    status:needsReview?'needs_review':candidate.status??detection.status,
    needsReview:needsReview||candidate.needsReview===true,warnings:candidate.warnings??candidate.locator?.warnings??[],
    provenance:{...candidate.provenance,method:decision.selected==='learned'?'learned-paper-body':candidate.provenance?.method,
     modelSha256:body.modelSha256,bodyReview:decision}})),
   bodyReview:decision};
 }catch(error){check();return{...production,bodyReview:{status:'unavailable',reason:error.message}};}
}
