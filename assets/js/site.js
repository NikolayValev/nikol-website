// All site behavior. Loaded as a module, so it is deferred by default.
// Every feature degrades: with JS off, the nav renders as a plain static row,
// gallery images are plain links, and the reel is a link.

document.documentElement.classList.remove('no-js');

// One breakpoint, named once. Below it the nav is a sheet behind a "+" and the
// picture strip is a static 2x2 block; at or above it the nav is a row and the
// strip is a rotating line of four. Both must agree with site.css.
const WIDE = '(min-width: 48em)';

function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const list = document.querySelector('.nav-list');
  const close = document.querySelector('.nav-close');
  if (!toggle || !list) return;

  // The list is a modal only below the breakpoint. At or above it the same
  // element is a permanently visible nav row, and trapping focus there strands
  // the keyboard user on the last link with no way into the page.
  const wide = window.matchMedia(WIDE);

  // Only rendered elements can take focus. .nav-close is display:none at
  // desktop width, and calling focus() on it silently does nothing.
  const focusable = () =>
    [...list.querySelectorAll('a[href], button:not([disabled])')].filter(
      (el) => el.offsetParent !== null,
    );

  function open() {
    list.dataset.open = 'true';
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    focusable()[0]?.focus();
  }

  function shut() {
    list.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    toggle.focus();
  }

  toggle.addEventListener('click', open);
  close?.addEventListener('click', shut);

  // A nav link may open a new tab or navigate away. Either way the sheet is
  // done, and leaving body overflow hidden would strand the visitor on an
  // unscrollable page when they come back.
  for (const link of list.querySelectorAll('a[href]')) {
    link.addEventListener('click', () => {
      if (list.dataset.open === 'true') shut();
    });
  }

  // Crossing into desktop width leaves no sheet to close, so release the
  // scroll lock rather than stranding the page unscrollable with no overlay
  // visible to explain why.
  wide.addEventListener('change', (event) => {
    if (!event.matches) return;
    list.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  });

  list.addEventListener('keydown', (event) => {
    // No trap unless the sheet is genuinely open AS a modal.
    if (list.dataset.open !== 'true' || wide.matches) return;

    if (event.key === 'Escape') {
      shut();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function initLightbox() {
  const triggers = document.querySelectorAll('[data-lightbox]');
  if (triggers.length === 0) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';
  const img = document.createElement('img');
  dialog.append(img);
  document.body.append(dialog);

  const sources = [...triggers];
  let index = 0;

  function show(i) {
    index = (i + sources.length) % sources.length;
    const link = sources[index];
    img.src = link.getAttribute('href');
    img.alt = link.dataset.alt ?? '';
  }

  triggers.forEach((link, i) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      show(i);
      dialog.showModal();
    });
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') show(index + 1);
    if (event.key === 'ArrowLeft') show(index - 1);
  });
}

function initVideoFacade() {
  for (const facade of document.querySelectorAll('.facade')) {
    facade.addEventListener('click', (event) => {
      event.preventDefault();
      const id = facade.dataset.youtube;
      if (!id) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'embed';
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      frame.title = facade.dataset.title ?? 'Video';
      frame.allow =
        'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture';
      frame.allowFullscreen = true;
      wrapper.append(frame);
      facade.replaceWith(wrapper);
      frame.focus();
    });
  }
}

// The home picture strip. Only a rotation where the strip is actually a row:
// below 48em the comps draw a static 2x2 block, and cloning into a two-column
// grid would just make it eight pictures deep.
function initStrip() {
  const strip = document.querySelector('.strip');
  if (!strip) return;

  const track = strip.querySelector('.strip-track');
  const originals = [...strip.querySelectorAll('.strip-slide')];
  if (!track || originals.length === 0) return;

  const DELAY = 3200;
  const RESUME_AFTER = 5000;
  const wide = window.matchMedia(WIDE);
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  let clones = [];
  let timer = null;
  let resumeTimer = null;
  let settle = null;

  // Duplicate the slides once. Because the second copy is identical to the
  // first, jumping the scroll position by exactly one loop width is invisible,
  // which is what makes continuous one-direction motion possible without the
  // strip ever visibly snapping back.
  function addClones() {
    if (clones.length > 0) return;
    clones = originals.map((slide) => {
      const clone = slide.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.append(clone);
      return clone;
    });
  }

  function removeClones() {
    for (const clone of clones) clone.remove();
    clones = [];
  }

  // Measured rather than computed: with four slides laid out by flex-basis and
  // a fluid gap, the distance from one slide to the next is the only number
  // that is reliably right.
  const step = () =>
    originals.length > 1
      ? originals[1].offsetLeft - originals[0].offsetLeft
      : originals[0].getBoundingClientRect().width;
  const loopWidth = () => step() * originals.length;

  // The position is kept inside [0, loopWidth). Beyond that the track simply
  // runs out of scrollable width.
  function normalizeSoon() {
    clearTimeout(settle);
    settle = setTimeout(() => {
      const loop = loopWidth();
      if (loop <= 0) return;
      if (track.scrollLeft >= loop) track.scrollLeft -= loop;
      else if (track.scrollLeft < 0) track.scrollLeft += loop;
    }, 220);
  }

  // Moves the strip leftward: scrollLeft increases, so each new image enters
  // from the right edge.
  function advance() {
    const distance = step();
    const loop = loopWidth();
    if (distance <= 0) return;
    // Rewind by exactly one loop before it would run past the end. The second
    // copy is identical to the first, so the jump cannot be seen.
    if (track.scrollLeft + distance >= loop - 0.5) {
      track.scrollLeft -= loop;
    }
    track.scrollTo({
      left: track.scrollLeft + distance,
      behavior: calm.matches ? 'auto' : 'smooth',
    });
  }

  function play() {
    if (calm.matches || !wide.matches) return;
    stop();
    addClones();
    timer = setInterval(advance, DELAY);
  }

  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  // Back to the 2x2 block: no rotation, no clones, and the scroll position
  // reset so a grid does not start life scrolled sideways.
  function teardown() {
    stop();
    clearTimeout(resumeTimer);
    removeClones();
    track.scrollLeft = 0;
  }

  // Hover, focus, and touch all hand control to the visitor. There is no
  // on-screen pause control by design, so these are the pause mechanism.
  function hold() {
    stop();
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(play, RESUME_AFTER);
  }

  strip.addEventListener('pointerenter', stop);
  strip.addEventListener('pointerleave', play);
  strip.addEventListener('focusin', stop);
  strip.addEventListener('focusout', play);
  track.addEventListener('pointerdown', hold);
  track.addEventListener('touchstart', hold, { passive: true });
  track.addEventListener('scroll', normalizeSoon, { passive: true });

  addEventListener(
    'resize',
    () => {
      stop();
      track.scrollLeft = 0;
      play();
    },
    { passive: true },
  );

  // Nothing is gained by advancing a strip nobody can see.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else play();
  });

  calm.addEventListener('change', (event) => {
    if (event.matches) stop();
    else play();
  });

  wide.addEventListener('change', (event) => {
    if (event.matches) play();
    else teardown();
  });

  if (wide.matches) {
    // The track is only focusable, and only announced as scrollable, while it
    // actually is one.
    track.tabIndex = 0;
    requestAnimationFrame(() => {
      track.scrollLeft = 0;
      play();
    });
  }
}

function initReveal() {
  const targets = document.querySelectorAll('.reveal');
  if (targets.length === 0) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const el of targets) el.dataset.visible = 'true';
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.dataset.visible = 'true';
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  );

  for (const el of targets) observer.observe(el);
}

initNav();
initStrip();
initLightbox();
initVideoFacade();
initReveal();
