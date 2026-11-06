// Poses every creature in front of the desktop camera for an art-review screenshot.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const skinArg = process.argv[2] ? `&skin=${process.argv[2]}` : '';
const out = process.argv[3] ?? 'qa/screens/13-lineup.png';
await page.goto(`https://localhost:4173/?bot&fresh&seed=3${skinArg}`);
await page.waitForFunction(() => window.__CRUNCHER__);
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const M = window.__CRUNCHER__;
  // Clone each creature (shares geometry/materials) so gameplay systems can't hide it.
  const sc = M.world.scene;
  sc.traverse((o) => { if (o.name === 'Menus') o.visible = false; });
  // Whatever skins the roster gave each behaviour (see ?skin=…).
  const bugs = sc.getObjectByName('Bugz')?.children ?? [];
  bugs.forEach((src, i) => {
    const o = src.clone(true);
    o.traverse((c) => { c.visible = true; });
    o.position.set(-0.3 + i * 0.2, 1.33, -0.12);
    o.rotation.set(0, 0.3 - i * 0.2, 0);
    o.scale.multiplyScalar(1.25);
    sc.add(o);
  });
  const srcBoss = sc.getObjectByName('BossArena')?.children.find((c) => c.userData.skinId);
  if (srcBoss) {
    const b = srcBoss.clone(true);
    b.traverse((c) => { c.visible = true; });
    b.position.set(0.05, 0.62, -1.9);
    b.rotation.set(0, -0.2, 0);
    b.scale.multiplyScalar(0.6);
    sc.add(b);
  }
  await M.waitFrames(5);
});
await page.screenshot({ path: out });
await browser.close();
console.log(out);
