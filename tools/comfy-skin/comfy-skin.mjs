#!/usr/bin/env node
// ComfyUI (image -> 3D) -> game-ready CRUNCHER skin.
//
//   node tools/comfy-skin/comfy-skin.mjs --workflow my-img2glb.api.json --image concept.png \
//        --id toaster-spider --name "TOASTER SPIDER" [--host http://127.0.0.1:1117]
//
// 1. uploads the concept image and patches every LoadImage node in the workflow
//    (export it from ComfyUI with "Save (API)"),
// 2. queues it, waits, downloads the produced GLB,
// 3. makes it game-ready: weld, simplify to --tris, textures to --tex px, origin at
//    the feet, optional --yaw so it faces +Z, no Draco/KTX2 (the game never loads decoders),
// 4. writes public/skins/<id>.glb and upserts public/skins/skins.json.
//
// Skip ComfyUI entirely with --glb some.glb (post-process an existing model).
// Everything talks to localhost only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { center, dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

// ------------------------------------------------------------------ args
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const flag = (k) => argv.includes(`--${k}`);
const opts = {
  host: arg('host', process.env.COMFY_HOST ?? 'http://127.0.0.1:1117'),
  workflow: arg('workflow'),
  image: arg('image'),
  glb: arg('glb'),
  id: arg('id'),
  name: arg('name'),
  tris: Number(arg('tris', '3000')),
  tex: Number(arg('tex', '512')),
  yaw: Number(arg('yaw', '0')),
  timeout: Number(arg('timeout', '1800')),
  out: arg('out', path.join(REPO, 'public', 'skins')),
  sets: argv.flatMap((a, i) => (a === '--set' ? [argv[i + 1]] : [])),
  keepRaw: flag('keep-raw'),
};

function usage(msg) {
  if (msg) console.error(`error: ${msg}\n`);
  console.error(`usage:
  comfy-skin --workflow wf.api.json --image concept.png --id my-bug [--name "MY BUG"]
  comfy-skin --glb existing.glb --id my-bug            (no ComfyUI, just make it game-ready)
options: --host URL (default http://127.0.0.1:1117)  --tris 3000  --tex 512  --yaw DEG
         --set NODE_ID.input=value  (repeatable; e.g. --set 12.seed=42)  --keep-raw  --timeout SEC`);
  process.exit(msg ? 1 : 0);
}
if (flag('help') || flag('h')) usage();
if (!opts.id || !/^[a-z0-9_-]{1,40}$/.test(opts.id)) usage('--id is required: lowercase letters, digits, - or _');
if (!opts.glb && (!opts.workflow || !opts.image)) usage('give --workflow and --image, or --glb');

const log = (...a) => console.log('[comfy-skin]', ...a);

// ------------------------------------------------------------------ ComfyUI
async function http(method, url, body, headers = {}) {
  const res = await fetch(url, { method, body, headers });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${await res.text().catch(() => '')}`);
  return res;
}

async function uploadImage(file) {
  const form = new FormData();
  form.append('image', new Blob([fs.readFileSync(file)]), path.basename(file));
  form.append('overwrite', 'true');
  const res = await http('POST', `${opts.host}/upload/image`, form);
  const j = await res.json();
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

function patchWorkflow(wf, imageName) {
  if (wf.nodes && !Object.values(wf).some((n) => n && n.class_type)) {
    throw new Error('this is a UI workflow; in ComfyUI use Workflow -> Export (API) / "Save (API)"');
  }
  let images = 0;
  for (const node of Object.values(wf)) {
    if (node?.class_type && /LoadImage/i.test(node.class_type) && node.inputs && 'image' in node.inputs) {
      node.inputs.image = imageName;
      images++;
    }
  }
  for (const s of opts.sets) {
    const m = /^([^.]+)\.([^=]+)=(.*)$/.exec(s ?? '');
    if (!m || !wf[m[1]]) throw new Error(`bad --set ${s}`);
    const v = m[3];
    wf[m[1]].inputs[m[2]] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }
  if (images === 0) log('warning: no LoadImage node found; the workflow will run with its own image');
  return wf;
}

/** Find every {filename, subfolder, type} in a history entry that looks like a mesh. */
function findMeshes(obj, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (typeof obj.filename === 'string' && /\.(glb|gltf)$/i.test(obj.filename)) out.push(obj);
  for (const v of Object.values(obj)) if (v && typeof v === 'object') findMeshes(v, out);
  return out;
}

async function runComfy() {
  log(`ComfyUI at ${opts.host}`);
  await http('GET', `${opts.host}/system_stats`).catch((e) => {
    throw new Error(`can't reach ComfyUI (${e.message}). Is it running? (in WSL: comfy)`);
  });
  const wf = patchWorkflow(JSON.parse(fs.readFileSync(opts.workflow, 'utf8')), await uploadImage(opts.image));
  const client_id = `comfy-skin-${Date.now()}`;
  const { prompt_id } = await (await http('POST', `${opts.host}/prompt`, JSON.stringify({ prompt: wf, client_id }), { 'Content-Type': 'application/json' })).json();
  log(`queued ${prompt_id}; waiting (up to ${opts.timeout}s)…`);
  const t0 = Date.now();
  for (;;) {
    if ((Date.now() - t0) / 1000 > opts.timeout) throw new Error('timed out waiting for ComfyUI');
    const hist = await (await http('GET', `${opts.host}/history/${prompt_id}`)).json();
    const entry = hist[prompt_id];
    if (entry?.status?.status_str === 'error') throw new Error(`workflow failed: ${JSON.stringify(entry.status.messages ?? []).slice(0, 800)}`);
    if (entry?.outputs && entry.status?.completed !== false) {
      const meshes = findMeshes(entry.outputs);
      if (meshes.length === 0) throw new Error('workflow finished but produced no .glb (add a Save GLB / export node)');
      const m = meshes[meshes.length - 1];
      const q = new URLSearchParams({ filename: m.filename, subfolder: m.subfolder ?? '', type: m.type ?? 'output' });
      const buf = Buffer.from(await (await http('GET', `${opts.host}/view?${q}`)).arrayBuffer());
      log(`got ${m.filename} (${(buf.length / 1e6).toFixed(1)} MB) after ${Math.round((Date.now() - t0) / 1000)}s`);
      return buf;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ------------------------------------------------------------------ game-ready
function triangles(doc) {
  let t = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices();
      const pos = p.getAttribute('POSITION');
      t += Math.floor((idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3);
    }
  }
  return t;
}

async function makeGameReady(buf) {
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  let doc;
  try {
    doc = await io.readBinary(new Uint8Array(buf));
  } catch (e) {
    throw new Error(`could not read GLB (${e.message}). If it is Draco/meshopt-compressed, turn compression off in the save node.`);
  }
  const before = triangles(doc);
  await doc.transform(dedup(), weld());
  let after = triangles(doc);
  // Simplify in passes until under budget (meshopt may stop early on hard meshes).
  for (let pass = 0; pass < 4 && after > opts.tris; pass++) {
    const ratio = Math.max(0.01, (opts.tris / after) * 0.95);
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 * (pass + 1), lockBorder: false }));
    after = triangles(doc);
  }
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'png', resize: [opts.tex, opts.tex] }), prune());
  // Orientation + origin: optional yaw so the face points +Z, then feet at y = 0.
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (opts.yaw && scene) {
    const r = (opts.yaw * Math.PI) / 180;
    const wrap = doc.createNode('skin-root').setRotation([0, Math.sin(r / 2), 0, Math.cos(r / 2)]);
    for (const child of scene.listChildren()) {
      scene.removeChild(child);
      wrap.addChild(child);
    }
    scene.addChild(wrap);
  }
  await doc.transform(center({ pivot: 'below' }));
  // Strip compression extensions the game won't decode.
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (/draco|meshopt|ktx|basisu/i.test(ext.extensionName)) ext.dispose();
  }
  const nodes = doc.getRoot().listNodes().map((n) => n.getName()).filter(Boolean);
  const out = Buffer.from(await io.writeBinary(doc));
  return { out, before, after, nodes, materials: doc.getRoot().listMaterials().length, textures: doc.getRoot().listTextures().length };
}

// ------------------------------------------------------------------ register
function register(id, name, nodes) {
  const file = path.join(opts.out, 'skins.json');
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    list = [];
  }
  const has = (n) => nodes.includes(n);
  const entry = {
    id,
    name: (name ?? id).toUpperCase(),
    file: `${id}.glb`,
    nodes: {
      ...(has('jaw') ? { jaw: 'jaw' } : {}),
      ...(has('spinner') ? { spinner: 'spinner' } : {}),
      ...(has('screen') ? { screen: 'screen' } : {}),
      ...(nodes.filter((n) => /^leg/i.test(n)).length ? { legs: nodes.filter((n) => /^leg/i.test(n)) } : {}),
      ...(nodes.filter((n) => /^eye/i.test(n)).length ? { eyes: nodes.filter((n) => /^eye/i.test(n)) } : {}),
    },
  };
  list = list.filter((e) => e.id !== id);
  list.push(entry);
  fs.writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`);
  return entry;
}

// ------------------------------------------------------------------ main
try {
  const raw = opts.glb ? fs.readFileSync(opts.glb) : await runComfy();
  fs.mkdirSync(opts.out, { recursive: true });
  if (opts.keepRaw) fs.writeFileSync(path.join(opts.out, `${opts.id}.raw.glb`), raw);
  const r = await makeGameReady(raw);
  const dest = path.join(opts.out, `${opts.id}.glb`);
  fs.writeFileSync(dest, r.out);
  const entry = register(opts.id, opts.name, r.nodes);
  log(`triangles ${r.before} -> ${r.after} (budget ${opts.tris}); materials ${r.materials}; textures ${r.textures} @ ≤${opts.tex}px`);
  log(`wrote ${path.relative(REPO, dest)} (${(r.out.length / 1024).toFixed(0)} KB) and registered "${entry.id}" in skins.json`);
  if (r.after > opts.tris) log('warning: still over the triangle budget; try a lower --tris or simplify in Blender');
  log(`try it: https://localhost:4173/?skin=lunger:${entry.id}   (or boss:${entry.id})`);
} catch (e) {
  console.error(`[comfy-skin] ${e.message}`);
  process.exit(1);
}
