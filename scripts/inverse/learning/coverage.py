"""Audit visible canonical junction types without reading evaluation photos."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import numpy as np

from data import Corpus, bezier, checked_asset, digest, training_supplements


def junction_types(graph):
    directions = defaultdict(list)
    for edge in graph['edges']:
        if not edge['visible']: continue
        curve = edge['cubic']
        for endpoint, t in [(0, .01), (3, .99)]:
            anchor = np.asarray(curve[endpoint])
            vector = bezier(curve, t)-anchor
            length = np.linalg.norm(vector)
            if length > 1e-10: directions[tuple(round(x, 5) for x in anchor)].append(vector/length)
    result = Counter()
    for vectors in directions.values():
        if len(vectors) >= 3:
            result['branch'] += 1
        elif len(vectors) == 2:
            angle = float(np.rad2deg(np.arccos(np.clip(np.dot(*vectors), -1, 1))))
            if angle < 160:
                result['right' if abs(angle-90) <= 5 else 'acute' if angle < 85 else 'obtuse'] += 1
    return dict(result)


def summarize(corpus, design_ids):
    total = Counter(); rows = []
    for key in sorted(design_ids):
        design = corpus.designs[key]
        graph = json.loads(checked_asset(corpus.dataset, design['assets']['graph.json']).read_text())
        counts = junction_types(graph); total.update(counts)
        rows.append({'id': key, 'geometrySha256': design['geometrySha256'], 'counts': counts})
    return {'designs': len(rows), 'counts': dict(total), 'rows': rows}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepared', default='tmp/heart-learning/prepared-v1')
    parser.add_argument('--extra-prepared', action='append', default=[])
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    base = Corpus(args.prepared)
    extras = training_supplements(base, [Corpus(p) for p in args.extra_prepared])
    report = {'schema': 'canonical-junction-coverage-1', 'preparedManifestSha256': digest((base.root/'manifest.json').read_bytes()),
              'scope': 'Visible canonical geometry before photographic projection. Degree-two turns under 20 degrees are excluded; right angle is 90 +/- 5 degrees.',
              'base': {s: summarize(base, [key for key, split in base.split.items() if split == s]) for s in sorted(set(base.split.values()))},
              'supplements': [{'prepared': str(x['corpus'].root),
                              'preparedManifestSha256': digest((x['corpus'].root/'manifest.json').read_bytes()),
                              **summarize(x['corpus'], x['designs'])} for x in extras]}
    destination = Path(args.output); destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('x') as file: json.dump(report, file, indent=2); file.write('\n')
    print(json.dumps({'base': {s: r['counts'] for s, r in report['base'].items()},
                      'supplements': [x['counts'] for x in report['supplements']]}))
