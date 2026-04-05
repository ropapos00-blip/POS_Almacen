import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const distDir = resolve(__dirname, '..', 'dist')
const sourceIndex = resolve(distDir, 'index.html')

if (!existsSync(sourceIndex)) {
  console.error('[postbuild] No se encontro dist/index.html. Ejecuta el build antes de postbuild.')
  process.exit(1)
}

const staticRoutes = [
  'login',
  'dashboard',
  'pos',
  'catalog',
  'price-check',
  'inventory',
  'sales',
  'manual-invoices',
  'users',
]

for (const route of staticRoutes) {
  const routeDir = resolve(distDir, route)
  mkdirSync(routeDir, { recursive: true })
  copyFileSync(sourceIndex, resolve(routeDir, 'index.html'))
}

console.log(`[postbuild] Rutas estaticas generadas: ${staticRoutes.length}`)
