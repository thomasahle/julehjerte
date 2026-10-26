/** Safe vector import and deterministic two-colour image preprocessing. */
import {Cubic,fitPolyline,rdp,splitLong,add,sub,mul,distance,cross,clamp} from './bezier.js';
import {nodeCurves} from './geometry.js';
import {repairJunctions} from './junctions.js';
import {stabilizeBorder} from './border.js';
import {redWhiteMixture} from './unmix.js';
import {fitPolygonal,fitBoundary} from './polygonal.js';
import {imageWeights} from './direct/image-objective.js';
export function hexColor(s){if(typeof s!=='string'||!/^#[0-9a-f]{6}$/i.test(s))throw new Error('Use colours in #RRGGBB format.');return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16));}
export function colorsSafe(colors=['#bd1111','#ffffff']){if(!Array.isArray(colors)||colors.length!==2||colors[0].toLowerCase()===colors[1].toLowerCase())throw new Error('Choose two different paper colours.');colors.forEach(hexColor);return colors;}
export function parsePath(d){
  if(typeof d!=='string'||d.length>2e6)throw new Error('SVG path too large or missing.');
  const re=/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g,tokens=d.match(re)||[];if(d.replace(re,'').replace(/[\s,]/g,''))throw new Error('Unsupported SVG path syntax.');
  const counts={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,Z:0};let i=0,cmd=null,pos=[0,0],start=null,last=null,lastQ=null,lastC=null;const cs=[];
  while(i<tokens.length){if(/^[A-Za-z]$/.test(tokens[i]))cmd=tokens[i++];const upper=cmd?.toUpperCase();if(!Object.hasOwn(counts,upper))throw new Error('Supported SVG commands: M L H V C S Q T Z. Convert arcs to cubics.');const relative=cmd===cmd.toLowerCase();
    if(upper==='Z'){if(!start)throw new Error('Closepath before moveto.');if(distance(pos,start)>1e-10)cs.push(Cubic.line(pos,start));pos=[...start];last='Z';cmd=null;continue;}
    const n=counts[upper];if(i+n>tokens.length||tokens.slice(i,i+n).some(t=>/^[A-Za-z]$/.test(t)))throw new Error('Incomplete SVG path command.');const v=tokens.slice(i,i+n).map(Number);i+=n;if(v.some(x=>!Number.isFinite(x)))throw new Error('Nonfinite SVG coordinates.');const pair=j=>add(v.slice(j,j+2),relative?pos:[0,0]),old=[...pos];
    if(upper==='M'){pos=pair(0);start=[...pos];cmd=relative?'l':'L';}
    else if(!start)throw new Error('A path must start with moveto.');
    else if(upper==='L'){pos=pair(0);cs.push(Cubic.line(old,pos));}
    else if(upper==='H'){pos=[v[0]+(relative?old[0]:0),old[1]];cs.push(Cubic.line(old,pos));}
    else if(upper==='V'){pos=[old[0],v[0]+(relative?old[1]:0)];cs.push(Cubic.line(old,pos));}
    else if(upper==='C'){const a=pair(0),b=pair(2),end=pair(4);cs.push(new Cubic([old,a,b,end]));lastC=b;pos=end;}
    else if(upper==='S'){const a=['C','S'].includes(last)?sub(mul(old,2),lastC):old,b=pair(0),end=pair(2);cs.push(new Cubic([old,a,b,end]));lastC=b;pos=end;}
    else {const q=upper==='Q'?pair(0):(['Q','T'].includes(last)?sub(mul(old,2),lastQ):old),end=upper==='Q'?pair(2):pair(0);cs.push(new Cubic([old,add(old,mul(sub(q,old),2/3)),add(end,mul(sub(q,end),2/3)),end]));lastQ=q;pos=end;}
    last=upper;if(cs.length>5000)throw new Error('Too many SVG segments.');
  }return cs.filter(c=>c.length()>1e-8);
}
function attributes(tag){const out=Object.create(null),re=/([:\w-]+)\s*=\s*(["'])(.*?)\2/gs;for(const m of tag.matchAll(re)){if(Object.hasOwn(out,m[1]))throw new Error('Repeated SVG attribute.');out[m[1]]=m[3];}return out;}
export function loadSVG(text,{width=100,maxSpan=12,tolerance=.01}={}){
  if(text.length>2e6)throw new Error('SVG exceeds the 2 MB limit.');if(/<!DOCTYPE|<!ENTITY|<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=/i.test(text))throw new Error('Active SVG content and external resources are not accepted.');
  text=text.replace(/<!--[\s\S]*?-->/g,'').replace(/<\?[\s\S]*?\?>/g,'').replace(/<(?:title|desc|metadata)\b[^>]*>[\s\S]*?<\/(?:title|desc|metadata)>/gi,'');
  const tags=[...text.matchAll(/<\s*(\/?)\s*([\w:-]+)\b([^>]*)>/g)];let root=null;const paths=[];
  for(const [,closing,name,raw]of tags){if(!['svg','g','path'].includes(name))throw new Error(`Unsupported SVG element: ${name}. Convert the artwork to plain paths.`);if(closing)continue;const a=attributes(raw);for(const key of['transform','clip-path','mask','filter','style','opacity'])if(Object.hasOwn(a,key))throw new Error(`Flatten SVG ${key} before importing.`);if(name==='svg'){if(root)throw new Error('Nested SVGs are not accepted.');root=a;}if(name==='path')paths.push(a);}
  if(!root)throw new Error('No SVG root found.');const vb=(root.viewBox||'').trim().split(/[\s,]+/).map(Number);if(vb.length!==4||vb.some(x=>!Number.isFinite(x))||vb[2]<=0||Math.abs(vb[2]-vb[3])>1e-8)throw new Error('SVG needs a square viewBox.');const boundary=root['data-heart-boundaries']==='true';if(!boundary&&paths.length!==1)throw new Error('Use one closed even-odd compound path or a boundary SVG exported by this app.');
  let curves=[];for(const path of paths){if(!boundary){if((path['fill-rule']||root['fill-rule'])!=='evenodd'||path.fill==='none'||(path.stroke&&path.stroke!=='none'))throw new Error('The filled SVG needs fill-rule="evenodd", a fill, and no stroke.');if((path.d||'').split(/(?=[mM])/).filter(x=>x.trim()).some(x=>!/[zZ]\s*$/.test(x)))throw new Error('Close every filled subpath with Z.');}curves.push(...parsePath(path.d).map(c=>new Cubic(c.p.map(p=>mul(sub(p,vb.slice(0,2)),width/vb[2])))));}
  if(curves.some(c=>c.p.some(p=>Math.min(...p)<-1e-7||Math.max(...p)>width+1e-7)))throw new Error('Control points must lie inside the square viewBox.');
  let phase=0;if(boundary){phase=Number(root['data-phase']||0);if(![0,1].includes(phase))throw new Error('data-phase must be 0 or 1.');}else{const q=[width*1e-7,width*1e-7];for(const c of curves){const p=c.flatten(tolerance);for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i];if((a[1]>q[1])!==(b[1]>q[1])&&a[0]+(q[1]-a[1])*(b[0]-a[0])/(b[1]-a[1])<q[0])phase^=1;}}}
  curves=curves.filter(c=>![0,1].some(axis=>[0,width].some(v=>c.p.every(p=>Math.abs(p[axis]-v)<1e-8)))).flatMap(c=>splitLong(c,maxSpan));
  return {width,phase,curves,metadata:{input:'native SVG',originalCubicsPreserved:true,paperColors:colorsSafe([root['data-paper-a']||'#bd1111',root['data-paper-b']||'#ffffff'])}};
}
function gaussianSolve(a,b){const n=b.length;a=a.map((r,i)=>[...r,b[i]]);for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;if(Math.abs(a[p][k])<1e-12)throw new Error('Degenerate crop quadrilateral.');[a[k],a[p]]=[a[p],a[k]];const v=a[k][k];for(let j=k;j<=n;j++)a[k][j]/=v;for(let i=0;i<n;i++)if(i!==k){const z=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=z*a[k][j];}}return a.map(r=>r[n]);}
export function rectify(rgba,width,height,n,quad=null,background='#ffffff'){
  return rectifyWithCoverage(rgba,width,height,n,quad,background).rgb;
}

/** Keep display RGB unchanged, but distinguish real samples from padding.
 * A pixel is observed only when its complete bilinear support is inside the
 * photograph. Alpha inside the source still composites to the chosen paper.
 */
export function rectifyWithCoverage(rgba,width,height,n,quad=null,background='#ffffff'){
  if(!(rgba instanceof Uint8ClampedArray||rgba instanceof Uint8Array)||rgba.length!==4*width*height)throw new Error('Invalid image pixels.');if(width*height>24e6)throw new Error('Image exceeds 24 megapixels.');if(!Number.isInteger(n)||n<32||n>600)throw new Error('Tracing resolution must be 32–600.');
  const bg=hexColor(background);let h=null;if(quad){if(!Array.isArray(quad)||quad.length!==4||quad.some(p=>p.length!==2||p.some(x=>!Number.isFinite(x))))throw new Error('Select four finite crop corners.');const signs=quad.map((p,i)=>cross(sub(quad[(i+1)%4],p),sub(quad[(i+2)%4],quad[(i+1)%4])));if(signs.some(x=>Math.abs(x)<1e-6)||!(signs.every(x=>x>0)||signs.every(x=>x<0)))throw new Error('The crop corners must form a convex quadrilateral in order.');const a=[],b=[];[[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const [x,y]=quad[i];a.push([u,v,1,0,0,0,-u*x,-v*x],[0,0,0,u,v,1,-u*y,-v*y]);b.push(x,y);});h=gaussianSolve(a,b);}else if(Math.abs(width-height)>1)throw new Error('Select the four corners of the square overlap, or use a square image.');
  const rgb=new Uint8Array(n*n*3),validMask=new Uint8Array(n*n).fill(1);let missing=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=(x+.5)/n,v=(y+.5)/n,den=h?h[6]*u+h[7]*v+1:1,xx=h?(h[0]*u+h[1]*v+h[2])/den-.5:u*width-.5,yy=h?(h[3]*u+h[4]*v+h[5])/den-.5:v*height-.5,x0=Math.floor(xx),y0=Math.floor(yy),dx=xx-x0,dy=yy-y0;let vals=[0,0,0],observed=true;for(let j=0;j<2;j++)for(let i=0;i<2;i++){const w=(i?dx:1-dx)*(j?dy:1-dy),px=x0+i,py=y0+j;if(w>1e-12&&(px<0||py<0||px>=width||py>=height))observed=false;for(let k=0;k<3;k++){let z=bg[k];if(px>=0&&py>=0&&px<width&&py<height){const index=4*(py*width+px),alpha=rgba[index+3]/255;z=alpha*rgba[index+k]+(1-alpha)*bg[k];}vals[k]+=w*z;}}for(let k=0;k<3;k++)rgb[3*(y*n+x)+k]=Math.round(vals[k]);if(!observed){validMask[y*n+x]=0;missing++;}}return{rgb,validMask:missing?validMask:null};
}
export function rgbToLab(rgb){const linear=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}),[r,g,b]=linear,xyz=[(.4124564*r+.3575761*g+.1804375*b)/.95047,.2126729*r+.7151522*g+.072175*b,(.0193339*r+.119192*g+.9503041*b)/1.08883],f=xyz.map(x=>x>.008856?Math.cbrt(x):7.787*x+16/116);return[116*f[1]-16,500*(f[0]-f[1]),200*(f[1]-f[2])];}
/** The two paper colours of a photographed heart, read off its lobes: each
 * lobe is one paper's fold, just outside the woven square on the cleft's two
 * edges (`quad`: cleft, right, tip, left, as the rectifier maps (0,0), (1,0),
 * (1,1), (0,1)). [right, left] in Lab, or null unless each lobe is mostly one
 * colour (`within` ΔE of its median) and the two differ by `apart` ΔE. */
export function lobeColours(rgba,width,height,quad,{within=20,apart=15,share=.6}={}){
  const sample=lobeSampler(rgba,width,height,quad);if(!sample)return null;
  const lobe=(at)=>{
    const labs=[];let tried=0;
    for(let i=0;i<12;i++)for(let j=0;j<5;j++){tried++;const lab=sample(...at(.2+.6*(i+.5)/12,.08+.27*(j+.5)/5));if(lab)labs.push(lab);}
    if(labs.length<.4*tried)return null;
    const median=[0,1,2].map(c=>labs.map(l=>l[c]).sort((p,q)=>p-q)[labs.length>>1]),near=labs.filter(l=>Math.hypot(...l.map((x,c)=>x-median[c]))<=within);
    return near.length>=share*labs.length?[0,1,2].map(c=>near.reduce((sum,l)=>sum+l[c],0)/near.length):null;
  };
  // Right: the lobe on the edge from the cleft to (1,0), at v < 0; left at u < 0.
  const right=lobe((t,d)=>[t,-d]),left=lobe((t,d)=>[-d,t]);
  return right&&left&&Math.hypot(...right.map((x,c)=>x-left[c]))>=apart?[right,left]:null;
}
/** The Lab colour at the crop's square coordinates (u, v) (0..1 across the
 * square, negative on a lobe's side), or null outside the picture. */
function lobeSampler(rgba,width,height,quad){
  const a=[],b=[];[[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const [x,y]=quad[i];a.push([u,v,1,0,0,0,-u*x,-v*x],[0,0,0,u,v,1,-u*y,-v*y]);b.push(x,y);});
  let h;try{h=gaussianSolve(a,b);}catch{return null;}
  return(u,v)=>{const den=h[6]*u+h[7]*v+1,x=Math.floor((h[0]*u+h[1]*v+h[2])/den),y=Math.floor((h[3]*u+h[4]*v+h[5])/den);if(!(den>0)||x<0||y<0||x>=width||y>=height)return null;const k=4*(y*width+x);return rgbToLab([rgba[k],rgba[k+1],rgba[k+2]]);};
}
/** Each lobe's colours, [right, left] Lab samples across it, when at least one
 * is printed: under `plain` of its samples within `within` ΔE of their median
 * (a pattern's second colour, a motif). Else null: plain papers' two colours
 * are their lobes' (lobeColours). */
export function printedLobes(rgba,width,height,quad,{within=10,plain=.9}={}){
  const sample=lobeSampler(rgba,width,height,quad);if(!sample)return null;
  const lobe=at=>{const labs=[];for(let i=0;i<32;i++)for(let j=0;j<10;j++){const lab=sample(...at(.12+.76*(i+.5)/32,.05+.33*(j+.5)/10));if(lab)labs.push(lab);}return labs;};
  const right=lobe((t,d)=>[t,-d]),left=lobe((t,d)=>[-d,t]);
  if(right.length<100||left.length<100)return null;
  const spread=labs=>{const median=[0,1,2].map(c=>labs.map(l=>l[c]).sort((p,q)=>p-q)[labs.length>>1]);return labs.filter(l=>Math.hypot(...l.map((x,c)=>x-median[c]))<=within).length/labs.length;};
  return spread(right)<plain||spread(left)<plain?[right,left]:null;
}
/** Paper 1 (the right lobe's) where its colours are likelier than the left
 * lobe's, each paper's colours a density of its lobe's samples (a kernel of
 * `sigma` ΔE), the log ratio averaged over `radius` pixels, and `wide` times
 * as far at a colour both papers have (its own ratio under `unsure`): a print
 * colour they share takes the paper around it. */
function printedPaperMask(labs,samples,{observed=null,sigma=7,radius=6,wide=3,unsure=2.5,cap=4}={}){
  const count=labs.length/3,side=Math.round(Math.sqrt(count)),cache=new Map(),two=2*sigma*sigma;
  const density=(lab,list)=>{let s=0;for(const q of list)s+=Math.exp(-((lab[0]-q[0])**2+(lab[1]-q[1])**2+(lab[2]-q[2])**2)/two);return s/list.length;};
  const ratio=new Float32Array(count);
  for(let i=0;i<count;i++){
    const key=`${Math.round(labs[3*i]/2)},${Math.round(labs[3*i+1]/2)},${Math.round(labs[3*i+2]/2)}`;
    let r=cache.get(key);
    if(r===undefined){const lab=[labs[3*i],labs[3*i+1],labs[3*i+2]];r=Math.max(-cap,Math.min(cap,Math.log((density(lab,samples[0])+1e-6)/(density(lab,samples[1])+1e-6))));cache.set(key,r);}
    ratio[i]=observed&&!observed[i]?0:r;
  }
  // The mean over a square of 2 radius + 1 pixels, by a summed table; where
  // that is unsure (a print shape both papers share, wider than it), the mean
  // over `wide` times as far.
  const w=side,sum=new Float64Array((w+1)*(w+1));
  for(let y=0;y<w;y++)for(let x=0;x<w;x++)sum[(y+1)*(w+1)+x+1]=ratio[y*w+x]+sum[y*(w+1)+x+1]+sum[(y+1)*(w+1)+x]-sum[y*(w+1)+x];
  const mean=(x,y,r)=>{const x0=Math.max(0,x-r),y0=Math.max(0,y-r),x1=Math.min(w,x+r+1),y1=Math.min(w,y+r+1);return(sum[y1*(w+1)+x1]-sum[y0*(w+1)+x1]-sum[y1*(w+1)+x0]+sum[y0*(w+1)+x0])/((x1-x0)*(y1-y0));};
  const mask=new Uint8Array(count);
  for(let y=0;y<w;y++)for(let x=0;x<w;x++)mask[y*w+x]=mean(x,y,Math.abs(ratio[y*w+x])>=unsure?radius:wide*radius)>0?1:0;
  return mask;
}
export function otsu(values){const hist=Array(256).fill(0);for(const v of values)hist[v]++;let sum=0;hist.forEach((c,i)=>sum+=c*i);let w0=0,s0=0,best=-1,t=128;for(let i=0;i<256;i++){w0+=hist[i];s0+=i*hist[i];const w1=values.length-w0;if(!w0||!w1)continue;const score=w0*w1*(s0/w0-(sum-s0)/w1)**2;if(score>best){best=score;t=i;}}return t;}
/** Validate and own a binary observation field; absent means fully observed. */
function observedMask(mask,length){
  if(mask==null)return null;
  if(mask.length!==length||Array.from(mask).some(v=>v!==0&&v!==1))throw new Error('Observation mask must contain one binary value per image pixel.');
  if(!mask.some(v=>v===1))throw new Error('The crop must contain observed image pixels.');
  return mask.every(v=>v===1)?null:Uint8Array.from(mask);
}

export function quantize(rgb,{mode='auto',threshold=128,swatches=['#bd1111','#ffffff'],invert=false,validMask=null,lobes=null,printed=null}={}){
  const observed=observedMask(validMask,rgb.length/3);
  if(observed&&mode!=='red-white-mixture'&&mode!=='printed-lobes'){
    // Palette/threshold estimation must never see synthetic background.
    // Fitting weights cannot undo a classification already changed by it.
    const count=observed.reduce((sum,v)=>sum+v,0),samples=new Uint8Array(3*count);
    for(let i=0,j=0;i<observed.length;i++)if(observed[i]){samples.set(rgb.slice(3*i,3*i+3),3*j++);}
    const classified=quantize(samples,{mode,threshold,swatches,invert,lobes,printed});
    const mask=new Uint8Array(observed.length),probability=classified.probability?new Float32Array(observed.length).fill(.5):null;
    for(let i=0,j=0;i<observed.length;i++)if(observed[i]){mask[i]=classified.mask[j];if(probability)probability[i]=classified.probability[j];j++;}
    return{mask,probability,metadata:{...classified.metadata,observedPixels:count,missingPixels:observed.length-count}};
  }
  const n=rgb.length/3,gray=new Uint8Array(n);let chroma=0;for(let i=0;i<n;i++){const c=[rgb[3*i],rgb[3*i+1],rgb[3*i+2]];gray[i]=Math.round(.2126*c[0]+.7152*c[1]+.0722*c[2]);chroma+=Math.max(...c)-Math.min(...c);}if(mode==='auto')mode=chroma/n<5?'otsu':'lab';
  const mask=new Uint8Array(n);let centers=null,cutoff=null,mixture=null,probability=null;
  if(['threshold','otsu'].includes(mode)){cutoff=mode==='otsu'?otsu(gray):threshold;if(!Number.isFinite(cutoff)||cutoff<0||cutoff>255)throw new Error('Threshold must be 0–255.');for(let i=0;i<n;i++)mask[i]=gray[i]<=cutoff?1:0;}
  else if(mode==='red-white-mixture'){const result=redWhiteMixture(rgb,{validMask:observed});mask.set(result.mask);mixture=result.metadata;probability=result.probability;}
  else if(mode==='red-white'){for(let i=0;i<n;i++)mask[i]=rgb[3*i]>1.5*rgb[3*i+1]&&rgb[3*i]>1.5*rgb[3*i+2]?1:0;}
  else if(['lab','swatches','lobes','printed-lobes'].includes(mode)){
    const labs=new Float64Array(n*3);for(let i=0;i<n;i++)labs.set(rgbToLab(Array.from(rgb.slice(i*3,i*3+3))),3*i);
    const sq=(i,c)=>[0,1,2].reduce((s,k)=>s+(labs[3*i+k]-c[k])**2,0);
    if(mode==='swatches'){colorsSafe(swatches);centers=swatches.map(x=>rgbToLab(hexColor(x)));}
    else if(mode==='lobes'){if(!lobes)throw new Error('Lobe colours are required.');centers=lobes.map(c=>[...c]);}
    else if(mode==='printed-lobes'){if(!printed)throw new Error('Lobe samples are required.');mask.set(printedPaperMask(labs,printed,{observed}));centers=printed.map(list=>[0,1,2].map(c=>list.reduce((s,l)=>s+l[c],0)/list.length));}
    else{let darkest=0,brightest=0;for(let i=0;i<n;i++){if(labs[3*i]<labs[3*darkest])darkest=i;if(labs[3*i]>labs[3*brightest])brightest=i;}centers=[Array.from(labs.slice(3*darkest,3*darkest+3)),Array.from(labs.slice(3*brightest,3*brightest+3))];if(sq(darkest,centers[1])<1e-6){let far=0;for(let i=1;i<n;i++)if(sq(i,centers[0])>sq(far,centers[0]))far=i;centers[1]=Array.from(labs.slice(3*far,3*far+3));}
      // Extremes alone can trap k-means on a few white background pixels.
      // Also seed from the paper population; keep the lowest full-image error.
      const order=Array.from({length:n},(_,i)=>i).sort((a,b)=>labs[3*a]-labs[3*b]);
      const seeds=[centers,[.25,.75].map(q=>Array.from(labs.slice(3*order[Math.min(n-1,Math.floor(q*n))],3*order[Math.min(n-1,Math.floor(q*n))]+3)))];
      let bestError=Infinity,bestCenters=centers;
      for(const seed of seeds){
        centers=seed.map(c=>[...c]);
        for(let round=0;round<20;round++){
          const sums=[[0,0,0],[0,0,0]],counts=[0,0];
          for(let i=0;i<n;i++){const k=sq(i,centers[0])<=sq(i,centers[1])?0:1;counts[k]++;for(let j=0;j<3;j++)sums[k][j]+=labs[3*i+j];}
          const next=centers.map((c,k)=>counts[k]?sums[k].map(x=>x/counts[k]):c),moved=next.reduce((s,c,k)=>s+c.reduce((sum,x,j)=>sum+(x-centers[k][j])**2,0),0);
          centers=next;if(moved<1e-6)break;
        }
        let error=0;for(let i=0;i<n;i++)error+=Math.min(sq(i,centers[0]),sq(i,centers[1]));
        if(error<bestError){bestError=error;bestCenters=centers;}
      }
      centers=bestCenters.sort((a,b)=>a[0]-b[0]);}
    if(mode!=='printed-lobes')for(let i=0;i<n;i++)mask[i]=sq(i,centers[0])<=sq(i,centers[1])?1:0;
  }else throw new Error('Unknown two-colour conversion mode.');
  if(invert)for(let i=0;i<n;i++){if(observed&&!observed[i])continue;mask[i]^=1;if(probability)probability[i]=1-probability[i];}return{mask,probability,metadata:{method:mode,threshold:cutoff,labCenters:centers,...(mixture?{mixture}:{}),inverted:invert,dither:false,...(observed?{observedPixels:observed.reduce((s,v)=>s+v,0),missingPixels:observed.reduce((s,v)=>s+1-v,0)}:{})}};
}
/** Label one four-connected region. Optional integer labels let sparse callers
 * reuse the traversal without scanning unrelated regions of the image. */
export function connectedComponent(mask,n,seed,seen,label=1){const value=mask[seed],pixels=[seed];seen[seed]=label;let border=false;for(let h=0;h<pixels.length;h++){const p=pixels[h],x=p%n,y=Math.floor(p/n);if(x===0||y===0||x===n-1||y===n-1)border=true;for(const q of[x>0?p-1:-1,x<n-1?p+1:-1,y>0?p-n:-1,y<n-1?p+n:-1])if(q>=0&&!seen[q]&&mask[q]===value){seen[q]=label;pixels.push(q);}}return{pixels,border};}
export function components(mask,n,value){const seen=new Uint8Array(mask.length),out=[];for(let i=0;i<mask.length;i++)if(!seen[i]&&mask[i]===value)out.push(connectedComponent(mask,n,i,seen));return out;}
export function cleanupMask(mask,n,width,{removeSpecks=0,fillHoles=0,smoothRadius=0}={}){
  for(const x of[removeSpecks,fillHoles,smoothRadius])if(!Number.isFinite(x)||x<0)throw new Error('Cleanup dimensions must be nonnegative.');const out=mask.slice(),area=(width/n)**2;
  for(const [value,limit]of [[1,removeSpecks],[0,fillHoles]])if(limit>0)for(const c of components(out,n,value))if(!c.border&&c.pixels.length*area<limit)for(const p of c.pixels)out[p]^=1;
  if(smoothRadius>0){const sigma=smoothRadius*n/width,r=Math.min(30,Math.max(1,Math.ceil(3*sigma))),kernel=Array.from({length:2*r+1},(_,j)=>Math.exp(-.5*((j-r)/sigma)**2)),sum=kernel.reduce((a,b)=>a+b),tmp=new Float32Array(out.length);for(let y=0;y<n;y++)for(let x=0;x<n;x++){let s=0;for(let j=-r;j<=r;j++)s+=kernel[j+r]*out[y*n+clamp(x+j,0,n-1)];tmp[y*n+x]=s/sum;}for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){let s=0;for(let j=-r;j<=r;j++)s+=kernel[j+r]*tmp[clamp(y+j,0,n-1)*n+x];out[y*n+x]=s/sum>=.5?1:0;}}
  // The border sets slit endpoints: never silently edit it during cleanup.
  for(let i=0;i<n;i++){out[i]=mask[i];out[(n-1)*n+i]=mask[(n-1)*n+i];out[i*n]=mask[i*n];out[i*n+n-1]=mask[i*n+n-1];}
  let changes=0;for(let i=0;i<out.length;i++)changes+=out[i]!==mask[i];return{mask:out,changes,fraction:changes/out.length};
}
function maskChains(mask,n,{width=100,snapRadius=0}={}){
  if(mask.length!==n*n)throw new Error('Square mask required.');const edges=[],adj=new Map(),point=id=>[id%(n+1),Math.floor(id/(n+1))];const edge=(a,b)=>{const id=edges.length;edges.push([a,b]);if(!adj.has(a))adj.set(a,[]);if(!adj.has(b))adj.set(b,[]);adj.get(a).push(id);adj.get(b).push(id);};
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(x<n-1&&mask[y*n+x]!==mask[y*n+x+1])edge(y*(n+1)+x+1,(y+1)*(n+1)+x+1);if(y<n-1&&mask[y*n+x]!==mask[(y+1)*n+x])edge((y+1)*(n+1)+x,(y+1)*(n+1)+x+1);}
  if(edges.length>80000)throw new Error('Artwork is too detailed. Reduce resolution or simplify the two-colour mask.');
  const anchors=new Set([...adj].filter(([v,es])=>es.length!==2||point(v).some(x=>x===0||x===n)).map(([v])=>v)),used=new Uint8Array(edges.length),chains=[];
  function walk(v,e){const ps=[point(v)];while(!used[e]){used[e]=1;const [a,b]=edges[e];v=v===a?b:a;ps.push(point(v));if(anchors.has(v))break;const next=adj.get(v).find(i=>!used[i]);if(next===undefined)break;e=next;}return ps.map(p=>mul(p,width/n));}
  for(const v of [...anchors].sort((a,b)=>a-b))for(const e of adj.get(v))if(!used[e])chains.push(walk(v,e));edges.forEach(([v],e)=>{if(!used[e])chains.push(walk(v,e));});
  const repaired=repairJunctions(chains,snapRadius,width),fitChains=repaired.chains;
  return{width,n,phase:mask[0],fitChains,sourceBoundarySegments:edges.length,tracedChains:chains.length,junctionRepairs:repaired.moves};
}
function fitMaskChains({width,n,phase,fitChains,sourceBoundarySegments,tracedChains,junctionRepairs},{fitTolerance=.25,maxSpan=12,cornerDegrees=65,polygonal=false,identicalSheets=false,mixedBoundaries=false}={}){
  // Strict mirror routing is sensitive to small changes in guide incidence.
  // Retain its established RDP geometry; refine line positions only when the
  // routing graph may use independent sheets (matching is still tried later).
  const polygonFit=identicalSheets?rdp:fitPolygonal;
  const boundaryFit=mixedBoundaries?fitBoundary:fitPolyline;
  const curves=polygonal?fitChains.flatMap(p=>{const q=polygonFit(p,fitTolerance);return q.slice(1).flatMap((b,i)=>splitLong(Cubic.line(q[i],b),maxSpan));}):fitChains.flatMap(p=>boundaryFit(p,fitTolerance,maxSpan,cornerDegrees,Math.max(2*fitTolerance,2*width/n)));return{width,phase,curves,metadata:{input:'raster',traceResolution:n,fitTolerance,polygonal,straightSpanRefinement:mixedBoundaries||polygonal&&!identicalSheets,sourceBoundarySegments,tracedChains,junctionRepairs,vectorizationChangesArtwork:true,paperColors:['#bd1111','#ffffff']}};
}
export function traceMask(mask,n,settings={}){
  return fitMaskChains(maskChains(mask,n,settings),settings);
}
// Left-edge transitions include their lower endpoint (v <= y), matching the
// half-open interior crossing test. Using v < y inverted whole rows at corners.
export function targetSampler(target,tol=.01){const segments=[],counts=new Map();for(const c of target.curves){const p=c.flatten(tol);for(let i=1;i<p.length;i++)segments.push([p[i-1],p[i]]);for(const p of[c.p[0],c.p[3]])if(Math.abs(p[0])<1e-6){const key=p[1].toFixed(6);counts.set(key,(counts.get(key)||0)+1);}}
  const left=[...counts].filter(([y,n])=>n%2&&+y>1e-6&&+y<target.width-1e-6).map(([y])=>+y);
  return (x,y)=>{let color=target.phase;for(const v of left)if(v<=y)color^=1;for(const [a,b]of segments)if((a[1]>y)!==(b[1]>y)&&a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1])<x)color^=1;return color;};
}
export function sampleTarget(target,n=200){const mask=new Uint8Array(n*n),tol=.01,ss=[],counts=new Map();for(const c of target.curves){const p=c.flatten(tol);for(let i=1;i<p.length;i++)ss.push([p[i-1],p[i]]);for(const v of[c.p[0],c.p[3]])if(Math.abs(v[0])<1e-6){const key=v[1].toFixed(6);counts.set(key,(counts.get(key)||0)+1);}}const left=[...counts].filter(([y,c])=>c%2&&+y>1e-6&&+y<target.width-1e-6).map(([y])=>+y);for(let j=0;j<n;j++){const y=(j+.5)*target.width/n,xx=[];let c=target.phase;for(const v of left)if(v<=y)c^=1;for(const[a,b]of ss)if((a[1]>y)!==(b[1]>y))xx.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));xx.sort((a,b)=>a-b);let h=0;for(let i=0;i<n;i++){const x=(i+.5)*target.width/n;while(h<xx.length&&xx[h]<x){c^=1;h++;}mask[j*n+i]=c;}}return mask;}
export function preprocessPixels({rgba,imageWidth,imageHeight,quad=null,cropProvenance=null,settings={}}){
  const requestedResolution=settings.resolution??400;
  if(!Number.isInteger(requestedResolution)||requestedResolution<32||requestedResolution>600)throw new Error('Tracing resolution must be 32–600.');
  const n=Math.min(requestedResolution,Math.max(32,Math.min(imageWidth,imageHeight))),width=settings.width||100;
  // Mal's import of a photograph's crop (`photoImport`, its prepareImage
  // settings): in `auto` its two papers are its lobes' colours, which a third
  // colour (a glued motif, a shadow, glare) cannot steal as it can a
  // two-cluster split of the square alone.
  const photo=Boolean(quad)&&settings.photoImport===true;
  // Printed papers (a pattern, motifs) are their lobes' whole colours, not one
  // each: their print would otherwise go to whichever paper's colour is nearer.
  const auto=photo&&(settings.mode??'auto')==='auto',printed=auto?printedLobes(rgba,imageWidth,imageHeight,quad):null;
  const lobes=auto&&!printed?lobeColours(rgba,imageWidth,imageHeight,quad):null;
  const {rgb,validMask}=rectifyWithCoverage(rgba,imageWidth,imageHeight,n,quad,settings.background||'#ffffff'),classified=quantize(rgb,{...settings,validMask,...(printed?{mode:'printed-lobes',printed}:lobes?{mode:'lobes',lobes}:{})});
  // A crop's outermost millimetre is the least sure of the photo:
  // a corner slightly off leaves slivers of a lobe or the table there, which
  // no template keeps and the fidelity check then counts as lost features.
  // It takes the colours just inside it (border.js), before anyone sees it.
  const border=photo?stabilizeBorder(classified.mask,n,width,1,settings.minWidth??2):null;
  // What is left of them: pieces of either colour on the edge smaller than
  // 12 mm² (a 3.5 mm square, below any cell a design puts there). Inside,
  // specks and holes under 6 mm² are glare, dust or print, not detail a
  // template can cut, and the fidelity check would ask it to keep them.
  let edgeSpecks=0,specks=null;
  if(border){
    for(const value of[0,1])for(const c of components(border.mask,n,value))if(c.border&&c.pixels.length*(width/n)**2<12){for(const p of c.pixels)border.mask[p]^=1;edgeSpecks+=c.pixels.length;}
    specks=cleanupMask(border.mask,n,width,{removeSpecks:6,fillHoles:6});
  }
  const quantized=border?{...classified,mask:specks.mask,metadata:{...classified.metadata,cropBorder:{...border.metadata,edgeSpeckPixels:edgeSpecks,speckPixels:specks.changes}}}:classified;
  const target=settings.algorithm==='direct'?{width,phase:0,curves:[],metadata:{input:'photograph for direct fitting',paperColors:colorsSafe(settings.paperColors),direct:true,preprocessing:{...quantized.metadata,actualResolution:n,traceUsed:false,traceChangeFraction:0,totalChangeFraction:0,sourceMaskComponents:components(quantized.mask,n,1).length,vectorSampleComponents:components(quantized.mask,n,1).length}},sourceImage:{mask:quantized.mask,probability:quantized.probability||Float32Array.from(quantized.mask),resolution:n}}:preprocessMask(quantized.mask,n,{...settings,width},quantized.metadata);
  if(validMask){
    target.sourceImage.validMask=validMask;
    target.metadata.preprocessing.observationMethod='complete-bilinear-support';
    // Existing weighted initialization and topology paths must also see the
    // missing observations, without making them editable photographed pixels.
    target.sourceImage.weights=Float64Array.from(validMask);
  }
  target.metadata.sourceImage={widthPixels:imageWidth,heightPixels:imageHeight,cropCorners:quad?quad.map(p=>[...p]):null,cropProvenance};
  target.metadata.preprocessing.requestedResolution=requestedResolution;
  return{target,rgb,mask:quantized.mask,n};
}

/** A painted mask is already classified and rectified. Preserve its source
 * pixel grid; the fitter resamples probability and weight together per scale.
 */
export function preprocessBinaryMask(input,settings={}){
  const n=input.resolution;
  if(!Number.isInteger(n)||n<32||n>600||input.mask?.length!==n*n)throw new Error('A binary mask must be a square of 32–600 pixels per side.');
  if(Array.from(input.mask).some(v=>v!==0&&v!==1))throw new Error('A binary mask must contain only zero and one.');
  const mask=Uint8Array.from(input.mask,v=>settings.invert?1-v:v),validMask=observedMask(input.validMask,n*n),importance=imageWeights(input.weights,n*n);
  const seedCells=input.seedCells??4;
  if(!Number.isInteger(seedCells)||seedCells<2||seedCells>8)throw new Error('The supporting grid must have 2–8 cells per side.');
  const sourceImage={mask,probability:Float32Array.from(mask),resolution:n,...(importance?{weights:Float64Array.from(importance.values),seedCells}:{})};
  if(validMask){
    sourceImage.validMask=validMask;
    sourceImage.weights=Float64Array.from(validMask,(v,i)=>v*(importance?importance.values[i]:1));
    imageWeights(sourceImage.weights,n*n); // Reject no observed, protected pixels.
  }
  const count=components(mask,n,1).length;
  const target={width:settings.width||100,phase:0,curves:[],sourceImage,metadata:{input:'Binary artwork mask',direct:true,paperColors:colorsSafe(settings.paperColors),
    preprocessing:{method:'binary',actualResolution:n,inverted:!!settings.invert,traceUsed:false,traceChangeFraction:0,totalChangeFraction:0,sourceMaskComponents:count,vectorSampleComponents:count},
    ...(importance?{imageWeights:{resolution:n,weightMass:importance.mass,meaning:'Zero permits colour changes; positive weights enter the normalized image objective. The original mask is retained.',seedCells}}:{})}};
  return{target,mask,n};
}
/** Reuse classification while exploring bounded geometric interpretations. */
export function preprocessMask(mask,n,settings={},classification={}){
  return prepareMaskTrace(mask,n,settings,classification)().target;
}

/** Fit several tolerances to the same prepared mask without rebuilding its
 * pixel-edge graph, junctions or cleanup. The caller keeps the input mask and
 * settings unchanged during this local search. Each call owns its curves and
 * sampled mask; graph noding or metadata edits cannot poison the next attempt.
 */
export function prepareMaskTrace(mask,n,settings={},classification={}){
  const width=settings.width||100;
  const border=stabilizeBorder(mask,n,width,settings.borderRadius??1,settings.nominalWidth??2.5);
  const clean=cleanupMask(border.mask,n,width,settings),chains=maskChains(clean.mask,n,{...settings,width});
  const sourceMaskComponents=components(mask,n,1).length;
  return(fitTolerance=settings.fitTolerance)=>{
  const target=fitMaskChains(chains,{...settings,fitTolerance});
  target.curves=nodeCurves(target.curves,settings.geometryTolerance||.01);
  target.metadata.paperColors=colorsSafe(settings.paperColors);
  // Retain the unedited classified crop for forward-image error measurement.
  target.sourceImage={mask,resolution:n};
  const sampled=sampleTarget(target,n);let changes=0,totalChanges=0;
  for(let i=0;i<sampled.length;i++){changes+=sampled[i]!==clean.mask[i];totalChanges+=sampled[i]!==mask[i];}
  target.metadata.preprocessing={...classification,requestedResolution:settings.resolution??n,actualResolution:n,border:structuredClone(border.metadata),cleanupChangedPixels:clean.changes,cleanupChangeFraction:clean.fraction,traceChangedPixels:changes,traceChangeFraction:changes/sampled.length,totalChangedPixels:totalChanges,totalChangeFraction:totalChanges/sampled.length,sourceMaskComponents,vectorSampleComponents:components(sampled,n,1).length};
  return{target,sampled};
  };
}
