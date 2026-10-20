/** Aligned physical-paper probabilities; paper colour is intentionally unknown. */
import {close,signedDistance} from '../locator/fields.js';
import {bilinear} from '../locator/math.js';

export function bodyFields(work, probability, resolution, window) {
  const {width:w,height:h,data,offset=[0,0],scale=1}=work;
  if (!Number.isInteger(resolution)||resolution<2||resolution>1024||probability?.length!==resolution**2||
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
    palette:{method:'paper-body',colourEvidenceUsed:false}};
}
