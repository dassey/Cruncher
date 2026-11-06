# comfy-skin: ComfyUI image-to-3D → game-ready skin

Turns any ComfyUI **image → 3D** workflow (Hunyuan3D 2.1, TRELLIS, Hi3D…) into a CRUNCHER skin:
upload concept image → run workflow → download GLB → weld + simplify to ≤ 3k triangles,
textures ≤ 512 px, origin at the feet, no Draco/KTX2 → `public/skins/<id>.glb` + `skins.json`.
Talks to `localhost` only.

## One-time
```bash
cd tools/comfy-skin && npm install
```
In ComfyUI (http://localhost:1117): build or load an image→3D workflow that ends in a GLB save node
(the Hunyuan3D 2.1 template works), turn mesh compression off, then **Workflow → Export (API)**.
Save it as e.g. `tools/comfy-skin/workflows/img2glb.api.json`.

## Make a skin
```bash
node tools/comfy-skin/comfy-skin.mjs \
  --workflow tools/comfy-skin/workflows/img2glb.api.json \
  --image concept/toaster-spider.png \
  --id toaster-spider --name "TOASTER SPIDER"
```
Then `npm run build && npm run serve` and open `https://localhost:4173/?skin=lunger:toaster-spider`.

| Option | Default | |
|---|---|---|
| `--host` | `http://127.0.0.1:1117` | ComfyUI address (also `COMFY_HOST`) |
| `--tris` | 3000 | triangle budget |
| `--tex` | 512 | max texture size |
| `--yaw` | 0 | rotate (degrees) so the face points +Z |
| `--set 12.seed=42` | | override any node input in the workflow (repeatable) |
| `--glb file.glb` | | skip ComfyUI, just make an existing GLB game-ready |
| `--keep-raw` | | also keep the untouched GLB as `<id>.raw.glb` |

Concept-image tips: one creature, full body, ¾ front view, plain white background, toy-like,
big eyes, no shadows. Image-to-3D gives one fused mesh: it bobs, lunges and gets knocked flying,
but has no separate `jaw`/`spinner` unless you add those nodes in Blender (see `docs/SKINS.md`).

## Test without a GPU
```bash
node tools/comfy-skin/test/mock-comfy.test.mjs   # mock ComfyUI API, 80k-tri textured mesh in
```
