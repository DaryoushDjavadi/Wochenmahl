import type { AppSettings, Recipe, User, WeekPlan, WeekSlot } from '../types'

export const USERS: Record<'darius' | 'wendy', User> = {
  darius: {
    id: 'darius',
    name: 'Darius',
    short: 'D',
    color: '#2f6f4e',
  },
  wendy: {
    id: 'wendy',
    name: 'Wendy',
    short: 'W',
    color: '#b85c38',
  },
}

export const WEEKDAYS = [
  { id: 'mo', label: 'Mo' },
  { id: 'di', label: 'Di' },
  { id: 'mi', label: 'Mi' },
  { id: 'do', label: 'Do' },
  { id: 'fr', label: 'Fr' },
  { id: 'sa', label: 'Sa' },
  { id: 'so', label: 'So' },
] as const

export const SEED_RECIPES: Recipe[] = [
  {
    id: 'r-rice',
    title: 'Reis',
    kind: 'base',
    tags: ['basis', 'oft'],
    ingredients: [
      { name: 'Reis', amount: '300g' },
      { name: 'Salz', amount: '1 Prise' },
    ],
    notes: 'Klassiker-Basis — Beilage jedes Mal neu pitchen.',
    createdBy: 'darius',
    createdAt: '2026-08-01T09:00:00.000Z',
  },
  {
    id: 'r-noodles',
    title: 'Nudeln',
    kind: 'base',
    tags: ['basis', 'schnell'],
    ingredients: [
      { name: 'Spaghetti', amount: '400g' },
      { name: 'Salz', amount: '1 EL' },
    ],
    notes: 'Als Basis mit Soße oder Gemüse kombinieren.',
    createdBy: 'wendy',
    createdAt: '2026-08-01T09:02:00.000Z',
  },
  {
    id: 'r-side-potato',
    title: 'Bratkartoffeln',
    kind: 'side',
    tags: ['beilage', 'ofen'],
    ingredients: [
      { name: 'Kartoffeln', amount: '800g' },
      { name: 'Zwiebel', amount: '1' },
      { name: 'Öl', amount: '2 EL' },
    ],
    createdBy: 'wendy',
    createdAt: '2026-08-01T09:05:00.000Z',
  },
  {
    id: 'r-side-salad',
    title: 'Tomaten-Gurken-Salat mit Joghurt',
    kind: 'side',
    tags: ['beilage', 'frisch'],
    ingredients: [
      { name: 'Gurke', amount: '1' },
      { name: 'Tomaten', amount: '3' },
      { name: 'Joghurt', amount: '200g' },
      { name: 'Knoblauch', amount: '1 Zehe' },
      { name: 'Salz', amount: '1 Prise' },
    ],
    createdBy: 'wendy',
    createdAt: '2026-08-01T09:10:00.000Z',
  },
  {
    id: 'r-side-dal',
    title: 'Linsen-Dal',
    kind: 'side',
    tags: ['beilage', 'vegan'],
    ingredients: [
      { name: 'Rote Linsen', amount: '200g' },
      { name: 'Kokosmilch', amount: '200ml' },
      { name: 'Currypulver', amount: '1 TL' },
      { name: 'Zwiebel', amount: '1' },
    ],
    createdBy: 'darius',
    createdAt: '2026-08-01T09:15:00.000Z',
  },
  {
    id: 'r-side-tzatziki',
    title: 'Tzatziki',
    kind: 'side',
    tags: ['beilage', 'kalt'],
    ingredients: [
      { name: 'Joghurt', amount: '400g' },
      { name: 'Gurke', amount: '1' },
      { name: 'Knoblauch', amount: '2 Zehen' },
      { name: 'Dill', amount: '1 Bund' },
    ],
    createdBy: 'darius',
    createdAt: '2026-08-01T09:18:00.000Z',
  },
  {
    id: 'r-pasta',
    title: 'One-Pot Pasta Arrabbiata',
    kind: 'meal',
    tags: ['schnell', 'vegetarisch'],
    ingredients: [
      { name: 'Penne', amount: '400g' },
      { name: 'Tomaten passiert', amount: '500g' },
      { name: 'Knoblauch', amount: '3 Zehen' },
      { name: 'Chili', amount: '1' },
      { name: 'Olivenöl', amount: '2 EL' },
      { name: 'Basilikum', amount: '1 Bund' },
    ],
    notes: 'Alles in einem Topf, 15 Minuten.',
    createdBy: 'darius',
    createdAt: '2026-08-01T10:00:00.000Z',
  },
  {
    id: 'r-bowl',
    title: 'Halloumi Bowl',
    kind: 'meal',
    tags: ['bowl', 'vegetarisch'],
    ingredients: [
      { name: 'Halloumi', amount: '200g' },
      { name: 'Quinoa', amount: '150g' },
      { name: 'Gurke', amount: '1' },
      { name: 'Kirschtomaten', amount: '200g' },
      { name: 'Hummus', amount: '1 Glas' },
      { name: 'Zitrone', amount: '1' },
    ],
    createdBy: 'wendy',
    createdAt: '2026-08-02T10:00:00.000Z',
  },
  {
    id: 'r-curry',
    title: 'Kokos-Kichererbsen-Curry',
    kind: 'meal',
    tags: ['cookidoo', 'vegan'],
    ingredients: [
      { name: 'Kichererbsen', amount: '1 Dose' },
      { name: 'Kokosmilch', amount: '400ml' },
      { name: 'Currypaste', amount: '2 EL' },
      { name: 'Spinat', amount: '200g' },
      { name: 'Zwiebel', amount: '1' },
      { name: 'Reis', amount: '250g' },
    ],
    cookidooUrl: 'https://cookidoo.de/recipes/recipe/de-DE/r59322',
    cookidooId: 'r59322',
    notes: 'Beispiel-Cookidoo-Rezept (Link zum Testen).',
    createdBy: 'wendy',
    createdAt: '2026-08-03T10:00:00.000Z',
  },
  {
    id: 'r-sheet',
    title: 'Ofengemüse mit Feta',
    kind: 'meal',
    tags: ['ofen', 'wenig Abwasch'],
    ingredients: [
      { name: 'Zucchini', amount: '2' },
      { name: 'Paprika', amount: '2' },
      { name: 'Süßkartoffel', amount: '1' },
      { name: 'Feta', amount: '200g' },
      { name: 'Olivenöl', amount: '3 EL' },
      { name: 'Oregano', amount: '1 TL' },
    ],
    createdBy: 'darius',
    createdAt: '2026-08-04T10:00:00.000Z',
  },
  {
    id: 'r-soup',
    title: 'Kürbissuppe',
    kind: 'meal',
    tags: ['suppe', 'herbst'],
    ingredients: [
      { name: 'Hokkaido', amount: '1' },
      { name: 'Zwiebel', amount: '1' },
      { name: 'Gemüsebrühe', amount: '750ml' },
      { name: 'Sahne', amount: '100ml' },
      { name: 'Ingwer', amount: '20g' },
    ],
    createdBy: 'wendy',
    createdAt: '2026-08-05T10:00:00.000Z',
  },
  {
    id: 'r-tacos',
    title: 'Gemüse-Tacos',
    kind: 'meal',
    tags: ['mexikanisch', 'freitag'],
    ingredients: [
      { name: 'Tortillas', amount: '8' },
      { name: 'Paprika', amount: '2' },
      { name: 'Mais', amount: '1 Dose' },
      { name: 'Avocado', amount: '2' },
      { name: 'Limette', amount: '1' },
      { name: 'Käse', amount: '150g' },
    ],
    createdBy: 'darius',
    createdAt: '2026-08-06T10:00:00.000Z',
  },
]

export function mealLabel(
  main?: string | null,
  side?: string | null,
): string {
  const a = (main || '').trim()
  const b = (side || '').trim()
  if (a && b) {
    // Avoid "Reis + Salat + Salat" if main already includes the side.
    if (a === b || a.endsWith(` + ${b}`) || a.includes(` + ${b}`)) return a
    return `${a} + ${b}`
  }
  return a || b || 'Gericht'
}

/** Resolve display title for a week slot without double-appending sides. */
export function slotMealLabel(
  slot: Pick<WeekSlot, 'recipeId' | 'title' | 'sideRecipeId' | 'sideTitle'>,
  recipes: Recipe[],
): string {
  const recipe = recipes.find((r) => r.id === slot.recipeId)
  const sideRecipe = recipes.find((r) => r.id === slot.sideRecipeId)
  const side = (slot.sideTitle || sideRecipe?.title || '').trim()
  let main = (recipe?.title || slot.title || '').trim()
  if (side && main.endsWith(` + ${side}`)) {
    main = main.slice(0, -(side.length + 3)).trim()
  }
  return mealLabel(main || recipe?.title, side)
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  return x
}

/** Monday of the week that contains `date` (ISO week, Mo–So). */
export function mondayOf(date: Date): Date {
  const d = startOfDay(date)
  const day = d.getDay() // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function weekIdFromMonday(monday: Date): string {
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  const day = String(monday.getDate()).padStart(2, '0')
  return `week-${y}-${m}-${day}`
}

export function weekLabelFromMonday(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
  return `${fmt(monday)} – ${fmt(sunday)}`
}

export function parseWeekMonday(weekId: string): Date | null {
  const m = /^week-(\d{4})-(\d{2})-(\d{2})$/.exec(weekId)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  return Number.isNaN(d.getTime()) ? null : mondayOf(d)
}

export function createWeekForMonday(mondayInput: Date): WeekPlan {
  const monday = mondayOf(mondayInput)
  return {
    id: weekIdFromMonday(monday),
    label: weekLabelFromMonday(monday),
    status: 'pitching',
    slots: WEEKDAYS.map((d) => ({ day: d.id })),
    createdAt: new Date().toISOString(),
  }
}

function nextMonday(): Date {
  const now = startOfDay(new Date())
  const day = now.getDay()
  const diff = day === 0 ? 1 : 8 - day
  now.setDate(now.getDate() + diff)
  return now
}

export function createFreshWeek(): WeekPlan {
  return createWeekForMonday(nextMonday())
}

export const SEED_WEEK: WeekPlan = createFreshWeek()

export const DEFAULT_SETTINGS: AppSettings = {
  bring: {
    enabled: false,
    linked: false,
    email: '',
    listName: 'Einkaufen',
    listUuid: '',
    userUuid: '',
    accessToken: '',
    refreshToken: '',
    accountName: '',
    lists: [],
  },
  cookidoo: {
    enabled: false,
    linked: false,
    email: '',
    country: 'de',
    accessToken: '',
    refreshToken: '',
    language: 'de-DE',
    suggestions: [],
  },
}
