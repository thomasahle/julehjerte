/** A continuous path whose derivative control vectors fit a right-angle cone
 * cannot satisfy this return rule. Its chord is at least arc / sqrt(2).
 * The two partial flattening intervals can overestimate arc by at most 2/5
 * of the margin; (2 - 2/5) / sqrt(2) is still greater than 1. This bound relies
 * on the margin/5 maximum flattening step and the 2*margin arc threshold below.
 * Exact continuity and every nonzero derivative control vector are checked.
 */
export function excludesReturnByCone(curves){
 const angles=[];let previous=null;
 for(const curve of curves){
  const p=curve.p;
  if(p.some(q=>q.some(v=>!Number.isFinite(v))))return false;
  if(previous&&(previous[0]!==p[0][0]||previous[1]!==p[0][1]))return false;
  previous=p[3];
  for(let k=1;k<4;k++){
   const dx=p[k][0]-p[k-1][0],dy=p[k][1]-p[k-1][1];
   if(!Number.isFinite(dx)||!Number.isFinite(dy))return false;
   if(dx!==0||dy!==0)angles.push(Math.atan2(dy,dx));
  }
 }
 if(angles.length<2)return true;
 angles.sort((a,b)=>a-b);
 let gap=angles[0]+2*Math.PI-angles.at(-1);
 for(let i=1;i<angles.length;i++)gap=Math.max(gap,angles[i]-angles[i-1]);
 return 2*Math.PI-gap<=Math.PI/2;
}
