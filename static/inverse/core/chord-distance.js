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

/** Membership above two ordered distance thresholds: neither (0), only the
 * lower (1), or both (3). Most paper queries need these bits, not a distance.
 * Keep hypot for last-bit comparisons and extreme/subnormal coordinates so
 * a squared comparison cannot decide a threshold tie differently.
 */
export function chordClearance(x,y,chord,lower,upper,lower2=lower*lower,upper2=upper*upper){
  const t=Math.max(0,Math.min(1,((x-chord.ax)*chord.dx+(y-chord.ay)*chord.dy)/chord.denominator));
  const dx=x-(chord.ax+chord.dx*t),dy=y-(chord.ay+chord.dy*t),squared=dx*dx+dy*dy;
  const guard=32*Math.max(Number.MIN_VALUE,Number.EPSILON*Math.max(squared,upper2));
  if(lower<0||!Number.isFinite(squared+upper2)||Math.abs(squared-lower2)<=guard||Math.abs(squared-upper2)<=guard){
    const distance=Math.hypot(dx,dy);return Number(distance>lower)|Number(distance>upper)*2;
  }
  return squared>upper2?3:squared>lower2?1:0;
}
