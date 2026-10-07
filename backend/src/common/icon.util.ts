import * as mdiCatalog from '@mdi/js'

export const MDI_ICON_IDS = [
  'food',
  'transport',
  'shopping',
  'health',
  'entertainment',
  'utilities',
  'housing',
  'education',
  'other',
  'coffee',
  'travel',
  'music',
  'pets',
  'beauty',
  'fitness',
  'restaurant',
  'movies',
  'medical',
  'tools',
  'groceries',
  'salary',
  'freelance',
  'investment',
  'otherincome',
  'cash',
  'gift',
  'bonus',
  'rewards',
  'global',
  'bank',
  'target',
  'party',
  'wallet',
  'gardening',
] as const

export type MdiIconId = (typeof MDI_ICON_IDS)[number]

const MDI_ICON_ID_SET = new Set<string>(MDI_ICON_IDS)

// Accept legacy clients and rows, but never persist the emoji itself again.
const LEGACY_ICON_IDS: Record<string, MdiIconId> = {
  '🍜': 'food',
  '🚗': 'transport',
  '🛍️': 'shopping',
  '💊': 'health',
  '🎮': 'entertainment',
  '💡': 'utilities',
  '🏠': 'housing',
  '📚': 'education',
  '📦': 'other',
  '☕': 'coffee',
  '✈️': 'travel',
  '🎵': 'music',
  '🐾': 'pets',
  '💇': 'beauty',
  '🏋️': 'fitness',
  '🍽️': 'restaurant',
  '🎬': 'movies',
  '🏥': 'medical',
  '💼': 'salary',
  '💻': 'freelance',
  '📈': 'investment',
  '💰': 'cash',
  '🎁': 'gift',
  '🏆': 'bonus',
  '💎': 'rewards',
  '🌐': 'global',
  '🏦': 'bank',
  '🎯': 'target',
  '🍚': 'food',
  '🎉': 'party',
}

/** Accept MDI website names and JS export names; never SVG, HTML or URLs. */
export function mdiExportName(icon: string): string | null {
  const value = icon.trim()
  if (value.length > 50) return null
  if (/^mdi[A-Z0-9][A-Za-z0-9]*$/.test(value)) return value
  const name = value.replace(/^mdi[:-]/, '')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return null
  return 'mdi' + name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('')
}

export function resolveMdiIconId(icon: unknown): string | null {
  if (typeof icon !== 'string') return null
  const value = icon.trim()
  if (Object.prototype.hasOwnProperty.call(LEGACY_ICON_IDS, value)) return LEGACY_ICON_IDS[value]
  if (MDI_ICON_ID_SET.has(value)) return value
  const name = mdiExportName(value)
  return name && Object.prototype.hasOwnProperty.call(mdiCatalog, name) ? name : null
}

export function normalizeMdiIconId(icon: unknown, fallback: MdiIconId): string {
  return resolveMdiIconId(icon) ?? fallback
}
