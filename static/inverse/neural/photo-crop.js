/** Whole-image automatic suggestions. Manual regions and corners stay explicit. */
import {detectHeartCrops} from '../core/crop.js';
import {fitHeartSilhouette,refineHeartOutline,backgroundBody} from './heart-fit.js';
import {detectForegroundCrop} from './foreground-crop.js';
import {detectBodyCrop} from './body-crop.js';
import {selectWholeBodyPhotoCrop} from './crop-selection.js';
import {predictPaperBody} from './runtime.js';

/** The crops, each moved onto the heart's outline in the photograph where
 * that fits closely (refineHeartOutline): a found square's corners are
 * otherwise a percent or two of a side off, which costs a fine pattern several
 * percent of its cells. The silhouette fit is a second start, and its
 * agreement says whether a crop needs review (checkedBySilhouette). */
export async function detectPhotoCrops(input,options={}){
 let body=null;
 const found=await detectUnrefinedPhotoCrops(input,{...options,onBody:value=>{body=value;}});
 let silhouette=null;
 try{silhouette=body?fitHeartSilhouette(body):null;}catch{silhouette=null;}
 const starts=silhouette&&silhouette.iou>=.9?[silhouette.quad]:[];
 const candidates=found.candidates.map(candidate=>checkedBySilhouette(sharpenCrop(input,candidate,{starts,...options.outline}),silhouette));
 if(candidates.every((candidate,k)=>candidate===found.candidates[k]))return found;
 const status=['candidate','needs_review'].includes(found.status)&&candidates.length?(candidates[0].needsReview?'needs_review':'candidate'):found.status;
 return{...found,status,candidates};
}

/** `candidate` with its review flag from the silhouette, which is fitted on the
 * paper probability alone: corners within `close` of a side of it are
 * confident, and over `far` off are for review, whatever found the crop. On
 * 160 scraped photographs no crop within 3% was wrong, and most wrong crops
 * were over 10% off. A crop from the silhouette itself has nothing
 * independent to agree with and is left as it is. */
export function checkedBySilhouette(candidate,silhouette,{close=.03,far=.1,minIou=.9}={}){
 if(!silhouette||!(silhouette.iou>=minIou)||candidate.provenance?.method==='paper-silhouette')return candidate;
 const q=candidate.quad,side=Math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1]);
 const agreement=Math.max(...q.map((p,i)=>Math.hypot(p[0]-silhouette.quad[i][0],p[1]-silhouette.quad[i][1])))/side;
 const needsReview=agreement<=close?false:agreement>far?true:candidate.needsReview===true;
 return{...candidate,needsReview,status:needsReview?'needs_review':'candidate',provenance:{...candidate.provenance,silhouetteAgreement:agreement}};
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

/** How far apart two quads' corners are, at most, in sides of the first. */
const apart=(q,p)=>Math.max(...q.map((c,i)=>Math.hypot(c[0]-p[i][0],c[1]-p[i][1])))/Math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1]);

async function detectUnrefinedPhotoCrops(input,{roi=input.roi,onProgress=()=>{},cancelled=()=>false,onBody=()=>{},far=.1,
 productionCrop=detectHeartCrops,predictBody=predictPaperBody,learnedCrop=detectForegroundCrop,outlineCrop=detectBodyCrop,silhouetteCrop=detectSilhouetteCrop}={}){
 // The colour locator may answer from a worker of its own (worker-controller.js):
 // the paper model then runs beside it, not after it.
 const colour=Promise.resolve(productionCrop(input,{roi,onProgress}));
 let colourDone=false;colour.then(()=>{colourDone=true;},()=>{colourDone=true;});
 const check=()=>{if(cancelled())throw new DOMException('Cancelled','AbortError');};
 // An explicit selection identifies an instance. Whole-image saliency must
 // not override it. A colour-based crowded-frame warning, however, can be a
 // false split of one heart; the learned locator applies its own component
 // and whole-body checks before replacing that unresolved suggestion.
 if(roi){const production=await colour;check();return production.candidates?.length?production:selectedSilhouette(input,roi,production);}
 let production=null;
 try{
  // The paper model's first load reports its bytes (stage 'paper-model').
  const body=await predictBody(input,{onProgress});
  // While the colour locator still works, the learned crop the selection asks
  // for whenever the colour crop falls short: mostly when it is slow.
  const learn=()=>learnedCrop(input,{...body,paletteMode:'confidence-weighted',outerBoundarySampling:true});
  const learned=body&&!colourDone?Promise.resolve().then(learn):null;
  learned?.catch(()=>{});
  production=await colour;check();if(!body)return production;
  onBody(body);
  const selected=await selectWholeBodyPhotoCrop(input,{body,weighting:'balanced-confidence',productionCrop:()=>production,
   learnedCrop:()=>learned??learn(),
   outlineCrop:()=>{check();return outlineCrop(input,{...body,outerBoundarySampling:true});}});
  check();const {decision,detection}=selected;
  // Nothing found: the heart's silhouette in the paper probability, which a
  // photograph's edge, a turn or a handle does not hide. So too when the
  // colour crop is kept only because nothing else passed, the paper not where
  // it says (its whole-body evidence failed), and the silhouette lies over
  // `far` of a side from it: a Pinterest pin's page round the photograph
  // takes the colour locator to a square half off the heart.
  const kept=detection.candidates[0],unsound=decision.selected==='production'&&!decision.productionBody?.passed;
  if(!kept||unsound){
   const silhouette=silhouetteCrop(input,body);check();
   if(silhouette&&(!kept||apart(kept.quad,silhouette.quad)>far))return{...detection,status:'needs_review',candidates:[silhouette],bodyReview:decision};
  }
  const needsReview=decision.requiresReview||decision.selected==='learned';
  return{...detection,...(needsReview&&detection.candidates.length?{status:'needs_review'}:{}),
   candidates:detection.candidates.map(candidate=>({...candidate,
    status:needsReview?'needs_review':candidate.status??detection.status,
    needsReview:needsReview||candidate.needsReview===true,warnings:candidate.warnings??candidate.locator?.warnings??[],
    provenance:{...candidate.provenance,method:decision.selected==='outline'?'learned-paper-outline':decision.selected==='learned'?'learned-paper-body':candidate.provenance?.method,
     modelSha256:body.modelSha256,bodyReview:decision}})),
   bodyReview:decision};
 }catch(error){production??=await colour;check();return{...production,bodyReview:{status:'unavailable',reason:error.message}};}
}

/** In a selection nothing else found a heart in, the heart as what differs
 * from the selection's background (backgroundBody), its silhouette fitted
 * when it covers that closely (IoU at least `minIou`): printed papers the
 * colour locator cannot split into two. For review, as every selection is. */
export function selectedSilhouette(input,roi,detection,{minIou=.85}={}){
 let fit=null;
 try{const body=backgroundBody(input,roi);fit=body?fitHeartSilhouette(body):null;}catch{fit=null;}
 if(!fit||!(fit.iou>=minIou))return detection;
 return{...detection,status:'needs_review',candidates:[{quad:fit.quad,status:'needs_review',needsReview:true,warnings:[],
  provenance:{method:'background-silhouette',iou:fit.iou,lobes:fit.lobes,colourEvidenceUsed:false,humanReviewed:false}}]};
}

/** A crop from the silhouette fit (heart-fit.js) when it covers the paper
 * closely (IoU at least `minIou`). detectPhotoCrops then moves its corners
 * onto the outline like any other crop's. */
export function detectSilhouetteCrop(input,body,{minIou=.9}={}){
 const fit=fitHeartSilhouette(body);
 if(!fit||!(fit.iou>=minIou))return null;
 return{quad:fit.quad,status:'needs_review',needsReview:true,warnings:[],provenance:{method:'paper-silhouette',iou:fit.iou,lobes:fit.lobes,held:fit.held,modelSha256:body.modelSha256,colourEvidenceUsed:false,humanReviewed:false}};
}
