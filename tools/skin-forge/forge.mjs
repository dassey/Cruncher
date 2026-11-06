#!/usr/bin/env node
// Skin forge: text prompt -> local LLM (Ollama) -> Three.js code -> sandboxed headless page
// -> GLB -> validate -> public/skins/<id>.glb + skins.json entry + preview PNG.
// See docs/SKIN_FORGE.md.
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runInSandbox } from './sandbox.mjs';
import { MAX_MATERIALS, MAX_TRIS, functionSystemPrompt, htmlSystemPrompt, retryPrompt, userPrompt } from './prompt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SKINS_DIR = path.join(REPO, 'public', 'skins');
const OUT_DIR = path.join(HERE, 'out');
const DEFAULT_MODEL = 'hf.co/ccore/Qwen3.5-4B-GLB-3D-Coder:Q8_0';

const HELP = `Usage: npm run forge -- --id my-bug --name "MY BUG" --prompt "a toaster with spider legs" [options]

  --id <id>            skin id (lowercase letters, digits, dashes); writes public/skins/<id>.glb
  --name <text>        display name (default: id in capitals)
  --prompt <text>      what to build
  --kind bug|boss      size, origin and the "screen" node (default bug)
  --tries <n>          attempts; each failure is fed back to the model (default 3)
  --model <name>       Ollama model (default ${DEFAULT_MODEL})
  --host <url>         Ollama server (default $OLLAMA_HOST or http://localhost:11434)
  --style html|function  html: full page with an Export GLB button (what the GLB coder was trained on)
                       function: just a function body that returns the group (default html)
  --think / --no-think model thinking (default on; the GLB coder is only validated with it on)
  --temperature <t>    default 0.8 (html) / 0.6 (function)
  --num-ctx <n>        context window tokens (default 65536)
  --num-predict <n>    max output tokens, -1 = unlimited (default -1)
  --llm-timeout <min>  minutes per model reply (default 30)
  --timeout <s>        seconds the sandbox may run the code (default 30)
  --code-file <path>   skip the model: run this .js function body or .html page instead
  --save-reply         keep the raw model replies in tools/skin-forge/out/
  --no-normalize       keep the model's origin instead of centring it
  --dry-run            validate and write the preview only; do not touch public/skins
`;

function fail(msg) {
  console.error(`forge: ${msg}`);
  process.exit(1);
}

const { values: a } = parseArgs({
  options: {
    id: { type: 'string' }, name: { type: 'string' }, prompt: { type: 'string' },
    kind: { type: 'string', default: 'bug' }, tries: { type: 'string', default: '3' },
    model: { type: 'string', default: DEFAULT_MODEL },
    host: { type: 'string', default: process.env.OLLAMA_HOST ? normalizeHost(process.env.OLLAMA_HOST) : 'http://localhost:11434' },
    style: { type: 'string', default: 'html' }, think: { type: 'boolean', default: true }, 'no-think': { type: 'boolean' },
    temperature: { type: 'string' }, 'num-ctx': { type: 'string', default: '65536' }, 'num-predict': { type: 'string', default: '-1' },
    'llm-timeout': { type: 'string', default: '30' }, timeout: { type: 'string', default: '30' },
    'code-file': { type: 'string' }, 'save-reply': { type: 'boolean' }, 'no-normalize': { type: 'boolean' },
    'dry-run': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  },
});

function normalizeHost(h) {
  return /^https?:\/\//.test(h) ? h : `http://${h}`;
}

if (a.help) {
  console.log(HELP);
  process.exit(0);
}
if (!a.id || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(a.id)) fail('--id is required: lowercase letters, digits and dashes (max 41 chars).');
if (!['bug', 'boss'].includes(a.kind)) fail('--kind must be bug or boss.');
if (!['html', 'function'].includes(a.style)) fail('--style must be html or function.');
if (!a.prompt && !a['code-file']) fail('--prompt is required (or --code-file to skip the model).');
const id = a.id;
const name = (a.name ?? id.replace(/-/g, ' ')).toUpperCase();
const tries = Math.max(1, parseInt(a.tries, 10) || 3);
const think = a['no-think'] ? false : a.think;
const temperature = a.temperature != null ? Number(a.temperature) : a.style === 'html' ? 0.8 : 0.6;

/** Pull the code out of a model reply. Returns {style, code} or null. */
export function extractCode(reply, preferred) {
  const text = reply.replace(/<think>[\s\S]*?<\/think>/g, '');
  const fences = [...text.matchAll(/```([a-zA-Z]*)[^\n]*\n([\s\S]*?)(?:```|$)/g)].map((m) => ({ lang: m[1].toLowerCase(), body: m[2] }));
  // Replies can carry reasoning with code fragments before the real file: take the longest HTML block,
  // else everything from the last <!doctype html> / <html> on.
  const lastFrom = (re) => {
    const all = [...text.matchAll(re)];
    return all.length ? text.slice(all[all.length - 1].index).replace(/```[\s\S]*$/, '') : undefined;
  };
  const html = fences.filter((f) => f.lang === 'html' || /<html[\s>]|<!doctype html/i.test(f.body))
    .sort((x, y) => y.body.length - x.body.length)[0]?.body
    ?? lastFrom(/<!doctype html/gi) ?? lastFrom(/<html[\s>]/gi);
  const js = fences.filter((f) => ['js', 'javascript', 'ts', ''].includes(f.lang) && /return\b/.test(f.body) && !/<script/i.test(f.body))
    .sort((x, y) => y.body.length - x.body.length)[0]?.body;
  if (preferred === 'function' && js) return { style: 'function', code: js };
  if (html) return { style: 'html', code: html };
  if (js) return { style: 'function', code: js };
  if (/THREE\./.test(text) && /return\b/.test(text)) return { style: 'function', code: text };
  return null;
}

async function chat(messages) {
  const opts = {
    temperature, top_p: 0.95, top_k: a.style === 'html' ? 40 : 20, min_p: 0, repeat_penalty: 1,
    num_ctx: parseInt(a['num-ctx'], 10), num_predict: parseInt(a['num-predict'], 10),
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(a['llm-timeout']) * 60_000);
  const send = (withThink) => fetch(`${a.host}/api/chat`, {
    method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: a.model, messages, stream: true, options: opts, ...(withThink === undefined ? {} : { think: withThink }) }),
  });
  try {
    let res = await send(think);
    if (res.status === 400 && /think/i.test(await res.clone().text())) res = await send(undefined);
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
    let content = '', thinking = '', buf = '', last = Date.now(), stats = null;
    const dec = new TextDecoder();
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const j = JSON.parse(line);
        if (j.error) throw new Error(`Ollama: ${j.error}`);
        content += j.message?.content ?? '';
        thinking += j.message?.thinking ?? '';
        if (j.done) stats = j;
      }
      if (Date.now() - last > 5000) {
        last = Date.now();
        process.stderr.write(`\r  …${thinking.length ? ` thinking ${thinking.length} chars,` : ''} reply ${content.length} chars   `);
      }
    }
    process.stderr.write('\n');
    if (stats) {
      const tps = stats.eval_count / (stats.eval_duration / 1e9);
      console.log(`  model: ${stats.eval_count} tokens in ${(stats.total_duration / 1e9).toFixed(0)}s (${tps.toFixed(1)} tok/s, stop: ${stats.done_reason})`);
    }
    return { content, thinking, cutOff: stats?.done_reason === 'length' };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`model reply took longer than ${a['llm-timeout']} min`);
    if (err.cause?.code === 'ECONNREFUSED') throw new Error(`cannot reach Ollama at ${a.host} (is "ollama serve" running?)`);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

function upsertManifest(report) {
  const file = path.join(SKINS_DIR, 'skins.json');
  const list = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  if (!Array.isArray(list)) throw new Error('public/skins/skins.json is not an array');
  const entry = { id, name, file: `${id}.glb`, nodes: report.nodes };
  const i = list.findIndex((e) => e?.id === id);
  if (i >= 0) list[i] = { ...list[i], ...entry };
  else list.push(entry);
  // Same layout as the hand-written file: one key per line, nested values on one line.
  const compact = (v) => Array.isArray(v) ? `[${v.map(compact).join(', ')}]`
    : v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`).join(', ')} }`
    : JSON.stringify(v);
  const block = (e) => `  {\n${Object.entries(e).map(([k, x]) => `    ${JSON.stringify(k)}: ${compact(x)}`).join(',\n')}\n  }`;
  const body = `[\n${list.map(block).join(',\n')}\n]\n`;
  writeFileSync(`${file}.tmp`, body);
  renameSync(`${file}.tmp`, file);
  return file;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const sys = a.style === 'html' ? htmlSystemPrompt(a.kind) : functionSystemPrompt(a.kind);
  const messages = [{ role: 'system', content: sys }, { role: 'user', content: userPrompt(a.prompt ?? '', name, a.kind) }];
  const fixed = a['code-file'] ? readFileSync(path.resolve(a['code-file']), 'utf8') : null;
  const attempts = fixed ? 1 : tries;
  if (!fixed) console.log(`forge: ${a.model} @ ${a.host}, style ${a.style}, think ${think}, ${attempts} tries`);

  for (let n = 1; n <= attempts; n++) {
    let cand;
    if (fixed) {
      const isHtml = /\.html?$/i.test(a['code-file']) || /<html[\s>]|<!doctype html/i.test(fixed);
      cand = { style: isHtml ? 'html' : 'function', code: fixed };
      console.log(`forge: running ${a['code-file']} (${cand.style}) without a model`);
    } else {
      console.log(`forge: attempt ${n}/${attempts}: asking the model…`);
      const reply = await chat(messages);
      if (a['save-reply']) writeFileSync(path.join(OUT_DIR, `${id}.reply${n}.md`), `${reply.thinking ? `<think>\n${reply.thinking}\n</think>\n` : ''}${reply.content}`);
      messages.push({ role: 'assistant', content: reply.content });
      cand = extractCode(reply.content, a.style);
      if (!cand || reply.cutOff) {
        const err = reply.cutOff
          ? 'Your reply was cut off by the output token limit before the code was finished. Write much shorter code: no comments, no CSS, no UI panels, no orbit controls.'
          : 'I could not find any code in your reply.';
        console.log(`  ✗ ${err}`);
        messages.push({ role: 'user', content: retryPrompt(a.style, err) });
        continue;
      }
    }

    const r = await runInSandbox({
      repo: REPO, style: cand.style, code: cand.code, kind: a.kind, id,
      normalize: !a['no-normalize'], maxTris: MAX_TRIS, maxMaterials: MAX_MATERIALS, timeoutMs: Number(a.timeout) * 1000,
    });
    if (r.blocked.length) console.log(`  sandbox blocked ${r.blocked.length} request(s): ${[...new Set(r.blocked)].slice(0, 4).join(', ')}`);
    if (r.report) console.log(`  ${r.report.triangles} tris, ${r.report.materials} materials, ${r.report.meshes} meshes, size ${r.report.size.join(' x ')}`);
    if (!r.ok) {
      const errs = r.logs.filter((l) => /pageerror|console\.error/.test(l)).slice(0, 5);
      const msg = [r.error, ...errs].join('\n');
      console.log(`  ✗ ${msg.replace(/\n/g, '\n    ')}`);
      if (fixed) process.exit(2);
      messages.push({ role: 'user', content: retryPrompt(a.style, msg) });
      continue;
    }
    for (const w of r.report.warnings) console.log(`  ! ${w}`);
    console.log(`  ✓ nodes: ${JSON.stringify(r.report.nodes)}`);
    const png = path.join(OUT_DIR, `${id}.png`);
    writeFileSync(png, r.png);
    writeFileSync(path.join(OUT_DIR, `${id}.${cand.style === 'html' ? 'html' : 'js'}`), cand.code);
    if (a['dry-run']) {
      writeFileSync(path.join(OUT_DIR, `${id}.glb`), r.glb);
      console.log(`forge: dry run. GLB ${path.relative(REPO, path.join(OUT_DIR, `${id}.glb`))}, preview ${path.relative(REPO, png)}`);
      return;
    }
    mkdirSync(SKINS_DIR, { recursive: true });
    writeFileSync(path.join(SKINS_DIR, `${id}.glb`), r.glb);
    const manifest = upsertManifest(r.report);
    console.log(`forge: wrote public/skins/${id}.glb (${(r.glb.length / 1024).toFixed(1)} KB), updated ${path.relative(REPO, manifest)}, preview ${path.relative(REPO, png)}`);
    console.log(`forge: try it: https://localhost:4173/?skin=${a.kind === 'boss' ? 'boss' : 'drifter'}:${id}`);
    return;
  }
  fail(`no valid skin after ${attempts} attempt(s). Try another prompt, more --tries, or --save-reply to inspect the replies.`);
}

main().catch((err) => fail(err.message));
