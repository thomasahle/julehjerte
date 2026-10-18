/** Guarded paper masks. EDT only selects where to refine chord distances.
 * Native threshold ties return to the original hypot
 * calculation; no cut distance or acceptance decision is cached. */
import {chordClearance} from './chord-distance.js';
import {nativePaperMasks,numericalKernel} from './numerical-kernel.js';
import {paperBackend,sameArray} from './paper-backend.js';
const sameMasks=(a,b)=>!!a&&!!b&&sameArray(a.certain,b.certain)&&sameArray(a.possible,b.possible)&&
  (a.paper===null?b.paper===null:sameArray(a.paper,b.paper));
const backend=paperBackend(sameMasks);
export const paperClearanceChoices=()=>backend.report();
function exactCore(x,y,input){
  const {lattice,tiles,tileX,tileY,chords,R,guard}=input,lower=R-guard,upper=R+guard;
  let core=3;
  for(const si of tiles[tileX[x]+tileY[y]]||[]){
    core&=chordClearance(lattice.x[x],lattice.y[y],chords[si],lower,upper);
    if(!core)break;
  }
  return core;
}
export function paperCoreMasks(input,{native='auto'}={}){
  const {lattice,edt,tiles,tileX,tileY,chords,h,R,guard,tol,includeMap}=input;
  const nx=lattice.x.length,ny=lattice.y.length,count=nx*ny;
  if(native==='auto'){
    if(count>=16384&&numericalKernel()?.paper_masks)return backend.run(count,
      ()=>paperCoreMasks(input,{native:false}),()=>paperCoreMasks(input,{native:true}));
    native=false;
  }
  const accelerated=native&&nativePaperMasks(input);
  if(accelerated){
    const {certain,possible,paper,deferred}=accelerated;
    // Only near-threshold or extreme-distance cells need the original JS
    // hypot semantics. All tile/chord orders remain unchanged.
    for(const i of deferred){
      const core=exactCore(i%nx,Math.floor(i/nx),input),outline=lattice.outline[i];
      certain[i]=Number(outline>R+guard&&!!(core&2));
      possible[i]=Number(outline>R-guard&&!!(core&1));
    }
    return{certain,possible,paper};
  }
  const lower=R-guard,upper=R+guard,lower2=lower*lower,upper2=upper*upper;
  const certain=new Uint8Array(count),possible=new Uint8Array(count),paper=includeMap?new Uint8Array(count):null;
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const i=y*nx+x,xx=lattice.x[x],yy=lattice.y[y],distOutline=lattice.outline[i];
    if(paper&&distOutline>0)paper[i]=1;
    if(distOutline<lower)continue;
    const d=Math.sqrt(edt[i])*h;
    if(chords.length&&Math.abs(d-R)<4*h+2*tol){
      let core=3;
      for(const si of tiles[tileX[x]+tileY[y]]||[]){
        core&=chordClearance(xx,yy,chords[si],lower,upper,lower2,upper2);
        if(!core)break;
      }
      if(distOutline>upper&&(core&2))certain[i]=1;
      if(distOutline>lower&&(core&1))possible[i]=1;
      continue;
    }
    const clearance=Math.min(distOutline,d);
    if(clearance>upper)certain[i]=1;
    if(clearance>lower)possible[i]=1;
  }
  return{certain,possible,paper};
}
