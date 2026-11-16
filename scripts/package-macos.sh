#!/usr/bin/env bash
# Package one macOS architecture and reject a bundle whose native code does
# not match. Signing stays under the caller's control: release CI exports
# CSC_IDENTITY_AUTO_DISCOVERY=false because the hosted runners have no
# Developer ID. Notarization still requires APPLE_ID, APPLE_ID_PASSWORD, and
# APPLE_TEAM_ID (see scripts/notarize.js) and is not wired into the default
# electron-builder config.
set -euo pipefail

arch="${1:-}"
case "$arch" in
  arm64|x64) ;;
  *)
    echo "usage: $0 arm64|x64" >&2
    exit 2
    ;;
esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

node scripts/rebuild-native.js --arch "$arch"

# Keep DMG compression on this arch. A later x64 invocation must not recompress
# the arm64 DMG that was already uploaded.
export OPEN_COWORK_DMG_ARCH="$arch"

npx electron-builder --mac "dmg:${arch}" "dir:${arch}" --publish never
node scripts/verify-macos-arch.js "release/mac-${arch}" "$arch"
