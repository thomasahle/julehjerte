/** Observed-outline check for a photometric lattice proposal.
 * Overlap corners remain fixed. Only the two cap depths are estimated from
 * the existing colour fields; neither artwork labels nor templates are used.
 */
import {bilinear,homography,project,convexQuad,trimMean,quantile} from './math.js';
const SQUARE=[[0,0],[1,0],[1,1],[0,1]],count=36;
export function auditGridOutline(f,quad,{mode=0,initialDepths=[.5,.5],scale=1}={}){
 if(!convexQuad(quad))return{passed:false,reason:'Non-convex overlap proposal'};
 let H;try{H=homography(SQUARE,quad);}catch{return{passed:false,reason:'Degenerate overlap proposal'};}
 if(Math.abs(H[6])>.65||Math.abs(H[7])>.65)return{passed:false,reason:'Perspective exceeds the existing shape limits'};
 const arc=(side,depth)=>Array.from({length:count},(_,k)=>{const t=Math.PI*(k+.5)/count;return project(H,side?[-depth*Math.sin(t),.5+.5*Math.cos(t)]:[.5-.5*Math.cos(t),-depth*Math.sin(t)]);});
 const capFields=f.palette?[f.pd,f.pd]:mode?[f.rd,f.wd]:[f.wd,f.rd],capProb=mode?[f.red,f.white]:[f.white,f.red];
 const residual=(field,points)=>points.map(p=>Math.abs(bilinear(field,f.w,f.h,...p,-30)));
 const depths=[];
 for(let side=0;side<2;side++){
  const score=depth=>trimMean(residual(capFields[side],arc(side,depth)),.85);
  const candidates=[...Array.from({length:11},(_,i)=>.35+.05*i),Math.max(.35,Math.min(.85,initialDepths[side]))];
  let best=candidates.map(depth=>({depth,loss:score(depth)})).sort((a,b)=>a.loss-b.loss)[0];
  // A coarse scan supplies a bounded local interval without assuming that
  // occluded or textured silhouettes have a globally unimodal objective.
  let a=Math.max(.35,best.depth-.05),b=Math.min(.85,best.depth+.05);
  const ratio=(Math.sqrt(5)-1)/2;let c=b-ratio*(b-a),d=a+ratio*(b-a),fc=score(c),fd=score(d);
  for(let step=0;step<24;step++){
   if(fc<fd){b=d;d=c;fd=fc;c=b-ratio*(b-a);fc=score(c);}else{a=c;c=d;fc=fd;d=a+ratio*(b-a);fd=score(d);}
  }
  for(const candidate of [{depth:c,loss:fc},{depth:d,loss:fd}])if(candidate.loss<best.loss)best=candidate;
  depths.push(best.depth);
 }
 const arcs=depths.map((depth,side)=>arc(side,depth)),sides=[0,1].map(side=>Array.from({length:count},(_,k)=>{const t=(k+.5)/count;return project(H,side?[1-t,1]:[1,t]);}));
 const arcResiduals=arcs.map((points,i)=>residual(capFields[i],points)),sideResiduals=sides.map(points=>residual(f.pd,points)),threshold=Math.max(2,f.w*.012);
 const support=a=>a.filter(v=>v<threshold).length/a.length,lobeOutlineSupport=arcResiduals.map(support),lowerOutlineSupport=sideResiduals.map(support),capColourLoss=[];
 for(let side=0;side<2;side++){
  const errors=[];
  for(let u=.1;u<.96;u+=.14)for(let v=-.38;v<-.04;v+=.11)if(Math.hypot(u-.5,v)<.46){const p=project(H,side?[v*2*depths[side],u]:[u,v*2*depths[side]]);errors.push(1-bilinear(capProb[side],f.w,f.h,...p,0));}
  capColourLoss.push(trimMean(errors,.85));
 }
 const passed=[...lobeOutlineSupport,...lowerOutlineSupport].every(v=>v>=.65)&&capColourLoss.every(v=>v<=.30);
 return{passed,reason:passed?'Both paper lobes and lower edges support the proposed overlap':'The lattice proposal is not supported by the physical paper outline',lobeDepths:depths,lobeOutlineSupport,lowerOutlineSupport,capColourLoss,medianLobeResidualPx:arcResiduals.map(a=>quantile(a,.5)/scale),outline:[arcs[0],sides[0],sides[1],arcs[1]],scope:'Observed registration evidence; not a paper-strength or weaving certificate'};
}
