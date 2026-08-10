import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  importCookidooRecipeApi,
  linkBringAccount,
  linkCookidooAccount,
  pushItemsToBring,
} from './api/integrations'
import {
  DEFAULT_SETTINGS,
  SEED_RECIPES,
  createFreshWeek,
} from './data/seed'
import type {
  AppSettings,
  Ingredient,
  Pitch,
  Recipe,
  UserId,
  WeekPlan,
  Weekday,
} from './types'

interface Store {
  currentUser: UserId | null
  recipes: Recipe[]
  pitches: Pitch[]
  weeks: WeekPlan[]
  activeWeekId: string
  settings: AppSettings
  shoppingDraft: Ingredient[]
  login: (user: UserId) => void
  logout: () => void
  addRecipe: (recipe: Omit<Recipe, 'id' | 'createdAt' | 'createdBy'>) => void
  addImportedRecipe: (
    recipe: Omit<Recipe, 'id' | 'createdAt' | 'createdBy'>,
  ) => string
  importCookidooRecipe: (input: {
    title: string
    url: string
    ingredientsText: string
    notes?: string
  }) => void
  addPitch: (input: {
    title: string
    note: string
    recipeId?: string
    sideRecipeId?: string
    sideTitle?: string
  }) => void
  reactToPitch: (pitchId: string, reaction: 'yes' | 'maybe' | 'no') => void
  assignSlot: (
    day: Weekday,
    payload: {
      recipeId?: string
      title?: string
      sideRecipeId?: string
      sideTitle?: string
      fromPitchId?: string
    },
  ) => void
  clearSlot: (day: Weekday) => void
  lockWeek: () => void
  reopenWeek: () => void
  buildShoppingList: () => Ingredient[]
  setShoppingDraft: (items: Ingredient[]) => void
  updateBring: (patch: Partial<AppSettings['bring']>) => void
  updateCookidoo: (patch: Partial<AppSettings['cookidoo']>) => void
  linkBring: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; message: string }>
  unlinkBring: () => void
  pushToBring: () => Promise<{ ok: boolean; message: string; items: string[] }>
  linkCookidoo: (
    email: string,
    password: string,
    country?: string,
  ) => Promise<{ ok: boolean; message: string }>
  unlinkCookidoo: () => void
  importFromCookidooAccount: (
    recipeRef: string,
  ) => Promise<{ ok: boolean; message: string }>
  resetDemoData: () => void
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function activeWeek(get: () => Pick<Store, 'weeks' | 'activeWeekId'>) {
  const state = get()
  return state.weeks.find((w) => w.id === state.activeWeekId)
}

function mergeIngredients(items: Ingredient[]): Ingredient[] {
  const map = new Map<string, Ingredient>()
  for (const item of items) {
    const key = item.name.trim().toLowerCase()
    if (!key) continue
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { ...item, name: item.name.trim() })
    } else if (item.amount && existing.amount && item.amount !== existing.amount) {
      existing.amount = `${existing.amount} + ${item.amount}`
    } else if (item.amount && !existing.amount) {
      existing.amount = item.amount
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

function parseIngredientLines(text: string): Ingredient[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(
        /^([\d.,/\s]+(?:g|kg|ml|l|EL|TL|Stk\.?)?)\s+(.+)$/i,
      )
      if (match) return { amount: match[1].trim(), name: match[2].trim() }
      return { name: line }
    })
}

function stripTrailingSide(main: string, side?: string) {
  if (!side) return main.trim()
  const m = main.trim()
  const s = side.trim()
  if (m.endsWith(` + ${s}`)) return m.slice(0, -(s.length + 3)).trim()
  return m
}

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const initialWeek = createFreshWeek()
      return {
        currentUser: null,
        recipes: SEED_RECIPES,
        pitches: [],
        weeks: [initialWeek],
        activeWeekId: initialWeek.id,
        settings: DEFAULT_SETTINGS,
        shoppingDraft: [],

        login: (user) => set({ currentUser: user }),
        logout: () => set({ currentUser: null }),

        addRecipe: (recipe) => {
          const user = get().currentUser
          if (!user) return
          const next: Recipe = {
            ...recipe,
            kind: recipe.kind ?? 'meal',
            id: uid('r'),
            createdBy: user,
            createdAt: new Date().toISOString(),
          }
          set({ recipes: [next, ...get().recipes] })
        },

        addImportedRecipe: (recipe) => {
          const user = get().currentUser
          if (!user) return ''
          const id = uid('r')
          const next: Recipe = {
            ...recipe,
            kind: recipe.kind ?? 'meal',
            id,
            createdBy: user,
            createdAt: new Date().toISOString(),
          }
          set({ recipes: [next, ...get().recipes] })
          return id
        },

        importCookidooRecipe: ({ title, url, ingredientsText, notes }) => {
          const user = get().currentUser
          if (!user) return
          const next: Recipe = {
            id: uid('r'),
            title: title.trim() || 'Cookidoo Rezept',
            kind: 'meal',
            tags: ['cookidoo'],
            ingredients: parseIngredientLines(ingredientsText),
            notes,
            cookidooUrl: url.trim(),
            createdBy: user,
            createdAt: new Date().toISOString(),
          }
          set({
            recipes: [next, ...get().recipes],
            settings: {
              ...get().settings,
              cookidoo: {
                ...get().settings.cookidoo,
                enabled: true,
                lastImportUrl: url.trim(),
              },
            },
          })
        },

        addPitch: ({ title, note, recipeId, sideRecipeId, sideTitle }) => {
          const user = get().currentUser
          const week = activeWeek(get)
          if (!user || !week || week.status === 'locked') return
          const recipes = get().recipes
          const mainTitle = (
            (recipeId
              ? recipes.find((r) => r.id === recipeId)?.title
              : undefined) || title
          ).trim()
          const side =
            sideTitle?.trim() ||
            (sideRecipeId
              ? recipes.find((r) => r.id === sideRecipeId)?.title
              : undefined)
          const pitch: Pitch = {
            id: uid('p'),
            weekId: week.id,
            recipeId,
            sideRecipeId,
            sideTitle: side,
            title: mainTitle,
            note: note.trim(),
            pitchedBy: user,
            reactions: { [user]: 'yes' },
            createdAt: new Date().toISOString(),
          }
          set({ pitches: [pitch, ...get().pitches] })
        },

        reactToPitch: (pitchId, reaction) => {
          const user = get().currentUser
          const week = activeWeek(get)
          if (!user || !week || week.status === 'locked') return
          set({
            pitches: get().pitches.map((p) =>
              p.id === pitchId
                ? { ...p, reactions: { ...p.reactions, [user]: reaction } }
                : p,
            ),
          })
        },

        assignSlot: (day, payload) => {
          const week = activeWeek(get)
          if (!week || week.status === 'locked') return
          const recipes = get().recipes
          const mainFromRecipe = payload.recipeId
            ? recipes.find((r) => r.id === payload.recipeId)?.title
            : undefined
          const sideTitle =
            payload.sideTitle?.trim() ||
            (payload.sideRecipeId
              ? recipes.find((r) => r.id === payload.sideRecipeId)?.title
              : undefined)
          const mainTitle = stripTrailingSide(
            mainFromRecipe || payload.title || '',
            sideTitle,
          )
          set({
            weeks: get().weeks.map((w) => {
              if (w.id !== get().activeWeekId) return w
              return {
                ...w,
                slots: w.slots.map((s) =>
                  s.day === day
                    ? {
                        day,
                        recipeId: payload.recipeId,
                        title: mainTitle || undefined,
                        sideRecipeId: payload.sideRecipeId,
                        sideTitle,
                        fromPitchId: payload.fromPitchId,
                      }
                    : s,
                ),
              }
            }),
          })
        },

        clearSlot: (day) => {
          const week = activeWeek(get)
          if (!week || week.status === 'locked') return
          set({
            weeks: get().weeks.map((w) => {
              if (w.id !== get().activeWeekId) return w
              return {
                ...w,
                slots: w.slots.map((s) => (s.day === day ? { day } : s)),
              }
            }),
          })
        },

        lockWeek: () => {
          const week = activeWeek(get)
          if (!week) return
          const hasMeal = week.slots.some(
            (s) => s.recipeId || s.title || s.sideRecipeId || s.sideTitle,
          )
          if (!hasMeal) return
          set({
            weeks: get().weeks.map((w) =>
              w.id === get().activeWeekId ? { ...w, status: 'locked' } : w,
            ),
          })
        },

        reopenWeek: () => {
          set({
            weeks: get().weeks.map((w) =>
              w.id === get().activeWeekId ? { ...w, status: 'pitching' } : w,
            ),
            shoppingDraft: [],
          })
        },

        buildShoppingList: () => {
          const week = activeWeek(get)
          if (!week || week.status !== 'locked') {
            set({ shoppingDraft: [] })
            return []
          }
          const { recipes } = get()
          const items: Ingredient[] = []
          for (const slot of week.slots) {
            if (slot.recipeId) {
              const recipe = recipes.find((r) => r.id === slot.recipeId)
              if (recipe) items.push(...recipe.ingredients)
            }
            if (slot.sideRecipeId) {
              const side = recipes.find((r) => r.id === slot.sideRecipeId)
              if (side) items.push(...side.ingredients)
            }
          }
          const merged = mergeIngredients(items)
          set({ shoppingDraft: merged })
          return merged
        },

        setShoppingDraft: (items) => set({ shoppingDraft: items }),

        updateBring: (patch) =>
          set({
            settings: {
              ...get().settings,
              bring: { ...get().settings.bring, ...patch },
            },
          }),

        updateCookidoo: (patch) =>
          set({
            settings: {
              ...get().settings,
              cookidoo: { ...get().settings.cookidoo, ...patch },
            },
          }),

        linkBring: async (email, password) => {
          try {
            const res = await linkBringAccount(email, password)
            if (!res.ok || !res.accessToken || !res.uuid) {
              get().updateBring({
                linked: false,
                lastError: res.message || 'Bring-Login fehlgeschlagen',
              })
              return {
                ok: false,
                message: res.message || 'Bring-Login fehlgeschlagen',
              }
            }
            const lists = res.lists ?? []
            const preferred =
              lists.find((l) => /einkauf|shop|wg|familie/i.test(l.name)) ??
              lists[0]
            get().updateBring({
              enabled: true,
              linked: true,
              email,
              accountName: res.name || '',
              userUuid: res.uuid,
              accessToken: res.accessToken,
              refreshToken: res.refreshToken || '',
              lists,
              listUuid: preferred?.listUuid || '',
              listName: preferred?.name || 'Einkaufen',
              lastError: undefined,
            })
            return { ok: true, message: res.message || 'Bring verknüpft' }
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : 'Bring-Verbindung fehlgeschlagen'
            get().updateBring({ linked: false, lastError: message })
            return { ok: false, message }
          }
        },

        unlinkBring: () =>
          get().updateBring({
            linked: false,
            accessToken: '',
            refreshToken: '',
            userUuid: '',
            accountName: '',
            lists: [],
            listUuid: '',
            lastError: undefined,
          }),

        pushToBring: async () => {
          const week = activeWeek(get)
          if (!week || week.status !== 'locked') {
            return {
              ok: false,
              message:
                'Erst Woche festnageln — erst dann bewusst an Bring senden.',
              items: [],
            }
          }
          const { settings, shoppingDraft, buildShoppingList } = get()
          const items =
            shoppingDraft.length > 0 ? shoppingDraft : buildShoppingList()
          if (!settings.bring.enabled) {
            return {
              ok: false,
              message: 'Bring ist in den Einstellungen noch aus.',
              items: [],
            }
          }
          if (
            !settings.bring.linked ||
            !settings.bring.accessToken ||
            !settings.bring.userUuid ||
            !settings.bring.listUuid
          ) {
            return {
              ok: false,
              message: 'Bring zuerst mit E-Mail & Passwort verknüpfen.',
              items: [],
            }
          }
          if (items.length === 0) {
            return {
              ok: false,
              message: 'Keine Zutaten im finalen Wochenplan.',
              items: [],
            }
          }
          try {
            const res = await pushItemsToBring({
              uuid: settings.bring.userUuid,
              accessToken: settings.bring.accessToken,
              listUuid: settings.bring.listUuid,
              items: items.map((i) => ({
                name: i.name,
                amount: i.amount,
              })),
            })
            const lines =
              res.added ??
              items.map((i) =>
                i.amount ? `${i.name} (${i.amount})` : i.name,
              )
            get().updateBring({
              lastPushAt: new Date().toISOString(),
              lastPushItems: lines,
              lastError: res.ok ? undefined : res.message,
            })
            return { ok: res.ok, message: res.message, items: lines }
          } catch (err) {
            const message =
              err instanceof Error ? err.message : 'Bring-Push fehlgeschlagen'
            get().updateBring({ lastError: message })
            return { ok: false, message, items: [] }
          }
        },

        linkCookidoo: async (email, password, country = 'de') => {
          try {
            const res = await linkCookidooAccount(email, password, country)
            if (!res.ok || !res.accessToken) {
              get().updateCookidoo({
                linked: false,
                lastError: res.message || 'Cookidoo-Login fehlgeschlagen',
              })
              return {
                ok: false,
                message: res.message || 'Cookidoo-Login fehlgeschlagen',
              }
            }
            get().updateCookidoo({
              enabled: true,
              linked: true,
              email,
              country: res.country || country,
              language: res.language || 'de-DE',
              accessToken: res.accessToken,
              refreshToken: res.refreshToken || '',
              suggestions: res.suggestions || [],
              lastError: undefined,
            })
            return { ok: true, message: res.message || 'Cookidoo verknüpft' }
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : 'Cookidoo-Verbindung fehlgeschlagen'
            get().updateCookidoo({ linked: false, lastError: message })
            return { ok: false, message }
          }
        },

        unlinkCookidoo: () =>
          get().updateCookidoo({
            linked: false,
            accessToken: '',
            refreshToken: '',
            suggestions: [],
            lastError: undefined,
          }),

        importFromCookidooAccount: async (recipeRef) => {
          const { settings, addImportedRecipe } = get()
          if (!settings.cookidoo.linked || !settings.cookidoo.accessToken) {
            return {
              ok: false,
              message: 'Cookidoo zuerst mit Login verknüpfen.',
            }
          }
          try {
            const res = await importCookidooRecipeApi({
              accessToken: settings.cookidoo.accessToken,
              recipe: recipeRef,
              country: settings.cookidoo.country || 'de',
            })
            if (!res.ok || !res.recipe) {
              get().updateCookidoo({ lastError: res.message })
              return { ok: false, message: res.message }
            }
            addImportedRecipe({
              title: res.recipe.title,
              kind: 'meal',
              tags: res.recipe.tags || ['cookidoo'],
              ingredients: (res.recipe.ingredients || []).map((i) => ({
                name: i.name,
                amount: i.amount || undefined,
              })),
              notes: res.recipe.notes,
              cookidooUrl: res.recipe.cookidooUrl,
              cookidooId: res.recipe.id,
            })
            get().updateCookidoo({
              lastImportUrl: res.recipe.cookidooUrl,
              lastError: undefined,
            })
            return { ok: true, message: res.message }
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : 'Cookidoo-Import fehlgeschlagen'
            get().updateCookidoo({ lastError: message })
            return { ok: false, message }
          }
        },

        resetDemoData: () => {
          const week = createFreshWeek()
          set({
            recipes: SEED_RECIPES,
            pitches: [],
            weeks: [week],
            activeWeekId: week.id,
            shoppingDraft: [],
            settings: DEFAULT_SETTINGS,
          })
        },
      }
    },
    {
      name: 'wochenkochen-demo-v4',
      partialize: (state) => ({
        currentUser: state.currentUser,
        recipes: state.recipes.map((r) => ({
          ...r,
          kind: r.kind ?? 'meal',
        })),
        pitches: state.pitches,
        weeks: state.weeks,
        activeWeekId: state.activeWeekId,
        shoppingDraft: state.shoppingDraft,
        settings: state.settings,
      }),
    },
  ),
)
