"""Review every paired held-out field, reusing original photos in place."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'datasets'))
from real_annotations import photo_tensor


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--probe',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    sha=lambda raw:hashlib.sha256(raw).hexdigest()
    manifest=json.loads((args.probe/'manifest.json').read_bytes())
    assert manifest['status']=='complete' and manifest['methods']==['baseline','candidate']
    n=manifest['resolution'];metrics={}
    for name,asset in manifest['trainingReports'].items():
        raw=Path(asset['path']).read_bytes();assert sha(raw)==asset['sha256']
        metrics[name]={r['id']:r for r in json.loads(raw)['mixedOutOfFoldMetrics']['rows']}
    args.output.mkdir(parents=True,exist_ok=False)
    for start in range(0,len(manifest['rows']),4):
        rows=manifest['rows'][start:start+4]
        panel=Image.new('RGB',(5*n,32+len(rows)*(n+32)),'white');draw=ImageDraw.Draw(panel)
        for col,title in enumerate(['Source','Body: frozen encoder','Body: fine-tuned tail','Paper: frozen encoder','Paper: fine-tuned tail']):
            draw.text((col*n+4,8),title,fill='black')
        for index,row in enumerate(rows):
            raw=Path(row['file']).read_bytes();assert sha(raw)==row['photoSha256']
            with Image.open(row['file']) as source:
                left,top,right,bottom=row['window']
                scale=n/(right-left)
                assert abs((bottom-top)*scale-n)<1e-8
                photo=photo_tensor(source,{'scale':scale,'offset':[-left*scale,-top*scale],'resolution':n})
            fields={}
            for method in manifest['methods']:
                values=[]
                for name in ['body','material']:
                    asset=row['assets'][method][name];raw=(args.probe/asset['path']).read_bytes()
                    assert sha(raw)==asset['sha256']
                    values.append(np.frombuffer(raw,dtype='<f4').reshape(n,n))
                fields[method]=values
            images=[photo]
            for method in manifest['methods']:
                images.append(Image.fromarray(np.uint8(fields[method][0]*255)).convert('RGB'))
            for method in manifest['methods']:
                body,material=np.array(fields[method])>=.5
                # Phase is only for consistent visual labels; never a fit input.
                material^=metrics[method][row['id']]['materialPhaseExchanged']
                colors=np.array([[55,55,55],[245,180,40],[25,125,210]],np.uint8)
                images.append(Image.fromarray(colors[np.where(body,1+material,0)]))
            y=32+index*(n+32);draw.text((4,y+6),row['id'],fill='black')
            for col,image in enumerate(images):panel.paste(image,(col*n,y+26))
            for col,method,key in [(1,'baseline','bodyIoU'),(2,'candidate','bodyIoU'),(3,'baseline','materialPixelError'),(4,'candidate','materialPixelError')]:
                label='IoU' if key=='bodyIoU' else 'Observed error'
                draw.text((col*n+4,y+6),f'{label} {metrics[method][row["id"]][key]:.1%}',fill='black')
        panel.save(args.output/f'fields-{start//4+1}.png')
    print(args.output)


if __name__=='__main__':main()
