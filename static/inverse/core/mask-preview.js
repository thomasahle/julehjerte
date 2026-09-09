/** Exact outlines of the original binary pixels for the comparison preview.
 * Merge adjacent collinear edges; do not fit, clean up, node or score curves
 * that the solver will never use. The fitting boundary is prepared separately.
 */
import {colorsSafe} from './input.js';

export function originalMaskBoundaries(source,width,colors){
  const {mask,resolution:n}=source;
  if(!Number.isInteger(n)||n<1||mask.length!==n*n)throw new Error('The mask boundary preview needs a square pixel grid.');
  const lines=[];
  for(let y=1;y<n;y++)for(let x=0;x<n;){
    if(mask[(y-1)*n+x]===mask[y*n+x]){x++;continue;}
    const start=x;while(x<n&&mask[(y-1)*n+x]!==mask[y*n+x])x++;
    lines.push(`M${start},${y}H${x}`);
  }
  for(let x=1;x<n;x++)for(let y=0;y<n;){
    if(mask[y*n+x-1]===mask[y*n+x]){y++;continue;}
    const start=y;while(y<n&&mask[y*n+x-1]!==mask[y*n+x])y++;
    lines.push(`M${x},${start}V${y}`);
  }
  const [a,b]=colorsSafe(colors);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${width}mm" viewBox="0 0 ${n} ${n}" data-heart-boundaries="true" data-phase="${mask[0]}" data-paper-a="${a}" data-paper-b="${b}"><title>Original pixel colour boundaries</title><path d="${lines.join(' ')}" fill="none" stroke="#233b37" stroke-width="${.2*n/width}"/></svg>`;
  return{svg,segments:lines.length};
}
