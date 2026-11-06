// CRUNCHER automated playtest.
// Drives an emulated Quest 3 (IWER) in headless Chromium: punches real targets
// with emulated controllers/hands, plays full rounds incl. boss, dies on purpose,
// restarts, and asserts: no console errors, valid state transitions, no network.
//
// Usage: node qa/playtest.mjs [--url URL] [--runs N] [--rounds R] [--quick] [--shots DIR] [--minutes M]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const BASE = opt('url', 'https://localhost:4173/');
const RUNS = Number(opt('runs', '2'));
const ROUNDS = Number(opt('rounds', '10'));
const QUICK = flag('quick');
const SHOTS = opt('shots', 'qa/screens');
const MINUTES = Number(opt('minutes', '0'));
fs.mkdirSync(SHOTS, { recursive: true });

const VALID = {
  menu: ['intro'],
  intro: ['playing', 'menu'],
  playing: ['clear', 'gameover', 'menu'],
  clear: ['perk', 'gameover', 'menu'],
  perk: ['intro', 'menu'],
  gameover: ['intro', 'menu'],
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--headless=new', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

const summary = { runs: [], errors: [], external: [], transitionsBad: [], frame: null, screenshots: [], memory: [] };

async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  summary.screenshots.push(file);
  log('screenshot', file);
}

async function playRun(runIndex) {
  const seed = 1000 + runIndex;
  const handMode = runIndex % 2 === 1;
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) summary.external.push(r.url());
  });
  await page.goto(`${BASE}?bot&fresh&seed=${seed}`);
  await page.waitForFunction(() => window.__CRUNCHER__, null, { timeout: 30000 });
  await sleep(800);
  const first = runIndex === 0;
  if (first) await shot(page, '01-menu-desktop');
  const ok = await page.evaluate(() => window.__CRUNCHER__.enterXR());
  if (!ok) errors.push('could not enter XR');
  if (handMode) await page.evaluate(() => window.__CRUNCHER__.setMode('hand'));
  await page.evaluate(() => window.__CRUNCHER__.waitFrames(10));
  if (first) await shot(page, '02-menu-xr');

  const st = () => page.evaluate(() => window.__CRUNCHER__.state());
  const targets = (kind) => page.evaluate((k) => window.__CRUNCHER__.targets(k), kind);
  const blastRun = !handMode && runIndex % 4 === 2; // every 4th run (controllers): point & shoot
  const punch = (side, pos) => page.evaluate(([s, p, b]) => (b ? window.__CRUNCHER__.blastAt(s, p[0], p[1], p[2]) : window.__CRUNCHER__.punchAt(s, p[0], p[1], p[2])), [side, pos, blastRun]);

  // Punch PLAY like a player would.
  async function punchAction(action) {
    // Punch a menu button; if nothing changed (arm delay, miss), punch again like a person would.
    for (let tries = 0; tries < 30; tries++) {
      const s = await st();
      const idx = s.actions.indexOf(action);
      const btn = (await targets('button')).find((t) => t.id === idx);
      if (idx >= 0 && btn) {
        const before = `${s.screen}|${s.phase}|${s.actions.join(',')}`;
        await punch('right', btn.pos);
        await page.evaluate(() => window.__CRUNCHER__.waitFrames(8));
        const s2 = await st();
        if (`${s2.screen}|${s2.phase}|${s2.actions.join(',')}` !== before) return true;
        continue;
      }
      await page.evaluate(() => window.__CRUNCHER__.waitFrames(5));
    }
    return false;
  }

  const startedAt = Date.now();
  if (first) {
    // Tour the menus by punching their buttons (parent screen, shop, settings).
    for (const [action, name] of [['goto:stats', '09-stats'], ['goto:shop', '10-shop'], ['goto:settings', '11-settings']]) {
      if (!(await punchAction(action))) errors.push(`menu button ${action} not punchable`);
      await page.evaluate(() => window.__CRUNCHER__.waitFrames(30));
      const sNow = await st();
      if (sNow.screen !== action.split(':')[1]) errors.push(`expected screen ${action} got ${sNow.screen}`);
      await shot(page, name);
      if (!(await punchAction('goto:title'))) errors.push('BACK not punchable');
      await page.evaluate(() => window.__CRUNCHER__.waitFrames(30));
    }
  }
  if (!(await punchAction('play'))) errors.push('PLAY button not punchable');

  let lastPhase = 'menu';
  let side = 'right';
  const run = { seed, handMode, blast: false, rounds: 0, correct: 0, wrong: 0, bugs: 0, boss: false, died: false, phases: [] };
  // Profile: first run is a decent player (some misses); later runs die faster.
  const accuracy = QUICK ? 0.35 : runIndex === 0 ? 0.86 : 0.55;
  const rng = mulberry(seed);
  const shotsTaken = new Set();
  let guard = 0;
  const deadline = Date.now() + (MINUTES > 0 ? MINUTES * 60_000 : 20 * 60_000);

  let lastSample = 0;
  const memory = [];
  while (guard++ < 20000 && Date.now() < deadline) {
    const s = await st();
    if (Date.now() - lastSample > 30_000) {
      lastSample = Date.now();
      memory.push({ t: Math.round((Date.now() - startedAt) / 1000), heapMB: +(s.heap / 1e6).toFixed(1), geos: s.render.geometries, tex: s.render.textures, calls: s.render.calls });
    }
    if (s.phase !== lastPhase) {
      run.phases.push(s.phase);
      if (!(VALID[lastPhase] ?? []).includes(s.phase)) summary.transitionsBad.push(`${lastPhase}→${s.phase} (run ${runIndex})`);
      log(`run${runIndex} r${s.round + 1} ${lastPhase} → ${s.phase} hp=${s.hp} score=${s.score} calls=${s.render.calls}`);
      lastPhase = s.phase;
      if (s.phase === 'playing' && !shotsTaken.has('gameplay') && first && !s.isBoss) {
        await page.evaluate(() => window.__CRUNCHER__.waitFrames(30));
        await shot(page, '03-gameplay');
        shotsTaken.add('gameplay');
      }
      if (s.phase === 'playing' && first && s.round === 1 && !shotsTaken.has('pause')) {
        shotsTaken.add('pause');
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.__CRUNCHER__.waitFrames(10));
        const p1 = await st();
        if (!p1.actions.includes('resume')) errors.push('pause menu did not open');
        await shot(page, '12-pause');
        const t0 = p1.timeLeft;
        await page.evaluate(() => window.__CRUNCHER__.waitFrames(15));
        if ((await st()).timeLeft !== t0) errors.push('timer ran while paused');
        if (!(await punchAction('resume'))) errors.push('RESUME not punchable');
      }
      if (s.phase === 'perk' && first && !shotsTaken.has('perk')) {
        await page.evaluate(() => window.__CRUNCHER__.waitFrames(8));
        await shot(page, '07-perk');
        shotsTaken.add('perk');
      }
      if (s.phase === 'gameover') {
        await page.evaluate(() => window.__CRUNCHER__.waitFrames(20));
        if (!shotsTaken.has('gameover') && (first || runIndex === 1)) await shot(page, `08-gameover-run${runIndex}`);
        run.died = true;
        const j = await page.evaluate(() => window.__CRUNCHER__.journal.filter((e) => e.ev === 'damage').map((e) => e.detail));
        run.damageBy = j.reduce((acc, d) => { const [src, amt] = d.split(':'); acc[src] = (acc[src] ?? 0) + Number(amt); return acc; }, {});
        // Endurance mode: keep restarting until the clock runs out.
        if (MINUTES > 0 && Date.now() < deadline) {
          await punchAction('play');
          lastPhase = 'gameover';
          continue;
        }
        break;
      }
    }
    if (s.phase === 'perk') {
      run.rounds++;
      if (!QUICK && run.rounds >= ROUNDS && MINUTES === 0) break;
      const perk = s.actions[0];
      if (perk) await punchAction(perk);
      continue;
    }
    if (s.phase !== 'playing') {
      await page.evaluate(() => window.__CRUNCHER__.waitFrames(6));
      continue;
    }
    side = side === 'right' ? 'left' : 'right';
    if (s.isBoss) {
      run.boss = true;
      const orbs = await targets('orb');
      if (orbs.length === 0) {
        await page.evaluate(() => window.__CRUNCHER__.waitFrames(6));
        continue;
      }
      if (first && !shotsTaken.has('boss')) {
        await shot(page, '06-boss');
        shotsTaken.add('boss');
      }
      const right = orbs.find((o) => o.correct);
      const wrong = orbs.find((o) => !o.correct);
      const pick = rng() < accuracy || !wrong ? right : wrong;
      if (pick) {
        await punch(side, pick.pos);
        if (pick.correct) run.correct++;
        else run.wrong++;
      }
      continue;
    }
    // Occasionally swat a bug if one is close.
    const bugs = await targets('bug');
    const threat = bugs.find((b) => b.threat);
    // A kid swats whatever is lunging at their face; otherwise sometimes swats idle bugs.
    if ((threat && rng() < 0.8) || (bugs.length && rng() < 0.12)) {
      await punch(side, (threat ?? bugs[0]).pos);
      run.bugs++;
      continue;
    }
    const blocks = await targets('block');
    if (blocks.length === 0) {
      await page.evaluate(() => window.__CRUNCHER__.waitFrames(4));
      continue;
    }
    const good = blocks.filter((b) => b.correct);
    const bad = blocks.filter((b) => !b.correct);
    const wantRight = rng() < accuracy || bad.length === 0;
    const pick = wantRight ? good[Math.floor(rng() * good.length)] : bad[Math.floor(rng() * bad.length)];
    if (!pick) continue;
    const holdShot = first && pick.correct && !shotsTaken.has('hit') && s.combo >= 3;
    const missShot = first && !pick.correct && !shotsTaken.has('miss');
    if (holdShot || missShot) await page.evaluate(() => window.__CRUNCHER__.freezePopups(true));
    if (holdShot) {
      await page.evaluate(([sd, p]) => window.__CRUNCHER__.punchAt(sd, p[0], p[1], p[2], 3, true), [side, pick.pos]);
      await shot(page, '04-hit');
      shotsTaken.add('hit');
      await page.evaluate((sd) => window.__CRUNCHER__.rest(sd), side);
    } else {
      await punch(side, pick.pos);
    }
    if (pick.correct) run.correct++;
    else run.wrong++;
    if (missShot) {
      await shot(page, '05-miss');
      shotsTaken.add('miss');
    }
    if (holdShot || missShot) await page.evaluate(() => window.__CRUNCHER__.freezePopups(false));
  }
  // Restart check: punch RUN IT BACK (or press it) and confirm a fresh round begins.
  if (run.died) {
    const again = await punchAction('play');
    await page.evaluate(() => window.__CRUNCHER__.waitFrames(10));
    const s2 = await st();
    run.restartOk = again && (s2.phase === 'intro' || s2.phase === 'playing') && s2.hp === s2.maxHp && s2.round === 0;
    if (!run.restartOk) errors.push(`restart failed: ${JSON.stringify({ phase: s2.phase, hp: s2.hp, round: s2.round })}`);
  }
  const final = await st();
  run.frame = final.frame;
  run.render = final.render;
  run.heap = final.heap;
  run.seconds = Math.round((Date.now() - startedAt) / 1000);
  run.errors = errors;
  run.memory = memory;
  run.blast = blastRun;
  summary.runs.push(run);
  summary.errors.push(...errors.map((e) => `run${runIndex}: ${e}`));
  log(`run${runIndex} done`, JSON.stringify({ rounds: run.rounds, correct: run.correct, wrong: run.wrong, boss: run.boss, died: run.died, restartOk: run.restartOk, errors: errors.length, avgMs: (run.frame.sumMs / Math.max(1, run.frame.frames)).toFixed(1), calls: run.render.calls }));
  await page.close();
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (let i = 0; i < RUNS; i++) await playRun(i);
await browser.close();

const totalRounds = summary.runs.reduce((a, r) => a + r.rounds, 0);
const result = {
  runs: summary.runs.length,
  totalRounds,
  bossSeen: summary.runs.some((r) => r.boss),
  deaths: summary.runs.filter((r) => r.died).length,
  correct: summary.runs.reduce((a, r) => a + r.correct, 0),
  wrong: summary.runs.reduce((a, r) => a + r.wrong, 0),
  errors: summary.errors,
  external: [...new Set(summary.external)],
  badTransitions: summary.transitionsBad,
  perRun: summary.runs.map((r) => ({ seed: r.seed, hand: r.handMode, blast: r.blast, rounds: r.rounds, died: r.died, restartOk: r.restartOk, avgMs: +(r.frame.sumMs / Math.max(1, r.frame.frames)).toFixed(1), jsAvgMs: +(r.frame.jsSumMs / Math.max(1, r.frame.frames)).toFixed(2), jsWorstMs: +(r.frame.jsWorstMs ?? 0).toFixed(2), worstMs: +r.frame.worstMs.toFixed(1), calls: r.render.calls, tris: r.render.triangles, geos: r.render.geometries, tex: r.render.textures, heapMB: +(r.heap / 1e6).toFixed(1), seconds: r.seconds, damageBy: r.damageBy, memory: r.memory })),
  screenshots: summary.screenshots,
};
fs.mkdirSync('qa', { recursive: true });
fs.writeFileSync('qa/last-playtest.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
const pass = result.errors.length === 0 && result.external.length === 0 && result.badTransitions.length === 0;
console.log(pass ? 'PLAYTEST PASS' : 'PLAYTEST FAIL');
process.exit(pass ? 0 : 1);
