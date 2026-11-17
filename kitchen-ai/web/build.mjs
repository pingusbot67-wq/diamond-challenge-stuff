// Builds the Kitchen AI website into ONE html file: web/dist/kitchen-ai.html
// Run:  node web/build.mjs
// Preact is loaded from a CDN by the page; everything else (our code, the nutrition table) is bundled in.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url).pathname;

const globals = {
  name: 'cdn-globals',
  setup(b) {
    b.onResolve({ filter: /^preact(\/hooks)?$/ }, (a) => ({ path: a.path, namespace: 'cdn-globals' }));
    b.onLoad({ filter: /.*/, namespace: 'cdn-globals' }, (a) => ({
      contents: `module.exports = window.${a.path === 'preact' ? 'preact' : 'preactHooks'};`,
      loader: 'js',
    }));
  },
};

const out = await build({
  entryPoints: [here('./src/app.tsx')],
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  target: ['safari15', 'chrome100', 'firefox100'],
  jsx: 'transform',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  plugins: [globals],
  legalComments: 'none',
});

const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(here('./template.html'), 'utf8').replace('/*BUNDLE*/', () => js);
mkdirSync(here('./dist'), { recursive: true });
writeFileSync(here('./dist/kitchen-ai.html'), html);
console.log(`web/dist/kitchen-ai.html  ${(html.length / 1024).toFixed(0)} KB`);
