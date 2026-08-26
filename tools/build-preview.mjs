#!/usr/bin/env node
// Builds a single self-contained preview of the whole site, for sharing with
// the designer. Every page, stylesheet, font, and image is inlined, because the
// artifact host blocks all external requests.
//
// Each page renders inside a real iframe at a real width, so the site's own
// media queries fire exactly as they do in a browser. The site's CSS and JS are
// used untouched — this previews the design, it does not reinterpret it.
//
//   node tools/build-preview.mjs
//
// Output: preview/nikoltsvetanova-preview.html (git-ignored, not deployed)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'preview');
const PAGES = [
  ['index.html', 'Home'],
  ['about.html', 'About'],
  ['reel.html', 'Reel'],
  ['gallery.html', 'Gallery'],
  ['404.html', '404'],
];

const manifest = JSON.parse(
  await readFile(join(ROOT, '_source', 'image-manifest.json'), 'utf8'),
);

// WebP rather than AVIF: a preview is opened on whatever browser the designer
// happens to have, and universal support is worth ~360 KB here.
const PREVIEW_FORMAT = 'webp';
const PREVIEW_CAP = 1280;

const dataUriCache = new Map();

async function dataUri(imgName) {
  if (dataUriCache.has(imgName)) return dataUriCache.get(imgName);
  const entry = manifest[imgName];
  if (!entry) throw new Error(`No manifest entry for ${imgName}`);
  const width =
    entry.widths.filter((w) => w <= PREVIEW_CAP).pop() ?? entry.widths[0];
  const file = join(ROOT, 'assets', 'img', `${imgName}-${width}.${PREVIEW_FORMAT}`);
  const b64 = (await readFile(file)).toString('base64');
  const uri = `data:image/${PREVIEW_FORMAT};base64,${b64}`;
  dataUriCache.set(imgName, uri);
  return uri;
}

// "/assets/img/gallery-04-1063.jpg" -> "gallery-04"
const baseName = (url) => {
  const m = url.match(/\/assets\/img\/(.+?)-\d+\.(?:avif|webp|jpg|jpeg|png)$/);
  return m ? m[1] : null;
};

// --- shared assets -----------------------------------------------------------

const fontB64 = (await readFile(join(ROOT, 'assets', 'fonts', 'mirra.woff2'))).toString('base64');
const css = (await readFile(join(ROOT, 'assets', 'css', 'site.css'), 'utf8')).replace(
  /url\("\.\.\/fonts\/mirra\.woff2"\)/,
  `url("data:font/woff2;base64,${fontB64}")`,
);
const js = await readFile(join(ROOT, 'assets', 'js', 'site.js'), 'utf8');

// Injected into every previewed page. Keeps the real nav feeling real while
// routing through the parent, since a one-file preview has no server.
const BRIDGE = `
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href.startsWith('http') || href.startsWith('mailto:')) return;   // leave external alone
  if (href.endsWith('.pdf')) {
    event.preventDefault();
    parent.postMessage({ preview: 'pdf' }, '*');
    return;
  }
  if (href.startsWith('#')) return;
  event.preventDefault();
  parent.postMessage({ preview: 'navigate', href }, '*');
});
// Video cannot play inside the preview host, so say so rather than fail silently.
for (const facade of document.querySelectorAll('.facade')) {
  facade.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    parent.postMessage({ preview: 'video', id: facade.dataset.youtube }, '*');
  }, true);
}
`;

async function buildPage(file) {
  let html = await readFile(join(ROOT, file), 'utf8');

  // Inline the stylesheet and the module script.
  html = html.replace(
    /<link rel="stylesheet" href="\/assets\/css\/site\.css">/,
    `<style>\n${css}\n</style>`,
  );
  html = html.replace(
    /<script type="module" src="\/assets\/js\/site\.js"><\/script>/,
    `<script type="module">\n${js}\n</script>`,
  );

  // Drop metadata that means nothing in a preview and would only reference
  // absent files or the production domain.
  html = html.replace(/<link rel="canonical"[^>]*>\s*/g, '');
  html = html.replace(/<link rel="icon"[^>]*>\s*/g, '');
  html = html.replace(/<meta property="og:[^>]*>\s*/g, '');
  html = html.replace(/<meta name="twitter:[^>]*>\s*/g, '');

  // <picture> carries AVIF/WebP/JPEG at three widths. Embedding all of that
  // would multiply the payload for no benefit, so collapse each to one image.
  html = html.replace(/<source[^>]*>\s*/g, '');

  // Rewrite every remaining image reference to an inlined data URI.
  const urls = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/img\/[^"]+)"/g)) urls.add(m[1]);
  for (const url of urls) {
    const name = baseName(url);
    if (!name) continue;
    const uri = await dataUri(name);
    html = html.split(`"${url}"`).join(`"${uri}"`);
  }

  html = html.replace('</body>', `<script>${BRIDGE}</script>\n</body>`);
  return html;
}

const pages = {};
for (const [file] of PAGES) {
  pages[file] = await buildPage(file);
  process.stdout.write(`  inlined ${file}\n`);
}

// JSON in a script tag: escape < so no embedded markup can close the tag early.
const payload = JSON.stringify(pages).replace(/</g, '\\u003c');
const tabs = PAGES.map(
  ([file, label], i) =>
    `<button class="tab${i === 0 ? ' is-on' : ''}" data-page="${file}">${label}</button>`,
).join('');

const shell = `<title>Nikol Tsvetanova Preview</title>
<style>
  /* Deliberately single-theme. This is tool chrome framing a light page, the
     way a design tool's canvas is — not a document that should follow the
     reader's theme. Every colour is painted explicitly so it holds on any host. */
  :root {
    --chrome-bg: #141416;
    --chrome-panel: #1C1C1F;
    --chrome-line: rgba(255, 255, 255, 0.10);
    --chrome-ink: #D8D5D1;
    --chrome-ink-dim: #8B8781;
    --chrome-on: #F5F2EF;
    --canvas: #242427;
    --ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    display: flex;
    flex-direction: column;
    background: var(--chrome-bg);
    color: var(--chrome-ink);
    font-family: var(--ui);
    font-size: 13px;
  }
  header {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 22px;
    padding: 11px 16px;
    background: var(--chrome-panel);
    border-block-end: 1px solid var(--chrome-line);
  }
  .brand { display: flex; align-items: baseline; gap: 9px; margin-inline-end: auto; }
  .brand strong { color: var(--chrome-on); font-size: 13px; font-weight: 600; letter-spacing: 0.01em; }
  .badge {
    padding: 2px 7px;
    border: 1px solid var(--chrome-line);
    border-radius: 3px;
    color: var(--chrome-ink-dim);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .group { display: flex; align-items: center; gap: 4px; }
  .group-label {
    margin-inline-end: 4px;
    color: var(--chrome-ink-dim);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  button {
    padding: 5px 11px;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--chrome-ink);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  button:hover { background: rgba(255, 255, 255, 0.07); }
  button:focus-visible { outline: 2px solid #7FA7C4; outline-offset: 2px; }
  button.is-on {
    background: rgba(255, 255, 255, 0.12);
    border-color: var(--chrome-line);
    color: var(--chrome-on);
  }
  .stage {
    flex: 1;
    display: flex;
    justify-content: center;
    min-height: 0;
    padding: 18px;
    background: var(--canvas);
    overflow: auto;
  }
  iframe {
    width: 100%;
    height: 100%;
    background: #E8E6E4;
    border: 0;
    border-radius: 2px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 12px 34px rgba(0, 0, 0, 0.3);
  }
  .note {
    position: fixed;
    inset-block-end: 16px;
    inset-inline-start: 50%;
    translate: -50% 0;
    z-index: 5;
    max-width: min(90vw, 460px);
    padding: 10px 15px;
    background: var(--chrome-panel);
    border: 1px solid var(--chrome-line);
    border-radius: 5px;
    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45);
    color: var(--chrome-ink);
    line-height: 1.45;
    opacity: 0;
    visibility: hidden;
    transition: opacity 180ms ease, visibility 180ms;
  }
  .note[data-show="true"] { opacity: 1; visibility: visible; }
  @media (prefers-reduced-motion: reduce) { .note { transition: none; } }
  @media (max-width: 40em) { .brand { width: 100%; margin: 0; } }
</style>

<header>
  <div class="brand">
    <strong>Nikol Tsvetanova</strong>
    <span class="badge">Preview &middot; not live</span>
  </div>
  <div class="group" role="group" aria-label="Page">
    <span class="group-label">Page</span>
    ${tabs}
  </div>
  <div class="group" role="group" aria-label="Width">
    <span class="group-label">Width</span>
    <button class="w" data-w="375">375</button>
    <button class="w" data-w="768">768</button>
    <button class="w" data-w="1024">1024</button>
    <button class="w" data-w="1440">1440</button>
    <button class="w is-on" data-w="fill">Fill</button>
  </div>
</header>

<div class="stage">
  <iframe id="frame" title="Site preview"></iframe>
</div>

<p class="note" id="note" role="status" aria-live="polite"></p>

<script type="application/json" id="pages">${payload}</script>
<script>
  const pages = JSON.parse(document.getElementById('pages').textContent);
  const frame = document.getElementById('frame');
  const note = document.getElementById('note');
  let noteTimer;

  function say(text) {
    note.textContent = text;
    note.dataset.show = 'true';
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note.dataset.show = 'false'; }, 4200);
  }

  function show(file) {
    frame.srcdoc = pages[file];
    for (const tab of document.querySelectorAll('.tab')) {
      tab.classList.toggle('is-on', tab.dataset.page === file);
    }
  }

  function setWidth(value) {
    frame.style.width = value === 'fill' ? '100%' : value + 'px';
    frame.style.maxWidth = value === 'fill' ? 'none' : '100%';
    for (const b of document.querySelectorAll('.w')) {
      b.classList.toggle('is-on', b.dataset.w === value);
    }
  }

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => show(tab.dataset.page));
  }
  for (const b of document.querySelectorAll('.w')) {
    b.addEventListener('click', () => setWidth(b.dataset.w));
  }

  addEventListener('message', (event) => {
    const d = event.data;
    if (!d || !d.preview) return;
    if (d.preview === 'navigate') {
      const file = d.href === '/' ? 'index.html' : d.href.replace(/^\\//, '') + '.html';
      if (pages[file]) show(file);
      else say('That page is not part of this preview.');
    }
    if (d.preview === 'pdf') say('The résumé PDF opens in a new tab on the real site. It is not embedded in this preview.');
    if (d.preview === 'video') say('Video playback is disabled in this preview. On the live site this loads the YouTube reel only after a click.');
  });

  show('index.html');
  setWidth('fill');
</script>
`;

await mkdir(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, 'nikoltsvetanova-preview.html');
await writeFile(outFile, shell);

const bytes = Buffer.byteLength(shell);
console.log(`\nwrote ${outFile}`);
console.log(`size: ${(bytes / 1048576).toFixed(2)} MB (artifact limit 16 MB)`);
if (bytes > 15 * 1048576) {
  console.error('Too close to the limit — lower PREVIEW_CAP and rebuild.');
  process.exit(1);
}
