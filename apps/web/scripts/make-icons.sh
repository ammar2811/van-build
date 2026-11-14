#!/usr/bin/env bash
# Regenerate the app icons from the SVG sources. Needs rsvg-convert (librsvg).
set -euo pipefail
cd "$(dirname "$0")/../public"
rsvg-convert -w 192 -h 192 favicon.svg -o icons/icon-192.png
rsvg-convert -w 512 -h 512 favicon.svg -o icons/icon-512.png
rsvg-convert -w 512 -h 512 icons/icon.svg -o icons/maskable-512.png
rsvg-convert -w 180 -h 180 icons/icon.svg -o icons/apple-touch-icon.png
