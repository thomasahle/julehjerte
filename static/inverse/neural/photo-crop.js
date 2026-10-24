/** Whole-image automatic suggestions. Manual regions and corners stay explicit. */
import {detectHeartCrops} from '../core/crop.js';
import {fitHeartSilhouette,refineHeartOutline} from './heart-fit.js';
import {detectForegroundCrop} from './foreground-crop.js';
import {detectBodyCrop} from './body-crop.js';
import {selectWholeBodyPhotoCrop} from './crop-selection.js';
import {predictPaperBody} from './runtime.js';

/** The crops, each moved onto the heart's outline in the photograph where
 * that fits closely (refineHeartOutline): a found square's corners are
 * otherwise a percent or two of a side off, which costs a fine pattern several
 * percent of its cells. */
export async function detectPhotoCrops(input,options={}){
 const found=await detectUnrefinedPhotoCrops(input,options),candidates=found.candidates.map(candidate=>sharpenCrop(input,candidate,options.outline));
 return candidates.every((candidate,k)=>candidate===found.candidates[k])?found:{...found,candidates};
}

/** `candidate` with its quad on the outline, when the fit is close and near. */
export function sharpenCrop(input,candidate,{minLower=.5,minUpper=.2,maxRms=1,maxMove=.06,refine=refineHeartOutline}={}){
 let fit=null;
 try{fit=refine(input,candidate.quad);}catch{fit=null;}
 // Each of the square's four edges pinned: the lower ones along most of the
 // outline, the upper ones wherever cells of the other paper meet the lobe,
 // or else by the lobes' half circles.
 const pinned=fit?.edges&&fit.edges[0]>=minLower&&fit.edges[1]>=minLower&&(fit.edges[4]>=.7||fit.edges[2]>=minUpper&&fit.edges[3]>=minUpper);
 if(!fit||!(pinned&&fit.rms<=maxRms&&fit.moved<=maxMove))return candidate;
 return{...candidate,quad:fit.quad,provenance:{...candidate.provenance,outlineRefined:{rms:fit.rms,edges:fit.edges,moved:fit.moved}}};
}

async function detectUnrefinedPhotoCrops(input,{roi=input.roi,onProgress=()=>{},cancelled=()=>false,
 productionCrop=detectHeartCrops,predictBody=predictPaperBody,learnedCrop=detectForegroundCrop,outlineCrop=detectBodyCrop,silhouetteCrop=detectSilhouetteCrop}={}){
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
   learnedCrop:()=>learnedCrop(input,{...body,paletteMode:'confidence-weighted',outerBoundarySampling:true}),
   outlineCrop:()=>{check();return outlineCrop(input,{...body,outerBoundarySampling:true});}});
  check();const {decision,detection}=selected;
  // Nothing found: the heart's silhouette in the paper probability, which a
  // photograph's edge, a turn or a handle does not hide.
  if(!detection.candidates.length){
   const silhouette=silhouetteCrop(input,body);check();
   if(silhouette)return{...detection,status:'needs_review',candidates:[silhouette],bodyReview:decision};
  }
  const needsReview=decision.requiresReview||decision.selected==='learned';
  return{...detection,...(needsReview&&detection.candidates.length?{status:'needs_review'}:{}),
   candidates:detection.candidates.map(candidate=>({...candidate,
    status:needsReview?'needs_review':candidate.status??detection.status,
    needsReview:needsReview||candidate.needsReview===true,warnings:candidate.warnings??candidate.locator?.warnings??[],
    provenance:{...candidate.provenance,method:decision.selected==='outline'?'learned-paper-outline':decision.selected==='learned'?'learned-paper-body':candidate.provenance?.method,
     modelSha256:body.modelSha256,bodyReview:decision}})),
   bodyReview:decision};
 }catch(error){check();return{...production,bodyReview:{status:'unavailable',reason:error.message}};}
}

/** A crop from the silhouette fit (heart-fit.js) when it covers the paper
 * closely (IoU at least `minIou`). detectPhotoCrops then moves its corners
 * onto the outline like any other crop's. */
export function detectSilhouetteCrop(input,body,{minIou=.9}={}){
 const fit=fitHeartSilhouette(body);
 if(!fit||!(fit.iou>=minIou))return null;
 return{quad:fit.quad,status:'needs_review',needsReview:true,warnings:[],provenance:{method:'paper-silhouette',iou:fit.iou,lobes:fit.lobes,modelSha256:body.modelSha256,colourEvidenceUsed:false,humanReviewed:false}};
}
