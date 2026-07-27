# PWA Icons

`icon.svg` is the master. The PNGs beside it are **committed** — the manifest references
them directly, and Chrome refuses to offer "Add to Home Screen" if any are missing.

| File | Size | Purpose |
|---|---|---|
| `icon-192.png` | 192×192 | manifest `purpose: any` |
| `icon-512.png` | 512×512 | manifest `purpose: any` |
| `icon-maskable-512.png` | 512×512 | manifest `purpose: maskable` — full-bleed brand background, artwork at 78% so it survives Android's circle mask |
| `apple-touch-icon.png` | 180×180 | iOS home screen (`<link rel="apple-touch-icon">` in `index.html`) |

A maskable icon may not reuse the `any` artwork: Android crops to a circle of 80% diameter,
which clips the rounded-rect background. That is why it is a separate file.

## Regenerating

Headless Chrome needs no extra dependency and is the path used to produce the current files:

```bash
# Wrap the SVG in a page with `html,body{margin:0}` and `svg{width:100vw;height:100vh}`,
# then screenshot at each size.
chrome --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --default-background-color=00000000 \
  --screenshot=icon-192.png --window-size=192,192 file:///abs/path/icon.html
```

Alternatives if installed: `npx sharp-cli --input icon.svg --output icon-192.png --resize 192`,
`inkscape icon.svg -w 192 -h 192 -o icon-192.png`, or https://realfavicongenerator.net.

After regenerating, **verify the pixel dimensions match the filenames** — a silent resize
failure still writes a valid PNG, just at the wrong size, and Chrome rejects the manifest
without saying which icon was wrong.
