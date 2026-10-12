/** Report crop evidence separately from template checks. Neither an outline
 * match nor an in-bounds quad certifies the photographed overlap geometry. */
import {supportedCropOutline} from '../../static/inverse/core/crop.js';

export function cropEvidence(candidate,{width,height}={}){
  const quad=candidate?.quad,e=candidate?.locator?.evidence;
  const complete=quad?.length===4&&quad.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite));
  const fields=['lowerEdgeSupport','lobeOutlineSupport','capColourLoss'];
  const hasEvidence=fields.every(k=>Array.isArray(e?.[k])&&e[k].length===2&&e[k].every(Number.isFinite));
  const dimensions=Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0;
  const outOfFrameCorners=complete&&dimensions?quad.map(([x,y],i)=>x<0||y<0||x>width||y>height?i:null).filter(i=>i!==null):null;
  return{
    outlineSupported:complete&&hasEvidence?supportedCropOutline(candidate.locator):null,
    withinPhotograph:outOfFrameCorners?outOfFrameCorners.length===0:null,
    outOfFrameCorners,
    ...(hasEvidence?Object.fromEntries(fields.map(k=>[k,[...e[k]]])):{}),
    meaning:'Outline support and image bounds are diagnostics, not verified corners or known cutting paths.',
  };
}
