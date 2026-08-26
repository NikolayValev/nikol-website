# nikoltsvetanova.com — Modernization Design

**Date:** 2026-08-25
**Status:** Approved for planning
**Baseline commit:** `0dc70c2`

---

## 1. Context

nikoltsvetanova.com is the personal site of Nikol Tsvetanova, a Bulgarian-born
actress based in New York. It is a hand-built static site on HostGator shared
Apache hosting, designed by Mila Tsvetanova, and last modified 16 September 2024.

### Current state

Production serves four pages. `index.html` is an 8.7 KB one-pager holding bio,
reel, headshot slideshow, gallery, and contact; `about.html`, `headshots.html`,
and `gallery.html` duplicate that content for narrow viewports.

The local working copy has diverged. `about/headshots/gallery.html` are
byte-identical to production, but local `index.html` is a half-finished redesign
(four-image hero, bottom desktop nav) that never shipped.

### Problems this work addresses

| # | Problem | Evidence |
|---|---|---|
| P1 | Site is built twice — `desktop_*` and `mobile_*` class pairs swapped by `display:none` at a single 450px breakpoint | `type.css` lines 545–1025 |
| P2 | Nothing handles 451–1200px. Tablets and small laptops get the desktop layout unscaled | Only `@media (max-width: 450px)` has rules; the 1500px and 800px blocks are empty |
| P3 | 374 MB of assets. The reel alone is a **313,874,869-byte** MP4 served from the same shared host | `curl -I` on the live reel |
| P4 | Gallery JPEGs run 7–8 MB each, with no `loading`, `srcset`, or intrinsic dimensions | `NTG1.jpg` 7.87 MB, `NT4.jpg` 7.55 MB, `NTG3.jpg` 7.14 MB |
| P5 | Headshot slideshow is broken in production — `showSlides()` dereferences `dots[slideIndex-1].className`, but no element carries class `demo`, so every arrow click throws a `TypeError` | live `index.html` inline script |
| P6 | ~90 KB of jQuery loaded to show and hide one menu | `nikolScript.js` is 28 lines, all menu toggling |
| P7 | A full FontAwesome kit loads for two icons | Only `fa-square-instagram` and `fa-youtube` are used |
| P8 | **Every remotely-loaded font is unused.** Typekit `objektiv-mk1` (all four pages) and Google `Arsenal` (three pages) appear in zero CSS rules | `grep -ric objektiv/arsenal type.css` → 0 |
| P9 | 2.9 MB of self-hosted Times New Roman `.ttf`, a licensed Microsoft font that ships on virtually every device anyway | `TYPEFACES/` |
| P10 | No accessibility affordances — every `alt=""`, menu toggle is a non-focusable `<a>` with no `href`, no landmarks, no focus states | all pages |
| P11 | No meta description, Open Graph, Twitter card, favicon, canonical, sitemap, or structured data | all pages |
| P12 | No cache headers of any kind; no compression config | `curl -I` returns no `Cache-Control`, no `ETag` |
| P13 | Local markup references `NT_G*.jpg` / `NT_H*.jpg`; files on disk are `NTG*.jpg` / `NTH*.jpg`. Nothing but the hero renders locally | filesystem vs. markup |
| P14 | Duplicate/dead nav entries — local index links both "Footage Gallery" and "Headshots" to `headshots.html`, and desktop "Reel" and "Gallery" both to `headshots.html` | local `index.html` lines 49–51, 83–84 |

## 2. Goals

1. One responsive markup set per page — eliminate the desktop/mobile duplication.
2. Add a **Reel** page: YouTube-hosted reel plus a self-hosted gallery of individual clips.
3. Add a **Résumé** page: full credits as HTML, with the PDF as a secondary download.
4. Evolve the visual design — same serif, minimal, editorial character; modern layout language.
5. Cut payload from 374 MB to under ~15 MB of deployed assets.
6. Make the site accessible and discoverable.

## 3. Non-goals

Explicitly out of scope: a CMS, any JS framework, a contact form, a news/press
section, internationalization, and analytics. The `mailto:` link to her agent
remains the contact mechanism.

## 4. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Build approach | **Hand-written static HTML/CSS/JS, no build step** | Six pages updated roughly yearly. A permanent Node toolchain is a worse tax than ~30 lines of `<head>`/nav duplication. Anyone can open a file and fix a typo. |
| Hosting | **Keep HostGator**, upload static files as today | User constraint. No server-side execution available. |
| Design latitude | **Evolve** | Keep Mila Tsvetanova's serif/minimal/grayscale identity; modernize the layout language. |
| Reel video | **YouTube embed**, click-to-load facade | Zero bandwidth on shared hosting, adaptive quality, no third-party JS until the visitor presses play. |
| Clip videos | **Self-hosted**, compressed, `preload="none"` | User preference; cost is bounded because nothing downloads until clicked. |
| Headshots | **On `index.html`**, below a hero row | User instruction; assumption confirmed at design approval. |

### The no-build-step boundary

Approach A was chosen specifically to avoid a build step, and that constraint is
load-bearing. To be unambiguous:

- **The deployed site has no build.** The HTML, CSS, and JS uploaded to HostGator
  are the files as authored. No compiler, bundler, or preprocessor sits between
  authoring and deploying.
- **`tools/` is one-time and local.** The image optimizer, video encoder, and
  link checker are Node/ffmpeg scripts run once during this work, whose *outputs*
  are committed. They are not required to edit content or deploy. Deleting
  `tools/` entirely would not break the site.

## 5. Architecture

### File layout

```
/
├── index.html            Hero row + headshot gallery
├── about.html            Bio, contact, socials
├── reel.html             YouTube reel + self-hosted clip gallery   [new]
├── resume.html           Full HTML credits + PDF download          [new]
├── gallery.html          Production stills with caption overlays
├── 404.html
├── .htaccess
├── robots.txt
├── sitemap.xml
├── favicon.svg, favicon.ico, apple-touch-icon.png
├── assets/
│   ├── css/site.css
│   ├── js/site.js
│   ├── fonts/mirra.woff2
│   ├── img/              Optimized, responsive derivatives (deployed)
│   ├── video/            Compressed clips + poster frames (deployed)
│   └── docs/nikol-tsvetanova-resume.pdf
├── _source/              Originals. Never uploaded.
│   ├── images/           The current IMAGES/ contents
│   └── video/
├── tools/                One-time scripts. Never uploaded.
│   ├── optimize-images.mjs
│   ├── encode-clips.sh
│   └── check-links.mjs
└── docs/superpowers/specs/
```

The `_source/` and `tools/` directories carry a leading underscore or an obvious
non-web name so the deploy set is self-evident: **upload everything except
`_source/`, `tools/`, `docs/`, and dotfiles other than `.htaccess`.**

### Navigation

One nav, identical markup on all five pages: **Home · About · Reel · Résumé · Gallery**.

- ≥1024px: horizontal, fixed to the bottom edge (preserving the current desktop idiom)
- <1024px: a `<button>` toggle opening a full-screen overlay

Duplicate and mis-targeted links (P14) are resolved: each entry points to exactly
one distinct page. The current page is marked `aria-current="page"`.

## 6. Design system

### Palette

Derived from the existing greys, with contrast raised to meet WCAG AA.

```css
--paper:      #E8E6E4;   /* page ground, from #e3e1e1/#DCDCDC */
--panel:      #F2F0EF;   /* raised content panels, unchanged */
--ink:        #111111;   /* body text — 14.7:1 on --paper */
--ink-muted:  #55514E;   /* captions, credits — 7.1:1 on --paper */
--line:       rgba(17,17,17,0.14);
--ink-invert: #F2F0EF;   /* text over image overlays */
--overlay:    rgba(17,17,17,0.72);
```

### Type scale

Fluid via `clamp()`, so there is no dead zone between breakpoints:

```css
--step--1: clamp(0.83rem, 0.79rem + 0.18vw, 0.94rem);   /* credits, captions */
--step-0:  clamp(1.06rem, 1.00rem + 0.31vw, 1.25rem);   /* body */
--step-1:  clamp(1.33rem, 1.21rem + 0.58vw, 1.75rem);
--step-2:  clamp(1.66rem, 1.44rem + 1.08vw, 2.62rem);
--step-3:  clamp(2.07rem, 1.68rem + 1.95vw, 3.93rem);
--step-4:  clamp(2.59rem, 1.90rem + 3.44vw, 5.90rem);   /* display */
```

### Spacing

A single ratio scale on `--space-3xs` … `--space-3xl`, each `clamp()`-fluid.
All existing percentage padding (`padding-top: 14%`, `padding-bottom: 15%`, etc.)
is replaced — percentage padding resolves against *width*, which is why the
current vertical rhythm collapses at unusual aspect ratios.

### Layout

- Galleries: CSS Grid, `repeat(auto-fit, minmax(min(100%, 22rem), 1fr))` — reflows
  continuously rather than at one breakpoint, directly resolving P2.
- Editorial evolution: an asymmetric grid where selected images break the text
  column, and display-to-body type contrast is widened considerably.
- Motion: scroll-reveal via `IntersectionObserver`, opacity and a small translate
  only, entirely disabled under `prefers-reduced-motion: reduce`.

### Typography

| Role | Now | After |
|---|---|---|
| Body serif | 2.9 MB self-hosted Times `.ttf` × 4 | `"Times New Roman", Times, serif` — **0 bytes**, near-identical rendering |
| Display | `Mirra.otf` (23 KB) | `mirra.woff2` (~10 KB), `font-display: swap` |
| — | Typekit `objektiv-mk1` | **Removed** (unused) |
| — | Google `Arsenal` | **Removed** (unused) |

Net: 2.9 MB saved and three third-party font connections eliminated.

**Risk R2** — if Mirra's license does not permit web embedding, substitute a
comparable open high-contrast didone (Playfair Display), self-hosted as woff2.
This is a drop-in swap of one `@font-face` rule and one custom property.

## 7. Media pipeline

### Images

A one-time offline pass (`tools/optimize-images.mjs`, sharp) reading `_source/images/`
and emitting to `assets/img/`:

- Longest edge capped at 2400px
- Three widths per image (640 / 1280 / 2400), each as AVIF + WebP + JPEG fallback
- `<picture>` with `srcset`/`sizes`; JPEG as the final `<img>` source
- `loading="lazy"` and `decoding="async"` on everything below the fold; the index
  hero images load eagerly with `fetchpriority="high"` on the first
- Explicit `width`/`height` on every `<img>` to eliminate cumulative layout shift

**Filename normalization** (resolves P13). All 14 gallery, 9 headshot, and 4 hero
originals are present on disk; only the naming is inconsistent.

| Role | Sources on disk | Normalized to |
|---|---|---|
| Hero | `NT1–NT4.jpg` | `hero-01…04` |
| Headshots | `NTH1–NTH9.jpg` | `headshot-01…09` |
| Gallery | `NTG1–7`, `NTG9`, `NT_G8`, `NT_G10–14` | `gallery-01…14` |

Target: 374 MB → under ~15 MB deployed.

### Reel

YouTube, embedded behind a click-to-load facade: a poster image and a play
button; the `<iframe>` is injected only on activation, using
`youtube-nocookie.com`. No third-party request is made for visitors who never
press play. The facade is a `<button>`, keyboard-operable, labelled
"Play reel — Nikol Tsvetanova".

### Clips

Self-hosted in `assets/video/`, encoded by `tools/encode-clips.sh` (ffmpeg):
H.264 High, 1080p cap, CRF 23, AAC 128k, `+faststart`. Each clip ships with a
poster frame extracted at encode time. Markup uses `preload="none"`,
`playsinline`, `controls`, and the poster — so a clip costs one small JPEG until
played.

**The 313 MB MP4 is deleted from the server.** The master stays on local disk,
untracked (see `.gitignore`), and must be backed up outside the repo before the
server copy is removed.

## 8. JavaScript

jQuery and the FontAwesome kit are removed. One file, `assets/js/site.js`,
loaded as `<script type="module" defer>`, roughly 60 lines across four functions:

| Function | Behavior |
|---|---|
| `initNav()` | Toggle the overlay. `aria-expanded` on the button, `Escape` closes, focus moves into the overlay on open and returns to the button on close, focus trapped while open. |
| `initLightbox()` | Click a gallery image to open it full-bleed. `Escape` closes, `←`/`→` step, focus restored on close. Built on `<dialog>` with `showModal()`. |
| `initVideoFacade()` | Replace the reel poster with the YouTube iframe on activation. |
| `initReveal()` | `IntersectionObserver` scroll reveal; no-ops under `prefers-reduced-motion`. |

Every feature degrades: with JS disabled, the nav overlay is reachable via a
`:target` CSS fallback, gallery images are plain links to the full-size file, and
the reel facade is a link to the YouTube page.

The two social icons become inline SVG, removing the FontAwesome kit entirely (P7).

The broken slideshow (P5) is not repaired — it is replaced. Headshots become a
grid on `index.html` with the lightbox, so there is no slide index to desync.

## 9. Résumé page

Content is extracted from `_source/.../Nikol Tsvetanova Resume.pdf` and is fully
specified here, so implementation needs no further input.

**Header:** Nikol Tsvetanova · Represented by Florance Kirilova, Posche Talent ·
florance@poschemodels.com · (646) 205 3023 · New York, New York · Non-Union

**Theatre**

| Production | Role | Company / Director |
|---|---|---|
| Full Moon | Avery | The Chain Theatre One-Act Festival / Dir. Caitlin Mayernik |
| Henry IV Part 1 | Prince Hal | Purchase Repertory / Dir. Petronia Paley |
| Sweat | Tracey | Purchase Repertory / Dir. Cezar Williams |
| Life Is a Dream | Rosaura | Purchase Repertory / Dir. Tatyana-Marie Carlo |
| Passage | R, S, Mosquito, Gecko | Purchase Repertory / Dir. James Dean Palmer |
| The Last Days of Judas Iscariot | Saint Thomas | Purchase Repertory / Dir. Dean Irby |
| Ties | Carol | Squee Productions / Dir. Soha Rizvi |

**Television**

| Production | Role | Network / Director |
|---|---|---|
| Law and Order: Organized Crime | Costar | NBC / Dir. Terry Miller |

**Film**

| Production | Role | Director |
|---|---|---|
| Confession | Supporting | The Club Creates / Dir. Katherine Cullen |
| String Theory | Lead | Dir. Zeena Kubeisy |
| Animosity | Lead | Dir. Christian Montes |
| Attached | Lead | Dir. Jonathon Oliveira |
| Deux Visage | Supporting | Dir. Jonathon Oliveira |
| Undergrads (Web Series) | Supporting | Dir. Egor Subbotin |

**Training** — SUNY Purchase BFA Acting Conservatory

- Acting — Trazana Beverly, Matthew Gasda, Dennis Hilton-Reid, Dean A. Irby, Karen Kohlhaas
- Shakespeare Technique — Christopher McCann
- Speech — Margaret Surrovell, Henry McDaniel
- Voice — Ginger Eckert, Liam Joynt, Pamela Prather
- Stage Combat — Mitch McCoy, J. Allen Suddeth
- Dance/Movement — Jill Echo, Ronni Stewart, Gabriel Thomas Pasculli
- Improv/Clown — Sarah Petersiel
- Mask — Jay Dunn

**Skills** — Languages: fluent in Bulgarian. Dialects: RP, Cockney, Russian,
Bulgarian; proficient in IPA. Movement: strong mover, yoga, armed and unarmed
stage combat (SAFD 2022), Bulgarian folk dance. Miscellaneous: bartending, driver
(automatic). Citizenship/Passports: US, Bulgarian.

Marked up as `<table>` per section with real `<caption>` and `<th scope>`, and
collapsing to stacked definition rows below 640px. The PDF remains linked as a
secondary "Download PDF" action for casting submissions.

> The PDF renders the dialect as "URP", which is not a dialect designation. This
> is read as a typo for **RP** (Received Pronunciation) and corrected on the web
> page. Flag to Nikol; the PDF itself is not edited by this work.

## 10. Accessibility

- Descriptive `alt` on every image. Production titles supply gallery alt text;
  headshots get photographer-credited descriptive text. **Risk R3:** alt text and
  photo credits should be confirmed by Nikol for accuracy before launch.
- Landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`), one `<h1>` per page, and
  a correct heading hierarchy.
- Skip-to-content link.
- `:focus-visible` styling on every interactive element — currently absent entirely.
- The menu toggle becomes a `<button>` (P10).
- Existing hover-only gallery overlays gain a persistent visible caption below the
  image, since hover reveals are unavailable on touch and to keyboard users. The
  current mobile CSS `display: none`s them outright, so those credits are simply
  invisible on phones today.
- Target: zero axe-core violations, Lighthouse Accessibility ≥ 95 per page.

## 11. SEO

- Unique `<title>` and `<meta name="description">` per page
- Open Graph and Twitter card tags with a dedicated share image
- `rel="canonical"` per page
- `sitemap.xml`, `robots.txt`, favicon set
- **JSON-LD `Person` schema** on `index.html` — `name`, `jobTitle`, `nationality`,
  `alumniOf` (SUNY Purchase), `url`, and `sameAs` linking IMDb, Instagram, and
  YouTube. Highest-leverage item here: it is what makes a search for her name
  resolve authoritatively to this site rather than to a third-party profile.

## 12. Server configuration

An `.htaccess` supplying what is currently absent (P12):

- `Cache-Control: public, max-age=31536000, immutable` for `assets/` (safe because
  optimized filenames are stable and content-addressed by role)
- `Cache-Control: public, max-age=3600` for HTML
- `mod_deflate` for text/HTML/CSS/JS/SVG
- Forced HTTPS and canonical host
- Extensionless URLs (`/about` → `/about.html`), with existing `.html` URLs
  301-redirected to the clean form so current links keep working
- `ErrorDocument 404 /404.html`
- Correct `Content-Type` for `.avif` and `.woff2`, which Apache may not know
- **A 301 from `/IMAGES/Nikol Tsvetanova Resume.pdf` to the new
  `/assets/docs/nikol-tsvetanova-resume.pdf`.** That URL has been live since
  September 2024 and may have been sent to casting directors or agents; moving
  the asset tree would otherwise 404 it silently. Other `/IMAGES/*` URLs are
  allowed to lapse — they are page-embedded assets, not shared links.

## 13. Verification

There is no test framework on a static site, so verification is explicit and
evidence-based. **No step below is considered done on inspection alone.**

| # | Check | Method | Pass condition |
|---|---|---|---|
| V1 | Every page renders at every width | Local server, 375 / 768 / 1024 / 1280 / 1920 | No horizontal scroll, no overlap, no orphaned controls at any width |
| V2 | No broken links or assets | `tools/check-links.mjs` crawls all pages, resolves every `href`/`src`/`srcset` | Zero unresolved references |
| V3 | HTML validity | `npx html-validate *.html` | Zero errors |
| V4 | Accessibility | axe-core per page; manual keyboard pass | Zero violations; every interactive element reachable and visibly focused |
| V5 | Performance | `npx lighthouse` per page | Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95 |
| V6 | Payload | Sum of deployed `assets/` | Under 15 MB |
| V7 | Progressive enhancement | Reload each page with JS disabled | Nav, galleries, and reel all remain usable |
| V8 | Reduced motion | `prefers-reduced-motion: reduce` | No transform or opacity animation runs |

V2 exists specifically because P13 — a filename mismatch across an entire
gallery — shipped and went unnoticed. That class of bug must be caught mechanically.

## 14. Risks and open items

| ID | Item | Impact | Handling |
|---|---|---|---|
| R1 | **The individual clips do not yet exist.** No clip files are on disk — only the full reel. | Blocks the clip gallery, not the reel | `reel.html` ships with the YouTube reel live and the clip gallery built but empty, driven by a small array in the markup. Adding a clip is then a file plus three lines. Non-blocking. |
| R2 | Mirra web-embedding license unconfirmed | Display typeface only | Drop-in substitution of one `@font-face`; see §6 |
| R3 | Alt text and photo credits need Nikol's confirmation | Accuracy, not function | Draft from production titles; flag for review before launch |
| R4 | Reel master must be backed up before the server copy is deleted | Irreversible if skipped | Explicit gated step in the plan, before any deletion |
| R5 | The YouTube reel URL is not yet known | Blocks the reel embed | Placeholder constant in `reel.html`; needs the URL before launch |
| R6 | Deployment is manual via cPanel/FTP | Human error | Plan produces an explicit deploy manifest; optional FTP push script if wanted |

## 15. What "done" looks like

Five navigable pages plus a 404, one responsive markup set each, on the existing host. Under 15 MB
deployed, down from 374 MB. No jQuery, no FontAwesome, no unused fonts. A working
reel page and a real résumé page. Keyboard-navigable, screen-reader-legible, and
findable by name. Every claim in §13 backed by a command that was actually run.
