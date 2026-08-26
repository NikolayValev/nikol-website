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
initLightbox();
initVideoFacade();
initReveal();
