/** Learned body fields with the standard physical-outline fitting checks. */
import {createMotifDetector} from '../locator/locator.js';
import {supportedCropOutline,pixelCentresToEdges} from '../core/crop.js';
import {foregroundFields} from './foreground-fields.js';
import {outerBoundaryFields} from './outer-boundary-fields.js';

export async function detectForegroundCrop(input,{roi,probability,resolution=256,window,refineFields,fieldProvider,paletteMode='threshold',outerBoundarySampling=false}={}){
  if(!['threshold','confidence-weighted'].includes(paletteMode))throw new TypeError('Invalid foreground palette mode for these fields.');
  if(typeof outerBoundarySampling!=='boolean')throw new TypeError('Expected a boolean outer-boundary sampling option.');
  const started=performance.now();
  let refinement=null;
  const detect=createMotifDetector({width:input.imageWidth,height:input.imageHeight,data:input.rgba},{roi,maxSize:650,fieldProvider:work=>{
    const fields=fieldProvider?fieldProvider(work):foregroundFields(work,probability,resolution,window,{paletteMode}),refined=fields&&refineFields?refineFields(fields):fields;
    refinement=refined?.refinement??null;return refined;
  },...(outerBoundarySampling?{edgeSamplingFields:outerBoundaryFields}:{})});
  let proposal=detect();const attempts=[];
  if(!supportedCropOutline(proposal)){
    const deadline=performance.now()+2000,pending=detect.orientations().map(degrees=>({degrees}));
    for(let index=0;index<pending.length&&performance.now()<deadline;index++){
      const {degrees,refinedFrom}=pending[index],rotated=detect(degrees),supported=supportedCropOutline(rotated);
      attempts.push({degrees,refinedFrom,status:rotated.status,supported});
      if(supported){proposal=rotated;break;}
      const e=rotated.evidence,q=e?.rejectedQuad;
      if(refinedFrom===undefined&&q&&e.lobeOutlineSupport.every(v=>v>=.65)&&e.capColourLoss.every(v=>v<=.30)&&e.lowerEdgeSupport.every(v=>v>=.4)){
        const refined=(90-Math.atan2(q[2][1]-q[0][1],q[2][0]-q[0][0])*180/Math.PI+360)%360;
        if(pending.every(p=>Math.min(Math.abs(p.degrees-refined),360-Math.abs(p.degrees-refined))>.5))pending.splice(index+1,0,{degrees:refined,refinedFrom:degrees});
      }
    }
  }
  return{status:proposal.status,reason:proposal.reason,proposal,attempts,...(refinement?{refinement}:{}),
    ...(outerBoundarySampling?{boundarySampling:'enclosed-background-8-connected'}:{}),elapsedMs:performance.now()-started,
    candidates:proposal.quad?[{quad:pixelCentresToEdges(proposal.quad),outline:proposal.outline.map(pixelCentresToEdges),locator:proposal,
      provenance:{method:'Offline foreground prediction plus unchanged locator geometry and support gates',humanReviewed:false}}]:[]};
}
