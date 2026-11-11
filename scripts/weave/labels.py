import sys, numpy as np
d=np.load(sys.argv[1],allow_pickle=True); L=list(d['labels']); prev=None; out=[]
for i,l in enumerate(L):
    if l!=prev: out.append('%d %s'%(i,l)); prev=l
print(' | '.join(out[int(sys.argv[2]) if len(sys.argv)>2 else 0:][:int(sys.argv[3]) if len(sys.argv)>3 else 60])); print('total',len(L))
