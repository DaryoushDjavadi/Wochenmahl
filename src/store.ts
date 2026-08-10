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
  WEEKDAYS,
  createFreshWeek,
  createWeekForMonday,
  mondayOf,
  normalizeWeeks,
  normalizeWeekSlot,
  repairRecipeCookidooLinks,
  shoppingItemKey,
  slotHasMeal,
  weekIdFromMonday,
} from './data/seed'
import {
  kindFromCategory,
  repairRecipeCategories,
  resolveRecipeCategory,
} from './data/categories'
import type {
  AppSettings,
  Ingredient,
  Pitch,
  Recipe,
  RecipeCategory,
  ShoppingItem,
  UserId,
  WeekMeal,
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
  shoppingDraft: ShoppingItem[]
  login: (user: UserId) => void
  logout: () => void
  addRecipe: (recipe: Omit<Recipe, 'id' | 'createdAt' | 'createdBy'>) => void
  updateRecipe: (
    id: string,
    patch: Omit<Recipe, 'id' | 'createdAt' | 'createdBy'>,
  ) => void
  duplicateRecipe: (id: string) => string | null
  deleteRecipe: (id: string) => Recipe | null
  restoreRecipe: (recipe: Recipe, index?: number) => void
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
  deletePitch: (pitchId: string) => void
  reactToPitch: (
    pitchId: string,
    reaction: 'yes' | 'maybe' | 'no',
  ) => { promoted: boolean; message?: string }
  promotePitchToPool: (
    pitchId: string,
  ) => { ok: boolean; message: string; recipeIds: string[] }
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
  removeMeal: (day: Weekday, mealId: string) => void
  clearSlot: (day: Weekday) => void
  lockWeek: () => void
  ensureWeekNotEmptyLocked: () => void
  reopenWeek: () => void
  selectWeekByDate: (date: Date) => void
  buildShoppingList: () => ShoppingItem[]
  setShoppingDraft: (items: ShoppingItem[]) => void
  updateShoppingItem: (id: string, patch: Partial<ShoppingItem>) => void
  removeShoppingItem: (id: string) => void
  addShoppingItem: () => void
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
          const category = resolveRecipeCategory(recipe)
          const next: Recipe = {
            ...recipe,
            category,
            kind: recipe.kind ?? kindFromCategory(category),
            id: uid('r'),
            createdBy: user,
            createdAt: new Date().toISOString(),
          }
          set({ recipes: [next, ...get().recipes] })
        },

        updateRecipe: (id, patch) => {
          set({
            recipes: get().recipes.map((r) => {
              if (r.id !== id) return r
              const merged = {
                ...r,
                ...patch,
                id: r.id,
                createdBy: r.createdBy,
                createdAt: r.createdAt,
              }
              const category = resolveRecipeCategory(merged)
              return {
                ...merged,
                category,
                kind: patch.kind ?? kindFromCategory(category),
              }
            }),
          })
        },

        duplicateRecipe: (id) => {
          const user = get().currentUser
          if (!user) return null
          const source = get().recipes.find((r) => r.id === id)
          if (!source) return null
          const nextId = uid('r')
          const next: Recipe = {
            ...source,
            id: nextId,
            title: `${source.title} (Kopie)`,
            createdBy: user,
            createdAt: new Date().toISOString(),
            ingredients: source.ingredients.map((i) => ({ ...i })),
            tags: [...source.tags],
          }
          set({ recipes: [next, ...get().recipes] })
          return nextId
        },

        deleteRecipe: (id) => {
          const list = get().recipes
          const index = list.findIndex((r) => r.id === id)
          if (index < 0) return null
          const removed = list[index]
          set({
            recipes: list.filter((r) => r.id !== id),
            pitches: get().pitches.filter(
              (p) => p.recipeId !== id && p.sideRecipeId !== id,
            ),
            weeks: get().weeks.map((week) => ({
              ...week,
              slots: week.slots.map((slot) => {
                const normalized = normalizeWeekSlot(slot)
                return {
                  day: normalized.day,
                  meals: normalized.meals
                    .map((meal) => {
                      if (meal.recipeId === id) return null
                      if (meal.sideRecipeId === id) {
                        return {
                          ...meal,
                          sideRecipeId: undefined,
                          sideTitle: undefined,
                        }
                      }
                      return meal
                    })
                    .filter((m): m is WeekMeal => Boolean(m)),
                }
              }),
            })),
          })
          return removed
        },

        restoreRecipe: (recipe, index) => {
          const list = get().recipes
          if (list.some((r) => r.id === recipe.id)) return
          const next = [...list]
          const at =
            typeof index === 'number'
              ? Math.max(0, Math.min(index, next.length))
              : 0
          next.splice(at, 0, recipe)
          set({ recipes: next })
        },

        addImportedRecipe: (recipe) => {
          const user = get().currentUser
          if (!user) return ''
          const id = uid('r')
          const category = resolveRecipeCategory(recipe)
          const next: Recipe = {
            ...recipe,
            category,
            kind: recipe.kind ?? kindFromCategory(category),
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
          const category = resolveRecipeCategory({
            title,
            tags: ['cookidoo'],
            notes,
            kind: 'meal',
          })
          const next: Recipe = {
            id: uid('r'),
            title: title.trim() || 'Cookidoo Rezept',
            category,
            kind: kindFromCategory(category),
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

        deletePitch: (pitchId) => {
          const week = activeWeek(get)
          if (!week || week.status === 'locked') return
          set({
            pitches: get().pitches.filter((p) => p.id !== pitchId),
          })
        },

        reactToPitch: (pitchId, reaction) => {
          const user = get().currentUser
          const week = activeWeek(get)
          if (!user || !week || week.status === 'locked') {
            return { promoted: false }
          }
          const pitch = get().pitches.find((p) => p.id === pitchId)
          if (!pitch) return { promoted: false }

          const reactions = { ...pitch.reactions, [user]: reaction }
          set({
            pitches: get().pitches.map((p) =>
              p.id === pitchId ? { ...p, reactions } : p,
            ),
          })

          if (reactions.darius === 'yes' && reactions.wendy === 'yes') {
            const res = get().promotePitchToPool(pitchId)
            return {
              promoted: res.ok,
              message: res.message,
            }
          }
          return { promoted: false }
        },

        promotePitchToPool: (pitchId) => {
          const user = get().currentUser
          if (!user) {
            return { ok: false, message: 'Bitte zuerst einloggen.', recipeIds: [] }
          }
          const pitch = get().pitches.find((p) => p.id === pitchId)
          if (!pitch) {
            return { ok: false, message: 'Pitch nicht gefunden.', recipeIds: [] }
          }
          if (
            pitch.reactions.darius !== 'yes' ||
            pitch.reactions.wendy !== 'yes'
          ) {
            return {
              ok: false,
              message: 'Beide müssen mit Yes abstimmen.',
              recipeIds: [],
            }
          }

          const created: Recipe[] = []
          let recipeId = pitch.recipeId
          let sideRecipeId = pitch.sideRecipeId
          const addedLabels: string[] = []

          const freeMain = !recipeId && Boolean(pitch.title.trim())
          if (freeMain) {
            const title = pitch.title.trim()
            const existing = get().recipes.find(
              (r) => r.title.trim().toLowerCase() === title.toLowerCase(),
            )
            if (existing) {
              recipeId = existing.id
              addedLabels.push(`„${existing.title}“`)
            } else {
              const id = uid('r')
              created.push({
                id,
                title,
                kind: pitch.sideTitle || pitch.sideRecipeId ? 'base' : 'meal',
                category: pitch.sideTitle || pitch.sideRecipeId ? 'base' : 'main',
                tags: ['pitch'],
                ingredients: [],
                notes: pitch.note.trim() || undefined,
                createdBy: user,
                createdAt: new Date().toISOString(),
              })
              recipeId = id
              addedLabels.push(`„${title}“`)
            }
          } else if (recipeId) {
            const existing = get().recipes.find((r) => r.id === recipeId)
            if (existing) addedLabels.push(`„${existing.title}“`)
          }

          const freeSideTitle = pitch.sideTitle?.trim()
          const freeSide = Boolean(freeSideTitle) && !sideRecipeId
          if (freeSide && freeSideTitle) {
            const existing = get().recipes.find(
              (r) =>
                r.title.trim().toLowerCase() === freeSideTitle.toLowerCase(),
            )
            if (existing) {
              sideRecipeId = existing.id
              addedLabels.push(`Beilage „${existing.title}“`)
            } else {
              const id = uid('r')
              created.push({
                id,
                title: freeSideTitle,
                kind: 'side',
                category: 'side',
                tags: ['pitch', 'beilage'],
                ingredients: [],
                notes: pitch.note.trim()
                  ? `Aus Pitch zu „${pitch.title.trim()}“: ${pitch.note.trim()}`
                  : `Aus Pitch zu „${pitch.title.trim()}“`,
                createdBy: user,
                createdAt: new Date().toISOString(),
              })
              sideRecipeId = id
              addedLabels.push(`Beilage „${freeSideTitle}“`)
            }
          } else if (sideRecipeId) {
            const existing = get().recipes.find((r) => r.id === sideRecipeId)
            if (existing) addedLabels.push(`Beilage „${existing.title}“`)
          }

          const label =
            addedLabels.length > 0
              ? addedLabels.join(', ')
              : [pitch.title, pitch.sideTitle].filter(Boolean).join(' + ')

          set({
            recipes:
              created.length > 0
                ? [...created, ...get().recipes]
                : get().recipes,
            pitches: get().pitches.filter((p) => p.id !== pitchId),
          })

          return {
            ok: true,
            message: `Angenommen → Rezepte-Pool: ${label}`,
            recipeIds: [
              ...created.map((r) => r.id),
              ...([recipeId, sideRecipeId].filter(Boolean) as string[]),
            ],
          }
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
          const meal: WeekMeal = {
            id: uid('m'),
            recipeId: payload.recipeId,
            title: mainTitle || undefined,
            sideRecipeId: payload.sideRecipeId,
            sideTitle,
            fromPitchId: payload.fromPitchId,
          }
          set({
            weeks: get().weeks.map((w) => {
              if (w.id !== get().activeWeekId) return w
              return {
                ...w,
                bringSentAt: undefined,
                slots: w.slots.map((s) => {
                  const slot = normalizeWeekSlot(s)
                  if (slot.day !== day) return slot
                  return { day, meals: [...slot.meals, meal] }
                }),
              }
            }),
            shoppingDraft: get().shoppingDraft,
          })
        },

        removeMeal: (day, mealId) => {
          const week = activeWeek(get)
          if (!week || week.status === 'locked') return
          set({
            weeks: get().weeks.map((w) => {
              if (w.id !== get().activeWeekId) return w
              return {
                ...w,
                bringSentAt: undefined,
                slots: w.slots.map((s) => {
                  const slot = normalizeWeekSlot(s)
                  if (slot.day !== day) return slot
                  return {
                    day,
                    meals: slot.meals.filter((m) => m.id !== mealId),
                  }
                }),
              }
            }),
            shoppingDraft: get().shoppingDraft,
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
                bringSentAt: undefined,
                slots: w.slots.map((s) =>
                  s.day === day ? { day, meals: [] } : normalizeWeekSlot(s),
                ),
              }
            }),
            shoppingDraft: get().shoppingDraft,
          })
        },

        lockWeek: () => {
          const week = activeWeek(get)
          if (!week) return
          const hasMeal = week.slots.some((s) => slotHasMeal(normalizeWeekSlot(s)))
          if (!hasMeal) return
          set({
            weeks: get().weeks.map((w) =>
              w.id === get().activeWeekId
                ? {
                    ...w,
                    status: 'locked',
                    // Keep prior Bring history so only new lines are pushed next.
                    bringSentAt: undefined,
                  }
                : w,
            ),
          })
          // Build shopping list immediately for the shop tab.
          get().buildShoppingList()
        },

        /** Locked weeks without any meals are invalid — open them again. */
        ensureWeekNotEmptyLocked: () => {
          const week = activeWeek(get)
          if (!week || week.status !== 'locked') return
          const hasMeal = week.slots.some((s) => slotHasMeal(normalizeWeekSlot(s)))
          if (hasMeal) return
          set({
            weeks: get().weeks.map((w) =>
              w.id === get().activeWeekId
                ? {
                    ...w,
                    status: 'pitching',
                    bringSentAt: undefined,
                    bringSentKeys: undefined,
                    bringSentMealIds: undefined,
                  }
                : w,
            ),
            shoppingDraft: [],
          })
        },

        reopenWeek: () => {
          set({
            weeks: get().weeks.map((w) =>
              w.id === get().activeWeekId
                ? {
                    ...w,
                    status: 'pitching',
                    bringSentAt: undefined,
                    // Keep bringSentKeys / bringSentMealIds for delta pushes.
                  }
                : w,
            ),
            shoppingDraft: [],
          })
        },

        selectWeekByDate: (date) => {
          const monday = mondayOf(date)
          const id = weekIdFromMonday(monday)
          const existing = get().weeks.find((w) => w.id === id)
          if (existing) {
            set({ activeWeekId: id, shoppingDraft: [] })
            return
          }
          const week = createWeekForMonday(monday)
          set({
            weeks: [...get().weeks, week].sort((a, b) =>
              a.id.localeCompare(b.id),
            ),
            activeWeekId: week.id,
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
          const legacyFullySent =
            Boolean(week.bringSentAt) &&
            !(week.bringSentKeys && week.bringSentKeys.length > 0)
          const sentKeys = new Set(week.bringSentKeys ?? [])
          const dayLabel = (day: Weekday) =>
            WEEKDAYS.find((d) => d.id === day)?.label ?? day
          const items: ShoppingItem[] = []
          const pushItem = (item: Omit<ShoppingItem, 'id' | 'bringSent'>) => {
            const row: ShoppingItem = {
              id: uid('shop'),
              ...item,
            }
            row.bringSent =
              legacyFullySent || sentKeys.has(shoppingItemKey(row))
            items.push(row)
          }
          for (const raw of week.slots) {
            const slot = normalizeWeekSlot(raw)
            for (const meal of slot.meals) {
              if (meal.recipeId) {
                const recipe = recipes.find((r) => r.id === meal.recipeId)
                if (recipe) {
                  const dish = `${recipe.title} (${dayLabel(slot.day)})`
                  for (const ing of recipe.ingredients) {
                    pushItem({
                      name: ing.name,
                      amount: ing.amount,
                      dish,
                      day: slot.day,
                    })
                  }
                }
              } else if (meal.title?.trim()) {
                pushItem({
                  name: meal.title.trim(),
                  dish: `${meal.title.trim()} (${dayLabel(slot.day)})`,
                  day: slot.day,
                })
              }
              if (meal.sideRecipeId) {
                const side = recipes.find((r) => r.id === meal.sideRecipeId)
                if (side) {
                  const dish = `${side.title} (${dayLabel(slot.day)})`
                  for (const ing of side.ingredients) {
                    pushItem({
                      name: ing.name,
                      amount: ing.amount,
                      dish,
                      day: slot.day,
                    })
                  }
                }
              } else if (meal.sideTitle?.trim()) {
                pushItem({
                  name: meal.sideTitle.trim(),
                  dish: `${meal.sideTitle.trim()} (${dayLabel(slot.day)})`,
                  day: slot.day,
                })
              }
            }
          }
          items.sort((a, b) => {
            const dayCmp = (a.day ?? '').localeCompare(b.day ?? '')
            if (dayCmp) return dayCmp
            const dishCmp = a.dish.localeCompare(b.dish, 'de')
            if (dishCmp) return dishCmp
            return a.name.localeCompare(b.name, 'de')
          })

          if (legacyFullySent && items.length > 0) {
            const keys = [...new Set(items.map((i) => shoppingItemKey(i)))]
            const mealIds: string[] = []
            for (const raw of week.slots) {
              for (const meal of normalizeWeekSlot(raw).meals) {
                mealIds.push(meal.id)
              }
            }
            set({
              shoppingDraft: items,
              weeks: get().weeks.map((w) =>
                w.id === week.id
                  ? {
                      ...w,
                      bringSentKeys: keys,
                      bringSentMealIds: [...new Set(mealIds)],
                    }
                  : w,
              ),
            })
            return items
          }

          set({ shoppingDraft: items })
          return items
        },

        setShoppingDraft: (items) => set({ shoppingDraft: items }),

        updateShoppingItem: (id, patch) => {
          set({
            shoppingDraft: get().shoppingDraft.map((item) => {
              if (item.id !== id) return item
              const next = { ...item, ...patch, id: item.id }
              const week = activeWeek(get)
              const sentKeys = new Set(week?.bringSentKeys ?? [])
              next.bringSent = sentKeys.has(shoppingItemKey(next))
              return next
            }),
          })
        },

        removeShoppingItem: (id) => {
          set({
            shoppingDraft: get().shoppingDraft.filter((item) => item.id !== id),
          })
        },

        addShoppingItem: () => {
          set({
            shoppingDraft: [
              ...get().shoppingDraft,
              {
                id: uid('shop'),
                name: '',
                amount: '',
                dish: 'Extra',
                bringSent: false,
              },
            ],
          })
        },

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
          const allItems = (
            shoppingDraft.length > 0 ? shoppingDraft : buildShoppingList()
          ).filter((i) => i.name.trim())
          const sentKeys = new Set(week.bringSentKeys ?? [])
          const pending = allItems.filter(
            (i) => !sentKeys.has(shoppingItemKey(i)),
          )
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
          if (allItems.length === 0) {
            return {
              ok: false,
              message: 'Keine Zutaten im finalen Wochenplan.',
              items: [],
            }
          }
          if (pending.length === 0) {
            return {
              ok: false,
              message:
                'Alles schon auf Bring — keine neuen Zutaten seit dem letzten Senden.',
              items: [],
            }
          }
          try {
            const res = await pushItemsToBring({
              uuid: settings.bring.userUuid,
              accessToken: settings.bring.accessToken,
              listUuid: settings.bring.listUuid,
              items: pending.map((i) => ({
                name: i.name.trim(),
                amount: [i.amount?.trim(), i.dish?.trim()]
                  .filter(Boolean)
                  .join(' · '),
              })),
            })
            const lines =
              res.added ??
              pending.map((i) => {
                const bits = [i.name.trim()]
                if (i.amount?.trim()) bits.push(i.amount.trim())
                if (i.dish?.trim()) bits.push(i.dish.trim())
                return bits.join(' · ')
              })
            get().updateBring({
              lastPushAt: new Date().toISOString(),
              lastPushItems: lines,
              lastError: res.ok ? undefined : res.message,
            })
            if (res.ok) {
              const sentAt = new Date().toISOString()
              const newKeys = pending.map((i) => shoppingItemKey(i))
              const nextKeys = [...new Set([...sentKeys, ...newKeys])]
              const mealIds = new Set(week.bringSentMealIds ?? [])
              for (const raw of week.slots) {
                for (const meal of normalizeWeekSlot(raw).meals) {
                  mealIds.add(meal.id)
                }
              }
              const nextMealIds = [...mealIds]
              set({
                weeks: get().weeks.map((w) =>
                  w.id === get().activeWeekId
                    ? {
                        ...w,
                        bringSentAt: sentAt,
                        bringSentKeys: nextKeys,
                        bringSentMealIds: nextMealIds,
                      }
                    : w,
                ),
                shoppingDraft: get().shoppingDraft.map((item) => ({
                  ...item,
                  bringSent:
                    item.bringSent ||
                    nextKeys.includes(shoppingItemKey(item)),
                })),
              })
            }
            return {
              ok: res.ok,
              message: res.ok
                ? pending.length < allItems.length
                  ? `${pending.length} neue Zutaten an Bring gesendet (${allItems.length - pending.length} waren schon drauf).`
                  : res.message
                : res.message,
              items: lines,
            }
          } catch (err) {
            const message =
              err instanceof Error ? err.message : 'Bring-Push fehlgeschlagen'
            get().updateBring({ lastError: message })
            return { ok: false, message, items: [] }
          }
        },

        linkCookidoo: async (email, password, country = 'de') => {
          get().updateCookidoo({ lastError: undefined })
          try {
            const res = await linkCookidooAccount(email, password, country)
            const cookiesJson =
              res.cookies && res.cookies.length
                ? JSON.stringify(res.cookies)
                : ''
            if (!res.ok || !cookiesJson) {
              const debugBits = res.debug
                ? [
                    res.debug.badPassword ? 'Passwort abgelehnt' : null,
                    res.debug.cookieKeys?.length
                      ? `Cookies: ${res.debug.cookieKeys.join(',')}`
                      : null,
                    res.debug.finalUrl
                      ? `URL: ${res.debug.finalUrl.slice(0, 120)}`
                      : null,
                  ].filter(Boolean)
                : []
              const message =
                [res.message, res.hint, ...debugBits].filter(Boolean).join(' — ') ||
                'Cookidoo-Login fehlgeschlagen'
              get().updateCookidoo({
                linked: false,
                cookies: '',
                lastError: message,
              })
              return {
                ok: false,
                message,
              }
            }
            get().updateCookidoo({
              enabled: true,
              linked: true,
              email,
              country: res.country || country,
              language: res.language || 'de-DE',
              accessToken: res.accessToken || '',
              refreshToken: res.refreshToken || '',
              cookies: cookiesJson,
              suggestions: res.suggestions || [],
              lastError: undefined,
            })
            return { ok: true, message: res.message || 'Cookidoo verknüpft' }
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : 'Cookidoo-Verbindung fehlgeschlagen'
            get().updateCookidoo({ linked: false, cookies: '', lastError: message })
            return { ok: false, message }
          }
        },

        unlinkCookidoo: () =>
          get().updateCookidoo({
            linked: false,
            accessToken: '',
            refreshToken: '',
            cookies: '',
            suggestions: [],
            lastError: undefined,
          }),

        importFromCookidooAccount: async (recipeRef) => {
          const { settings, addImportedRecipe } = get()
          if (!settings.cookidoo.linked || !settings.cookidoo.cookies) {
            return {
              ok: false,
              message: 'Cookidoo zuerst mit Login verknüpfen.',
            }
          }
          try {
            const res = await importCookidooRecipeApi({
              cookies: settings.cookidoo.cookies,
              recipe: recipeRef,
              country: settings.cookidoo.country || 'de',
            })
            if (!res.ok || !res.recipe) {
              get().updateCookidoo({ lastError: res.message })
              return { ok: false, message: res.message }
            }
            addImportedRecipe({
              title: res.recipe.title,
              category: (['main', 'soup', 'salad', 'side', 'base', 'breakfast', 'dessert', 'snack', 'drink', 'other'].includes(
                res.recipe.category || '',
              )
                ? res.recipe.category
                : undefined) as RecipeCategory | undefined,
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
      name: 'wochenkochen-demo-v5',
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
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>
        const draft = Array.isArray(p.shoppingDraft)
          ? p.shoppingDraft.map((item, i) => {
              const row = item as ShoppingItem
              return {
                id: row.id || `shop-migrated-${i}`,
                name: row.name ?? '',
                amount: row.amount,
                dish: row.dish || 'Unbekannt',
                day: row.day,
              } satisfies ShoppingItem
            })
          : current.shoppingDraft
        return {
          ...current,
          ...p,
          shoppingDraft: draft,
          weeks: normalizeWeeks(
            (Array.isArray(p.weeks) ? p.weeks : current.weeks) as WeekPlan[],
          ),
          recipes: repairRecipeCategories(
            repairRecipeCookidooLinks(
              (Array.isArray(p.recipes) ? p.recipes : current.recipes) as Recipe[],
            ),
          ),
        }
      },
    },
  ),
)
