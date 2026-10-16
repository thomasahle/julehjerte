/** Offline port of palette_calibration.py's fixed-colour mixture model.
 * RGB is empirical sRGB, not calibrated linear light. No palette is estimated
 * here: callers provide the same two colours when comparing image scales.
 */
export function classifyPaperMixture(rgb,colors,{validMask=null,mode='illumination'}={}){
  if(!(rgb instanceof Uint8Array||rgb instanceof Uint8ClampedArray)||!rgb.length||rgb.length%3)throw new Error('Require packed RGB bytes.');
  if(!Array.isArray(colors)||colors.length!==2||colors.some(c=>!Array.isArray(c)||c.length!==3||c.some(v=>!Number.isFinite(v)||v<0||v>1)))throw new Error('Require two finite RGB colours in [0, 1].');
  if(!['affine','illumination'].includes(mode))throw new Error('Unknown mixture model.');
  const count=rgb.length/3;
  if(validMask&&(validMask.length!==count||!validMask.every(v=>v===0||v===1)))throw new Error('Require one binary observation per pixel.');
  const [a,b]=colors,d=b.map((v,k)=>v-a[k]),dot=(x,y)=>x.reduce((s,v,k)=>s+v*y[k],0),separation=dot(d,d);
  if(separation<.01)throw new Error('Paper colours are insufficiently separated.');
  const aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),determinant=aa*bb-ab*ab,largest=(aa+bb+Math.hypot(aa-bb,2*ab))/2;
  const conditioning=determinant/Math.max(largest*largest,1e-20),affine=mode==='affine'||conditioning<.001;
  const probability=new Float64Array(count).fill(.5),mask=new Uint8Array(count),clamp=p=>Math.max(0,Math.min(1,p));
  for(let i=0;i<count;i++){
    if(validMask&&!validMask[i])continue;
    let p;
    if(affine){
      let numerator=0;for(let k=0;k<3;k++)numerator+=(rgb[3*i+k]/255-a[k])*d[k];p=numerator/separation;
    }else{
      let ia=0,ib=0;for(let k=0;k<3;k++){ia+=rgb[3*i+k]/255*a[k];ib+=rgb[3*i+k]/255*b[k];}
      let u=(ia*bb-ib*ab)/determinant,v=(ib*aa-ia*ab)/determinant;
      if(u<0){u=0;v=ib/bb;}if(v<0){u=ia/aa;v=0;}
      p=u+v>1e-8?v/(u+v):.5;
    }
    probability[i]=clamp(p);mask[i]=Number(probability[i]>=.5);
  }
  return{probability,mask,metadata:{model:affine?'affine-color-segment':'nonnegative-color-mixture',conditioning,colors:colors.map(c=>[...c]),mode}};
}
