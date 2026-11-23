# nikoltsvetanova.com

The personal site of Nikol Tsvetanova, actor, New York.

Seven pages plus a 404, hand-written and static, hosted on HostGator shared
Apache and deployed by uploading files. **There is no build step** — the HTML,
CSS, and JS in this repo are exactly what the server serves.

## Working on it

Anything in the site itself is a plain file you can open and edit. To see your
changes:

```bash
node tools/serve.mjs      # http://localhost:8080
```

That server deliberately mirrors the `.htaccess` routing rules, so extensionless
URLs (`/about`, not `/about.html`) resolve locally the same way they do in
production.

Before deploying, check nothing broke:

```bash
node tools/check-links.mjs      # every local reference resolves
node tools/strip-test.mjs      # home strip, nav, and the redesigned pages
node tools/gallery-test.mjs    # the gallery mosaic still reads as a mosaic
npx html-validate index.html about.html headshots.html reel.html resume.html gallery.html contact.html 404.html
```

The two puppeteer scripts need `node tools/serve.mjs` already running.

## Layout

| Path | What it is |
|---|---|
| `index.html` `about.html` `headshots.html` `reel.html` `resume.html` `gallery.html` `contact.html` `404.html` | The site. Deployed as-is. |
| `assets/` | Stylesheet, JS module, font, generated images, résumé PDF. Deployed. |
| `.htaccess` | Caching, compression, clean URLs, redirects. Deployed. |
| `_source/` | Original photographs and fonts. **Never deployed.** |
| `tools/` | One-time and local scripts. **Never deployed.** |
| `docs/` | Design spec and implementation plan. **Never deployed.** |

`tools/` is not part of the site. Deleting it entirely would not break anything
or block a content edit; it exists to regenerate assets and to check work.

## Deploying

Upload the files listed in `tools/deploy-manifest.txt` to the web root. Exclude
`_source/`, `tools/`, `docs/`, and the dotfiles other than `.htaccess`. FTP
clients hide dotfiles by default, so confirm `.htaccess` actually transferred.

**Back up the server's existing `.htaccess` first.** It cannot be tested
locally, and a malformed one makes Apache return 500 for every page — that one
file is the rollback.

Immediately after uploading:

```bash
tools/verify-deploy.sh
```

It checks that the site is up, that old URLs still redirect (including the
résumé PDF path that may be in casting inboxes), that working directories are
not served, and that cache headers arrived.

## The layout designer

A tool for the designer to set the home page's sizes, gaps and alignments by
eye. Open the home page with **`?design`** on the end
(`https://nikoltsvetanova.com/?design`, or the same on a preview link). A
panel appears with sliders for the row width, the title size, the gaps above and
below the title and around the nav and icons, the side margins, whether the
pictures are cropped to one shape, and what the title lines up with. Guides
mark the edges, the picture centres and the title's letters, and measure every
gap; the readout says whether the page still fits one screen. **Copy settings**
puts the numbers on the clipboard to send back. It works on the desktop layout
(window 1024px wide or more).

It is one self-contained component. Visitors never see it (no `?design`, no
panel). **To remove it:** delete the `<script ... layout-designer.js>` line in
`index.html`, delete `assets/js/layout-designer.js`, its line in
`tools/deploy-manifest.txt`, and `tools/designer-test.mjs`. It changes nothing in
`site.css`; everything it does is an inline style it can put back.

## Changing images

Drop new originals in `_source/images/`, add a row to the `RENAMES` map in
`tools/optimize-images.mjs`, then:

```bash
cd tools && npm install && cd ..
node tools/optimize-images.mjs
```

It writes AVIF, WebP, and JPEG at several widths into `assets/img/`, and records
each image's real dimensions in `_source/image-manifest.json`. **Markup reads
that manifest**: `srcset` may only list widths an image actually has. Sources
here range from 1063px to 5075px wide, so not every image has every size, and a
copy-pasted three-width `srcset` will 404.

## Changing the résumé

The Resume page shows the résumé as an image of its page, not the PDF itself.
After replacing `assets/docs/nikol-tsvetanova-resume.pdf` (same name: old links
point at it), redraw the image or the page keeps showing the old résumé:

```bash
node tools/render-resume.mjs
```

It writes `assets/img/resume-{1000,1600,2400}.{webp,png}`. It expects a
one-page PDF and stops otherwise. If the page size changes from 8x10in, update
the `height` on the `<img>` in `resume.html`.

## The design

The current look comes from Mila Tsvetanova's Figma file, "Nikol Tsvetanova
Website". Two things about it are worth knowing before you touch the CSS:

- **The font is Zalando Sans, for everything.** It is a variable face
  (weights 200-900), self-hosted from `assets/fonts/zalando-sans.woff2` (the
  Latin subset, from Google Fonts, SIL OFL) and preloaded on every page. On
  phones and tablets the home page sizes the name (two lines, on every screen)
  from the width of the picture block, using the font's *measured* ink width (7.7733em for
  "TSVETANOVA") and its side bearings, so the letters land on the picture
  edges. **If you change the font, re-measure that number** (it is in the
  "Home" section of `assets/css/site.css`) or the name will no longer line up;
  `node tools/strip-test.mjs` fails with "name is as wide as the pictures".
- **The desktop home is the layout designer's settings** (sent from a
  1376x833 window): a 72px name, the four pictures cropped to one shape
  (`--home-ratio`, 276x394) and one size, a 10px gap, and fixed gaps of
  60/58/34/32/48px down the page, all in the "Home" section of
  `assets/css/site.css`. The side margin (122px on her window) is `--gutter`
  on desktop, scaled with the window width, and the gallery, headshots and
  reel share it. **On phones and tablets the home pictures are never
  cropped**: each `<li class="strip-slide">` carries its photo's width:height
  in `--ar`, and the 2x2 block is solved from those ratios (`--home-k2`). If
  you swap a home photo, update its `--ar`, `--home-k2`, and `2.618544` in
  `layout-designer.js`; the test "uncropped on phones and tablets" catches a
  mismatch.
- **Every picture on the site has the same gap (`--tile-gap`, 10px)**, and in
  the gallery and headshots every picture is the same height. The gallery
  mosaic sizes every picture from one portrait column (a column's width over
  0.672); a landscape spans two columns and comes out at its own shape, so
  rows line up with no visible cropping. Headshots are that same portrait
  size.
- **The home page is exactly one screen tall and cannot scroll**, on every
  device (`overflow: hidden`). The picture block is sized from the screen
  height so the name, pictures, nav and icons always fit; if you add anything
  to the home page, add its height to `--home-other` in the same section, or
  the test "home is one screen and does not scroll" will fail. Under 1024px the
  pictures are a 2x2 block with the "+" menu; from 1024px, a row of four.
- **The inactive nav grey is deliberately darker than the comps.** Mila's grey
  samples as `#8B8680`, which is 3.02:1 against the cream — below WCAG AA, on
  the primary navigation. The token is `#6B6762` (4.7:1) instead. The reason
  is written next to it.

`docs/` and `.superpowers/` record the pre-Figma rebuild, not this design.

## Things that will bite you

- **The headshot files are portraits padded out to landscape with grey**
  (all but `headshot-03`, a true landscape). The Headshots page crops each
  back to a portrait, so the grey never shows there, but the lightbox shows
  the whole file, grey and all. Unpadded originals would fix both.
- **`/resume` and `/contact` are pages again.** For a while they were 301s to
  sections of About; those rules are gone from `.htaccess`. A server still
  carrying the old `.htaccess` sends them to About; `tools/verify-deploy.sh`
  checks for that.
- **`assets/img/imdb.png` is not produced by `optimize-images.mjs`.** That
  script emits AVIF/WebP/JPEG, and JPEG would throw away the mark's
  transparency. It was resized once from `_source/images/IMDB.png`; redo it by
  hand if it ever changes.
- **Image filenames are not content-hashed**, and `.htaccess` caches them for 30
  days. Replacing a photo under the same name means returning visitors keep the
  old one until that expires. Use a new filename when it matters.
- **The 313 MB reel master** (`IMAGES/Nikol Tsvetanova Reel.mp4`) is deliberately
  untracked — git cannot cheaply store or remove a file that size. Back it up
  outside this repo. The site links reels on YouTube instead.
- **`.reveal` and the carousel must never hide content behind JavaScript.** An
  earlier version faded from `opacity: 0`, which left the entire gallery
  invisible with JS disabled while the HTML looked perfectly fine.

## Reference

`docs/superpowers/specs/` records why the site is built this way — including the
problems it was rebuilt to fix. `docs/superpowers/plans/` records how.
