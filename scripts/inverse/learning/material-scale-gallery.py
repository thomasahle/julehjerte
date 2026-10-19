"""Review paired fields on all source photos, without changing predictions."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from real_materials_learning import ROOT
import sys
sys.path.insert(0, str(ROOT/'scripts/inverse/datasets'))
from real_annotations import photo_tensor


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    args = parser.parse_args()
    report = json.loads((args.run/'report.json').read_bytes())
    assert report['status'] == 'complete'
    probe = ROOT/report['plan']['probe']
    manifest = json.loads((probe/'manifest.json').read_bytes())
    sources = {r['id']: r for r in manifest['rows']}
    metrics = {size: {r['id']: r for r in values['rows']} for size, values in report['metrics'].items()}
    def field(base, asset, n):
        raw = (base/asset['path']).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == asset['sha256']
        return np.frombuffer(raw, dtype='<f4').reshape(n,n)
    columns = ['Source photo', 'Body 256', 'Body 512', 'Paper 256', 'Paper 512']
    output = args.run/'gallery'; output.mkdir(exist_ok=True)
    for start in range(0,len(report['rows']),4):
        rows = report['rows'][start:start+4]
        panel = Image.new('RGB',(5*256,32+len(rows)*288),'white'); draw = ImageDraw.Draw(panel)
        for col, title in enumerate(columns): draw.text((col*256+5,8),title,fill='black')
        for index,row in enumerate(rows):
            identity = row['id']; source = sources[identity]; window = source['window']
            scale = 256/(window[2]-window[0])
            with Image.open(source['file']) as original:
                photo = photo_tensor(original, {'scale':scale,'offset':[-window[0]*scale,-window[1]*scale],'resolution':256})
            fields = {256: np.stack([field(probe,source['assets']['candidate'][key],256) for key in ['body','material']]),
                      512: np.stack([field(args.run,row['fields'][key],512) for key in ['body','material']])}
            pictures = [photo]
            for size in [256,512]:
                pictures.append(Image.fromarray(np.uint8(np.clip(fields[size][0]*255,0,255))).convert('RGB'))
            for size in [256,512]:
                body, material = fields[size] >= .5
                material ^= metrics[str(size)][identity]['materialPhaseExchanged']
                colors = np.array([[55,55,55],[245,180,40],[25,125,210]],np.uint8)
                pictures.append(Image.fromarray(colors[np.where(body,1+material,0)]))
            for col,picture in enumerate(pictures):
                panel.paste(picture.resize((256,256),Image.Resampling.NEAREST),(col*256,32+index*288+24))
            draw.text((4,32+index*288+5),identity,fill='black')
            for col,size,key in [(1,'256','bodyIoU'),(2,'512','bodyIoU'),(3,'256','materialPixelError'),(4,'512','materialPixelError')]:
                label = 'IoU' if key=='bodyIoU' else 'Observed error'
                draw.text((col*256+5,32+index*288+5),f'{label} {metrics[size][identity][key]:.1%}',fill='black')
        panel.save(output/f'fields-{start//4+1}.png')
    crop_file = args.run/'crops/report.json'
    if crop_file.exists():
        crops = json.loads(crop_file.read_bytes())
        assert crops['status'] == 'complete'
        pairs = {i: {r['resolution']: r for r in crops['rows'] if r['id']==i}
                 for i in report['plan']['ids']}
        selected = [i for i,pair in pairs.items() if any(r['selectedCrop'] for r in pair.values())]
        panel = Image.new('RGB',(3*400,32+len(selected)*432),'white'); draw = ImageDraw.Draw(panel)
        for col,title in enumerate(['Source: green 256, magenta 512','256 mask','512 mask']):
            draw.text((col*400+5,8),title,fill='black')
        for index,identity in enumerate(selected):
            with Image.open(sources[identity]['file']) as source:
                photo = source.convert('RGB'); factor = min(400/photo.width,400/photo.height)
                photo = photo.resize((round(photo.width*factor),round(photo.height*factor)))
            pd = ImageDraw.Draw(photo)
            for size,color in [(256,'#00dd66'),(512,'#ff00ff')]:
                row = pairs[identity][size]
                if row['selectedCrop']:
                    points = [(x*factor,y*factor) for x,y in row['selectedCrop']['quad']]
                    pd.line(points+[points[0]],fill=color,width=2)
            y = 32+index*432
            draw.text((5,y+5),identity,fill='black'); panel.paste(photo,(0,y+24))
            for col,size in [(1,256),(2,512)]:
                row = pairs[identity][size]
                if row.get('mask'):
                    file = args.run/'crops'/row['mask']['path']
                    assert hashlib.sha256(file.read_bytes()).hexdigest()==row['mask']['sha256']
                    with Image.open(file) as mask: panel.paste(mask.convert('RGB'),(col*400,y+24))
                else: draw.text((col*400+5,y+40),'No supported crop',fill='black')
        panel.save(output/'crops.png')
    print(output)


if __name__ == '__main__': main()
