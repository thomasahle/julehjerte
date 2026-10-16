"""Generate a training-only notch-occlusion pilot, preserving latent geometry."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from data import checked_asset, digest, project
from foreground import ForegroundCorpus, physical_foreground
from occlusion import composite, ribbon_coverage, ribbon_polygon, ribbon_spec, training_rows, visibility_labels


def asset(root, path):
    return {'path': str(path.relative_to(root)), 'sha256': digest(path.read_bytes())}


def generate(plan_path, output):
    plan_raw = plan_path.read_bytes(); plan = json.loads(plan_raw)
    if plan.get('schema') != 'foreground-occlusion-pilot-plan-1' or plan.get('status') != 'declared-before-generation':
        raise ValueError('Require the declared occlusion pilot plan')
    training_report = Path(plan['sourceTrainingReport'])
    if digest(training_report.read_bytes()) != plan['sourceTrainingReportSha256']:
        raise ValueError('Changed source training report')
    sources = plan['sourceDatasets']
    corpus = ForegroundCorpus([s['dataset'] for s in sources], [s['foreground'] for s in sources])
    if corpus.sources != sources:
        raise ValueError('Changed source manifests')
    rows = training_rows(corpus, 16)
    output.mkdir(parents=True, exist_ok=False)
    records = []
    for index, row in enumerate(rows):
        item = corpus.load(row)  # Verify original body, camera, photo and split.
        labels = item['labels']; n = labels['resolution']
        source = json.loads((row['parentRoot']/'manifest.json').read_text())
        view = next(v for v in source['views'] if v['id'] == row['id'])
        design = next(d for d in source['baseDesigns'] if d['id'] == row['designId'])
        # Verify every latent reference, not just the RGB being composited.
        for reference in [*view['assets'].values(), *design['assets'].values()]:
            checked_asset(row['parentRoot'], reference)
        source_rgb = np.asarray(Image.open(item['photo']).convert('RGB'))
        support_file = checked_asset(row['parentRoot'], view['assets']['photo-overlap-valid.png'])
        support = np.asarray(Image.open(support_file).convert('L'), dtype=np.float32)/255
        if source_rgb.shape != (n, n, 3) or support.shape != (n, n):
            raise ValueError('Source image/support dimensions disagree')
        spec = ribbon_spec(row['geometrySha256'])
        coverage = ribbon_coverage(labels, spec)
        fields = visibility_labels(physical_foreground(labels), support, coverage)
        hidden = float(fields['occludedBody'].sum())
        hidden_material = float((support*coverage).sum())
        notch = project(labels['canonicalToPhoto'], [[0, 0]])[0]
        nx, ny = np.floor(notch).astype(int)
        if not (0 <= nx < n and 0 <= ny < n and coverage[ny, nx] >= .9 and hidden > 10 and hidden_material > 10):
            raise ValueError('Ribbon did not cover the notch and overlap paper')
        folder = output/f'{index:02d}-{row["geometrySha256"][:12]}'; folder.mkdir()
        Image.fromarray(composite(source_rgb, coverage, spec['rgb'])).save(folder/'photo.png')
        np.savez_compressed(folder/'visibility.npz', **fields)
        reference = {'sourceView': row['key'], 'sourcePhoto': row['photo'], 'sourceLabels': row['labels'],
                     'geometrySha256': row['geometrySha256'], 'experimentalSplit': row['experimentalSplit'],
                     'parentRoot': str(row['parentRoot']), 'sourceViewAssets': view['assets'],
                     'sourceDesignAssets': design['assets'], 'cameraLabels': labels,
                     'ribbon': spec, 'supersample': 8,
                     'semantics': 'Latent cuts and binary body unchanged; fractional foreground coverage masks observation. PNG previews are quantized; NPZ fields are authoritative.'}
        (folder/'labels.json').write_text(json.dumps(reference, indent=2)+'\n')
        panel = Image.new('RGB', (6*256, 286), 'white'); draw = ImageDraw.Draw(panel)
        previews = [('Original', Image.fromarray(source_rgb)), ('Foreground ribbon', Image.open(folder/'photo.png')),
                    *[(title, Image.fromarray(np.rint(fields[field]*255).astype(np.uint8)).convert('RGB'))
                      for title, field in [('Visible paper', 'visibleBody'), ('Hidden paper', 'occludedBody'),
                                           ('Complete paper', 'amodalBody'), ('Observed material', 'materialObservation')]]]
        for column, (title, picture) in enumerate(previews):
            panel.paste(picture.resize((256, 256)), (column*256, 30))
            draw.text((column*256+5, 5), title, fill='black')
        panel.save(folder/'panel.png')
        records.append({'id': row['key'], 'geometrySha256': row['geometrySha256'],
                        'experimentalSplit': row['experimentalSplit'], 'familyId': row['familyId'],
                        'hiddenBodyPixels': hidden, 'hiddenMaterialPixels': hidden_material,
                        'fractionalOccluderPixels': int(((coverage > 0) & (coverage < 1)).sum()),
                        'notchPhoto': notch.tolist(),
                        'ribbonPolygonPhoto': project(labels['canonicalToPhoto'], ribbon_polygon(spec)).tolist(),
                        'assets': {name: asset(output, folder/name) for name in ['photo.png', 'visibility.npz', 'labels.json', 'panel.png']}})
    module_root = Path(__file__).parent
    manifest = {'schema': 'woven-heart-foreground-occlusion-pilot-1', 'status': 'generated',
                'plan': str(plan_path), 'planSha256': digest(plan_raw), 'sources': sources,
                'sourceHashes': {name: digest((module_root/name).read_bytes()) for name in
                                 ['foreground-occlusion.py', 'occlusion.py', 'foreground.py', 'data.py']},
                'sourceGeometries': len(rows), 'augmentedViews': len(records), 'rows': records,
                'trainingPerformed': False, 'visualReview': 'pending',
                'limitations': ['Selected procedural training recipes only; no evidence of real-photo generalization.',
                                'Raster-composited planar ribbons; no calibrated depth, shadows, bending or sensor blur.',
                                'Original binary physical body remains the latent target; its rasterization is unchanged.',
                                'Unobserved material references must not become visible supervision.']}
    (output/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps({'output': str(output), 'views': len(records), 'status': manifest['status']}))


def verify(plan_path, output):
    manifest = json.loads((output/'manifest.json').read_text())
    plan_raw = plan_path.read_bytes(); plan = json.loads(plan_raw)
    if manifest['planSha256'] != digest(plan_raw) or manifest['sources'] != plan['sourceDatasets']:
        raise ValueError('Changed plan or source identity')
    if digest(Path(plan['sourceTrainingReport']).read_bytes()) != plan['sourceTrainingReportSha256']:
        raise ValueError('Changed source training report')
    for name, sha in manifest['sourceHashes'].items():
        if digest((Path(__file__).parent/name).read_bytes()) != sha:
            raise ValueError('Changed implementation: '+name)
    sources = plan['sourceDatasets']
    corpus = ForegroundCorpus([s['dataset'] for s in sources], [s['foreground'] for s in sources])
    if corpus.sources != sources:
        raise ValueError('Changed source manifests')
    expected = training_rows(corpus, 16)
    if [r['id'] for r in manifest['rows']] != [r['key'] for r in expected]:
        raise ValueError('Changed training selection')
    source_assets, output_assets = set(), set()
    hidden_fractions = []
    for record, row in zip(manifest['rows'], expected):
        item = corpus.load(row)
        files = {name: checked_asset(output, ref) for name, ref in record['assets'].items()}
        output_assets.update(str(p) for p in files.values())
        labels = json.loads(files['labels.json'].read_text())
        parent = json.loads((row['parentRoot']/'manifest.json').read_text())
        view = next(v for v in parent['views'] if v['id'] == row['id'])
        design = next(d for d in parent['baseDesigns'] if d['id'] == row['designId'])
        if (labels['cameraLabels'] != item['labels'] or labels['geometrySha256'] != item['geometrySha256'] or
                labels['sourceView'] != row['key'] or labels['experimentalSplit'] != 'train' or
                record['experimentalSplit'] != 'train' or record['geometrySha256'] != item['geometrySha256'] or
                labels['sourceViewAssets'] != view['assets'] or labels['sourceDesignAssets'] != design['assets'] or
                labels['ribbon'] != ribbon_spec(item['geometrySha256'])):
            raise ValueError('Changed latent geometry, camera, selection or intervention')
        for reference in [*view['assets'].values(), *design['assets'].values()]:
            source_assets.add(str(checked_asset(row['parentRoot'], reference)))
        coverage = ribbon_coverage(item['labels'], labels['ribbon'], labels['supersample'])
        support = np.asarray(Image.open(checked_asset(row['parentRoot'], view['assets']['photo-overlap-valid.png'])).convert('L'), dtype=np.float32)/255
        amodal = physical_foreground(item['labels']).astype(np.float32)
        with np.load(files['visibility.npz'], allow_pickle=False) as fields:
            np.testing.assert_array_equal(fields['amodalBody'], amodal)
            np.testing.assert_array_equal(fields['sourceMaterialSupport'], support)
            np.testing.assert_array_equal(fields['occluderCoverage'], coverage)
            np.testing.assert_array_equal(fields['visibleBody']+fields['occludedBody'], amodal)
            np.testing.assert_array_equal(fields['occludedBody'], amodal*coverage)
            np.testing.assert_array_equal(fields['materialObservation'], support*(1-coverage))
            hidden_fractions.append(float(fields['occludedBody'].sum()/amodal.sum()))
            if (float(fields['occludedBody'].sum()) != record['hiddenBodyPixels'] or
                    float((support*coverage).sum()) != record['hiddenMaterialPixels'] or
                    int(((coverage > 0) & (coverage < 1)).sum()) != record['fractionalOccluderPixels']):
                raise ValueError('Changed visibility counts')
        original = np.asarray(Image.open(item['photo']).convert('RGB'))
        observed = np.asarray(Image.open(files['photo.png']).convert('RGB'))
        np.testing.assert_array_equal(observed, composite(original, coverage, labels['ribbon']['rgb']))
        np.testing.assert_array_equal(observed[coverage == 0], original[coverage == 0])
        np.testing.assert_array_equal(record['notchPhoto'], project(item['labels']['canonicalToPhoto'], [[0, 0]])[0])
        nx, ny = np.floor(record['notchPhoto']).astype(int)
        if coverage[ny, nx] < .9 or record['hiddenBodyPixels'] <= 10 or record['hiddenMaterialPixels'] <= 10:
            raise ValueError('Missing notch or material occlusion')
    report = {'status': 'passed', 'manifestSha256': digest((output/'manifest.json').read_bytes()),
              'sourceGeometries': len(expected), 'augmentedViews': len(manifest['rows']),
              'sourceAssetsVerified': len(source_assets), 'outputAssetsVerified': len(output_assets),
              'hiddenBodyFraction': {'minimum': min(hidden_fractions), 'maximum': max(hidden_fractions)},
              'trainingPerformed': False, 'visualReview': 'separate-required',
              'checks': ['Exact declared experimental training selection; no development or recipe holdouts.',
                         'Original camera, cutting geometry and source assets unchanged.',
                         'Projected foreground coverage, visible/hidden partition and material observation agree.',
                         'Every ribbon covers the notch and some overlap paper.',
                         'PNG compositing reproduces exactly; uncovered RGB pixels are unchanged.']}
    (output/'verification.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    (verify if args.verify else generate)(args.plan, args.output)
