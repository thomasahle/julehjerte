/** Optional float64 numerical kernels shared by fitting and paper checks.
 * Calls are synchronous. Every returned array owns its data, so a later call
 * may reuse or grow the scratch memory without changing an earlier result.
 */
let runtime=null,loading=null;
export function loadNumericalKernel(){
  return loading??=(async()=>{
    try{
      const url=new URL('./direct/native/boundary.wasm',import.meta.url);
      const bytes=typeof process!=='undefined'&&process.versions?.node
        ?await(await import('node:fs/promises')).readFile(url)
        :await(await fetch(url)).arrayBuffer();
      runtime=(await WebAssembly.instantiate(bytes,{})).instance.exports;
      return{backend:'wasm',method:'Float64 boundary, row-initialization and guarded-lattice kernels; no fast-math'};
    }catch(error){return{backend:'javascript',reason:error.message};}
  })();
}
export const numericalKernel=()=>runtime;
const byteLattice=(mask,nx,ny)=>mask instanceof Uint8Array&&Number.isInteger(nx)&&nx>0&&Number.isInteger(ny)&&ny>0&&nx*ny<=0x7fffffff&&mask.length===nx*ny;

export function kernelMemory(){
  let end=Number(runtime.__heap_base.value);
  return{
    alloc(bytes){const at=end;end+=Math.ceil(bytes/8)*8;return at;},
    views(){
      if(end>runtime.memory.buffer.byteLength)runtime.memory.grow(Math.ceil((end-runtime.memory.buffer.byteLength)/65536));
      return{bytes:new Uint8Array(runtime.memory.buffer),integers:new Int32Array(runtime.memory.buffer),doubles:new Float64Array(runtime.memory.buffer)};
    }
  };
}

export function nativeDistanceTransform(seeds,nx,ny){
  if(!runtime?.distance_transform||!byteLattice(seeds,nx,ny))return null;
  const count=nx*ny,size=Math.max(nx,ny),arena=kernelMemory();
  const mask=arena.alloc(count),first=arena.alloc(count*8),out=arena.alloc(count*8),f=arena.alloc(size*8),d=arena.alloc(size*8),v=arena.alloc(size*4),z=arena.alloc((size+1)*8);
  const {bytes,doubles}=arena.views();bytes.set(seeds,mask);
  runtime.distance_transform(mask,nx,ny,first,out,f,d,v,z);
  return doubles.slice(out/8,out/8+count);
}

export function nativeCoreLabels(mask,nx,ny,originY,h,w,offset,diagonal=false){
  const kernel=runtime?.[diagonal?'label_core_diagonal':'label_core'];
  if(!kernel||typeof diagonal!=='boolean'||!byteLattice(mask,nx,ny))return null;
  const count=nx*ny,arena=kernelMemory(),input=arena.alloc(count),labels=arena.alloc(count*4),queue=arena.alloc(count*4),sizes=arena.alloc(count*4),anchors=arena.alloc(count);
  const {bytes,integers}=arena.views();bytes.set(mask,input);
  const parts=kernel(input,nx,ny,originY,h,w,offset,labels,queue,sizes,anchors);
  return{labels:integers.slice(labels/4,labels/4+count),sizes:integers.slice(sizes/4,sizes/4+parts),anchored:bytes.slice(anchors,anchors+parts)};
}

/** Batch the initializer's alternating-run DP, preserving its JS fallback.
 * The caller has validated target/weights; dimensions are checked before any
 * pointer reaches Wasm. Returned positions own their memory. */
export function nativeGridRows(target,weights,flips,priors,n,count,family,phase,minimum,weight,weightScale){
  if(!runtime?.grid_rows||!Number.isInteger(n)||n<=0||n>4096||!Number.isInteger(count)||count<0||count>n||
    ![0,1].includes(family)||![0,1].includes(phase)||!Number.isInteger(minimum)||minimum<1||minimum>n+1||
    !Number.isFinite(weight)||!Number.isFinite(weightScale)||target.length!==n*n||
    weights&&weights.length!==n*n||!(flips instanceof Uint8Array)||flips.length!==n*n||priors.length!==n*count)return null;
  const arena=kernelMemory(),targetPtr=arena.alloc(n*n*8),weightPtr=weights?arena.alloc(n*n*8):0,
    flipsPtr=arena.alloc(n*n),priorPtr=arena.alloc(n*count*8),scratch=arena.alloc(4*(n+1)*8),
    back=arena.alloc((count+1)*(n+1)*4),out=arena.alloc(n*count*8);
  const {bytes,doubles}=arena.views();doubles.set(target,targetPtr/8);if(weights)doubles.set(weights,weightPtr/8);
  bytes.set(flips,flipsPtr);doubles.set(priors,priorPtr/8);
  runtime.grid_rows(targetPtr,weightPtr,flipsPtr,priorPtr,n,count,family,phase,minimum,weight,weightScale,scratch,back,out);
  return doubles.slice(out/8,out/8+n*count);
}

/** Rasterize the two ordered families without an intermediate full-size mask.
 * Like gridParity(), cuts exactly at a pixel centre do not toggle that pixel.
 */
export function nativeGridMask(samples,counts,n,phase){
  if(!runtime?.grid_mask||!Number.isInteger(n)||n<1||n>4096||![1,-1].includes(phase)||
    !Array.isArray(counts)||counts.length!==2||counts.some(c=>!Number.isInteger(c)||c<0||c>4096)||
    !Array.isArray(samples)||samples.length!==2||samples.some((s,f)=>!(s instanceof Float64Array)||s.length!==n*counts[f]))return null;
  const arena=kernelMemory(),a=arena.alloc(samples[0].byteLength),b=arena.alloc(samples[1].byteLength),out=arena.alloc(n*n);
  const {doubles,bytes}=arena.views();doubles.set(samples[0],a/8);doubles.set(samples[1],b/8);
  runtime.grid_mask(a,b,counts[0],counts[1],n,Number(phase===-1),out);
  return bytes.slice(out,out+n*n);
}

/** Exact-threshold paper masks, with ambiguous cells deferred to JS hypot.
 * Indices are validated before crossing the memory boundary. Coordinates are
 * float64; nonfinite distance arithmetic is deferred rather than approximated. */
export function nativePaperMasks({lattice,edt,tiles,tileX,tileY,chords,h,R,guard,tol,includeMap}){
  if(!runtime?.paper_masks||!lattice)return null;
  const {x,y,outline}=lattice,nx=x?.length,ny=y?.length,count=nx*ny;
  if(!(x instanceof Float64Array)||!(y instanceof Float64Array)||!nx||!ny||count>0x7fffffff||
    !(outline instanceof Float64Array)||outline.length!==count||!(edt instanceof Float64Array)||edt.length!==count||
    !Array.isArray(tiles)||!tiles.length||tiles.length>0x7ffffffe||!Array.isArray(chords)||chords.length>0x7fffffff||
    tileX?.length!==nx||tileY?.length!==ny||[tileX,tileY].some(v=>typeof v?.[Symbol.iterator]!=='function')||
    ![h,R,guard,tol].every(Number.isFinite)||h<=0)return null;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const value of tileX){if(!Number.isInteger(value))return null;minX=Math.min(minX,value);maxX=Math.max(maxX,value);}
  for(const value of tileY){if(!Number.isInteger(value))return null;minY=Math.min(minY,value);maxY=Math.max(maxY,value);}
  if(Math.min(minX,minY)<0||maxX+maxY>=tiles.length)return null;
  const starts=new Int32Array(tiles.length+1);let entries=0;
  for(let i=0;i<tiles.length;i++){
    const tile=tiles[i];if(tile!==undefined&&!Array.isArray(tile))return null;
    for(const id of tile||[])if(!Number.isInteger(id)||id<0||id>=chords.length)return null;
    entries+=tile?.length||0;if(entries>0x7fffffff)return null;starts[i+1]=entries;
  }
  const ids=new Int32Array(entries),terms=new Float64Array(5*chords.length);
  for(let i=0;i<tiles.length;i++)if(tiles[i])ids.set(tiles[i],starts[i]);
  for(let i=0;i<chords.length;i++){
    const chord=chords[i],values=[chord?.ax,chord?.ay,chord?.dx,chord?.dy,chord?.denominator];
    if(values.some(v=>typeof v!=='number'))return null;terms.set(values,5*i);
  }
  const arena=kernelMemory(),xp=arena.alloc(nx*8),yp=arena.alloc(ny*8),op=arena.alloc(count*8),dp=arena.alloc(count*8),
    txp=arena.alloc(nx*4),typ=arena.alloc(ny*4),sp=arena.alloc(starts.length*4),ip=arena.alloc(ids.length*4),cp=arena.alloc(terms.length*8),
    certain=arena.alloc(count),possible=arena.alloc(count),paper=includeMap?arena.alloc(count):0,deferred=arena.alloc(count*4);
  const {bytes,integers,doubles}=arena.views();
  doubles.set(x,xp/8);doubles.set(y,yp/8);doubles.set(outline,op/8);doubles.set(edt,dp/8);doubles.set(terms,cp/8);
  integers.set(tileX,txp/4);integers.set(tileY,typ/4);integers.set(starts,sp/4);integers.set(ids,ip/4);
  const pending=runtime.paper_masks(xp,nx,yp,ny,op,dp,txp,typ,sp,ip,cp,chords.length,h,R,guard,tol,certain,possible,paper,deferred);
  return{certain:bytes.slice(certain,certain+count),possible:bytes.slice(possible,possible+count),
    paper:includeMap?bytes.slice(paper,paper+count):null,deferred:integers.slice(deferred/4,deferred/4+pending)};
}
