"""The trained network's maps for masks: OUT_DIR/<id>.pred.json with hidden (probability), dir (the
doubled angle, two channels) and switch (probability), N x N, rows from the top.
python predict.py MODEL.pt OUT_DIR MASK.json..."""
import json, os, sys
import numpy as np, torch
sys.path.insert(0, os.path.dirname(__file__))
import train
from labels import N

model_path, out_dir, *masks = sys.argv[1:]
ck = torch.load(model_path, map_location='cpu')
net = train.TimmUNet(ck['encoder'], pretrained=False, out=ck['model']['head.weight'].shape[0]) if ck.get('encoder') else train.UNet()
net.load_state_dict(ck['model']); net.eval()
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / (N - 1)
for path in masks:
    m = json.load(open(path)); size = m['size']
    a = np.asarray(m['data'], np.float32).reshape(size, size)
    edges = np.floor(np.linspace(0, size, N + 1)).astype(int)
    small = np.add.reduceat(np.add.reduceat(a, edges[:-1], 0), edges[:-1], 1) / np.outer(np.diff(edges), np.diff(edges))
    x = torch.from_numpy(np.stack([small, xx, yy]).astype(np.float32))[None]
    with torch.no_grad():
        o = net(x)[0]
    pred = {'size': N, 'hidden': torch.sigmoid(o[6]).flatten().numpy().round(4).tolist(),
            'switch': torch.sigmoid(o[5]).flatten().numpy().round(4).tolist(),
            'dir': torch.tanh(o[7:9]).flatten(1).numpy().round(3).tolist(),
            # paper A's share of the two papers (where a visible cut runs), and the visible cut itself
            'paperA': torch.softmax(o[2:4], 0)[0].flatten().numpy().round(3).tolist(),
            'visible': torch.sigmoid(o[0]).flatten().numpy().round(3).tolist()}
    if o.shape[0] > 9: pred['clean'] = torch.sigmoid(o[9]).flatten().numpy().round(3).tolist()
    name = os.path.basename(path).replace('.mask.json', '')
    json.dump(pred, open(os.path.join(out_dir, name + '.pred.json'), 'w'))
    print(name, 'hidden max', round(float(max(pred['hidden'])), 3), 'switch max', round(float(max(pred['switch'])), 3))
