import {
  mdiFood, mdiCar, mdiShopping, mdiPill, mdiGamepad, mdiLightbulb,
  mdiHome, mdiBook, mdiPackageVariant, mdiCoffee, mdiAirplane, mdiMusic,
  mdiPaw, mdiHairDryer, mdiBriefcase, mdiLaptop, mdiChartLine, mdiCash,
  mdiGiftOpen, mdiTrophy, mdiGift, mdiEarth, mdiTrendingUp, mdiWallet,
  mdiDumbbell, mdiChefHat, mdiFilm, mdiHeartPulse, mdiStethoscope,
  mdiTools, mdiApple, mdiPalette,
} from '@mdi/js'

// Legacy emoji to MDI mapping (for backward compatibility with existing data)
export const EMOJI_TO_MDI_MAP: Record<string, string> = {
  '🍜': mdiFood,
  '🚗': mdiCar,
  '🛍️': mdiShopping,
  '💊': mdiPill,
  '🎮': mdiGamepad,
  '💡': mdiLightbulb,
  '🏠': mdiHome,
  '📚': mdiBook,
  '📦': mdiPackageVariant,
  '☕': mdiCoffee,
  '✈️': mdiAirplane,
  '🎵': mdiMusic,
  '🐾': mdiPaw,
  '💇': mdiHairDryer,
  '💼': mdiBriefcase,
  '💻': mdiLaptop,
  '📈': mdiChartLine,
  '💰': mdiCash,
  '🎁': mdiGift,
  '🏆': mdiTrophy,
  '💎': mdiGift,
  '🌐': mdiEarth,
}

// MDI icons by name (primary mapping)
export const MDI_ICON_MAP: Record<string, string> = {
  // Expense icons
  food: mdiFood,
  transport: mdiCar,
  shopping: mdiShopping,
  health: mdiPill,
  entertainment: mdiGamepad,
  utilities: mdiLightbulb,
  housing: mdiHome,
  education: mdiBook,
  other: mdiPackageVariant,
  coffee: mdiCoffee,
  travel: mdiAirplane,
  music: mdiMusic,
  pets: mdiPaw,
  beauty: mdiHairDryer,
  fitness: mdiDumbbell,
  restaurant: mdiChefHat,
  movies: mdiFilm,
  medical: mdiStethoscope,
  tools: mdiTools,
  groceries: mdiApple,
  // Income icons
  salary: mdiBriefcase,
  freelance: mdiLaptop,
  investment: mdiChartLine,
  otherincome: mdiCash,
  cash: mdiCash,
  gift: mdiGift,
  bonus: mdiTrophy,
  rewards: mdiGift,
  global: mdiEarth,
}

export const MDI_ICON_CATEGORIES = {
  expense: [
    { id: 'food', mdi: mdiFood, label: 'Food' },
    { id: 'transport', mdi: mdiCar, label: 'Transport' },
    { id: 'shopping', mdi: mdiShopping, label: 'Shopping' },
    { id: 'health', mdi: mdiPill, label: 'Health' },
    { id: 'entertainment', mdi: mdiGamepad, label: 'Entertainment' },
    { id: 'utilities', mdi: mdiLightbulb, label: 'Utilities' },
    { id: 'housing', mdi: mdiHome, label: 'Housing' },
    { id: 'education', mdi: mdiBook, label: 'Education' },
    { id: 'other', mdi: mdiPackageVariant, label: 'Other' },
    { id: 'coffee', mdi: mdiCoffee, label: 'Coffee' },
    { id: 'travel', mdi: mdiAirplane, label: 'Travel' },
    { id: 'music', mdi: mdiMusic, label: 'Music' },
    { id: 'pets', mdi: mdiPaw, label: 'Pets' },
    { id: 'beauty', mdi: mdiHairDryer, label: 'Beauty' },
    { id: 'fitness', mdi: mdiDumbbell, label: 'Fitness' },
    { id: 'restaurant', mdi: mdiChefHat, label: 'Restaurant' },
    { id: 'movies', mdi: mdiFilm, label: 'Movies' },
    { id: 'medical', mdi: mdiStethoscope, label: 'Medical' },
  ],
  income: [
    { id: 'salary', mdi: mdiBriefcase, label: 'Salary' },
    { id: 'freelance', mdi: mdiLaptop, label: 'Freelance' },
    { id: 'investment', mdi: mdiChartLine, label: 'Investment' },
    { id: 'otherincome', mdi: mdiCash, label: 'Other Income' },
    { id: 'gift', mdi: mdiGift, label: 'Gift' },
    { id: 'bonus', mdi: mdiTrophy, label: 'Bonus' },
    { id: 'rewards', mdi: mdiGift, label: 'Rewards' },
    { id: 'global', mdi: mdiEarth, label: 'Global' },
  ],
}

// Wallet/Allocation preset icons
export const ALLOCATION_ICONS = [
  { id: 'salary', mdi: mdiBriefcase, label: 'Work' },
  { id: 'food', mdi: mdiFood, label: 'Food' },
  { id: 'housing', mdi: mdiHome, label: 'Housing' },
  { id: 'travel', mdi: mdiAirplane, label: 'Travel' },
  { id: 'education', mdi: mdiBook, label: 'Education' },
  { id: 'health', mdi: mdiPill, label: 'Health' },
  { id: 'entertainment', mdi: mdiGamepad, label: 'Entertainment' },
  { id: 'fitness', mdi: mdiDumbbell, label: 'Fitness' },
  { id: 'pets', mdi: mdiPaw, label: 'Pets' },
  { id: 'coffee', mdi: mdiCoffee, label: 'Coffee' },
  { id: 'music', mdi: mdiMusic, label: 'Music' },
  { id: 'gardening', mdi: mdiApple, label: 'Garden' },
  { id: 'shopping', mdi: mdiShopping, label: 'Shopping' },
  { id: 'cash', mdi: mdiCash, label: 'Cash' },
]

export function getMdiIconPath(iconId: string): string {
  // Support both new format (icon names) and old format (emojis)
  return MDI_ICON_MAP[iconId] || EMOJI_TO_MDI_MAP[iconId] || mdiPackageVariant
}

export function getIconLabel(iconId: string): string {
  // Find icon label from categories
  const allIcons = [...MDI_ICON_CATEGORIES.expense, ...MDI_ICON_CATEGORIES.income, ...ALLOCATION_ICONS]
  return allIcons.find(i => i.id === iconId)?.label || 'Icon'
}
