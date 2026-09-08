/** Optional acceleration of the existing boundary derivative. Geometry checks
 * and exported-curve rendering remain independent JavaScript implementations. */
let runtime=null,loading=null;
export function loadBoundaryKernel(){
  return loading??=(async()=>{
    try{
      const url=new URL('./native/boundary.wasm',import.meta.url);
      const bytes=typeof process!=='undefined'&&process.versions?.node
        ?await(await import('node:fs/promises')).readFile(url)
        :await(await fetch(url)).arrayBuffer();
      runtime=(await WebAssembly.instantiate(bytes,{})).instance.exports;
      return{backend:'wasm',method:'Same continuous boundary formula; float64, no fast-math'};
    }catch(error){return{backend:'javascript',reason:error.message};}
  })();
}
const graphTables=new WeakMap();
export function nativeBoundaryGradient(graph,points,prob,n,phase,index,table){
  if(!runtime)return null;
  let geometry=graphTables.get(graph);
  if(!geometry){
    geometry={edges:Int32Array.from(graph.edges.flat()),occurrences:Int32Array.from(graph.occurrences.flatMap(o=>o[0])),visible:Int32Array.from(graph.visible,Number)};
    graphTables.set(graph,geometry);
  }
  const bins=index.bins,segments=index.segments,nb=bins.length,nquad=table.B.length;
  const binCount=bins.reduce((s,b)=>s+b.length,0);
  let end=Number(runtime.__heap_base.value);
  const alloc=bytes=>{const at=end;end+=Math.ceil(bytes/8)*8;return at;};
  const p=alloc(points.length*8),e=alloc(geometry.edges.byteLength),o=alloc(geometry.occurrences.byteLength),v=alloc(geometry.visible.byteLength);
  const ss=alloc(segments.length*5*8),starts=alloc((nb+1)*4),ids=alloc(binCount*4),target=alloc(n*n*8);
  const B=alloc(nquad*4*8),D=alloc(nquad*4*8),out=alloc(points.length*8);
  if(end>runtime.memory.buffer.byteLength)runtime.memory.grow(Math.ceil((end-runtime.memory.buffer.byteLength)/65536));
  const doubles=new Float64Array(runtime.memory.buffer),integers=new Int32Array(runtime.memory.buffer);
  doubles.set(points,p/8);integers.set(geometry.edges,e/4);integers.set(geometry.occurrences,o/4);integers.set(geometry.visible,v/4);
  let at=ss/8;for(const segment of segments)for(let i=0;i<5;i++)doubles[at++]=segment[i];
  at=0;for(let i=0;i<nb;i++){integers[starts/4+i]=at;integers.set(bins[i],ids/4+at);at+=bins[i].length;}integers[starts/4+nb]=at;
  doubles.set(prob,target/8);for(let j=0;j<nquad;j++){doubles.set(table.B[j],B/8+j*4);doubles.set(table.D[j],D/8+j*4);}
  runtime.boundary_gradient(p,points.length,e,o,v,graph.edges.length,ss,starts,ids,nb,target,n,phase,graph.width,nquad,B,D,out);
  return doubles.slice(out/8,out/8+points.length);
}
