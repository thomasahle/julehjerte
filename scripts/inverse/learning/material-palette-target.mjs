/** Apply an audited offline palette to production-sampled original RGB.
 * Mirrors palette_calibration.py, reusing the production NNLS implementation.
 * Palette inference and crop selection stay outside this helper.
 */
import {rectifyWithCoverage} from '../../../static/inverse/core/input.js';
import {unmixRGB} from '../../../static/inverse/core/unmix.js';

export function calibratedMaterial(rgb,calibration){
  const {colors,mode,model,applied}=calibration??{};
  if(applied!==true||!['affine','illumination'].includes(mode)||!Array.isArray(colors)||colors.length!==2||
     colors.some(c=>!Array.isArray(c)||c.length!==3||c.some(v=>!Number.isFinite(v)||v<0||v>1))||
     !rgb?.length||rgb.length%3||!rgb.every(v=>Number.isFinite(v)&&v>=0&&v<=255))throw new Error('Invalid paper palette or RGB samples.');
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),[a,b]=colors,d=b.map((v,k)=>v-a[k]),separation=dot(d,d);
  if(separation<.01)throw new Error('Paper colours are insufficiently separated.');
  const aa=dot(a,a),bb=dot(b,b),ab=dot(a,b),det=aa*bb-ab*ab,largest=(aa+bb+Math.hypot(aa-bb,2*ab))/2;
  const affine=mode==='affine'||det/Math.max(largest*largest,1e-20)<.001;
  if(model!==(affine?'affine-color-segment':'nonnegative-color-mixture'))throw new Error('Palette model disagrees with colour conditioning.');
  const result=new Float32Array(rgb.length/3);
  if(affine){
    for(let i=0;i<result.length;i++){
      let projection=0;for(let k=0;k<3;k++)projection+=(rgb[3*i+k]/255-a[k])*d[k];
      result[i]=Math.max(0,Math.min(1,projection/separation));
    }
  }else{
    // Python labels the second paper as one. unmixRGB labels its first colour
    // as one, so reverse the palette, not the resulting mask.
    const mixed=unmixRGB(Float64Array.from(rgb,v=>v/255),b,a);
    for(let i=0;i<result.length;i++)result[i]=mixed.illumination[i]>1e-8?mixed.probability[i]:.5;
  }
  return result;
}

export function rectifyMaterialPalette(source,calibration,quad,resolution=400){
  const {rgba,imageWidth,imageHeight}=source;
  const corners=quad??[[0,0],[imageWidth,0],[imageWidth,imageHeight],[0,imageHeight]];
  const {rgb,validMask}=rectifyWithCoverage(rgba,imageWidth,imageHeight,resolution,corners);
  const probability=calibratedMaterial(rgb,calibration),mask=new Uint8Array(resolution**2);
  for(let i=0;i<mask.length;i++){
    if(validMask&&!validMask[i])probability[i]=.5;
    else mask[i]=Number(probability[i]>=.5);
  }
  return{rgb,probability,mask,validMask,resolution};
}
