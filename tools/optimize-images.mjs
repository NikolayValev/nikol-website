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
  await pipeline.clone().avif({ quality: 10 }).toFile(join(OUT, `${name}-${label}.avif`));
  await pipeline.clone().webp({ quality: 8 }).toFile(join(OUT, `${name}-${label}.webp`));
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
  for (const width of widths) await emit(input, name, width, String(width));

  // -full always exists, whatever the source size, so lightbox hrefs and
  // og:image can reference one predictable URL per image.
  const fullWidth = Math.min(meta.width, 2400);
  await emit(input, name, fullWidth, 'full');

  manifest[name] = { width: meta.width, height: meta.height, widths };
  console.log(`${from}  ->  ${name}  (${meta.width}x${meta.height})  widths: ${widths.join(', ') || 'none'} + full@${fullWidth}`);
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
