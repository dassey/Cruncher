#!/usr/bin/env bash
# Skin forge setup for WSL2 Ubuntu (Windows 11 + NVIDIA GPU). Safe to run again.
#   bash tools/skin-forge/setup-wsl.sh            # pulls the default Q8_0 model
#   MODEL=hf.co/ccore/Qwen3.5-4B-GLB-3D-Coder:Q4_K_M bash tools/skin-forge/setup-wsl.sh
# Needs: the normal Windows NVIDIA driver (do NOT install a Linux driver inside WSL).
set -euo pipefail

MODEL="${MODEL:-hf.co/ccore/Qwen3.5-4B-GLB-3D-Coder:Q8_0}"
HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }

say "Checking the GPU"
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader; then
  :
else
  warn "nvidia-smi failed. Update the Windows NVIDIA driver, run 'wsl --update' in PowerShell, then reopen Ubuntu."
  warn "Ollama will still run, but on the CPU (very slow)."
fi

say "Installing tools (curl, zstd)"
need=()
for t in curl zstd; do command -v "$t" >/dev/null 2>&1 || need+=("$t"); done
if ((${#need[@]})); then
  sudo apt-get update -qq
  sudo apt-get install -y -qq "${need[@]}"
else
  echo "already installed"
fi

say "Installing Ollama"
if command -v ollama >/dev/null 2>&1; then
  echo "already installed: $(ollama --version 2>/dev/null | tail -1)"
else
  curl -fsSL https://ollama.com/install.sh | sh
fi

say "Starting the Ollama server"
if curl -fsS "http://${HOST}/api/version" >/dev/null 2>&1; then
  echo "already running at ${HOST}"
else
  if command -v systemctl >/dev/null 2>&1 && systemctl is-system-running >/dev/null 2>&1; then
    sudo systemctl enable --now ollama
  else
    mkdir -p "$HOME/.ollama"
    nohup ollama serve >"$HOME/.ollama/serve.log" 2>&1 &
  fi
  for _ in $(seq 1 30); do
    curl -fsS "http://${HOST}/api/version" >/dev/null 2>&1 && break
    sleep 1
  done
  curl -fsS "http://${HOST}/api/version" >/dev/null || { warn "Ollama did not start; see ~/.ollama/serve.log"; exit 1; }
  echo "running at ${HOST}"
fi

say "Pulling ${MODEL}"
ollama pull "${MODEL}"

say "Checking that the model runs on the GPU"
curl -fsS "http://${HOST}/api/generate" -d "{\"model\":\"${MODEL}\",\"prompt\":\"hi\",\"stream\":false,\"think\":false,\"options\":{\"num_predict\":8}}" >/dev/null || true
ollama ps || true
echo "(PROCESSOR should say 100% GPU.)"

say "Checking Node and Playwright"
if command -v node >/dev/null 2>&1; then
  echo "node $(node -v)"
  if [ -d "${REPO}/node_modules/playwright" ]; then
    (cd "${REPO}" && npx playwright install chromium >/dev/null && echo "chromium ready") || warn "run: npx playwright install --with-deps chromium"
  else
    warn "run 'npm install' in ${REPO} first, then: npx playwright install --with-deps chromium"
  fi
else
  warn "Node 20+ is not installed in WSL. Install it (e.g. nvm), or run forge.mjs from Windows (see docs/SKIN_FORGE.md)."
fi

cat <<EOF

Done. Next steps:
  cd ${REPO}
  npm run forge -- --id toastbug --name "TOAST BUG" --prompt "a toaster with spider legs"
  npm run forge -- --id mega-llama --kind boss --name "MEGA LLAMA" --prompt "a llama made of a giant calculator"
Then: npm run build && npm run serve, and open https://localhost:4173/?skin=drifter:toastbug
Preview PNGs land in tools/skin-forge/out/.
EOF
