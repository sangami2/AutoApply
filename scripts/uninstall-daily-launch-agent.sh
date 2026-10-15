#!/bin/bash
set -euo pipefail

LABEL="com.akash.autoapply.daily"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
rm -f "$TARGET"
echo "Removed $LABEL."
