# Generating PWA Icons

The file `public/icons/icon.svg` is the master icon.
Run one of the following to generate the required PNG sizes:

## Option A — Using sharp-cli (recommended)
```bash
npx sharp-cli --input public/icons/icon.svg \
  --output public/icons/icon-192.png --resize 192
npx sharp-cli --input public/icons/icon.svg \
  --output public/icons/icon-512.png --resize 512
```

## Option B — Using Inkscape
```bash
inkscape public/icons/icon.svg -w 192 -h 192 -o public/icons/icon-192.png
inkscape public/icons/icon.svg -w 512 -h 512 -o public/icons/icon-512.png
```

## Option C — Online tool
Upload `icon.svg` to https://realfavicongenerator.net and download the package.
Copy `android-chrome-192x192.png` → `public/icons/icon-192.png`
Copy `android-chrome-512x512.png` → `public/icons/icon-512.png`
