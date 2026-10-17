/** Offline projective outline experiment, never imported by the application.
 * Uses the existing geometry/optimizer with physical-body evidence only. The
 * explicit source seams keep changes reviewable against the production model.
 */
import fs from 'node:fs/promises';
import {close, signedDistance} from '../../../static/inverse/locator/fields.js';
import {bilinear} from '../../../static/inverse/locator/math.js';
import {pixelCentresToEdges} from '../../../static/inverse/core/crop.js';

export function bodyFields(work, probability, resolution, window) {
  const {width:w,height:h,data,offset=[0,0],scale=1}=work;
  if (!Number.isInteger(resolution)||resolution<2||probability.length!==resolution**2||
      !probability.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||window?.length!==4||
      !window.every(Number.isFinite)||window[2]<=window[0]||window[3]<=window[1]||
      !Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||data?.length!==4*w*h||
      !Number.isFinite(scale)||scale<=0||offset.length!==2||!offset.every(Number.isFinite)) {
    throw new TypeError('Expected aligned body probabilities, source window and RGBA working image');
  }
  const [paper,r,g,b]=Array.from({length:4},()=>new Float32Array(w*h));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,sx=offset[0]+(x+.5)/scale,sy=offset[1]+(y+.5)/scale;
    paper[i]=bilinear(probability,resolution,resolution,(sx-window[0])*resolution/(window[2]-window[0])-.5,
      (sy-window[1])*resolution/(window[3]-window[1])-.5,0)*data[4*i+3]/255;
    r[i]=data[4*i]/255;g[i]=data[4*i+1]/255;b[i]=data[4*i+2]/255;
  }
  const neutral=Float32Array.from(paper,p=>p*.5),distance=signedDistance(close(paper,w,h,1),w,h);
  return {w,h,paper,r,g,b,chroma:new Float32Array(w*h).fill(.5),red:neutral,white:neutral.slice(),
    mask:close(paper,w,h,2),pd:distance,rd:distance.slice(),wd:distance.slice(),
    palette:{method:'offline-body-only',colourEvidenceUsed:false}};
}

function replaceOne(source, before, after) {
  if(source.split(before).length!==2)throw new Error('Production locator seam changed; re-audit body-only adapter: '+before.slice(0,70));
  return source.replace(before,after);
}

export function bodyOnlySource(original) {
  let source=replaceOne(original,
    "baseFields=options.palette==='chromatic'?makeChromaticPaletteFields(work,{roi:sampleROI})\n  :options.palette==='interior'?makeInteriorPaletteFields(work)\n  :options.palette==='anchored'?makeAnchoredFields(work)\n  :['adaptive','pale'].includes(options.palette)?makePaletteFields(work,{pale:options.palette==='pale'})\n  :makeFields(work);",
    'baseFields=options.bodyFields(work);');
  source=replaceOne(source,'for(let mode=0;mode<2;mode++){','for(let mode=0;mode<1;mode++){');
  const start=source.indexOf('   let diameterLoss=0,diameterContrast=[];');
  const end=source.indexOf('   opts.push({loss,mode,arcResiduals,sideResiduals,diameterContrast,colorLoss});',start);
  if(start<0||end<start||source.slice(start,end).split('loss+=').length!==4)throw new Error('Colour objective seam changed');
  // Empty diagnostics explicitly mean unmeasured colour evidence, not perfect
  // colour support. They never enter the body-only acceptance predicate.
  source=source.slice(0,start)+'   const diameterContrast=[],colorLoss=[];\n'+source.slice(end);
  source=replaceOne(source,'&&d.colorLoss.every(v=>v<=.30)','');
  source=replaceOne(source,'||fit.colorLoss.some(x=>x>.30)','');
  source=replaceOne(source,
    'detector.orientations=()=>baseFields&&baseFields.rd.some(v=>v<-.75)&&baseFields.wd.some(v=>v<-.75)?orientationHypotheses(baseFields):[];',
    'detector.orientations=()=>baseFields?orientationHypotheses(baseFields):[];');
  return source;
}

let locator;
async function bodyLocator() {
  if(locator)return locator;
  const file=new URL('../../../static/inverse/locator/locator.js',import.meta.url);
  let source=bodyOnlySource(await fs.readFile(file,'utf8'));
  source=source.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,file).href}'`);
  locator=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).createMotifDetector;
  return locator;
}

export function supportedBodyOutline(proposal) {
  const e=proposal?.evidence;
  return !!proposal?.quad && e?.lowerEdgeSupport?.length===2 && e?.lobeOutlineSupport?.length===2 &&
    [...e.lowerEdgeSupport,...e.lobeOutlineSupport].every(v=>Number.isFinite(v)&&v>=.65);
}

export async function detectProjectiveBody(input,{probability,resolution=256,window}={}) {
  const create=await bodyLocator(),started=performance.now();
  const detect=create({width:input.imageWidth,height:input.imageHeight,data:input.rgba},
    {maxSize:650,bodyFields:work=>bodyFields(work,probability,resolution,window)});
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
      provenance:{method:'Offline projective body-only outline; no paper-colour objective or gate',humanReviewed:false}}]:[]};
}
