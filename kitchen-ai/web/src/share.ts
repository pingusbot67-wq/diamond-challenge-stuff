// Draws the recipe card as a 1080×1350 PNG (Instagram/TikTok portrait size).
import type { Recipe } from './runtime.ts';
import { dishImage } from './dish.ts';

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '') + '…';
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function cardImage(r: Recipe): Promise<Blob> {
  const W = 1080, H = 1350, P = 88;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const ink = '#141312', soft = '#66625C', faint = '#8C8882', accent = '#F04E23', panel = '#F7F4EE', line = '#ECE9E4';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  // illustration panel
  ctx.fillStyle = panel;
  ctx.fillRect(0, 0, W, 610);
  try {
    const img = await dishImage(r);
    ctx.drawImage(img, (W - 760) / 2, 70, 760, 522);
  } catch {
    /* draw the card without the picture */
  }
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(P + 9, P - 9, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText('Kitchen AI', P + 30, P + 2);
  const badges = [r.glp1_friendly ? 'GLP-1 friendly' : '', r.macros_estimated ? 'Estimated' : ''].filter(Boolean);
  let bx = W - P;
  ctx.font = `650 26px ${FONT}`;
  for (const b of [...badges].reverse()) {
    const w = ctx.measureText(b).width + 36;
    bx -= w;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, bx, P - 34, w, 48, 24);
    ctx.fill();
    ctx.fillStyle = soft;
    ctx.fillText(b, bx + 18, P - 1);
    bx -= 10;
  }

  // title
  ctx.fillStyle = ink;
  ctx.font = `700 64px ${FONT}`;
  const lines = wrap(ctx, r.title, W - P * 2, 2);
  let y = 700;
  for (const l of lines) {
    ctx.fillText(l, P, y);
    y += 74;
  }

  // the hero number
  const approx = r.macros_estimated ? '≈' : '';
  y += 170;
  ctx.fillStyle = accent;
  ctx.font = `750 210px ${FONT}`;
  const big = `${approx}${r.macros.protein_g}`;
  ctx.fillText(big, P - 8, y);
  const bw = ctx.measureText(big).width;
  ctx.fillStyle = soft;
  ctx.font = `600 44px ${FONT}`;
  ctx.fillText('g protein', P + bw + 10, y);

  // stats row
  const sy = Math.min(H - 190, y + 70);
  ctx.fillStyle = line;
  ctx.fillRect(P, sy, W - P * 2, 2);
  const cols: [string, string][] = [
    ['CALORIES', `${approx}${r.macros.kcal}`],
    ['TIME', `${r.minutes} min`],
    ['CARBS', `${r.macros.carbs_g}g`],
    ['FAT', `${r.macros.fat_g}g`],
  ];
  const cw = (W - P * 2) / 4;
  cols.forEach(([l, v], i) => {
    const x = P + cw * i;
    ctx.fillStyle = faint;
    ctx.font = `650 24px ${FONT}`;
    ctx.fillText(l, x, sy + 56);
    ctx.fillStyle = ink;
    ctx.font = `650 48px ${FONT}`;
    ctx.fillText(v, x, sy + 114);
  });

  ctx.fillStyle = faint;
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(r.servings > 1 ? `made from what’s in my fridge · per serving, makes ${r.servings}` : 'made from what’s in my fridge', P, H - 52);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no image'))), 'image/png'));
}
