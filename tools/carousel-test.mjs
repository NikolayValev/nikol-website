import puppeteer from 'puppeteer';
const url = 'http://localhost:8080/';
const b = await puppeteer.launch({ headless: 'new' });
const out = [];
const say = (l, ok, d = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${l}${d ? '  — ' + d : ''}`);
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// --- desktop ---
let p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.goto(url, { waitUntil: 'networkidle0' });
await wait(500);

const geo = await p.$eval('.carousel-track', t => {
  const s = t.querySelector('.carousel-slide');
  const gap = parseFloat(getComputedStyle(t).columnGap) || 0;
  return {
    per: Math.round(t.clientWidth / (s.getBoundingClientRect().width + gap)),
    total: t.querySelectorAll('.carousel-slide').length,
    clones: t.querySelectorAll('.carousel-slide[aria-hidden="true"]').length,
  };
});
say('desktop shows 3 at a time', geo.per === 3, `${geo.per} visible`);
say('slides duplicated for a seamless loop', geo.total === 8 && geo.clones === 4,
    `${geo.total} slides, ${geo.clones} aria-hidden clones`);

say('no play/pause control', (await p.$$('.carousel-toggle')).length === 0);
say('no dot indicators', (await p.$$('.carousel-dot')).length === 0);
say('no footer credits on home', (await p.$$('footer')).length === 0);

// equal heights
// Wait for the load-in animation to finish: getBoundingClientRect includes
// transforms, and the settle animation ends on scale(1.03) -> none, so a rect
// measured mid-flight reports a height 3% too large on whichever slides are
// still animating. offsetHeight is layout-only and immune, but wait anyway so
// the check reflects the settled page.
await p.evaluate(() => Promise.all(
  document.getAnimations().map(a => a.finished.catch(() => {}))));
const heights = await p.$$eval('.carousel-slide img', els =>
  els.slice(0, 4).map(e => e.offsetHeight));
say('all images the same height', new Set(heights).size === 1, `heights ${heights.join(', ')}`);

// direction: scrollLeft must DECREASE (strip travels rightward)
const a0 = await p.$eval('.carousel-track', t => t.scrollLeft);
await wait(4200);
const a1 = await p.$eval('.carousel-track', t => t.scrollLeft);
say('moves left-to-right (scrollLeft decreases)', a1 < a0, `${Math.round(a0)} -> ${Math.round(a1)}`);

// faster cadence: should advance at least twice inside ~7.5s
const b0 = await p.$eval('.carousel-track', t => t.scrollLeft);
await wait(7500);
const b1 = await p.$eval('.carousel-track', t => t.scrollLeft);
const stepPx = await p.$eval('.carousel-track', t => {
  const s = t.querySelector('.carousel-slide');
  return s.getBoundingClientRect().width + (parseFloat(getComputedStyle(t).columnGap) || 0);
});
const moved = Math.abs(b0 - b1) / stepPx;
say('rotates quicker (2+ steps in 7.5s)', moved >= 1.8, `${moved.toFixed(1)} steps`);

// the loop must never leave the safe band — that band is what hides the wrap
let outOfBand = 0;
for (let i = 0; i < 24; i++) {
  const bad = await p.$eval('.carousel-track', t => {
    const s = t.querySelector('.carousel-slide');
    const loop = (s.getBoundingClientRect().width + (parseFloat(getComputedStyle(t).columnGap) || 0)) * 4;
    return t.scrollLeft < -1 || t.scrollLeft > loop * 2 + 1;
  });
  if (bad) outOfBand++;
  await wait(500);
}
say('loop stays in band (no visible snap-back)', outOfBand === 0, `${outOfBand} excursions in 12s`);

// hover pauses
await p.hover('.carousel');
const h0 = await p.$eval('.carousel-track', t => t.scrollLeft);
await wait(4500);
const h1 = await p.$eval('.carousel-track', t => t.scrollLeft);
say('hover pauses', Math.abs(h0 - h1) < 2, `stayed at ${Math.round(h1)}`);
await p.close();

// --- mobile ---
p = await b.newPage();
await p.setViewport({ width: 375, height: 780, isMobile: true, hasTouch: true });
await p.goto(url, { waitUntil: 'networkidle0' });
await wait(400);
const per = await p.$eval('.carousel-track', t => {
  const s = t.querySelector('.carousel-slide');
  return Math.round(t.clientWidth / (s.getBoundingClientRect().width + (parseFloat(getComputedStyle(t).columnGap) || 0)));
});
say('mobile shows 1 at a time', per === 1, `${per} visible`);
say('mobile track is swipeable', await p.$eval('.carousel-track', t => t.scrollWidth > t.clientWidth + 10));
await p.close();

// --- reduced motion ---
p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await p.goto(url, { waitUntil: 'networkidle0' });
await wait(400);
const r0 = await p.$eval('.carousel-track', t => t.scrollLeft);
await wait(5000);
const r1 = await p.$eval('.carousel-track', t => t.scrollLeft);
say('reduced motion: no auto-advance', Math.abs(r0 - r1) < 2);
await p.close();

// --- no JS ---
p = await b.newPage();
await p.setJavaScriptEnabled(false);
await p.setViewport({ width: 1280, height: 900 });
await p.goto(url, { waitUntil: 'load' });
const noJs = await p.$$eval('.carousel-slide img', els => els.map(e => getComputedStyle(e).opacity));
say('no JS: images visible', noJs.every(o => Number(o) === 1), `${noJs.length} images, opacity ${[...new Set(noJs)].join('/')}`);
await p.close();

// --- about ---
p = await b.newPage();
await p.goto('http://localhost:8080/about', { waitUntil: 'networkidle0' });
say('about has 7 headshots', (await p.$$eval('[data-lightbox]', e => e.length)) === 7);
say('about still shows credits', (await p.$$('footer')).length === 1);
await p.close();

await b.close();
console.log(out.join('\n'));
console.log(out.some(l => l.startsWith('FAIL')) ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
