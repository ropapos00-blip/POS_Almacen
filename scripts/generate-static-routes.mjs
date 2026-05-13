import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const distDir = resolve(__dirname, '..', 'dist')
const sourceIndex = resolve(distDir, 'index.html')
const routerFile = resolve(__dirname, '..', 'src', 'app', 'router', 'index.tsx')

if (!existsSync(sourceIndex)) {
  console.error('[postbuild] No se encontro dist/index.html. Ejecuta el build antes de postbuild.')
  process.exit(1)
}

function readStaticRoutesFromRouter() {
  if (!existsSync(routerFile)) {
    console.error(`[postbuild] No se encontro el router en ${routerFile}.`)
    process.exit(1)
  }

  const routerSource = readFileSync(routerFile, 'utf8')
  const routePathMatches = routerSource.matchAll(/path:\s*'([^']+)'/g)
  const routes = new Set()

  for (const match of routePathMatches) {
    const rawPath = match[1]?.trim()
    if (!rawPath || rawPath === '/' || rawPath === '*') {
      continue
    }

    // Skip dynamic segments because they cannot be materialized as static files.
    if (rawPath.includes(':')) {
      continue
    }

    const normalized = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath
    if (!normalized) {
      continue
    }

    routes.add(normalized)
  }

  return Array.from(routes).sort()
}

const staticRoutes = readStaticRoutesFromRouter()

for (const route of staticRoutes) {
  const routeDir = resolve(distDir, route)
  mkdirSync(routeDir, { recursive: true })
  copyFileSync(sourceIndex, resolve(routeDir, 'index.html'))

  // Some static hosts map "/foo" to "/foo.html" (clean URLs) instead of "/foo/index.html".
  copyFileSync(sourceIndex, resolve(distDir, `${route}.html`))
}

// Fallback for hosts that serve 404.html for unknown SPA routes.
copyFileSync(sourceIndex, resolve(distDir, '404.html'))

console.log(`[postbuild] Rutas estaticas generadas: ${staticRoutes.length}`)
