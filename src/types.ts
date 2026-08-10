export type UserId = 'darius' | 'wendy'

export interface User {
  id: UserId
  name: string
  short: string
  color: string
  /** Optional emoji avatar (from settings.profiles). */
  emoji?: string
}

export interface UserProfile {
  name: string
  emoji: string
}

export interface Ingredient {
  name: string
  amount?: string
}

export type BuiltinRecipeCategory =
  | 'main'
  | 'soup'
  | 'salad'
  | 'side'
  | 'base'
  | 'breakfast'
  | 'dessert'
  | 'snack'
  | 'drink'
  | 'other'

/** Builtin id or custom id from settings.customCategories */
export type RecipeCategory = BuiltinRecipeCategory | (string & {})

export interface CustomRecipeCategory {
  id: string
  label: string
  hint?: string
  /** How the category behaves in week pairing (default meal). */
  kind?: 'meal' | 'base' | 'side'
}

export interface Recipe {
  id: string
  title: string
  /** meal = full dish, base = e.g. rice, side = beilage (for week pairing) */
  kind: 'meal' | 'base' | 'side'
  /** Browse / filter category (Hauptspeise, Dessert, …) */
  category?: RecipeCategory
  tags: string[]
  ingredients: Ingredient[]
  notes?: string
  cookidooUrl?: string
  cookidooId?: string
  createdBy: UserId
  createdAt: string
}

export interface Pitch {
  id: string
  weekId: string
  recipeId?: string
  /** Optional side dish paired with a base (or any main) */
  sideRecipeId?: string
  sideTitle?: string
  title: string
  note: string
  pitchedBy: UserId
  reactions: Partial<Record<UserId, 'yes' | 'maybe' | 'no'>>
  createdAt: string
  /** Recipe created from this pitch into the library (free main) */
  poolRecipeId?: string
  /** Side recipe created from this pitch into the library (free side) */
  poolSideRecipeId?: string
}

export type Weekday = 'mo' | 'di' | 'mi' | 'do' | 'fr' | 'sa' | 'so'

/** Editable shopping-list row after the week is locked */
export interface ShoppingItem {
  id: string
  name: string
  amount?: string
  /** Recipe / dish this ingredient comes from */
  dish: string
  day?: Weekday
  /** Already pushed to Bring for this week (delta tracking) */
  bringSent?: boolean
  /** Already at home — shown as „Auf Lager“, skipped for Bring */
  inStock?: boolean
}

export interface WeekMeal {
  id: string
  recipeId?: string
  title?: string
  sideRecipeId?: string
  sideTitle?: string
  fromPitchId?: string
  /** Per-user emoji reaction for this planned meal (synced via household). */
  emotes?: Partial<Record<UserId, MealEmote>>
  /**
   * Ingredients already at home — not added to Bring.
   * Keys via ingredientStockKey('main'|'side', name).
   */
  stockKeys?: string[]
}

/** Fixed set of meal reactions — both users see each other's pick. */
export const MEAL_EMOTES = ['😍', '🔥', '😋', '👍', '❤️', '🤩', '🤤'] as const
export type MealEmote = (typeof MEAL_EMOTES)[number]

export function isMealEmote(value: unknown): value is MealEmote {
  return (
    typeof value === 'string' &&
    (MEAL_EMOTES as readonly string[]).includes(value)
  )
}

export interface WeekSlot {
  day: Weekday
  /** One or more dishes for this day (main + optional side each). */
  meals: WeekMeal[]
}

export interface WeekPlan {
  id: string
  label: string
  status: 'pitching' | 'locked'
  slots: WeekSlot[]
  createdAt: string
  /** Set when ingredients for this locked week were successfully pushed to Bring */
  bringSentAt?: string
  /** Fingerprints of shopping lines already sent — kept across reopen for delta pushes */
  bringSentKeys?: string[]
  /** Meal ids whose ingredients were included in a Bring push */
  bringSentMealIds?: string[]
}

export interface BringListOption {
  listUuid: string
  name: string
}

export interface BringSettings {
  enabled: boolean
  linked: boolean
  email: string
  /** Kept only in memory for the link form — not required after token login */
  listName: string
  listUuid: string
  userUuid: string
  accessToken: string
  refreshToken: string
  accountName: string
  lists: BringListOption[]
  lastPushAt?: string
  lastPushItems?: string[]
  lastError?: string
}

export interface CookidooSettings {
  enabled: boolean
  linked: boolean
  email: string
  country: string
  /** Legacy bearer token — unused after OAuth2 cookie login */
  accessToken: string
  refreshToken: string
  /** Serialized Cookidoo session cookies (OAuth2 proxy) */
  cookies: string
  language: string
  lastImportUrl?: string
  lastError?: string
  suggestions: { title: string; id?: string | null }[]
}

export interface AppSettings {
  bring: BringSettings
  cookidoo: CookidooSettings
  /** User-defined recipe categories (synced in household). */
  customCategories: CustomRecipeCategory[]
  /** Display name + emoji avatar per household member (synced). */
  profiles: Record<UserId, UserProfile>
}

export interface AppState {
  currentUser: UserId | null
  recipes: Recipe[]
  pitches: Pitch[]
  weeks: WeekPlan[]
  activeWeekId: string
  settings: AppSettings
  shoppingDraft: ShoppingItem[]
}
