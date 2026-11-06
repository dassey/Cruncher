/**
 * Characters = behaviour (archetype) + skin (looks). Gameplay only knows the
 * archetype; any registered skin can be worn by any archetype, so art can be
 * swapped in and out for testing without touching gameplay code.
 */
export type Archetype = 'drifter' | 'lunger' | 'scrambler' | 'sweeper' | 'boss';
export const ARCHETYPES: readonly Archetype[] = ['drifter', 'lunger', 'scrambler', 'sweeper', 'boss'];

/** What each behaviour does (shown on NEW BUG intro cards). */
export const ARCHETYPE_TELLS: Record<Archetype, string> = {
  drifter: 'DRIFTS IN YOUR WAY. PUNCH IT.',
  lunger: 'SHAKES, THEN LUNGES. PUNCH FIRST!',
  scrambler: 'SCRAMBLES NUMBERS. READ AGAIN.',
  sweeper: 'SWEEPS THE ROWS. BONK IT.',
  boss: 'PUNCH THE RIGHT ANSWER.',
};

/** Default cast. Change a skin id here (or via ?skin=…) to re-skin a behaviour. */
export const DEFAULT_ROSTER: Record<Archetype, string> = {
  drifter: 'wifido',
  lunger: 'sockodile',
  scrambler: 'blendingo',
  sweeper: 'duckuum',
  boss: 'calcullama',
};

/**
 * Parse overrides like "lunger:duckuum,boss:my-glb-llama". Unknown archetypes
 * and malformed pairs are ignored. Skin ids: lowercase letters, digits, - and _.
 */
export function parseSkinOverrides(text: string | null | undefined): Partial<Record<Archetype, string>> {
  const out: Partial<Record<Archetype, string>> = {};
  if (!text) return out;
  for (const pair of text.split(',')) {
    const [a, id] = pair.split(':').map((x) => x.trim().toLowerCase());
    if (!a || !id || !(ARCHETYPES as readonly string[]).includes(a) || !/^[a-z0-9_-]{1,40}$/.test(id)) continue;
    out[a as Archetype] = id;
  }
  return out;
}

/** Final roster: defaults, then overrides — but only for skins that actually exist. */
export function resolveRoster(overrides: Partial<Record<Archetype, string>>, available: (id: string) => boolean): Record<Archetype, string> {
  const r = { ...DEFAULT_ROSTER };
  for (const a of ARCHETYPES) {
    const id = overrides[a];
    if (id && available(id)) r[a] = id;
  }
  return r;
}
