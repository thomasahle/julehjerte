import {Cubic} from '../../../static/inverse/core/bezier.js';
import {chordMap} from '../../../static/inverse/core/direct/symmetry.js';

/** Known valid families for testing endpoint motion and independent controls. */
export function movingChordPaths(counts,mode,bulge,{target=false,segments=1}={}){
  return counts.map((count,f)=>Array.from({length:count},(_,i)=>{
    const centre=(i+1)*100/(count+1),shift=target&&mode==='anti'?3:0,tilt=target&&mode==='sym'?3:0;
    const first=[centre+shift-tilt,0],last=[centre+shift+tilt,100],p=Cubic.line(first,last).p;
    if(target&&bulge){
      const dx=last[0]-first[0],l=Math.hypot(dx,100),amount=bulge*(i%2?-1:1);
      p[1]=[p[1][0]+100/l*amount,p[1][1]-dx/l*amount];
      const m=chordMap(first,last,mode);p[2]=[m.L[0]*p[1][0]+m.L[1]*p[1][1]+m.t[0],m.L[2]*p[1][0]+m.L[3]*p[1][1]+m.t[1]];
    }
    const curve=new Cubic(f?p.map(([x,y])=>[y,x]):p);
    return Array.from({length:segments},(_,j)=>curve.subcurve(j/segments,(j+1)/segments).p);
  }));
}
