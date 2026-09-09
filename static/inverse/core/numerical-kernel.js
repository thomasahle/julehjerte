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
      return{backend:'wasm',method:'Float64 boundary and guarded-lattice kernels; no fast-math'};
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
