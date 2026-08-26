import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 1000 });
await p.goto('http://localhost:8080/gallery', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 600));
const rows = await p.$$eval('.mosaic .figure', els => {
  const byTop = {};
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const key = Math.round(r.top / 5) * 5;
    (byTop[key] ||= []).push({ n: i + 1, w: Math.round(r.width), narrow: el.classList.contains('is-narrow') });
  });
  return Object.values(byTop);
});
console.log('Gallery rows (image numbers and widths):');
rows.forEach((row, i) => {
  console.log(`  row ${i + 1}: ` + row.map(x => `#${x.n}${x.narrow ? ' narrow' : ''} ${x.w}px`).join('  |  '));
});
const allSameWidth = new Set(rows.flat().map(x => x.w)).size === 1;
console.log(`\n  distinct widths: ${new Set(rows.flat().map(x => x.w)).size} (1 would mean a uniform grid, not a mosaic)`);
console.log(`  mosaic restored: ${allSameWidth ? 'NO' : 'YES'}`);
await b.close();
