/** Requested square symmetries as hard constraints on the fitted controls.
 *
 * Frame: x right, y down, both in 0..w. Family A cuts travel y=0 -> y=w with x
 * free; family B cuts travel x=0 -> x=w with y free. A cut is indexed inside
 * its family by its crossing coordinate (axis f), so A cut i is the i-th from
 * the left and B cut i the i-th from the top, and a family of n cuts uses
 * indices 0..n-1.
 *
 * Pairing table. "forward" ties cubic j point k to the partner's cubic j point
 * k; "reversed" ties it to the partner's cubic m-1-j point 3-k, which needs
 * both cuts to hold the same number m of cubics. The coordinate columns give
 * this cut's coordinates in terms of the partner's.
 *
 *   transform      A cut i pairs   B cut i pairs   direction        coordinates
 *   mirrorX        A cut n-1-i     B cut i         A fwd, B rev     x=w-x', y=y'
 *   mirrorY        A cut i         B cut n-1-i     A rev, B fwd     x=x',   y=w-y'
 *   rotate180      A cut n-1-i     B cut n-1-i     reversed         x=w-x', y=w-y'
 *   transpose      B cut i         A cut i         forward          x=y',   y=x'
 *   antiTranspose  B cut n-1-i     A cut n-1-i     reversed         x=w-y', y=w-x'
 *
 * mirrorX keeps every y and reverses the left-to-right order, so it maps each
 * B cut onto itself travelled backwards; mirrorY does the same to each A cut.
 * A cut paired with itself ties its own points: the middle cut of an odd
 * family under mirrorX therefore collapses onto the midline x=w/2, which the
 * union-find reports as a pinned constant rather than a group. transpose and
 * antiTranspose need equal family counts. rotate180 = mirrorX o mirrorY and
 * the union-find closes the generated group by itself, so only the requested
 * generators are listed here.
 *
 * Woven parity: mirroring an invariant cut set repaints the woven colours when
 * the mirrored family holds an odd number of cuts (the count of cuts left of x
 * becomes n minus itself). A mirrorX-invariant picture therefore needs an even
 * A count, mirrorY an even B count and rotate180 an even total;
 * transpose/antiTranspose keep the colours for any equal counts.
 */
import {SYMMETRIES,requestedSymmetry} from '../settings.js';
import {curvesOf} from '../graph.js';
import {projectMatching} from './matching.js';

// D4 elements act on centred pixel coordinates as [a,b,c,d]: (X,Y)->(aX+bY,cX+dY).
const MATRIX={mirrorX:[-1,0,0,1],mirrorY:[1,0,0,-1],rotate180:[-1,0,0,-1],transpose:[0,1,1,0],antiTranspose:[0,-1,-1,0]};
const product=(m,q)=>[m[0]*q[0]+m[1]*q[2],m[0]*q[1]+m[1]*q[3],m[2]*q[0]+m[3]*q[2],m[2]*q[1]+m[3]*q[3]];
// Partner family, partner index, travel direction and, per axis of this cut,
// the partner axis, sign and offset factor of w that reproduce the table above.
const PAIRING={
  mirrorX:{family:f=>f,index:(f,i,n)=>f===0?n-1-i:i,reversed:f=>f===1,coords:[[0,-1,1],[1,1,0]]},
  mirrorY:{family:f=>f,index:(f,i,n)=>f===0?i:n-1-i,reversed:f=>f===0,coords:[[0,1,0],[1,-1,1]]},
  rotate180:{family:f=>f,index:(f,i,n)=>n-1-i,reversed:()=>true,coords:[[0,-1,1],[1,-1,1]]},
  transpose:{family:f=>1-f,index:(f,i)=>i,reversed:()=>false,coords:[[1,1,0],[0,1,0]]},
  antiTranspose:{family:f=>1-f,index:(f,i,n)=>n-1-i,reversed:()=>true,coords:[[1,-1,1],[0,-1,1]]},
};
const POINT={
  mirrorX:(p,w)=>[w-p[0],p[1]],mirrorY:(p,w)=>[p[0],w-p[1]],rotate180:(p,w)=>[w-p[0],w-p[1]],
  transpose:p=>[p[1],p[0]],antiTranspose:(p,w)=>[w-p[1],w-p[0]],
};

/** Closure of the requested image transforms, identity included. Null when no
 * transform acts on the picture; within-curve symmetry never does. */
export function symmetryOrbit(spec){
  const generators=SYMMETRIES.filter(k=>spec?.[k]).map(k=>MATRIX[k]);
  if(!generators.length)return null;
  const key=m=>m.join(','),elements=new Map([['1,0,0,1',[1,0,0,1]]]);
  for(let growing=true;growing;){
    growing=false;
    for(const e of[...elements.values()])for(const g of generators){const m=product(g,e);if(!elements.has(key(m))){elements.set(key(m),m);growing=true;}}
  }
  return[...elements.values()];
}

/** Mean of a per-pixel map over the generated group. For the squared boundary
 * loss the sum over the orbit's transformed copies equals the loss against
 * this single mean, so both mirrorings stay inside the objective. */
export function orbitMean(values,n,orbit){
  const out=new Float64Array(n*n),h=(n-1)/2;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let sum=0;
    for(const[a,b,c,d]of orbit)sum+=values[(c*(x-h)+d*(y-h)+h)*n+(a*(x-h)+b*(y-h)+h)];
    out[y*n+x]=sum/orbit.length;
  }
  return out;
}

/** Count pairs a requested symmetry can reproduce; see the parity note above.
 * Deliberately narrower than the pairing table needs: an odd mirrored family
 * ties perfectly well, it just always weaves the colour-swapped picture, so it
 * can only lose against the invariant target the orbit mean builds. See
 * docs/inverse/SYMMETRY.md, "Counts, and one deliberate narrowing". */
export function symmetricCounts(spec,counts){
  if(!spec)return true;
  if((spec.transpose||spec.antiTranspose)&&counts[0]!==counts[1])return false;
  if(spec.mirrorX&&counts[0]%2)return false;
  if(spec.mirrorY&&counts[1]%2)return false;
  if(spec.rotate180&&(counts[0]+counts[1])%2)return false;
  return true;
}

/** Weighted union-find over scalar parameters. Each relation reads
 * v[a] = sign*v[b] + offset; every class becomes either an affine group of
 * members [index,sign,offset] whose sign*v+offset agree, or a constant when
 * the class closes on itself with an opposite sign.
 */
export function affineGroups(size,relations){
  const parent=new Int32Array(size),sign=new Int8Array(size).fill(1),shift=new Float64Array(size),pins=[],conflicts=[];
  for(let i=0;i<size;i++)parent[i]=i;
  const find=i=>{
    const path=[];let r=i;
    while(parent[r]!==r){path.push(r);r=parent[r];}
    let s=1,o=0;
    for(let t=path.length-1;t>=0;t--){const u=path[t];s=sign[u]*s;o=sign[u]*o+shift[u];parent[u]=r;sign[u]=s;shift[u]=o;}
    return i===r?[r,1,0]:[r,sign[i],shift[i]];
  };
  for(const[a,b,s,t]of relations){
    const[ra,sa,oa]=find(a),[rb,sb,ob]=find(b);
    if(ra!==rb){parent[ra]=rb;sign[ra]=sa*s*sb;shift[ra]=sa*(s*ob+t-oa);continue;}
    const slope=sa-s*sb,residual=s*ob+t-oa;
    if(slope)pins.push([a,sa*(residual/slope)+oa]);
    else if(Math.abs(residual)>1e-9)conflicts.push([a,b,residual]);
  }
  const classes=new Map(),values=new Map();
  for(let i=0;i<size;i++){const[r,s,o]=find(i);let g=classes.get(r);if(!g)classes.set(r,g=[]);g.push([i,s,-s*o]);}
  for(const[i,value]of pins){
    const[r,s,o]=find(i),root=s*(value-o),known=values.get(r);
    if(known===undefined)values.set(r,root);else if(Math.abs(known-root)>1e-9)conflicts.push([i,i,known-root]);
  }
  const groups=[],constants=[];
  for(const[r,members]of classes){
    const value=values.get(r);
    if(value!==undefined){for(const[i,s,o]of members)constants.push([i,s*(value-o)]);continue;}
    if(members.length>1)groups.push(members);
  }
  return{groups,constants,conflicts};
}

const startPoint=(graph,pi)=>{const[e,d]=graph.paths[pi][0];return graph.edges[e][d===1?0:3];};
const pathControls=(graph,pi)=>{const ids=[];for(const[e,d]of graph.paths[pi])for(const id of(d===1?graph.edges[e]:graph.edges[e].toReversed()))ids.push(id);return ids;};

/** Reflection of a cut across the perpendicular bisector of its chord ('sym')
 * or point reflection about the chord midpoint ('anti'), as {L,t} with
 * M(p)=L p+t. Both swap the cut's endpoints, so they tie cubic j point k to
 * cubic m-1-j point 3-k of the same cut. The endpoints are parameters too, so
 * the map is recomputed from the current endpoints at every projection step
 * and held fixed inside it; each endpoint's crossing coordinate is pinned to
 * its square edge, so the chord cannot swing between steps.
 */
export function chordMap(p0,p1,mode){
  if(mode==='anti')return{L:[-1,0,0,-1],t:[p0[0]+p1[0],p0[1]+p1[1]]};
  const dx=p1[0]-p0[0],dy=p1[1]-p0[1],length=Math.hypot(dx,dy);
  if(length<1e-9)return null;
  const ux=dx/length,uy=dy/length,L=[1-2*ux*ux,-2*ux*uy,-2*ux*uy,1-2*uy*uy],mx=(p0[0]+p1[0])/2,my=(p0[1]+p1[1])/2;
  return{L,t:[mx-L[0]*mx-L[1]*my,my-L[2]*mx-L[3]*my]};
}
const applyMap=(m,x,y,tangent)=>tangent?[m.L[0]*x+m.L[1]*y,m.L[2]*x+m.L[3]*y]:[m.L[0]*x+m.L[1]*y+m.t[0],m.L[2]*x+m.L[3]*y+m.t[1]];

/** Average each tied pair with the image of its partner. The map is an
 * involution, so this is the orthogonal projection onto its fixed set; on a
 * gradient only the linear part applies. Fixed coordinates keep their edge
 * value: the endpoints already satisfy the tie exactly.
 */
export function projectWithinCurve(values,points,lists,mode,{fixed=null,tangent=false}={}){
  for(const ids of lists){
    const first=ids[0],last=ids.at(-1);
    const map=chordMap([points[2*first],points[2*first+1]],[points[2*last],points[2*last+1]],mode);
    if(!map)continue;
    for(let t=0;t<ids.length/2;t++){
      const a=ids[t],b=ids[ids.length-1-t];
      const pa=applyMap(map,values[2*a],values[2*a+1],tangent),pb=applyMap(map,values[2*b],values[2*b+1],tangent);
      const na=[(values[2*a]+pb[0])/2,(values[2*a+1]+pb[1])/2],nb=[(values[2*b]+pa[0])/2,(values[2*b+1]+pa[1])/2];
      for(let axis=0;axis<2;axis++){
        if(!fixed||!fixed[2*a+axis])values[2*a+axis]=na[axis];
        if(!fixed||!fixed[2*b+axis])values[2*b+axis]=nb[axis];
      }
    }
  }
}

const cache=new WeakMap();
/** Affine parameter ties for every requested symmetry of one curve graph.
 * Transforms whose pairing cannot be built (unequal counts, or paired cuts
 * with different cubic subdivisions) are reported in `skipped` instead of
 * being silently approximated. */
export function symmetryTies(graph,spec){
  const names=requestedSymmetry(spec);
  if(!names.length)return null;
  let per=cache.get(graph);
  if(!per)cache.set(graph,per=new Map());
  const key=names.join('+');
  if(per.has(key))return per.get(key);
  const w=graph.width,order=graph.families.map((paths,f)=>paths.slice().sort((a,b)=>graph.points[2*startPoint(graph,a)+f]-graph.points[2*startPoint(graph,b)+f]));
  const relations=[],skipped=[];
  for(const name of SYMMETRIES){
    if(!spec[name])continue;
    const rule=PAIRING[name],batch=[];
    let ok=rule.family(0)===0||order[0].length===order[1].length;
    for(let f=0;ok&&f<2;f++)for(let i=0;ok&&i<order[f].length;i++){
      const f2=rule.family(f),partner=order[f2][rule.index(f,i,order[f2].length)];
      if(partner===undefined){ok=false;break;}
      const a=pathControls(graph,order[f][i]),b=pathControls(graph,partner),reversed=rule.reversed(f);
      if(a.length!==b.length){ok=false;break;}
      for(let t=0;t<a.length;t++){
        const u=reversed?a.length-1-t:t;
        for(let axis=0;axis<2;axis++){const[other,sign,factor]=rule.coords[axis];batch.push([2*a[t]+axis,2*b[u]+other,sign,factor*w]);}
      }
    }
    if(ok)relations.push(...batch);else skipped.push(name);
  }
  const mode=spec.withinCurve&&spec.withinCurve!=='off'?spec.withinCurve:null;
  const built=affineGroups(graph.points.length,relations);
  const value={...built,skipped,mode,withinCurve:mode?graph.paths.map((_,pi)=>pathControls(graph,pi)):null};
  per.set(key,value);
  return value;
}

/** Project points (or, with `tangent`, a gradient) onto the requested
 * symmetric subspace. Within-curve ties run first and the affine ties last, so
 * a combined request leaves the square symmetries exact and the chord
 * symmetry within rounding; the report measures what actually holds. */
export function applyTies(ties,values,points,{fixed=null,original=null,tangent=false}={}){
  for(const[i,value]of ties.constants)if(!fixed||!fixed[i])values[i]=tangent?0:value;
  if(ties.withinCurve)projectWithinCurve(values,points,ties.withinCurve,ties.mode,{fixed,tangent});
  if(ties.groups.length)projectMatching(values,ties.groups,fixed,original,tangent);
}

/** Measured, not assumed: the largest distance between a control point and the
 * image of its partner under each requested transform. A transform whose
 * pairing does not exist for this solution measures as null. */
export function symmetryReport(solution,spec,tolerance=1e-6){
  const requested=requestedSymmetry(spec);
  if(!requested.length)return{requested:[],honoured:[],maxDeviationMm:null};
  const w=solution.graph.target.width;
  const cuts=[0,1].map(f=>solution.paths[f].map((_,i)=>curvesOf(solution,f,i).map(c=>c.p)).sort((a,b)=>a[0][0][f]-b[0][0][f]));
  const honoured=[];let max=null;
  for(const name of requested){
    const deviation=name.startsWith('withinCurve')?withinCurveDeviation(cuts,spec.withinCurve):transformDeviation(cuts,name,w);
    if(deviation===null)continue;
    if(deviation<=tolerance)honoured.push(name);
    max=max===null?deviation:Math.max(max,deviation);
  }
  return{requested,honoured,maxDeviationMm:max};
}
function transformDeviation(cuts,name,w){
  const rule=PAIRING[name],map=POINT[name];let max=0;
  for(let f=0;f<2;f++)for(let i=0;i<cuts[f].length;i++){
    const f2=rule.family(f),partner=cuts[f2][rule.index(f,i,cuts[f2].length)],own=cuts[f][i],m=own.length;
    if(!partner||partner.length!==m)return null;
    const reversed=rule.reversed(f);
    for(let j=0;j<m;j++)for(let k=0;k<4;k++){
      const q=map(reversed?partner[m-1-j][3-k]:partner[j][k],w),p=own[j][k];
      max=Math.max(max,Math.hypot(p[0]-q[0],p[1]-q[1]));
    }
  }
  return max;
}
function withinCurveDeviation(cuts,mode){
  let max=0;
  for(const family of cuts)for(const own of family){
    const m=own.length,map=chordMap(own[0][0],own[m-1][3],mode);
    if(!map)return null;
    for(let j=0;j<m;j++)for(let k=0;k<4;k++){
      const q=own[m-1-j][3-k],p=own[j][k],image=applyMap(map,q[0],q[1],false);
      max=Math.max(max,Math.hypot(p[0]-image[0],p[1]-image[1]));
    }
  }
  return max;
}
