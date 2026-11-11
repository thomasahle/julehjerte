/*
 * The weaving film on a heart's page: plays a recording (.jhb, static/weave/) of the heart being cut, woven and hung, in 3D.
 *
 * This is the script of scripts/weave/viewer.html, the simulator's own viewer, with its page taken off: the canvas and the
 * stage come from the caller (src/lib/components/detail/WeaveFilm.svelte), the caption and the transport are the caller's (it hears about them through
 * `on`), and each step says what it is (`id`, or a chapter's `tag` from pack.py) so the page can word it in Danish and English.
 * The weaving itself can be shown faster than it was recorded (`opt.weave`), at the pace of the steps around it, and the two papers take
 * the page's colours (`opt.red`, `opt.white`, `papers`).
 * Everything else is as the viewer has it, in the viewer's style, so that a newer viewer can be carried over line by line.
 *
 * It lives here, served as it is and loaded when a film is first asked for ($lib/weave/film.ts), like Mal's engine in static/inverse.
 * THREE is three.js r128 (vendor/three.min.js beside this file).
 */
export function createWeaveFilm(THREE,cv,st_,on,opt){
var PI=Math.PI;
function sm(t){t=t<0?0:t>1?1:t;return t*t*(3-2*t);}
function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function lerp(a,b,t){return a+(b-a)*t;}
function clamp(v,a,b){return v<a?a:v>b?b:v;}
var R=new THREE.WebGLRenderer({canvas:cv,antialias:true});
R.setPixelRatio(Math.min(window.devicePixelRatio||1,2));R.outputEncoding=THREE.sRGBEncoding;R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;
var scene=new THREE.Scene(),BG=new THREE.Color(0x163a2d).convertSRGBToLinear();scene.background=BG;scene.fog=new THREE.Fog(BG,30,80);
var cam=new THREE.PerspectiveCamera(30,4/3,0.3,160);cam.up.set(0,0,1);
scene.add(new THREE.HemisphereLight(0xffffff,0x6f8a7c,0.55));
var sun=new THREE.DirectionalLight(0xfff4e6,0.66);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);var sc=sun.shadow.camera;sc.left=-11;sc.right=11;sc.top=11;sc.bottom=-11;sc.near=2;sc.far=40;sun.shadow.bias=-0.0016;sun.shadow.radius=2.5;scene.add(sun);scene.add(sun.target);
var ZT=-0.058;
(function(){var c=document.createElement('canvas');c.width=c.height=256;var g=c.getContext('2d');g.fillStyle='#1f4d3b';g.fillRect(0,0,256,256);g.strokeStyle='rgba(190,225,205,.16)';g.lineWidth=1;
  for(var i=1;i<4;i++){g.beginPath();g.moveTo(i*64+.5,0);g.lineTo(i*64+.5,256);g.moveTo(0,i*64+.5);g.lineTo(256,i*64+.5);g.stroke();}
  g.strokeStyle='rgba(200,235,215,.42)';g.lineWidth=2;g.strokeRect(0,0,256,256);
  var tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(80,80);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=R.capabilities.getMaxAnisotropy();
  var m=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({map:tex,roughness:.95}));m.position.z=ZT;m.receiveShadow=true;scene.add(m);})();
var paperB=new THREE.MeshStandardMaterial({color:new THREE.Color(opt&&opt.white!=null?opt.white:0xf3f0e8).convertSRGBToLinear(),roughness:.85,side:THREE.DoubleSide});
var paperA=new THREE.MeshStandardMaterial({color:new THREE.Color(opt&&opt.red!=null?opt.red:0xc8102e).convertSRGBToLinear(),roughness:.78,side:THREE.DoubleSide});
var mats=[paperB,paperA];
function graphite(){return new THREE.MeshBasicMaterial({color:0x101312,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false});}
/* The two papers can be any colours (`opt.red`, `opt.white`: the papers the simulator calls red and white) and can change while a film is
   open (`papers`): what is cut from a paper, the offcuts and the handle, follows it, and a pencil line on a dark paper is drawn light. */
function pencilOn(c){return 0.2126*c.r+0.7152*c.g+0.0722*c.b<0.09?0xd9d6cc:0x101312;}
function repaint(){
  offcuts.forEach(function(o){o.rib.mesh.material.color.copy((o.isA?paperA:paperB).color);});
  var inkA=pencilOn(paperA.color),inkB=pencilOn(paperB.color);
  arcs.concat(marks).forEach(function(o){o.rib.mesh.material.color.setHex(o.isA?inkA:inkB);});
  handle.mesh.material.color.copy(paperA.color);wake=40;
}
function papers(red,white){paperA.color.set(red).convertSRGBToLinear();paperB.color.set(white).convertSRGBToLinear();repaint();}

/* The heart group H is what is lifted, stood up and turned at the end. Inside it: W holds the simulated paper in the weave's own axes
   (red strips along x, white along y, the point of the heart at the origin); gA and gB carry each half while it is drawn on, cut and laid out. */
var T0x=0,T0y=-2.3;
var H=new THREE.Group();H.rotation.order='XYZ';scene.add(H);
var W=new THREE.Group();W.rotation.z=PI/4;W.position.set(T0x,T0y,0);H.add(W);
var gA=new THREE.Group(),gB=new THREE.Group();H.add(gA);H.add(gB);

/* ---- state ---- */
var YAW0=0.1,TILT0=0.6;
var B=null,pos=null,meshes=[],T=0,playing=false,speed=1,yaw=YAW0,tilt=TILT0,zoom=1,pan=new THREE.Vector3(),wake=0,gone=false,padT=0,padB=0;
var SQ=3,RAD=1.5,ZI=0.012,ZM=-0.032,FILM=null;

/* ---- file format (see pack.py) ---- */
function inflate(u8){return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();}
function parse(buf){var dv=new DataView(buf),hl=dv.getUint32(4,true),hd=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,8,hl))),base=8+hl,s=hd.sections;
  function part(n){return buf.slice(base+s[n][0],base+s[n][0]+s[n][1]);}
  hd.faces=hd.idx===2?new Uint16Array(part('faces')):new Uint32Array(part('faces'));hd.piece=new Uint8Array(part('piece'));hd.sign=s.sign?new Int8Array(part('sign')):new Int8Array(hd.nv);
  if(hd.film&&s.rest){hd.rest=new Float32Array(part('rest'));hd.kc=new Int8Array(part('kc'));hd.kd=new Float32Array(part('kd'));hd.kf=new Float32Array(part('kf'));}else hd.film=null;
  return inflate(new Uint8Array(part('frames'))).then(function(raw){var b=new Uint8Array(raw),n=hd.nframes*hd.nv*3,fr=new Uint16Array(n),per=hd.nv*3,i;
    for(i=0;i<per;i++)fr[i]=b[i]|(b[n+i]<<8);for(i=per;i<n;i++)fr[i]=(fr[i-per]+(b[i]|(b[n+i]<<8)))&65535;hd.frames=fr;return hd;});}

/* ---- ribbons: pencil lines, offcuts, the handle ---- */
function ribbon(nSec,material,parent){
  var geo=new THREE.BufferGeometry(),p=new Float32Array(nSec*2*3),idx=[];
  for(var i=0;i<nSec-1;i++){var a=i*2,c=a+2;idx.push(a,a+1,c,a+1,c+1,c);}
  var attr=new THREE.BufferAttribute(p,3);attr.setUsage(THREE.DynamicDrawUsage);geo.setAttribute('position',attr);geo.setIndex(idx);
  var mesh=new THREE.Mesh(geo,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;parent.add(mesh);
  return {geo:geo,pos:p,mesh:mesh,n:nSec};
}
function finish(r){r.geo.attributes.position.needsUpdate=true;r.geo.computeVertexNormals();}
function pocket(x,y,P){var qx=1-Math.exp(-Math.max(x,0)/1.5),qy=1-Math.exp(-Math.max(y,0)/1.5);return P*qx*qy;}
/* one point of a half in its own axes (u along the strips from the fold at `off`, v across, z from the middle of the two layers) -> that half's group.
   The top layer is hinged on the fold: fold = pi is the strip lying open, 0 is folded in half */
function put(arr,k,isA,off,u,z,v,sign,fold){
  if(sign>0&&fold>1e-4){var du=u-off,c=Math.cos(fold),s=Math.sin(fold);u=off+du*c-z*s;z=du*s+z*c;}
  arr[k]=isA?u:v;arr[k+1]=isA?v:u;arr[k+2]=z+ZM;
}

/* ---- steps and timeline: the hand-made parts before and after the simulated weave ---- */
var WORDS=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
/* WEAVE: how many times faster than it was recorded the weaving itself is shown (the steps before and after it keep their own pace) */
var WEAVE=opt&&opt.weave||1;
var steps=[],init={},tracks={},stepStart=[],TOTAL=0,tI=0,tW=0,cuts=[],nA=0,cumCut=[0,1],cumArc=[0,.5,1],DRAW=0.8;
function prepCut(pts,isA){var n=pts.length,L=0,cl=[0],i;for(i=1;i<n;i++){L+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);cl.push(L);}
  var NM=Math.max(48,Math.min(240,Math.round(L/0.04))),sp=new Float32Array((NM+1)*2),j=0;
  for(i=0;i<=NM;i++){var d=L*i/NM;while(j<n-2&&cl[j+1]<d)j++;var f=cl[j+1]>cl[j]?(d-cl[j])/(cl[j+1]-cl[j]):0;sp[2*i]=lerp(pts[j][0],pts[j+1][0],f);sp[2*i+1]=lerp(pts[j][1],pts[j+1][1],f);}
  return {isA:isA,L:L,NM:NM,sp:sp};}
/* point at fraction f of a cut's length; before the fold (f<0) it carries on straight */
function cutPt(c,f,out){var x=f*c.NM;if(x<=0){var dx=c.sp[2]-c.sp[0],dy=c.sp[3]-c.sp[1],dl=Math.hypot(dx,dy)||1;out[0]=c.sp[0]+dx/dl*f*c.L;out[1]=c.sp[1]+dy/dl*f*c.L;return;}
  if(x>=c.NM){out[0]=c.sp[2*c.NM];out[1]=c.sp[2*c.NM+1];return;}var i=Math.floor(x),t=x-i;out[0]=lerp(c.sp[2*i],c.sp[2*i+2],t);out[1]=lerp(c.sp[2*i+1],c.sp[2*i+3],t);}
function buildSteps(hd){
  var list=[],f=hd.film,k;FILM=f;cuts=[];nA=0;
  if(f){SQ=f.SQ;RAD=f.RAD;ZI=f.ZI;ZM=f.ZM;f.cutsA.forEach(function(p){cuts.push(prepCut(p,true));});nA=cuts.length;f.cutsB.forEach(function(p){cuts.push(prepCut(p,false));});
    var KK=cuts.length,ws=cuts.map(function(c){return 0.5+0.28*c.L;}),ts=0;ws.forEach(function(w){ts+=w;});cumCut=[0];ws.forEach(function(w){cumCut.push(cumCut[cumCut.length-1]+w/ts);});cumCut[KK]=1;
    var NAs=nA+1,NBs=KK-nA+1,cnt=NAs===NBs?WORDS[NAs]||String(NAs):((WORDS[NAs]||NAs)+' and '+(WORDS[NBs]||NBs)),tm=Math.max(1.3,0.3*ts),t0=1.15+tm,tA1=t0+ts*cumCut[nA];
    list.push({id:'strips',t:'Cut two strips',d:2.6,x:'Cut one strip 3 × 9 in (7.5 × 23 cm) from each colour. Thin paper weaves best: wrapping paper or letter-weight craft paper.',tw:[]});
    list.push({id:'fold',t:'Fold each strip in half',d:3.6,x:'Fold crosswise, short end to short end, so each piece is 3 × 4½ in with a fold at one end and an open end at the other.',tw:[['fold',0,.3,2.8]]});
    list.push({id:'round',t:'Round the open end',d:7.8,x:'Trace a 3 in half circle on the open end (a biscuit cutter works) and cut along the curve through both layers. Leave the folded end alone.',
      tw:[['arcOp',1,.1,.3],['pen',1,0,.4],['arc',1,.45,2.45,1],['pen',0,2.45,2.85],['upA',1,2.45,3.0],['sci',1,2.7,3.05],['trim',1,3.1,7.1,1],['upA',0,4.75,5.2],['upB',1,4.5,5.05],['upB',0,6.75,7.3],['sci',0,6.7,7.0],['arcOp',0,6.9,7.4]]});
    list.push({id:'cut',n:[NAs,NBs],straight:!!f.straight,t:'Cut '+cnt+' strips from the fold',d:t0+ts+.8,
      x:(f.straight?'Mark the strips with a ruler. ':'Trace the cuts from the template. ')+'Cut from the fold toward the curve, through both layers, and stop where the curve begins.'+(f.straight?'':' Follow each line in one go so the edge stays smooth.'),
      tw:[['markOp',1,.1,.3],['pen',1,0,.4],['mark',1,.45,.45+tm,1],['pen',0,.45+tm,.85+tm],['upA',1,t0-.6,t0-.05],['sci',1,t0-.4,t0-.05],['slit',1,t0,t0+ts,1],['upA',0,tA1-.1,tA1+.4],['upB',1,tA1-.5,tA1-.02],['upB',0,t0+ts-.3,t0+ts+.3],['sci',0,t0+ts-.3,t0+ts],['markOp',0,t0+ts-.1,t0+ts+.4]]});
    list.push({id:'lay',t:'Lay the two pieces out',d:4.2,x:'Lay the white piece where the heart will be and bring the red piece in at a right angle, folds toward each other.',
      tw:[['lay',1,.5,3.3],['a',f.redoff,.5,3.3],['b',0,.5,3.3]]});
  }
  var nIntro=list.length,ch=hd.chapters||[],span=(hd.nframes-1)/hd.fps;
  if(!ch.length)ch=[[0,'Weaving','']];
  for(k=0;k<ch.length;k++){if(ch[k][0]>=span-0.05)break;var t1=k+1<ch.length?Math.min(span,ch[k+1][0]):span,t0c=k===0?0:ch[k][0];list.push({tag:ch[k][3]||'',t:ch[k][1],x:ch[k][2],d:(t1-t0c)/WEAVE,tw:[]});}
  list.push({id:'handle',t:'Add a handle',d:5.4,x:'Cut a strip about 8 in (20 cm) long and ¾–1 in wide. Glue each end to the inside of the heart, one on each side.',
    tw:[['lift',.3,.1,1.2],['P',.16,.2,1.2],['hOp',1,.3,.9],['hIn',1,.6,3.4]]});
  list.push({id:'hang',t:'Fill it and hang it',d:9.4,x:'The heart is a basket: the two sides open into a pocket for sweets or biscuits. Hang it on the tree.',
    tw:[['lift',1,.2,2.4],['stand',1,.2,2.4],['P',.5,1.6,3.2],['spin',2*PI,3.0,8.4],['P',.12,4.6,6.0]]});
  steps=list;
  init={fold:PI,arc:0,arcOp:0,trim:0,mark:0,markOp:0,slit:0,pen:0,sci:0,upA:0,upB:0,lay:0,a:4,b:4,lift:0,stand:0,spin:0,P:0,hOp:0,hIn:0};
  if(!f){init.fold=0;init.lay=1;init.a=0;init.b=0;init.slit=1;}
  tracks={};stepStart=[];TOTAL=0;tI=0;
  steps.forEach(function(s,i){
    if(i===nIntro)tI=TOTAL;
    stepStart.push(TOTAL);
    s.tw.forEach(function(w){(tracks[w[0]]=tracks[w[0]]||[]).push({to:w[1],t0:TOTAL+w[2],t1:TOTAL+w[3],lin:!!w[4]});});
    TOTAL+=s.d;
  });
  tW=tI+span/WEAVE;
}
function stateAt(t){
  var st={};
  for(var k in init){var v=init[k],tr=tracks[k];
    if(tr){for(var i=0;i<tr.length;i++){var w=tr[i];if(t>=w.t1){v=w.to;}else if(t>w.t0){v=lerp(v,w.to,w.lin?(t-w.t0)/(w.t1-w.t0):ease((t-w.t0)/(w.t1-w.t0)));break;}else break;}}
    st[k]=v;}
  return st;
}
function stepIndexAt(t){var i=0;for(var k=0;k<steps.length;k++){if(t>=stepStart[k]-1e-6)i=k;}return i;}
/* which item of a sequence the parameter x is in, and how far through it */
var SEQ={j:0,l:0};
function locate(x,cum){var M=cum.length-1,j=0;while(j<M-1&&x>=cum[j+1])j++;SEQ.j=j;SEQ.l=clamp((x-cum[j])/(cum[j+1]-cum[j]),0,1);}
function seqL(x,cum,j){return clamp((x-cum[j])/(cum[j+1]-cum[j]),0,1);}
/* scissors cut in snips: the blades close (the cut runs forward from where they cross), then open again while the scissors move up to the end of the cut.
   D = how far the cut has got, x = how far in front of the pivot the blades cross */
var SCS=0.92,SNIP={D:0,x:0},SX0=0.2*SCS;
function snip(l,Lc,fr){
  var u=l/fr,n=Math.max(1,Math.ceil(Lc/0.62)),d=Lc/n;
  if(u>=1){SNIP.D=Lc;SNIP.x=SX0+d;return;}
  var ui=u*n,i=Math.floor(ui),a=ui-i,c;
  if(a<0.6){c=sm(a/0.6);SNIP.D=(i+c)*d;SNIP.x=SX0+c*d;}
  else if(i===n-1){SNIP.D=Lc;SNIP.x=SX0+d;}
  else{c=sm((a-0.6)/0.4);SNIP.D=(i+1)*d;SNIP.x=SX0+(1-c)*d;}
}
function drawn(l,fr){return sm(l/(fr||DRAW));}

/* ---- the paper ---- */
var arcs=[],marks=[],offcuts=[],extra=[],NO=16,cutD=[];
function clear(){meshes.forEach(function(m){W.remove(m);m.geometry.dispose();});meshes=[];
  extra.forEach(function(r){r.mesh.parent.remove(r.mesh);r.geo.dispose();});extra=[];arcs=[];marks=[];offcuts=[];B=null;}
function build(hd){clear();B=hd;pos=new THREE.BufferAttribute(new Float32Array(hd.nv*3),3);pos.setUsage(THREE.DynamicDrawUsage);
  [1,0].forEach(function(pc){var idx=[],f=hd.faces;for(var i=0;i<f.length;i+=3)if(hd.piece[f[i]]===pc)idx.push(f[i],f[i+1],f[i+2]);
    var g=new THREE.BufferGeometry();g.setAttribute('position',pos);g.setIndex(idx);var m=new THREE.Mesh(g,mats[pc]);m.castShadow=m.receiveShadow=true;m.frustumCulled=false;W.add(m);meshes.push(m);});
  buildSteps(hd);
  if(FILM)[true,false].forEach(function(isA){
    var g=isA?gA:gB,mat=isA?paperA:paperB,i,p;
    [1,-1].forEach(function(sign){[1,-1].forEach(function(side){var m=mat.clone();m.transparent=true;var rb=ribbon(NO+1,m,g);extra.push(rb);offcuts.push({isA:isA,sign:sign,side:side,rib:rb});});});
    /* pencil lines, drawn once in the half's own axes and moved with it */
    var NAr=48,ar=ribbon(NAr+1,graphite(),g);p=0;
    for(i=0;i<=NAr;i++){var ang=PI*i/NAr;
      put(ar.pos,p,isA,0,SQ+(RAD-.045)*Math.sin(ang),ZI+.004,RAD-(RAD-.045)*Math.cos(ang),1,0);
      put(ar.pos,p+3,isA,0,SQ+(RAD-.015)*Math.sin(ang),ZI+.004,RAD-(RAD-.015)*Math.cos(ang),1,0);p+=6;}
    finish(ar);ar.mesh.castShadow=false;ar.mesh.receiveShadow=false;extra.push(ar);arcs.push({isA:isA,rib:ar,quads:NAr});
    cuts.forEach(function(c,j){if(c.isA!==isA)return;
      var mk=ribbon(c.NM+1,graphite(),g),q=0,sp=c.sp;
      for(i=0;i<=c.NM;i++){var a=Math.max(0,i-1),b=Math.min(c.NM,i+1),tx=sp[2*b]-sp[2*a],ty=sp[2*b+1]-sp[2*a+1],tl=Math.hypot(tx,ty)||1,nx=-ty/tl*.014,ny=tx/tl*.014;
        put(mk.pos,q,isA,0,sp[2*i]-nx,ZI+.004,sp[2*i+1]-ny,1,0);put(mk.pos,q+3,isA,0,sp[2*i]+nx,ZI+.004,sp[2*i+1]+ny,1,0);q+=6;}
      finish(mk);mk.mesh.castShadow=false;mk.mesh.receiveShadow=false;extra.push(mk);marks.push({isA:isA,j:j,rib:mk,quads:c.NM});});
  });
  cutD=new Float32Array(cuts.length);repaint();
  T=0;camReady=false;lastCh=-2;show(0);}
function updateOffcut(O,st){
  var l=seqL(st.trim,cumArc,O.isA?0:1),vis=l<0.999;O.rib.mesh.visible=vis;if(!vis)return;
  var off=O.isA?st.a:st.b,arr=O.rib.pos,p=0,tr=clamp((l-(O.side<0?0.4:0.74))/0.26,0,1),ds=0.55*tr,dv=O.side*1.0*tr;
  /* the corner reaches a little way in under the rounded end, and lies a hair nearer the middle of the two layers, so no gap shows between them */
  var lap=0.05*(1-tr),zo=O.sign*(ZI-0.0015);
  for(var i=0;i<=NO;i++){var ang=PI/2*i/NO,s=SQ+RAD*Math.sin(ang),hw=Math.max(0,RAD*Math.cos(ang)-lap),va=O.side<0?0:RAD+hw,vb=O.side<0?RAD-hw:SQ;
    put(arr,p,O.isA,off,off+s+ds-(i===0?lap:0),zo,va+dv,O.sign,st.fold);put(arr,p+3,O.isA,off,off+s+ds-(i===0?lap:0),zo,vb+dv,O.sign,st.fold);p+=6;}
  O.rib.mesh.material.opacity=1-tr;O.rib.mesh.castShadow=tr<0.5;finish(O.rib);
}
/* the paper before the weaving starts: each point where it is on its flat half, with the cuts still closed where the scissors have not been */
var MA=new THREE.Matrix4(),MB=new THREE.Matrix4(),WI=new THREE.Matrix4();
function introPos(st,P){
  W.updateMatrix();gA.updateMatrix();gB.updateMatrix();WI.copy(W.matrix).invert();MA.multiplyMatrices(WI,gA.matrix);MB.multiplyMatrices(WI,gB.matrix);
  var n=B.nv,rest=B.rest,pc=B.piece,sg=B.sign,kc=B.kc,kd=B.kd,kf=B.kf,fold=st.fold,cf=Math.cos(fold),sf=Math.sin(fold),ch=Math.cos(fold/2),sh=Math.sin(fold/2);
  for(var i=0;i<n;i++){
    var isA=pc[i]===1,s=rest[2*i],v=rest[2*i+1],g=sg[i],c=kc[i],z,u;
    if(c>=0){var cj=isA?c:nA+c,cl=cuts[cj].L,op=clamp((cutD[cj]-kf[i]*cl)/0.12,0,1);if(op<1){s+=kd[2*i]*(1-op);v+=kd[2*i+1]*(1-op);}}
    if(g>0){u=s*cf-ZI*sf;z=s*sf+ZI*cf;}else if(g<0){u=s;z=-ZI;}else{u=s*ch;z=-ZI*sh;}
    var off=isA?st.a:st.b,x=isA?off+u:v,y=isA?v:off+u,e=(isA?MA:MB).elements;z+=ZM;
    P[3*i]=e[0]*x+e[4]*y+e[8]*z+e[12];P[3*i+1]=e[1]*x+e[5]*y+e[9]*z+e[13];P[3*i+2]=e[2]*x+e[6]*y+e[10]*z+e[14];
  }
}

/* handle: a ribbon whose two ends go down inside the pocket, one against each face */
var NTAB=14,NTEAR=64,handle=ribbon(NTAB+NTEAR+NTAB+1,paperA.clone(),H);handle.mesh.material.transparent=true;handle.mesh.visible=false;
function updateHandle(st){
  var vis=st.hOp>0.001;handle.mesh.visible=vis;if(!vis)return;
  handle.mesh.material.opacity=st.hOp;
  var dy=(1-st.hIn)*2.7,arr=handle.pos,p=0,HW=0.33,yb=2.3,y0=0.95,HH=2.45,WW=0.7,i;
  function pk(x,y){var c=(y-T0y)/Math.SQRT2,d=x/Math.SQRT2;return pocket(c+d,c-d,st.P)+0.003;}
  function sec(y,zl,zr){arr[p]=-HW;arr[p+1]=y;arr[p+2]=zl+ZM;arr[p+3]=HW;arr[p+4]=y;arr[p+5]=zr+ZM;p+=6;}
  for(i=0;i<NTAB;i++){var y=lerp(y0,yb,i/NTAB)+dy;sec(y,pk(-HW,y),pk(HW,y));}
  var dl=pk(-HW,yb+dy),dr=pk(HW,yb+dy);
  for(i=0;i<=NTEAR;i++){var ph=2*PI*i/NTEAR,sh=Math.sin(ph/2),zt=WW*Math.sin(ph)*sh*sh,cc=Math.cos(ph/2);sec(yb+dy+HH*(1-Math.cos(ph))/2,zt+dl*cc,zt+dr*cc);}
  for(i=1;i<=NTAB;i++){var y2=lerp(yb,y0,i/NTAB)+dy;sec(y2,-pk(-HW,y2),-pk(HW,y2));}
  finish(handle);
}

/* ---- pencil and scissors ---- */
var tools=new THREE.Group();scene.add(tools);
function tmat(hex,rough,metal,flat){return new THREE.MeshStandardMaterial({color:new THREE.Color(hex).convertSRGBToLinear(),roughness:rough,metalness:metal||0,flatShading:!!flat,transparent:true,side:THREE.DoubleSide});}
function tmesh(geo,mat,parent){var m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
var pencil=new THREE.Group(),penMats=[tmat(0x26282a,.6),tmat(0xdcb98f,.85),tmat(0xf0b323,.5,0,true),tmat(0xc3c8cd,.35,.4),tmat(0xe79090,.9)];
(function(){
  var y=0;function part(r0,r1,h,seg,mi){var m=tmesh(new THREE.CylinderGeometry(r1,r0,h,seg),penMats[mi],pencil);m.position.y=y+h/2;y+=h;}
  part(0.003,0.024,0.075,12,0);part(0.024,0.085,0.22,12,1);part(0.085,0.085,1.9,6,2);part(0.089,0.089,0.17,14,3);part(0.081,0.081,0.19,14,4);
  pencil.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(0.5,-0.16,0.85).normalize());
})();
tools.add(pencil);pencil.visible=false;
var scis=new THREE.Group(),sciHalf=[new THREE.Group(),new THREE.Group()],sciMats=[tmat(0xe3e7ea,.26,.3),tmat(0x2a62ad,.4),tmat(0x8b9299,.35,.5)];
(function(){
  /* each half: a blade with a straight cutting edge and a curved back, a moulded grip that ends in a loop (thumb loop on one, longer finger loop on the other) */
  var bladeEx={depth:0.018,bevelEnabled:true,bevelThickness:0.007,bevelSize:0.012,bevelSegments:2,curveSegments:18};
  var neckEx={depth:0.02,bevelEnabled:true,bevelThickness:0.008,bevelSize:0.014,bevelSegments:3,curveSegments:18};
  var loopEx={depth:0.05,bevelEnabled:true,bevelThickness:0.03,bevelSize:0.03,bevelSegments:5,curveSegments:36};
  [1,-1].forEach(function(sg,i){
    var g=sciHalf[i],bl=new THREE.Shape(),nk=new THREE.Shape(),lp=new THREE.Shape(),hole=new THREE.Path();
    bl.moveTo(-0.3,-0.075*sg);bl.lineTo(1.6,0.002*sg);bl.quadraticCurveTo(1.05,0.135*sg,0.16,0.125*sg);bl.lineTo(-0.3,0.105*sg);bl.closePath();
    nk.moveTo(-0.14,0.11*sg);nk.lineTo(-0.14,-0.085*sg);nk.quadraticCurveTo(-0.5,-0.13*sg,-0.86,-0.4*sg);nk.lineTo(-0.98,-0.2*sg);nk.quadraticCurveTo(-0.55,0.03*sg,-0.14,0.11*sg);
    var rx=i===0?0.5:0.35,ry=i===0?0.29:0.28,cx=-0.86-rx*0.92,cy=-(0.3+ry*0.42)*sg,rot=-0.3*sg;
    lp.absellipse(0,0,rx,ry,0,2*PI,false,0);hole.absellipse(0,0,rx-0.085,ry-0.085,0,2*PI,true,0);lp.holes.push(hole);
    tmesh(new THREE.ExtrudeGeometry(bl,bladeEx),sciMats[0],g);
    tmesh(new THREE.ExtrudeGeometry(nk,neckEx),sciMats[1],g).position.z=-0.001;
    var loop=tmesh(new THREE.ExtrudeGeometry(lp,loopEx),sciMats[1],g);loop.position.set(cx,cy,-0.016);loop.rotation.z=rot;
    g.position.z=i===0?-0.027:0.011;scis.add(g);
  });
  var pin=tmesh(new THREE.CylinderGeometry(0.058,0.058,0.1,20),sciMats[2],scis);pin.rotation.x=PI/2;pin.position.z=0.004;
  var cap=tmesh(new THREE.CylinderGeometry(0.03,0.03,0.115,16),sciMats[0],scis);cap.rotation.x=PI/2;cap.position.z=0.004;
  scis.scale.setScalar(SCS);scis.rotation.order='ZYX';
})();
tools.add(scis);scis.visible=false;
var tA=new THREE.Vector3(),tB=new THREE.Vector3(),tC=new THREE.Vector3(),curSt=null,q2=[0,0];
function arcItem(j,f,out,rad){var isA=j===0,ang=PI*f,off=isA?curSt.a:curSt.b,s=SQ+rad*Math.sin(ang),v=RAD-rad*Math.cos(ang);
  out.set(isA?off+s:v,isA?v:off+s,ZM).applyMatrix4((isA?gA:gB).matrixWorld);}
function arcEdge(j,f,o){if(f<0){arcItem(j,0,o,RAD);arcItem(j,0.01,tC,RAD);o.addScaledVector(tC.sub(o),f/0.01);}else arcItem(j,f,o,RAD);}
function arcLine(j,f,o){arcItem(j,f,o,RAD-0.03);}
function cutItem(j,f,out){var c=cuts[j],off=c.isA?curSt.a:curSt.b;cutPt(c,f,q2);out.set(c.isA?off+q2[0]:q2[1],c.isA?q2[1]:off+q2[0],ZM).applyMatrix4((c.isA?gA:gB).matrixWorld);}
/* where a tool is at parameter x of a sequence of items: it follows each line, then hops over to the start of the next */
function toolAt(x,cum,item,fr,out){
  locate(x,cum);var j=SEQ.j,l=SEQ.l,M=cum.length-1;
  if(l<=fr||j===M-1){item(j,sm(l/fr),out);return;}
  var hop=sm((l-fr)/(1-fr));item(j,1,tA);item(j+1,0,tC);out.lerpVectors(tA,tC,hop);out.z+=Math.sin(PI*hop)*0.7;
}
function fade(g,ms,p){g.visible=p>0.01;for(var i=0;i<ms.length;i++)ms[i].opacity=p;g.traverse(function(o){if(o.isMesh)o.castShadow=p>0.5;});}
function updateTools(st){
  curSt=st;
  fade(pencil,penMats,st.pen);scis.visible=st.sci>0.01;
  if(!FILM){pencil.visible=false;scis.visible=false;return;}
  if(pencil.visible){
    if(st.mark>0||st.trim>0)toolAt(st.mark,cumCut,cutItem,DRAW,pencil.position);else toolAt(st.arc,cumArc,arcLine,DRAW,pencil.position);
    pencil.position.z+=0.036+0.012+(1-st.pen)*0.6;
  }
  if(scis.visible){
    var slit=st.slit>0||st.mark>0,cum=slit?cumCut:cumArc,M=cum.length-1,fr=slit?DRAW:0.74,item=slit?cutItem:arcEdge;
    locate(slit?st.slit:st.trim,cum);var j=SEQ.j,l=SEQ.l,op=st.sci;
    if(l>fr&&j<M-1){var h=(l-fr)/(1-fr);if(h<0.5){op*=1-sm(h/0.4);l=fr;}else{op*=sm((h-0.6)/0.4);j++;l=0;}}
    var Lc=slit?cuts[j].L:PI*RAD;
    fade(scis,sciMats,op);
    snip(l,Lc,fr);
    item(j,SNIP.D/Lc,tA);item(j,(SNIP.D-SNIP.x)/Lc,tB);
    var ang=Math.atan2(tA.y-tB.y,tA.x-tB.x),th=Math.atan(Math.max(0,0.0628/(SNIP.x/SCS)-0.0405));
    sciHalf[0].rotation.z=th;sciHalf[1].rotation.z=-th;
    /* held upright, one blade over the paper and one under it, leaning back a little so the open blades show */
    scis.rotation.set(PI/2-0.55*clamp(2.5*Math.cos(ang),-1,1),0,ang);
    scis.position.copy(tB);scis.position.z+=(1-st.sci)*0.5;
  }
}

/* ---- one moment of the film ---- */
var curState=null,P0=null,lastCh=-2;
/* A film without frames (src/lib/weave/sketch.ts) says where its points are itself. */
function poseInto(P,t,pk){B.pose(P,t);if(pk>0)for(var j=0,k=0,sg=B.sign;j<P.length;j+=3,k++)if(sg[k]!==0)P[j+2]+=sg[k]*pocket(P[j],P[j+1],pk);}
function frameInto(P,t,pk){if(B.pose)return poseInto(P,t,pk);var n=B.nframes,f=clamp(t*B.fps,0,n-1),i0=Math.floor(f),i1=Math.min(n-1,i0+1),u=f-i0,per=B.nv*3,a=i0*per,b=i1*per,fr=B.frames,qq=B.q,mn=B.min,sg=B.sign;
  for(var j=0,k=0;j<per;j+=3,k++){var x=mn[0]+qq*(fr[a+j]+(fr[b+j]-fr[a+j])*u),y=mn[1]+qq*(fr[a+j+1]+(fr[b+j+1]-fr[a+j+1])*u),z=mn[2]+qq*(fr[a+j+2]+(fr[b+j+2]-fr[a+j+2])*u);
    if(pk>0&&sg[k]!==0)z+=sg[k]*pocket(x,y,pk);P[j]=x;P[j+1]=y;P[j+2]=z;}}
function apply(st){
  var L=st.lay,P=pos.array,j;
  gA.rotation.z=lerp(0,PI/4,L);gA.position.set(lerp(-4,T0x,L),lerp(0.5,T0y,L),st.upA*1.05);
  gB.rotation.z=lerp(PI/2,PI/4,L);gB.position.set(lerp(4,T0x,L),lerp(-3.5,T0y,L),st.upB*1.05);
  H.position.z=st.lift*3.3;H.rotation.x=st.stand*1.0;H.rotation.y=st.spin;
  if(FILM&&T<tI){
    for(j=0;j<cuts.length;j++){snip(seqL(st.slit,cumCut,j),cuts[j].L,DRAW);cutD[j]=st.slit>=1?1e9:SNIP.D*(cuts[j].L+0.12)/cuts[j].L;}
    introPos(st,P);
    var w=sm((T-(tI-0.7))/0.6);   /* settle into the first simulated frame */
    if(w>0){if(!P0||P0.length!==P.length){P0=new Float32Array(P.length);}frameInto(P0,0,0);for(j=0;j<P.length;j++)P[j]+=(P0[j]-P[j])*w;}
  }else frameInto(P,(T-tI)*WEAVE,T>tW?st.P:0);
  pos.needsUpdate=true;meshes.forEach(function(m){m.geometry.computeVertexNormals();});
  var intro=FILM&&T<tI;
  offcuts.forEach(function(O){if(intro)updateOffcut(O,st);else O.rib.mesh.visible=false;});
  arcs.forEach(function(A){A.rib.mesh.visible=intro&&st.arcOp>0.01;A.rib.mesh.material.opacity=st.arcOp*.85;A.rib.geo.setDrawRange(0,Math.round(A.quads*drawn(seqL(st.arc,cumArc,A.isA?0:1)))*6);if(A.isA)A.rib.mesh.position.x=st.a;else A.rib.mesh.position.y=st.b;});
  marks.forEach(function(M){M.rib.mesh.visible=intro&&st.markOp>0.01;M.rib.mesh.material.opacity=st.markOp*.85;M.rib.geo.setDrawRange(0,Math.round(M.quads*drawn(seqL(st.mark,cumCut,M.j)))*6);if(M.isA)M.rib.mesh.position.x=st.a;else M.rib.mesh.position.y=st.b;});
  updateHandle(st);
  H.updateMatrixWorld(true);
  updateTools(st);
}

/* ---- camera: keeps the paper in view; the viewer turns, zooms and moves it from there ---- */
var camC=new THREE.Vector3(),camD=20,camReady=false,v3=new THREE.Vector3(),dir=new THREE.Vector3(),right=new THREE.Vector3(),upv=new THREE.Vector3(),wantC=new THREE.Vector3(),bmin=new THREE.Vector3(),bmax=new THREE.Vector3();
function fitCamera(dt,st){
  var tl=clamp(tilt+0.42*st.stand,0.03,1.5);
  dir.set(Math.sin(tl)*Math.sin(yaw),-Math.sin(tl)*Math.cos(yaw),Math.cos(tl));
  right.crossVectors(cam.up,dir).normalize();upv.crossVectors(dir,right).normalize();
  var P=pos.array,e=meshes[0].matrixWorld.elements,n=P.length,i,x,y,z,wx,wy,wz;
  bmin.set(1e9,1e9,1e9);bmax.set(-1e9,-1e9,-1e9);
  for(i=0;i<n;i+=6){x=P[i];y=P[i+1];z=P[i+2];wx=e[0]*x+e[4]*y+e[8]*z+e[12];wy=e[1]*x+e[5]*y+e[9]*z+e[13];wz=e[2]*x+e[6]*y+e[10]*z+e[14];
    if(wx<bmin.x)bmin.x=wx;if(wx>bmax.x)bmax.x=wx;if(wy<bmin.y)bmin.y=wy;if(wy>bmax.y)bmax.y=wy;if(wz<bmin.z)bmin.z=wz;if(wz>bmax.z)bmax.z=wz;}
  var hp=handle.pos,he=handle.mesh.matrixWorld.elements,hn=handle.mesh.visible?hp.length:0;   /* the handle counts too once it is there */
  for(i=0;i<hn;i+=12){x=hp[i];y=hp[i+1];z=hp[i+2];wx=he[0]*x+he[4]*y+he[8]*z+he[12];wy=he[1]*x+he[5]*y+he[9]*z+he[13];wz=he[2]*x+he[6]*y+he[10]*z+he[14];
    if(wx<bmin.x)bmin.x=wx;if(wx>bmax.x)bmax.x=wx;if(wy<bmin.y)bmin.y=wy;if(wy>bmax.y)bmax.y=wy;if(wz<bmin.z)bmin.z=wz;if(wz>bmax.z)bmax.z=wz;}
  wantC.addVectors(bmin,bmax).multiplyScalar(0.5);
  var hw=0,hh=0,dep=0;
  for(i=0;i<hn;i+=12){x=hp[i];y=hp[i+1];z=hp[i+2];v3.set(he[0]*x+he[4]*y+he[8]*z+he[12],he[1]*x+he[5]*y+he[9]*z+he[13],he[2]*x+he[6]*y+he[10]*z+he[14]).sub(wantC);
    var a2=Math.abs(v3.dot(right)),b2=Math.abs(v3.dot(upv)),c2=v3.dot(dir);if(a2>hw)hw=a2;if(b2>hh)hh=b2;if(c2>dep)dep=c2;}
  for(i=0;i<n;i+=6){x=P[i];y=P[i+1];z=P[i+2];v3.set(e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],e[2]*x+e[6]*y+e[10]*z+e[14]).sub(wantC);
    var a=Math.abs(v3.dot(right)),b=Math.abs(v3.dot(upv)),c=v3.dot(dir);if(a>hw)hw=a;if(b>hh)hh=b;if(c>dep)dep=c;}
  var hpx=st_.clientHeight||1,fy=clamp(1-(padT+padB)/hpx,0.3,1);
  var tv=Math.tan(cam.fov*PI/360),wantD=Math.max(hh/(tv*fy),hw/(tv*cam.aspect),1.6/tv)*(1.1+0.22*Math.max(st.sci,st.pen))+dep,moving=false;
  if(!camReady){camC.copy(wantC);camD=wantD;camReady=true;}
  else{var k=1-Math.exp(-dt*3.2);if(camC.distanceTo(wantC)>0.004||Math.abs(camD-wantD)>0.004)moving=true;camC.lerp(wantC,k);camD=lerp(camD,wantD,k);}
  v3.copy(camC).add(pan).addScaledVector(upv,(padT-padB)*camD*zoom*tv/hpx);cam.position.copy(v3).addScaledVector(dir,camD*zoom);cam.lookAt(v3);cam.updateMatrixWorld();
  sun.target.position.set(camC.x,camC.y,0);sun.position.set(camC.x-5,camC.y-7,13);sun.target.updateMatrixWorld();
  return moving;
}
function caption(){var k=stepIndexAt(T);if(k===lastCh)return;lastCh=k;on.step(k);}
/* draw the moment T; dt is how much real time has passed, for the camera's easing (0 = jump) */
function show(dt){if(!B)return false;
  curState=stateAt(T);apply(curState);
  var moving=fitCamera(dt||0,curState);R.render(scene,cam);
  on.time(T,TOTAL);caption();
  return moving;}
function resize(){var w=st_.clientWidth,h=st_.clientHeight;if(!w||!h)return;R.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();if(B)show(0);else R.render(scene,cam);}
var ro=new ResizeObserver(resize);ro.observe(st_);
resize();

/* ---- transport ---- */
function setPlaying(p){if(playing===p)return;playing=p;on.playing(p);}
function toggle(){if(!B)return;if(T>=TOTAL-1e-3)T=0;setPlaying(!playing);}
function seek(t){if(!B)return;T=clamp(t,0,TOTAL);wake=60;}
function step(d){if(!B)return;var k=stepIndexAt(T);
  if(d<0){k=(T-stepStart[k]>1.2||k===0)?k:k-1;seek(stepStart[k]);}else{seek(k+1<steps.length?stepStart[k+1]:TOTAL);}}

/* ---- looking around ---- */
function nudge(){wake=40;}
function zoomBy(k){zoom=clamp(zoom*k,0.18,3);nudge();}
function panBy(dx,dy){var s=2*camD*zoom*Math.tan(cam.fov*PI/360)/st_.clientHeight;pan.addScaledVector(right,-dx*s).addScaledVector(upv,dy*s);pan.clampLength(0,8);nudge();}
function rotBy(dx,dy){yaw-=dx*0.008;tilt=clamp(tilt-dy*0.006,0.03,1.5);nudge();}
var ptrs={},pinch=0,mid=null;
function two(){var k=Object.keys(ptrs);if(k.length<2)return null;var a=ptrs[k[0]],b=ptrs[k[1]];return {d:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
cv.addEventListener('pointerdown',function(e){ptrs[e.pointerId]={x:e.clientX,y:e.clientY,pan:e.shiftKey||e.button===2||e.button===1};try{cv.setPointerCapture(e.pointerId);}catch(_){ }var t=two();if(t){pinch=t.d;mid=t;}});
cv.addEventListener('pointermove',function(e){var p=ptrs[e.pointerId];if(!p)return;var dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;var t=two();
  if(t){if(pinch>0&&t.d>0)zoomBy(pinch/t.d);panBy(t.x-mid.x,t.y-mid.y);pinch=t.d;mid=t;}else if(p.pan)panBy(dx,dy);else rotBy(dx,dy);});
function up(e){delete ptrs[e.pointerId];pinch=0;mid=null;}
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
cv.addEventListener('contextmenu',function(e){e.preventDefault();});
cv.addEventListener('wheel',function(e){if(!e.ctrlKey&&!e.metaKey&&document.fullscreenElement!==st_)return;e.preventDefault();zoomBy(Math.exp((e.deltaMode===1?e.deltaY*16:e.deltaY)*(e.ctrlKey?0.01:0.0015)));},{passive:false});
function resetView(){yaw=YAW0;tilt=TILT0;zoom=1;pan.set(0,0,0);nudge();}
cv.addEventListener('dblclick',resetView);
cv.addEventListener('keydown',function(e){var k=e.key,used=true;
  if(k==='ArrowLeft')rotBy(12,0);else if(k==='ArrowRight')rotBy(-12,0);else if(k==='ArrowUp')rotBy(0,12);else if(k==='ArrowDown')rotBy(0,-12);
  else if(k==='+'||k==='=')zoomBy(0.87);else if(k==='-'||k==='_')zoomBy(1.15);else if(k==='0')resetView();else if(k===' ')toggle();else used=false;if(used)e.preventDefault();});

/* ---- loop: draw only while playing, while the camera is still settling, or just after the view changed ---- */
var last=0,raf=0;function loop(now){if(gone)return;var dt=Math.min(0.1,(now-last)/1000||0);last=now;
  if(B){if(playing){T+=dt*speed;if(T>=TOTAL){T=TOTAL;setPlaying(false);wake=60;}show(dt);}else if(wake>0){wake--;if(show(dt)&&wake<2)wake=2;}}
  raf=requestAnimationFrame(loop);}
raf=requestAnimationFrame(loop);

/* ---- what the page gets ---- */
return {
  /* a .jhb as an ArrayBuffer -> the film's steps, when each starts and how long it all is (seconds) */
  open:function(buf){return (buf instanceof ArrayBuffer?parse(buf):Promise.resolve(buf)).then(function(hd){if(gone)return null;build(hd);
    return {steps:steps.map(function(s,i){return {id:s.id||'',tag:s.tag||'',n:s.n||null,straight:!!s.straight,title:s.t,text:s.x,start:stepStart[i]};}),total:TOTAL,weave:[tI,tW],stats:hd.stats||{}};});},
  toggle:toggle,
  play:function(p){if(B){if(p&&T>=TOTAL-1e-3)T=0;setPlaying(!!p);}},
  seek:function(t){setPlaying(false);seek(t);},
  step:step,
  speed:function(v){speed=v;},
  zoom:zoomBy,
  reset:resetView,
  insets:function(top,bottom){padT=top;padB=bottom;wake=40;},
  /* the two papers' colours, 0xRRGGBB, changed while the film is open */
  papers:papers,
  /* for tests: jump to a moment and draw it at once */
  set:function(t){T=clamp(t,0,TOTAL);camReady=false;show(0);},
  destroy:function(){gone=true;cancelAnimationFrame(raf);ro.disconnect();clear();R.dispose();R.forceContextLoss();}
};
}
