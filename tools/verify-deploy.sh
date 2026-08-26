#!/usr/bin/env bash
# Post-deploy verification (spec V9). Run this against production IMMEDIATELY
# after uploading — .htaccess cannot be tested locally, and it is the one file
# that can take the whole site down.
#
#   tools/verify-deploy.sh
#
# Exits non-zero if any check fails, so it is safe to trust the summary line.
set -uo pipefail

HOST="${HOST:-https://nikoltsvetanova.com}"
fails=0

code() { curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$1"; }
loc()  { curl -sSI --max-time 20 "$1" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}'; }
hdr()  { curl -sSI --max-time 20 "$1" | tr -d '\r' | grep -i "^$2:" | cut -d' ' -f2-; }

check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then
    printf '  PASS  %-46s %s\n' "$1" "$2"
  else
    printf '  FAIL  %-46s got %-22s want %s\n' "$1" "$2" "$3"
    fails=$((fails + 1))
  fi
}

echo
echo "Verifying $HOST"
echo

# 1. THE BIG ONE. A malformed .htaccess returns 500 for every page. If this
#    fails, restore the backed-up .htaccess immediately — the site is down.
echo "Site is up (a 500 here means .htaccess is malformed — restore the backup NOW):"
for p in / /about /reel /contact /gallery; do
  check "GET $p" "$(code "$HOST$p")" "200"
done
echo

# 2. Old URLs must keep working for anyone holding a bookmark or a sent link.
echo "Old URLs still resolve:"
check "/about.html redirects"    "$(code "$HOST/about.html")" "301"
check "  -> to"                  "$(loc  "$HOST/about.html")" "$HOST/about"
check "/gallery.html redirects"  "$(code "$HOST/gallery.html")" "301"
check "/headshots.html retired"  "$(code "$HOST/headshots.html")" "301"
check "  -> to"                  "$(loc  "$HOST/headshots.html")" "$HOST/"
echo

# 3. The resume PDF. Its 2024 URL may have gone to casting directors.
echo "Resume PDF (the URL that may be in casting inboxes):"
check "new path serves PDF" "$(code "$HOST/assets/docs/nikol-tsvetanova-resume.pdf")" "200"
check "  content-type"      "$(hdr  "$HOST/assets/docs/nikol-tsvetanova-resume.pdf" content-type)" "application/pdf"
check "2024 URL redirects"  "$(code "$HOST/IMAGES/Nikol%20Tsvetanova%20Resume.pdf")" "301"
echo

# 4. Working directories must never be served.
echo "Working directories are not public:"
for p in /tools/check-links.mjs /_source/image-manifest.json /docs/superpowers/specs; do
  actual="$(code "$HOST$p")"
  if [ "$actual" = "404" ] || [ "$actual" = "403" ]; then
    printf '  PASS  %-46s %s\n' "$p blocked" "$actual"
  else
    printf '  FAIL  %-46s got %-22s want 404 or 403\n' "$p blocked" "$actual"
    fails=$((fails + 1))
  fi
done
echo

# 5. Canonical host and scheme.
echo "Canonical host and HTTPS:"
check "http:// redirects"  "$(code "http://nikoltsvetanova.com/")" "301"
check "www. redirects"     "$(code "https://www.nikoltsvetanova.com/")" "301"
echo

# 6. Headers the old site sent none of.
echo "Cache headers (absent entirely before this deploy):"
css="$(hdr "$HOST/assets/css/site.css" cache-control)"
img="$(hdr "$HOST/assets/img/headshot-01-640.avif" cache-control)"
printf '  css: %s\n' "${css:-<none>}"
printf '  img: %s\n' "${img:-<none>}"
[ -n "$css" ] || { echo "  WARN  no Cache-Control on CSS — mod_headers may be unavailable on this plan"; }
case "$img" in *immutable*) echo "  WARN  images are immutable; a replaced headshot would stay stale for a year";; esac
echo

# 7. The 313 MB reel should be gone from the server.
echo "Old reel removed from server:"
reel="$(code "$HOST/IMAGES/Nikol%20Tsvetanova%20Reel.mp4")"
if [ "$reel" = "200" ]; then
  echo "  NOTE  still present (200) — expected until you delete it; 313 MB still on the host"
else
  printf '  PASS  %-46s %s\n' "reel gone" "$reel"
fi
echo

echo "------------------------------------------------------------"
if [ "$fails" -eq 0 ]; then
  echo "ALL CHECKS PASSED"
else
  echo "$fails CHECK(S) FAILED"
  echo "If the site-is-up checks failed, restore the previous .htaccess first."
fi
exit "$fails"
