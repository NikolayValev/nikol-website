// Checks the home picture strip and the pages the Figma redesign reshaped.
// Asserts the comps' intent, not just that the code runs:
//   - four pictures across on desktop, a 2x2 block on mobile
//   - the desktop row rotates leftward, pauses on hover, and never snaps back
//   - the mobile block does not rotate and is not a sideways scroller
//   - four nav items on every page, with the current one marked
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

// The "+" opens the sheet; the sheet carries all four links and closes again.
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
say('+ opens a sheet with all four links', opened.open && opened.visible
    && opened.links === 4 && opened.expanded === 'true' && opened.closeShown,
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
say('no JS: nav links still reachable', noJsNav === 4, `${noJsNav} links`);
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

// --- resume and contact live on About; their old URLs land there ---
p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.goto(base + '/about', { waitUntil: 'networkidle0' });
const merged = await p.evaluate(() => ({
  h1: document.querySelectorAll('h1').length,
  pdf: !!document.querySelector('#resume a[href$="resume.pdf"]'),
  agency: document.querySelector('#contact')?.textContent.includes('Posche Talent'),
  email: !!document.querySelector('#contact a[href^="mailto:"]'),
  order: [...document.querySelectorAll('main > .prose, main section')].map((e) => e.id || 'bio').join(','),
}));
say('about has one h1', merged.h1 === 1);
say('about carries the resume PDF', merged.pdf);
say('about carries the agency and agent email', merged.agency && merged.email);
say('about reads bio, resume, contact', merged.order === 'bio,resume,contact', merged.order);
for (const [from, hash] of [['/resume', '#resume'], ['/contact', '#contact'], ['/contact.html', '#contact']]) {
  const res = await p.goto(base + from, { waitUntil: 'networkidle0' });
  const landed = new URL(p.url());
  const chain = res.request().redirectChain().map((r) => r.response()?.status());
  say(`${from} 301s to /about${hash}`, landed.pathname === '/about' && landed.hash === hash && chain[0] === 301, `${chain.join('>')} -> ${landed.pathname}${landed.hash}`);
}
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
const LABELS = ['About', 'Headshots', 'Reel', 'Gallery'];
let navWrong = [];
for (const u of ['/', '/about', '/headshots', '/reel', '/gallery', '/404.html']) {
  await p.goto(base + u, { waitUntil: 'domcontentloaded' });
  const labels = await p.$$eval('.nav-list a', (els) => els.map((a) => a.textContent.trim()));
  if (labels.join('|') !== LABELS.join('|')) navWrong.push(`${u}: ${labels.join(',')}`);
}
say('the four nav items on every page', navWrong.length === 0, navWrong.join(' ; '));
await p.close();

// --- home fits one desktop screen, no scrolling ---
// Name, pictures, nav and icons all in view. The nav is the only way off the
// home page, and at full width the strip once pushed it below the fold.
p = await b.newPage();
const scrolls = [];
for (const [w, h] of [[1920, 1080], [1536, 864], [1440, 900], [1440, 1024], [1366, 768], [1280, 800], [1280, 720], [1024, 768]]) {
  await p.setViewport({ width: w, height: h });
  await p.goto(base + '/', { waitUntil: 'networkidle0' });
  const m = await p.evaluate(() => ({
    doc: document.documentElement.scrollHeight,
    icons: document.querySelector('.socials').getBoundingClientRect().bottom,
  }));
  if (m.doc > h || m.icons > h) scrolls.push(`${w}x${h}: page ${m.doc}px, icons end ${Math.round(m.icons)}`);
}
say('home fits desktop screens without scrolling', scrolls.length === 0, scrolls.join(' ; '));

// --- the name is one line on desktop, two on phones and tablets ---
// Tablets (under 1024px) take the phone design: two-line name, 2x2 block, "+".
const lines = [];
for (const [w, want] of [[1920, 1], [1440, 1], [1024, 1], [820, 2], [768, 2], [375, 2]]) {
  await p.setViewport({ width: w, height: 900 });
  await p.goto(base + '/', { waitUntil: 'networkidle0' });
  const n = await p.$eval('.display', (h) =>
    Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)));
  if (n !== want) lines.push(`${w}px: ${n} lines, want ${want}`);
}
say('name is one line on desktop, two on phones and tablets', lines.length === 0, lines.join(' ; '));

// --- the name is as wide as the pictures ---
// The first letter sits on the first picture's left edge and the last letter on
// the last picture's right edge. The name's line box overhangs the letters by
// the font's side bearings (and trailing tracking), so add those back in.
const flush = [];
for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [820, 1180], [768, 1024], [375, 780]]) {
  await p.setViewport({ width: w, height: h });
  await p.goto(base + '/', { waitUntil: 'networkidle0' });
  const m = await p.evaluate(() => {
    const t = document.querySelector('.strip-track').getBoundingClientRect();
    const h1 = document.querySelector('h1.display');
    const fs = parseFloat(getComputedStyle(h1).fontSize);
    const r = document.createRange();
    r.selectNodeContents(h1);
    const rects = [...r.getClientRects()].filter((x) => x.width > 0);
    return {
      strip: [t.left, t.right], fs,
      line: [Math.min(...rects.map((x) => x.left)), Math.max(...rects.map((x) => x.right))],
      oneLine: matchMedia('(min-width: 64em)').matches,
    };
  });
  const lsb = m.oneLine ? 0.08 : 0.02;
  const left = m.line[0] + lsb * m.fs, right = m.line[1] - 0.173 * m.fs;
  if (Math.abs(left - m.strip[0]) > 3 || Math.abs(right - m.strip[1]) > 3) {
    flush.push(`${w}x${h}: name ${Math.round(left)}-${Math.round(right)}, pictures ${Math.round(m.strip[0])}-${Math.round(m.strip[1])}`);
  }
}
say('name is as wide as the pictures', flush.length === 0, flush.join(' ; '));

// --- tablets: a 2x2 block that fits the screen ---
const tab = [];
for (const [w, h] of [[768, 1024], [820, 1180], [834, 1194]]) {
  await p.setViewport({ width: w, height: h });
  await p.goto(base + '/', { waitUntil: 'networkidle0' });
  const m = await p.evaluate(() => ({
    cols: getComputedStyle(document.querySelector('.strip-track')).gridTemplateColumns.split(' ').length,
    slides: document.querySelectorAll('.strip-slide').length,
    toggle: getComputedStyle(document.querySelector('.nav-toggle')).display,
    doc: document.documentElement.scrollHeight,
  }));
  if (m.cols !== 2 || m.slides !== 4 || m.toggle === 'none' || m.doc > h) {
    tab.push(`${w}x${h}: ${m.cols} cols, ${m.slides} slides, toggle ${m.toggle}, page ${m.doc}px`);
  }
}
say('tablet home is the 2x2 block with "+", and fits the screen', tab.length === 0, tab.join(' ; '));

// --- one font for everything ---
await p.setViewport({ width: 1280, height: 900 });
const fonts = [];
for (const u of ['/', '/about', '/headshots', '/reel', '/gallery', '/404.html']) {
  await p.goto(base + u, { waitUntil: 'networkidle0' });
  const m = await p.evaluate(async () => {
    await document.fonts.ready;
    const fams = new Set([...document.querySelectorAll('body, h1, h2, p, a, button, figcaption, li')]
      .map((e) => getComputedStyle(e).fontFamily.split(',')[0].trim()));
    return { fams: [...fams], loaded: document.fonts.check('300 20px "Zalando Sans"') };
  });
  if (m.fams.length !== 1 || !m.fams[0].includes('Zalando Sans') || !m.loaded) fonts.push(`${u}: ${m.fams.join('|')} loaded=${m.loaded}`);
}
say('Zalando Sans on every page, and it loads', fonts.length === 0, fonts.join(' ; '));

// --- the nav row never strands an item on a line of its own ---
const wrapped = [];
for (const w of [1024, 1100, 1440]) {
  await p.setViewport({ width: w, height: 1024 });
  await p.goto(base + '/about', { waitUntil: 'domcontentloaded' });
  const rows = await p.$$eval('.nav-list li', (els) => new Set(els.map((e) => e.offsetTop)).size);
  if (rows !== 1) wrapped.push(`${w}px: ${rows} rows`);
}
say('desktop nav is one row from 1024px up', wrapped.length === 0, wrapped.join(' ; '));
await p.close();

await b.close();
console.log(out.join('\n'));
console.log(out.some((l) => l.startsWith('FAIL')) ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
