/** Offline adapter: replace only foreground fields, preserve locator geometry.
 * This is not imported by the app. Oracle fields are diagnostic controls only.
 */
import fs from 'node:fs/promises';
import {LOCATOR_FIELD_SELECTION} from './locator-field-source.mjs';
import {materialFields} from './material-fields.mjs';
import {continuousForeground} from './continuous-foreground.mjs';
import {close,signedDistance} from '../../../static/inverse/locator/fields.js';
import {bilinear,quantile,sigmoid} from '../../../static/inverse/locator/math.js';
import {supportedCropOutline,pixelCentresToEdges} from '../../../static/inverse/core/crop.js';

const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
export function foregroundFields(work,probability,resolution,window,{paletteMode='threshold'}={}){
  if(!['threshold','confidence-weighted'].includes(paletteMode))throw new TypeError('Unknown foreground palette mode.');
  const {width:w,height:h,data,offset=[0,0],scale=1}=work,n=w*h;
  if(probability.length!==resolution*resolution||!probability.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||window.length!==4||window.some(v=>!Number.isFinite(v))||window[2]<=window[0]||window[3]<=window[1])throw new Error('Invalid foreground prediction or window.');
  const paper=new Float32Array(n),r=new Float32Array(n),g=new Float32Array(n),b=new Float32Array(n),pool=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,p=[0,1,2].map(c=>data[4*i+c]/255);[r[i],g[i],b[i]]=p;
    // work coordinates are pixel centres; window is in source pixel edges.
    const sx=offset[0]+(x+.5)/scale,sy=offset[1]+(y+.5)/scale;
    paper[i]=bilinear(probability,resolution,resolution,(sx-window[0])*resolution/(window[2]-window[0])-.5,(sy-window[1])*resolution/(window[3]-window[1])-.5,0)*data[4*i+3]/255;
    if(paletteMode==='threshold'&&paper[i]>.95&&i%3===0)pool.push(p);
  }
  // Estimate continuous colours directly from the sampled RGB/body fields.
  // Running the threshold palette first can reject a valid weighted palette
  // before a post-processing callback ever sees the fields.
  if(paletteMode==='confidence-weighted')return continuousForeground({w,h,paper,r,g,b,
    mask:close(paper,w,h,2),pd:signedDistance(close(paper,w,h,1),w,h)},{palette:true});
  if(pool.length<100)return null;
  const spreads=[0,1,2].map(c=>quantile(pool.map(p=>p[c]),.9)-quantile(pool.map(p=>p[c]),.1));
  const axis=spreads.indexOf(Math.max(...spreads)),sorted=[...pool].sort((a,b)=>a[axis]-b[axis]);
  let centers=[sorted[Math.floor(sorted.length*.2)],sorted[Math.floor(sorted.length*.8)]];
  for(let step=0;step<20;step++){
    const sums=[[0,0,0],[0,0,0]],counts=[0,0];
    for(const p of pool){const k=Number(distance(p,centers[1])<distance(p,centers[0]));counts[k]++;for(let c=0;c<3;c++)sums[k][c]+=p[c];}
    if(counts.some(c=>c<pool.length*.08))return null;
    centers=sums.map((p,k)=>p.map(v=>v/counts[k]));
  }
  const separation=distance(...centers);if(separation<.18)return null;
  const red=new Float32Array(n),white=new Float32Array(n),chroma=new Float32Array(n);
  for(let i=0;i<n;i++){
    const p=[r[i],g[i],b[i]],a=distance(p,centers[0]),b0=distance(p,centers[1]),z=sigmoid((b0-a)/Math.max(.02,separation*.08));
    chroma[i]=z;red[i]=z*paper[i];white[i]=(1-z)*paper[i];
  }
  return{w,h,paper,red,white,chroma,r,g,b,mask:close(paper,w,h,2),pd:signedDistance(close(paper,w,h,1),w,h),rd:signedDistance(close(red,w,h,1),w,h),wd:signedDistance(close(white,w,h,1),w,h),palette:{method:'offline-supplied-foreground',colors:centers,separation}};
}

let locator;
async function injectedLocator(){
  if(locator)return locator;
  const file=new URL('../../../static/inverse/locator/locator.js',import.meta.url);
  let source=await fs.readFile(file,'utf8');
  const before=LOCATOR_FIELD_SELECTION;
  if(source.split(before).length!==2)throw new Error('Locator field seam changed; re-audit adapter.');
  source=source.replace(before,'baseFields=options.foregroundFields(work);');
  source=source.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,file).href}'`);
  locator=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).createMotifDetector;
  return locator;
}

export async function detectForegroundCrop(input,{roi,probability,resolution=256,window,refineFields,material,paletteMode='threshold'}={}){
  if(!['threshold','confidence-weighted'].includes(paletteMode)||material&&paletteMode!=='threshold')throw new TypeError('Invalid foreground palette mode for these fields.');
  const create=await injectedLocator(),started=performance.now();
  let refinement=null;
  const detect=create({width:input.imageWidth,height:input.imageHeight,data:input.rgba},{roi,maxSize:650,foregroundFields:work=>{
    const fields=material?materialFields(work,probability,material,resolution,window):foregroundFields(work,probability,resolution,window,{paletteMode}),refined=fields&&refineFields?refineFields(fields):fields;
    refinement=refined?.refinement??null;return refined;
  }});
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
  return{status:proposal.status,reason:proposal.reason,proposal,attempts,...(refinement?{refinement}:{}),elapsedMs:performance.now()-started,
    candidates:proposal.quad?[{quad:pixelCentresToEdges(proposal.quad),outline:proposal.outline.map(pixelCentresToEdges),locator:proposal,
      provenance:{method:'Offline foreground prediction plus unchanged locator geometry and support gates',humanReviewed:false}}]:[]};
}
