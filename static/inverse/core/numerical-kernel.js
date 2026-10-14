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

export function nativeCoreLabels(mask,nx,ny,originY,h,w,offset){
  if(!runtime?.label_core||!byteLattice(mask,nx,ny))return null;
  const count=nx*ny,arena=kernelMemory(),input=arena.alloc(count),labels=arena.alloc(count*4),queue=arena.alloc(count*4),sizes=arena.alloc(count*4),anchors=arena.alloc(count);
  const {bytes,integers}=arena.views();bytes.set(mask,input);
  const parts=runtime.label_core(input,nx,ny,originY,h,w,offset,labels,queue,sizes,anchors);
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
