#!/usr/bin/env node
// Renders the résumé PDF to the images the Resume page shows.
// Run it again whenever assets/docs/nikol-tsvetanova-resume.pdf changes:
//   cd tools && npm install && cd ..
//   node tools/render-resume.mjs
// Chrome draws the PDF (there is no PDF renderer in sharp), the dark viewer
// around the page is cropped off by finding the white page's edges, and the
// page is written as WebP and PNG at a few widths into assets/img/.
// Only single-page résumés are handled; it stops if the PDF has more.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const PDF = resolve(ROOT, 'assets/docs/nikol-tsvetanova-resume.pdf');
const OUT = resolve(ROOT, 'assets/img');
const WIDTHS = [1000, 1600, 2400];

const bytes = await readFile(PDF, 'latin1');
const pages = (bytes.match(/\/Type\s*\/Page\b/g) || []).length;
if (pages !== 1) throw new Error(`expected a one-page résumé, found ${pages} pages`);
const box = bytes.match(/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
const ratio = box ? (box[4] - box[2]) / (box[3] - box[1]) : null;

// Wide enough that the page renders at more than the largest width wanted.
const b = await puppeteer.launch({ headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 1100, height: 1500, deviceScaleFactor: 2.5 });
await p.goto(`${pathToFileURL(PDF)}#toolbar=0&navpanes=0&view=FitH`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 4000)); // the viewer draws after load
const shot = await p.screenshot({ type: 'png' });
await b.close();

// Find the white page: walk in from the edges along the middle until the
// pixels turn white, then step 1px further in to drop the anti-aliased edge.
const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const lum = (x, y) => data[(y * info.width + x) * 3];
const midY = Math.round(info.height * 0.4);
let left = 0; while (lum(left, midY) < 240) left++;
let right = info.width - 1; while (lum(right, midY) < 240) right--;
let top = 0; while (lum(left + 5, top) < 240) top++;
let bottom = info.height - 1; while (lum(left + 5, bottom) < 240) bottom--;
const crop = { left: left + 1, top: top + 1, width: right - left - 1, height: bottom - top - 1 };
const got = crop.height / crop.width;
if (ratio && Math.abs(got - ratio) > 0.01) {
  throw new Error(`cropped page is ${got.toFixed(3)} tall per wide, the PDF says ${ratio.toFixed(3)}: part of the page is cut off`);
}

const page = await sharp(shot).extract(crop).toBuffer();
for (const w of WIDTHS.filter((x) => x <= crop.width)) {
  const img = sharp(page).resize({ width: w });
  await img.clone().webp({ quality: 88 }).toFile(`${OUT}/resume-${w}.webp`);
  await img.clone().png({ compressionLevel: 9, palette: true }).toFile(`${OUT}/resume-${w}.png`);
  console.log(`resume-${w}  ${w}x${Math.round(w * got)}`);
}
console.log(`page ${crop.width}x${crop.height}, ratio ${got.toFixed(4)}${ratio ? ` (PDF ${ratio.toFixed(4)})` : ''}`);
