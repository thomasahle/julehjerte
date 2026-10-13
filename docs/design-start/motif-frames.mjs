/** Shared composition for the mockup and fresh inverse-solver experiments.
 * Coordinates are the unrotated 200 × 200 woven square; these are target
 * pictures, not cutting paths. The solver must find and validate those paths.
 */
export function frameRegion(shape='circle',size=.64,attributes='') {
  const r=100*size;
  if(shape==='circle')return `<circle cx="100" cy="100" r="${r}" ${attributes}/>`;
  if(shape==='hexagon'){
    const radius=r/Math.cos(Math.PI/12);
    const points=Array.from({length:6},(_,i)=>{
      const a=i*Math.PI/3-Math.PI/4;
      return `${100+radius*Math.cos(a)},${100+radius*Math.sin(a)}`;
    });
    return `<polygon points="${points.join(' ')}" ${attributes}/>`;
  }
  return `<rect x="${100-r}" y="${100-r}" width="${2*r}" height="${2*r}" ${attributes}/>`;
}
export function frameArtwork({shape='circle',style='rays',size=.64,cells=4,phase=0,rayCount=16,background='var(--paper-left)',foreground='var(--paper-right)'}={}) {
  const parts=[];
  if(style==='rays'){
    for(let i=0;i<rayCount;i++)if((i+phase)%2===0){
      const a=(i-.5)*2*Math.PI/rayCount,b=(i+.5)*2*Math.PI/rayCount;
      parts.push(`<path d="M100 100L${100+300*Math.cos(a)} ${100+300*Math.sin(a)}L${100+300*Math.cos(b)} ${100+300*Math.sin(b)}Z"/>`);
    }
  }else if(style==='check'){
    for(let y=0;y<cells;y++)for(let x=0;x<cells;x++)if((x+y+phase)%2===0)parts.push(`<rect x="${x*200/cells}" y="${y*200/cells}" width="${200/cells}" height="${200/cells}"/>`);
  }
  return `<svg x="0" y="0" width="200" height="200" viewBox="0 0 200 200" overflow="hidden"><rect width="200" height="200" fill="${background}"/><g fill="${foreground}">${parts.join('')}</g>${frameRegion(shape,size,`fill="${background}"${style==='plain'?` stroke="${foreground}" stroke-width="3"`:''}`)}</svg>`;
}
export function motifArtwork(art,{shape='circle',style='rays',size=.64,motifSize=70,cells=4,phase=0,rayCount=16,background='white',foreground='black'}={}){
  const scale=size*2*(motifSize/100);
  return `${frameArtwork({shape,style,size,cells,phase,rayCount,background,foreground})}<g transform="translate(100 100) rotate(-45) scale(${scale}) translate(-50 -50)" fill="${foreground}" color="${foreground}">${art}</g>`;
}
