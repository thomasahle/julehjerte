import {refinePeriodicGrid} from './grid-refine.js';
import {makeFields,foregroundBox} from './fields.js';
import {makePaletteFields} from './palette.js';
import {makeAnchoredFields} from './anchored.js';
import {makeInteriorPaletteFields} from './interior-palette.js';
import {makeChromaticPaletteFields} from './chromatic-palette.js';
import {outlineContrast} from './outline-evidence.js';
import {orientFields,orientationHypotheses} from './orientation.js';
import {colorDifferenceMetric} from './background.js';
import {mean,quantile,trimMean,clamp,bilinear,nelderMead,project,homography,convexQuad} from './math.js';
export const CORNER_ORDER=['notch','right','tip','left'];
const SQUARE=[[0,0],[1,0],[1,1],[0,1]];
/** A rough selection identifies an instance, not its exact silhouette bounds.
 * Restrict component discovery to that selection while retaining the original
 * colour fields and context for fitting. Rotations still use source coordinates.
 */
function selectedForegroundBox(f,box,rotation){
 const mask=f.mask.slice();
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
  const p=rotation?rotation.toSource([x,y]):[x,y];
  if(p[0]<box[0]||p[1]<box[1]||p[0]>=box[2]||p[1]>=box[3])mask[y*f.w+x]=0;
 }
 return foregroundBox({...f,mask});
}
function checkImage(image){if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<24||image.height<24||!image.data||image.data.length!==image.width*image.height*4)throw new TypeError('Expected RGBA ImageData-like input, at least 24 by 24 pixels');}
function resizeROI(im,box,maxSize){const [x0,y0,x1,y1]=box,s=Math.min(1,maxSize/Math.max(x1-x0,y1-y0)),w=Math.max(24,Math.round((x1-x0)*s)),h=Math.max(24,Math.round((y1-y0)*s)),data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=clamp(Math.round(x0+(x+.5)/s-.5),0,im.width-1),sy=clamp(Math.round(y0+(y+.5)/s-.5),0,im.height-1);for(let c=0;c<4;c++)data[(y*w+x)*4+c]=im.data[(sy*im.width+sx)*4+c];}return{width:w,height:h,data,scale:s,offset:[x0,y0]};}
function linearFit(points){let sy=0,sx=0,syy=0,sxy=0;for(const[x,y]of points){sy+=y;sx+=x;syy+=y*y;sxy+=x*y;}const n=points.length,a=(sxy-sx*sy/n)/(syy-sy*sy/n),b=(sx-a*sy)/n;return[a,b];}
function lineEvidence(points,a,b,tolerancePx){
 const inliers=points.filter(([x,y])=>Math.abs(x-a*y-b)/Math.hypot(1,a)<tolerancePx);
 return{a,b,inliers:inliers.length,total:points.length,support:inliers.length/points.length,tolerancePx,
  rms:inliers.length?Math.sqrt(mean(inliers.map(([x,y])=>(x-a*y-b)**2/(1+a*a)))):null,
  span:inliers.length>1?Math.max(...inliers.map(p=>p[1]))-Math.min(...inliers.map(p=>p[1])):0};
}
export function lowerEdgeLines(f,box,{outerRuns=false}={}){const[x0,y0,x1,y1]=box,w=x1-x0,h=y1-y0,cx=(x0+x1)/2,sides=[[],[]];
 const backgroundCovariance=f.palette?.backgroundModel?.covariance,edgeMetric=backgroundCovariance?colorDifferenceMetric(backgroundCovariance):null;
 for(let y=Math.round(y0+(f.anchored ? .62 : .48)*h);y<Math.round(y0+(f.anchored ? .95 : .83)*h);y++){
  let x=Math.round(f.anchored?x0:cx);if(y<0||y>=f.h)continue;
  if(outerRuns){
   // A reflection may interrupt the middle of a coloured-paper row. Use
   // observed runs on either side only if the ordinary central scan failed;
   // do not fill the gap or alter the fields used to validate the outline.
   const runs=[];let start=null;
   for(let xx=Math.max(0,Math.ceil(x0));xx<=Math.min(f.w-1,Math.floor(x1));xx++){
    const inside=xx<x1&&f.mask[y*f.w+xx];
    if(inside&&start===null)start=xx;
    if(!inside&&start!==null){if(xx-start>=3)runs.push([start-.5,xx-.5]);start=null;}
   }
   if(runs.length&&runs[0][0]>x0+1&&runs.at(-1)[1]<x1-2&&runs.at(-1)[1]-runs[0][0]>.18*w){sides[0].push([runs[0][0],y]);sides[1].push([runs.at(-1)[1],y]);}
   continue;
  }
  // A tilted heart's narrow tip can lie far from the bounding-box centre.
  if(f.anchored)while(x<x1-1&&!f.mask[y*f.w+x])x++;
  if(!f.mask[y*f.w+x])continue;
  let a=x,b=x;while(a>x0&&f.mask[y*f.w+a])a--;while(b<x1-1&&f.mask[y*f.w+b])b++;
  if(a>x0+1&&b<x1-2&&b-a>(f.anchored ? .08 : .18)*w){sides[0].push([a+.5,y]);sides[1].push([b-.5,y]);}
 }
 const result=[],points=[];
 for(let k=0;k<2;k++){const p=sides[k];if(p.length<10)return null;let best=null;
 for(let i=0;i<p.length;i+=2)for(let j=i+Math.max(6,Math.floor(h*.045));j<p.length;j+=2){const a=(p[j][0]-p[i][0])/(p[j][1]-p[i][1]),b=p[i][0]-a*p[i][1];if(k===0?!(a>.3&&a<2.5):!(a<-.3&&a>-2.5))continue;const tol=Math.max(1.5,.009*w),ds=p.map(([x,y])=>Math.abs(x-a*y-b)/Math.hypot(1,a)),score=ds.reduce((s,d)=>s+Math.max(1-d/tol,0),0);if(!best||score>best.score)best={a,b,ds,score,tol};}
 if(!best)return null;const inliers=p.filter((p,i)=>best.ds[i]<best.tol);if(inliers.length<8)return null;let[a,b]=linearFit(inliers);
 const initial=lineEvidence(p,a,b,best.tol),fitPoints=p.map(point=>point.slice());
 // Refine the mask against colour steps, using the segmentation's background
 // metric when available so a stronger shadow edge cannot pull the paper line.
 for(let repeat=0;repeat<2;repeat++){
  const refined=[];
  for(const point of inliers){
   const y=point[1],x=a*y+b,norm=Math.hypot(1,a),nx=1/norm,ny=-a/norm;
   let bestD=0,bestG=0;
   for(let d=-5;d<=5;d+=.5){
    const X=x+d*nx,Y=y+d*ny;
    const delta=[f.r,f.g,f.b].map(ch=>bilinear(ch,f.w,f.h,X+1.2*nx,Y+1.2*ny)-bilinear(ch,f.w,f.h,X-1.2*nx,Y-1.2*ny));
    const grad=(edgeMetric?edgeMetric(delta):Math.sqrt(delta.reduce((sum,v)=>sum+v*v,0)))*Math.exp(-d*d/50);
    if(grad>bestG){bestG=grad;bestD=d;}
   }
   if(bestG>(edgeMetric?3.5:.065))refined.push([x+bestD*nx,y+bestD*ny,p.indexOf(point)]);
  }
  if(refined.length>Math.max(8,inliers.length*.4)){
   const[aa,bb]=linearFit(refined),keep=refined.filter(([x,y])=>Math.abs(x-aa*y-bb)/Math.hypot(1,aa)<2);
   if(keep.length>=8){
    [a,b]=linearFit(keep);
    for(const[x,y,index]of refined)fitPoints[index]=[x,y];
   }
  }
 }
 // Measure support against the samples actually used after colour refinement.
 // A blurred mask can disagree with an accurate colour edge; expose that
 // disagreement separately rather than retaining the seed's support or
 // treating segmentation agreement as the only evidence for the final line.
 result.push({...lineEvidence(fitPoints,a,b,best.tol),initial,segmentation:lineEvidence(p,a,b,best.tol)});
 points.push(fitPoints);}
 const[L,R]=result,y=(R.b-L.b)/(L.a-R.a),x=L.a*y+L.b;
 if(!Number.isFinite(x)||y<y0+.65*h||y>y1+.20*h||x<x0+.20*w||x>x1-.20*w)return null;
 return {left:L,right:R,tip:[x,y],points,segmentationPoints:sides,refinementMetric:edgeMetric?'background-covariance':'rgb',...(outerRuns?{sampling:'outer-observed-runs-after-interrupted-centre-scan'}:{})};
}
function model(z,lines,scale){const N=[z[0]*scale,z[1]*scale],hr=z[2]*scale,hl=z[3]*scale,B=lines.tip,R=[B[0]-lines.right.a*hr,B[1]-hr],L=[B[0]-lines.left.a*hl,B[1]-hl],q=[N,R,B,L];if(!convexQuad(q))return null;try{const H=homography(SQUARE,q);return {q,H};}catch{return null;}}
function contour(n=36){const a=[],b=[],c=[],d=[];for(let k=0;k<n;k++){const t=(k+.5)/n; a.push([.5-.5*Math.cos(Math.PI*t),-.5*Math.sin(Math.PI*t)]);b.push([1,t]);c.push([1-t,1]);d.push([-.5*Math.sin(Math.PI*t),.5+.5*Math.cos(Math.PI*t)]);}return[a,b,c,d];}
const CONTOURS=contour();
function supportedAnchoredFit(f,fit,lines){
 const support=fit.arcResiduals.map(a=>mean(a.map(d=>d<Math.max(2,f.w*.012)?1:0)));
 // The pale outline may merge with the background. In that case require
 // strong transitions at BOTH lobe diameters, plus the coloured outer arc.
 const coloured=fit.mode?0:1,pale=1-coloured;
 return support[coloured]>=.65&&(support[pale]>=.4||fit.diameterContrast.every(v=>v>=.30))&&fit.colorLoss.every(v=>v<=.25)&&fit.diameterContrast.every(v=>v>=.12)&&[lines.left,lines.right].every(l=>l.support>=.7&&l.span>=f.h*.12);
}
function fitModel(f,box,lines,{iterations=550,flexibleCaps=false}={}){const[x0,y0,x1,y1]=box,w=x1-x0,h=y1-y0,scale=(w+h)/2,seed=[(x0+x1)/(2*scale),(y0+.094*h)/scale,.453*h/scale,.453*h/scale],flexible=f.palette||f.anchored||flexibleCaps;
 if(flexible)seed.push(.5,.5);
 const val=(field,p)=>bilinear(field,f.w,f.h,p[0],p[1],field===f.pd||field===f.rd||field===f.wd?-30:0);
 const capSamples=[];for(let u=.1;u<.96;u+=.14)for(let v=-.38;v<-.04;v+=.11)if(Math.hypot(u-.5,v)<.46)capSamples.push([u,v]);
 function evaluate(z,details=false){if(z[2]<.18||z[2]>.82||z[3]<.18||z[3]>.82||(flexible&&z.slice(4).some(v=>v<.35||v>.85)))return details?null:1e5;const m=model(z,lines,scale);if(!m)return details?null:1e5;const{H,q}=m;
  if(Math.abs(H[6])>.65||Math.abs(H[7])>.65||q.some(p=>p[0]<-w*.15||p[0]>f.w+w*.15||p[1]<-h*.12||p[1]>f.h+h*.12))return details?null:1e5;
  const polys=CONTOURS.map((v,k)=>v.map(p=>project(H,flexible&&k===0?[p[0],p[1]*2*z[4]]:flexible&&k===3?[p[0]*2*z[5],p[1]]:p)));let opts=[];
  for(let mode=0;mode<2;mode++){// mode 0: right/top cap white; left cap red.
   const capDist=f.palette?[f.pd,f.pd]:mode?[f.rd,f.wd]:[f.wd,f.rd],capProb=mode?[f.red,f.white]:[f.white,f.red];
   let arcResiduals=[0,3].map((k,i)=>polys[k].map(p=>Math.abs(val(capDist[i],p)))),sideResiduals=[1,2].map(k=>polys[k].map(p=>Math.abs(val(f.pd,p))));
   const clip=f.palette?Infinity:Math.max(8,w*.05);let loss=(1.5*trimMean(arcResiduals[0].map(x=>Math.min(x,clip)))+1.5*trimMean(arcResiduals[1].map(x=>Math.min(x,clip)))+trimMean(sideResiduals[0].map(x=>Math.min(x,clip)))+trimMean(sideResiduals[1].map(x=>Math.min(x,clip))))/5;
   let diameterLoss=0,diameterContrast=[];
   for(let l=0;l<2;l++){const ins=[],outs=[];for(let k=0;k<48;k++){const t=.04+.92*k/47,pin=l?[.018,t]:[t,.018],pout=l?[-.018,t]:[t,-.018];let pi=val(f.chroma,project(H,pin)),po=val(f.chroma,project(H,pout));const foreignIsRed=(l===0)===(mode===0);if(!foreignIsRed){pi=1-pi;po=1-po;}ins.push(pi);outs.push(po);}
    const contrast=mean(ins.map((x,i)=>Math.max(x-outs[i],0)));diameterContrast.push(contrast);diameterLoss+=trimMean(outs,.85)-.60*contrast;
   }
   loss+=(f.anchored?30:f.palette?20:6)*diameterLoss;
   const colorLoss=[];for(let l=0;l<2;l++){const ps=capSamples.map(p=>project(H,l?[p[1],p[0]]:p));colorLoss.push(trimMean(ps.map(p=>1-val(capProb[l],p)),.85));}loss+=(f.anchored?30:2)*mean(colorLoss);
   let notchLoss=0;for(const t of [.022,.04,.065,.09]){const p0=project(H,[t,-t]),p1=project(H,[-t,t]);notchLoss+=1-val(capProb[0],p0)+1-val(capProb[1],p1);}loss+=(f.anchored?8:2)*notchLoss/4;
   opts.push({loss,mode,arcResiduals,sideResiduals,diameterContrast,colorLoss});
  }
  opts.sort((a,b)=>a.loss-b.loss);const best=opts[0];let penalty=.5*(H[6]**2+H[7]**2);penalty+=200*(Math.max(0,Math.abs(z[0]-seed[0])-.16)**2+Math.max(0,Math.abs(z[1]-seed[1])-.16)**2);
  const a=[q[1][0]-q[0][0],q[1][1]-q[0][1]],b=[q[3][0]-q[0][0],q[3][1]-q[0][1]],la=Math.hypot(...a),lb=Math.hypot(...b);penalty+=.5*((a[0]*b[0]+a[1]*b[1])/(la*lb))**2+.2*Math.log(la/lb)**2;
  if(flexible)penalty+=.5*((z[4]-.5)**2+(z[5]-.5)**2);
  return details?{...best,loss:best.loss+penalty,q,H,polys,lobeDepths:flexible?z.slice(4):[.5,.5]}:best.loss+penalty;
 }
 const starts=[seed,seed.map((v,i)=>v+(i===0?-.025:i===1?.025:0)),seed.map((v,i)=>v+(i===0?.025:i===1?-.025:0))];
 if(flexible)for(const dy of[.04,.08])starts.push(seed.map((v,i)=>v+(i===1?dy:0)));
 if(f.anchored||f.palette?.method==='two-chromatic-paper-colours'){
  // Weak pale outlines and reflections have several local minima. Rank coarse shape seeds
  // before refinement so a small exposure/size change cannot pick a new basin.
  const coarse=[];
  for(const dx of[-.12,-.06,0,.06,.12])for(const dy of[-.12,-.06,0,.06,.12])for(const dr of[-.08,0,.08])for(const dl of[-.08,0,.08]){
   const z=seed.map((v,i)=>v+([dx,dy,dr,dl][i]||0));coarse.push({z,score:evaluate(z)});
  }
  coarse.sort((a,b)=>a.score-b.score);const extra=[];
  for(const c of coarse)if(extra.every(z=>Math.hypot(...z.map((v,i)=>v-c.z[i]))>.07)){extra.push(c.z);if(extra.length===6)break;}
  starts.push(...extra);
 }
 const fits=starts.map(s=>nelderMead(evaluate,s,s.map((_,i)=>i<4?.025:.04),{maxIterations:iterations})).sort((a,b)=>a.f-b.f);
 const details=fits.map(s=>evaluate(s.x,true)).filter(Boolean);
 // A slightly lower image objective must not displace a fit that actually
 // explains both outer lobes. Final support checks still apply independently.
 const best=(f.anchored?details.find(d=>supportedAnchoredFit(f,d,lines)):f.palette?details.find(d=>d.arcResiduals.every(a=>mean(a.map(v=>v<Math.max(2,f.w*.012)?1:0))>=.65)&&d.colorLoss.every(v=>v<=.30)):null)||details[0];
 if(!best)return null;return{...best,evaluations:fits.reduce((s,x)=>s+x.evaluations,0),alternatives:fits.map(s=>({score:s.f,quad:evaluate(s.x,true)?.q??null}))};
}
/**
 * Locate the woven overlap of ONE two-colour heart in the requested pose.
 * ROI is [x0,y0,x1,y1] in original pixel coordinates. It need only enclose the heart.
 * Returns review status and evidence. Does not infer concealed ground-truth corners.
 */
export function createMotifDetector(image,options={}){checkImage(image);const preparationStart=performance.now();if(options.maxSize!==undefined&&(!Number.isFinite(options.maxSize)||options.maxSize<100||options.maxSize>800))throw new RangeError('maxSize must be from 100 to 800');const maxSize=options.maxSize??400;let inputROI=options.roi??[0,0,image.width,image.height];
 if(inputROI.length!==4||inputROI.some(x=>!Number.isFinite(x))||inputROI[2]-inputROI[0]<24||inputROI[3]-inputROI[1]<24)throw new TypeError('Invalid ROI');
 inputROI=[clamp(inputROI[0],0,image.width-1),clamp(inputROI[1],0,image.height-1),clamp(inputROI[2],1,image.width),clamp(inputROI[3],1,image.height)];if(inputROI[2]-inputROI[0]<24||inputROI[3]-inputROI[1]<24)throw new RangeError('ROI is outside the image or too small after clipping');const pad=options.roi?.length?Math.max(inputROI[2]-inputROI[0],inputROI[3]-inputROI[1])*.18:0;const workROI=[Math.max(0,inputROI[0]-pad),Math.max(0,inputROI[1]-pad),Math.min(image.width,inputROI[2]+pad),Math.min(image.height,inputROI[3]+pad)];const work=resizeROI(image,workROI,maxSize);
 const sampleROI=inputROI.map((v,i)=>(v-workROI[i%2]+.5)*work.scale-.5);
 const baseFields=options.palette==='chromatic'?makeChromaticPaletteFields(work,{roi:sampleROI})
  :options.palette==='interior'?makeInteriorPaletteFields(work)
  :options.palette==='anchored'?makeAnchoredFields(work)
  :['adaptive','pale'].includes(options.palette)?makePaletteFields(work,{pale:options.palette==='pale'})
  :makeFields(work);
 const detector=(degrees=0,{refineSelection=false}={})=>{
 const started=performance.now();if(!Number.isFinite(degrees))throw new TypeError('Expected a finite orientation angle.');
 const rotation=baseFields&&degrees%360!==0?orientFields(baseFields,degrees):null,f=rotation?.fields||baseFields;
 if(!f)return{status:'not_found',quad:null,reason:'No two distinct paper colours on a sufficiently plain background',elapsedMs:performance.now()-started};
 let box=inputROI.map((v,i)=>(v-workROI[i%2]+.5)*work.scale-.5),fg=null;
 if(!options.roi||f.anchored||rotation||refineSelection){fg=options.roi&&refineSelection?selectedForegroundBox(f,box,rotation):foregroundBox(f);if(fg.status!=='ok')return{...fg,quad:null,elapsedMs:performance.now()-started};box=fg.box;if(f.anchored)box=box.map((v,i)=>clamp(v+(i<2?-1:1)*.12*Math.max(fg.box[2]-fg.box[0],fg.box[3]-fg.box[1]),0,i%2?f.h:f.w));}
 const back=p=>{if(rotation)p=rotation.toSource(p);return[(p[0]+.5)/work.scale-.5+workROI[0],(p[1]+.5)/work.scale-.5+workROI[1]];};
 const lines=lowerEdgeLines(f,box)||(f.palette?.method==='two-chromatic-paper-colours'?lowerEdgeLines(f,box,{outerRuns:true}):null);if(!lines)return{status:'needs_review',quad:null,reason:'Could not identify both exposed lower paper edges. Try a rough selection around one complete heart.',elapsedMs:performance.now()-started};
 let fit=fitModel(f,box,lines,options);if(!fit)return{status:'needs_review',quad:null,reason:'No nondegenerate heart-shape fit',elapsedMs:performance.now()-started};
 // The red/white model historically forced both caps to be semicircles.
 // A deep or shallow cap then moves an overlap corner to explain its outline.
 // Refit only a poorly explained outline; the mask/template error is never
 // consulted, and all lower-edge constraints remain fixed.
 let lobeRefinement=null;
 if(!f.palette&&!f.anchored&&options.refineLobes!==false){
  const medians=fit.arcResiduals.map(a=>quantile(a,.5));
  if(medians.some(v=>v>Math.max(1.5,.004*Math.max(box[2]-box[0],box[3]-box[1])))){
   const refined=fitModel(f,box,lines,{...options,flexibleCaps:true});
   const next=refined?.arcResiduals.map(a=>quantile(a,.5));
   const support=refined?.arcResiduals.map(a=>mean(a.map(v=>v<Math.max(2,f.w*.012)?1:0)));
   const accepted=!!refined&&refined.loss<fit.loss&&mean(next)<.7*mean(medians)&&support.every(v=>v>=.65)&&refined.colorLoss.every((v,i)=>v<=fit.colorLoss[i]+.03);
   lobeRefinement={accepted,method:'independent-lobe-depths',initialQuad:fit.q.map(back),proposedQuad:refined?.q.map(back),initialScore:fit.loss,initialMedianLobeResidualPx:medians.map(v=>v/work.scale),proposedScore:refined?.loss,proposedMedianLobeResidualPx:next?.map(v=>v/work.scale),proposedLobeOutlineSupport:support,initialDiameterContrast:fit.diameterContrast,proposedDiameterContrast:refined?.diameterContrast};
   if(accepted)fit=refined;
  }
 }
 if(f.anchored&&!supportedAnchoredFit(f,fit,lines))return{status:'needs_review',quad:null,reason:'The coloured region does not support two paper lobes and an overlap square.',evidence:{workingQuad:fit.q,capColourLoss:fit.colorLoss,diameterContrast:fit.diameterContrast,lobeOutlineSupport:fit.arcResiduals.map(a=>mean(a.map(d=>d<Math.max(2,f.w*.012)?1:0))),lowerEdgeSupport:[lines.left.support,lines.right.support]},elapsedMs:performance.now()-started};
 const quad=fit.q.map(back),outline=fit.polys.map(a=>a.map(back));
 const residuals=fit.arcResiduals.map(a=>quantile(a,.5)/work.scale),segmentationSupport=[lines.left.support,lines.right.support];
 const edgeContrast=f.palette?.method==='two-chromatic-paper-colours'?[outlineContrast(f,fit.polys[2]),outlineContrast(f,fit.polys[1])]:null;
 const sideSupport=edgeContrast?edgeContrast.map(r=>r.support):segmentationSupport;
 const edgeEvidence=edgeContrast?{lowerEdgeRegistrationSupport:segmentationSupport,lowerEdgePhotoContrast:edgeContrast,lowerEdgeSupportMethod:'photograph-contrast-along-fitted-outer-edges'}:{};
 const arcSupport=fit.arcResiduals.map(a=>mean(a.map(d=>d<Math.max(2,work.width*.012)?1:0)));
 if(f.palette&&(arcSupport.some(x=>x<.65)||sideSupport.some(x=>x<.65)||fit.colorLoss.some(x=>x>.30)))return{status:'needs_review',quad:null,reason:'The two-colour foreground does not clearly support both heart lobes and lower edges.',evidence:{lobeOutlineSupport:arcSupport,lowerEdgeSupport:sideSupport,...edgeEvidence,capColourLoss:fit.colorLoss,medianLobeResidualPx:residuals,rejectedQuad:quad},elapsedMs:performance.now()-started};
 const accepted=fit.alternatives.filter(a=>a.quad&&a.score<fit.loss+1.0);const spread=quad.map((p,j)=>Math.max(0,...accepted.map(a=>{const r=back(a.quad[j]);return Math.hypot(p[0]-r[0],p[1]-r[1]);})));
 const warnings=[];if(lobeRefinement?.accepted)warnings.push('Independent lobe shapes improved the outline fit. Review all four overlap corners.');if(f.anchored)warnings.push('The pale outline was inferred from colours inside the heart. Review all four overlap corners.');if(residuals.some(r=>r>3))warnings.push('Lobe outlines do not closely fit a single flat-heart model.');if(sideSupport.some(x=>x<.65))warnings.push('One or both lower edges have limited support, possibly due to a ribbon or overlapping paper.');if(arcSupport.some(x=>x<.6))warnings.push('Part of a lobe outline is obscured or ambiguous.');if(spread.some(x=>x>6))warnings.push('Several plausible fits disagree on the corner positions.');
 if(quad.some(p=>p[0]<1||p[1]<1||p[0]>image.width-2||p[1]>image.height-2))warnings.push('The heart may be clipped by the image boundary.');
 let gridRefinement=null,finalQuad=quad,finalOutline=outline;
 if(options.refineGrid!==false&&!f.palette&&!f.anchored){gridRefinement=refinePeriodicGrid(image,quad);if(gridRefinement.accepted){finalQuad=gridRefinement.quad;const HH=homography(SQUARE,finalQuad);finalOutline=CONTOURS.map(a=>a.map(p=>project(HH,p)));warnings.push('Corners were refined using a regular checker-lattice hypothesis; review the displayed physical outline.');}}
 const status=warnings.length?'needs_review':'candidate';
 const corners=[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]].map(back);
 const heartBox=rotation?[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))]:box.map((v,i)=>(v+.5)/work.scale-.5+workROI[i%2]);
 return{version:lobeRefinement?.accepted?'0.4.0':f.anchored?'0.3.0':f.palette?'0.2.0':'0.1.0',status,quad:finalQuad,shapeQuad:quad,gridRefinement,lobeRefinement,cornerOrder:CORNER_ORDER,outline:finalOutline,roi:inputROI,workingROI:workROI,heartBox,orientation:f.palette?(fit.mode===0?'first-colour-left':'second-colour-left'):fit.mode===0?'red-left-white-right':'white-left-red-right',score:fit.loss,elapsedMs:performance.now()-started,evaluations:fit.evaluations,evidence:{lowerEdgeSupport:sideSupport,...edgeEvidence,lobeOutlineSupport:arcSupport,medianLobeResidualPx:residuals,alternativeSpreadPx:spread,lowerLines:lines,diameterContrast:fit.diameterContrast,workingScale:work.scale,...(rotation?{workingRotation:{degrees,originalSize:[baseFields.w,baseFields.h],rotatedSize:[f.w,f.h],coordinateConvention:'Lower-line coordinates are in the rotated working image; returned corners and outlines are in the original photograph.'}}:{}),lobeDepths:fit.lobeDepths,palette:f.palette||null,anchored:f.anchored||null,capColourLoss:fit.colorLoss},warnings,notes:['Coordinates estimate the physical overlap, not an arbitrary high-contrast interior frame.','Review is required for occlusion, non-planar paper, unusual caps or other paper palettes.']};
 };
 detector.preparationMs=performance.now()-preparationStart;
 // A pose cannot supply a paper colour missing from the fixed segmentation.
 // In particular, avoid fitting dozens of red-only lobes in green/red photos.
 detector.orientations=()=>baseFields&&baseFields.rd.some(v=>v<-.75)&&baseFields.wd.some(v=>v<-.75)?orientationHypotheses(baseFields):[];
 return detector;
}
export function detectMotif(image,options={}){const detect=createMotifDetector(image,options),result=detect(options.rotationDegrees??0);result.elapsedMs+=detect.preparationMs;return result;}
export function rectifyMotif(image,quad,{size=256}={}){checkImage(image);if(!convexQuad(quad)&&!(Array.isArray(quad)&&convexQuad([...quad].reverse())))throw new TypeError('Expected four corners forming a convex quadrilateral in perimeter order');if(!Number.isInteger(size)||size<16||size>2048)throw new RangeError('size must be an integer from 16 to 2048');const H=homography(SQUARE,quad),data=new Uint8ClampedArray(size*size*4),valid=new Uint8Array(size*size);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const[sx,sy]=project(H,[(x+.5)/size,(y+.5)/size]),i=y*size+x;if(sx<0||sy<0||sx>image.width-1||sy>image.height-1)continue;valid[i]=1;const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(x0+1,image.width-1),y1=Math.min(y0+1,image.height-1),u=sx-x0,v=sy-y0;for(let c=0;c<4;c++)data[4*i+c]=(1-v)*((1-u)*image.data[4*(y0*image.width+x0)+c]+u*image.data[4*(y0*image.width+x1)+c])+v*((1-u)*image.data[4*(y1*image.width+x0)+c]+u*image.data[4*(y1*image.width+x1)+c]);}return{width:size,height:size,data,valid,homographyCanonicalToSource:H};}
