// Genererar app-ikoner (PNG + ICO) från en inbäddad SVG-logo.
// Körs vid behov: `node scripts/gen-icon.mjs`. Resultatet checkas in i build/.
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { mkdir, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'build')

// Codester-logo: rundad kvadrat med gradient + ett "</>"-tecken och en
// liten "branch"-prick som anspelar på git.
const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1f9cf0"/>
      <stop offset="1" stop-color="#0e639c"/>
    </linearGradient>
  </defs>
  <rect x="40" y="40" width="432" height="432" rx="96" fill="url(#g)"/>
  <g fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="196,196 140,256 196,316"/>
    <polyline points="316,196 372,256 316,316"/>
    <line x1="284" y1="172" x2="228" y2="340"/>
  </g>
  <circle cx="256" cy="256" r="0" fill="#ffffff"/>
</svg>`

async function main() {
  await mkdir(outDir, { recursive: true })
  const svgBuf = Buffer.from(svg)

  // 512px PNG (används av Linux/övrigt och som källa)
  const png512 = await sharp(svgBuf).resize(512, 512).png().toBuffer()
  await writeFile(join(outDir, 'icon.png'), png512)

  // Flera storlekar för en skarp .ico (Windows)
  const sizes = [256, 128, 64, 48, 32, 16]
  const pngs = await Promise.all(
    sizes.map((s) => sharp(svgBuf).resize(s, s).png().toBuffer())
  )
  const ico = await pngToIco(pngs)
  await writeFile(join(outDir, 'icon.ico'), ico)

  console.log('Skapade build/icon.png och build/icon.ico')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
