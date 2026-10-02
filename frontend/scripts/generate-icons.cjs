// Native SVG artwork -> transparent mark and PWA PNGs. Run from the project root:
// node frontend/scripts/generate-icons.cjs
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

async function main() {
  const publicDir = path.resolve(__dirname, '../public')
  const master = await fs.readFile(path.join(publicDir, 'app_icon.svg'), 'utf8')
  const mark = master.replace(/\s*<rect id="app-tile"[^>]+\/>/, '')
    .replaceAll('#f0fffb', '#087f75').replaceAll('#82dfcf', '#087f75')
  await fs.writeFile(path.join(publicDir, 'icon.svg'), mark)
  const browser = await chromium.launch()
  try {
    for (const [name, size, maskable] of [
      ['icon-192.png', 192, false], ['icon-512.png', 512, false],
      ['apple-touch-icon.png', 180, false], ['icon-maskable-512.png', 512, true],
    ]) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
      await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${master}`)
      if (maskable) await page.evaluate(() => {
        document.querySelector('#app-tile').setAttribute('rx', '0')
        document.querySelector('#brand-mark').setAttribute('transform', 'translate(32 32) scale(.78) translate(-32 -32)')
      })
      await page.screenshot({ path: path.join(publicDir, 'icons', name), omitBackground: true })
      await page.close()
      console.log(`Rendered ${name} (${size} x ${size})`)
    }
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
