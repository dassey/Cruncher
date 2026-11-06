// Offline-render the synthesized music in each mode; report loudness/bass and save WAV previews.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ ignoreHTTPSErrors: true });
await page.goto('https://localhost:4173/?bot&fresh&seed=7');
await page.waitForFunction(() => window.__CRUNCHER__);
fs.mkdirSync('qa/audio', { recursive: true });
const out = {};
for (const mode of ['menu', 'game', 'boss']) {
  const r = await page.evaluate((m) => window.__CRUNCHER__.audioCheck(10, m), mode);
  fs.writeFileSync(`qa/audio/music-${mode}.wav`, Buffer.from(r.wav, 'base64'));
  out[mode] = { peak: +r.peak.toFixed(3), rmsDb: +r.rmsDb.toFixed(1), bassShare: +r.bassShare.toFixed(2) };
}
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync('qa/audio/metrics.json', JSON.stringify(out, null, 2));
await browser.close();
