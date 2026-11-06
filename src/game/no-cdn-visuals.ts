import { AssetManager, Group, Object3D, type World } from '@iwsdk/core';

/**
 * IWSDK's default controller/hand visuals download GLBs from a public CDN at
 * runtime. CRUNCHER makes zero network calls (kids' privacy), and draws its own
 * gloves, so: (1) short-circuit input-profile GLB loads to an empty local model,
 * (2) swap the visual implementation for one that renders nothing.
 */
const PROFILE_HINT = 'webxr-input-profiles';

class NullVisual {
  static assetKeyPrefix = 'cruncher-null';
  static assetProfileId = 'cruncher-null';
  static assetPath = 'cruncher-null://visual';
  model = new Group();
  init(): void {}
  connect(): void {}
  disconnect(): void {}
  toggle(): void {}
  update(): void {}
}

export function patchInputProfileLoader(): void {
  const am = AssetManager as unknown as { loadGLTF: (url: string, key?: string) => Promise<unknown> };
  const original = am.loadGLTF.bind(AssetManager);
  am.loadGLTF = (url: string, key?: string) => {
    if (typeof url === 'string' && (url.includes(PROFILE_HINT) || url.startsWith('cruncher-null://'))) {
      const scene = new Group();
      scene.add(new Object3D());
      return Promise.resolve({ scene, scenes: [scene], animations: [], cameras: [], asset: {}, parser: null, userData: {} });
    }
    return original(url, key);
  };
}

export function disableDefaultInputVisuals(world: World): void {
  const va = world.input.xr.visualAdapters as unknown as Record<string, Record<string, { updateVisualImplementation?: (c: unknown) => void }>>;
  for (const kind of ['controller', 'hand']) {
    for (const side of ['left', 'right']) {
      va[kind]?.[side]?.updateVisualImplementation?.(NullVisual);
    }
  }
}
