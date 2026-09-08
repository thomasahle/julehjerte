import { createCanvas } from 'canvas';
export function heartPhoto({ width = 380, height = 320, hearts = [[190, 80, 85, 75, -85, 75]], colours = ['#b71327', '#f3f1e8'], background = '#647653', lobeDepths = [.5, .5] } = {}) {
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  for (const [tx, ty, ax, ay, bx, by] of hearts) {
    ctx.save(); ctx.transform(ax, ay, bx, by, tx, ty);
    ctx.fillStyle = colours[0]; ctx.beginPath(); ctx.ellipse(0, 0.5, lobeDepths[0], 0.5, 0, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = colours[1]; ctx.beginPath(); ctx.ellipse(0.5, 0, 0.5, lobeDepths[1], 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.fillStyle = colours[(x + y) % 2]; ctx.fillRect(x / 4, y / 4, 0.25, 0.25); }
    ctx.restore();
  }
  return { type: 'pixels', rgba: ctx.getImageData(0, 0, width, height).data, imageWidth: width, imageHeight: height, canvas };
}
