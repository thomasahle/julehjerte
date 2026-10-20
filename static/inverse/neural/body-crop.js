/** Fit a physical outline when printing/glare makes uniform lobe colours unreliable. */
import {createMotifDetector} from '../locator/locator.js';
import {pixelCentresToEdges,supportedBodyOutline} from '../core/crop.js';
import {outerBoundaryFields} from './outer-boundary-fields.js';
import {bodyFields} from './body-fields.js';

export async function detectBodyCrop(input,{probability,resolution=256,window,outerBoundarySampling=false}={}) {
  if(typeof outerBoundarySampling!=='boolean')throw new TypeError('Expected a boolean outer-boundary sampling option.');
  const started=performance.now();
  const detect=createMotifDetector({width:input.imageWidth,height:input.imageHeight,data:input.rgba},
    {maxSize:650,colourEvidence:false,fieldProvider:work=>bodyFields(work,probability,resolution,window),
      ...(outerBoundarySampling?{edgeSamplingFields:outerBoundaryFields}:{})});
  let proposal=detect();const attempts=[];
  if(!supportedBodyOutline(proposal)){
    const deadline=performance.now()+2000,pending=detect.orientations().map(degrees=>({degrees}));
    for(let index=0;index<pending.length&&performance.now()<deadline;index++){
      const {degrees,refinedFrom}=pending[index],rotated=detect(degrees),supported=supportedBodyOutline(rotated);
      attempts.push({degrees,refinedFrom,status:rotated.status,reason:rotated.reason,evidence:rotated.evidence,supported});
      if(supported){proposal=rotated;break;}
      const e=rotated.evidence,q=e?.rejectedQuad;
      if(refinedFrom===undefined&&q&&e.lobeOutlineSupport.every(v=>v>=.65)&&e.lowerEdgeSupport.every(v=>v>=.4)){
        const refined=(90-Math.atan2(q[2][1]-q[0][1],q[2][0]-q[0][0])*180/Math.PI+360)%360;
        if(pending.every(p=>Math.min(Math.abs(p.degrees-refined),360-Math.abs(p.degrees-refined))>.5))pending.splice(index+1,0,{degrees:refined,refinedFrom:degrees});
      }
    }
  }
  const supported=supportedBodyOutline(proposal);
  return {status:supported?'needs_review':'unresolved',reason:proposal.reason,proposal,attempts,elapsedMs:performance.now()-started,
    candidates:supported?[{quad:pixelCentresToEdges(proposal.quad),outline:proposal.outline.map(pixelCentresToEdges),needsReview:true,
      locator:proposal,provenance:{method:'learned-paper-outline',colourEvidenceUsed:false,humanReviewed:false}}]:[]};
}
