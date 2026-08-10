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
  repairRecipeCookidooLinks,
  weekIdFromMonday,
} from './data/seed'
import type {
  AppSettings,
  Ingredient,
  Pitch,
  Recipe,
  ShoppingItem,
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
  reactToPitch: (pitchId: string, reaction: 'yes' | 'maybe' | 'no') => void
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
  clearSlot: (day: Weekday) => void
  lockWeek: () => void
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
          const next: Recipe = {
            ...recipe,
            kind: recipe.kind ?? 'meal',
            id: uid('r'),
            createdBy: user,
            createdAt: new Date().toISOString(),
          }
          set({ recipes: [next, ...get().recipes] })
        },

        updateRecipe: (id, patch) => {
          set({
            recipes: get().recipes.map((r) =>
              r.id === id
                ? {
                    ...r,
                    ...patch,
                    kind: patch.kind ?? r.kind ?? 'meal',
                    id: r.id,
                    createdBy: r.createdBy,
                    createdAt: r.createdAt,
                  }
                : r,
            ),
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
                if (slot.recipeId !== id && slot.sideRecipeId !== id) {
                  return slot
                }
                if (slot.recipeId === id) {
                  return {
                    day: slot.day,
                    recipeId: undefined,
                    title: undefined,
                    sideRecipeId: undefined,
                    sideTitle: undefined,
                    fromPitchId: undefined,
                  }
                }
                return {
                  ...slot,
                  sideRecipeId: undefined,
                  sideTitle: undefined,
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
          let poolRecipeId = pitch.poolRecipeId
          let poolSideRecipeId = pitch.poolSideRecipeId
          const addedLabels: string[] = []
          const linkedLabels: string[] = []

          const freeMain =
            !recipeId && !poolRecipeId && Boolean(pitch.title.trim())
          if (freeMain) {
            const title = pitch.title.trim()
            const existing = get().recipes.find(
              (r) => r.title.trim().toLowerCase() === title.toLowerCase(),
            )
            if (existing) {
              recipeId = existing.id
              poolRecipeId = existing.id
              linkedLabels.push(`„${existing.title}“`)
            } else {
              const id = uid('r')
              created.push({
                id,
                title,
                kind: pitch.sideTitle || pitch.sideRecipeId ? 'base' : 'meal',
                tags: ['pitch'],
                ingredients: [],
                notes: pitch.note.trim() || undefined,
                createdBy: user,
                createdAt: new Date().toISOString(),
              })
              recipeId = id
              poolRecipeId = id
              addedLabels.push(`„${title}“`)
            }
          }

          const freeSideTitle = pitch.sideTitle?.trim()
          const freeSide =
            Boolean(freeSideTitle) && !sideRecipeId && !poolSideRecipeId
          if (freeSide && freeSideTitle) {
            const existing = get().recipes.find(
              (r) =>
                r.title.trim().toLowerCase() === freeSideTitle.toLowerCase(),
            )
            if (existing) {
              sideRecipeId = existing.id
              poolSideRecipeId = existing.id
              linkedLabels.push(`Beilage „${existing.title}“`)
            } else {
              const id = uid('r')
              created.push({
                id,
                title: freeSideTitle,
                kind: 'side',
                tags: ['pitch', 'beilage'],
                ingredients: [],
                notes: pitch.note.trim()
                  ? `Aus Pitch zu „${pitch.title.trim()}“: ${pitch.note.trim()}`
                  : `Aus Pitch zu „${pitch.title.trim()}“`,
                createdBy: user,
                createdAt: new Date().toISOString(),
              })
              sideRecipeId = id
              poolSideRecipeId = id
              addedLabels.push(`Beilage „${freeSideTitle}“`)
            }
          }

          const alreadyFullyLinked =
            Boolean(recipeId || pitch.recipeId) &&
            (!pitch.sideTitle?.trim() || Boolean(sideRecipeId || pitch.sideRecipeId)) &&
            Boolean(pitch.poolRecipeId || pitch.recipeId) &&
            (!pitch.sideTitle?.trim() ||
              Boolean(pitch.poolSideRecipeId || pitch.sideRecipeId))

          if (
            created.length === 0 &&
            addedLabels.length === 0 &&
            linkedLabels.length === 0 &&
            !poolRecipeId &&
            !poolSideRecipeId
          ) {
            if (alreadyFullyLinked || pitch.recipeId || pitch.sideRecipeId) {
              return {
                ok: true,
                message: 'Schon mit dem Rezepte-Pool verknüpft.',
                recipeIds: [pitch.recipeId, pitch.sideRecipeId].filter(
                  Boolean,
                ) as string[],
              }
            }
            return {
              ok: false,
              message: 'Nichts Neues zum Speichern.',
              recipeIds: [],
            }
          }

          if (
            created.length === 0 &&
            linkedLabels.length === 0 &&
            (pitch.poolRecipeId || pitch.poolSideRecipeId)
          ) {
            return {
              ok: true,
              message: 'Schon im Rezepte-Pool.',
              recipeIds: [pitch.poolRecipeId, pitch.poolSideRecipeId].filter(
                Boolean,
              ) as string[],
            }
          }

          set({
            recipes:
              created.length > 0
                ? [...created, ...get().recipes]
                : get().recipes,
            pitches: get().pitches.map((p) =>
              p.id === pitchId
                ? {
                    ...p,
                    recipeId: recipeId || p.recipeId,
                    sideRecipeId: sideRecipeId || p.sideRecipeId,
                    sideTitle: freeSideTitle || p.sideTitle,
                    poolRecipeId: poolRecipeId || p.poolRecipeId,
                    poolSideRecipeId: poolSideRecipeId || p.poolSideRecipeId,
                  }
                : p,
            ),
          })

          const message =
            addedLabels.length > 0
              ? `Zum Rezepte-Pool: ${addedLabels.join(', ')}`
              : `Mit Pool verknüpft: ${linkedLabels.join(', ')}`

          return {
            ok: true,
            message,
            recipeIds: [
              ...created.map((r) => r.id),
              ...([poolRecipeId, poolSideRecipeId].filter(Boolean) as string[]),
            ],
          }
        },

        assignSlot: (day, payload) => {
          const week = activeWeek(get)
          if (!week) return
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
                bringSentAt: undefined,
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
            shoppingDraft:
              week.status === 'locked' ? [] : get().shoppingDraft,
          })
        },

        clearSlot: (day) => {
          const week = activeWeek(get)
          if (!week) return
          set({
            weeks: get().weeks.map((w) => {
              if (w.id !== get().activeWeekId) return w
              return {
                ...w,
                bringSentAt: undefined,
                slots: w.slots.map((s) => (s.day === day ? { day } : s)),
              }
            }),
            // Einkaufsliste neu laden, falls der Plan schon festgenagelt war
            shoppingDraft:
              week.status === 'locked' ? [] : get().shoppingDraft,
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
              w.id === get().activeWeekId
                ? { ...w, status: 'locked', bringSentAt: undefined }
                : w,
            ),
          })
        },

        reopenWeek: () => {
          set({
            weeks: get().weeks.map((w) =>
              w.id === get().activeWeekId
                ? { ...w, status: 'pitching', bringSentAt: undefined }
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
          const dayLabel = (day: Weekday) =>
            WEEKDAYS.find((d) => d.id === day)?.label ?? day
          const items: ShoppingItem[] = []
          for (const slot of week.slots) {
            if (slot.recipeId) {
              const recipe = recipes.find((r) => r.id === slot.recipeId)
              if (recipe) {
                const dish = `${recipe.title} (${dayLabel(slot.day)})`
                for (const ing of recipe.ingredients) {
                  items.push({
                    id: uid('shop'),
                    name: ing.name,
                    amount: ing.amount,
                    dish,
                    day: slot.day,
                  })
                }
              }
            } else if (slot.title?.trim()) {
              items.push({
                id: uid('shop'),
                name: slot.title.trim(),
                dish: `${slot.title.trim()} (${dayLabel(slot.day)})`,
                day: slot.day,
              })
            }
            if (slot.sideRecipeId) {
              const side = recipes.find((r) => r.id === slot.sideRecipeId)
              if (side) {
                const dish = `${side.title} (${dayLabel(slot.day)})`
                for (const ing of side.ingredients) {
                  items.push({
                    id: uid('shop'),
                    name: ing.name,
                    amount: ing.amount,
                    dish,
                    day: slot.day,
                  })
                }
              }
            } else if (slot.sideTitle?.trim()) {
              items.push({
                id: uid('shop'),
                name: slot.sideTitle.trim(),
                dish: `${slot.sideTitle.trim()} (${dayLabel(slot.day)})`,
                day: slot.day,
              })
            }
          }
          items.sort((a, b) => {
            const dayCmp = (a.day ?? '').localeCompare(b.day ?? '')
            if (dayCmp) return dayCmp
            const dishCmp = a.dish.localeCompare(b.dish, 'de')
            if (dishCmp) return dishCmp
            return a.name.localeCompare(b.name, 'de')
          })
          set({ shoppingDraft: items })
          return items
        },

        setShoppingDraft: (items) => set({ shoppingDraft: items }),

        updateShoppingItem: (id, patch) => {
          set({
            shoppingDraft: get().shoppingDraft.map((item) =>
              item.id === id ? { ...item, ...patch, id: item.id } : item,
            ),
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
          const items = (
            shoppingDraft.length > 0 ? shoppingDraft : buildShoppingList()
          ).filter((i) => i.name.trim())
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
              items: items
                .filter((i) => i.name.trim())
                .map((i) => ({
                  name: i.name.trim(),
                  amount: [i.amount?.trim(), i.dish?.trim()]
                    .filter(Boolean)
                    .join(' · '),
                })),
            })
            const lines =
              res.added ??
              items
                .filter((i) => i.name.trim())
                .map((i) => {
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
              set({
                weeks: get().weeks.map((w) =>
                  w.id === get().activeWeekId
                    ? { ...w, bringSentAt: sentAt }
                    : w,
                ),
              })
            }
            return { ok: res.ok, message: res.message, items: lines }
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
          recipes: repairRecipeCookidooLinks(
            (Array.isArray(p.recipes) ? p.recipes : current.recipes) as Recipe[],
          ),
        }
      },
    },
  ),
)
