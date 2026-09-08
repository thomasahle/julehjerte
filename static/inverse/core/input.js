/** Safe vector import and deterministic two-colour image preprocessing. */
import {Cubic,fitPolyline,rdp,splitLong,add,sub,mul,distance,cross,clamp} from './bezier.js';
import {nodeCurves} from './geometry.js';
import {repairJunctions} from './junctions.js';
import {stabilizeBorder} from './border.js';
import {redWhiteMixture} from './unmix.js';
import {fitPolygonal,fitBoundary} from './polygonal.js';
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
  if(!(rgba instanceof Uint8ClampedArray||rgba instanceof Uint8Array)||rgba.length!==4*width*height)throw new Error('Invalid image pixels.');if(width*height>24e6)throw new Error('Image exceeds 24 megapixels.');if(!Number.isInteger(n)||n<32||n>600)throw new Error('Tracing resolution must be 32–600.');
  const bg=hexColor(background);let h=null;if(quad){if(!Array.isArray(quad)||quad.length!==4||quad.some(p=>p.length!==2||p.some(x=>!Number.isFinite(x))))throw new Error('Select four finite crop corners.');const signs=quad.map((p,i)=>cross(sub(quad[(i+1)%4],p),sub(quad[(i+2)%4],quad[(i+1)%4])));if(signs.some(x=>Math.abs(x)<1e-6)||!(signs.every(x=>x>0)||signs.every(x=>x<0)))throw new Error('The crop corners must form a convex quadrilateral in order.');const a=[],b=[];[[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const [x,y]=quad[i];a.push([u,v,1,0,0,0,-u*x,-v*x],[0,0,0,u,v,1,-u*y,-v*y]);b.push(x,y);});h=gaussianSolve(a,b);}else if(Math.abs(width-height)>1)throw new Error('Select the four corners of the square overlap, or use a square image.');
  const rgb=new Uint8Array(n*n*3);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=(x+.5)/n,v=(y+.5)/n,den=h?h[6]*u+h[7]*v+1:1,xx=h?(h[0]*u+h[1]*v+h[2])/den-.5:u*width-.5,yy=h?(h[3]*u+h[4]*v+h[5])/den-.5:v*height-.5,x0=Math.floor(xx),y0=Math.floor(yy),dx=xx-x0,dy=yy-y0;let vals=[0,0,0];for(let j=0;j<2;j++)for(let i=0;i<2;i++){const w=(i?dx:1-dx)*(j?dy:1-dy),px=x0+i,py=y0+j;for(let k=0;k<3;k++){let z=bg[k];if(px>=0&&py>=0&&px<width&&py<height){const index=4*(py*width+px),alpha=rgba[index+3]/255;z=alpha*rgba[index+k]+(1-alpha)*bg[k];}vals[k]+=w*z;}}for(let k=0;k<3;k++)rgb[3*(y*n+x)+k]=Math.round(vals[k]);}return rgb;
}
export function rgbToLab(rgb){const linear=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}),[r,g,b]=linear,xyz=[(.4124564*r+.3575761*g+.1804375*b)/.95047,.2126729*r+.7151522*g+.072175*b,(.0193339*r+.119192*g+.9503041*b)/1.08883],f=xyz.map(x=>x>.008856?Math.cbrt(x):7.787*x+16/116);return[116*f[1]-16,500*(f[0]-f[1]),200*(f[1]-f[2])];}
export function otsu(values){const hist=Array(256).fill(0);for(const v of values)hist[v]++;let sum=0;hist.forEach((c,i)=>sum+=c*i);let w0=0,s0=0,best=-1,t=128;for(let i=0;i<256;i++){w0+=hist[i];s0+=i*hist[i];const w1=values.length-w0;if(!w0||!w1)continue;const score=w0*w1*(s0/w0-(sum-s0)/w1)**2;if(score>best){best=score;t=i;}}return t;}
export function quantize(rgb,{mode='auto',threshold=128,swatches=['#bd1111','#ffffff'],invert=false}={}){
  const n=rgb.length/3,gray=new Uint8Array(n);let chroma=0;for(let i=0;i<n;i++){const c=[rgb[3*i],rgb[3*i+1],rgb[3*i+2]];gray[i]=Math.round(.2126*c[0]+.7152*c[1]+.0722*c[2]);chroma+=Math.max(...c)-Math.min(...c);}if(mode==='auto')mode=chroma/n<5?'otsu':'lab';
  const mask=new Uint8Array(n);let centers=null,cutoff=null,mixture=null,probability=null;
  if(['threshold','otsu'].includes(mode)){cutoff=mode==='otsu'?otsu(gray):threshold;if(!Number.isFinite(cutoff)||cutoff<0||cutoff>255)throw new Error('Threshold must be 0–255.');for(let i=0;i<n;i++)mask[i]=gray[i]<=cutoff?1:0;}
  else if(mode==='red-white-mixture'){const result=redWhiteMixture(rgb);mask.set(result.mask);mixture=result.metadata;probability=result.probability;}
  else if(mode==='red-white'){for(let i=0;i<n;i++)mask[i]=rgb[3*i]>1.5*rgb[3*i+1]&&rgb[3*i]>1.5*rgb[3*i+2]?1:0;}
  else if(['lab','swatches'].includes(mode)){
    const labs=new Float64Array(n*3);for(let i=0;i<n;i++)labs.set(rgbToLab(Array.from(rgb.slice(i*3,i*3+3))),3*i);
    const sq=(i,c)=>[0,1,2].reduce((s,k)=>s+(labs[3*i+k]-c[k])**2,0);
    if(mode==='swatches'){colorsSafe(swatches);centers=swatches.map(x=>rgbToLab(hexColor(x)));}
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
    for(let i=0;i<n;i++)mask[i]=sq(i,centers[0])<=sq(i,centers[1])?1:0;
  }else throw new Error('Unknown two-colour conversion mode.');
  if(invert)for(let i=0;i<n;i++){mask[i]^=1;if(probability)probability[i]=1-probability[i];}return{mask,probability,metadata:{method:mode,threshold:cutoff,labCenters:centers,...(mixture?{mixture}:{}),inverted:invert,dither:false}};
}
export function components(mask,n,value){const seen=new Uint8Array(mask.length),out=[];for(let i=0;i<mask.length;i++){if(seen[i]||mask[i]!==value)continue;const pixels=[i];seen[i]=1;let border=false;for(let h=0;h<pixels.length;h++){const p=pixels[h],x=p%n,y=Math.floor(p/n);if(x===0||y===0||x===n-1||y===n-1)border=true;for(const q of[x>0?p-1:-1,x<n-1?p+1:-1,y>0?p-n:-1,y<n-1?p+n:-1])if(q>=0&&!seen[q]&&mask[q]===value){seen[q]=1;pixels.push(q);}}out.push({pixels,border});}return out;}
export function cleanupMask(mask,n,width,{removeSpecks=0,fillHoles=0,smoothRadius=0}={}){
  for(const x of[removeSpecks,fillHoles,smoothRadius])if(!Number.isFinite(x)||x<0)throw new Error('Cleanup dimensions must be nonnegative.');const out=mask.slice(),area=(width/n)**2;
  for(const [value,limit]of [[1,removeSpecks],[0,fillHoles]])if(limit>0)for(const c of components(out,n,value))if(!c.border&&c.pixels.length*area<limit)for(const p of c.pixels)out[p]^=1;
  if(smoothRadius>0){const sigma=smoothRadius*n/width,r=Math.min(30,Math.max(1,Math.ceil(3*sigma))),kernel=Array.from({length:2*r+1},(_,j)=>Math.exp(-.5*((j-r)/sigma)**2)),sum=kernel.reduce((a,b)=>a+b),tmp=new Float32Array(out.length);for(let y=0;y<n;y++)for(let x=0;x<n;x++){let s=0;for(let j=-r;j<=r;j++)s+=kernel[j+r]*out[y*n+clamp(x+j,0,n-1)];tmp[y*n+x]=s/sum;}for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){let s=0;for(let j=-r;j<=r;j++)s+=kernel[j+r]*tmp[clamp(y+j,0,n-1)*n+x];out[y*n+x]=s/sum>=.5?1:0;}}
  // The border sets slit endpoints: never silently edit it during cleanup.
  for(let i=0;i<n;i++){out[i]=mask[i];out[(n-1)*n+i]=mask[(n-1)*n+i];out[i*n]=mask[i*n];out[i*n+n-1]=mask[i*n+n-1];}
  let changes=0;for(let i=0;i<out.length;i++)changes+=out[i]!==mask[i];return{mask:out,changes,fraction:changes/out.length};
}
export function traceMask(mask,n,{width=100,fitTolerance=.25,maxSpan=12,cornerDegrees=65,polygonal=false,snapRadius=0,identicalSheets=false,mixedBoundaries=false}={}){
  if(mask.length!==n*n)throw new Error('Square mask required.');const edges=[],adj=new Map(),point=id=>[id%(n+1),Math.floor(id/(n+1))];const edge=(a,b)=>{const id=edges.length;edges.push([a,b]);if(!adj.has(a))adj.set(a,[]);if(!adj.has(b))adj.set(b,[]);adj.get(a).push(id);adj.get(b).push(id);};
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(x<n-1&&mask[y*n+x]!==mask[y*n+x+1])edge(y*(n+1)+x+1,(y+1)*(n+1)+x+1);if(y<n-1&&mask[y*n+x]!==mask[(y+1)*n+x])edge((y+1)*(n+1)+x,(y+1)*(n+1)+x+1);}
  if(edges.length>80000)throw new Error('Artwork is too detailed. Reduce resolution or simplify the two-colour mask.');
  const anchors=new Set([...adj].filter(([v,es])=>es.length!==2||point(v).some(x=>x===0||x===n)).map(([v])=>v)),used=new Uint8Array(edges.length),chains=[];
  function walk(v,e){const ps=[point(v)];while(!used[e]){used[e]=1;const [a,b]=edges[e];v=v===a?b:a;ps.push(point(v));if(anchors.has(v))break;const next=adj.get(v).find(i=>!used[i]);if(next===undefined)break;e=next;}return ps.map(p=>mul(p,width/n));}
  for(const v of [...anchors].sort((a,b)=>a-b))for(const e of adj.get(v))if(!used[e])chains.push(walk(v,e));edges.forEach(([v],e)=>{if(!used[e])chains.push(walk(v,e));});
  const repaired=repairJunctions(chains,snapRadius,width),fitChains=repaired.chains;
  // Strict mirror routing is sensitive to small changes in guide incidence.
  // Retain its established RDP geometry; refine line positions only when the
  // routing graph may use independent sheets (matching is still tried later).
  const polygonFit=identicalSheets?rdp:fitPolygonal;
  const boundaryFit=mixedBoundaries?fitBoundary:fitPolyline;
  const curves=polygonal?fitChains.flatMap(p=>{const q=polygonFit(p,fitTolerance);return q.slice(1).flatMap((b,i)=>splitLong(Cubic.line(q[i],b),maxSpan));}):fitChains.flatMap(p=>boundaryFit(p,fitTolerance,maxSpan,cornerDegrees,Math.max(2*fitTolerance,2*width/n)));return{width,phase:mask[0],curves,metadata:{input:'raster',traceResolution:n,fitTolerance,polygonal,straightSpanRefinement:mixedBoundaries||polygonal&&!identicalSheets,sourceBoundarySegments:edges.length,tracedChains:chains.length,junctionRepairs:repaired.moves,vectorizationChangesArtwork:true,paperColors:['#bd1111','#ffffff']}};
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
  const rgb=rectify(rgba,imageWidth,imageHeight,n,quad,settings.background||'#ffffff'),quantized=quantize(rgb,settings);
  const target=settings.algorithm==='direct'?{width,phase:0,curves:[],metadata:{input:'photograph for direct fitting',paperColors:colorsSafe(settings.paperColors),direct:true,preprocessing:{...quantized.metadata,actualResolution:n,traceUsed:false,traceChangeFraction:0,totalChangeFraction:0,sourceMaskComponents:components(quantized.mask,n,1).length,vectorSampleComponents:components(quantized.mask,n,1).length}},sourceImage:{mask:quantized.mask,probability:quantized.probability||Float32Array.from(quantized.mask),resolution:n}}:preprocessMask(quantized.mask,n,{...settings,width},quantized.metadata);
  target.metadata.sourceImage={widthPixels:imageWidth,heightPixels:imageHeight,cropCorners:quad?quad.map(p=>[...p]):null,cropProvenance};
  target.metadata.preprocessing.requestedResolution=requestedResolution;
  return{target,rgb,mask:quantized.mask,n};
}
/** Reuse classification while exploring bounded geometric interpretations. */
export function preprocessMask(mask,n,settings={},classification={}){
  const width=settings.width||100;
  const border=stabilizeBorder(mask,n,width,settings.borderRadius??1,settings.nominalWidth??2.5);
  const clean=cleanupMask(border.mask,n,width,settings),target=traceMask(clean.mask,n,{...settings,width});
  target.curves=nodeCurves(target.curves,settings.geometryTolerance||.01);
  target.metadata.paperColors=colorsSafe(settings.paperColors);
  // Retain the unedited classified crop for forward-image error measurement.
  target.sourceImage={mask,resolution:n};
  const sampled=sampleTarget(target,n);let changes=0,totalChanges=0;
  for(let i=0;i<sampled.length;i++){changes+=sampled[i]!==clean.mask[i];totalChanges+=sampled[i]!==mask[i];}
  target.metadata.preprocessing={...classification,requestedResolution:settings.resolution??n,actualResolution:n,border: border.metadata,cleanupChangedPixels:clean.changes,cleanupChangeFraction:clean.fraction,traceChangedPixels:changes,traceChangeFraction:changes/sampled.length,totalChangedPixels:totalChanges,totalChangeFraction:totalChanges/sampled.length,sourceMaskComponents:components(mask,n,1).length,vectorSampleComponents:components(sampled,n,1).length};
  return target;
}
