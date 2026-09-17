// Checks the home picture strip and the pages the Figma redesign reshaped.
// Asserts the comps' intent, not just that the code runs:
//   - four pictures across on desktop, a 2x2 block on mobile
//   - the desktop row rotates leftward, pauses on hover, and never snaps back
//   - the mobile block does not rotate and is not a sideways scroller
//   - six nav items on every page, with the current one marked
// Needs the local server: node tools/serve.mjs
import puppeteer from 'puppeteer';

const base = 'http://localhost:8080';
const b = await puppeteer.launch({ headless: 'new' });
const out = [];
const say = (l, ok, d = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${l}${d ? '  — ' + d : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- desktop home ---
let p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.goto(base + '/', { waitUntil: 'networkidle0' });
await wait(500);

const geo = await p.$eval('.strip-track', (t) => {
  const s = t.querySelector('.strip-slide');
  const gap = parseFloat(getComputedStyle(t).columnGap) || 0;
  return {
    per: Math.round(t.clientWidth / (s.getBoundingClientRect().width + gap)),
    total: t.querySelectorAll('.strip-slide').length,
    clones: t.querySelectorAll('.strip-slide[aria-hidden="true"]').length,
  };
});
say('desktop shows 4 at a time', geo.per === 4, `${geo.per} visible`);
say('slides duplicated for a seamless loop', geo.total === 8 && geo.clones === 4,
    `${geo.total} slides, ${geo.clones} aria-hidden clones`);

say('no play/pause control', (await p.$$('.strip-toggle')).length === 0);
say('no dot indicators', (await p.$$('.strip-dot')).length === 0);

// The landing frames carry the icon row and nothing else — no rule, no
// copyright, no credits.
const homeFooter = await p.evaluate(() => {
  const f = document.querySelector('.site-footer');
  if (!f) return null;
  // Absent counts as not shown: home simply omits the credit line rather than
  // rendering it and hiding it.
  const shown = (sel) => {
    const el = f.querySelector(sel);
    return !!el && getComputedStyle(el).display !== 'none';
  };
  return {
    socials: f.querySelectorAll('.socials a').length,
    noteShown: shown('.footer-note'),
    creditShown: shown('.footer-credit'),
    rule: getComputedStyle(f).borderTopWidth,
  };
});
say('home footer is the icon row only', homeFooter
    && homeFooter.socials === 3
    && !homeFooter.noteShown
    && !homeFooter.creditShown
    && homeFooter.rule === '0px',
    JSON.stringify(homeFooter));

// Nav sits below the pictures at desktop width, as the landing frames draw it.
const navBelow = await p.evaluate(() => {
  const nav = document.querySelector('.site-nav').getBoundingClientRect();
  const strip = document.querySelector('.strip').getBoundingClientRect();
  return nav.top >= strip.bottom - 1;
});
say('desktop nav sits below the pictures', navBelow);

// equal heights
// Wait for the load-in animation to finish: getBoundingClientRect includes
// transforms, and the settle animation ends on scale(1.03) -> none, so a rect
// measured mid-flight reports a height 3% too large on whichever slides are
// still animating. offsetHeight is layout-only and immune, but wait anyway so
// the check reflects the settled page.
await p.evaluate(() => Promise.all(
  document.getAnimations().map((a) => a.finished.catch(() => {}))));
const heights = await p.$$eval('.strip-slide img', (els) =>
  els.slice(0, 4).map((e) => e.offsetHeight));
say('all images the same height', new Set(heights).size === 1, `heights ${heights.join(', ')}`);

// direction: scrollLeft must INCREASE (strip travels leftward, images enter
// from the right edge)
const a0 = await p.$eval('.strip-track', (t) => t.scrollLeft);
await wait(4200);
const a1 = await p.$eval('.strip-track', (t) => t.scrollLeft);
say('moves right-to-left (scrollLeft increases)', a1 > a0, `${Math.round(a0)} -> ${Math.round(a1)}`);

// Faster cadence. Sampling raw displacement under-reports across a wrap, so
// accumulate forward movement and treat a large backward jump as one loop.
const stepPx = await p.$eval('.strip-track', (t) => {
  const s = t.querySelector('.strip-slide');
  return s.getBoundingClientRect().width + (parseFloat(getComputedStyle(t).columnGap) || 0);
});
const loopPx = stepPx * 4;
let travelled = 0;
let prev = await p.$eval('.strip-track', (t) => t.scrollLeft);
for (let i = 0; i < 30; i++) {
  await wait(250);
  const now = await p.$eval('.strip-track', (t) => t.scrollLeft);
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
  const bad = await p.$eval('.strip-track', (t) => {
    const s = t.querySelector('.strip-slide');
    const loop = (s.getBoundingClientRect().width + (parseFloat(getComputedStyle(t).columnGap) || 0)) * 4;
    return t.scrollLeft < -1 || t.scrollLeft > loop * 2 + 1;
  });
  if (bad) outOfBand++;
  await wait(500);
}
say('loop stays in band (no visible snap-back)', outOfBand === 0, `${outOfBand} excursions in 12s`);

// hover pauses
await p.hover('.strip');
const h0 = await p.$eval('.strip-track', (t) => t.scrollLeft);
await wait(4500);
const h1 = await p.$eval('.strip-track', (t) => t.scrollLeft);
say('hover pauses', Math.abs(h0 - h1) < 2, `stayed at ${Math.round(h1)}`);
await p.close();

// --- mobile home: a static 2x2 block, per the iPhone frame ---
p = await b.newPage();
await p.setViewport({ width: 375, height: 780, isMobile: true, hasTouch: true });
await p.goto(base + '/', { waitUntil: 'networkidle0' });
await wait(600);
const block = await p.$eval('.strip-track', (t) => ({
  display: getComputedStyle(t).display,
  columns: getComputedStyle(t).gridTemplateColumns.split(' ').length,
  total: t.querySelectorAll('.strip-slide').length,
  clones: t.querySelectorAll('.strip-slide[aria-hidden="true"]').length,
  overflows: t.scrollWidth > t.clientWidth + 2,
}));
say('mobile is a two-column grid', block.display === 'grid' && block.columns === 2,
    `${block.display}, ${block.columns} columns`);
say('mobile does not clone or rotate', block.total === 4 && block.clones === 0,
    `${block.total} slides, ${block.clones} clones`);
say('mobile is not a sideways scroller', !block.overflows);

// The "+" opens the sheet; the sheet carries all six links and closes again.
const sheet = await p.evaluate(() => !!document.querySelector('.nav-toggle')
  && getComputedStyle(document.querySelector('.nav-toggle')).display !== 'none');
say('mobile shows the + toggle', sheet);
await p.click('.nav-toggle');
await wait(250);
const opened = await p.evaluate(() => {
  const list = document.querySelector('.nav-list');
  return {
    open: list.dataset.open === 'true',
    visible: getComputedStyle(list).display !== 'none',
    links: list.querySelectorAll('a').length,
    expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded'),
    closeShown: getComputedStyle(document.querySelector('.nav-close')).display !== 'none',
  };
});
say('+ opens a sheet with all six links', opened.open && opened.visible
    && opened.links === 6 && opened.expanded === 'true' && opened.closeShown,
    JSON.stringify(opened));
await p.click('.nav-close');
await wait(250);
const closed = await p.$eval('.nav-list', (l) => getComputedStyle(l).display === 'none');
say('x closes the sheet', closed);
await p.close();

// --- reduced motion ---
p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await p.goto(base + '/', { waitUntil: 'networkidle0' });
await wait(400);
const r0 = await p.$eval('.strip-track', (t) => t.scrollLeft);
await wait(5000);
const r1 = await p.$eval('.strip-track', (t) => t.scrollLeft);
say('reduced motion: no auto-advance', Math.abs(r0 - r1) < 2);
await p.close();

// --- no JS ---
p = await b.newPage();
await p.setJavaScriptEnabled(false);
await p.setViewport({ width: 1280, height: 900 });
await p.goto(base + '/', { waitUntil: 'load' });
const noJs = await p.$$eval('.strip-slide img', (els) => els.map((e) => getComputedStyle(e).opacity));
say('no JS: images visible', noJs.every((o) => Number(o) === 1),
    `${noJs.length} images, opacity ${[...new Set(noJs)].join('/')}`);
const noJsNav = await p.$$eval('.nav-list a', (els) => els.length);
say('no JS: nav links still reachable', noJsNav === 6, `${noJsNav} links`);
await p.close();

// --- about: centred prose, no portrait (the comp drops it) ---
p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.goto(base + '/about', { waitUntil: 'networkidle0' });
const about = await p.evaluate(() => ({
  portraits: document.querySelectorAll('main [data-lightbox]').length,
  centred: getComputedStyle(document.querySelector('.prose')).textAlign === 'center',
  current: document.querySelector('[aria-current="page"]')?.textContent.trim(),
  credits: document.querySelectorAll('.footer-credit').length,
}));
say('about has no portrait', about.portraits === 0, `${about.portraits} found`);
say('about prose is centred', about.centred);
say('about marked current in nav', about.current === 'About', `current: ${about.current}`);
say('about still shows credits', about.credits === 1);
await p.close();

// --- contact: agency block, and the resume link has moved to /resume ---
p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.goto(base + '/contact', { waitUntil: 'networkidle0' });
const c = await p.evaluate(() => ({
  h1: document.querySelectorAll('h1').length,
  card: !!document.querySelector('.agency-card'),
  email: !!document.querySelector('a[href^="mailto:"]'),
  resume: !!document.querySelector('main a[href$="resume.pdf"]'),
  current: document.querySelector('[aria-current="page"]')?.textContent.trim(),
}));
say('contact page exists with one h1', c.h1 === 1);
say('contact has the agency card', c.card);
say('contact has the agent email', c.email);
say('resume download no longer on contact', !c.resume);
say('contact marked current in nav', c.current === 'Contact', `current: ${c.current}`);
await p.close();

// --- resume page carries the PDF ---
p = await b.newPage();
await p.goto(base + '/resume', { waitUntil: 'networkidle0' });
const r = await p.evaluate(() => ({
  pdf: !!document.querySelector('main a[href$="resume.pdf"]'),
  current: document.querySelector('[aria-current="page"]')?.textContent.trim(),
}));
say('resume page has the PDF', r.pdf);
say('resume marked current in nav', r.current === 'Resume', `current: ${r.current}`);
await p.close();

// --- the placeholder page is reachable and not indexable ---
p = await b.newPage();
await p.goto(base + '/headshots', { waitUntil: 'networkidle0' });
const hs = await p.evaluate(() => ({
  status: document.querySelector('h1')?.textContent.trim(),
  noindex: document.querySelector('meta[name="robots"]')?.content.includes('noindex'),
}));
say('headshots placeholder is reachable', hs.status === 'Headshots', `h1: ${hs.status}`);
say('headshots placeholder is noindex', !!hs.noindex);
await p.close();

// --- the Figma nav, on every page ---
p = await b.newPage();
const LABELS = ['About', 'Headshots', 'Reel', 'Resume', 'Gallery', 'Contact'];
let navWrong = [];
for (const u of ['/', '/about', '/headshots', '/reel', '/resume', '/gallery', '/contact', '/404.html']) {
  await p.goto(base + u, { waitUntil: 'domcontentloaded' });
  const labels = await p.$$eval('.nav-list a', (els) => els.map((a) => a.textContent.trim()));
  if (labels.join('|') !== LABELS.join('|')) navWrong.push(`${u}: ${labels.join(',')}`);
}
say('all six Figma nav items on every page', navWrong.length === 0, navWrong.join(' ; '));
await p.close();

await b.close();
console.log(out.join('\n'));
console.log(out.some((l) => l.startsWith('FAIL')) ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
