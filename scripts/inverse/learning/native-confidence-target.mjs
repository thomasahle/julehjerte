/** Offline soft fitting objective; retain the original binary validation mask. */
export function nativeConfidenceTarget(target,scores,temperature){
 const source=target.sourceImage,n=source?.resolution;
 if(!Number.isInteger(n)||n<1||source.mask?.length!==n*n||scores?.length!==n*n)
  throw new Error('Native scores must match the target grid.');
 if(!Number.isFinite(temperature)||temperature<=0)throw new Error('Require a positive training temperature.');
 if(source.validMask&&source.validMask.length!==n*n)throw new Error('Invalid observation mask.');
 const probability=new Float32Array(n*n);let thresholdRoundoffPixels=0;
 for(let i=0;i<scores.length;i++){
  const score=scores[i];if(!Number.isFinite(score))throw new Error('Native scores must be finite.');
  if(source.validMask&&!source.validMask[i]){probability[i]=.5;continue;}
  const x=score*temperature;
  probability[i]=x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
  if(Number(probability[i]>=.5)!==source.mask[i]){
   // Float32 sigmoid(±tiny) can round to exactly 0.5 at a different scale.
   // Preserve the saved hard decision and disclose these near-zero ties.
   if(Math.abs(score)>1e-6)throw new Error('Native confidence changes the classifier phase.');
   thresholdRoundoffPixels++;
  }
 }
 return{target:{...target,sourceImage:{...source,probability}},
  diagnostics:{temperature,thresholdRoundoffPixels,
   interpretation:'Training-scaled logistic scores; calibration on unseen photographs is not established.'}};
}
