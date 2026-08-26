#!/usr/bin/env node
// Zero-dependency link and asset checker.
// Verifies that every local href/src/poster/srcset in every root HTML page
// resolves to a file that actually exists on disk.
import { readdir, readFile, access } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ATTR_RE = /\b(?:href|src|poster)\s*=\s*["']([^"']+)["']/gi;
const SRCSET_RE = /\bsrcset\s*=\s*["']([^"']+)["']/gi;

const isExternal = (u) => /^(?:https?:|mailto:|tel:|data:|#|\/\/)/i.test(u);

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function refsFrom(html) {
  // Strip HTML comments first: example/scaffold markup inside <!-- --> is
  // documentation, not a live reference, and shouldn't be checked.
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  const out = new Set();
  for (const m of stripped.matchAll(ATTR_RE)) out.add(m[1].trim());
  for (const m of stripped.matchAll(SRCSET_RE)) {
    for (const candidate of m[1].split(',')) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) out.add(url);
    }
  }
  return [...out];
}

// An extensionless internal link resolves to <name>.html, matching .htaccess.
async function resolveRef(ref, fromPage) {
  const clean = decodeURIComponent(ref.split('#')[0].split('?')[0]);
  if (!clean) return true;
  const base = clean.startsWith('/')
    ? join(ROOT, clean)
    : resolve(ROOT, dirname(fromPage), clean);
  return (await exists(base)) || (await exists(`${base}.html`));
}

const pages = (await readdir(ROOT)).filter((f) => f.endsWith('.html'));
let failures = 0;
let checked = 0;

for (const page of pages) {
  const html = await readFile(join(ROOT, page), 'utf8');
  for (const ref of refsFrom(html)) {
    if (!ref || isExternal(ref)) continue;
    checked += 1;
    if (!(await resolveRef(ref, page))) {
      console.error(`MISSING  ${page}  ->  ${ref}`);
      failures += 1;
    }
  }
}

console.log(`\nchecked ${checked} local references across ${pages.length} pages`);
if (failures > 0) {
  console.error(`FAIL: ${failures} unresolved reference(s)`);
  process.exit(1);
}
console.log('PASS: all local references resolve');
