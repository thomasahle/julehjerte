"""The trained network as ONNX (opset 17, as the site's photo model), input (1, 3, N, N): mask, x, y;
output (1, 9, N, N) logits as train.py's head.
  python export.py MODEL.pt OUT.onnx [--fp16] [--install]
--fp16 also writes OUT-fp16.onnx: the weights as float16, input and output float32 (what the site loads, 9.5 MB;
needs onnx and onnxconverter-common). --install (implies --fp16) copies that into static/inverse/neural as
cuts-<the first 8 hex digits of its sha256>.onnx and points neural/cuts.js at it (CUTS_MODEL_SHA256 and the
URL); the old model file is left there for `git rm`."""
import argparse, hashlib, os, re, shutil, sys
import torch
sys.path.insert(0, os.path.dirname(__file__))
import train
ap = argparse.ArgumentParser()
ap.add_argument('model'); ap.add_argument('out')
ap.add_argument('--fp16', action='store_true'); ap.add_argument('--install', action='store_true')
a = ap.parse_args()
ck = torch.load(a.model, map_location='cpu')
net = train.TimmUNet(ck['encoder'], pretrained=False, out=ck['model']['head.weight'].shape[0]) if ck.get('encoder') else train.UNet()
net.load_state_dict(ck['model']); net.eval()
x = torch.zeros(1, 3, train.N, train.N)
torch.onnx.export(net, (x,), a.out, opset_version=17, input_names=['picture'], output_names=['maps'], dynamo=False)
print('exported', a.out, os.path.getsize(a.out), 'bytes')
if a.fp16 or a.install:
    import onnx
    from onnxconverter_common import float16
    half = re.sub(r'(\.onnx)?$', '-fp16.onnx', a.out, count=1)
    onnx.save(float16.convert_float_to_float16(onnx.load(a.out), keep_io_types=True), half)
    with open(half, 'rb') as f: digest = hashlib.sha256(f.read()).hexdigest()
    print('float16', half, os.path.getsize(half), 'bytes, sha256', digest)
    if a.install:
        neural = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../static/inverse/neural'))
        name, js = f'cuts-{digest[:8]}.onnx', os.path.join(neural, 'cuts.js')
        shutil.copyfile(half, os.path.join(neural, name))
        s = open(js).read()
        old = re.search(r"new URL\('\./(cuts-[0-9a-f]{8}\.onnx)'", s).group(1)
        s, n1 = re.subn(r"CUTS_MODEL_SHA256='[0-9a-f]{64}'", f"CUTS_MODEL_SHA256='{digest}'", s)
        s, n2 = re.subn(r"new URL\('\./cuts-[0-9a-f]{8}\.onnx'", f"new URL('./{name}'", s)
        assert n1 == 1 and n2 == 1, 'neural/cuts.js: its checksum and model URL not found once each'
        open(js, 'w').write(s)
        print('installed', os.path.join(neural, name), '(neural/cuts.js updated); the old model:', 'the same' if old == name else old)
