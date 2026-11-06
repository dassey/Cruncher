// Prompt text for the skin forge. Kept apart from forge.mjs so it is easy to tune.
// The contract mirrors docs/SKINS.md and src/render/skins.ts.

export const MAX_TRIS = 3000;
export const MAX_MATERIALS = 8;

function contract(kind) {
  const size = kind === 'boss'
    ? 'about 1.75 units tall (it is a boss that stands on the floor)'
    : 'about 0.2 units tall (it is a small bug that floats in the air)';
  const lines = [
    `- Build ONE creature, ${size}. The game rescales it, so exact size does not matter.`,
    '- Put everything under a single root THREE.Group. Y is up. The creature FACES +Z (its face and eyes point toward +Z).',
    kind === 'boss'
      ? '- Origin at the feet: the lowest point sits at y = 0, centred on x and z.'
      : '- Origin at the centre of the body.',
    `- Low poly: at most ${MAX_TRIS} triangles in total. Use low segment counts (spheres 12x8, cylinders 10-12 sides).`,
    `- At most ${MAX_MATERIALS} materials. Reuse materials between parts. Use MeshStandardMaterial or MeshLambertMaterial with flat colours.`,
    '- Style: bright, saturated toy look, chunky readable silhouette, and BIG googly eyes (white sphere with a black pupil sphere in front).',
    '- No textures from files or URLs, no fonts, no network. A CanvasTexture drawn in code is allowed but not needed.',
    '- No lights, cameras, ground planes or helpers inside the creature group.',
    '- Name the parts the game animates (each is optional, use exact names):',
    '  - "jaw": a Group/Mesh for the lower jaw or mouth, pivot at the hinge. The game rotates it on x (bugs) or moves it down (boss).',
    '  - "spinner": a part that spins around its local Y axis (propeller, antenna ring, head top).',
    '  - "eyeL" and "eyeR": each a Group whose children are [0] the white eyeball and [1] the pupil.',
    '  - "legL", "legR" (or "leg1".."leg6"): leg Groups with the pivot at the hip; the game swings them on x.',
  ];
  if (kind === 'boss') {
    lines.push('  - "screen": an empty Group on the front of the chest, facing +Z, where the game mounts a 0.6 x 0.4 fact screen. Keep that area flat and clear.');
  }
  return lines.join('\n');
}

/** System prompt for the "function" style: the model returns a function body. */
export function functionSystemPrompt(kind) {
  return [
    'You write Three.js code that builds a 3D game creature.',
    'Reply with exactly one ```js code block containing the BODY of a function.',
    'The body receives one argument, THREE (the three.js module), builds the creature and ends with `return root;` where root is a THREE.Group.',
    'Do not write import or export statements, do not create a renderer, scene, camera, lights, DOM elements or animation loop.',
    'Use only THREE.*. Do not reuse a variable name twice in the same scope.',
    '',
    'Creature rules:',
    contract(kind),
  ].join('\n');
}

/** System prompt for the "html" style, which is what the GLB 3D Coder model was trained on. */
export function htmlSystemPrompt(kind) {
  return [
    'Create game assets for a WebXR game, which uses GLB files.',
    'Create whatever the user requests as a good-quality low-poly asset using only Three.js in one complete standalone HTML file.',
    'The HTML must show the asset and include an Export GLB button that downloads a working GLB.',
    'The Export GLB button must export ONLY the creature root group (not the scene), using GLTFExporter with { binary: true }.',
    'Make it static (no animation clips): the game animates the named parts itself.',
    '',
    'Creature rules:',
    contract(kind),
  ].join('\n');
}

export function userPrompt(prompt, name, kind) {
  const who = kind === 'boss' ? 'a boss creature' : 'a small bug creature';
  return `Make ${who} called "${name}" for a kids' math arcade game: ${prompt}`;
}

export function retryPrompt(style, error) {
  const what = style === 'html'
    ? 'Reply with the complete corrected HTML file.'
    : 'Reply with the complete corrected function body in one ```js block.';
  return `That attempt failed in the test harness:\n${error}\n\nFix the problem and keep to every creature rule. ${what}`;
}
