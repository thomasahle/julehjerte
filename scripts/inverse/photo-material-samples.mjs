/** Sparse observations on the original photograph, independent of a derived
 * color mask. Diagnostic QA only: no labels enter cropping or template fitting.
 */
import {homography,project} from '../../static/inverse/locator/math.js';

export function validateMaterialSamples(annotation){
 if(typeof annotation?.id!=='string'||!/^[a-z0-9][a-z0-9-]*$/.test(annotation.id))throw new Error('Material review requires a safe case ID.');
 const source=annotation?.source;
 if(!source||!Number.isInteger(source.width)||!Number.isInteger(source.height)||source.width<1||source.height<1||!source.file||!/^[a-f0-9]{64}$/.test(source.sha256))throw new Error('Material samples require a pinned source photograph and dimensions.');
 if(!Array.isArray(source.paperNames)||source.paperNames.length!==2||source.paperNames.some(n=>typeof n!=='string'||!n)||source.paperNames[0]===source.paperNames[1])throw new Error('Name both observed papers.');
 if(!Array.isArray(annotation.groups)||!annotation.groups.length)throw new Error('Material samples require named groups.');
 const ids=new Set(),points=new Set(),papers=new Set();
 for(const group of annotation.groups){
  if(typeof group.id!=='string'||!group.id||ids.has(group.id)||![0,1].includes(group.paper)||!Array.isArray(group.points)||!group.points.length)throw new Error('Invalid or repeated material sample group.');
  ids.add(group.id);papers.add(group.paper);
  for(const p of group.points){
   if(!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isInteger(v))||p[0]<0||p[0]>=source.width||p[1]<0||p[1]>=source.height)throw new Error('Sample points must be integer pixel indices inside the photograph.');
   const key=p.join(',');if(points.has(key))throw new Error('A source pixel may be annotated only once.');points.add(key);
  }
 }
 if(papers.size!==2)throw new Error('Material review must observe both papers.');
 return annotation;
}

function cropTransform(quad,n){
 if(!Array.isArray(quad)||quad.length!==4||quad.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))throw new Error('Four finite crop corners required.');
 const signs=quad.map((a,i)=>{const b=quad[(i+1)%4],c=quad[(i+2)%4];return(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});
 if(signs.some(v=>Math.abs(v)<1e-8)||!(signs.every(v=>v>0)||signs.every(v=>v<0)))throw new Error('Material review requires a convex crop.');
 const h=homography(quad,[[0,0],[n,0],[n,n],[0,n]]);
 if(h.some(v=>!Number.isFinite(v)))throw new Error('Nonfinite material review transform.');
 return h;
}

function counts(rows){
 const total=rows.length,covered=rows.filter(r=>r.covered).length,correct=rows.filter(r=>r.correct===true).length;
 const mismatched=rows.filter(r=>r.correct===false&&r.predictedPaper!==null).length;
 return{total,covered,correct,mismatched,outsideCrop:total-covered,unavailable:covered-correct-mismatched,
  coverage:covered/total,agreementAllSamples:correct/total,agreementCovered:covered?correct/covered:null};
}

/** Masks use their existing binary phase. Infer one global phase against the
 * observations, then pass that same phase when reviewing the exported weave.
 * Missing/cropped-out observations remain in the all-sample denominator.
 */
export function reviewMaterialSamples(annotation,{mask=null,resolution=null,quad=null,phase=null}={}){
 validateMaterialSamples(annotation);
 if(phase!==null&&phase!==0&&phase!==1)throw new Error('Review phase must be 0, 1 or null.');
 if(mask!==null&&(!Number.isInteger(resolution)||resolution<1||mask.length!==resolution**2||Array.from(mask).some(v=>v!==0&&v!==1)))throw new Error('Review requires a square binary mask.');
 if(mask!==null&&quad===null)throw new Error('A mask requires its source crop.');
 const n=resolution??1;
 if(!Number.isInteger(n)||n<1)throw new Error('Invalid material review resolution.');
 const h=quad===null?null:cropTransform(quad,n),rows=[];
 for(const group of annotation.groups)for(const point of group.points){
  // Pixel-index annotations become pixel-edge centres before the homography.
  const mapped=h?project(h,point.map(v=>v+.5)):null;
  const covered=!!mapped&&mapped.every(v=>Number.isFinite(v)&&v>=0&&v<n);
  const pixel=covered?mapped.map(Math.floor):null;
  rows.push({group:group.id,point:[...point],paper:group.paper,cropPoint:mapped,covered,
   maskValue:covered&&mask!==null?mask[pixel[1]*n+pixel[0]]:null});
 }
 const observed=rows.filter(r=>r.maskValue!==null),errors=[0,1].map(p=>observed.filter(r=>(r.maskValue^p)!==r.paper).length);
 const selected=phase??(observed.length?Number(errors[1]<errors[0]):null);
 for(const row of rows){row.predictedPaper=row.maskValue===null||selected===null?null:row.maskValue^selected;row.correct=row.predictedPaper===null?null:row.predictedPaper===row.paper;}
 return{...counts(rows),phase:selected,phaseInferred:phase===null,phaseAmbiguous:phase===null&&errors[0]===errors[1],
  allReviewedSamplesMatch:rows.every(r=>r.correct===true),
  groups:annotation.groups.map(g=>({id:g.id,paper:g.paper,...counts(rows.filter(r=>r.group===g.id))})),rows,
  meaning:'Sparse assistant-reviewed photo samples, not complete pixel accuracy or cutting-path truth. Cropped-out and unavailable samples remain in the denominator.'};
}
