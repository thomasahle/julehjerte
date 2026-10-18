/** Partition a shared edit over the whole requested square-symmetry group.
 * Original cubic knots stay knots: uniform resampling would round corners.
 * Coordinate constraints are applied afterward by the normal symmetry ties.
 */
import {Cubic,distance} from '../bezier.js';
import {symmetryOrbit} from './symmetry.js';
import {expandSpan,sharedSpan} from './shared-span.js';

const EPS=1e-8;
function partners(paths,orbit,width){
  const h=width/2,relations=[];
  for(let i=0;i<paths.length;i++){
    const own=paths[i],start=own[0][0],end=own.at(-1)[3],images=[];
    for(const[a,b,c,d]of orbit){
      const map=([x,y])=>[a*(x-h)+b*(y-h)+h,c*(x-h)+d*(y-h)+h],p=map(start),q=map(end);
      let found=false;
      for(let j=0;!found&&j<paths.length;j++)for(const reversed of[false,true]){
        const other=paths[j],s=other[0][0],e=other.at(-1)[3];
        if(other.length===own.length&&distance(p,reversed?e:s)<1e-6&&distance(q,reversed?s:e)<1e-6){
          if(!images.some(r=>r.other===j&&r.reversed===reversed))images.push({other:j,reversed});
          found=true;break;
        }
      }
      if(!found)return null;
    }
    relations.push(images);
  }
  return relations;
}

// Splitting a previously shared cubic must also split every occurrence, even
// when the paths are in different symmetry orbits or travel opposite ways.
function existingShared(paths){
  const groups=new Map(),relations=paths.map(()=>[]);
  paths.forEach((path,i)=>path.forEach((curve,k)=>{
    const forward=curve.flat().map(v=>Math.round(v*1e7)).join(','),backward=curve.toReversed().flat().map(v=>Math.round(v*1e7)).join(',');
    const reversed=backward<forward,key=reversed?backward:forward;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push({i,k,reversed});
  }));
  for(const group of groups.values())for(const a of group)for(const b of group){
    if(a===b)continue;
    relations[a.i].push({start:a.k,other:b.i,knot:b.k,reversed:a.reversed!==b.reversed});
  }
  return relations;
}

function subdivide(path,oldKnots,newKnots){
  const out=[];let k=0;
  for(let i=1;i<newKnots.length;i++){
    const lo=newKnots[i-1],hi=newKnots[i];
    while(k+1<path.length&&oldKnots[k+1]<=lo+EPS)k++;
    if(lo<oldKnots[k]-EPS||hi>oldKnots[k+1]+EPS)throw new Error('Incompatible shared-cut partition.');
    const span=oldKnots[k+1]-oldKnots[k];
    out.push(new Cubic(path[k]).subcurve(Math.max(0,(lo-oldKnots[k])/span),Math.min(1,(hi-oldKnots[k])/span)).p);
  }
  return out;
}

export function orbitSharingReplacement(families,proposal,symmetry,width){
  const paths=families.flat(),a=proposal.i,b=families[0].length+proposal.j;
  const relations=partners(paths,symmetryOrbit(symmetry)||[[1,0,0,1]],width);
  if(!relations)return null;
  // Chord symmetry reverses the parameter of this same cut, even though its
  // spatial map differs from the maps of the other cuts. The joint control
  // projector enforces those maps after these subdivisions agree.
  if(symmetry?.withinCurve&&symmetry.withinCurve!=='off')relations.forEach((images,i)=>{
    if(!images.some(r=>r.other===i&&r.reversed))images.push({other:i,reversed:true});
  });
  let c=expandSpan(paths[a],paths[b],proposal);
  // When two cuts belong to the same orbit, the shared interval must use the
  // same parameter frame. Otherwise repeatedly mirroring and sharing a knot
  // generates a drift (and arbitrarily many tiny subdivisions).
  const paired=relations[a].filter(r=>r.other===b);
  if(paired.length){
    const mate=paired.find(r=>{
      const lo=r.reversed?paths[b].length-Math.max(c.b0,c.b1):Math.min(c.b0,c.b1),hi=r.reversed?paths[b].length-Math.min(c.b0,c.b1):Math.max(c.b0,c.b1);
      return Math.abs(lo-c.a0)<=.05&&Math.abs(hi-c.a1)<=.05;
    });
    if(!mate)return null;
    const lo=mate.reversed?paths[b].length-Math.max(c.b0,c.b1):Math.min(c.b0,c.b1),hi=mate.reversed?paths[b].length-Math.min(c.b0,c.b1):Math.max(c.b0,c.b1);
    const a0=Math.min(c.a0,lo),a1=Math.max(c.a1,hi),b0=mate.reversed?paths[b].length-a1:a0,b1=mate.reversed?paths[b].length-a0:a1;
    c={...c,a0,a1,b0:c.b1>c.b0?b0:b1,b1:c.b1>c.b0?b1:b0};
  }
  const edit=sharedSpan(paths[a],paths[b],c,{expand:false});
  if(!edit.knots)return null;
  const oldKnots=paths.map(path=>Array.from({length:path.length+1},(_,i)=>i)),edited=paths.slice();
  [edited[a],edited[b]]=edit.paths;[oldKnots[a],oldKnots[b]]=edit.knots;
  const shared=existingShared(paths),knots=oldKnots.map(k=>k.slice()),queue=[];
  knots.forEach((values,i)=>values.forEach(g=>queue.push([i,g])));
  const add=(i,g)=>{
    if(g<-EPS||g>paths[i].length+EPS)throw new Error('Shared-cut knot outside its path.');
    g=Math.max(0,Math.min(paths[i].length,g));
    if(knots[i].some(v=>Math.abs(v-g)<=EPS))return;
    // Incompatible overlapping edit orbits may never close. Bound the work
    // and reject the proposal, leaving the existing valid candidate intact.
    if(knots[i].length>=Math.max(256,4*paths[i].length))throw new Error('Shared-cut partition does not close.');
    knots[i].push(g);queue.push([i,g]);
  };
  for(let k=0;k<queue.length;k++){
    const[i,g]=queue[k];
    for(const r of shared[i])if(g>=r.start-EPS&&g<=r.start+1+EPS)add(r.other,r.knot+(r.reversed?1-g+r.start:g-r.start));
    for(const r of relations[i])add(r.other,r.reversed?paths[i].length-g:g);
    if(i===a&&g>=c.a0-EPS&&g<=c.a1+EPS)add(b,c.b0+(c.b1-c.b0)*(g-c.a0)/(c.a1-c.a0));
    if(i===b&&g>=Math.min(c.b0,c.b1)-EPS&&g<=Math.max(c.b0,c.b1)+EPS)add(a,c.a0+(c.a1-c.a0)*(g-c.b0)/(c.b1-c.b0));
  }
  const next=edited.map((path,i)=>subdivide(path,oldKnots[i],knots[i].sort((a,b)=>a-b)));
  return[next.slice(0,families[0].length),next.slice(families[0].length)];
}
