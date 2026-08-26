import puppeteer from 'puppeteer';
const url = 'http://localhost:8080/';
const b = await puppeteer.launch({ headless: 'new' });
const out = [];
const say = (label, ok, detail = '') =>
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);

// --- desktop: 3 visible, auto-advance ---
let p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.goto(url, { waitUntil: 'networkidle0' });
const geo = await p.$eval('.carousel-track', t => {
  const s = t.querySelector('.carousel-slide');
  const gap = parseFloat(getComputedStyle(t).columnGap) || 0;
  return { per: Math.round(t.clientWidth / (s.getBoundingClientRect().width + gap)),
           slides: t.querySelectorAll('.carousel-slide').length };
});
say('desktop shows 3 of 4', geo.per === 3 && geo.slides === 4, `${geo.per} visible, ${geo.slides} slides`);

const x0 = await p.$eval('.carousel-track', t => t.scrollLeft);
await new Promise(r => setTimeout(r, 6500));
const x1 = await p.$eval('.carousel-track', t => t.scrollLeft);
say('desktop auto-advances', x1 !== x0, `scrollLeft ${x0} -> ${x1}`);

// hover pauses
await p.hover('.carousel');
const h0 = await p.$eval('.carousel-track', t => t.scrollLeft);
await new Promise(r => setTimeout(r, 6500));
const h1 = await p.$eval('.carousel-track', t => t.scrollLeft);
say('hover pauses autoplay', h0 === h1, `stayed at ${h1}`);

// pause button
await p.mouse.move(0, 0);
await p.click('.carousel-toggle');
const label = await p.$eval('.carousel-toggle', el => el.textContent.trim());
const pressed = await p.$eval('.carousel-toggle', el => el.getAttribute('aria-pressed'));
const q0 = await p.$eval('.carousel-track', t => t.scrollLeft);
await new Promise(r => setTimeout(r, 6500));
const q1 = await p.$eval('.carousel-track', t => t.scrollLeft);
say('pause button stops it', q0 === q1 && pressed === 'true', `label "${label}", aria-pressed=${pressed}`);
await p.close();

// --- mobile: 1 visible, swipeable ---
p = await b.newPage();
await p.setViewport({ width: 375, height: 780, isMobile: true, hasTouch: true });
await p.goto(url, { waitUntil: 'networkidle0' });
const per = await p.$eval('.carousel-track', t => {
  const s = t.querySelector('.carousel-slide');
  return Math.round(t.clientWidth / (s.getBoundingClientRect().width + (parseFloat(getComputedStyle(t).columnGap) || 0)));
});
say('mobile shows 1 at a time', per === 1, `${per} visible`);
const canScroll = await p.$eval('.carousel-track', t => t.scrollWidth > t.clientWidth + 10);
say('mobile track is scrollable (swipe)', canScroll);
await p.$eval('.carousel-track', t => t.scrollTo({ left: 99999, behavior: 'auto' }));
const atEnd = await p.$eval('.carousel-track', t => t.scrollLeft > 0);
say('can scroll past to later images', atEnd);
await p.close();

// --- reduced motion: no autoplay ---
p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await p.goto(url, { waitUntil: 'networkidle0' });
const r0 = await p.$eval('.carousel-track', t => t.scrollLeft);
await new Promise(r => setTimeout(r, 6500));
const r1 = await p.$eval('.carousel-track', t => t.scrollLeft);
const opac = await p.$$eval('.carousel-slide', els => els.map(e => getComputedStyle(e).opacity));
say('reduced motion: no auto-advance', r0 === r1);
say('reduced motion: all slides visible', opac.every(o => Number(o) === 1), `opacities ${opac.join(', ')}`);
await p.close();

// --- no JS: carousel still readable ---
p = await b.newPage();
await p.setJavaScriptEnabled(false);
await p.setViewport({ width: 1280, height: 900 });
await p.goto(url, { waitUntil: 'load' });
const noJs = await p.$$eval('.carousel-slide', els => els.map(e => getComputedStyle(e).opacity));
const scrollable = await p.$eval('.carousel-track', t => t.scrollWidth > 0);
say('no JS: slides visible', noJs.every(o => Number(o) === 1), `opacities ${noJs.join(', ')}`);
say('no JS: track still scrollable', scrollable);
await p.close();

// --- about page has the headshots ---
p = await b.newPage();
await p.goto('http://localhost:8080/about', { waitUntil: 'networkidle0' });
const shots = await p.$$eval('[data-lightbox]', els => els.length);
const order = await p.$eval('main', m => {
  const sec = m.querySelector('section[aria-label="Headshots"]');
  const h1 = m.querySelector('h1');
  return sec && h1 ? (sec.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 : false;
});
say('about has 7 headshots', shots === 7, `${shots} found`);
say('headshots sit above the About heading', order);
await p.close();

await b.close();
console.log(out.join('\n'));
console.log(out.some(l => l.startsWith('FAIL')) ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
