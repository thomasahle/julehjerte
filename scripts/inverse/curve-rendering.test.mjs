import test from 'node:test';
import assert from 'node:assert/strict';
import {CurveGraph,polygonIndex,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {gridModel,gridPaths} from '../../static/inverse/core/direct/grid.js';

const line=(a,b)=>[a,a.map((v,i)=>v+(b[i]-v)/3),a.map((v,i)=>v+2*(b[i]-v)/3),b];
const chain=points=>points.slice(1).map((p,i)=>line(points[i],p));

// Deliberately keep the complete closed polygons and full row scans here.
// This is the preceding renderer's membership convention, independent of
// segment binning and cancellation in the optimized combined index.
function referenceSegments(graph,points,ns){
 const {samples,groups}=graph.sample(points,ns),w=graph.width;
 return groups.flatMap((ids,pi)=>{
  const p=ids.map(id=>[samples[2*id],samples[2*id+1]]);
  p.push([w,w],graph.family[pi]===0?[w,0]:[0,w],p[0]);
  return p.slice(1).map((b,i)=>{let a=p[i];if(a[1]>b[1])[a,b]=[b,a];return[...a,...b,pi];});
 });
}
function referenceMask(graph,points,phase,n,ns){
 const segments=referenceSegments(graph,points,ns),out=new Uint8Array(n*n),w=graph.width;
 for(let y=0;y<n;y++){
  const yy=(y+.5)*w/n,xs=[];
  for(const [ax,ay,bx,by]of segments)if(yy>=ay&&yy<by)xs.push(ax+(yy-ay)*(bx-ax)/(by-ay));
  xs.sort((a,b)=>a-b);let at=0,p=Number(phase===-1);
  for(let x=0;x<n;x++){while(at<xs.length&&xs[at]<(x+.5)*w/n){p^=1;at++;}out[y*n+x]=p;}
 }
 return out;
}
const shared=()=>[
 [chain([[20,0],[20,25],[75,25],[75,75],[20,75],[20,100]])],
 [chain([[0,75],[75,75],[75,25],[100,25]])]
];

test('binned rendering preserves full-polygon parity, closures and pixel-centre ties',()=>{
 const c=line([50,0],[50,100]),cases=[
  [[],[]],[[[c]],[]],[[[c],[c]],[]],[[[c],[c],[c]],[]],
  // A reversed whole path has different closing segments. Cancelling its
  // duplicate cubic must not erase those closures, even for invalid trial cuts.
  [[[c],[c.toReversed()]],[]],shared(),
  // Disconnected trial cubics use the old sampled polygon's join convention.
  [[[line([20,0],[20,40]),line([60,60],[60,100])]],[]],
  [[[[[20,0],[90,140],[-20,-40],[45,100]]]],[]],
  [[],[chain([[0,50],[25,50],[25,100],[75,100],[75,50],[100,50]])]],
  gridPaths(gridModel([2,3],4,17))
 ];
 for(const width of[63,100])for(const paths of cases){
  const graph=new CurveGraph(paths.map(f=>f.map(p=>p.map(c=>c.map(v=>v.map(x=>x*width/100))))),width);
  for(const n of[1,23,64,101,128])for(const ns of[1,7,24])for(const phase of[1,-1]){
   assert.deepEqual(renderCurves(graph,graph.points,phase,n,ns),referenceMask(graph,graph.points,phase,n,ns),`${width}/${n}/${ns}/${phase}`);
  }
 }
 const graph=new CurveGraph([[[c]],[]]);
 assert.equal(renderCurves(graph,graph.points,1,1)[0],0,'A crossing exactly at the pixel centre is not crossed yet.');
});

test('reusing a graph with moved controls and endpoints never reuses a stale raster',()=>{
 const graph=new CurveGraph(shared());
 for(const amount of[0,.013,-.17]){
  const points=Float64Array.from(graph.points,(v,i)=>v+amount*Math.sin(i+1));
  for(const phase of[1,-1])for(const n of[37,101])assert.deepEqual(renderCurves(graph,points,phase,n,32),referenceMask(graph,points,phase,n,32));
 }
});

test('boundary-force queries retain individual memberships of shared paths',()=>{
 const graph=new CurveGraph(shared()),points=graph.points,segments=referenceSegments(graph,points,24);
 for(const nbins of[1,7,128]){
  const index=polygonIndex(graph,points,24,nbins);
  for(const exclude of[-1,0,1])for(const phase of[1,-1])for(const x of[-1,0,20,30,75,100,101])for(const y of[-1,0,25,37.5,75,100,101]){
   let expected=Number(phase===-1);
   for(const [ax,ay,bx,by,pi]of segments)if(pi!==exclude&&y>=ay&&y<by&&ax+(y-ay)*(bx-ax)/(by-ay)>x)expected^=1;
   assert.equal(index.contains(x,y,exclude,phase),expected,`${nbins}/${exclude}/${phase}/${x}/${y}`);
  }
 }
});
