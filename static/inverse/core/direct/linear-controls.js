/** Retain the lower-dimensional representation of short, exactly straight
 * input spans during clearance repair. Long and curved spans remain free. */
export function shortLinearControls(graph,original,maximumLength){
  const linear=new Map(),anchors=new Set(graph.edges.flatMap(ids=>[ids[0],ids[3]]));
  for(const ids of graph.edges){
    const [a,,,b]=ids,dx=original[2*b]-original[2*a],dy=original[2*b+1]-original[2*a+1],length=Math.hypot(dx,dy);
    if(length<1e-8||length>maximumLength||ids.slice(1,3).some(id=>anchors.has(id)))continue;
    const ts=ids.slice(1,3).map(id=>((original[2*id]-original[2*a])*dx+(original[2*id+1]-original[2*a+1])*dy)/(length*length));
    if(ts[0]<0||ts[1]>1||ts[0]>ts[1])continue;
    if(ids.slice(1,3).some((id,k)=>Math.hypot(original[2*id]-original[2*a]-ts[k]*dx,original[2*id+1]-original[2*a+1]-ts[k]*dy)>1e-8))continue;
    for(let k=0;k<2;k++)linear.set(ids[k+1],[[a,1-ts[k]],[b,ts[k]]]);
  }
  return linear;
}

/** Chain rule in endpoint parameters, including repeated/shared controls. */
export function reduceLinearCoefficients(coefficients,linear){
  for(const [id,c]of [...coefficients]){
    const partners=linear.get(id);if(!partners)continue;
    coefficients.delete(id);
    for(const [other,weight]of partners)coefficients.set(other,(coefficients.get(other)||0)+c*weight);
  }
}

export function restoreLinearControls(points,original,linear){
  // Express changes relative to the input, keeping an unmoved/pinned handle
  // bit-exact and avoiding an artificial displacement from weighted roundoff.
  for(const [id,partners]of linear)for(let axis=0;axis<2;axis++){
    points[2*id+axis]=original[2*id+axis]+partners.reduce((sum,[other,weight])=>sum+weight*(points[2*other+axis]-original[2*other+axis]),0);
  }
}
