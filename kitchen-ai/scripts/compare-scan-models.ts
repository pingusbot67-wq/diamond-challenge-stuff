// Side-by-side test: does the cheap model (Haiku) read fridge photos as well as Sonnet?
// Uses the EXACT same prompt, schema and photo shrinking as the app.
//
// 1. Put 3–5 fridge photos in kitchen-ai/test-photos/
// 2. Put your Anthropic key in kitchen-ai/.env.local as:  ANTHROPIC_API_KEY=sk-ant-...
//    (that file is git-ignored — never commit it)
// 3. Run:  npm run compare-scan
// 4. Open kitchen-ai/reports/scan-comparison.html
// Cost: well under $0.05 for 5 photos.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { callStructured, getClient, type CallResult } from '../supabase/functions/_shared/claude.ts';
import { ScanSchema, type ScanOutput } from '../supabase/functions/_shared/schemas.ts';
import { SCAN_SYSTEM } from '../supabase/functions/_shared/prompts.ts';
import { FOODS } from '../supabase/functions/_shared/foods.generated.ts';
import { buildFoodIndex, normalizeScanItems } from '../supabase/functions/_shared/nutrition.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5'] as const;

type Item = { name: string; confidence: string; amount: string | null };
type Ok = { ok: true; res: CallResult<ScanOutput>; ms: number; items: Item[] };
type Fail = { ok: false; error: string; ms: number };
type Run = Ok | Fail;
type Row = { photo: string; thumb: string; kb: number; runs: Record<string, Run> };

function loadKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const f = join(ROOT, '.env.local');
  if (!existsSync(f)) return undefined;
  return readFileSync(f, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1].trim();
}

async function main() {
  const dir = join(ROOT, 'test-photos');
  const photos = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort() : [];
  if (!photos.length) throw new Error('No photos found. Put 3–5 JPEG/PNG fridge photos in kitchen-ai/test-photos/');
  const key = loadKey();
  if (!key) console.log('No ANTHROPIC_API_KEY found in the environment or .env.local — trying anyway (works only if a proxy adds the key).');
  const client = getClient(key ?? 'sk-ant-placeholder-added-by-proxy');
  const index = buildFoodIndex(FOODS);
  const rows: Row[] = [];

  for (const photo of photos) {
    // same as the phone: longest side 1024px, JPEG 70%
    const buf = await sharp(join(dir, photo))
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    const b64 = buf.toString('base64');
    const thumb = (await sharp(buf).resize(360).jpeg({ quality: 60 }).toBuffer()).toString('base64');
    const runs: Record<string, Run> = {};
    for (const model of MODELS) {
      process.stdout.write(`${photo} · ${model} … `);
      const t0 = Date.now();
      try {
        const res = await callStructured({
          client,
          model,
          system: SCAN_SYSTEM,
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: 'List the food you can see.' },
          ],
          schema: ScanSchema,
          maxTokens: 2000,
          onUsage: () => {},
        });
        const items = normalizeScanItems(res.data.items, index).map((i) => ({ name: i.display, confidence: i.confidence, amount: i.amount }));
        runs[model] = { ok: true, res, ms: Date.now() - t0, items };
        console.log(`${items.length} items, ${res.input_tokens}+${res.output_tokens} tokens, $${res.cost_usd.toFixed(5)}`);
      } catch (e) {
        const code = (e as { code?: string }).code;
        const error = code === 'config' ? 'API key missing or invalid — check ANTHROPIC_API_KEY in .env.local' : e instanceof Error ? e.message : String(e);
        runs[model] = { ok: false, error, ms: Date.now() - t0 };
        console.log(`failed: ${error}`);
      }
    }
    rows.push({ photo, thumb, kb: Math.round(buf.length / 1024), runs });
  }

  const out = join(ROOT, 'reports');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'scan-comparison.json'), JSON.stringify(rows.map(({ thumb: _t, ...r }) => r), null, 2));
  writeFileSync(join(out, 'scan-comparison.html'), renderHtml(rows));
  console.log(`\nReport: ${join(out, 'scan-comparison.html')}`);
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ENTITIES[c]);

function summary(rows: Row[], model: string) {
  const ok = rows.map((r) => r.runs[model]).filter((r): r is Ok => !!r && r.ok);
  const avg = (f: (r: Ok) => number) => (ok.length ? ok.reduce((a, r) => a + f(r), 0) / ok.length : 0);
  return {
    n: ok.length,
    items: avg((r) => r.items.length),
    cost: avg((r) => r.res.cost_usd),
    ms: avg((r) => r.ms),
    inTok: avg((r) => r.res.input_tokens),
    outTok: avg((r) => r.res.output_tokens),
  };
}

function column(r: Row, model: string, otherNames: Set<string>): string {
  const run = r.runs[model];
  if (!run || !run.ok) return `<div class="col"><h3>${model}</h3><p class="err">Failed: ${esc(run && !run.ok ? run.error : 'not run')}</p></div>`;
  const li = run.items
    .map((i) => {
      const cls = otherNames.has(i.name) ? '' : 'only';
      const amount = i.amount ? ` <span>${esc(i.amount)}</span>` : '';
      return `<li class="${cls}">${esc(i.name)}${amount} <em class="${i.confidence}">${i.confidence}</em></li>`;
    })
    .join('');
  const meta = `${run.items.length} items · ${run.res.input_tokens}+${run.res.output_tokens} tokens · $${run.res.cost_usd.toFixed(5)} · ${(run.ms / 1000).toFixed(1)}s`;
  return `<div class="col"><h3>${model}</h3><p class="meta">${meta}</p><ul>${li}</ul></div>`;
}

function names(r: Row, model: string): Set<string> {
  const run = r.runs[model];
  return new Set(run && run.ok ? run.items.map((i) => i.name) : []);
}

function renderHtml(rows: Row[]): string {
  const h = summary(rows, MODELS[0]);
  const s = summary(rows, MODELS[1]);
  const sections = rows
    .map((r) => {
      const photo = `<div class="photo"><img alt="" src="data:image/jpeg;base64,${r.thumb}"><p>${esc(r.photo)} · sent as ${r.kb} KB</p></div>`;
      return `<section>${photo}${column(r, MODELS[0], names(r, MODELS[1]))}${column(r, MODELS[1], names(r, MODELS[0]))}</section>`;
    })
    .join('\n');
  const tr = (label: string, a: string, b: string) => `<tr><td>${label}</td><td>${a}</td><td>${b}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scan model comparison</title>
<style>
:root{--ink:#121212;--soft:#5E5B57;--line:#E6E4DF;--accent:#F04E23;--bg:#fff;--surface:#F6F5F2}
body{font:16px/1.5 -apple-system,system-ui,sans-serif;color:var(--ink);background:var(--bg);margin:0 auto;padding:24px 16px;max-width:1200px}
h1{font-size:28px;margin:0 0 4px}h3{margin:0 0 4px;font-size:15px}.sub{color:var(--soft)}
table{border-collapse:collapse;margin:20px 0;width:100%;max-width:720px}td,th{padding:8px 12px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--soft);font-weight:600}
section{display:grid;grid-template-columns:240px 1fr 1fr;gap:20px;padding:20px 0;border-top:1px solid var(--line)}
@media(max-width:800px){section{grid-template-columns:1fr}}
img{width:100%;border-radius:12px}.photo p,.meta{color:var(--soft);font-size:13px;margin:6px 0}
ul{padding-left:18px;margin:8px 0}li span{color:var(--soft);font-size:13px}li.only{background:#FDECE6;border-radius:6px}
em{font-style:normal;font-size:11px;padding:1px 6px;border-radius:99px;background:var(--surface);color:var(--soft)}em.low{color:#9A5B00;background:#FFF3DC}
.err{color:#C62A1E}.key{font-size:13px;color:var(--soft)}
</style></head><body>
<h1>Fridge scan: Haiku vs Sonnet</h1><p class="sub">Same prompt, same photos (shrunk to 1024px JPEG like the app), effort “low”.</p>
<table><tr><th></th><th>Haiku 5.5</th><th>Sonnet 5.5</th></tr>
${tr('Photos scanned', String(h.n), String(s.n))}
${tr('Avg items found', h.items.toFixed(1), s.items.toFixed(1))}
${tr('Avg cost per scan', `$${h.cost.toFixed(5)}`, `$${s.cost.toFixed(5)}`)}
${tr('Cost per 1,000 scans', `$${(h.cost * 1000).toFixed(2)}`, `$${(s.cost * 1000).toFixed(2)}`)}
${tr('Avg time', `${(h.ms / 1000).toFixed(1)}s`, `${(s.ms / 1000).toFixed(1)}s`)}
${tr('Avg tokens (in + out)', `${Math.round(h.inTok)} + ${Math.round(h.outTok)}`, `${Math.round(s.inTok)} + ${Math.round(s.outTok)}`)}
</table>
<p class="key">Highlighted = found by that model only. Check those against the photo: real (good) or made up (bad)?</p>
${sections}
</body></html>`;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
