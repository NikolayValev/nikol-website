// All site behavior. Loaded as a module, so it is deferred by default.
// Every feature degrades: with JS off, the nav overlay is reachable via
// a plain static list, gallery images are plain links, and the reel is a link.

document.documentElement.classList.remove('no-js');

function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const overlay = document.querySelector('.nav-overlay');
  const close = document.querySelector('.nav-close');
  if (!toggle || !overlay) return;

  // The overlay is a modal only below the desktop breakpoint. At >=64em the
  // same element is a permanently visible nav bar, and trapping focus there
  // strands the keyboard user on the last link with no way into the page.
  const isModal = window.matchMedia('(max-width: 63.999em)');

  // Only rendered elements can take focus. .nav-close is display:none at
  // desktop width, and calling focus() on it silently does nothing.
  const focusable = () =>
    [...overlay.querySelectorAll('a[href], button:not([disabled])')].filter(
      (el) => el.offsetParent !== null,
    );

  function open() {
    overlay.dataset.open = 'true';
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    focusable()[0]?.focus();
  }

  function shut() {
    overlay.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    toggle.focus();
  }

  toggle.addEventListener('click', open);
  close?.addEventListener('click', shut);

  // A nav link may open a new tab (Resume) or navigate away. Either way the
  // modal is done, and leaving body overflow hidden would strand the visitor
  // on an unscrollable page when they come back.
  for (const link of overlay.querySelectorAll('a[href]')) {
    link.addEventListener('click', () => {
      if (overlay.dataset.open === 'true') shut();
    });
  }

  // Crossing into desktop width leaves no modal to close, so release the
  // scroll lock rather than stranding the page unscrollable with no overlay
  // visible to explain why.
  isModal.addEventListener('change', (event) => {
    if (event.matches) return;
    overlay.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  });

  overlay.addEventListener('keydown', (event) => {
    // No trap unless the overlay is genuinely open AS a modal.
    if (overlay.dataset.open !== 'true' || !isModal.matches) return;

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

function initCarousel() {
  const carousel = document.querySelector('.carousel');
  if (!carousel) return;

  const track = carousel.querySelector('.carousel-track');
  const originals = [...carousel.querySelectorAll('.carousel-slide')];
  if (!track || originals.length === 0) return;

  const DELAY = 3200;
  const RESUME_AFTER = 5000;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Duplicate the slides once. Because the second copy is identical to the
  // first, jumping the scroll position by exactly one loop width is invisible,
  // which is what makes continuous one-direction motion possible without the
  // strip ever visibly snapping back.
  for (const slide of originals) {
    const clone = slide.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.append(clone);
  }

  let timer = null;
  let resumeTimer = null;

  const gap = () => parseFloat(getComputedStyle(track).columnGap) || 0;
  const step = () => originals[0].getBoundingClientRect().width + gap();
  const loopWidth = () => step() * originals.length;

  function normalize() {
    const loop = loopWidth();
    if (loop <= 0) return;
    if (track.scrollLeft < 1) track.scrollLeft += loop;
    else if (track.scrollLeft >= loop * 2 - 1) track.scrollLeft -= loop;
  }

  // Moves the strip rightward: scrollLeft decreases, so each new image enters
  // from the left edge.
  function advance() {
    const distance = step();
    if (distance <= 0) return;
    if (track.scrollLeft - distance < 1) {
      track.scrollLeft += loopWidth();   // instant, and visually identical
    }
    track.scrollTo({
      left: track.scrollLeft - distance,
      behavior: calm.matches ? 'auto' : 'smooth',
    });
  }

  function play() {
    if (calm.matches) return;
    stop();
    timer = setInterval(advance, DELAY);
  }

  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  // Hover, focus, and touch all hand control to the visitor. There is no
  // on-screen pause control by design, so these are the pause mechanism.
  function hold() {
    stop();
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(play, RESUME_AFTER);
  }

  carousel.addEventListener('pointerenter', stop);
  carousel.addEventListener('pointerleave', play);
  carousel.addEventListener('focusin', stop);
  carousel.addEventListener('focusout', play);
  track.addEventListener('pointerdown', hold);
  track.addEventListener('touchstart', hold, { passive: true });
  track.addEventListener('scroll', normalize, { passive: true });

  addEventListener('resize', () => {
    stop();
    track.scrollLeft = loopWidth();
    if (!calm.matches) play();
  }, { passive: true });

  // Nothing is gained by advancing a carousel nobody can see.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else play();
  });

  calm.addEventListener('change', (event) => {
    if (event.matches) stop();
    else play();
  });

  // Start one loop in, so there is room to travel leftward before wrapping.
  requestAnimationFrame(() => {
    track.scrollLeft = loopWidth();
    play();
  });
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
initCarousel();
initLightbox();
initVideoFacade();
initReveal();
