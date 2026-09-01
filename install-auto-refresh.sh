#!/usr/bin/env bash
# 安装/卸载「每日自动刷新」——用 macOS launchd 定时运行 fetch-data.mjs。
# 默认每 6 小时抓取一次（覆盖美股盘前/盘后两个财报披露窗口），开机自动恢复、无需保持终端开启。
#
#   安装：  bash install-auto-refresh.sh
#   卸载：  bash install-auto-refresh.sh --uninstall
#   日志：  fetch.log（与本脚本同目录）
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.nasdaqearnings.fetch.plist"
LABEL="com.nasdaqearnings.fetch"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-21600}"   # 21600 = 6 小时

uninstall() {
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "已卸载自动刷新任务。"
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then
  echo "❌ 未找到 node，请先安装 Node.js（https://nodejs.org）"; exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DIR/fetch-data.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>StartInterval</key><integer>$INTERVAL_SECONDS</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$DIR/fetch.log</string>
  <key>StandardErrorPath</key><string>$DIR/fetch.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "✅ 已安装自动刷新任务：每 $(( INTERVAL_SECONDS / 3600 )) 小时运行一次 node fetch-data.mjs"
echo "   日志：$DIR/fetch.log"
echo "   卸载：bash install-auto-refresh.sh --uninstall"
echo "   （立即执行了一次抓取，稍后可用 tail -f \"$DIR/fetch.log\" 查看进度）"
