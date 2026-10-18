/** Soft cushion near the configured join limit; final validation is unchanged. */
export function turnLimitPenalty(dot,maxTurn,normalizer=1){
  if(!(maxTurn<180))return{loss:0,derivative:0};
  dot=Math.max(-1,Math.min(1,dot));
  const excess=Math.max(0,Math.acos(dot)-Math.max(0,maxTurn-1)*Math.PI/180),scale=2/Math.max(1,normalizer);
  return{loss:scale*excess*excess,derivative:excess?-2*scale*excess/Math.sqrt(Math.max(1e-12,1-dot*dot)):0};
}
