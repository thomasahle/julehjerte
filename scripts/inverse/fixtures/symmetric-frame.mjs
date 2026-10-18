/** Analytic cut set with four exactly shared diagonal spans. Perturb the
 * diagonals normally, preserving D4, to model independently fitted seams.
 * This is cleanup input, never an initializer for a fresh inverse solve.
 */
export function framePaths(delta=0,unequal=false){
  const vertices=[[20,0],[20-delta,20+delta],[35-delta,35+delta],[35-delta,65-delta],[20-delta,80-delta],[20,100]];
  const line=(a,b)=>[a,a.map((v,i)=>v+(b[i]-v)/3),a.map((v,i)=>v+2*(b[i]-v)/3),b];
  const a=vertices.slice(1).map((p,i)=>line(vertices[i],p));
  const mirror=p=>p.map(c=>c.map(([x,y])=>[100-x,y])),transpose=p=>p.map(c=>c.map(([x,y])=>[y,x]));
  return[[a,mirror(a)],[transpose(a),...(unequal?[[line([0,45],[100,45])],[line([0,55],[100,55])]]:[]),transpose(mirror(a))]];
}

/** A single anti-symmetric cut per sheet sharing the central diagonal. */
export function antiSeamPaths(delta=0){
  const v=[[20,0],[20-delta,20+delta],[40-delta,40+delta],[60+delta,60-delta],[80+delta,80-delta],[80,100]];
  const a=v.slice(1).map((b,i)=>[v[i],v[i].map((x,k)=>x+(b[k]-x)/3),v[i].map((x,k)=>x+2*(b[k]-x)/3),b]);
  return[[a],[a.map(c=>c.map(([x,y])=>[y,x]))]];
}
