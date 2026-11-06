// End-to-end test of comfy-skin against a mock ComfyUI API (no GPU needed).
// node tools/comfy-skin/test/mock-comfy.test.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comfy-skin-'));

// A dense textured sphere (~80k triangles, 2048px texture) standing in for a raw image-to-3D result.
async function denseGlb() {
  const doc = new Document();
  const buf = doc.createBuffer();
  const seg = 200;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let y = 0; y <= seg; y++) {
    for (let x = 0; x <= seg; x++) {
      const u = x / seg;
      const v = y / seg;
      const th = u * Math.PI * 2;
      const ph = v * Math.PI;
      pos.push(Math.cos(th) * Math.sin(ph) * 0.5, Math.cos(ph) * 0.5 + 0.7, Math.sin(th) * Math.sin(ph) * 0.5);
      uv.push(u, v);
    }
  }
  for (let y = 0; y < seg; y++) for (let x = 0; x < seg; x++) {
    const a = y * (seg + 1) + x;
    idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2);
  }
  // Non-uniform texture (prune() would rightly replace a solid colour with a factor).
  const W = 2048;
  const raw = Buffer.alloc(W * W * 3);
  for (let i = 0; i < W * W; i++) { raw[i * 3] = (i % W) & 255; raw[i * 3 + 1] = (i / W) & 255; raw[i * 3 + 2] = 160; }
  const png = await sharp(raw, { raw: { width: W, height: W, channels: 3 } }).png().toBuffer();
  const tex = doc.createTexture('base').setImage(new Uint8Array(png)).setMimeType('image/png');
  const mat = doc.createMaterial('mat').setBaseColorTexture(tex);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buf))
    .setMaterial(mat);
  const mesh = doc.createMesh('body').addPrimitive(prim);
  const node = doc.createNode('body').setMesh(mesh);
  doc.createScene('scene').addChild(node);
  return Buffer.from(await new NodeIO().writeBinary(doc));
}

const glb = await denseGlb();
let polls = 0;
let uploaded = '';
let queued = null;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const body = await new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
  const json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  if (url.pathname === '/system_stats') return json({ system: {} });
  if (url.pathname === '/upload/image') { uploaded = /filename="([^"]+)"/.exec(body.toString('latin1'))?.[1] ?? ''; return json({ name: uploaded, subfolder: '', type: 'input' }); }
  if (url.pathname === '/prompt') { queued = JSON.parse(body.toString()); return json({ prompt_id: 'p1', number: 0 }); }
  if (url.pathname === '/history/p1') {
    polls++;
    if (polls < 2) return json({});
    return json({ p1: { status: { status_str: 'success', completed: true }, outputs: { 9: { '3d': [{ filename: 'mesh_00001_.glb', subfolder: '3D', type: 'output' }] } } } });
  }
  if (url.pathname === '/view') { res.setHeader('Content-Type', 'model/gltf-binary'); return res.end(glb); }
  res.statusCode = 404; res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const wf = { 3: { class_type: 'LoadImage', inputs: { image: 'old.png' } }, 7: { class_type: 'KSampler', inputs: { seed: 1 } }, 9: { class_type: 'SaveGLB', inputs: {} } };
fs.writeFileSync(path.join(tmp, 'wf.api.json'), JSON.stringify(wf));
fs.writeFileSync(path.join(tmp, 'concept.png'), await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ffffff' } }).png().toBuffer());
fs.writeFileSync(path.join(tmp, 'skins.json'), JSON.stringify([{ id: 'keep-me', file: 'keep-me.glb' }]));

let ok = true;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); ok &&= cond; };
try {
  const { stdout: out } = await run('node', [path.join(HERE, '..', 'comfy-skin.mjs'), '--host', `http://127.0.0.1:${port}`, '--workflow', path.join(tmp, 'wf.api.json'),
    '--image', path.join(tmp, 'concept.png'), '--id', 'mock-blob', '--name', 'Mock Blob', '--out', tmp, '--set', '7.seed=42', '--yaw', '90'], { encoding: 'utf8', timeout: 240000 });
  console.log(out.trim());
  check(uploaded === 'concept.png', 'concept image uploaded');
  check(queued?.prompt?.['3']?.inputs?.image === 'concept.png', 'LoadImage node patched');
  check(queued?.prompt?.['7']?.inputs?.seed === 42, '--set override applied');
  const io = new NodeIO();
  const doc = await io.readBinary(new Uint8Array(fs.readFileSync(path.join(tmp, 'mock-blob.glb'))));
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  check(tris > 0 && tris <= 3000, `simplified 80000 -> ${tris} triangles`);
  const img = doc.getRoot().listTextures()[0]?.getSize();
  check(!!img && img[0] <= 512 && img[1] <= 512, `texture resized to ${img}`);
  const b = doc.getRoot().listNodes();
  check(b.length >= 1, 'nodes kept');
  const skins = JSON.parse(fs.readFileSync(path.join(tmp, 'skins.json'), 'utf8'));
  check(skins.some((s) => s.id === 'keep-me') && skins.some((s) => s.id === 'mock-blob' && s.name === 'MOCK BLOB'), 'skins.json upserted, existing entries kept');
} catch (e) {
  console.error(e.stdout ?? '', e.stderr ?? e.message);
  ok = false;
}
server.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
