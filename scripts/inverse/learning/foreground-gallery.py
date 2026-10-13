"""Render a review gallery without changing frozen inputs, predictions or scores."""
import argparse
import html
import json
import os
from pathlib import Path

from PIL import Image, ImageOps

from data import checked_asset, digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--probe', required=True)
    parser.add_argument('--replay', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    probe, replay, out = [Path(p).resolve() for p in [args.probe, args.replay, args.output]]
    manifest = json.loads((probe/'manifest.json').read_text()); report = json.loads((replay/'report.json').read_text())
    if manifest['status'] != 'complete' or report['status'] != 'complete' or digest((probe/'manifest.json').read_bytes()) != report['probeManifestSha256']:
        raise ValueError('Require matching completed probe and replay')
    out.mkdir(parents=True, exist_ok=False)
    rows = {(r['id'], r['method']): r for r in report['rows']}
    audit = {'sourceSha256': digest(Path(__file__).read_bytes()), 'probeManifestSha256': digest((probe/'manifest.json').read_bytes()), 'replayReportSha256': digest((replay/'report.json').read_bytes()),
             'displayConvention': 'Paper A is dark in both classified-mask and woven-result previews. Only display copies of binary masks are inverted; frozen source assets and scores are unchanged.', 'maskDisplays': []}
    escape = html.escape
    content = ['<!doctype html><html lang="en"><meta charset="utf-8"><title>Frozen foreground replay</title><style>body{font:14px system-ui;margin:24px;background:#f4f4f0;color:#222}article{margin:24px 0;border-top:1px solid #bbb;padding-top:12px}.panels{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;width:220px}img{display:block;width:220px;height:220px;object-fit:contain;background:#ddd}figcaption{padding:5px 0}h1{font-size:24px}p{max-width:1000px}</style><h1>RGB foreground model: frozen end-to-end replay</h1><p>Offline experiment; application unchanged. Real photographs were excluded from training. Production can keep weak proposals for adjustment; the learned palette adapter requires both supported lobes and lower edges. Per-case outcomes are shown below. Perfect foreground is an oracle control, never a model input. Mask and woven previews both show paper A as dark.</p>']
    def panel(file, label):
        content.append(f'<figure><img src="{escape(os.path.relpath(file, out))}" alt="{escape(label)}"><figcaption>{escape(label)}</figcaption></figure>')
    for item in manifest['rows']:
        ident = item['id']; content.append(f'<article data-case="{escape(ident)}"><h2>{escape(ident)}</h2><div class="panels">')
        for name, label in [('input.png', 'Network RGB input'), ('probability.png', 'Foreground probability')]:
            panel(probe/ident/name, label)
        for method in ['production', 'learned', 'oracle']:
            row = rows.get((ident, method))
            if row is None: continue
            for name in ['source.png', 'crop.png', 'mask.png', 'woven.png']:
                if name not in row['assets']: continue
                file = checked_asset(replay, row['assets'][name])
                label = f'{method}: {name}; {row["status"]}'
                if name == 'mask.png':
                    # The frozen numerical-mask PNG encodes A=255; resvg's
                    # exported weave uses A=black. Align only the display copy.
                    original = Image.open(file).convert('RGB')
                    display = out/(ident+'-'+method+'-mask-display.png')
                    ImageOps.invert(original).save(display)
                    audit['maskDisplays'].append({'sourceSha256': row['assets'][name]['sha256'], 'display': display.name,
                                                  'sha256': digest(display.read_bytes()), 'operation': '255 minus each RGB channel'})
                    file = display; label = f'{method}: classified mask (dark=A); {row["status"]}'
                panel(file, label)
        content.append('</div></article>')
    content.append('</html>'); (out/'index.html').write_text(''.join(content))
    audit['gallerySha256'] = digest((out/'index.html').read_bytes())
    (out/'manifest.json').write_text(json.dumps(audit, indent=2)+'\n')
    print(json.dumps({'cases': len(manifest['rows']), 'maskDisplays': len(audit['maskDisplays'])}))


if __name__ == '__main__': main()
