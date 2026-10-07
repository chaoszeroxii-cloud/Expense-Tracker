import catalogUrls from 'virtual:mdi-catalog'

// Keep the accepted syntax aligned with backend/common/icon.util.ts.
export function mdiExportName(icon: string): string | null {
  const value = icon.trim()
  if (value.length > 50) return null
  if (/^mdi[A-Z0-9][A-Za-z0-9]*$/.test(value)) return value
  const name = value.replace(/^mdi[:-]/, '')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return null
  return 'mdi' + name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('')
}

const loaded = new Map<string, Record<string, string>>()
const pending = new Map<string, Promise<Record<string, string>>>()

async function fetchGroup(key: string): Promise<Record<string, string>> {
  if (!Object.prototype.hasOwnProperty.call(catalogUrls, key)) return {}
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(catalogUrls[key], { credentials: 'omit', signal: controller.signal })
    if (!response.ok) throw new Error('icon_catalog_unavailable')
    const group = await response.json()
    if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error('icon_catalog_invalid')
    return group
  } finally { clearTimeout(timeout) }
}

export function cachedMdiPath(icon: string): string | null {
  const name = mdiExportName(icon)
  if (!name) return null
  const group = loaded.get(name[3].toLowerCase())
  return group && Object.prototype.hasOwnProperty.call(group, name) && typeof group[name] === 'string' ? group[name] : null
}

export async function loadMdiPath(icon: string): Promise<string | null> {
  const name = mdiExportName(icon)
  if (!name) return null
  const key = name[3].toLowerCase()
  if (!loaded.has(key)) {
    if (!pending.has(key)) {
      pending.set(key, fetchGroup(key).then(group => {
        loaded.set(key, group)
        return group
      }).finally(() => pending.delete(key)))
    }
    await pending.get(key)
  }
  return cachedMdiPath(name)
}
