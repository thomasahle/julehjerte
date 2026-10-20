"""Check fixed-path continuations independently of their optimizer objects."""
import argparse
import copy
import hashlib
import json
from pathlib import Path


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def pinned(reference, root=Path('.')):
    file = root/reference['path']
    raw = file.read_bytes()
    assert digest(raw) == reference['sha256'], str(file)
    return raw


def topology(data):
    """Ignore curve names/orientation, retaining every shared occurrence."""
    names, first_reverse, paths = {}, {}, []
    for family in [data['A_overlap_paths'], data['B_overlap_paths']]:
        group = []
        for path in family:
            chain = []
            for entry in path:
                name = entry['curve']
                assert name in data['curves']
                if name not in names:
                    names[name] = len(names)
                    first_reverse[name] = entry['reverse']
                chain.append([names[name], entry['reverse'] != first_reverse[name]])
            group.append(chain)
        paths.append(group)
    return [data['square_width_mm'], data['phase'], paths]


def directed_controls(data):
    return [point for family in [data['A_overlap_paths'], data['B_overlap_paths']]
            for path in family for entry in path
            for point in (list(reversed(data['curves'][entry['curve']]['control_points']))
                          if entry['reverse'] else data['curves'][entry['curve']]['control_points'])]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    raw = (args.run/'report.json').read_bytes()
    run = json.loads(raw)
    assert run['status'] == 'complete' and run['experiment'] == 'native-confidence-refinement-1'
    parent = json.loads(pinned(run['seedPipeline']))
    parent_root = Path(run['seedPipeline']['path']).parent
    for file, expected in run['sourceHashes'].items():
        assert digest(Path(file).read_bytes()) == expected, file
    rows, split_control, rename_control = [], False, False
    for identity in dict.fromkeys(r['id'] for r in run['rows']):
        pair = [next(r for r in run['rows'] if r['id'] == identity and r['method'] == method)
                for method in run['methods']]
        if pair[0]['status'] == 'crop-unresolved':
            assert all(r['status'] == 'crop-unresolved' for r in pair)
            rows.append({'id': identity, 'status': 'crop-unresolved'})
            continue
        seed = next(r for r in parent['rows'] if r['id'] == identity and r['method'] == pair[0]['seedMethod'])
        seed_raw = pinned(seed['assets']['cut_geometry.json'], parent_root)
        original = json.loads(seed_raw)
        signature, controls = topology(original), directed_controls(original)
        outcomes = {}
        for row in pair:
            assert pinned(row['assets']['seed_geometry.json'], args.run) == seed_raw
            assert row['seed']['geometrySha256'] == digest(seed_raw)
            assert row['targetMaskSha256'] == seed['targetMaskSha256']
            assert row['selectedCrop'] == seed['selectedCrop']
            assert row['observedPixels'] == seed['observedPixels']
            assert row['report']['settings'] == seed['report']['settings']
            assert row['seed']['configurationSha256'] == pair[0]['seed']['configurationSha256']
            candidate = json.loads(pinned(row['assets']['cut_geometry.json'], args.run))
            assert topology(candidate) == signature, (identity, row['method'])
            after = directed_controls(candidate)
            assert len(after) == len(controls)
            solver = row['report']['solver']
            assert solver['steps'] == solver['computedSteps'] == 160 and solver['skippedSteps'] == 0
            outcomes[row['method']] = {
                'curveOccurrences': len(controls)//4,
                'uniqueCurves': len(candidate['curves']),
                'movedControlOccurrences': sum(a != b for a, b in zip(controls, after)),
                'maximumControlDisplacementMm': max(
                    ((a[0]-b[0])**2+(a[1]-b[1])**2)**.5 for a, b in zip(controls, after)),
                'steps': solver['computedSteps'],
            }
        # Negative control: duplicating one shared edge leaves its coordinates
        # unchanged, but must not count as preserving the shared parameter.
        if not split_control:
            altered = copy.deepcopy(original)
            occurrences = {}
            for family in [altered['A_overlap_paths'], altered['B_overlap_paths']]:
                for path in family:
                    for entry in path:
                        occurrences.setdefault(entry['curve'], []).append(entry)
            shared = next((items for items in occurrences.values() if len(items) > 1), None)
            if shared:
                name = shared[0]['curve']
                altered['curves']['split-control'] = copy.deepcopy(altered['curves'][name])
                shared[0]['curve'] = 'split-control'
                assert directed_controls(altered) == controls
                assert topology(altered) != signature
                split_control = True
        if not rename_control:
            altered = copy.deepcopy(original)
            names = {name: 'renamed-'+name for name in altered['curves']}
            altered['curves'] = {names[name]: data for name, data in altered['curves'].items()}
            for family in [altered['A_overlap_paths'], altered['B_overlap_paths']]:
                for path in family:
                    for entry in path:
                        entry['curve'] = names[entry['curve']]
            assert topology(altered) == signature
            rename_control = True
        rows.append({'id': identity, 'status': 'complete', 'methods': outcomes})
    assert split_control and rename_control
    result = {
        'schema': 'native-confidence-refinement-audit-1', 'status': 'complete',
        'run': {'path': str(args.run/'report.json'), 'sha256': digest(raw)},
        'source': {'path': __file__, 'sha256': digest(Path(__file__).read_bytes())},
        'sharedEdgeSplitNegativeControlPassed': split_control,
        'renamedCurveControlPassed': rename_control,
        'scope': 'Every declared case. Same original seed bytes, cut counts, ordered shared-curve occurrences, '
                 'phase, crop, mask, observation count and recorded 160-step work. This structural check '
                 'does not replace independent geometry, paper or image validation.',
        'rows': rows,
    }
    with args.output.open('x') as file:
        file.write(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'photos': len(rows), 'continuedPairs': sum(r['status'] == 'complete' for r in rows)}))


if __name__ == '__main__':
    main()
