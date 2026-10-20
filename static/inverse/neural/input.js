/** Browser-portable input for the pinned U2NETP saliency experiment.
 * Implements skimage 0.24 resize(mode='constant', order=1, anti_aliasing=True)
 * followed by the publisher's image-maximum and ImageNet normalization.
 * Gaussian filtering and linear sampling are combined into separable taps,
 * avoiding a full-resolution floating-point RGB allocation. No canvas resize.
 * Input conversion only; decoding and EXIF orientation belong to the image importer.
 */
function taps(size, output) {
  const ratio=size/output, sigma=Math.max(0,(ratio-1)/2);
  const radius=sigma>1e-15?Math.floor(4*sigma+.5):0;
  const kernel=Array.from({length:radius*2+1},(_,i)=>radius?Math.exp(-.5*((i-radius)/sigma)**2):1);
  const total=kernel.reduce((a,b)=>a+b,0);
  return Array.from({length:output},(_,i)=>{
    const center=(i+.5)*ratio-.5, low=Math.floor(center), fraction=center-low;
    const weights=new Map();
    for(const [sample,linear] of [[low,1-fraction],[low+1,fraction]]) {
      // scipy's grid-constant interpolation uses zero outside the filtered grid.
      if(sample<0||sample>=size||linear===0)continue;
      for(let k=-radius;k<=radius;k++) {
        const source=sample+k;
        if(source<0||source>=size)continue;
        weights.set(source,(weights.get(source)||0)+linear*kernel[k+radius]/total);
      }
    }
    return [...weights];
  });
}

export function u2netpInput(rgb,width,height,resolution=320) {
  if(![width,height,resolution].every(v=>Number.isInteger(v)&&v>0)||width*height>24e6||Math.max(width,height)>16384||resolution>1024)
    throw new RangeError('Expected positive dimensions, at most 24 megapixels, sides <=16384 and resolution <=1024.');
  if(!(rgb instanceof Uint8Array||rgb instanceof Uint8ClampedArray)||rgb.length!==width*height*3)
    throw new TypeError('Expected packed, decoded and oriented RGB bytes.');
  const xs=taps(width,resolution),ys=taps(height,resolution),n=resolution**2;
  const resized=new Float64Array(n*3);
  // Choose the smaller intermediate for extreme aspect ratios, preserving
  // separability. This uses <=320*sqrt(24e6)*3 doubles at the model resolution.
  if(height<=width) {
    const intermediate=new Float64Array(height*resolution*3);
    for(let y=0;y<height;y++)for(let x=0;x<resolution;x++)for(let c=0;c<3;c++) {
      let value=0;for(const [source,weight] of xs[x])value+=rgb[3*(y*width+source)+c]/255*weight;
      intermediate[3*(y*resolution+x)+c]=value;
    }
    for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++)for(let c=0;c<3;c++) {
      let value=0;for(const [source,weight] of ys[y])value+=intermediate[3*(source*resolution+x)+c]*weight;
      resized[3*(y*resolution+x)+c]=value;
    }
  } else {
    const intermediate=new Float64Array(width*resolution*3);
    for(let y=0;y<resolution;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++) {
      let value=0;for(const [source,weight] of ys[y])value+=rgb[3*(source*width+x)+c]/255*weight;
      intermediate[3*(y*width+x)+c]=value;
    }
    for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++)for(let c=0;c<3;c++) {
      let value=0;for(const [source,weight] of xs[x])value+=intermediate[3*(y*width+source)+c]*weight;
      resized[3*(y*resolution+x)+c]=value;
    }
  }
  let low=255,high=0;for(const value of rgb){low=Math.min(low,value);high=Math.max(high,value);}
  low/=255;high/=255;
  // A positive RGB image cannot sample an exactly zero output in this resize;
  // skimage therefore clips the constant-padding fringe to the source minimum.
  let maximum=0;
  for(let i=0;i<resized.length;i++) {
    resized[i]=Math.max(low,Math.min(high,resized[i]));maximum=Math.max(maximum,resized[i]);
  }
  const tensor=new Float32Array(n*3),means=[.485,.456,.406],scales=[.229,.224,.225];
  // The publisher divides by zero on an all-black image. Explicitly reject it
  // rather than passing NaNs to inference or inventing a foreground prediction.
  if(maximum===0)return {status:'empty-image',tensor:null,window:[0,0,width,height]};
  for(let i=0;i<n;i++)for(let c=0;c<3;c++)tensor[c*n+i]=(resized[3*i+c]/maximum-means[c])/scales[c];
  return {status:'ready',tensor,window:[0,0,width,height]};
}
