"""A small replay pack for fine-tuning: COUNT rows drawn from the given packs in proportion to WEIGHTS, after
train.py's --keep and --drop filters (2026-11-06: train.py over all nine packs, 12 GB memory-mapped, reached a
12 GB footprint and made the machine slow; a fine-tune needs only a sample of the old data beside the new).
python replay.py OUT COUNT KEEP DROP WEIGHTS PACK.npy..."""
import json, re, sys
import numpy as np
out, count, keep, drop, weights, *packs = sys.argv[1:]
count, weights = int(count), [float(w) for w in weights.split(',')]
base_id = lambda name: re.sub(r'(-w\d+-\d+)?(-(mx|my|r180|tr|atr|r90|r270))?$', '', name)
rx, gone, rng = re.compile(keep), set(open(drop).read().split()), np.random.default_rng(1)
picks = []
for p, w in zip(packs, weights):
    names = json.load(open(p[:-4] + '.json'))
    rows = [r for r, n in enumerate(names) if rx.match(n) and base_id(n) not in gone]
    n = min(len(rows), round(count * w / sum(weights)))
    picks += [(p, r, names[r]) for r in sorted(rng.choice(rows, n, replace=False))]
    print(p, len(rows), 'kept,', n, 'drawn', flush=True)
first = np.load(packs[0], mmap_mode='r')
arr = np.lib.format.open_memmap(out + '.npy', mode='w+', dtype=np.float16, shape=(len(picks),) + first.shape[1:])
for p in packs:
    a = np.load(p, mmap_mode='r')
    for i, (q, r, _) in enumerate(picks):
        if q == p: arr[i] = a[r]
    del a
arr.flush()
json.dump([n for _, _, n in picks], open(out + '.json', 'w'))
print('replay', arr.shape)
