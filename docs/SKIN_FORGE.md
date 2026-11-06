# Skin forge: make creature skins with a local AI model

`tools/skin-forge/forge.mjs` turns a text prompt into a game-ready GLB skin on your own PC:

```
prompt ─► Ollama (local LLM) ─► Three.js code ─► headless Chromium with NO network
       ─► GLTFExporter ─► re-load + validate ─► public/skins/<id>.glb + skins.json + preview PNG
```

Nothing goes to the cloud. The model's code never runs in Node: it runs only inside a sandboxed
browser page (see [Sandbox](#sandbox)). See `docs/SKINS.md` for the skin contract itself.

## Quick start (Windows PC with an RTX GPU, WSL2 Ubuntu)

In **Ubuntu (WSL2)**, inside your clone of this repo:

```bash
npm install                                   # Node 20+; if Node is missing, install it with nvm first
bash tools/skin-forge/setup-wsl.sh            # installs Ollama, pulls the model, checks nvidia-smi
npm run forge -- --id toastbug --name "TOAST BUG" --prompt "a toaster with spider legs"
npm run forge -- --id mega-llama --kind boss --name "MEGA LLAMA" --prompt "a llama made of a giant calculator"
npm run build && npm run serve                # then open https://localhost:4173/?skin=drifter:toastbug
```

- The preview lands in `tools/skin-forge/out/<id>.png` (front view on the left, 3/4 view on the right).
  The generated code is kept next to it (`<id>.html` or `<id>.js`) so you can hand-fix it and re-run with `--code-file`.
- Not happy? Run it again (sampling is random), add detail to the prompt, or raise `--tries`.
- `--dry-run` writes only to `tools/skin-forge/out/`. Remove a skin by deleting its GLB and its line in `public/skins/skins.json`.
- On an RTX 5090 a reply should take a minute or two (the GLB coder thinks a lot; replies average about 20K tokens).
  This was not measured here; there was no GPU in the build environment.

### Alternative: Ollama natively on Windows

1. Install Ollama with `OllamaSetup.exe` from <https://ollama.com/download/windows> (Windows 10 22H2+, NVIDIA driver 551.61+).
2. In PowerShell: `ollama pull hf.co/ccore/Qwen3.5-4B-GLB-3D-Coder:Q8_0`.
3. Run the forge from Windows (Node 20+ for Windows, `npm install`, `npx playwright install chromium`):
   `npm run forge -- --id toastbug --prompt "a toaster with spider legs"`.
4. Or keep the forge in WSL and point it at the Windows server. With WSL "mirrored" networking
   (`networkingMode=mirrored` in `%UserProfile%\.wslconfig`) `localhost:11434` just works. Otherwise set the
   Windows user variable `OLLAMA_HOST=0.0.0.0:11434`, restart Ollama, and pass
   `--host http://<windows-ip>:11434` (the IP is the `nameserver` line in WSL's `/etc/resolv.conf`).
   See the [Ollama FAQ](https://docs.ollama.com/faq) on `OLLAMA_HOST`.

## Options

| Flag | Default | Meaning |
|---|---|---|
| `--id` | (required) | lowercase id; writes `public/skins/<id>.glb` |
| `--name` | id in capitals | name shown in game |
| `--prompt` | (required) | what to build |
| `--kind bug\|boss` | `bug` | bug: about 0.2 units, origin at the centre. boss: about 1.75 units, origin at the feet, asks for a `screen` node |
| `--tries` | `3` | attempts; each failure (error, triangle count, no export…) is sent back to the model |
| `--model` | `hf.co/ccore/Qwen3.5-4B-GLB-3D-Coder:Q8_0` | any Ollama model name |
| `--host` | `$OLLAMA_HOST` or `http://localhost:11434` | Ollama server |
| `--style html\|function` | `html` | `html`: the model writes a full page with an Export GLB button (its training format). `function`: just a function body that returns the group (shorter; good for general coding models) |
| `--no-think` | thinking on | turn model thinking off (faster, but the GLB coder is only validated with thinking on) |
| `--temperature` | 0.8 html / 0.6 function | sampling temperature |
| `--num-ctx` / `--num-predict` | `65536` / `-1` | context size / max output tokens (-1 = unlimited; the model card warns 8K can cut the HTML off) |
| `--llm-timeout` / `--timeout` | 30 min / 30 s | per model reply / per sandbox run |
| `--code-file` | | skip the model; run a `.js` function body or an `.html` page (e.g. `tools/skin-forge/examples/sample-bug.js`) |
| `--save-reply` | off | keep raw replies (with thinking) in `tools/skin-forge/out/` |
| `--no-normalize` | off | keep the model's origin instead of re-centring |
| `--dry-run` | off | do not touch `public/skins/` |

## What the forge checks

The exported GLB is re-loaded with `GLTFLoader` (as the game does) and must:

- parse, contain at least one mesh and have a non-flat, finite bounding box;
- have **≤ 3000 triangles** (hard limit; the model is told why and retries);
- warnings only: more than 8 materials, very wide for its height, eyes without a pupil child, boss without `screen`.

Lights, cameras, helpers and ground planes are stripped. If the page exports its whole scene, only the
non-light, non-ground top-level objects are kept. The skin is then re-centred: bugs on the bounding-box
centre (they float and turn to face you), bosses with the feet at y = 0.

Named nodes are found by name and written to the `nodes` field in `skins.json`:
`jaw` (or `mouth…`), `spinner` (or `propeller/rotor/fan…`), `screen` (boss only), `eye…` (top-most only), `leg…/foot…`.
Existing entries in `skins.json` are kept; an entry with the same id is replaced.

## Sandbox

- Model output only ever runs inside a headless Chromium page. It is never `eval`ed in Node.
- Every request from the page goes through `context.route('**/*')`. Only `three` files from
  `node_modules/three` (`build/` and `examples/jsm/`) are served, under a fake origin. CDN URLs for three and its
  addons (cdnjs, unpkg, jsdelivr, esm.sh) map to those local files, so there is one THREE instance. Every other
  request is aborted and listed in the output ("sandbox blocked N requests").
- A second wall: the browser runs with a dead proxy (`127.0.0.1:9`) and `--host-resolver-rules=MAP * ~NOTFOUND`.
  WebSockets are closed, service workers blocked and downloads refused.
- Each attempt gets a fresh browser that is killed after `--timeout` seconds (infinite loops end there).

## Research (checked 2026-11-06)

### Qwen3.5-4B 3D Coder models

There are **two** related community fine-tunes of `Qwen/Qwen3.5-4B` (both from the same Hugging Face account; neither is an official Qwen release):

| | `ccore/Qwen3.5-4B-3D-Coder` | `ccore/Qwen3.5-4B-GLB-3D-Coder` (**forge default**) |
|---|---|---|
| Aim | Three.js **scenes** (camera, lights, controls) | reusable **GLB game assets** (trained for Godot) |
| Output | one standalone HTML page, three.js 0.160 from cdnjs, no addons | one standalone HTML page with a preview and an **Export GLB** button (uses three addons from a CDN) |
| Ollama | `ollama run maternion/qwen3.5-3d-coder:4b` (Q4_K_M 2.7 GB), `:4b-q8_0` (4.5 GB); or `hf.co/ccore/Qwen3.5-4B-3D-Coder:Q4_K_M` | `ollama run hf.co/ccore/Qwen3.5-4B-GLB-3D-Coder:Q4_K_M` (2.7 GB) or `:Q8_0` |
| Training data | 4,146 HTML scenes (MIT dataset) | 3,918 tested, rendered assets with validated GLB exports across 40 domains |
| Sampling | temp 0.6–0.8, top_p 0.90–0.95, top_k 20–40, repeat penalty 1.0 | temp 0.8, top_k 40, top_p 0.95, min_p 0, repeat penalty 1.0, **thinking on**, unlimited output |
| Known issues | early preview; some scenes need a retry; bugs are mostly **duplicate variable names** | early preview; some requests need a retry or a small fix; materials can differ between preview and export; replies average ~20K tokens (up to 72K), so an 8K output cap truncates the HTML |

- **Licence:** weights are **Apache-2.0** (model cards; base `Qwen/Qwen3.5-4B` is Apache-2.0 too; the vision projector is Apache-2.0, the scene dataset MIT).
  Commercial use and redistribution are allowed if you keep the licence and attribution notices. The GLBs it helps make are your own output; the forge does not ship the weights.
- **Prompt format:** normal chat (the GGUF carries its own chat template; Ollama applies it). Ollama reports
  capabilities `completion, thinking, tools, vision`. The forge uses `/api/chat` with a system + user message.
- **Does it call GLTFExporter itself?** The GLB variant does: its page has an Export GLB button. The forge presses
  that button in the sandbox and captures whatever object the page hands to `GLTFExporter`, then re-exports it under
  its own checks. The scene variant does not export; use `--style function` with it.
- **Model card note:** files were updated on 2026-11-05; re-pull if you downloaded earlier.

### Verdict

Worth using for **cheap, fast, stylised placeholder and toy creatures**: it writes primitive-based Three.js code,
which already matches CRUNCHER's look (procedural primitives, big googly eyes), the output has named parts we can
animate, the poly count is tiny, and the licence is clean. It does not make sculpted or textured art: a 4B model
only places boxes, spheres and cylinders, and expect retries. For hero art, use an image-to-3D model (below),
then decimate to ≤ 3k triangles and name the parts in Blender.

### Higher-fidelity alternatives on an RTX 5090 (32 GB)

| Model | Input | VRAM | OS | Licence | Notes |
|---|---|---|---|---|---|
| [TRELLIS.2](https://github.com/microsoft/TRELLIS.2) (4B) | image | ≥ 24 GB | Linux only (tested); WSL2 not verified | MIT (code + weights) | GLB with PBR textures; ~3 s at 512³ to ~60 s at 1536³ on H100; dense meshes need decimation |
| [TRELLIS](https://github.com/microsoft/TRELLIS) (image-large 1.2B, text 342M–2B) | image or text | ≥ 16 GB | Linux (Windows not fully tested) | MIT | text models exist, but the authors recommend text→image→3D |
| [Hunyuan3D 2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) | image | ~10 GB shape, ~21 GB texture, ~29 GB both | Windows, Linux, macOS | Tencent Hunyuan Community License | **not licensed in the EU, UK or South Korea**; >1M MAU needs a separate licence |

All three are image-to-3D and produce one fused mesh: there are no `jaw`/`eyes` parts unless you split them
yourself. TRELLIS.2 (MIT) is the cleanest licence for a shipped game; Hunyuan3D 2.1 is the easiest on Windows but
check where you and your players are.

### Sources

- <https://huggingface.co/ccore/Qwen3.5-4B-GLB-3D-Coder>
- <https://huggingface.co/ccore/Qwen3.5-4B-3D-Coder>
- <https://ollama.com/maternion/qwen3.5-3d-coder>
- <https://huggingface.co/Qwen/Qwen3.5-4B>
- <https://ollama.com/install.sh>, <https://docs.ollama.com/windows>, <https://docs.ollama.com/faq>
- <https://github.com/microsoft/TRELLIS.2>, <https://github.com/microsoft/TRELLIS>
- <https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1>, <https://huggingface.co/tencent/Hunyuan3D-2.1> (`LICENSE`)
