// Runs model-written Three.js code inside a headless Chromium page that has no network,
// exports the result as GLB, re-loads that GLB, validates it and renders a preview.
// Model output is never evaluated in Node: it only ever runs inside the page.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ORIGIN = 'http://forge.local';
const THREE_BASE = `${ORIGIN}/__forge/three/`;
const CORE = `${THREE_BASE}build/three.module.js`;

function threeRoot(repo) {
  const dir = path.join(repo, 'node_modules', 'three');
  if (!existsSync(path.join(dir, 'build', 'three.module.js'))) {
    throw new Error(`three not found in ${dir} (run npm install)`);
  }
  return dir;
}

// Bare three specifiers inside served files point at one local copy, so there is one THREE instance.
function rewriteBare(js) {
  return js
    .replace(/from\s*(['"])three\1/g, `from '${CORE}'`)
    .replace(/from\s*(['"])three\/(webgpu|tsl)\1/g, (_m, _q, w) => `from '${THREE_BASE}build/three.${w}.js'`)
    .replace(/from\s*(['"])three\/(?:addons|examples\/jsm)\/([^'"]+)\1/g, (_m, _q, p) => `from '${THREE_BASE}examples/jsm/${p}'`);
}

// Records what a page asks GLTFExporter to export (the asset), unless the harness itself is exporting.
const EXPORTER_HOOK = `
;{
  const __forgeParse = GLTFExporter.prototype.parse;
  GLTFExporter.prototype.parse = function (input, onDone, onError, options) {
    if (!globalThis.__forgeHarness) (globalThis.__forgeCaptured ||= []).push(input);
    return __forgeParse.call(this, input, onDone, onError, options);
  };
}
`;

const IMPORT_MAP = `<script type="importmap">${JSON.stringify({
  imports: { three: CORE, 'three/addons/': `${THREE_BASE}examples/jsm/`, 'three/examples/jsm/': `${THREE_BASE}examples/jsm/` },
})}</script>`;

const HARNESS_HTML = `<!doctype html><html><head><meta charset="utf-8">${IMPORT_MAP}
<style>html,body{margin:0;background:#222}</style></head><body></body></html>`;

function injectImportMap(html) {
  if (/type\s*=\s*["']importmap["']/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${IMPORT_MAP}`);
  return `${IMPORT_MAP}${html}`;
}

/** Map a URL the page asks for onto a local file under node_modules/three, or null. */
function localThreeFile(url, tdir) {
  const u = new URL(url);
  let p = decodeURIComponent(u.pathname).replace(/\/\+esm$/, '');
  let rel = null;
  if (u.origin === ORIGIN && p.startsWith('/__forge/three/')) rel = p.slice('/__forge/three/'.length);
  else if (/\/examples\/jsm\/.+/.test(p)) rel = `examples/jsm/${p.split('/examples/jsm/')[1]}`;
  else if (/\/addons\/.+/.test(p) && /three/.test(u.href)) rel = `examples/jsm/${p.split('/addons/').pop()}`;
  else if (/three(\.module)?(\.min)?\.js$/.test(p) || /\/three(@[^/]*)?\/?$/.test(p) || /\/build\/three\.module(\.min)?\.js$/.test(p)) return 'CORE_SHIM';
  else if (/three\.(core|webgpu|tsl)(\.min)?\.js$/.test(p)) rel = `build/${path.basename(p).replace('.min.js', '.js')}`;
  if (!rel) return null;
  if (!/\.js$/.test(rel)) rel += '.js';
  const file = path.resolve(tdir, rel);
  if (!file.startsWith(path.resolve(tdir) + path.sep)) return null;
  if (!(rel.startsWith('build/') || rel.startsWith('examples/jsm/'))) return null;
  return existsSync(file) ? file : null;
}

const CORS = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

async function launch() {
  const { chromium } = require('playwright');
  const opts = {
    headless: true,
    // A dead proxy plus "no DNS" is a second wall behind page.route: nothing can leave.
    proxy: { server: 'http://127.0.0.1:9' },
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--no-sandbox'],
  };
  try {
    return await chromium.launch(opts);
  } catch (err) {
    const fallback = '/opt/pw-browsers/chromium';
    if (!existsSync(fallback)) throw err;
    return chromium.launch({ ...opts, executablePath: fallback });
  }
}

/**
 * Run one candidate.
 * @param {{repo: string, style: 'function'|'html', code: string, kind: 'bug'|'boss', id: string,
 *          normalize: boolean, maxTris: number, maxMaterials: number, timeoutMs: number}} job
 * @returns {Promise<{ok: boolean, error?: string, report?: object, glb?: Buffer, png?: Buffer, logs: string[], blocked: string[]}>}
 */
export async function runInSandbox(job) {
  const tdir = threeRoot(job.repo);
  const logs = [];
  const blocked = [];
  const browser = await launch();
  let timer;
  const work = (async () => {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, viewport: { width: 800, height: 600 } });
    if (context.routeWebSocket) await context.routeWebSocket(/.*/, (ws) => ws.close());
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      try {
        if (url === `${ORIGIN}/` || url === `${ORIGIN}/index.html`) {
          const body = job.style === 'html' ? injectImportMap(job.code) : HARNESS_HTML;
          return route.fulfill({ status: 200, contentType: 'text/html', body, headers: CORS });
        }
        if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        const local = localThreeFile(url, tdir);
        if (local === 'CORE_SHIM') {
          return route.fulfill({ status: 200, contentType: 'text/javascript', body: `export * from '${CORE}';\n`, headers: CORS });
        }
        if (local) {
          let body = rewriteBare(readFileSync(local, 'utf8'));
          if (local.endsWith(`${path.sep}GLTFExporter.js`)) body += EXPORTER_HOOK;
          return route.fulfill({ status: 200, contentType: 'text/javascript', body, headers: CORS });
        }
      } catch (err) {
        logs.push(`[route] ${url}: ${err.message}`);
      }
      if (!url.endsWith('/favicon.ico')) blocked.push(url);
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[console.${m.type()}] ${m.text()}`); });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });

    if (job.style === 'html') {
      await page.waitForTimeout(1500);
      // Press the model's own Export GLB button: whatever it hands to GLTFExporter is the asset.
      await page.evaluate(async () => {
        if (globalThis.__forgeCaptured?.length) return;
        const els = [...document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')];
        const hit = els.find((e) => /glb|export/i.test(e.textContent || e.value || '')) ?? els.find((e) => /download/i.test(e.textContent || ''));
        hit?.click();
        for (let i = 0; i < 40 && !globalThis.__forgeCaptured?.length; i++) await new Promise((r) => setTimeout(r, 100));
      });
    }

    const result = await page.evaluate(async (job) => {
      const THREE = await import(job.core);
      const { GLTFExporter } = await import(`${job.threeBase}examples/jsm/exporters/GLTFExporter.js`);
      const { GLTFLoader } = await import(`${job.threeBase}examples/jsm/loaders/GLTFLoader.js`);
      const warnings = [];

      // 1. Get the creature.
      let built = null;
      if (job.style === 'function') {
        let body = job.code
          .replace(/^\s*import\s[^;]*?from\s*['"][^'"]+['"];?\s*$/gm, '')
          .replace(/^\s*export\s+default\s+/gm, '')
          .replace(/^\s*export\s+(?=(function|const|let|class)\b)/gm, '');
        try {
          built = new Function('THREE', body)(THREE);
          if (!built?.isObject3D) {
            const name = /function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(body)?.[1] ?? /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.exec(body)?.[1];
            if (name) built = new Function('THREE', `${body}\n;return ${name}(THREE);`)(THREE);
          }
        } catch (err) {
          return { ok: false, error: `Code threw: ${err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ') : err}` };
        }
        if (!built?.isObject3D) return { ok: false, error: 'The function did not return a THREE.Group (missing `return root;`?).' };
      } else {
        const cap = globalThis.__forgeCaptured ?? [];
        built = cap[cap.length - 1] ?? null;
        if (Array.isArray(built)) {
          const g = new THREE.Group();
          built.filter((o) => o?.isObject3D).forEach((o) => g.add(o.clone(true)));
          built = g;
        }
        if (!built?.isObject3D) return { ok: false, error: 'No GLB export happened: the page needs an "Export GLB" button that calls GLTFExporter on the creature group.' };
      }

      // 2. Keep only the creature: drop lights, cameras, helpers and ground planes.
      let root;
      if (built.isScene) {
        root = new THREE.Group();
        for (const c of built.children) {
          if (c.isLight || c.isCamera || /Helper/.test(c.type) || c.isLine || c.isPoints) continue;
          if (c.isMesh && (/ground|floor|plane|terrain|backdrop|pedestal/i.test(c.name) || c.material?.isShadowMaterial)) continue;
          root.add(c.clone(true));
        }
        warnings.push('The page exported the whole scene; lights, helpers and ground were stripped.');
      } else {
        root = built.clone(true);
      }
      root.position.set(0, 0, 0);
      root.quaternion.identity();
      root.updateMatrixWorld(true);
      const strip = [];
      root.traverse((o) => { if (o !== root && (o.isLight || o.isCamera || /Helper/.test(o.type))) strip.push(o); });
      strip.forEach((o) => o.removeFromParent());
      if (strip.length) warnings.push(`Removed ${strip.length} light/camera/helper node(s) from the creature.`);

      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const bad = (v) => !Number.isFinite(v);
      if (box.isEmpty() || [size.x, size.y, size.z].some(bad)) return { ok: false, error: 'The creature has no visible geometry (empty or NaN bounding box).' };
      if (Math.min(size.x, size.y, size.z) < 1e-4) return { ok: false, error: `The bounding box is flat (${size.x.toFixed(4)} x ${size.y.toFixed(4)} x ${size.z.toFixed(4)}). Build a 3D creature.` };

      // 3. Origin: centre for bugs (they float and turn to face you), feet for the boss.
      const skin = new THREE.Group();
      skin.name = job.id;
      skin.add(root);
      if (job.normalize) {
        const c = box.getCenter(new THREE.Vector3());
        root.position.set(-c.x, job.kind === 'boss' ? -box.min.y : -c.y, -c.z);
      }
      skin.updateMatrixWorld(true);

      // 4. Export as GLB with a clean exporter run.
      globalThis.__forgeHarness = true;
      let glb;
      try {
        glb = await new GLTFExporter().parseAsync(skin, { binary: true, onlyVisible: true, maxTextureSize: 512 });
      } catch (err) {
        return { ok: false, error: `GLTFExporter failed: ${err?.message ?? err}` };
      }
      if (!(glb instanceof ArrayBuffer)) return { ok: false, error: 'GLTFExporter did not return binary GLB.' };

      // 5. Re-load the GLB exactly like the game does and measure what came back.
      let gltf;
      try {
        gltf = await new Promise((res, rej) => new GLTFLoader().parse(glb.slice(0), '', res, rej));
      } catch (err) {
        return { ok: false, error: `Exported GLB does not parse: ${err?.message ?? err}` };
      }
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      let tris = 0, meshes = 0;
      const mats = new Set();
      const names = [];
      model.traverse((o) => {
        if (o.name) names.push(o.name);
        if (!o.isMesh) return;
        meshes++;
        const g = o.geometry;
        const n = g.index ? g.index.count : g.attributes.position?.count ?? 0;
        tris += Math.floor(n / 3) * (o.isInstancedMesh ? o.count : 1);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.uuid));
      });
      const lbox = new THREE.Box3().setFromObject(model);
      const lsize = lbox.getSize(new THREE.Vector3());

      // 6. Find the named parts the game animates (names as GLTFLoader reports them).
      const topMost = (re) => {
        const out = [];
        model.traverse((o) => {
          if (!re.test(o.name)) return;
          for (let p = o.parent; p; p = p.parent) if (re.test(p.name)) return;
          out.push(o.name);
        });
        return out;
      };
      const pick = (exact, loose) => names.find((n) => exact.test(n)) ?? names.find((n) => loose.test(n)) ?? null;
      const nodes = {};
      const jaw = pick(/^jaw$/i, /^(jaw|mouth)/i);
      const spinner = pick(/^spinner$/i, /^(spinner|propeller|rotor|fan)/i);
      const screen = job.kind === 'boss' ? pick(/^screen$/i, /^screen/i) : null;
      const eyes = topMost(/^eye/i).slice(0, 8);
      const legs = topMost(/^(leg|foot|feet)/i).slice(0, 12);
      if (jaw) nodes.jaw = jaw;
      if (spinner) nodes.spinner = spinner;
      if (screen) nodes.screen = screen;
      if (legs.length) nodes.legs = legs;
      if (eyes.length) nodes.eyes = eyes;
      const eyesWithPupil = eyes.filter((n) => (model.getObjectByName(n)?.children.length ?? 0) >= 2).length;
      if (eyes.length && eyesWithPupil < eyes.length) warnings.push('Some eye nodes have no second child, so their pupils will not wobble.');
      if (job.kind === 'boss' && !screen) warnings.push('No "screen" node: the game will place the fact screen at a default spot.');

      const report = {
        triangles: tris, meshes, materials: mats.size,
        size: [lsize.x, lsize.y, lsize.z].map((v) => +v.toFixed(4)),
        nodes, warnings, glbBytes: glb.byteLength,
      };
      if (tris > job.maxTris) return { ok: false, report, error: `Too many triangles: ${tris} (limit ${job.maxTris}). Use fewer segments and fewer parts.` };
      if (meshes === 0) return { ok: false, report, error: 'The exported GLB has no meshes.' };
      if (mats.size > job.maxMaterials) warnings.push(`${mats.size} materials (aim for at most ${job.maxMaterials}).`);
      if (Math.max(lsize.x, lsize.z) > lsize.y * 4) warnings.push('The creature is very wide for its height; the game scales by height, so it may look huge.');

      // 7. Preview: front view (camera on +Z, where the player stands) and a three-quarter view.
      const W = 1024, H = 512;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(W, H, false);
      renderer.setScissorTest(true);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1c1830);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x443355, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(2, 4, 3);
      scene.add(sun);
      scene.add(model);
      const center = lbox.getCenter(new THREE.Vector3());
      const radius = Math.max(lsize.x, lsize.y, lsize.z) * 0.5;
      const cam = new THREE.PerspectiveCamera(35, 1, radius * 0.01, radius * 100);
      const dist = radius / Math.sin(THREE.MathUtils.degToRad(17.5)) * 1.1;
      const views = [new THREE.Vector3(0, 0.15, 1), new THREE.Vector3(0.8, 0.35, 0.6)];
      views.forEach((dir, i) => {
        renderer.setViewport(i * H, 0, H, H);
        renderer.setScissor(i * H, 0, H, H);
        cam.position.copy(center).addScaledVector(dir.normalize(), dist);
        cam.lookAt(center);
        renderer.render(scene, cam);
      });
      const png = canvas.toDataURL('image/png').split(',')[1];
      renderer.dispose();

      const bytes = new Uint8Array(glb);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { ok: true, report, glb: btoa(bin), png };
    }, { style: job.style, code: job.code, kind: job.kind, id: job.id, normalize: job.normalize, maxTris: job.maxTris, maxMaterials: job.maxMaterials, core: CORE, threeBase: THREE_BASE });
    return result;
  })();
  try {
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`Timed out after ${job.timeoutMs / 1000}s (infinite loop or a very slow build?).`)), job.timeoutMs); });
    const r = await Promise.race([work, timeout]);
    return {
      ok: r.ok, error: r.error, report: r.report, logs, blocked,
      glb: r.glb ? Buffer.from(r.glb, 'base64') : undefined,
      png: r.png ? Buffer.from(r.png, 'base64') : undefined,
    };
  } catch (err) {
    return { ok: false, error: err.message, logs, blocked };
  } finally {
    clearTimeout(timer);
    work.catch(() => {});
    await browser.close().catch(() => {});
  }
}
