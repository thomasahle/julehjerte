/** Repeated interior transitions propose denser starts when photographed
 * borders are noisy. A returning curve may cross one band several times, so
 * these are never lower bounds on slit counts or geometry constraints. */
export function interiorCountEvidence(prob,n,weights=null){
  const rows=[],width=Math.max(1,Math.round(.015*n)),radius=Math.max(1,Math.round(.006*n));
  for(let axis=0;axis<2;axis++)for(let row=0;row<33;row++){
    const center=Math.round((.06+.88*row/32)*(n-1)),start=center-Math.floor(width/2);
    const profile=new Float64Array(n),valid=new Float64Array(n);
    for(let t=0;t<n;t++){
      let sum=0,count=0;
      for(let k=start;k<start+width;k++){
        const x=axis===0?t:k,y=axis===0?k:t,i=y*n+x,w=weights?.[i]??1;
        sum+=w*prob[i];count+=w;
      }
      profile[t]=count?sum/count:.5;valid[t]=count/width;
    }
    const smooth=new Float64Array(n);
    for(let t=0;t<n;t++){
      let sum=0;for(let k=-radius;k<=radius;k++)sum+=profile[Math.max(0,Math.min(n-1,t+k))];
      smooth[t]=sum/(2*radius+1);
    }
    let state=null,count=0;
    for(let t=Math.ceil(n*.015)+1;t<n*.985;t++){
      if(valid[t]<.9){state=null;continue;}
      const next=smooth[t]>.6?1:smooth[t]<.4?0:null;
      if(next!==null){if(state!==null&&state!==next)count++;state=next;}
    }
    const observedFraction=valid.reduce((sum,w)=>sum+Number(w>=.9),0)/n;
    if(observedFraction>=.9)rows.push({axis,count});
  }
  return[0,1].map(axis=>{
    const counts=rows.filter(r=>r.axis===axis).map(r=>r.count).sort((a,b)=>a-b);
    return{axis,bands:counts.length,median:counts[Math.floor((counts.length-1)/2)]??null,
      fractionAboveEight:counts.length?counts.filter(c=>c>8).length/counts.length:0};
  });
}
