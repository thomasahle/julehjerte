/** Separation from the other half of the same cut after unfolding.
 * Samples near the endpoint remain an ordinary bend, not a near-return.
 * This is a fitting force; the independent paper audit decides validity.
 */
export function addFoldSeparation(sample,families,width,nominalWidth,margin,gradient,{weight=12,localFactor=3,activeFamilies=[0,1]}={}){
  if(!Number.isFinite(weight)||weight<0||!Number.isFinite(localFactor)||localFactor<0)throw new RangeError('Fold separation needs nonnegative finite weights and exclusion.');
  const total=sample.groups.reduce((sum,ids)=>sum+ids.length,0),s=sample.samples;
  if(!total||!weight)return 0;
  const scale=weight/total;let loss=0;
  sample.groups.forEach((ids,path)=>{
    if(!activeFamilies.includes(families[path]))return;
    const axis=1-families[path];let remaining=0;
    for(let j=ids.length-1;j>=0;j--){
      const id=ids[j];
      if(j+1<ids.length){const next=ids[j+1];remaining+=Math.hypot(s[2*id]-s[2*next],s[2*id+1]-s[2*next+1]);}
      if(2*remaining<=localFactor*nominalWidth)continue;
      const gap=2*(width-s[2*id+axis]);
      if(gap>=margin)continue;
      const deficit=(margin-gap)/margin;
      loss+=scale*deficit*deficit;
      // Both reflected positions move with this coordinate, hence factor 4.
      gradient[2*id+axis]+=4*scale*deficit/margin;
    }
  });
  return loss;
}
