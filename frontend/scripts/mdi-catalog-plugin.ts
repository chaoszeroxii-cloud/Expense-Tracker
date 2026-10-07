import type { Plugin } from 'vite'
import { createRequire } from 'node:module'

/** Emit trusted JSON groups; fetch can retry after a transient failure, unlike failed ESM imports. */
export function mdiCatalogPlugin(): Plugin {
  const require = createRequire(import.meta.url)
  const catalog = require('@mdi/js') as Record<string, string>
  const groups = new Map<string, Record<string, string>>()
  for (const [name, path] of Object.entries(catalog)) {
    if (!/^mdi[A-Z0-9][A-Za-z0-9]*$/.test(name) || typeof path !== 'string') continue
    const key = name[3].toLowerCase()
    if (!groups.has(key)) groups.set(key, {})
    groups.get(key)![name] = path
  }
  const prefix = 'virtual:mdi-catalog'
  let development = false, base = '/'
  return {
    name: 'moneyflow-mdi-catalog',
    configResolved(config) { development = config.command === 'serve'; base = config.base },
    configureServer(server) {
      server.middlewares.use(base + '__mdi/', (req, res, next) => {
        const key = req.url?.match(/^\/?([a-z])\.json$/)?.[1]
        if (!key || !groups.has(key)) return next()
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(groups.get(key)))
      })
    },
    resolveId(id) {
      if (id === prefix) return '\0' + id
    },
    load(id) {
      if (id === '\0' + prefix) {
        return 'export default {' + [...groups].map(([key, group]) => {
          const url = development ? JSON.stringify(base + '__mdi/' + key + '.json')
            : 'import.meta.ROLLUP_FILE_URL_' + this.emitFile({ type: 'asset', name: `mdi-${key}.json`, source: JSON.stringify(group) })
          return `${JSON.stringify(key)}:${url}`
        }).join(',') + '}'
      }
    },
  }
}
