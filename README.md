# nikoltsvetanova.com

The personal site of Nikol Tsvetanova, actor, New York.

Five pages plus a 404, hand-written and static, hosted on HostGator shared
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
npx html-validate index.html about.html headshots.html reel.html gallery.html 404.html
```

The two puppeteer scripts need `node tools/serve.mjs` already running.

## Layout

| Path | What it is |
|---|---|
| `index.html` `about.html` `headshots.html` `reel.html` `gallery.html` `404.html` | The site. Deployed as-is. |
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

## The design

The current look comes from Mila Tsvetanova's Figma file, "Nikol Tsvetanova
Website". Two things about it are worth knowing before you touch the CSS:

- **The display face is a placeholder.** The comps are set in a light geometric
  sans whose name is not readable from the file — the Figma MCP needs editor
  access and the link we have is view-only. `--font-display` in
  `assets/css/site.css` is a system stack standing in for it. Everything else
  in the type system (case, tracking, sizes, weights) is measured off the
  comps, so naming the real font is a one-line change.
- **The inactive nav grey is deliberately darker than the comps.** Mila's grey
  samples as `#8B8680`, which is 3.02:1 against the cream — below WCAG AA, on
  the primary navigation. The token is `#6B6762` (4.69:1) instead. The reason
  is written next to it.

`docs/` and `.superpowers/` record the pre-Figma rebuild, not this design.

## Things that will bite you

- **`/headshots` is a placeholder page, and `.htaccess` no longer redirects
  it.** The Figma nav names Headshots, so `headshots.html` exists, is `noindex`,
  and is kept out of `sitemap.xml`. `headshot-01` through `headshot-07` are
  already optimized and waiting. If Headshots leaves the nav again, restore the
  `RewriteRule ^headshots(\.html)?$ / [R=301,L]` line.
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
