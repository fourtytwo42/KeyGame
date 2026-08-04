#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_user="${SUDO_USER:-hendo420}"
helper=/usr/local/libexec/keygame-v4-rehearsal-restart

[[ "$project_root" == /* && -d "$project_root/ops/systemd" ]] || {
  echo "Could not resolve the KeyGame project root." >&2
  exit 1
}
id "$run_user" >/dev/null

install -d -m 0755 /etc/keygame /usr/local/libexec
install -m 0755 "$project_root/scripts/v4-launch-rehearsal-restart-service.sh" "$helper"

for unit in \
  keygame-v4-rehearsal-anvil.service \
  keygame-v4-rehearsal-keeper.service \
  keygame-v4-rehearsal-indexer.service \
  keygame-v4-rehearsal-web.service \
  keygame-v4-launch-rehearsal.service \
  keygame-v4-launch-rehearsal.timer; do
  sed \
    -e "s#User=hendo420#User=$run_user#g" \
    -e "s#/home/hendo420/projects/KeyGame#$project_root#g" \
    "$project_root/ops/systemd/$unit" >"/etc/systemd/system/$unit"
  chmod 0644 "/etc/systemd/system/$unit"
done

sudoers_file=/etc/sudoers.d/keygame-v4-launch-rehearsal
printf '%s ALL=(root) NOPASSWD: %s keeper, %s indexer\n' \
  "$run_user" "$helper" "$helper" >"$sudoers_file"
chmod 0440 "$sudoers_file"
visudo -cf "$sudoers_file"
systemctl daemon-reload

echo "Installed isolated rehearsal services for $run_user at $project_root."
echo "Services remain stopped until explicitly enabled or started."
