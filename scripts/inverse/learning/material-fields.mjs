/** Offline joint body/material evidence in the production locator's coordinates. */
import {close,signedDistance} from '../../../static/inverse/locator/fields.js';
import {bilinear,homography,project} from '../../../static/inverse/locator/math.js';

export function validatePrediction(values,n,window){
  if(!Number.isInteger(n)||n<2||values.length!==n*n||!values.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||window.length!==4||window.some(v=>!Number.isFinite(v))||window[2]<=window[0]||window[3]<=window[1])throw new Error('Invalid prediction or source window.');
}
export function samplePrediction(values,n,window,x,y,outside=0){
  return bilinear(values,n,n,(x-window[0])*n/(window[2]-window[0])-.5,(y-window[1])*n/(window[3]-window[1])-.5,outside);
}
export function materialFields(work,body,material,n,window){
  validatePrediction(body,n,window);validatePrediction(material,n,window);
  const {width:w,height:h,data,offset=[0,0],scale=1}=work,count=w*h;
  const [paper,red,white,chroma,r,g,b]=Array.from({length:7},()=>new Float32Array(count));
  const sums=[[0,0,0],[0,0,0]],masses=[0,0];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,sx=offset[0]+(x+.5)/scale,sy=offset[1]+(y+.5)/scale;
    const p=samplePrediction(body,n,window,sx,sy)*data[4*i+3]/255,m=samplePrediction(material,n,window,sx,sy,.5);
    paper[i]=p;red[i]=p*m;white[i]=p*(1-m);chroma[i]=m;
    [r[i],g[i],b[i]]=[0,1,2].map(c=>data[4*i+c]/255);
    for(let k=0;k<2;k++){const weight=p*(k?1-m:m);masses[k]+=weight;for(let c=0;c<3;c++)sums[k][c]+=weight*data[4*i+c]/255;}
  }
  const colors=sums.map((s,k)=>s.map(v=>v/Math.max(1e-12,masses[k])));
  return{w,h,paper,red,white,chroma,r,g,b,mask:close(paper,w,h,2),pd:signedDistance(close(paper,w,h,1),w,h),rd:signedDistance(close(red,w,h,1),w,h),wd:signedDistance(close(white,w,h,1),w,h),
    palette:{method:'offline-learned-body-and-material',colors,separation:Math.hypot(...colors[0].map((v,i)=>v-colors[1][i])),scope:'Colors summarize predicted identities; no RGB clustering or class reassignment.'}};
}
export function materialMask(values,n,window,quad,resolution){
  validatePrediction(values,n,window);
  if(!Number.isInteger(resolution)||resolution<2)throw new Error('Invalid mask resolution.');
  const h=homography([[0,0],[1,0],[1,1],[0,1]],quad),probability=new Float32Array(resolution*resolution),mask=new Uint8Array(probability.length);
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    const p=project(h,[(x+.5)/resolution,(y+.5)/resolution]),i=y*resolution+x;
    probability[i]=samplePrediction(values,n,window,...p,.5);mask[i]=Number(probability[i]>=.5);
  }
  return{probability,mask};
}
