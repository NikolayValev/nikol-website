// Checks the home picture strip and the pages the Figma redesign reshaped.
// Asserts the comps' intent, not just that the code runs:
//   - four pictures across on desktop, a 2x2 block on mobile
//   - the desktop row rotates leftward, pauses on hover, and never snaps back
//   - the mobile block does not rotate and is not a sideways scroller
//   - four nav items on every page, with the current one marked
// Needs the local server: node tools/serve.mjs
import puppeteer from 'puppeteer';

const base = 'http://localhost:8080';
const PAGES = ['/', '/about', '/headshots', '/reel', '/resume', '/gallery', '/contact', '/404.html'];
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

// The landing frames carry the icon row and the copyright under it — no rule,
// no credits.
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
say('home footer is the icon row and the copyright', homeFooter
    && homeFooter.socials === 4
    && homeFooter.noteShown
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
  // Slides per row: how many share each distinct top edge.
  perRow: Object.values([...t.querySelectorAll('.strip-slide')].reduce((a, e) => {
    const k = Math.round(e.getBoundingClientRect().top); a[k] = (a[k] || 0) + 1; return a;
  }, {})),
  total: t.querySelectorAll('.strip-slide').length,
  clones: t.querySelectorAll('.strip-slide[aria-hidden="true"]').length,
  overflows: t.scrollWidth > t.clientWidth + 2,
}));
say('mobile is a 2x2 block, two pictures to a row', block.perRow.join(',') === '2,2',
    `rows of ${block.perRow.join(',')}`);
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

// --- resume and contact are pages of their own again ---
p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.goto(base + '/about', { waitUntil: 'networkidle0' });
const aboutOnly = await p.evaluate(() => ({
  h1: document.querySelectorAll('h1').length,
  details: document.querySelectorAll('#resume, #contact').length,
}));
say('about has one h1 and is the bio only', aboutOnly.h1 === 1 && aboutOnly.details === 0, JSON.stringify(aboutOnly));
for (const [u, label, test] of [
  ['/resume', 'Resume', () => !!document.querySelector('main a[href$="resume.pdf"]') && (() => { const i = document.querySelector('main img.resume-page'); return !!i && i.complete && i.naturalWidth > 0; })()],
  ['/contact', 'Contact', () => document.querySelector('main').textContent.includes('Posche Talent') && !!document.querySelector('main a[href^="mailto:"]')],
]) {
  const res = await p.goto(base + u, { waitUntil: 'domcontentloaded' });
  const ok = await p.evaluate(test);
  const m = await p.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent.trim(),
    current: document.querySelector('[aria-current="page"]')?.textContent.trim(),
  }));
  say(`${u} is its own page, marked current, with its content`, res.status() === 200 && res.request().redirectChain().length === 0
      && m.h1 === label && m.current === label && ok, JSON.stringify({ ...m, ok }));
}
await p.close();

// --- headshots: seven portraits, all one size, rows level ---
p = await b.newPage();
const hsBad = [];
for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
  await p.setViewport({ width: w, height: h });
  await p.goto(base + '/headshots', { waitUntil: 'networkidle0' });
  const m = await p.evaluate(() => {
    const r = [...document.querySelectorAll('.portraits .figure > a')].map((e) => e.getBoundingClientRect());
    const imgs = [...document.querySelectorAll('.portraits img')].map((e) => e.getBoundingClientRect());
    return {
      n: r.length,
      sizes: [...new Set(r.map((x) => `${Math.round(x.width)}x${Math.round(x.height)}`))],
      filled: imgs.every((x, i) => Math.abs(x.height - r[i].height) < 1 && Math.abs(x.width - r[i].width) < 1),
      noindex: !!document.querySelector('meta[name="robots"]'),
    };
  });
  if (m.n !== 7 || m.sizes.length !== 1 || !m.filled || m.noindex) hsBad.push(`${w}: ${JSON.stringify(m)}`);
}
say('headshots: seven portraits, all one size, each filling its frame', hsBad.length === 0, hsBad.join(' ; '));
await p.close();

// --- the Figma nav, on every page ---
p = await b.newPage();
const LABELS = ['About', 'Headshots', 'Reel', 'Resume', 'Gallery', 'Contact'];
let navWrong = [];
for (const u of PAGES) {
  await p.goto(base + u, { waitUntil: 'domcontentloaded' });
  const labels = await p.$$eval('.nav-list a', (els) => els.map((a) => a.textContent.trim()));
  if (labels.join('|') !== LABELS.join('|')) navWrong.push(`${u}: ${labels.join(',')}`);
}
say('the six nav items on every page', navWrong.length === 0, navWrong.join(' ; '));
await p.close();

// --- home is exactly one screen and does not scroll, on every device ---
// Name, pictures, nav (or the "+") and icons all in view; nothing taller than
// the screen, and nothing the user could scroll to. The nav is the only way off
// the home page, so it must never be clipped.
p = await b.newPage();
const scrolls = [];
const SCREENS = [
  [1920, 1080], [1536, 864], [1440, 900], [1440, 1024], [1366, 768], [1280, 800], [1280, 720], [1024, 768],
  [1024, 1366], [834, 1194], [820, 1180], [768, 1024],
  [430, 932], [414, 896], [390, 844], [375, 667], [360, 740], [320, 568],
];
for (const [w, h] of SCREENS) {
  await p.setViewport({ width: w, height: h });
  await p.goto(base + '/', { waitUntil: 'networkidle0' });
  const m = await p.evaluate(() => {
    const nav = getComputedStyle(document.querySelector('.nav-toggle')).display !== 'none'
      ? document.querySelector('.nav-toggle') : document.querySelector('.nav-list');
    return {
      doc: document.documentElement.scrollHeight,
      body: document.body.scrollHeight,
      icons: document.querySelector('.socials').getBoundingClientRect().bottom,
      nav: nav.getBoundingClientRect().bottom,
      lock: getComputedStyle(document.body).overflow,
      sw: document.documentElement.scrollWidth,
    };
  });
  const bad = m.doc > h || m.body > h || m.icons > h || m.nav > h || m.lock !== 'hidden' || m.sw > w;
  if (bad) scrolls.push(`${w}x${h}: page ${m.doc}/${m.body}px, icons end ${Math.round(m.icons)}, nav end ${Math.round(m.nav)}, overflow ${m.lock}, width ${m.sw}`);
}
say('home is one screen and does not scroll, on every device', scrolls.length === 0, scrolls.join(' ; '));
// A real scroll attempt moves nothing.
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await p.goto(base + '/', { waitUntil: 'networkidle0' });
const scrolledBy = await p.evaluate(() => { window.scrollTo(0, 500); document.body.scrollTo?.(0, 500); return window.scrollY + document.body.scrollTop; });
say('home cannot be scrolled', scrolledBy === 0, `scrolled ${scrolledBy}px`);

// --- the name is on two lines everywhere ---
const lines = [];
for (const [w, want] of [[1920, 2], [1440, 2], [1024, 2], [820, 2], [768, 2], [375, 2]]) {
  await p.setViewport({ width: w, height: 900 });
  await p.goto(base + '/', { waitUntil: 'networkidle0' });
  const n = await p.$eval('.display', (h) =>
    Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)));
  if (n !== want) lines.push(`${w}px: ${n} lines, want ${want}`);
}
say('name is on two lines on every screen', lines.length === 0, lines.join(' ; '));

// --- the name lines up with the pictures ---
// Phones and tablets: first letter on the block's left edge, last letter on its
// right edge. The name's line box overhangs the letters by the font's side
// bearings (and trailing tracking), so add those back in. Desktop (the layout
// designer's settings): the name is 72px, centred over the row, 60px from the
// top of the screen to the capitals and 58px from the baseline to the
// pictures. Measured on text rects (the font's content area): the capitals start 0.24em below a text rect's top and the baseline sits 0.25em above its bottom (in the line box: 0.16em and 0.17em).
const flush = [];
for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [820, 1180], [768, 1024], [390, 844], [375, 667]]) {
  await p.setViewport({ width: w, height: h });
  await p.goto(base + '/', { waitUntil: 'networkidle0' });
  const m = await p.evaluate(() => {
    const t = document.querySelector('.strip-track').getBoundingClientRect();
    const slides = [...document.querySelectorAll('.strip-slide:not([aria-hidden="true"])')].map((x) => x.getBoundingClientRect());
    const h1 = document.querySelector('h1.display');
    const fs = parseFloat(getComputedStyle(h1).fontSize);
    // The text itself, not the block-level <span>s around it.
    const rects = [];
    const walk = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      rects.push(...[...r.getClientRects()].filter((x) => x.width > 0));
    }
    return {
      strip: [t.left, t.right, t.top], slides: slides.map((x) => [x.left, x.right]), fs,
      line: [Math.min(...rects.map((x) => x.left)), Math.max(...rects.map((x) => x.right))],
      top: Math.min(...rects.map((x) => x.top)), bottom: Math.max(...rects.map((x) => x.bottom)),
      desktop: matchMedia('(min-width: 64em)').matches,
    };
  });
  const left = m.line[0] + 0.02 * m.fs, right = m.line[1] - 0.173 * m.fs;
  const first = m.slides[0], last = m.slides[m.slides.length - 1];
  if (!m.desktop && (Math.abs(left - m.strip[0]) > 3 || Math.abs(right - m.strip[1]) > 3)) {
    flush.push(`${w}x${h}: name ${Math.round(left)}-${Math.round(right)}, want ${Math.round(m.strip[0])}-${Math.round(m.strip[1])}`);
  }
  if (m.desktop) {
    const rowMid = (first[0] + last[1]) / 2, nameMid = (left + right) / 2;
    const above = m.top + 0.24 * m.fs, below = m.strip[2] - (m.bottom - 0.25 * m.fs);
    if (Math.abs(m.fs - 72) > 0.5 || Math.abs(nameMid - rowMid) > 3 || Math.abs(above - 60) > 3 || Math.abs(below - 58) > 3) {
      flush.push(`${w}x${h}: ${m.fs}px, centre ${nameMid.toFixed(1)} vs row ${rowMid.toFixed(1)}, gap above ${above.toFixed(1)}, below ${below.toFixed(1)}`);
    }
  }
}
say("name lines up with the pictures; the designer's gaps above and below it", flush.length === 0, flush.join(' ; '));

// --- picture shapes, and no wasted screen ---
// Phones and tablets: every picture at its own proportions (displayed
// width:height equals the file's). Desktop: all four one size, at the
// designer's 276x394 shape, and the row is as wide as the side margins allow
// unless the screen's height stops it, in which case the page fills the screen.
// Phones and tablets do not leave a band of empty cream under the copyright.
const crop = [], gapBottom = [];
for (const [w, h] of [[1920, 1080], [1440, 900], [1366, 768], [1280, 720], [1024, 768], [820, 1180], [768, 1024], [390, 844], [375, 667]]) {
  await p.setViewport({ width: w, height: h });
  await p.goto(base + '/', { waitUntil: 'networkidle0' });
  const m = await p.evaluate(() => {
    const slides = [...document.querySelectorAll('.strip-slide:not([aria-hidden="true"])')].map((e) => e.getBoundingClientRect());
    const px = (v) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;visibility:hidden;height:' + v; document.body.appendChild(d); const x = d.getBoundingClientRect().height; d.remove(); return x; };
    return {
      desktop: matchMedia('(min-width: 64em)').matches,
      off: Math.max(...[...document.querySelectorAll('.strip-slide:not([aria-hidden="true"]) img')].map((i) => {
        const r = i.getBoundingClientRect();
        return Math.abs(r.width / r.height - i.naturalWidth / i.naturalHeight) / (i.naturalWidth / i.naturalHeight);
      })),
      sizes: [...new Set(slides.map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`))],
      shape: slides[0].width / slides[0].height,
      row: slides[slides.length - 1].right - slides[0].left,
      room: document.documentElement.clientWidth - 2 * px('var(--gutter)'),
      below: innerHeight - document.querySelector('.footer-note').getBoundingClientRect().bottom,
      icons: innerHeight - document.querySelector('.socials').getBoundingClientRect().bottom,
    };
  });
  if (m.desktop) {
    if (m.sizes.length !== 1 || Math.abs(m.shape - 276 / 394) > 0.01) crop.push(`${w}x${h}: ${m.sizes.join(' ')}`);
    if (m.row < m.room - 2 && m.icons > 48 + 12) gapBottom.push(`${w}x${h}: row ${Math.round(m.row)} of ${Math.round(m.room)}, ${Math.round(m.icons)}px below the icons`);
  } else {
    if (m.off > 0.01) crop.push(`${w}x${h}: ${(m.off * 100).toFixed(1)}% off`);
    if (m.below > 40) gapBottom.push(`${w}x${h}: ${Math.round(m.below)}px below the copyright`);
  }
}
say('pictures: one size and shape on desktop, uncropped on phones and tablets', crop.length === 0, crop.join(' ; '));
say('no wasted screen: the row reaches the side margins, or the page fills the height', gapBottom.length === 0, gapBottom.join(' ; '));

// --- one gap between pictures, one side margin ---
// The gap between pictures is the same on the home row, the gallery and the
// headshots. The gallery, headshots and reel all stop at the page's side
// margin (--gutter), which on desktop is also the home row's smallest margin
// and on a phone the home block's. Every gallery picture is the same height,
// all portraits one width and all landscapes another.
const same = [];
for (const [w, h] of [[1440, 900], [1024, 768], [820, 1180], [390, 1000]]) {
  await p.setViewport({ width: w, height: h });
  await p.goto(base + '/', { waitUntil: 'networkidle0' });
  const home = await p.evaluate(() => {
    const px = (v) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;visibility:hidden;height:' + v; document.body.appendChild(d); const x = d.getBoundingClientRect().height; d.remove(); return x; };
    const sl = [...document.querySelectorAll('.strip-slide:not([aria-hidden="true"])')].map((e) => e.getBoundingClientRect());
    return { gap: parseFloat(getComputedStyle(document.querySelector('.strip-track')).columnGap), rowGap: parseFloat(getComputedStyle(document.querySelector('.strip-track')).rowGap), gutter: px('var(--gutter)'), left: document.querySelector('.strip-track').getBoundingClientRect().left };
  });
  await p.goto(base + '/gallery', { waitUntil: 'networkidle0' });
  const gal = await p.evaluate(() => {
    const f = [...document.querySelectorAll('.mosaic .figure')].map((e) => e.getBoundingClientRect());
    const mos = document.querySelector('.mosaic').getBoundingClientRect();
    const imgs = [...document.querySelectorAll('.mosaic .figure > a')].map((e) => e.getBoundingClientRect());
    // rows: group by top edge; every picture in a row ends at the same bottom
    const rows = {};
    imgs.forEach((r) => { const k = Math.round(r.top); (rows[k] = rows[k] || []).push(r.bottom); });
    const ragged = Object.values(rows).filter((b) => Math.max(...b) - Math.min(...b) > 1.5).length;
    const heights = new Set(imgs.map((r) => Math.round(r.height))).size;
    const widths = new Set(imgs.map((r) => Math.round(r.width))).size;
    const cs = getComputedStyle(document.querySelector('.mosaic'));
    return { gap: parseFloat(cs.columnGap), rowGap: parseFloat(cs.rowGap), left: mos.left, right: document.documentElement.clientWidth - mos.right, ragged, heights, widths };
  });
  const others = {};
  for (const [u, sel] of [['/headshots', '.portraits'], ['/reel', '.facade']]) {
    await p.goto(base + u, { waitUntil: 'networkidle0' });
    others[u] = await p.evaluate((sel) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      return { left: r.left, right: document.documentElement.clientWidth - r.right, gap: parseFloat(getComputedStyle(el).columnGap) };
    }, sel);
  }
  if (Math.abs(home.gap - gal.gap) > 0.5 || Math.abs(home.gap - gal.rowGap) > 0.5) same.push(`${w}: home gap ${home.gap.toFixed(1)}, gallery ${gal.gap.toFixed(1)} across / ${gal.rowGap.toFixed(1)} down`);
  if (Math.abs(gal.left - home.gutter) > 1 || Math.abs(gal.right - home.gutter) > 1) same.push(`${w}: gallery sides ${gal.left.toFixed(1)}/${gal.right.toFixed(1)}, gutter ${home.gutter.toFixed(1)}`);
  if (w === 390 && Math.abs(home.left - home.gutter) > 1) same.push(`${w}: home side ${home.left.toFixed(1)}, gutter ${home.gutter.toFixed(1)}`);
  if (gal.ragged || gal.heights !== 1 || gal.widths !== 2) same.push(`${w}: gallery ${gal.ragged} ragged rows, ${gal.heights} heights, ${gal.widths} widths`);
  if (Math.abs(others['/headshots'].gap - home.gap) > 0.5) same.push(`${w}: headshots gap ${others['/headshots'].gap}`);
  for (const [u, o] of Object.entries(others)) {
    if (Math.abs(o.left - home.gutter) > 1 || Math.abs(o.right - home.gutter) > 1) same.push(`${w}: ${u} sides ${o.left.toFixed(1)}/${o.right.toFixed(1)}, gutter ${home.gutter.toFixed(1)}`);
  }
}
say('one gap and one side margin on home, gallery, headshots and reel; gallery pictures all one height', same.length === 0, same.join(' ; '));

// --- Actors Access is in every footer ---
const aa = [];
for (const u of PAGES) {
  await p.goto(base + u, { waitUntil: 'domcontentloaded' });
  const ok = await p.evaluate(() => {
    const a = document.querySelector('.site-footer a[href="https://resumes.actorsaccess.com/nikoltsvetanova"]');
    return !!a && a.textContent.trim() === 'Actors Access' && a.target === '_blank' && /noopener/.test(a.rel);
  });
  if (!ok) aa.push(u);
}
say('Actors Access link in every footer', aa.length === 0, aa.join(' '));

// --- tablets: a 2x2 block that fits the screen ---
const tab = [];
for (const [w, h] of [[768, 1024], [820, 1180], [834, 1194]]) {
  await p.setViewport({ width: w, height: h });
  await p.goto(base + '/', { waitUntil: 'networkidle0' });
  const m = await p.evaluate(() => ({
    rows: Object.values([...document.querySelectorAll('.strip-slide')].reduce((a, e) => {
      const k = Math.round(e.getBoundingClientRect().top); a[k] = (a[k] || 0) + 1; return a;
    }, {})).join(','),
    slides: document.querySelectorAll('.strip-slide').length,
    toggle: getComputedStyle(document.querySelector('.nav-toggle')).display,
    doc: document.documentElement.scrollHeight,
  }));
  if (m.rows !== '2,2' || m.slides !== 4 || m.toggle === 'none' || m.doc > h) {
    tab.push(`${w}x${h}: rows of ${m.rows}, ${m.slides} slides, toggle ${m.toggle}, page ${m.doc}px`);
  }
}
say('tablet home is the 2x2 block with "+", and fits the screen', tab.length === 0, tab.join(' ; '));

// --- one font for everything ---
await p.setViewport({ width: 1280, height: 900 });
const fonts = [];
for (const u of PAGES) {
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
