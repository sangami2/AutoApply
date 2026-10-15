#!/bin/bash
set -euo pipefail

ROOT="/Users/akashsangami/AutoApply"
LABEL="com.akash.autoapply.daily"
SOURCE="$ROOT/config/$LABEL.plist"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
install -m 644 "$SOURCE" "$TARGET"
plutil -lint "$TARGET"
launchctl enable "$DOMAIN/$LABEL"
launchctl bootstrap "$DOMAIN" "$TARGET"
echo "Installed $LABEL — runs every day at 9:00 AM local time."
