# PWA Icons

`../app_icon.svg` is the **single master** — it is both the browser favicon
(`<link rel="icon">` in `index.html`) and the source these PNGs are rendered from.

There used to be a second master in this folder (`icon.svg`) holding different artwork.
Nothing kept the two in sync, so the tab showed one logo while the installed home-screen
app showed another. Do not reintroduce a local copy; render from `../app_icon.svg`.

| File | Size | Purpose |
|---|---|---|
| `icon-192.png` | 192×192 | manifest `purpose: any`; also the push notification icon/badge (`src/sw.ts`) |
| `icon-512.png` | 512×512 | manifest `purpose: any` |
| `icon-maskable-512.png` | 512×512 | manifest `purpose: maskable` — full-bleed brand background, artwork at 78% so it survives Android's circle mask |
| `apple-touch-icon.png` | 180×180 | iOS home screen (`<link rel="apple-touch-icon">` in `index.html`) |

The PNGs are **committed**: the manifest references them directly, and Chrome refuses to
offer "Add to Home Screen" if any are missing.

A maskable icon may not reuse the `any` artwork: Android crops to a circle of 80% diameter,
which clips the rounded-rect background. That is why it is a separate file, built from a
variant SVG whose background is a full-bleed `<rect>` and whose glyph is scaled to 78%
about the centre.

## Regenerating

Headless Chrome needs no extra dependency and is the path used to produce the current files.
Three traps, all of which fail silently:

1. **Give every invocation its own `--user-data-dir`.** Without it Chrome attaches to an
   already-running instance and exits without writing a screenshot at all.
2. **Never screenshot below ~500px.** Chrome clamps the window to a minimum width, so
   `--window-size=192,192` renders a *larger* viewport and crops it to 192×192 — you get a
   correctly-sized PNG containing a zoomed corner of the artwork. Render one master at
   1024×1024 and downscale to 192 / 180 / 512 with a bicubic resize instead.
3. **Inline the SVG in the render page.** Pointing an `<img>` at the SVG (especially with a
   script-assigned `src`) races the screenshot and yields the same crop symptom.

```bash
# One master per variant, well above the minimum window width.
chrome --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --default-background-color=00000000 --no-first-run --user-data-dir="$(mktemp -d)" \
  --virtual-time-budget=5000 \
  --screenshot=master-any.png --window-size=1024,1024 \
  "file:///abs/path/render-any.html"
# …then downscale master-any.png to 512 / 192 / 180 and master-maskable.png to 512.
```

Alternatives if installed, which avoid all three traps:
`npx sharp-cli --input ../app_icon.svg --output icon-192.png --resize 192`,
`inkscape ../app_icon.svg -w 192 -h 192 -o icon-192.png`, or https://realfavicongenerator.net.

After regenerating, **open every PNG and look at it.** Checking pixel dimensions is not
enough — the cropping failure above produces files whose dimensions are exactly right. Two
cheap automated checks: the corner pixel of the three `any` icons must be transparent
(alpha 0, the rounded-rect corner) and the corner of the maskable icon must be opaque
(alpha 255, full-bleed). A wrong-sized icon is also rejected by Chrome without it saying
which one was at fault.
