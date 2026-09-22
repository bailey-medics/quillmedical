#!/bin/bash

# Build the Quill-branded notifier used by the Stop hook's banner.
#
# macOS takes a notification's icon from the bundle that sent it, and offers
# no API to override it per notification: terminal-notifier's own -appIcon was
# removed in 3.0.0 for exactly that reason. A custom icon therefore means a
# custom copy of the app, with its own bundle identifier. That identifier is
# what earns it a separate icon and, in consequence, its own entry in System
# Settings -> Notifications, where it must be allowed once before any banner
# appears.
#
# The result is a signed binary, so it is built on demand rather than
# committed. scripts/notification.sh falls back to `display notification`
# when it is absent, which works everywhere but shows the osascript icon.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGO="${QUILL_NOTIFY_LOGO:-$REPO_ROOT/frontend/public/quill-logo.png}"
DEST="${QUILL_NOTIFY_APP:-$HOME/Applications/quill-notifier.app}"
VERSION="3.1.0"
URL="https://github.com/julienXX/terminal-notifier/releases/download/${VERSION}/terminal-notifier-${VERSION}.zip"

if [ "$(uname -s)" != "Darwin" ]; then
    echo "This notifier is macOS-only; nothing to build." >&2
    exit 0
fi

[ -f "$LOGO" ] || { echo "Logo not found: $LOGO" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "Fetching terminal-notifier ${VERSION}..."
# The upstream release is a prebuilt, signed binary. Homebrew's formula
# compiles from source instead, which needs a full Xcode install; this does
# not.
curl -fsSL -o "$work/tn.zip" "$URL"
unzip -q "$work/tn.zip" -d "$work"
src="$work/terminal-notifier.app"
[ -d "$src" ] || { echo "Unexpected archive layout" >&2; exit 1; }

echo "Preparing the icon..."
# Flatten onto white and inset the artwork: the logo is a transparent PNG
# whose quill runs nearly edge to edge, and macOS rounds the corners of a
# notification icon, which would clip the tips.
python3 - "$LOGO" "$work/icon.png" <<'PY'
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")

ink = im.crop(im.getbbox())
size, margin = 1024, 0.16
target = int(size * (1 - 2 * margin))
scale = min(target / ink.width, target / ink.height)
ink = ink.resize(
    (max(1, int(ink.width * scale)), max(1, int(ink.height * scale))),
    Image.LANCZOS,
)

canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
canvas.alpha_composite(ink, ((size - ink.width) // 2, (size - ink.height) // 2))
canvas.convert("RGB").save(out)
PY

iconset="$work/Quill.iconset"
mkdir -p "$iconset"
for s in 16 32 128 256 512; do
    sips -z "$s" "$s" "$work/icon.png" \
        --out "$iconset/icon_${s}x${s}.png" >/dev/null
    sips -z "$((s * 2))" "$((s * 2))" "$work/icon.png" \
        --out "$iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$work/Quill.icns"

echo "Assembling the bundle..."
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R "$src" "$DEST"
cp "$work/Quill.icns" "$DEST/Contents/Resources/Quill.icns"
rm -f "$DEST/Contents/Resources/Terminal.icns"

plist="$DEST/Contents/Info.plist"
pb=/usr/libexec/PlistBuddy
"$pb" -c "Set :CFBundleIdentifier fr.julienxx.oss.terminal-notifier.quill" "$plist"
"$pb" -c "Set :CFBundleIconFile Quill" "$plist" 2>/dev/null \
    || "$pb" -c "Add :CFBundleIconFile string Quill" "$plist"
"$pb" -c "Set :CFBundleName Quill" "$plist" 2>/dev/null || true
"$pb" -c "Set :CFBundleDisplayName Quill" "$plist" 2>/dev/null \
    || "$pb" -c "Add :CFBundleDisplayName string Quill" "$plist"

# Editing the bundle invalidates the upstream signature; ad-hoc re-sign so
# macOS will run it. Also drop the quarantine flag the download carries.
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
codesign --force --deep -s - "$DEST" >/dev/null 2>&1

lsregister=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$lsregister" -f "$DEST" || true

echo
echo "Built $DEST"
echo
echo "Allow it to notify once, then banners carry the Quill icon:"
echo "  System Settings -> Notifications -> Quill"
echo
echo "Sending a test banner now..."
"$DEST/Contents/MacOS/terminal-notifier" \
    -title "Quill" \
    -message "Notifier installed. Banners will look like this." \
    -sound Glass >/dev/null 2>&1 || true
