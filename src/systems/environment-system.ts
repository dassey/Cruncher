import { createSystem } from '@iwsdk/core';
import { game } from '../game/context.js';
import { buildEnvironment, type Environment } from '../render/environment.js';

/** ENVIRONMENT: the corrupted-server world. Pulses gently with the music beat. */
export class EnvironmentSystem extends createSystem({}) {
  private env!: Environment;

  init(): void {
    this.env = buildEnvironment();
    this.world.createTransformEntity(this.env.root, { persistent: true });
  }

  update(_delta: number, time: number): void {
    const beat = game().beat;
    this.env.sky.uniforms.uTime!.value = time;
    this.env.sky.uniforms.uPulse!.value = beat;
    this.env.floor.uniforms.uPulse!.value = beat * 0.6;
    this.env.towers.uniforms.uTime!.value = time;
  }
}
