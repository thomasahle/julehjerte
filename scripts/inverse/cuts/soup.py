"""Two checkpoints' weights averaged (a model soup): (1 - a) * A + a * B, other entries from A.
python soup.py A.pt B.pt a OUT.pt"""
import sys, torch
A, B, a, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
ca, cb = torch.load(A, map_location='cpu'), torch.load(B, map_location='cpu')
sd = {k: ((1 - a) * v + a * cb['model'][k]) if v.is_floating_point() else v for k, v in ca['model'].items()}
torch.save({**ca, 'model': sd}, out)
print('soup', A, B, a, '->', out)
