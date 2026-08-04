#!/usr/bin/env bash
set -euo pipefail

tool_root="${KEYGAME_SECURITY_TOOL_ROOT:-$HOME/.local/share/keygame-security}"
bin="$tool_root/bin"
downloads="$tool_root/downloads"
mkdir -p "$bin" "$downloads"

uv_archive="$downloads/uv-0.12.0.tar.gz"
download_and_check() {
  local url="$1" expected="$2" output="$3"
  curl --proto '=https' --tlsv1.2 --fail --location "$url" --output "$output"
  printf '%s  %s\n' "$expected" "$output" | sha256sum --check
}
download_and_check \
  "https://github.com/astral-sh/uv/releases/download/0.12.0/uv-x86_64-unknown-linux-gnu.tar.gz" \
  "eaf842262aa1c418d8ecc5605f02ee1ebfd369124fa48548e85f9481a47831a9" \
  "$uv_archive"
tar -xzf "$uv_archive" -C "$downloads"
cp "$downloads/uv-x86_64-unknown-linux-gnu/uv" "$bin/uv"
"$bin/uv" venv --clear "$tool_root/python"
"$bin/uv" pip install --python "$tool_root/python/bin/python" \
  slither-analyzer==0.11.3 semgrep==1.134.0 setuptools==80.9.0
ln -sfn "$tool_root/python/bin/slither" "$bin/slither"
ln -sfn "$tool_root/python/bin/semgrep" "$bin/semgrep"

npm install --prefix "$tool_root/node" solhint@6.2.3
ln -sfn "$tool_root/node/node_modules/.bin/solhint" "$bin/solhint"

aderyn_archive="$downloads/aderyn-0.6.8.tar.xz"
download_and_check \
  "https://github.com/Cyfrin/aderyn/releases/download/aderyn-v0.6.8/aderyn-x86_64-unknown-linux-gnu.tar.xz" \
  "ffd6ca658962e211a3ac821c646f69c8e14bf1b1001cbfe091bcd4535a691e46" \
  "$aderyn_archive"
tar -xJf "$aderyn_archive" -C "$bin"
ln -sfn "$bin/aderyn-x86_64-unknown-linux-gnu/aderyn" "$bin/aderyn"

echidna_archive="$downloads/echidna-2.3.2.tar.gz"
download_and_check \
  "https://github.com/crytic/echidna/releases/download/v2.3.2/echidna-2.3.2-x86_64-linux.tar.gz" \
  "38e4eb12627d8dea2a9eabfaebbcdb4d9ad0bde633aafbcae4d69656d6bcdb4a" \
  "$echidna_archive"
tar -xzf "$echidna_archive" -C "$bin"

gitleaks_archive="$downloads/gitleaks-8.30.1.tar.gz"
download_and_check \
  "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz" \
  "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb" \
  "$gitleaks_archive"
tar -xzf "$gitleaks_archive" -C "$bin" gitleaks

chmod 0700 "$bin"/*
echo "Installed pinned KeyGame security tools under $tool_root"
