/** Independent raster check of exported cubic cuts, using resvg rather than
 * the solver's curve flattening, target sampler or weave sampler. */
import { Resvg } from '@resvg/resvg-js';
import { createCanvas, loadImage } from 'canvas';

export async function renderExportedWeave(serialized, resolution) {
  const data = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  const w = data.square_width_mm, families = [data.A_overlap_paths, data.B_overlap_paths];
  const phase = data.phase ^ (families[0].length % 2) ^ (families[1].length % 2);
  const paths = [];
  for (const [family, slits] of families.entries()) for (const slit of slits) {
    let d = 'M 0,0';
    for (const [i, reference] of slit.entries()) {
      let controls = data.curves[reference.curve].control_points;
      if (reference.reverse) controls = controls.slice().reverse();
      if (i === 0) d += ` L ${controls[0].join(',')}`;
      d += ` C ${controls.slice(1).map(p => p.join(',')).join(' ')}`;
    }
    d += ` L ${family === 0 ? `0,${w}` : `${w},0`} Z`;
    paths.push(d);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${resolution}" height="${resolution}" viewBox="0 0 ${w} ${w}"><rect width="${w}" height="${w}" fill="${phase ? 'black' : 'white'}"/><path d="${paths.join(' ')}" fill="${phase ? 'white' : 'black'}" fill-rule="evenodd"/></svg>`;
  const png = new Resvg(svg).render().asPng();
  const canvas = createCanvas(resolution, resolution), context = canvas.getContext('2d');
  context.drawImage(await loadImage(png), 0, 0);
  const rgba = context.getImageData(0, 0, resolution, resolution).data;
  const mask = Uint8Array.from({ length: resolution * resolution }, (_, i) => Number(rgba[4 * i] < 128));
  return { mask, svg, png, renderer: 'resvg from exported cut_geometry.json; antialias coverage threshold 0.5' };
}
