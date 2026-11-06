import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GameContext, setGame } from './game/context.js';
import { disableDefaultInputVisuals, patchInputProfileLoader } from './game/no-cdn-visuals.js';
import { BrowserKV, MemoryKV } from './logic/storage.js';
import { parseSkinOverrides, resolveRoster } from './logic/skins.js';
import { hasSkin, loadGlbSkins, registerBuiltinSkins } from './render/skins.js';
import { loadFonts } from './render/text.js';
import { AudioSystem } from './systems/audio-system.js';
import { BossSystem } from './systems/boss-system.js';
import { EnemySystem } from './systems/enemy-system.js';
import { EnvironmentSystem } from './systems/environment-system.js';
import { FXSystem } from './systems/fx-system.js';
import { GridSystem } from './systems/grid-system.js';
import { InputSystem } from './systems/input-system.js';
import { LearningSystem } from './systems/learning-system.js';
import { PerfSystem } from './systems/perf-system.js';
import { ProgressionSystem } from './systems/progression-system.js';
import { RuleSystem } from './systems/rule-system.js';
import { ScoringSystem } from './systems/scoring-system.js';
import { UISystem } from './systems/ui-system.js';

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const emulate = params.has('emu') || params.has('bot');
  if (emulate) {
    const { installEmulator } = await import('./bot/emu.js');
    installEmulator();
  }
  patchInputProfileLoader();
  await loadFonts();

  const seedParam = params.get('seed');
  const seed = seedParam ? Number(seedParam) >>> 0 : (Date.now() >>> 0);
  // ?fresh = throwaway in-memory save (used by the bot so runs start clean).
  const kv = params.has('fresh') ? new MemoryKV() : new BrowserKV();
  const ctx = new GameContext(kv, seed);
  if (params.has('unlockall')) ctx.learning.unlockAll();
  setGame(ctx);



  const container = document.getElementById('scene-container') as HTMLDivElement;
  const world = await World.create(container, projectOptions);
  disableDefaultInputVisuals(world);

  // Skins: built-ins, then any GLBs in public/skins/skins.json (needs the world's
  // asset manager), then ?skin=lunger:duckuum,boss:… overrides.
  registerBuiltinSkins();
  await loadGlbSkins();
  ctx.roster = resolveRoster(parseSkinOverrides(params.get('skin')), hasSkin);

  // Order matters: input → flow → world objects → feedback → persistence.
  world.registerSystem(InputSystem, { priority: 0 });
  world.registerSystem(ProgressionSystem, { priority: 1 });
  world.registerSystem(RuleSystem, { priority: 2 });
  world.registerSystem(GridSystem, { priority: 3 });
  world.registerSystem(EnemySystem, { priority: 4 });
  world.registerSystem(BossSystem, { priority: 5 });
  world.registerSystem(ScoringSystem, { priority: 6 });
  world.registerSystem(FXSystem, { priority: 7 });
  world.registerSystem(UISystem, { priority: 8 });
  world.registerSystem(AudioSystem, { priority: 9 });
  world.registerSystem(LearningSystem, { priority: 10 });
  world.registerSystem(EnvironmentSystem, { priority: 11 });
  world.registerSystem(PerfSystem, { priority: 12 });

  setupDesktopOverlay(world, emulate);
  // Prewarm every shader once so the first Bug/boss/popup never hitches (compile skips hidden objects).
  requestAnimationFrame(() => prewarmShaders(world));

  // Offline support for installed (PWA) play; never in dev, emulator or bot runs.
  if (import.meta.env.PROD && !emulate && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }

  if (emulate) {
    const { exposeBotApi } = await import('./bot/api.js');
    exposeBotApi(world, ctx);
  }
}

function prewarmShaders(world: World): void {
  const hidden: Array<{ visible: boolean }> = [];
  world.scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  try {
    world.renderer.compile(world.scene, world.camera);
  } catch (err) {
    console.warn('[cruncher] shader prewarm skipped', err);
  }
  for (const o of hidden) o.visible = false;
}

/** Minimal 2D overlay: Enter VR button + desktop hints. */
function setupDesktopOverlay(world: World, emulated: boolean): void {
  const bar = document.createElement('div');
  bar.id = 'cruncher-overlay';
  bar.style.cssText =
    'position:fixed;left:0;right:0;bottom:16px;display:flex;justify-content:center;gap:12px;align-items:center;font:600 14px system-ui,sans-serif;color:#e8d8ff;pointer-events:none;z-index:10;text-shadow:0 0 6px #000';
  const btn = document.createElement('button');
  btn.textContent = 'ENTER VR';
  btn.style.cssText =
    'pointer-events:auto;padding:12px 22px;border-radius:12px;border:2px solid #ff2bd6;background:#14052a;color:#fff;font:800 16px system-ui,sans-serif;letter-spacing:2px;box-shadow:0 0 18px #ff2bd6;cursor:pointer;display:none';
  btn.addEventListener('click', () => world.launchXR());
  const hint = document.createElement('span');
  hint.textContent = emulated ? 'EMULATOR: click ENTER VR, move controllers with the IWER panel' : 'DESKTOP: click blocks to punch · Space = slow-mo · ` = debug';
  bar.append(btn, hint);
  document.body.appendChild(bar);
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  void xr?.isSessionSupported?.('immersive-vr').then((ok) => {
    if (ok) btn.style.display = 'inline-block';
  });
  world.visibilityState.subscribe((v) => {
    bar.style.display = v === 'non-immersive' ? 'flex' : 'none';
  });
}

void main().catch((err) => {
  console.error('[cruncher] failed to start', err);
});
