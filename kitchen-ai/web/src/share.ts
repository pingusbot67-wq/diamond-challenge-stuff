// Draws the recipe card as a 1080×1350 PNG (Instagram/TikTok portrait size).
import type { Recipe } from './runtime.ts';

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
  const W = 1080, H = 1350, P = 96;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const ink = '#121212', soft = '#5E5B57', faint = '#8F8C87', accent = '#F04E23', surface = '#F6F5F2';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  // brand + badges
  ctx.fillStyle = accent;
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText('KITCHEN AI', P, P + 20);
  const badges = [r.glp1_friendly ? 'GLP-1 friendly' : '', `${r.minutes} min`, r.macros_estimated ? 'Estimated' : ''].filter(Boolean);
  let bx = W - P;
  ctx.font = `700 28px ${FONT}`;
  for (const b of [...badges].reverse()) {
    const w = ctx.measureText(b).width + 40;
    bx -= w;
    ctx.fillStyle = surface;
    roundRect(ctx, bx, P - 16, w, 52, 26);
    ctx.fill();
    ctx.fillStyle = soft;
    ctx.fillText(b, bx + 20, P + 20);
    bx -= 12;
  }

  // title
  ctx.fillStyle = ink;
  ctx.font = `800 76px ${FONT}`;
  const lines = wrap(ctx, r.title, W - P * 2, 3);
  let y = P + 170;
  for (const l of lines) {
    ctx.fillText(l, P, y);
    y += 88;
  }

  // the hero number
  const approx = r.macros_estimated ? '≈' : '';
  y += 230;
  ctx.fillStyle = accent;
  ctx.font = `800 300px ${FONT}`;
  const big = `${approx}${r.macros.protein_g}`;
  ctx.fillText(big, P - 12, y);
  const bw = ctx.measureText(big).width;
  ctx.font = `800 110px ${FONT}`;
  ctx.fillText('g', P - 12 + bw + 8, y);
  ctx.fillStyle = soft;
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText('PROTEIN', P, y + 64);

  // stats
  const sy = y + 130;
  ctx.fillStyle = surface;
  roundRect(ctx, P, sy, W - P * 2, 190, 36);
  ctx.fill();
  const cols = [
    [`${approx}${r.macros.kcal}`, 'Calories'],
    [`${r.macros.carbs_g}g`, 'Carbs'],
    [`${r.macros.fat_g}g`, 'Fat'],
  ];
  const cw = (W - P * 2) / 3;
  cols.forEach(([v, l], i) => {
    const x = P + cw * i + 44;
    ctx.fillStyle = ink;
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText(v, x, sy + 100);
    ctx.fillStyle = faint;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(l, x, sy + 148);
  });

  // footer
  ctx.fillStyle = faint;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('made from what’s in my fridge', P, H - P + 10);
  if (r.servings > 1) {
    const t = `per serving · makes ${r.servings}`;
    ctx.fillText(t, W - P - ctx.measureText(t).width, H - P + 10);
  }

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no image'))), 'image/png'));
}
