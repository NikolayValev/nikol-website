# nikoltsvetanova.com

The personal site of Nikol Tsvetanova, actor, New York.

Four pages plus a 404, hand-written and static, hosted on HostGator shared
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
node tools/check-links.mjs                              # every local reference resolves
npx html-validate index.html about.html reel.html gallery.html 404.html
```

## Layout

| Path | What it is |
|---|---|
| `index.html` `about.html` `reel.html` `gallery.html` `404.html` | The site. Deployed as-is. |
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

## Things that will bite you

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
