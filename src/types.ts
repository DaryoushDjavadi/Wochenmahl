export type UserId = 'darius' | 'wendy'

export interface User {
  id: UserId
  name: string
  short: string
  color: string
}

export interface Ingredient {
  name: string
  amount?: string
}

export interface Recipe {
  id: string
  title: string
  /** meal = full dish, base = e.g. rice, side = beilage */
  kind: 'meal' | 'base' | 'side'
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
}

export interface WeekSlot {
  day: Weekday
  recipeId?: string
  title?: string
  sideRecipeId?: string
  sideTitle?: string
  fromPitchId?: string
}

export interface WeekPlan {
  id: string
  label: string
  status: 'pitching' | 'locked'
  slots: WeekSlot[]
  createdAt: string
  /** Set when ingredients for this locked week were successfully pushed to Bring */
  bringSentAt?: string
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
