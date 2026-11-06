import { Quaternion, Vector3, type World } from '@iwsdk/core';
import type { XRDevice } from 'iwer';
import type { GameContext, Handedness, TargetKind } from '../game/context.js';
import { AudioSystem } from '../systems/audio-system.js';
import { UISystem } from '../systems/ui-system.js';
import { BossSystem } from '../systems/boss-system.js';
import { EnemySystem } from '../systems/enemy-system.js';
import { listSkins } from '../render/skins.js';
import type { Archetype } from '../logic/skins.js';

/**
 * Test bridge for the automated playtest (window.__CRUNCHER__). Lets Playwright
 * read game state and physically swing emulated controllers/hands through
 * targets — the same input path a player uses.
 */
export function exposeBotApi(world: World, ctx: GameContext): void {
  const device = (window as unknown as { __IWER__?: XRDevice }).__IWER__;
  const a = new Vector3();
  const b = new Vector3();
  const dir = new Vector3();
  const q = new Quaternion();
  const fwd = new Vector3(0, 0, -1);

  const waitFrames = async (n: number): Promise<void> => {
    const start = ctx.frameStats.frames;
    const t0 = performance.now();
    while (ctx.frameStats.frames - start < n && performance.now() - t0 < 5000) {
      await new Promise((r) => setTimeout(r, 4));
    }
  };

  const input = (side: Handedness) => {
    if (!device) return null;
    return device.primaryInputMode === 'hand' ? device.hands[side] : device.controllers[side];
  };

  const setHand = (side: Handedness, x: number, y: number, z: number) => {
    const d = input(side);
    if (!d) return;
    d.position.set(x, y, z);
  };

  const rest = (side: Handedness) => {
    const h = ctx.head;
    setHand(side, h.x + (side === 'left' ? -0.28 : 0.28), h.y - 0.55, h.z + 0.05);
  };

  // Event journal for diagnostics (damage sources, wrong-hit blocks).
  const journal: Array<{ t: number; ev: string; detail: string }> = [];
  const ev = ctx.session.events;
  ev.on('damage', (e) => journal.push({ t: ctx.realTime, ev: 'damage', detail: `${e.source}:${e.amount}` }));
  ev.on('hitWrong', (e) => journal.push({ t: ctx.realTime, ev: 'wrong', detail: e.block.label }));
  ev.on('roundStart', (e) => journal.push({ t: ctx.realTime, ev: 'round', detail: String(e.round) }));
  const api = {
    ctx,
    journal,
    world,
    device,
    waitFrames,
    state() {
      const s = ctx.session;
      return {
        screen: ctx.screen,
        phase: s.phase,
        round: s.round,
        hp: s.hp,
        maxHp: s.maxHp,
        score: s.score,
        combo: s.combo,
        isBoss: s.isBossRound,
        rule: s.rule?.title ?? null,
        remaining: s.remaining,
        immersive: ctx.immersive,
        timeLeft: s.timeLeft,
        perkOffer: s.perkOffer.slice(),
        boss: s.boss ? { hp: s.boss.hp, active: s.boss.active, a: s.boss.a, b: s.boss.b, correctIndex: s.boss.correctIndex } : null,
        stats: { ...s.stats },
        hands: { left: ctx.hands.left.tracked, right: ctx.hands.right.tracked },
        frame: { ...ctx.frameStats },
        render: { calls: world.renderer.info.render.calls, triangles: world.renderer.info.render.triangles, geometries: world.renderer.info.memory.geometries, textures: world.renderer.info.memory.textures },
        heap: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
        actions: world.getSystem(UISystem)?.visibleActions() ?? [],
        shards: ctx.progress.shards,
      };
    },
    targets(kind?: TargetKind) {
      return ctx.targets
        .filter((t) => t.enabled && (!kind || t.kind === kind))
        .map((t) => {
          const block = t.kind === 'block' ? ctx.session.blocks[t.id] : undefined;
          const boss = ctx.session.boss;
          return {
            kind: t.kind,
            id: t.id,
            pos: [t.pos.x, t.pos.y, t.pos.z],
            label: block?.label ?? (t.kind === 'orb' ? String(boss?.choices[t.id] ?? '') : ''),
            correct: block ? block.correct : t.kind === 'orb' ? boss?.correctIndex === t.id : false,
            fact: block?.fact ?? -1,
            threat: !!t.threat,
          };
        });
    },
    async enterXR() {
      world.launchXR();
      const t0 = performance.now();
      while (!ctx.immersive && performance.now() - t0 < 8000) await waitFrames(1);
      rest('left');
      rest('right');
      await waitFrames(3);
      return ctx.immersive;
    },
    /** Art testing: list skins / re-skin a behaviour live. */
    listSkins,
    roster: () => ({ ...ctx.roster }),
    setSkin(archetype: Archetype, skinId: string) {
      if (archetype === 'boss') world.getSystem(BossSystem)?.setSkin(skinId);
      else world.getSystem(EnemySystem)?.setSkin(archetype, skinId);
      return { ...ctx.roster };
    },
    freezePopups(on: boolean) {
      ctx.freezePopups = on;
    },
    setMode(mode: 'controller' | 'hand') {
      if (device) device.primaryInputMode = mode;
    },
    setHand,
    rest,
    /** Swing a hand through a world point at punch speed (~2.5 m/s). */
    async punchAt(side: Handedness, x: number, y: number, z: number, steps = 3, hold = false) {
      b.set(x, y, z);
      // Punch from the shoulder (≈20 cm below, 17 cm beside the eyes), like a person.
      a.set(ctx.head.x + (side === 'left' ? -0.17 : 0.17), ctx.head.y - 0.2, ctx.head.z);
      dir.subVectors(b, a).normalize();
      a.copy(b).addScaledVector(dir, -0.3);
      setHand(side, a.x, a.y, a.z);
      await waitFrames(3);
      // Aim with the knuckles (punch point), not the controller origin: measure the offset.
      const hp = ctx.hands[side].pos;
      const ox = hp.x - a.x;
      const oy = hp.y - a.y;
      const oz = hp.z - a.z;
      setHand(side, a.x - ox, a.y - oy, a.z - oz);
      await waitFrames(3);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = a.x + (b.x - a.x + dir.x * 0.05) * t - ox;
        const py = a.y + (b.y - a.y + dir.y * 0.05) * t - oy;
        const pz = a.z + (b.z - a.z + dir.z * 0.05) * t - oz;
        setHand(side, px, py, pz);
        await waitFrames(1);
      }
      await waitFrames(hold ? 1 : 2);
      if (hold) return; // leave the fist at impact (screenshots); caller calls rest()
      rest(side);
      await waitFrames(4);
    },
    /** Offline-render the music and report loudness + bass share (+ WAV as base64). */
    async audioCheck(seconds = 8, mode: 'menu' | 'game' | 'boss' = 'game') {
      const synth = world.getSystem(AudioSystem)?.synth;
      if (!synth) return null;
      const buf = await synth.renderPreview(seconds, mode);
      const x = buf.getChannelData(0);
      let peak = 0;
      let sum = 0;
      let low = 0;
      let lowSum = 0;
      const a = 1 - Math.exp((-2 * Math.PI * 150) / buf.sampleRate); // one-pole LP @150 Hz
      for (let i = 0; i < x.length; i++) {
        const v = x[i] as number;
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
        low += a * (v - low);
        lowSum += low * low;
      }
      const rms = Math.sqrt(sum / x.length);
      // 16-bit PCM WAV.
      const n = x.length;
      const bytes = new Uint8Array(44 + n * 2);
      const dv = new DataView(bytes.buffer);
      const w = (o: number, str: string) => { for (let i = 0; i < str.length; i++) bytes[o + i] = str.charCodeAt(i); };
      w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * 2, true);
      dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i] as number)) * 32767, true);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { peak, rmsDb: 20 * Math.log10(rms + 1e-9), bassShare: lowSum / (sum + 1e-12), wav: btoa(bin) };
    },
    /** Point the controller at a world point from chest height and pull the trigger. */
    async blastAt(side: Handedness, x: number, y: number, z: number) {
      const d = device?.controllers[side];
      if (!d) return;
      const h = ctx.head;
      a.set(h.x + (side === 'left' ? -0.18 : 0.18), h.y - 0.35, h.z - 0.15);
      dir.set(x, y, z).sub(a).normalize();
      q.setFromUnitVectors(fwd, dir);
      d.position.set(a.x, a.y, a.z);
      d.quaternion.set(q.x, q.y, q.z, q.w);
      await waitFrames(3);
      d.updateButtonValue('trigger', 1);
      await waitFrames(2);
      d.updateButtonValue('trigger', 0);
      await waitFrames(3);
      d.quaternion.set(0, 0, 0, 1);
      rest(side);
      await waitFrames(2);
    },
    setAim(mode: 'both' | 'punch' | 'blast') {
      ctx.progress.settings.aim = mode;
    },
    pressAction(action: string) {
      return world.getSystem(UISystem)?.pressAction(action) ?? false;
    },
  };
  (window as unknown as { __CRUNCHER__: typeof api }).__CRUNCHER__ = api;
  console.info('[cruncher] bot api ready');
}
