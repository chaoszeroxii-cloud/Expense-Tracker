# PWA Icons

`../app_icon.svg` is the **single master** — it is both the browser favicon
(`<link rel="icon">` in `index.html`) and the source these PNGs are rendered from.

The wallet and rising flow arrow stand for recording money and moving toward a goal.
The angular arrow uses mint against an ink-colored tile. `../icon.svg` is the transparent,
single-color mark derived from this master, used on the authentication screens.
The sidebar, favicon and installed app use the tile. Do not edit the derived files
independently.

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

Run `node frontend/scripts/generate-icons.cjs` from the repository root. The generator
renders the master SVG in Playwright, derives `../icon.svg`, and writes all four PNGs.
It uses a full-bleed tile and a centered 78% mark for the maskable variant.

Playwright is already a root development dependency. Install its browser with
`npx playwright install chromium` if needed. The generator uses isolated pages with
exact viewports and inline SVG, avoiding Chrome CLI's minimum window-size cropping.

After regenerating, **open every PNG and look at it.** Checking pixel dimensions is not
enough — the cropping failure above produces files whose dimensions are exactly right. Two
cheap automated checks: the corner pixel of the three `any` icons must be transparent
(alpha 0, the rounded-rect corner) and the corner of the maskable icon must be opaque
(alpha 255, full-bleed). A wrong-sized icon is also rejected by Chrome without it saying
which one was at fault.
