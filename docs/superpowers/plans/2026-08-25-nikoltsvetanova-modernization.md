# nikoltsvetanova.com Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild nikoltsvetanova.com as four responsive static pages with a new reel page, cutting deployed payload from 374 MB to under 15 MB, on the existing HostGator host with no build step.

**Architecture:** Hand-authored HTML/CSS/JS uploaded as-is. A single responsive markup set per page replaces the current `desktop_*`/`mobile_*` duplication. Originals live in `_source/` and one-time Node scripts in `tools/` generate optimized `assets/`; neither directory is deployed and neither is needed to edit content afterwards.

**Tech Stack:** Vanilla HTML5, modern CSS (custom properties, Grid, `clamp()`), ES modules. Node 24 + sharp for the one-time image pass. Python 3.11 + fontTools for woff2 conversion. Apache `.htaccess` for headers and routing.

**Spec:** [`docs/superpowers/specs/2026-08-25-nikoltsvetanova-modernization-design.md`](../specs/2026-08-25-nikoltsvetanova-modernization-design.md)

## Global Constraints

Every task's requirements implicitly include this section.

- **The deployed site has no build step.** HTML/CSS/JS are uploaded exactly as authored. `tools/` is one-time and local; deleting it must not break the site or block a content edit.
- **Never deploy:** `_source/`, `tools/`, `docs/`, `.git/`, `.gitignore`, `.gitattributes`. Deploy everything else, including `.htaccess`.
- **Per-page image transfer must stay under 1.5 MB** — what one visitor actually downloads. Disk footprint may reach ~18 MB, since three formats at several widths are stored so each browser fetches exactly one. Never lower encode quality below AVIF 55 / WebP 72 / JPEG 78 to hit a disk number.
- **Nav, in order, on every page:** Home · About · Reel · Resume · Gallery. "Resume" is a link to the PDF in a new tab, not a page.
- **Internal links are extensionless** (`/about`, not `/about.html`). Apache rewrites internally; only old inbound `.html` URLs get a 301. Internal links must never trigger a redirect.
- **Palette tokens, exact values:** `--paper: #E8E6E4`, `--panel: #F2F0EF`, `--ink: #111111`, `--ink-muted: #55514E`, `--line: rgba(17,17,17,0.14)`, `--ink-invert: #F2F0EF`, `--overlay: rgba(17,17,17,0.72)`.
- **Body typeface is the system stack** `"Times New Roman", Times, serif` — zero bytes. Display face is Mirra as woff2. No Typekit, no Google Fonts, no FontAwesome, no jQuery.
- **All motion is gated on `prefers-reduced-motion: reduce`.**
- **Lighthouse per page:** Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95.
- **Every image** carries explicit `width`/`height` and descriptive `alt`.

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Hero row + headshot grid |
| `about.html` | Bio, contact, socials |
| `reel.html` | YouTube reel facade + self-hosted clip gallery |
| `gallery.html` | Production stills with captions |
| `404.html` | Not-found page |
| `assets/css/site.css` | All styling: tokens, reset, primitives, components |
| `assets/js/site.js` | All behavior: nav, lightbox, video facade, reveal |
| `assets/fonts/mirra.woff2` | Display typeface |
| `assets/img/*` | Generated responsive derivatives |
| `assets/video/*` | Compressed clips + posters (empty at launch, R1) |
| `assets/docs/nikol-tsvetanova-resume.pdf` | Résumé |
| `.htaccess` | Caching, compression, routing, redirects |
| `_source/images/`, `_source/fonts/` | Originals. Not deployed. |
| `tools/check-links.mjs` | Asset/link verifier (V2) |
| `tools/serve.mjs` | Preview server mirroring `.htaccess` routing |
| `tools/optimize-images.mjs` | One-time image pass |
| `tools/encode-clips.sh` | One-time clip encoder (needs ffmpeg; unused at launch) |

**Testing approach.** A static site has no unit-test framework, so the test cycle is the verification harness built in Task 1. `tools/check-links.mjs` is written *first*, and it fails immediately on the current repo because of P13 — that is this plan's red/green cycle. Every subsequent task ends by running it.

---

### Task 1: Verification harness

Builds the automated gate every later task depends on. It must fail on today's repo before anything is fixed.

**Files:**
- Create: `tools/check-links.mjs`
- Create: `tools/serve.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `node tools/check-links.mjs` — exits 0 when all local references resolve, exits 1 and prints `MISSING <page> -> <ref>` lines otherwise. `node tools/serve.mjs` — serves the repo root on port 8080 (override with `PORT`), resolving extensionless URLs the way `.htaccess` will.

- [ ] **Step 1: Write the failing test — the link checker**

Create `tools/check-links.mjs`:

```js
#!/usr/bin/env node
// Zero-dependency link and asset checker.
// Verifies that every local href/src/poster/srcset in every root HTML page
// resolves to a file that actually exists on disk.
import { readdir, readFile, access } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ATTR_RE = /\b(?:href|src|poster)\s*=\s*["']([^"']+)["']/gi;
const SRCSET_RE = /\bsrcset\s*=\s*["']([^"']+)["']/gi;

const isExternal = (u) => /^(?:https?:|mailto:|tel:|data:|#|\/\/)/i.test(u);

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function refsFrom(html) {
  const out = new Set();
  for (const m of html.matchAll(ATTR_RE)) out.add(m[1].trim());
  for (const m of html.matchAll(SRCSET_RE)) {
    for (const candidate of m[1].split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) out.add(url);
    }
  }
  return [...out];
}

// An extensionless internal link resolves to <name>.html, matching .htaccess.
async function resolveRef(ref, fromPage) {
  const clean = decodeURIComponent(ref.split('#')[0].split('?')[0]);
  if (!clean) return true;
  const base = clean.startsWith('/')
    ? join(ROOT, clean)
    : resolve(ROOT, dirname(fromPage), clean);
  return (await exists(base)) || (await exists(`${base}.html`));
}

const pages = (await readdir(ROOT)).filter((f) => f.endsWith('.html'));
let failures = 0;
let checked = 0;

for (const page of pages) {
  const html = await readFile(join(ROOT, page), 'utf8');
  for (const ref of refsFrom(html)) {
    if (!ref || isExternal(ref)) continue;
    checked += 1;
    if (!(await resolveRef(ref, page))) {
      console.error(`MISSING  ${page}  ->  ${ref}`);
      failures += 1;
    }
  }
}

console.log(`\nchecked ${checked} local references across ${pages.length} pages`);
if (failures > 0) {
  console.error(`FAIL: ${failures} unresolved reference(s)`);
  process.exit(1);
}
console.log('PASS: all local references resolve');
```

- [ ] **Step 2: Run it to confirm it fails on the current repo**

Run: `node tools/check-links.mjs`

Expected: **FAIL**. It must report the P13 mismatches — `gallery.html` referencing `IMAGES/NT_G1.jpg` through `NT_G7.jpg` and `NT_G9.jpg`, and `headshots.html` referencing `IMAGES/NT_H*.jpg` — because the files on disk are named `NTG*.jpg` and `NTH*.jpg`. Exit code 1.

If it passes, the checker is broken; do not continue.

- [ ] **Step 3: Write the preview server**

Create `tools/serve.mjs`:

```js
#!/usr/bin/env node
// Zero-dependency preview server. Mirrors the .htaccess routing rules so that
// local behaviour matches HostGator: extensionless URLs resolve to .html, and
// unknown paths render 404.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(pathname) {
  const candidates = pathname.endsWith('/')
    ? [join(pathname, 'index.html')]
    : [pathname, `${pathname}.html`, join(pathname, 'index.html')];
  for (const candidate of candidates) {
    const abs = join(ROOT, decodeURIComponent(candidate));
    if (!abs.startsWith(ROOT)) continue; // path traversal guard
    try {
      if ((await stat(abs)).isFile()) return abs;
    } catch {
      // try next candidate
    }
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
  const file = await resolveFile(pathname === '/' ? '/index.html' : pathname);

  if (file === null) {
    const body = await readFile(join(ROOT, '404.html')).catch(() => 'Not found');
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(body);
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
  });
  res.end(await readFile(file));
}).listen(PORT, () => {
  console.log(`preview  http://localhost:${PORT}`);
});
```

- [ ] **Step 4: Verify the server runs**

Run: `node tools/serve.mjs` then, in another shell, `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/`

Expected: `200`. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add tools/check-links.mjs tools/serve.mjs
git commit -m "Add link checker and preview server

check-links.mjs currently fails on the existing repo, reporting the
gallery and headshot filename mismatches recorded as P13 in the spec.
That failure is the baseline this rebuild has to turn green."
```

---

### Task 2: Asset reorganization and image pipeline

Generates every optimized image and normalizes filenames. Originals are **copied**, not moved, so the existing pages keep working until Task 11 removes them.

**Files:**
- Create: `tools/package.json`, `tools/optimize-images.mjs`
- Create: `_source/images/*` (copy of `IMAGES/*`), `_source/fonts/*` (copy of `TYPEFACES/*`)
- Create: `assets/img/*`, `assets/docs/nikol-tsvetanova-resume.pdf`

**Interfaces:**
- Consumes: `tools/check-links.mjs` from Task 1.
- Produces: for each role/index, files named `assets/img/<role>-<nn>-<width>.<ext>` where role ∈ {`hero`, `headshot`, `gallery`}, ext ∈ {`avif`, `webp`, `jpg`}, and width ∈ {640, 1280, 2400} **limited to widths not exceeding the source** — sources vary from 1063px to 5075px wide, so not every image has every width.
- Produces, for a source narrower than 2400px, an **additional variant at the source's own width**, so the best available resolution is always reachable. A 1063px source therefore yields widths `[640, 1063]`.
- Any reference needing a single largest URL (lightbox `href`, `<img src>` fallback, `og:image`, JSON-LD `image`) uses **the last entry of that image's `widths` array** in the manifest. There is deliberately no separate always-present variant: for a source ≥2400px it would duplicate `-2400` byte for byte, and 17 of 25 sources are ≥2400px.
- Produces: `_source/image-manifest.json`, mapping each name to `{ "width", "height", "widths": [...] }`. **Tasks 5, 7, 8 read this file** to build `srcset` lists and exact `width`/`height` attributes. It is committed, so a later task never depends on console output from an earlier one.

- [ ] **Step 1: Copy originals into `_source/`**

```bash
mkdir -p _source/images _source/fonts assets/docs
cp IMAGES/*.jpg IMAGES/*.JPG IMAGES/*.png _source/images/
cp TYPEFACES/* _source/fonts/
cp "IMAGES/Nikol Tsvetanova Resume.pdf" assets/docs/nikol-tsvetanova-resume.pdf
```

Verify: `ls _source/images | wc -l` reports at least 27 files, and `assets/docs/nikol-tsvetanova-resume.pdf` exists.

- [ ] **Step 2: Add the tools manifest**

Create `tools/package.json` — note this is scoped to `tools/` and is not a site build:

```json
{
  "name": "nikolwebsite-tools",
  "private": true,
  "type": "module",
  "description": "One-time asset scripts. Not required to edit or deploy the site.",
  "dependencies": {
    "sharp": "^0.34.0"
  }
}
```

Run: `cd tools && npm install && cd ..`

- [ ] **Step 3: Write the image optimizer**

Create `tools/optimize-images.mjs`. The rename map is explicit because source naming is inconsistent (`NTG7` but `NT_G8`):

```js
#!/usr/bin/env node
// One-time image optimization. Reads _source/images, writes assets/img.
// Run again only when source images change. Not part of any deploy.
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, '_source', 'images');
const OUT = join(ROOT, 'assets', 'img');
const WIDTHS = [640, 1280, 2400];

// Source filenames are inconsistent (NTG7 vs NT_G8), so the map is explicit.
const RENAMES = [
  ['NT1.jpg', 'hero-01'],
  ['NT2.jpg', 'hero-02'],
  ['NT3.jpg', 'hero-03'],
  ['NT4.jpg', 'hero-04'],
  // NTH6.jpg and NTH9.jpg are 72x72 placeholder thumbnails, not headshots.
  // They are deliberately excluded; there are 7 usable headshots, not 9.
  ['NTH1.jpg', 'headshot-01'],
  ['NTH2.jpg', 'headshot-02'],
  ['NTH3.jpg', 'headshot-03'],
  ['NTH4.jpg', 'headshot-04'],
  ['NTH5.jpg', 'headshot-05'],
  ['NTH7.jpg', 'headshot-06'],
  ['NTH8.jpg', 'headshot-07'],
  ['NTG1.jpg', 'gallery-01'],
  ['NTG2.jpg', 'gallery-02'],
  ['NTG3.jpg', 'gallery-03'],
  ['NTG4.jpg', 'gallery-04'],
  ['NTG5.jpg', 'gallery-05'],
  ['NTG6.jpg', 'gallery-06'],
  ['NTG7.jpg', 'gallery-07'],
  ['NT_G8.jpg', 'gallery-08'],
  ['NTG9.jpg', 'gallery-09'],
  ['NT_G10.jpg', 'gallery-10'],
  ['NT_G11.jpg', 'gallery-11'],
  ['NT_G12.jpg', 'gallery-12'],
  ['NT_G13.jpg', 'gallery-13'],
  ['NT_G14.jpg', 'gallery-14'],
];

await mkdir(OUT, { recursive: true });

const available = new Set(await readdir(SRC));
const missing = RENAMES.filter(([from]) => !available.has(from));
if (missing.length > 0) {
  console.error('Missing source images:', missing.map(([f]) => f).join(', '));
  process.exit(1);
}

const manifest = {};

async function emit(input, name, width, label) {
  const pipeline = sharp(input).resize({ width, withoutEnlargement: true });
  await pipeline.clone().avif({ quality: 55 }).toFile(join(OUT, `${name}-${label}.avif`));
  await pipeline.clone().webp({ quality: 72 }).toFile(join(OUT, `${name}-${label}.webp`));
  await pipeline
    .clone()
    .jpeg({ quality: 78, mozjpeg: true, progressive: true })
    .toFile(join(OUT, `${name}-${label}.jpg`));
}

for (const [from, name] of RENAMES) {
  const input = join(SRC, from);
  const meta = await sharp(input).metadata();

  // Sources vary from 1063px to 5075px wide. Never upscale: a -2400 variant
  // of a 1063px original would be a blurry lie, and markup that assumed one
  // existed would 404.
  const widths = WIDTHS.filter((w) => w <= meta.width);

  // If the source is narrower than our largest tier, add its own width so the
  // best available resolution stays reachable. No extra always-present variant:
  // for a source >= 2400px that would duplicate -2400 byte for byte.
  if (meta.width < 2400 && !widths.includes(meta.width)) widths.push(meta.width);
  widths.sort((a, b) => a - b);

  for (const width of widths) await emit(input, name, width, String(width));

  manifest[name] = { width: meta.width, height: meta.height, widths };
  console.log(`${from}  ->  ${name}  (${meta.width}x${meta.height})  widths: ${widths.join(', ')}`);
}

// Written to disk rather than printed: Tasks 5, 7, 8 are implemented by
// separate agents that cannot see this run's console output.
await writeFile(
  join(ROOT, '_source', 'image-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log('\nwrote _source/image-manifest.json');

let total = 0;
for (const f of await readdir(OUT)) total += (await stat(join(OUT, f))).size;
console.log(`\nassets/img total: ${(total / 1024 / 1024).toFixed(2)} MB`);
```

- [ ] **Step 4: Run it and record the output**

Run: `node tools/optimize-images.mjs`

Expected: **25** mappings printed (4 hero + 7 headshot + 14 gallery), no "Missing source images" error, and a total well under 15 MB.

Then confirm the manifest is usable — Tasks 5, 7, 8 depend on it:

```bash
node -e "const m=require('./_source/image-manifest.json');const n=Object.keys(m).length;const bad=Object.entries(m).filter(([,v])=>v.widths.length===0);console.log('entries:',n);console.log('zero-width entries:',bad.map(([k])=>k).join(', ')||'none');if(n!==25||bad.length)process.exit(1)"
```

Expected: `entries: 25`, `zero-width entries: none`, exit 0.

- [ ] **Step 5: Confirm the size budget**

Measure real bytes — `du -sh` rounds too coarsely to adjudicate this:

```bash
find assets/img -type f -printf '%s
' | awk '{t+=$1} END {printf "disk: %.2f MB
", t/1048576}'
```

Expected: at or under ~18 MB on disk. **Do not lower encode quality below
AVIF 55 / WebP 72 / JPEG 78 to hit a number** — the binding budget is per-page
transfer, verified in Task 11, not disk footprint.

- [ ] **Step 6: Commit**

```bash
git add tools/package.json tools/package-lock.json tools/optimize-images.mjs _source assets
git commit -m "Generate optimized responsive images

Copies originals to _source/ and emits AVIF/WebP/JPEG at three widths
into assets/img, normalizing the inconsistent NTG/NT_G/NTH source names
to hero-NN, headshot-NN, gallery-NN.

Originals are copied rather than moved so the existing pages keep
working until the rebuild is complete."
```

---

### Task 3: Design system foundation

The stylesheet every page consumes. No page uses it yet, so nothing visibly changes.

**Files:**
- Create: `assets/css/site.css`
- Create: `assets/fonts/mirra.woff2`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties listed in Global Constraints; utility classes `.wrap`, `.visually-hidden`, `.skip-link`; component classes `.site-nav`, `.nav-toggle`, `.nav-overlay`, `.grid-gallery`, `.figure`, `.reveal`.

- [ ] **Step 1: Convert Mirra to woff2**

**Gate (R2):** confirm Mirra's license permits web embedding before this step. If it does not, download Playfair Display's variable woff2 and name it `assets/fonts/mirra.woff2` — every downstream reference stays correct.

```bash
python -m pip install --quiet fonttools brotli
mkdir -p assets/fonts
python -m fontTools.ttLib.woff2 compress -o assets/fonts/mirra.woff2 _source/fonts/Mirra.otf
ls -l assets/fonts/mirra.woff2
```

Expected: a file well under 23 KB.

- [ ] **Step 2: Write the stylesheet**

Create `assets/css/site.css`:

```css
/* ---------- Tokens ---------- */
:root {
  --paper: #E8E6E4;
  --panel: #F2F0EF;
  --ink: #111111;
  --ink-muted: #55514E;
  --line: rgba(17, 17, 17, 0.14);
  --ink-invert: #F2F0EF;
  --overlay: rgba(17, 17, 17, 0.72);

  --font-body: "Times New Roman", Times, serif;
  --font-display: "Mirra", "Times New Roman", Times, serif;

  --step--1: clamp(0.83rem, 0.79rem + 0.18vw, 0.94rem);
  --step-0: clamp(1.06rem, 1.00rem + 0.31vw, 1.25rem);
  --step-1: clamp(1.33rem, 1.21rem + 0.58vw, 1.75rem);
  --step-2: clamp(1.66rem, 1.44rem + 1.08vw, 2.62rem);
  --step-3: clamp(2.07rem, 1.68rem + 1.95vw, 3.93rem);
  --step-4: clamp(2.59rem, 1.90rem + 3.44vw, 5.90rem);

  --space-2xs: clamp(0.5rem, 0.47rem + 0.16vw, 0.62rem);
  --space-xs: clamp(0.75rem, 0.70rem + 0.24vw, 0.94rem);
  --space-s: clamp(1rem, 0.94rem + 0.31vw, 1.25rem);
  --space-m: clamp(1.5rem, 1.41rem + 0.47vw, 1.87rem);
  --space-l: clamp(2rem, 1.87rem + 0.63vw, 2.5rem);
  --space-xl: clamp(3rem, 2.81rem + 0.94vw, 3.75rem);
  --space-2xl: clamp(4.5rem, 4.03rem + 2.34vw, 6.25rem);
  --space-3xl: clamp(6rem, 5.06rem + 4.69vw, 9.5rem);

  --measure: 62ch;
}

@font-face {
  font-family: "Mirra";
  src: url("../fonts/mirra.woff2") format("woff2");
  font-display: swap;
}

/* ---------- Reset ---------- */
*,
*::before,
*::after { box-sizing: border-box; }

body, h1, h2, h3, p, figure, blockquote, ul, ol { margin: 0; }
ul[class], ol[class] { list-style: none; padding: 0; }

html { -webkit-text-size-adjust: 100%; }

body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: var(--step-0);
  line-height: 1.55;
  font-variant-ligatures: common-ligatures;
  -webkit-font-smoothing: antialiased;
}

img, picture, video { display: block; max-width: 100%; height: auto; }

a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
a:hover { font-style: italic; }

:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 3px;
}

/* ---------- Utilities ---------- */
.wrap {
  width: min(100% - (2 * var(--space-m)), 78rem);
  margin-inline: auto;
}

.measure { max-width: var(--measure); }

.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.skip-link {
  position: absolute;
  top: var(--space-xs);
  left: var(--space-xs);
  z-index: 20;
  padding: var(--space-2xs) var(--space-s);
  background: var(--panel);
  border: 1px solid var(--line);
  transform: translateY(-200%);
}
.skip-link:focus { transform: none; }

/* ---------- Typography ---------- */
.display {
  font-family: var(--font-display);
  font-size: var(--step-4);
  line-height: 0.95;
  letter-spacing: 0.02em;
  font-weight: 400;
}

.section-title {
  font-family: var(--font-display);
  font-size: var(--step-2);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 400;
}

.prose { max-width: var(--measure); text-wrap: pretty; hyphens: auto; }
.prose p + p { margin-top: var(--space-s); }

.caption {
  font-size: var(--step--1);
  color: var(--ink-muted);
  font-style: italic;
}

/* ---------- Navigation ---------- */
.site-nav { --nav-bg: var(--paper); }

.nav-toggle {
  position: fixed;
  inset-block-end: 0;
  inset-inline: 0;
  z-index: 12;
  width: 100%;
  padding: var(--space-s);
  background: var(--nav-bg);
  border: 0;
  border-block-start: 1px solid var(--line);
  color: inherit;
  font-family: var(--font-display);
  font-size: var(--step-1);
  cursor: pointer;
}

.nav-overlay {
  position: fixed;
  inset: 0;
  z-index: 14;
  display: none;
  place-content: center;
  background: var(--paper);
  text-align: center;
}
.nav-overlay[data-open="true"] { display: grid; }

.nav-overlay a {
  display: block;
  padding: var(--space-2xs);
  font-family: var(--font-display);
  font-size: var(--step-3);
  text-decoration: none;
}

.nav-close {
  position: absolute;
  inset-block-start: var(--space-m);
  inset-inline-end: var(--space-m);
  background: none;
  border: 0;
  color: inherit;
  font-family: var(--font-display);
  font-size: var(--step-2);
  cursor: pointer;
}

@media (min-width: 64em) {
  .nav-toggle, .nav-close { display: none; }
  .nav-overlay {
    position: fixed;
    inset: auto 0 0 0;
    display: flex;
    justify-content: center;
    gap: var(--space-m);
    padding: var(--space-s);
    background: var(--nav-bg);
    border-block-start: 1px solid var(--line);
  }
  .nav-overlay a { font-family: var(--font-body); font-size: var(--step-1); padding: 0 var(--space-s); }
}

[aria-current="page"] { font-style: italic; }

/* ---------- Galleries ---------- */
.grid-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: var(--space-s);
}

.grid-gallery.is-wide { grid-template-columns: repeat(auto-fit, minmax(min(100%, 32rem), 1fr)); }

.figure { margin: 0; }
.figure img { width: 100%; }
.figure figcaption { margin-block-start: var(--space-2xs); font-size: var(--step--1); color: var(--ink-muted); }

.span-2 { grid-column: span 2; }
@media (max-width: 47.99em) { .span-2 { grid-column: auto; } }

.is-grayscale img { filter: grayscale(1); }

/* ---------- Lightbox ---------- */
.lightbox {
  width: min(96vw, 84rem);
  max-height: 92vh;
  padding: 0;
  background: transparent;
  border: 0;
}
.lightbox::backdrop { background: var(--overlay); }
.lightbox img { max-height: 92vh; width: auto; margin-inline: auto; }

/* ---------- Video facade ---------- */
.facade {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  aspect-ratio: 16 / 9;
}
.facade img { width: 100%; height: 100%; object-fit: cover; }
.facade::after {
  content: "▶";
  position: absolute;
  inset: 50% auto auto 50%;
  translate: -50% -50%;
  display: grid;
  place-content: center;
  width: 4.5rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--overlay);
  color: var(--ink-invert);
  font-size: var(--step-1);
}
.embed { aspect-ratio: 16 / 9; }
.embed iframe { width: 100%; height: 100%; border: 0; }

/* ---------- Motion ---------- */
.reveal { opacity: 0; translate: 0 1.5rem; transition: opacity 700ms ease, translate 700ms ease; }
.reveal[data-visible="true"] { opacity: 1; translate: none; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
  .reveal { opacity: 1; translate: none; transition: none; }
}

/* No-JS fallback. A <button> cannot drive :target, so instead of a broken
   toggle the nav simply renders as a plain static list. Nothing to click,
   nothing to trap, fully keyboard accessible. */
.no-js .nav-toggle,
.no-js .nav-close { display: none; }

.no-js .nav-overlay {
  position: static;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-m);
  padding: var(--space-m);
  border-block-start: 1px solid var(--line);
}
.no-js .nav-overlay a { font-family: var(--font-body); font-size: var(--step-1); }
```

- [ ] **Step 3: Verify the CSS parses**

Run: `npx --yes csstree-validator assets/css/site.css`

Expected: no errors reported.

- [ ] **Step 4: Commit**

```bash
git add assets/css/site.css assets/fonts/mirra.woff2
git commit -m "Add design system stylesheet and woff2 display face

Tokens, reset, layout primitives, and component styles for the rebuild.
Body type is the system Times stack (zero bytes); Mirra is converted
from OTF to woff2. No page consumes this yet."
```

---

### Task 4: Shared shell — nav, JS core, and index skeleton

Delivers the nav and behavior layer, proven on `index.html`. This is the first task that changes what a visitor sees.

**Files:**
- Create: `assets/js/site.js`
- Create: `reel.html` (stub — Task 8 fills in the content)
- Modify: `index.html` (full rewrite)

**Interfaces:**
- Consumes: `assets/css/site.css` classes from Task 3.
- Produces: the shell markup block reused verbatim by Tasks 6, 7, 8, and the exported behavior `initNav()`, `initLightbox()`, `initVideoFacade()`, `initReveal()` — all invoked from `site.js`'s own entry point, so pages only need one `<script type="module" src="/assets/js/site.js" defer>`.

- [ ] **Step 1: Write the behavior module**

Create `assets/js/site.js`:

```js
// All site behavior. Loaded as a module, so it is deferred by default.
// Every feature degrades: with JS off, the nav overlay is reachable via
// a plain static list, gallery images are plain links, and the reel is a link.

document.documentElement.classList.remove('no-js');

function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const overlay = document.querySelector('.nav-overlay');
  const close = document.querySelector('.nav-close');
  if (!toggle || !overlay) return;

  // The overlay is a modal only below the desktop breakpoint. At >=64em the
  // same element is a permanently visible nav bar, and trapping focus there
  // strands the keyboard user on the last link with no way into the page.
  const isModal = window.matchMedia('(max-width: 63.999em)');

  // Only rendered elements can take focus. .nav-close is display:none at
  // desktop width, and calling focus() on it silently does nothing.
  const focusable = () =>
    [...overlay.querySelectorAll('a[href], button:not([disabled])')].filter(
      (el) => el.offsetParent !== null,
    );

  function open() {
    overlay.dataset.open = 'true';
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    focusable()[0]?.focus();
  }

  function shut() {
    overlay.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    toggle.focus();
  }

  toggle.addEventListener('click', open);
  close?.addEventListener('click', shut);

  // Crossing into desktop width leaves no modal to close, so release the
  // scroll lock rather than stranding the page unscrollable with no overlay
  // visible to explain why.
  isModal.addEventListener('change', (event) => {
    if (event.matches) return;
    overlay.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  });

  overlay.addEventListener('keydown', (event) => {
    // No trap unless the overlay is genuinely open AS a modal.
    if (overlay.dataset.open !== 'true' || !isModal.matches) return;

    if (event.key === 'Escape') {
      shut();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function initLightbox() {
  const triggers = document.querySelectorAll('[data-lightbox]');
  if (triggers.length === 0) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  const img = document.createElement('img');
  dialog.append(img);
  document.body.append(dialog);

  const sources = [...triggers];
  let index = 0;

  function show(i) {
    index = (i + sources.length) % sources.length;
    const link = sources[index];
    img.src = link.getAttribute('href');
    img.alt = link.dataset.alt ?? '';
  }

  triggers.forEach((link, i) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      show(i);
      dialog.showModal();
    });
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') show(index + 1);
    if (event.key === 'ArrowLeft') show(index - 1);
  });
}

function initVideoFacade() {
  for (const facade of document.querySelectorAll('.facade')) {
    facade.addEventListener('click', (event) => {
      event.preventDefault();
      const id = facade.dataset.youtube;
      if (!id) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'embed';
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      frame.title = facade.dataset.title ?? 'Video';
      frame.allow =
        'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture';
      frame.allowFullscreen = true;
      wrapper.append(frame);
      facade.replaceWith(wrapper);
      frame.focus();
    });
  }
}

function initReveal() {
  const targets = document.querySelectorAll('.reveal');
  if (targets.length === 0) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const el of targets) el.dataset.visible = 'true';
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.dataset.visible = 'true';
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  );

  for (const el of targets) observer.observe(el);
}

initNav();
initLightbox();
initVideoFacade();
initReveal();
```

- [ ] **Step 2: Write the shell into `index.html`**

Replace `index.html` entirely. **This exact `<header>`/`<nav>`/`<footer>` block is reused verbatim in Tasks 6, 7, 8**, with two changes per page: move `aria-current="page"` to that page's link, and demote the header's `<h1>` to `<p class="display">` — on every page except this one, the `<h1>` belongs to the page's own title, so the site name must not compete for it.

On `index.html` the header keeps the `<h1>`, because the home page's most important heading is her name. That is what a search for "Nikol Tsvetanova" should match.

```html
<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nikol Tsvetanova — Actor</title>
<link rel="stylesheet" href="/assets/css/site.css">
<script type="module" src="/assets/js/site.js"></script>
</head>
<body>

<a class="skip-link" href="#main">Skip to content</a>

<header class="wrap">
  <h1 class="display"><a href="/" style="text-decoration:none">Nikol Tsvetanova</a></h1>
</header>

<nav class="site-nav" aria-label="Primary">
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="menu">Menu</button>
  <div class="nav-overlay" id="menu" data-open="false">
    <button class="nav-close" type="button" aria-label="Close menu">×</button>
    <a href="/" aria-current="page">Home</a>
    <a href="/about">About</a>
    <a href="/reel">Reel</a>
    <a href="/assets/docs/nikol-tsvetanova-resume.pdf" target="_blank" rel="noopener">
      Resume <span aria-hidden="true">↗</span>
      <span class="visually-hidden">(opens the PDF in a new tab)</span>
    </a>
    <a href="/gallery">Gallery</a>
  </div>
</nav>

<main id="main" class="wrap">
  <p class="prose">Placeholder — content lands in Task 5.</p>
</main>

<footer class="wrap">
  <p class="caption">
    Design by <a href="https://milatsvetanova.com">Mila Tsvetanova</a>.
    Headshots by <a href="https://osberphotos.com">Jessica Osber Photography</a>.
  </p>
</footer>

</body>
</html>
```

- [ ] **Step 3: Create the reel.html stub**

The nav links to `/reel` on every page from here on, so the file must exist or
the link checker fails for Tasks 4 through 7. Create `reel.html` now using the
exact shell from Step 2 — `aria-current="page"` on the Reel link,
`<title>Nikol Tsvetanova — Reel</title>` — with a placeholder main:

```html
```html
<main id="main" class="wrap">
  <h1 class="section-title">Reel</h1>

  <section aria-labelledby="comedic-title" class="reveal" style="margin-block-start: var(--space-l)">
    <h2 id="comedic-title" class="section-title">Comedic</h2>
    <button class="facade" type="button" data-youtube="22yu1JbPBBU" data-title="Nikol Tsvetanova — comedic demo reel" style="margin-block-start: var(--space-m)">
      <img src="/assets/img/reel-comedic-1280.jpg" width="1280" height="720" alt="" loading="lazy" decoding="async">
      <span class="visually-hidden">Play comedic demo reel — Nikol Tsvetanova</span>
    </button>
    <noscript>
      <p class="caption"><a href="https://www.youtube.com/watch?v=22yu1JbPBBU" target="_blank" rel="noopener">Watch the comedic demo reel on YouTube</a></p>
    </noscript>
  </section>

  <section aria-labelledby="dramatic-title" class="reveal" style="margin-block-start: var(--space-2xl)">
    <h2 id="dramatic-title" class="section-title">Dramatic</h2>
    <button class="facade" type="button" data-youtube="SVTmLpR39m8" data-title="Nikol Tsvetanova — dramatic demo reel" style="margin-block-start: var(--space-m)">
      <img src="/assets/img/reel-dramatic-1280.jpg" width="1280" height="720" alt="" loading="lazy" decoding="async">
      <span class="visually-hidden">Play dramatic demo reel — Nikol Tsvetanova</span>
    </button>
    <noscript>
      <p class="caption"><a href="https://www.youtube.com/watch?v=SVTmLpR39m8" target="_blank" rel="noopener">Watch the dramatic demo reel on YouTube</a></p>
    </noscript>
  </section>

  <section aria-labelledby="clips-title" style="margin-block-start: var(--space-3xl)">
    <h2 id="clips-title" class="section-title">Clips</h2>
    <div class="grid-gallery" style="margin-block-start: var(--space-l)">
      <!-- One <figure> per clip. Nothing downloads until played:
           preload="none" plus a poster costs one small JPEG.
      <figure class="figure">
        <video controls playsinline preload="none"
               poster="/assets/video/clip-01-poster.jpg"
               width="1280" height="720">
          <source src="/assets/video/clip-01.mp4" type="video/mp4">
        </video>
        <figcaption>Scene title — Production</figcaption>
      </figure>
      -->
    </div>
    <p class="caption" style="margin-block-start: var(--space-m)">Individual clips coming soon.</p>
  </section>
</main>
```

Each `alt` is empty because the visually-hidden span already labels its button; a described poster would double-announce. Note there are now three `<h2>`s and still exactly one `<h1>`.

- [ ] **Step 3: Add the clip encoder for later use**

Create `tools/encode-clips.sh`. **Requires ffmpeg, which is not installed on this machine** — it is unused at launch and only needed when clips exist:

```bash
#!/usr/bin/env bash
# One-time clip encoder. Requires ffmpeg (not currently installed).
# Usage: tools/encode-clips.sh _source/video/*.mov
set -euo pipefail

out="assets/video"
mkdir -p "$out"

for src in "$@"; do
  name="$(basename "${src%.*}")"
  ffmpeg -nostdin -i "$src" \
    -vf "scale='min(1920,iw)':-2" \
    -c:v libx264 -profile:v high -crf 23 -preset slow \
    -c:a aac -b:a 128k -movflags +faststart \
    "$out/$name.mp4"
  ffmpeg -nostdin -i "$src" -vf "thumbnail,scale='min(1280,iw)':-2" \
    -frames:v 1 -q:v 4 "$out/$name-poster.jpg"
  echo "encoded $name"
done
```

Run: `chmod +x tools/encode-clips.sh`

- [ ] **Step 4: Run the link checker**

Run: `mkdir -p assets/video && touch assets/video/.gitkeep && node tools/check-links.mjs`

Expected: `reel.html` contributes zero failures. The commented-out clip markup is inside an HTML comment, so it is not parsed as a reference.

- [ ] **Step 5: Verify the facade**

With the server running, load `/reel`. Confirm the poster shows with a play affordance, that **no request to youtube.com appears in the Network tab before clicking**, and that clicking swaps in the iframe and plays. With JS disabled, the `<noscript>` link is present.

- [ ] **Step 6: Commit**

```bash
git add reel.html tools/encode-clips.sh assets/video/.gitkeep _source assets/img tools/optimize-images.mjs
git commit -m "Add reel page with click-to-load YouTube facade

No third-party request fires until the visitor presses play. Clip
gallery ships scaffolded but empty (spec R1) since no clip files exist
yet; encoder script is included for when they do."
```

---

### Task 9: Metadata, SEO, and 404

**Files:**
- Modify: `index.html`, `about.html`, `reel.html`, `gallery.html` (`<head>` only)
- Create: `404.html`, `robots.txt`, `sitemap.xml`, `favicon.svg`

**Interfaces:**
- Consumes: all pages from Tasks 4–8.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the shared head block to all four pages**

Insert into each `<head>`, changing `PAGE_PATH`, `PAGE_TITLE`, and `PAGE_DESC` per page:

```html
<meta name="description" content="PAGE_DESC">
<link rel="canonical" href="https://nikoltsvetanova.com/PAGE_PATH">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Nikol Tsvetanova">
<meta property="og:title" content="PAGE_TITLE">
<meta property="og:description" content="PAGE_DESC">
<meta property="og:url" content="https://nikoltsvetanova.com/PAGE_PATH">
<meta property="og:image" content="https://nikoltsvetanova.com/assets/img/headshot-01-2400.jpg">
<meta name="twitter:card" content="summary_large_image">
```

Per-page values:

| Page | PAGE_PATH | PAGE_DESC |
|---|---|---|
| index | *(empty)* | Nikol Tsvetanova is a Bulgarian-born actor based in New York City. Headshots, reel, and credits. |
| about | `about` | About Nikol Tsvetanova, a Bulgarian-born actor based in New York City, and how to contact her representation. |
| reel | `reel` | Acting reel and scene clips for Nikol Tsvetanova, New York City. |
| gallery | `gallery` | Production photography from Nikol Tsvetanova's theatre and film work. |

- [ ] **Step 2: Add `Person` structured data to `index.html` only**

Place before `</head>`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Nikol Tsvetanova",
  "jobTitle": "Actor",
  "nationality": "Bulgarian",
  "url": "https://nikoltsvetanova.com/",
  "image": "https://nikoltsvetanova.com/assets/img/headshot-01-2400.jpg",
  "alumniOf": {
    "@type": "CollegeOrUniversity",
    "name": "SUNY Purchase"
  },
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "New York",
    "addressRegion": "NY",
    "addressCountry": "US"
  },
  "sameAs": [
    "https://www.imdb.com/name/nm13031939/",
    "https://www.instagram.com/nikoltsve/",
    "https://www.youtube.com/channel/UCEnJ1HoK6WWkHRKqN8v5GLw"
  ]
}
</script>
```

- [ ] **Step 3: Create `favicon.svg`, `robots.txt`, `sitemap.xml`, `404.html`**

`favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#E8E6E4"/>
  <text x="16" y="23" font-family="Times New Roman, serif" font-size="20"
        text-anchor="middle" fill="#111111">NT</text>
</svg>
```

`robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://nikoltsvetanova.com/sitemap.xml
```

`sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://nikoltsvetanova.com/</loc></url>
  <url><loc>https://nikoltsvetanova.com/about</loc></url>
  <url><loc>https://nikoltsvetanova.com/reel</loc></url>
  <url><loc>https://nikoltsvetanova.com/gallery</loc></url>
</urlset>
```

`404.html` uses the Task 4 shell with no `aria-current`, `<title>Nikol Tsvetanova — Page not found</title>`, and:

```html
<main id="main" class="wrap">
  <h1 class="section-title">Page not found</h1>
  <p class="prose" style="margin-block-start: var(--space-l)">
    That page doesn't exist. Try the <a href="/">home page</a>.
  </p>
</main>
```

- [ ] **Step 4: Validate the structured data and HTML**

Run: `node -e "const m=require('fs').readFileSync('index.html','utf8').match(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/); JSON.parse(m[1]); console.log('JSON-LD valid')"`

Expected: `JSON-LD valid`.

Run: `npx --yes html-validate index.html about.html reel.html gallery.html 404.html`

Expected: zero errors. Fix any reported before committing.

- [ ] **Step 5: Commit**

```bash
git add index.html about.html reel.html gallery.html 404.html robots.txt sitemap.xml favicon.svg
git commit -m "Add metadata, Person structured data, sitemap, and 404

Person schema with sameAs to IMDb, Instagram, and YouTube is the
highest-leverage SEO item here: it is what resolves a search for her
name to this site rather than a third-party profile."
```

---

### Task 10: .htaccess

**Files:**
- Create: `.htaccess`

**Interfaces:**
- Consumes: page filenames from Tasks 4–9.
- Produces: server routing that `tools/serve.mjs` already mirrors.

- [ ] **Step 1: Write the config**

Note the ordering: the 301 for old `.html` URLs is guarded by `%{THE_REQUEST}` so it only fires for genuine browser requests, never for the internal rewrite. Getting this wrong produces an infinite redirect loop.

```apache
# ---------- Compression ----------
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/plain text/xml \
    application/javascript application/json image/svg+xml
</IfModule>

# ---------- Caching ----------
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 1 hour"
</IfModule>

<IfModule mod_headers.c>
  <FilesMatch "\.(avif|webp|jpg|jpeg|png|svg|woff2|mp4|ico)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\.(css|js)$">
    Header set Cache-Control "public, max-age=604800"
  </FilesMatch>
  <FilesMatch "\.html$">
    Header set Cache-Control "public, max-age=3600"
  </FilesMatch>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

# ---------- MIME types Apache may not know ----------
<IfModule mod_mime.c>
  AddType image/avif .avif
  AddType font/woff2 .woff2
</IfModule>

# ---------- Routing ----------
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Force HTTPS and the canonical host.
  RewriteCond %{HTTPS} !=on [OR]
  RewriteCond %{HTTP_HOST} ^www\.(.+)$ [NC]
  RewriteRule ^ https://nikoltsvetanova.com%{REQUEST_URI} [R=301,L]

  # Old asset URL that may have been shared with casting.
  RewriteRule ^IMAGES/Nikol%20Tsvetanova%20Resume\.pdf$ \
    /assets/docs/nikol-tsvetanova-resume.pdf [R=301,L,NE]
  RewriteRule ^IMAGES/Nikol\ Tsvetanova\ Resume\.pdf$ \
    /assets/docs/nikol-tsvetanova-resume.pdf [R=301,L,NE]

  # Retired page: headshots now live on the home page.
  RewriteRule ^headshots(\.html)?$ / [R=301,L]

  # Old .html URLs redirect to the clean form. THE_REQUEST guard means this
  # matches only real browser requests, never the internal rewrite below,
  # which would otherwise loop forever.
  RewriteCond %{THE_REQUEST} \s/+([^?\s]+)\.html[\s?] [NC]
  RewriteRule ^ /%1 [R=301,L,NE]

  # Internal rewrite: /about serves about.html with no redirect hop.
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME}\.html -f
  RewriteRule ^(.+)$ $1.html [L]
</IfModule>

ErrorDocument 404 /404.html

# ---------- Never serve working directories ----------
RedirectMatch 404 ^/(_source|tools|docs)/
```

- [ ] **Step 2: Sanity-check the syntax**

Run: `grep -c RewriteRule .htaccess`

Expected: `6`. Apache syntax cannot be fully validated without Apache; the real test is V9 in Task 12.

- [ ] **Step 3: Commit**

```bash
git add .htaccess
git commit -m "Add .htaccess: caching, compression, and clean URLs

Supplies cache headers the host currently sends none of. Internal links
are extensionless and rewritten server-side with no redirect hop; only
inbound .html URLs are 301'd, guarded by THE_REQUEST to avoid a loop.
Keeps the 2024 resume PDF URL alive and retires /headshots to /."
```

---

### Task 11: Cleanup and full verification

Removes the old site and runs every check in spec §13.

**Files:**
- Delete: `IMAGES/`, `TYPEFACES/`, `headshots.html`, `nikolScript.js`, `type.css`

- [ ] **Step 1: Delete the superseded files**

```bash
git rm -r --quiet IMAGES TYPEFACES
git rm --quiet headshots.html nikolScript.js type.css
```

`_source/` retains every original, so nothing is lost. The untracked 313 MB reel master still sits in the working tree — **do not delete it**; Task 12 handles it.

- [ ] **Step 2: V2 — link checker must now pass**

Run: `node tools/check-links.mjs`

Expected: `PASS: all local references resolve`, exit code 0. This is the green that Task 1's red was set up for.

- [ ] **Step 3: V3 — HTML validity**

Run: `npx --yes html-validate index.html about.html reel.html gallery.html 404.html`

Expected: zero errors.

- [ ] **Step 4: V6 — payload budget**

```bash
node -e "
const m=require('./_source/image-manifest.json'),fs=require('fs');let t=0;
for(const[k,v]of Object.entries(m)){if(!k.startsWith('gallery'))continue;
const w=v.widths.filter(x=>x<=1280).pop()??v.widths[0];
t+=fs.statSync('assets/img/'+k+'-'+w+'.avif').size;}
console.log('gallery page AVIF transfer:',(t/1048576).toFixed(2),'MB');"
```

Expected: under 1.5 MB.

- [ ] **Step 5: V1 — responsive pass**

With `node tools/serve.mjs` running, load each of `/`, `/about`, `/reel`, `/gallery`, `/404.html` at 375 / 768 / 1024 / 1280 / 1920 px. Confirm at every width: no horizontal scrollbar, no overlapping elements, nav usable.

- [ ] **Step 6: V4 — accessibility**

Run against the live preview server, per page:

```bash
npx --yes @axe-core/cli http://localhost:8080/ http://localhost:8080/about \
  http://localhost:8080/reel http://localhost:8080/gallery
```

Expected: zero violations. Then a manual keyboard pass on each page: `Tab` reaches every interactive element, focus is always visible, and no keyboard trap exists outside the intentional nav-overlay trap.

**These five nav behaviours are carried forward from Task 4, which could not
drive a browser and verified them only by reading the code. They are unconfirmed
until observed here — do not mark V4 passed without actually exercising them:**

1. At a narrow viewport, the Menu button opens the overlay.
2. While the overlay is open, `Tab` cycles within it and never escapes to the page behind.
3. `Escape` closes the overlay.
4. On close, focus returns to the Menu button that opened it.
5. `Tab` from a fresh page load reveals the "Skip to content" link, and activating it moves focus to `<main>`.

- [ ] **Step 7: V5 — Lighthouse**

```bash
npx --yes lighthouse http://localhost:8080/ --quiet --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=/tmp/lh-index.json
node -e "const r=require('/tmp/lh-index.json');for(const[k,v]of Object.entries(r.categories))console.log(k,Math.round(v.score*100))"
```

Repeat for `/about`, `/reel`, `/gallery`. Expected: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95. **Record the actual numbers** — do not claim a threshold was met without the output.

- [ ] **Step 8: V7 — progressive enhancement**

Disable JavaScript in the browser and reload each page. Confirm: the nav renders as a plain static list of links (no dead toggle button), gallery images open as plain full-size links, and the reel `<noscript>` link is present.

- [ ] **Step 9: V8 — reduced motion**

Enable OS "reduce motion" (or emulate it in DevTools) and reload. Confirm no reveal animation runs and all content is immediately visible.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Remove superseded site files and pass full verification

Deletes IMAGES/, TYPEFACES/, headshots.html, nikolScript.js, and
type.css; originals are preserved in _source/. Link checker now passes,
closing the P13 failure that Task 1 established as the baseline."
```

---

### Task 12: Deploy and post-deploy verification

**Gated on the user.** Do not perform any step here without explicit confirmation — it is outward-facing and includes an irreversible deletion.

- [ ] **Step 1: Confirm blockers are cleared**

Do not deploy while any of these is unresolved:

- **R5** — cleared in Task 8; both real video IDs are embedded. Confirm no placeholder survived: `grep -nE 'REEL_ID|VIDEO_ID|PLACEHOLDER' reel.html` must produce no output.
- **R2** — Mirra's web-embedding license confirmed, or Playfair substituted.
- **R3** — alt text and photo credits reviewed by Nikol.

- [ ] **Step 2: Back up the reel master (R4)**

The 313 MB master is untracked and exists in exactly two places: this working tree and the server. Copy it to external storage and verify the copy opens **before** anything is deleted.

```bash
ls -l "IMAGES/Nikol Tsvetanova Reel.mp4" 2>/dev/null || \
  ls -l _source/video/ 2>/dev/null || echo "LOCATE THE MASTER BEFORE PROCEEDING"
```

- [ ] **Step 3: Upload**

Upload to the HostGator web root, **excluding** `_source/`, `tools/`, `docs/`, `.git/`, `.gitignore`, `.gitattributes`. Include `.htaccess` — FTP clients hide dotfiles by default, so verify it transferred.

Deploy set: `index.html`, `about.html`, `reel.html`, `gallery.html`, `404.html`, `robots.txt`, `sitemap.xml`, `favicon.svg`, `.htaccess`, `assets/`.

- [ ] **Step 4: Delete the old server files**

Only after Step 2's backup is verified: remove the server's `IMAGES/`, `TYPEFACES/`, `headshots.html`, `nikolScript.js`, and `type.css`. This reclaims the 313 MB.

- [ ] **Step 5: V9 — verify routing in production**

```bash
curl -sI https://nikoltsvetanova.com/assets/docs/nikol-tsvetanova-resume.pdf | head -3
curl -sI "https://nikoltsvetanova.com/IMAGES/Nikol%20Tsvetanova%20Resume.pdf" | head -3
curl -sI https://nikoltsvetanova.com/about | head -3
curl -sI https://nikoltsvetanova.com/about.html | head -3
curl -sI https://nikoltsvetanova.com/headshots.html | head -3
curl -sI https://nikoltsvetanova.com/tools/check-links.mjs | head -3
```

Expected, in order: `200` with `application/pdf`; `301` to the new PDF path; `200`; `301` to `/about`; `301` to `/`; `404`.

- [ ] **Step 6: Confirm cache headers landed**

```bash
curl -sI https://nikoltsvetanova.com/assets/css/site.css | grep -i cache-control
```

Expected: `Cache-Control: public, max-age=604800`. If absent, `mod_headers` is unavailable on the plan — report it rather than working around it silently.

- [ ] **Step 7: Commit the deploy record**

```bash
git commit --allow-empty -m "Deploy modernized site to production

Verified in production: clean URLs resolve, the 2024 resume PDF URL
still redirects, /headshots retires to /, and working directories are
not served."
```

---

## Self-Review

**Spec coverage.** Every numbered spec section maps to a task: §5 architecture → Tasks 2, 4; §6 design system → Task 3; §7 media → Tasks 2, 8; §8 JavaScript → Task 4; §9 resume → Tasks 2 (PDF move), 4 (nav link), 10 (301); §10 accessibility → Tasks 4, 6, 7, 11; §11 SEO → Task 9; §12 server config → Task 10; §13 verification V1–V8 → Task 11, V9 → Task 12; §14 risks R1–R6 → gated in Tasks 3, 8, 12.

**One spec correction, applied here.** Spec §12 called for extensionless URLs *and* a 301 from `.html`, which would have sent every internal link through a redirect. This plan authors internal links extensionless and rewrites them internally, 301ing only inbound `.html` URLs, guarded by `%{THE_REQUEST}` to avoid a rewrite loop. `tools/serve.mjs` mirrors the rule so local matches production.

**Known gaps, deliberate.** R1: clips do not exist, so Task 8 ships the gallery scaffolded and empty with the encoder ready — this is the one goal not fully delivered, and it is blocked on files, not effort. R5: the YouTube ID is required before deploy and is gated in Task 12 Step 1. ffmpeg is not installed on this machine and is needed only when clips arrive.
