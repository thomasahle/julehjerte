/** Precompute the fixed terms of point-to-chord distance for a batch of
 * lattice queries. Preserve segmentDistance's arithmetic order, including
 * its zero-length denominator and Math.hypot, without temporary vectors.
 */
export function prepareChord(a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1];
  return{ax:a[0],ay:a[1],dx,dy,denominator:dx*dx+dy*dy||1};
}
export function chordDistance(x,y,chord){
  const t=Math.max(0,Math.min(1,((x-chord.ax)*chord.dx+(y-chord.ay)*chord.dy)/chord.denominator));
  return Math.hypot(x-(chord.ax+chord.dx*t),y-(chord.ay+chord.dy*t));
}
