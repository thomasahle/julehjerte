"""Independent analytic heart renderer; known projective corners, no locator code."""
import numpy as np,cv2,json
from PIL import Image
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'inputs/synthetic';out.mkdir(exist_ok=True)
rng=np.random.default_rng(718203)
manifest=[]
w,h=460,440;yy,xx=np.mgrid[:h,:w]
for k in range(32):
 angle=rng.uniform(-.15,.15);s=rng.uniform(.82,1.12)
 q=np.array([[225,92],[370,233],[225,374],[80,233]],np.float32)
 rot=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
 q=(q-[225,233])@rot.T*s+[225,233]+rng.uniform(-6,6,(4,2))
 H=cv2.getPerspectiveTransform(q.astype(np.float32),np.array([[0,0],[1,0],[1,1],[0,1]],np.float32))
 blue=k%2==0;background=np.array([165,199,208] if blue else [96,79,62],float)
 paperA=np.array([192,18,37],float);paperB=np.array([243,239,232],float)
 if k%3==0:paperA,paperB=paperB,paperA
 image=np.zeros((h,w,3))
 for dx,dy in [(a,b) for a in [.25,.75] for b in [.25,.75]]:
  div=H[2,0]*(xx+dx)+H[2,1]*(yy+dy)+1
  u=(H[0,0]*(xx+dx)+H[0,1]*(yy+dy)+H[0,2])/div;v=(H[1,0]*(xx+dx)+H[1,1]*(yy+dy)+H[1,2])/div
  square=(u>=0)&(u<=1)&(v>=0)&(v<=1)
  top=(v<0)&((u-.5)**2+v*v<=.25)
  left=(u<0)&(u*u+(v-.5)**2<=.25)
  n=3+(k%5);p=((np.floor(u*n).astype(int)+np.floor(v*n).astype(int))%2==0)
  fg=square|top|left;acol=(square&p)|left
  colors=np.where(acol[...,None],paperA,paperB)
  bg=np.broadcast_to(background,(h,w,3)).copy()
  if k>=16:
   shade=.92+.08*xx/w+0.045*np.sin(yy/28)
   colors*=shade[...,None];bg*=shade[...,None]
  image+=np.where(fg[...,None],colors,bg)/4
 if k>=16:image=cv2.GaussianBlur(image,(0,0),1.2)+rng.normal(0,1.8,image.shape)
 # Four deliberate partial/cropped/obscured examples: do not score them as intact originals.
 kind='clean' if k<16 else 'blur_and_lighting'
 if k>=28:
  image[0:round(q[0,1])+10,215:229]=[183,20,40]
  if k%2:image[180:270,310:460]=[180,23,40];kind='occluded'
  else:kind='handle'
 path=out/f'{k:02d}.png';im=Image.fromarray(np.uint8(np.clip(image,0,255))).convert('RGBA');im.save(path);(out/f'{k:02d}.rgba').write_bytes(im.tobytes())
 manifest.append(dict(id=f'{k:02d}',width=w,height=h,quad=q.tolist(),kind=kind))
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
