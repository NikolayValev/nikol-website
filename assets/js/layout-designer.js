// LAYOUT DESIGNER — a tool for the designer to set the home page's sizes, gaps
// and alignments by eye. It is a self-contained component.
//
//   Use it:     open the home page with ?design on the end, e.g.
//               https://nikoltsvetanova.com/?design   (visitors never see it)
//   Remove it:  1. delete the <script ... layout-designer.js> line in index.html
//               2. delete this file, and its line in tools/deploy-manifest.txt
//               3. delete tools/designer-test.mjs
//               Nothing else refers to it: it injects its own panel and styles,
//               and every change it makes is an inline style or a custom
//               property on <body>, so deleting the file leaves the site as it
//               was.
//
// It works on the desktop layout (window 1024px wide or more), where the title,
// the row of pictures, the nav and the icons are the things she is deciding.
// What it sets is shown live, with guides that measure the gaps and mark the
// alignments. "Copy settings" puts the numbers on the clipboard to send back.

const K = 7.7733;          // ink width of "TSVETANOVA", in em (see site.css, "Home")
const TOP_TO_CAP = 0.16;   // font's own space above the capitals, in the line box
const BASE_TO_BOTTOM = 0.17; // ...and below the baseline
const CAP_IN_RECT = 0.24;  // same, measured from a text rectangle's top
const BASE_IN_RECT = 0.25; // ...and bottom
const STORE = 'layout-designer-v1';
const MIN_ROW = 160;

if (/[?&]design(=|&|$)/.test(location.search) && document.body.classList.contains('is-home')) {
  boot();
}

function boot() {
  const body = document.body;
  const desktop = matchMedia('(min-width: 64em)');
  const $ = (sel, root = document) => root.querySelector(sel);
  const strip = $('.strip');
  const track = $('.strip-track');
  const header = $('.site-header');
  const h1 = $('h1.display');
  const nav = $('.site-nav');
  const footer = $('.site-footer');
  if (!strip || !track || !header || !h1 || !nav || !footer) return;

  // ---- settings -------------------------------------------------------------

  // What the page does by itself, read from its own CSS, so "Reset" is exact.
  const px = (value) => {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;visibility:hidden;height:${value}`;
    body.append(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return Math.round(h);
  };
  const cssNumber = (name, fallback) => {
    const v = parseFloat(getComputedStyle(body).getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };
  const defaults = () => ({
    fit: true,            // size the row so the page is exactly one screen tall
    rowW: 1000,           // row width when not fitting
    side: px('var(--home-side, 24px)'),
    picGap: px('var(--tile-gap, 10px)'),
    shapes: 'same',       // natural: nothing cropped. same: all one shape
    ratio: Math.round(cssNumber('--home-ratio', 0.7) * 100) / 100, // width:height when shapes is "same"
    titleMode: 'custom',  // match: sized from the pictures. custom: titleSize
    titleAlign: 'centres',// centres: first centre to last centre. edges: row edge to edge
    titleSize: px('var(--home-title, 72px)'),
    gapTop: px('var(--home-gap-top, 60px)'),
    gapTitle: px('var(--home-gap, 58px)'),
    gapNav: px('var(--home-nav-gap, 45px)'),
    gapFooter: px('var(--home-footer-gap, 20px)'),
    gapBottom: px('var(--home-bottom, 20px)'),
    freeze: true,
    guides: true,
  });
  let s = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && typeof saved === 'object') s = { ...s, ...saved };
  } catch { /* private window: carry on with the defaults */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* ignore */ } };

  // ---- the page, as the designer changes it --------------------------------

  const realSlides = () => [...track.querySelectorAll('.strip-slide:not([aria-hidden="true"])')];

  // Everything the tool touches, so "off" can put it all back.
  function clearOverrides() {
    body.style.removeProperty('--home-w');
    body.style.removeProperty('--tile-gap');
    h1.style.removeProperty('font-size');
    h1.style.removeProperty('translate');
    h1.style.removeProperty('margin-block');
    nav.style.removeProperty('margin-block-start');
    footer.style.removeProperty('padding-block');
    for (const li of realSlides()) {
      li.style.removeProperty('flex');
      li.style.removeProperty('aspect-ratio');
      const img = $('img', li);
      if (img) { img.style.removeProperty('object-fit'); img.style.removeProperty('object-position'); }
    }
    body.classList.remove('ld-freeze');
  }

  function applyStatic() {
    body.style.setProperty('--tile-gap', `${s.picGap}px`);
    nav.style.marginBlockStart = `${s.gapNav}px`;
    // The copyright sits inside the gap under the icons.
    const note = $('.footer-note', footer);
    const noteH = note ? note.offsetHeight + parseFloat(getComputedStyle(note).marginBlockStart) : 0;
    footer.style.paddingBlock = `${s.gapFooter}px ${Math.max(0, s.gapBottom - noteH)}px`;
    body.classList.toggle('ld-freeze', s.freeze);

    // Shapes. "same" crops every picture to one ratio (what the stylesheet
    // does, at --home-ratio). "natural" shows each at its own ratio (--ar on
    // each slide; 2.618544 is the four added up), all one height.
    const slides = realSlides();
    if (s.shapes === 'same') {
      for (const li of slides) {
        li.style.aspectRatio = String(s.ratio);
        li.style.flex = `0 0 calc((100% - ${3 * s.picGap}px) / 4)`;
        const img = $('img', li);
        if (img) { img.style.objectFit = 'cover'; img.style.objectPosition = '50% 35%'; }
      }
    } else {
      for (const li of slides) {
        li.style.aspectRatio = 'var(--ar)';
        li.style.flex = `0 0 calc((100% - ${3 * s.picGap}px) * var(--ar) / 2.618544)`;
        const img = $('img', li);
        if (img) { img.style.objectFit = 'fill'; img.style.removeProperty('object-position'); }
      }
    }
  }

  // Set the row width, then size and place the title from the pictures.
  function layoutPass(W) {
    body.style.setProperty('--home-w', `${W}px`);
    const slides = realSlides();
    const a = slides[0].getBoundingClientRect();
    const z = slides[slides.length - 1].getBoundingClientRect();
    const hd = header.getBoundingClientRect();
    const rowMid = hd.left + hd.width / 2;

    let ink;
    let mid;
    if (s.titleAlign === 'edges') {
      ink = hd.width;
      mid = rowMid;
    } else {
      const cF = (a.left + a.right) / 2;
      const cL = (z.left + z.right) / 2;
      ink = cL - cF;
      mid = (cF + cL) / 2;
    }
    const fs = s.titleMode === 'custom' ? s.titleSize : ink / K;
    h1.style.fontSize = `${fs}px`;
    h1.style.translate = `${mid - rowMid}px 0`;
    h1.style.marginBlock = `${s.gapTop - TOP_TO_CAP * fs}px ${s.gapTitle - BASE_TO_BOTTOM * fs}px`;
    return fs;
  }

  // How far past the bottom of the screen the page runs (negative: space left).
  const overflow = () => footer.getBoundingClientRect().bottom - innerHeight;

  function relayout() {
    if (!desktop.matches) {
      clearOverrides();
      refresh();
      return;
    }
    applyStatic();
    track.scrollLeft = 0;
    const maxW = Math.max(MIN_ROW, document.documentElement.clientWidth - 2 * s.side);
    let W;
    if (s.fit) {
      // The widest row that still leaves the page one screen tall. The page is
      // never shorter at a narrower row, so a bisection finds it.
      let lo = MIN_ROW;
      let hi = maxW;
      layoutPass(hi);
      if (overflow() <= 0) {
        lo = hi;
      } else {
        for (let i = 0; i < 18 && hi - lo > 0.25; i++) {
          const mid = (lo + hi) / 2;
          layoutPass(mid);
          if (overflow() <= 0) lo = mid; else hi = mid;
        }
      }
      W = lo;
      s.rowW = Math.round(W);
    } else {
      W = Math.min(s.rowW, maxW);
    }
    layoutPass(W);
    refresh();
  }

  // ---- the panel --------------------------------------------------------------

  const style = document.createElement('style');
  style.dataset.layoutDesigner = '';
  style.textContent = `
    body.ld-freeze .strip-slide[aria-hidden="true"] { display: none !important; }
    .ld-panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 10000; width: 19rem; max-width: 92vw;
      overflow-y: auto; box-sizing: border-box; padding: 0 0 1rem; background: #1b1b1d; color: #ececec;
      font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; box-shadow: -6px 0 24px rgba(0,0,0,.25); }
    .ld-panel { transition: opacity .15s; }
    .ld-panel.ld-drag { opacity: .16; }
    .ld-panel.ld-left { right: auto; left: 0; box-shadow: 6px 0 24px rgba(0,0,0,.25); }
    .ld-panel.ld-min { bottom: auto; overflow: hidden; }
    .ld-panel.ld-min .ld-body { display: none; }
    .ld-panel * { box-sizing: border-box; letter-spacing: normal; text-transform: none; font-family: inherit; }
    .ld-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: .5rem; padding: .6rem .8rem;
      background: #111; border-bottom: 1px solid #333; }
    .ld-head strong { flex: 1; font-size: 13px; font-weight: 600; }
    .ld-head button, .ld-btn { background: #2d2d31; color: #ececec; border: 1px solid #444; border-radius: 4px;
      padding: .3rem .6rem; font-size: 12px; cursor: pointer; }
    .ld-head button:hover, .ld-btn:hover { background: #3a3a40; }
    .ld-sec { padding: .7rem .8rem .2rem; }
    .ld-sec h3 { margin: 0 0 .4rem; font-size: 11px; font-weight: 600; text-transform: uppercase !important;
      letter-spacing: .08em !important; color: #9a9aa2; }
    .ld-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: .1rem .6rem; margin: 0 0 .55rem; }
    .ld-row label { color: #d8d8dc; }
    .ld-row output { font-variant-numeric: tabular-nums; color: #fff; min-width: 3.6em; text-align: right; }
    .ld-row input[type=range] { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: #7aa2ff; }
    .ld-row select { grid-column: 1 / -1; width: 100%; padding: .3rem; background: #2d2d31; color: #fff;
      border: 1px solid #444; border-radius: 4px; }
    .ld-check { display: flex; align-items: center; gap: .5rem; margin: 0 0 .55rem; cursor: pointer; }
    .ld-row.ld-off { opacity: .4; pointer-events: none; }
    .ld-note { margin: 0 0 .6rem; color: #9a9aa2; font-size: 11px; }
    .ld-warn { color: #ffb86b; }
    .ld-ok { color: #8fe0a3; }
    .ld-read { margin: 0; padding: .6rem .8rem; background: #141416; border-block: 1px solid #333; font-size: 11px;
      font-variant-numeric: tabular-nums; white-space: pre-wrap; color: #cfcfd4; }
    .ld-actions { display: flex; gap: .5rem; padding: .8rem; }
    .ld-actions .ld-btn { flex: 1; }
    .ld-guides { position: fixed; inset: 0; z-index: 9999; pointer-events: none; overflow: hidden; }
    .ld-guides i { position: absolute; display: block; }
    .ld-guides .v { top: 0; bottom: 0; width: 0; border-left: 1px solid; }
    .ld-guides .band { left: 0; width: 100%; }
    .ld-guides b { position: absolute; padding: 1px 5px; border-radius: 3px; background: #111; color: #fff;
      font: 600 11px/1.3 system-ui, sans-serif; white-space: nowrap; }
  `;
  document.head.append(style);

  const panel = document.createElement('aside');
  panel.className = 'ld-panel';
  panel.setAttribute('aria-label', 'Layout designer');
  const guides = document.createElement('div');
  guides.className = 'ld-guides';
  guides.setAttribute('aria-hidden', 'true');
  document.body.append(guides, panel);

  const controls = {};
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  let ids = 0;

  function section(title) {
    const sec = el('div', 'ld-sec');
    sec.append(el('h3', '', title));
    return sec;
  }
  function slider(sec, key, label, min, max, step, unit = 'px') {
    const row = el('div', 'ld-row');
    const id = `ld-${key}-${ids++}`;
    const lab = el('label', '', label);
    lab.htmlFor = id;
    const out = el('output');
    const input = el('input');
    Object.assign(input, { type: 'range', id, min, max, step });
    input.dataset.ld = key;
    input.addEventListener('input', () => { s[key] = Number(input.value); schedule(); });
    row.append(lab, out, input);
    sec.append(row);
    controls[key] = { row, input, set(v) { input.value = v; out.textContent = `${Math.round(v * 100) / 100}${unit}`; } };
  }
  function select(sec, key, label, options) {
    const row = el('div', 'ld-row');
    const id = `ld-${key}-${ids++}`;
    const lab = el('label', '', label);
    lab.htmlFor = id;
    const sel = el('select');
    sel.id = id;
    sel.dataset.ld = key;
    for (const [value, text] of options) sel.append(new Option(text, value));
    sel.addEventListener('change', () => { s[key] = sel.value; schedule(); });
    row.append(lab, sel);
    sec.append(row);
    controls[key] = { row, input: sel, set(v) { sel.value = v; } };
  }
  function check(sec, key, label) {
    const wrap = el('label', 'ld-check');
    const input = el('input');
    input.type = 'checkbox';
    input.dataset.ld = key;
    input.addEventListener('change', () => { s[key] = input.checked; schedule(); });
    wrap.append(input, document.createTextNode(label));
    sec.append(wrap);
    controls[key] = { row: wrap, input, set(v) { input.checked = !!v; } };
  }

  const head = el('div', 'ld-head');
  const title = el('strong', '', 'Layout designer');
  const dock = el('button', '', '⇄');
  dock.title = 'Dock to the other side';
  dock.type = 'button';
  dock.addEventListener('click', () => panel.classList.toggle('ld-left'));
  const min = el('button', '', '–');
  min.title = 'Collapse';
  min.type = 'button';
  min.setAttribute('aria-expanded', 'true');
  min.addEventListener('click', () => {
    const closed = panel.classList.toggle('ld-min');
    min.setAttribute('aria-expanded', String(!closed));
    min.textContent = closed ? '+' : '–';
  });
  head.append(title, dock, min);

  // The panel covers a strip of the page. While a slider is held it fades almost
  // out, so what is behind it can be seen changing.
  panel.addEventListener('pointerdown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'range') panel.classList.add('ld-drag');
  });
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => panel.classList.remove('ld-drag'));

  const bodyEl = el('div', 'ld-body');
  const note = el('p', 'ld-note');
  note.style.margin = '0';
  note.style.padding = '.6rem .8rem 0';
  bodyEl.append(note);

  const pics = section('Pictures');
  check(pics, 'fit', 'Fit to the screen height (no scrolling)');
  slider(pics, 'rowW', 'Row width', 200, 2600, 1);
  slider(pics, 'side', 'Smallest side margin', 0, 240, 1);
  slider(pics, 'picGap', 'Gap between pictures', 0, 48, 1);
  select(pics, 'shapes', 'Picture shapes', [
    ['natural', 'As photographed (nothing cropped)'],
    ['same', 'All the same shape (crops to fit)'],
  ]);
  slider(pics, 'ratio', 'Shape, width : height', 0.5, 0.9, 0.01, '');

  const ttl = section('Title');
  select(ttl, 'titleMode', 'Size', [
    ['match', 'Sized from the pictures'],
    ['custom', 'Set the size by hand'],
  ]);
  slider(ttl, 'titleSize', 'Title size', 30, 320, 1);
  select(ttl, 'titleAlign', 'Aligned to', [
    ['centres', 'Centre of the first picture to the centre of the last'],
    ['edges', 'The outer edges of the row'],
  ]);

  const gaps = section('Gaps (as seen: letter-top, baseline, edge to edge)');
  slider(gaps, 'gapTop', 'Above the title', 0, 200, 1);
  slider(gaps, 'gapTitle', 'Title to pictures', 0, 200, 1);
  slider(gaps, 'gapNav', 'Pictures to nav', 0, 200, 1);
  slider(gaps, 'gapFooter', 'Nav to icons', 0, 120, 1);
  slider(gaps, 'gapBottom', 'Below the icons', 0, 160, 1);

  const view = section('View');
  check(view, 'guides', 'Show guides and measurements');
  check(view, 'freeze', 'Hold the pictures still');

  const read = el('pre', 'ld-read');
  read.setAttribute('aria-live', 'polite');

  const actions = el('div', 'ld-actions');
  const reset = el('button', 'ld-btn', 'Reset');
  reset.type = 'button';
  reset.addEventListener('click', () => { s = defaults(); save(); syncControls(); relayout(); });
  const copy = el('button', 'ld-btn', 'Copy settings');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    const text = exportText();
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied';
    } catch {
      const area = el('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand?.('copy');
      area.remove();
      copy.textContent = 'Copied';
    }
    setTimeout(() => { copy.textContent = 'Copy settings'; }, 1600);
  });
  actions.append(reset, copy);

  bodyEl.append(pics, ttl, gaps, view, read, actions);
  panel.append(head, bodyEl);

  function syncControls() {
    for (const [key, c] of Object.entries(controls)) c.set(s[key]);
    updateEnabled();
  }
  function updateEnabled() {
    const off = (key, yes) => controls[key].row.classList.toggle('ld-off', yes);
    off('rowW', s.fit);
    off('ratio', s.shapes !== 'same');
    off('titleSize', s.titleMode !== 'custom');
  }

  // ---- readout, guides, export -----------------------------------------------

  const round = (n) => Math.round(n);
  function measure() {
    const slides = realSlides();
    const rects = slides.map((x) => x.getBoundingClientRect());
    const row = track.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(h1).fontSize);
    // The text itself, not the block-level spans around it.
    const text = [];
    const walk = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      text.push(...[...r.getClientRects()].filter((q) => q.width > 0));
    }
    const widest = text.reduce((m, q) => (q.width > m.width ? q : m), text[0]);
    const inkLeft = widest.left + 0.02 * fs;
    const inkRight = widest.right - 0.173 * fs;
    const capTop = Math.min(...text.map((q) => q.top)) + CAP_IN_RECT * fs;
    const baseline = Math.max(...text.map((q) => q.bottom)) - BASE_IN_RECT * fs;
    const navR = $('.nav-list', nav).getBoundingClientRect();
    const iconsR = $('.socials', footer).getBoundingClientRect();
    return { rects, row, fs, inkLeft, inkRight, capTop, baseline, navR, iconsR };
  }

  function refresh() {
    syncControls();
    updateEnabled();
    const on = desktop.matches;
    note.textContent = on
      ? 'Drag the sliders; the page changes as you go. Guides show the gaps and what lines up with what.'
      : 'These controls are for the desktop layout. Make the window at least 1024px wide.';
    for (const sec of [pics, ttl, gaps, view, actions]) sec.style.display = on ? '' : 'none';
    guides.replaceChildren();
    if (!on) { read.textContent = `Window ${innerWidth} × ${innerHeight}: tablet/phone layout (unchanged).`; return; }

    const m = measure();
    const over = overflow();
    const g = {
      top: m.capTop,
      title: m.rects[0].top - m.baseline,
      nav: m.navR.top - m.rects[0].bottom,
      footer: m.iconsR.top - m.navR.bottom,
      bottom: innerHeight - m.iconsR.bottom,
    };
    const sizes = m.rects.map((r) => `${round(r.width)}×${round(r.height)}`).join('  ');
    read.innerHTML = '';
    const line = (t, cls) => { const d = el('div', cls, t); read.append(d); };
    line(`Window ${innerWidth} × ${innerHeight}`);
    line(`Row ${round(m.row.width)} × ${round(m.row.height)}   sides ${round(m.row.left)} / ${round(innerWidth - m.row.right)}`);
    line(`Pictures ${sizes}`);
    line(`Title ${round(m.fs)}px, ${round(m.inkRight - m.inkLeft)} wide`);
    line(`Gaps  ${round(g.top)} · ${round(g.title)} · ${round(g.nav)} · ${round(g.footer)} · ${round(g.bottom)}`);
    if (over > 0.5) line(`Too tall by ${round(over)}px: the bottom is cut off.`, 'ld-warn');
    else line(over < -1 ? `Fits, with ${round(-over)}px to spare at the bottom.` : 'Fits the screen exactly.', 'ld-ok');

    if (s.guides) drawGuides(m);
  }

  function drawGuides(m) {
    const add = (cls, css, label, labelCss) => {
      const i = el('i', cls);
      Object.assign(i.style, css);
      guides.append(i);
      if (label) {
        const b = el('b', '', label);
        Object.assign(b.style, labelCss);
        guides.append(b);
      }
    };
    const rowL = m.row.left;
    const rowR = m.row.right;
    const first = m.rects[0];
    const last = m.rects[m.rects.length - 1];
    // Verticals: the row's edges, the first and last picture's centres, the
    // title's first and last letters.
    add('v', { left: `${rowL}px`, borderColor: 'rgba(0,160,255,.9)' }, 'row edge', { left: `${rowL + 4}px`, top: '4px' });
    add('v', { left: `${rowR}px`, borderColor: 'rgba(0,160,255,.9)' }, 'row edge', { left: `${rowR - 62}px`, top: '4px' });
    const cF = (first.left + first.right) / 2;
    const cL = (last.left + last.right) / 2;
    add('v', { left: `${cF}px`, borderColor: 'rgba(255,60,200,.9)', borderLeftStyle: 'dashed' }, 'centre', { left: `${cF + 4}px`, top: '24px' });
    add('v', { left: `${cL}px`, borderColor: 'rgba(255,60,200,.9)', borderLeftStyle: 'dashed' }, 'centre', { left: `${cL + 4}px`, top: '24px' });
    add('v', { left: `${m.inkLeft}px`, borderColor: 'rgba(40,200,90,.95)' }, 'title', { left: `${m.inkLeft + 4}px`, top: '44px' });
    add('v', { left: `${m.inkRight}px`, borderColor: 'rgba(40,200,90,.95)' }, 'title', { left: `${m.inkRight - 40}px`, top: '44px' });

    // Horizontals: each gap as a band with its size.
    const band = (top, bottom, color, text) => {
      if (bottom - top < 1) return;
      add('band', { top: `${top}px`, height: `${bottom - top}px`, background: color }, `${round(bottom - top)}px`,
        { left: `${(rowL + rowR) / 2 - 18}px`, top: `${top + (bottom - top) / 2 - 9}px` });
    };
    band(0, m.capTop, 'rgba(255,170,0,.22)');
    band(m.baseline, first.top, 'rgba(255,170,0,.22)');
    band(first.bottom, m.navR.top, 'rgba(255,170,0,.22)');
    band(m.navR.bottom, m.iconsR.top, 'rgba(255,170,0,.22)');
    band(m.iconsR.bottom, innerHeight, 'rgba(255,170,0,.22)');
  }

  function exportText() {
    const m = desktop.matches ? measure() : null;
    const out = {
      note: 'Layout designer settings for the home page. Sent from the designer; applied to the desktop layout.',
      window: [innerWidth, innerHeight],
      pictures: {
        rowWidth: round(s.rowW),
        fitToScreen: s.fit,
        smallestSideMargin: s.side,
        gapBetween: s.picGap,
        shapes: s.shapes === 'same' ? `all the same shape, ${s.ratio}:1 (crops)` : 'as photographed (nothing cropped)',
        sizes: m ? m.rects.map((r) => `${round(r.width)}x${round(r.height)}`) : undefined,
      },
      title: {
        size: s.titleMode === 'custom' ? s.titleSize : m ? round(m.fs) : undefined,
        sizedFromPictures: s.titleMode === 'match',
        alignedTo: s.titleAlign === 'edges' ? 'outer edges of the row' : 'centre of first to centre of last picture',
      },
      gaps: {
        aboveTitle: s.gapTop,
        titleToPictures: s.gapTitle,
        picturesToNav: s.gapNav,
        navToIcons: s.gapFooter,
        belowIcons: s.gapBottom,
      },
    };
    return JSON.stringify(out, null, 2);
  }

  // ---- keeping the carousel still ---------------------------------------------

  // site.js rotates the row and restarts on mouse-leave, focus-out, resize and
  // tab changes. While "hold still" is on, those are swallowed before site.js
  // sees them (capture runs first), and the rotation is stopped by the same
  // event site.js already uses for hover.
  const swallow = (e) => { if (s.freeze) e.stopImmediatePropagation(); };
  strip.addEventListener('pointerleave', swallow, true);
  strip.addEventListener('focusout', swallow, true);
  document.addEventListener('visibilitychange', swallow, true);
  let lastFreeze = null;
  function syncFreeze() {
    if (lastFreeze === s.freeze) return;
    lastFreeze = s.freeze;
    strip.dispatchEvent(new Event(s.freeze ? 'pointerenter' : 'pointerleave'));
  }

  // ---- wiring -----------------------------------------------------------------

  let raf = 0;
  function schedule() {
    save();
    updateEnabled();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { syncFreeze(); relayout(); });
  }
  addEventListener('resize', (e) => {
    schedule();
    if (s.freeze) e.stopImmediatePropagation();
  }, true);
  desktop.addEventListener('change', schedule);

  syncControls();
  // The title is sized from the font's measurements, and the pictures from
  // their natural ratios: wait for both before the first layout.
  const ready = [document.fonts?.ready, ...[...track.querySelectorAll('img')].map((i) => i.decode?.().catch(() => {}))];
  Promise.all(ready).then(() => { syncFreeze(); relayout(); });
  relayout();
}
