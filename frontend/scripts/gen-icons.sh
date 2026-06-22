#!/usr/bin/env bash
# Regenerate the PWA app icons from public/emergent-logo.jpeg (macOS, uses sips).
# The generated PNGs are committed, so this only needs to run when the logo changes.
set -euo pipefail
cd "$(dirname "$0")/../public"

BG="0B0F14"   # brand background for the maskable safe-area padding

sips -s format png -z 192 192 emergent-logo.jpeg --out icon-192.png >/dev/null
sips -s format png -z 512 512 emergent-logo.jpeg --out icon-512.png >/dev/null
sips -s format png -z 180 180 emergent-logo.jpeg --out apple-touch-icon.png >/dev/null
sips -s format png -z 64  64  emergent-logo.jpeg --out favicon-64.png >/dev/null

# Maskable: shrink to ~80% then pad back to 512 on the brand background so the
# circular Android mask never clips the logo.
sips -s format png -z 410 410 emergent-logo.jpeg --out _mask_tmp.png >/dev/null
sips _mask_tmp.png --padToHeightWidth 512 512 --padColor "$BG" --out icon-512-maskable.png >/dev/null
rm -f _mask_tmp.png

echo "Icons regenerated: icon-192, icon-512, icon-512-maskable, apple-touch-icon, favicon-64"
