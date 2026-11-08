// Checks the layout designer (assets/js/layout-designer.js). Delete this file
// along with the designer if the tool is removed.
// Needs the local server: node tools/serve.mjs
import puppeteer from 'puppeteer';

const base = 'http://localhost:8080';
const b = await puppeteer.launch({ headless: 'new' });
const out = [];
const say = (l, ok, d = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${l}${d ? '  — ' + d : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const state = (p) => p.evaluate(() => {
  const slides = [...document.querySelectorAll('.strip-slide:not([aria-hidden="true"])')].map((x) => x.getBoundingClientRect());
  const row = document.querySelector('.strip-track').getBoundingClientRect();
  const h1 = document.querySelector('h1.display');
  return {
    slides: slides.map((r) => [r.left, r.right, r.top, r.bottom]),
    row: [row.left, row.right, row.width],
    fs: parseFloat(getComputedStyle(h1).fontSize),
    footer: document.querySelector('.site-footer').getBoundingClientRect().bottom,
    vh: innerHeight,
    panel: !!document.querySelector('.ld-panel'),
    read: document.querySelector('.ld-read')?.textContent || '',
    guides: document.querySelectorAll('.ld-guides i').length,
  };
});
const set = async (p, key, value) => {
  await p.$eval(`[data-ld="${key}"]`, (el, v) => {
    if (el.type === 'checkbox') { el.checked = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
    else { el.value = v; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }
  }, value);
  await wait(250);
};
const lastLine = (s) => s.trim().split('\n').pop();

// --- inert without ?design ---
let p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
await p.goto(base + '/', { waitUntil: 'networkidle0' });
say('no panel without ?design', !(await state(p)).panel);
const plain = await state(p);
await p.close();

// --- with ?design ---
p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
await p.goto(base + '/?design', { waitUntil: 'networkidle0' });
await wait(600);
const a = await state(p);
say('panel appears with ?design', a.panel);
say('starts where the page is: fits the screen', a.footer <= a.vh + 0.5, `footer ends ${Math.round(a.footer)} of ${a.vh}`);
say('starts at the page\'s own row width (within 4px)', Math.abs(a.row[2] - plain.row[2]) < 4, `${Math.round(a.row[2])} vs ${Math.round(plain.row[2])}`);
say('guides are drawn', a.guides > 8, `${a.guides} guide elements`);
say('the readout reports the fit', /Fits/.test(lastLine(a.read)), lastLine(a.read));

// a bigger side margin: a narrower row
await set(p, 'side', 200);
let c = await state(p);
say('side margin limits the row', c.row[2] <= 1440 - 400 + 1 && c.row[2] < a.row[2], `${Math.round(c.row[2])}px`);
await set(p, 'side', 24);

// fit off, a wide row: overflows and says so
await set(p, 'fit', false);
await set(p, 'rowW', 1300);
c = await state(p);
say('fit off: the row width is the slider\'s', Math.abs(c.row[2] - 1300) < 2, `${Math.round(c.row[2])}px`);
say('fit off: too tall, and the readout warns', c.footer > c.vh && /Too tall/.test(c.read), lastLine(c.read));
await set(p, 'fit', true);

// title size by hand, with fit on: the row gives way, the page still fits
await set(p, 'titleMode', 'custom');
await set(p, 'titleSize', 160);
c = await state(p);
say('custom title size is applied', Math.abs(c.fs - 160) < 1, `${c.fs}px`);
say('...and the row shrinks so the page still fits', c.footer <= c.vh + 0.5 && c.row[2] < a.row[2], `row ${Math.round(c.row[2])}, footer ${Math.round(c.footer)}`);
await set(p, 'titleMode', 'match');

// gaps
await set(p, 'gapTop', 100);
c = await state(p);
const gaps = c.read.match(/Gaps\s+(\d+) · (\d+) · (\d+) · (\d+) · (\d+)/);
say('"above the title" gap is the one set', gaps && Math.abs(Number(gaps[1]) - 100) <= 1, gaps ? `gaps ${gaps.slice(1).join(' ')}` : c.read);
say('gap changes keep the page one screen', c.footer <= c.vh + 0.5);
await set(p, 'gapTop', 58);

// shapes: same shape crops to one ratio, all four identical
await set(p, 'shapes', 'same');
await set(p, 'ratio', 0.6);
c = await state(p);
const ratios = c.slides.map((r) => (r[1] - r[0]) / (r[3] - r[2]));
say('"same shape": all four are the chosen ratio', ratios.every((x) => Math.abs(x - 0.6) < 0.01), ratios.map((x) => x.toFixed(3)).join(' '));
await set(p, 'shapes', 'natural');
c = await state(p);
const nat = c.slides.map((r) => (r[1] - r[0]) / (r[3] - r[2]));
say('"as photographed": back to their own ratios', Math.abs(nat[3] - 0.733) < 0.01 && Math.abs(nat[0] - 0.6455) < 0.01, nat.map((x) => x.toFixed(3)).join(' '));

// title alignment
await set(p, 'titleAlign', 'edges');
c = await state(p);
const hd = await p.$eval('h1.display', (h) => {
  const t = [];
  const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim()) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    t.push(...r.getClientRects());
  }
  const fs = parseFloat(getComputedStyle(h).fontSize);
  return [Math.min(...t.map((q) => q.left)) + 0.02 * fs, Math.max(...t.map((q) => q.right)) - 0.173 * fs];
});
say('"outer edges": the title spans the row', Math.abs(hd[0] - c.row[0]) < 3 && Math.abs(hd[1] - c.row[1]) < 3,
  `${Math.round(hd[0])}-${Math.round(hd[1])} vs ${Math.round(c.row[0])}-${Math.round(c.row[1])}`);
await set(p, 'titleAlign', 'centres');

// hold still: the picture row does not move over time
const x0 = (await state(p)).slides[0][0];
await wait(4500);
const x1 = (await state(p)).slides[0][0];
say('hold still keeps the pictures put', Math.abs(x0 - x1) < 1, `${x0.toFixed(1)} -> ${x1.toFixed(1)}`);

// reset
await p.$$eval('.ld-btn', (bs) => bs.find((x) => x.textContent === 'Reset').click());
await wait(400);
const r = await state(p);
say('reset returns to the page\'s own layout', Math.abs(r.row[2] - plain.row[2]) < 4, `row ${Math.round(r.row[2])} vs ${Math.round(plain.row[2])}`);

// copy
const copied = await p.evaluate(() => {
  [...document.querySelectorAll('.ld-btn')].find((x) => x.textContent === 'Copy settings').click();
  return true;
});
say('copy settings runs without error', copied);
await p.close();

// --- tablet/phone: the tool steps aside ---
p = await b.newPage();
await p.setViewport({ width: 820, height: 1180 });
await p.goto(base + '/?design', { waitUntil: 'networkidle0' });
await wait(500);
const t = await state(p);
say('tablet: tool leaves the layout alone (one screen, no overrides)', t.footer <= t.vh + 0.5 && /tablet\/phone/.test(t.read), t.read);
await p.close();

// --- other pages never load the tool ---
p = await b.newPage();
await p.goto(base + '/about?design', { waitUntil: 'networkidle0' });
say('other pages ignore ?design', !(await p.$('.ld-panel')));
await p.close();

await b.close();
console.log(out.join('\n'));
console.log(out.some((l) => l.startsWith('FAIL')) ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
