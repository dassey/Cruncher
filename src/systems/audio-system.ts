import { createSystem } from '@iwsdk/core';
import { comboTier } from '../logic/scoring.js';
import { game } from '../game/context.js';
import { Synth } from '../render/synth.js';

/**
 * AUDIO: owns the WebAudio synth. Unlocks on the first gesture or XR session,
 * picks the music mode from screen/phase, raises intensity with combo, and
 * plays SFX for every gameplay event.
 */
export class AudioSystem extends createSystem({}) {
  readonly synth = new Synth();

  init(): void {
    const ctx = game();
    const synth = this.synth;
    synth.onBeat = (v) => {
      ctx.beat = Math.max(ctx.beat, v);
    };
    const unlock = () => synth.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.cleanupFuncs.push(
      () => window.removeEventListener('pointerdown', unlock),
      () => window.removeEventListener('keydown', unlock),
      this.visibilityState.subscribe(() => unlock()),
    );
    ctx.actions.sfx = (name) => {
      if (name === 'pop') synth.sfxPop();
      if (name === 'zap') synth.sfxZap();
    };
    const ev = ctx.session.events;
    this.cleanupFuncs.push(
      ev.on('hitCorrect', (e) => {
        synth.sfxHit(e.combo);
        if (e.sixSeven) synth.sfxSixSeven();
        if (e.block.golden) synth.sfxHeal();
      }),
      ev.on('hitWrong', () => synth.sfxWrong()),
      ev.on('comboTier', (e) => synth.sfxCombo(e.tier)),
      ev.on('damage', (e) => {
        if (e.source !== 'wrong') synth.sfxDamage();
      }),
      ev.on('bugPunched', () => synth.sfxBugPunch()),
      ev.on('roundClear', () => synth.sfxClear()),
      ev.on('bossVolley', () => synth.sfxBossShout()),
      ev.on('bossHit', () => synth.sfxHit(8)),
      ev.on('bossWrong', () => synth.sfxWrong()),
      ev.on('slowmo', (e) => synth.sfxSlowmo(e.active)),
      ev.on('heal', () => synth.sfxHeal()),
      ev.on('perkTaken', () => synth.sfxButton()),
      ev.on('gameOver', () => synth.sfxGameOver()),
      ctx.ui.on('button', () => synth.sfxButton()),
    );
  }

  update(delta: number): void {
    const ctx = game();
    const s = ctx.session;
    const synth = this.synth;
    const st = ctx.settings;
    if (synth.volume !== st.volume || synth.music !== st.music) {
      synth.volume = st.volume;
      synth.music = st.music;
      synth.applyVolumes();
    }
    if (ctx.screen !== 'game') synth.setMode('menu');
    else synth.setMode(s.isBossRound ? 'boss' : 'game');
    const target = ctx.screen === 'game' ? Math.min(1, comboTier(s.combo) / 4) : 0;
    synth.intensity += (target - synth.intensity) * Math.min(1, delta * 2);
    ctx.beat = Math.max(0, ctx.beat - delta * 3);
  }
}
