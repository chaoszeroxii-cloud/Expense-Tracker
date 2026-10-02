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

export function normalizeMdiIconId(
  icon: unknown,
  fallback: MdiIconId,
): MdiIconId {
  if (typeof icon !== 'string') return fallback

  const value = icon.trim()
  const legacyId = LEGACY_ICON_IDS[value]
  if (legacyId) return legacyId
  return MDI_ICON_ID_SET.has(value) ? value as MdiIconId : fallback
}
