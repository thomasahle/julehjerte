/** Map an unfolded-offset defect to the existing curve separation forces.
 * A core crossing the fold needs fold clearance; a core wholly on either
 * half needs tighter same-path separation. This classifies, never certifies.
 */
export function paperRecoveryFamilies(audit,width){
  const foldFamilies=[],localFamilies=[];
  for(const family of audit.families){
    if(family.status==='pass')continue;
    const floating=family.parts.filter(p=>!p.anchored&&p.significant);
    if(floating.some(p=>p.bounds[1]<=width&&p.bounds[3]>=width)||family.foldIntervals.some(i=>i.anchoredCoreLength<=1e-8))foldFamilies.push(family.family);
    if(floating.some(p=>p.bounds[3]<width||p.bounds[1]>width))localFamilies.push(family.family);
  }
  return{foldFamilies,localFamilies};
}
