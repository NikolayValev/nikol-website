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

// direction: scrollLeft must INCREASE (strip travels leftward, images enter
// from the right edge)
const a0 = await p.$eval('.carousel-track', t => t.scrollLeft);
await wait(4200);
const a1 = await p.$eval('.carousel-track', t => t.scrollLeft);
say('moves right-to-left (scrollLeft increases)', a1 > a0, `${Math.round(a0)} -> ${Math.round(a1)}`);

// Faster cadence. Sampling raw displacement under-reports across a wrap, so
// accumulate forward movement and treat a large backward jump as one loop.
const stepPx = await p.$eval('.carousel-track', t => {
  const s = t.querySelector('.carousel-slide');
  return s.getBoundingClientRect().width + (parseFloat(getComputedStyle(t).columnGap) || 0);
});
const loopPx = stepPx * 4;
let travelled = 0;
let prev = await p.$eval('.carousel-track', t => t.scrollLeft);
for (let i = 0; i < 30; i++) {
  await wait(250);
  const now = await p.$eval('.carousel-track', t => t.scrollLeft);
  let delta = now - prev;
  if (delta < -loopPx / 2) delta += loopPx;      // wrapped
  travelled += Math.max(0, delta);
  prev = now;
}
const moved = travelled / stepPx;
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
const aboutImgs = await p.$$eval('[data-lightbox]', e => e.length);
say('about has exactly one portrait', aboutImgs === 1, `${aboutImgs} found`);
say('about still shows credits', (await p.$$('footer')).length === 1);
const sideBySide = await p.evaluate(() => {
  const fig = document.querySelector('.bio-portrait');
  const prose = document.querySelector('.bio .prose');
  if (!fig || !prose) return false;
  const f = fig.getBoundingClientRect(), t = prose.getBoundingClientRect();
  return f.right <= t.left + 1;   // portrait sits to the left of the text
});
say('portrait sits left of the bio text', sideBySide);
const noResumeSentence = await p.evaluate(() =>
  !document.querySelector('main').textContent.includes('You can view her'));
say('resume sentence removed from About', noResumeSentence);
await p.close();

// --- contact page ---
p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.goto('http://localhost:8080/contact', { waitUntil: 'networkidle0' });
const c = await p.evaluate(() => ({
  h1: document.querySelectorAll('h1').length,
  email: !!document.querySelector('a[href^="mailto:"]'),
  resume: !!document.querySelector('a[href$="resume.pdf"]'),
  current: document.querySelector('[aria-current="page"]')?.textContent.trim(),
}));
say('contact page exists with one h1', c.h1 === 1);
say('contact has the agent email', c.email);
say('contact has the resume download', c.resume);
say('contact marked current in nav', c.current === 'Contact', `current: ${c.current}`);
await p.close();

// --- resume is gone from every nav ---
p = await b.newPage();
let navResume = 0;
for (const u of ['/', '/about', '/reel', '/contact', '/gallery']) {
  await p.goto('http://localhost:8080' + u, { waitUntil: 'domcontentloaded' });
  navResume += await p.$$eval('nav a', els => els.filter(a => /resume/i.test(a.textContent)).length);
}
say('no Resume tab in any nav', navResume === 0, `${navResume} found`);
await p.close();

await b.close();
console.log(out.join('\n'));
console.log(out.some(l => l.startsWith('FAIL')) ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
