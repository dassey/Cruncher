import { AssetManager, Box3, Group, Object3D, Vector3 } from '@iwsdk/core';
import { BUG_NAMES, buildBoss, buildCreature, type BugType } from './creatures.js';

/**
 * Skin registry. A skin turns into a CreatureRig: a parentless root plus the
 * optional named parts the behaviours animate. Gameplay never looks inside.
 *
 * GLB skins: drop files in public/skins/ and list them in public/skins/skins.json:
 *   [{ "id": "my-llama", "name": "MY LLAMA", "file": "my-llama.glb",
 *      "nodes": { "jaw": "jaw", "spinner": "head", "screen": "screen", "legs": ["legL","legR"], "eyes": [] } }]
 * Node names are optional; missing parts simply don't animate.
 */
export interface CreatureRig {
  root: Group;
  jaw: Object3D | null;
  spinner: Object3D | null;
  eyes: Object3D[];
  legs: Object3D[];
  /** Where the boss fact screen is attached (boss slot only). */
  screenAnchor: Object3D | null;
  /** Model height in its own units; systems scale every skin to the slot's size. */
  height: number;
}

export interface SkinDef {
  id: string;
  name: string;
  source: 'procedural' | 'glb';
  build(): CreatureRig;
}

const registry = new Map<string, SkinDef>();

export function registerSkin(def: SkinDef): void {
  registry.set(def.id, def);
}

export function hasSkin(id: string): boolean {
  return registry.has(id);
}

export function listSkins(): Array<{ id: string; name: string; source: string }> {
  return [...registry.values()].map((d) => ({ id: d.id, name: d.name, source: d.source }));
}

export function skinName(id: string): string {
  return registry.get(id)?.name ?? id.toUpperCase();
}

const box = new Box3();
const size = new Vector3();
function measure(root: Object3D): number {
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  box.getSize(size);
  return Math.max(0.01, size.y);
}

/** Build a fresh rig for a skin (falls back to `fallback` if the id is unknown). */
export function buildSkin(id: string, fallback: string): CreatureRig {
  const def = registry.get(id) ?? registry.get(fallback);
  if (!def) throw new Error(`no skin ${id} / ${fallback}`);
  const rig = def.build();
  rig.root.userData.skinId = def.id;
  return rig;
}

export function registerBuiltinSkins(): void {
  for (const type of Object.keys(BUG_NAMES) as BugType[]) {
    registerSkin({
      id: type,
      name: BUG_NAMES[type],
      source: 'procedural',
      build: () => {
        const c = buildCreature(type);
        return { root: c.root, jaw: c.jaw, spinner: c.spinner, eyes: c.eyes, legs: c.legs, screenAnchor: null, height: measure(c.root) };
      },
    });
  }
  registerSkin({
    id: 'calcullama',
    name: 'CALCU-LLAMA',
    source: 'procedural',
    build: () => {
      const b = buildBoss();
      return { root: b.root, jaw: b.jaw, spinner: b.spinner, eyes: b.eyes, legs: b.legs, screenAnchor: b.screenAnchor, height: measure(b.root) };
    },
  });
}

interface ManifestEntry {
  id: string;
  name?: string;
  file: string;
  outline?: number;
  nodes?: { jaw?: string; spinner?: string; screen?: string; legs?: string[]; eyes?: string[] };
}

/** Load GLB skins listed in public/skins/skins.json (same-origin only; never a CDN). */
export async function loadGlbSkins(): Promise<string[]> {
  const base = import.meta.env.BASE_URL;
  let entries: ManifestEntry[] = [];
  try {
    const res = await fetch(`${base}skins/skins.json`, { cache: 'no-cache' });
    if (!res.ok) return [];
    entries = (await res.json()) as ManifestEntry[];
  } catch {
    return [];
  }
  const loaded: string[] = [];
  for (const e of entries) {
    if (!e || typeof e.id !== 'string' || typeof e.file !== 'string' || /[/\\:]/.test(e.file)) continue;
    try {
      const gltf = await AssetManager.loadGLTF(`${base}skins/${e.file}`);
      const proto = gltf.scene;
      registerSkin({
        id: e.id,
        name: (e.name ?? e.id).toUpperCase(),
        source: 'glb',
        build: () => {
          const root = new Group();
          root.name = `Skin_${e.id}`;
          const model = proto.clone(true);
          root.add(model);
          const find = (n?: string) => (n ? (model.getObjectByName(n) ?? null) : null);
          return {
            root,
            jaw: find(e.nodes?.jaw),
            spinner: find(e.nodes?.spinner),
            eyes: (e.nodes?.eyes ?? []).map(find).filter((x): x is Object3D => !!x),
            legs: (e.nodes?.legs ?? []).map(find).filter((x): x is Object3D => !!x),
            screenAnchor: find(e.nodes?.screen),
            height: measure(model),
          };
        },
      });
      loaded.push(e.id);
    } catch (err) {
      console.warn('[cruncher] skin failed to load', e.id, err);
    }
  }
  return loaded;
}
