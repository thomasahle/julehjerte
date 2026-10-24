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
 * percent of its cells. The silhouette fit is a second start. */
export async function detectPhotoCrops(input,options={}){
 let body=null;
 const found=await detectUnrefinedPhotoCrops(input,{...options,onBody:value=>{body=value;}});
 let silhouette=null;
 try{silhouette=body?fitHeartSilhouette(body):null;}catch{silhouette=null;}
 const starts=silhouette&&silhouette.iou>=.9?[silhouette.quad]:[];
 const candidates=found.candidates.map(candidate=>sharpenCrop(input,candidate,{starts,...options.outline}));
 return candidates.every((candidate,k)=>candidate===found.candidates[k])?found:{...found,candidates};
}

/** `candidate` with its quad on the outline, when the fit is close and near.
 * A fit whose lobes' half circles hold (a drawn heart) wins, from the
 * candidate or from one of `starts`: only they tell the square's upper edge
 * from a band of the lobe's own colour along it, which a crop can take for
 * the edge. Otherwise the fit from the candidate must pin all four edges. */
export function sharpenCrop(input,candidate,{starts=[],minLower=.5,minUpper=.2,maxRms=1,maxMove=.06,maxArcMove=.12,refine=refineHeartOutline}={}){
 const q=candidate.quad,side=Math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1]);
 const fits=[q,...starts].map((start,k)=>{
  let fit=null;
  try{fit=refine(input,start);}catch{fit=null;}
  if(!fit?.edges)return null;
  return{...fit,own:k===0,moved:Math.max(...fit.quad.map((p,i)=>Math.hypot(p[0]-q[i][0],p[1]-q[i][1])))/side};
 }).filter(Boolean);
 const lower=f=>f.edges[0]>=minLower&&f.edges[1]>=minLower&&f.rms<=maxRms;
 const round=fits.filter(f=>lower(f)&&f.edges[4]>=.7&&f.moved<=maxArcMove).sort((a,b)=>a.rms-b.rms)[0];
 const fit=round??fits.find(f=>f.own&&lower(f)&&f.edges[2]>=minUpper&&f.edges[3]>=minUpper&&f.moved<=maxMove);
 if(!fit)return candidate;
 return{...candidate,quad:fit.quad,provenance:{...candidate.provenance,outlineRefined:{rms:fit.rms,edges:fit.edges,moved:fit.moved}}};
}

async function detectUnrefinedPhotoCrops(input,{roi=input.roi,onProgress=()=>{},cancelled=()=>false,onBody=()=>{},
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
  onBody(body);
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
