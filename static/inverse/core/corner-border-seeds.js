/** Provisional routing masks for small fragments touching two adjacent edges.
 * Removing one such fragment can repair BOTH opposite-edge count mismatches.
 * The photographed mask remains the reference for fitting and final checks.
 */
import {borderTransitions,stabilizeBorder} from './border.js';

function cornerFragment(mask,n,corner,span){
  const x0=corner%n,y0=Math.floor(corner/n),value=mask[corner],pixels=[corner],seen=new Set(pixels);
  for(let at=0;at<pixels.length;at++){
    const p=pixels[at],x=p%n,y=Math.floor(p/n);
    for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
      if(xx<0||yy<0||xx>=n||yy>=n)continue;
      const q=yy*n+xx;if(mask[q]!==value||seen.has(q))continue;
      // Abort before traversing a real strip or a motif extending inland.
      if(Math.abs(xx-x0)>=span||Math.abs(yy-y0)>=span)return null;
      seen.add(q);pixels.push(q);
    }
  }
  return pixels;
}

const consistent=counts=>counts[0]>0&&counts[1]>0&&counts[0]===counts[2]&&counts[1]===counts[3];

export function cornerBorderSeeds(mask,n,width,minimumStripWidth=2.5){
  if(!Number.isFinite(minimumStripWidth)||minimumStripWidth<=0)throw new Error('A positive minimum strip width is required.');
  // Validate dimensions even when the original borders already agree.
  stabilizeBorder(mask,n,width,0,minimumStripWidth);
  const originalCounts=borderTransitions(mask,n);
  if(consistent(originalCounts))return [];
  const maximumCornerSpanMm=Math.min(.05*width,2*minimumStripWidth),span=Math.floor(maximumCornerSpanMm*n/width);
  if(!span)return [];
  const corners=[0,n-1,n*n-1,(n-1)*n],candidates=[];
  for(const radius of [0,.5,1,2,3]){
    const baseline=stabilizeBorder(mask,n,width,radius,minimumStripWidth),before=baseline.metadata.transitionsAfter;
    // One-sided fringes retain their established deeper-profile proposals.
    if(before[0]===before[2]||before[1]===before[3])continue;
    const fragments=corners.flatMap((corner,index)=>{
      const pixels=cornerFragment(baseline.mask,n,corner,span);
      return pixels?[{corner:index,pixels}]:[];
    });
    for(let subset=1;subset<1<<fragments.length;subset++){
      const selected=fragments.filter((_,i)=>subset>>i&1),out=baseline.mask.slice();
      for(const fragment of selected)for(const pixel of fragment.pixels)out[pixel]^=1;
      const after=borderTransitions(out,n);
      if(!consistent(after)||candidates.some(c=>c.mask.every((v,i)=>v===out[i])))continue;
      let changedPixels=0;for(let i=0;i<out.length;i++)changedPixels+=out[i]!==mask[i];
      candidates.push({mask:out,metadata:{method:'corner-fragments',initializationOnly:true,
        borderRadiusMm:radius,maximumCornerSpanMm,corners:selected.map(f=>f.corner),
        cornerPixelsChanged:selected.reduce((sum,f)=>sum+f.pixels.length,0),
        changedPixels,changeFraction:changedPixels/out.length,
        transitionsOriginal:originalCounts,transitionsBefore:before,transitionsAfter:after}});
    }
  }
  return candidates.sort((a,b)=>a.metadata.changedPixels-b.metadata.changedPixels||a.metadata.corners.length-b.metadata.corners.length);
}
