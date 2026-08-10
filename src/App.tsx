import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChefHat,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Home,
  Lightbulb,
  Lock,
  LockOpen,
  Menu,
  MessageSquarePlus,
  MoreVertical,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  SmilePlus,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import {
  AVATAR_EMOJIS,
  ingredientStockKey,
  mealDishLabel,
  mealLabel,
  mondayOf,
  normalizeWeekSlot,
  parseWeekMonday,
  resolveUser,
  slotHasMeal,
  weekIdFromMonday,
} from './data/seed'
import {
  categoryChipClass,
  categoryLabel,
  categoryTagClass,
  kindFromCategoryWithCustom,
  listRecipeCategories,
  resolveRecipeCategory,
  sanitizeRecipeTags,
  tagToneClass,
} from './data/categories'
import {
  AllCategoriesIcon,
  CategoryIcon,
} from './data/categoryIcons'
import {
  fetchBringList,
  importCookidooRecipeApi,
  listCookidooCollectionRecipes,
  listCookidooCollections,
  searchCookidooRecipes,
  type BringListItem,
  type CookidooBrowseRecipe,
} from './api/integrations'
import { useStore } from './store'
import { playBurstExit, useJustAppeared } from './motion'
import {
  getSyncStatus,
  subscribeSync,
  type SyncStatus,
} from './sync/householdSync'
import type {
  Ingredient,
  MealEmote,
  Recipe,
  RecipeCategory,
  UserId,
  WeekMeal,
  WeekSlot,
  Weekday,
} from './types'
import { MEAL_EMOTES } from './types'

type Tab = 'week' | 'pitch' | 'recipes' | 'shop' | 'settings' | 'help'

const TAB_STORAGE_KEY = 'wochenkochen-tab'
const VALID_TABS: Tab[] = [
  'week',
  'pitch',
  'recipes',
  'shop',
  'settings',
  'help',
]

function readStoredTab(): Tab {
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY)
    if (raw && (VALID_TABS as string[]).includes(raw)) return raw as Tab
  } catch {
    /* ignore */
  }
  return 'week'
}

function writeStoredTab(tab: Tab) {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab)
  } catch {
    /* ignore */
  }
}

const WEEKDAY_LABELS: Record<Weekday, string> = {
  mo: 'Montag',
  di: 'Dienstag',
  mi: 'Mittwoch',
  do: 'Donnerstag',
  fr: 'Freitag',
  sa: 'Samstag',
  so: 'Sonntag',
}

const WEEKDAY_COLOR_CLASS: Record<Weekday, string> = {
  mo: 'day-title-mo',
  di: 'day-title-di',
  mi: 'day-title-mi',
  do: 'day-title-do',
  fr: 'day-title-fr',
  sa: 'day-title-sa',
  so: 'day-title-so',
}

function Avatar({ userId, size = 28 }: { userId: UserId; size?: number }) {
  const profiles = useStore((s) => s.settings.profiles)
  const user = resolveUser(userId, profiles)
  return (
    <span
      className={`avatar${user.emoji ? ' emoji' : ''}`}
      style={{
        background: user.emoji ? 'var(--panel)' : user.color,
        width: size,
        height: size,
        fontSize: user.emoji ? Math.round(size * 0.72) : undefined,
      }}
      title={user.name}
      aria-hidden
    >
      {user.emoji || user.short}
    </span>
  )
}

function useResolvedUser(userId: UserId) {
  const profiles = useStore((s) => s.settings.profiles)
  return resolveUser(userId, profiles)
}

function MealEmoteControl({
  day,
  meal,
}: {
  day: Weekday
  meal: WeekMeal
}) {
  const currentUser = useStore((s) => s.currentUser)
  const profiles = useStore((s) => s.settings.profiles)
  const setMealEmote = useStore((s) => s.setMealEmote)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const mine = currentUser ? meal.emotes?.[currentUser] : undefined
  const entries = (['darius', 'wendy'] as const)
    .map((uid) =>
      meal.emotes?.[uid]
        ? { uid, emote: meal.emotes[uid] as MealEmote }
        : null,
    )
    .filter(Boolean) as { uid: UserId; emote: MealEmote }[]

  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      className={`meal-emote${open ? ' open' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className={`btn ghost sm meal-emote-trigger${mine ? ' has-mine' : ''}`}
        aria-label="Reaktion wählen"
        aria-expanded={open}
        title="Reaktion abgeben"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <SmilePlus size={16} aria-hidden />
      </button>
      {entries.length > 0 ? (
        <div className="meal-emote-shown" aria-label="Reaktionen">
          {entries.map(({ uid, emote }) => {
            const who = resolveUser(uid, profiles)
            return (
              <span
                key={uid}
                className={`meal-emote-chip${uid === currentUser ? ' mine' : ''}`}
                title={`${who.name}: ${emote}`}
              >
                <span className="meal-emote-who">{who.short}</span>
                <span aria-hidden>{emote}</span>
              </span>
            )
          })}
        </div>
      ) : null}
      {open ? (
        <div
          className="meal-emote-picker fx-pop-in"
          role="listbox"
          aria-label="7 Reaktionen"
          onClick={(e) => e.stopPropagation()}
        >
          {MEAL_EMOTES.map((emote) => (
            <button
              key={emote}
              type="button"
              role="option"
              aria-selected={mine === emote}
              className={`meal-emote-option${mine === emote ? ' active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setMealEmote(day, meal.id, emote)
                setOpen(false)
              }}
            >
              {emote}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function IngredientList({
  items,
  onBring = false,
  stockKeys,
  stockSource,
  onToggleStock,
}: {
  items: Ingredient[]
  onBring?: boolean
  stockKeys?: string[]
  stockSource?: 'main' | 'side'
  onToggleStock?: (ingredientName: string) => void
}) {
  if (items.length === 0) {
    return <p className="muted tiny">Keine Zutaten hinterlegt.</p>
  }
  const editable = Boolean(onToggleStock && stockSource)
  return (
    <ul className={`ingredient-list${editable ? ' stockable' : ''}`}>
      {items.map((item, i) => {
        const inStock =
          editable &&
          (stockKeys ?? []).includes(
            ingredientStockKey(stockSource!, item.name),
          )
        const content = (
          <>
            <span className="ingredient-main">
              {editable ? (
                <span
                  className={`stock-check${inStock ? ' on' : ''}`}
                  aria-hidden
                >
                  {inStock ? (
                    <Check size={14} strokeWidth={3} />
                  ) : (
                    <span className="stock-check-empty" />
                  )}
                </span>
              ) : null}
              <span className={inStock ? 'stock-name' : undefined}>
                {item.name}
              </span>
              {inStock ? (
                <span className="tag tag-stock">Auf Lager</span>
              ) : null}
              {onBring && !inStock ? (
                <span className="tag tag-bring">Auf Bring</span>
              ) : null}
            </span>
            {item.amount ? <strong>{item.amount}</strong> : null}
          </>
        )
        if (editable) {
          return (
            <li
              key={`${item.name}-${i}`}
              className={`${inStock ? 'in-stock' : ''}${onBring && !inStock ? ' on-bring' : ''}`}
            >
              <button
                type="button"
                className="ingredient-stock-btn"
                aria-pressed={inStock}
                aria-label={
                  inStock
                    ? `${item.name} — nicht mehr auf Lager`
                    : `${item.name} — auf Lager abhaken`
                }
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleStock!(item.name)
                }}
              >
                {content}
              </button>
            </li>
          )
        }
        return (
          <li
            key={`${item.name}-${i}`}
            className={onBring ? 'on-bring' : undefined}
          >
            {content}
          </li>
        )
      })}
    </ul>
  )
}

function RecipeDetailBlock({
  recipe,
  fallbackTitle,
  role,
  onBring = false,
  stockKeys,
  stockSource,
  onToggleStock,
}: {
  recipe?: Recipe
  fallbackTitle?: string
  role?: string
  onBring?: boolean
  stockKeys?: string[]
  stockSource?: 'main' | 'side'
  onToggleStock?: (ingredientName: string) => void
}) {
  const customCategories = useStore((s) => s.settings.customCategories ?? [])
  const author = useResolvedUser(recipe?.createdBy ?? 'darius')
  const title = recipe?.title || fallbackTitle
  if (!title) return null
  const kind = recipe?.kind ?? 'meal'
  const category = recipe
    ? resolveRecipeCategory(recipe)
    : undefined
  const ingredients =
    recipe?.ingredients?.length
      ? recipe.ingredients
      : onToggleStock
        ? [{ name: title }]
        : []

  return (
    <section className={`recipe-detail ${onBring ? 'on-bring' : ''}`}>
      <div className="row">
        <div className="grow">
          {role ? <p className="muted tiny">{role}</p> : null}
          <h3>{title}</h3>
          {recipe ? (
            <p className="muted tiny">
              {categoryLabel(category!, customCategories)} · von {author.name} ·{' '}
              {recipe.ingredients.length} Zutaten
            </p>
          ) : (
            <p className="muted tiny">Freitext — kein Bibliotheks-Rezept</p>
          )}
        </div>
        {recipe ? <Avatar userId={recipe.createdBy} /> : null}
      </div>
      <div className="tags">
        {onBring ? <span className="tag tag-bring">Auf Bring</span> : null}
        {category ? (
          <span className={categoryTagClass(category)}>
            <CategoryIcon category={category} size={14} />
            {categoryLabel(category, customCategories)}
          </span>
        ) : null}
        {kind === 'base' && category !== 'base' ? (
          <span className="tag tag-cat tag-cat-base">Basis</span>
        ) : null}
        {kind === 'side' && category !== 'side' ? (
          <span className="tag tag-cat tag-cat-side">Beilage</span>
        ) : null}
        {recipe
          ? sanitizeRecipeTags(recipe.tags, {
              category: category ?? undefined,
              categoryLabel: category
                ? categoryLabel(category, customCategories)
                : undefined,
              hasCookidoo: Boolean(recipe.cookidooUrl || recipe.cookidooId),
            }).map((t) => (
              <span key={t} className={`tag ${tagToneClass(t)}`}>
                {t}
              </span>
            ))
          : null}
        {recipe?.cookidooUrl ? (
          <span className="tag tag-cookidoo">Cookidoo</span>
        ) : null}
      </div>
      {recipe?.notes ? <p className="muted">{recipe.notes}</p> : null}
      {ingredients.length > 0 ? (
        <IngredientList
          items={ingredients}
          onBring={onBring}
          stockKeys={stockKeys}
          stockSource={stockSource}
          onToggleStock={onToggleStock}
        />
      ) : null}
      {recipe?.cookidooUrl ? (
        <a
          className="tiny"
          href={recipe.cookidooUrl}
          target="_blank"
          rel="noreferrer"
        >
          In Cookidoo öffnen ↗
        </a>
      ) : null}
    </section>
  )
}

function MealDetailModal({
  day,
  slot,
  recipes,
  sentMealIds,
  onClose,
  onClear,
  onRemoveMeal,
}: {
  day: Weekday
  slot: WeekSlot
  recipes: Recipe[]
  sentMealIds?: Set<string>
  onClose: () => void
  onClear?: () => void
  onRemoveMeal?: (mealId: string) => void
}) {
  const toggleMealStock = useStore((s) => s.toggleMealStock)
  const meals = normalizeWeekSlot(slot).meals
  const mealIds = useMemo(
    () => normalizeWeekSlot(slot).meals.map((m) => m.id),
    [slot],
  )
  const freshMeals = useJustAppeared(mealIds)
  const headline =
    meals.length === 0
      ? 'Gericht'
      : meals.length === 1
        ? mealDishLabel(meals[0], recipes)
        : `${meals.length} Gerichte`
  const allSent =
    meals.length > 0 && meals.every((m) => sentMealIds?.has(m.id))
  const someSent = meals.some((m) => sentMealIds?.has(m.id))

  const removeWithBurst = (
    mealId: string,
    e: MouseEvent<HTMLButtonElement>,
  ) => {
    if (!onRemoveMeal) return
    const block = e.currentTarget.closest('.day-meal-block') as HTMLElement | null
    playBurstExit(block, () => onRemoveMeal(mealId))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal stack meal-detail-modal fx-pop-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Rezept ${WEEKDAY_LABELS[day]}`}
      >
        <div className="section-head">
          <div>
            <p className={`tiny day-title ${WEEKDAY_COLOR_CLASS[day]}`}>
              {WEEKDAY_LABELS[day]}
            </p>
            <h2>{headline}</h2>
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Schließen
          </button>
        </div>

        {allSent ? (
          <div className="bring-sent-banner" role="status">
            <ShoppingCart size={16} aria-hidden />
            Zutaten dieses Tags sind auf der Bring-Liste
          </div>
        ) : someSent ? (
          <div className="bring-sent-banner partial" role="status">
            <ShoppingCart size={16} aria-hidden />
            Teilweise auf Bring — neue Gerichte noch nachsenden
          </div>
        ) : null}

        <p className="muted tiny">
          Zutaten antippen = schon daheim („Auf Lager“) — die landen nicht auf
          Bring.
        </p>

        {meals.length === 0 ? (
          <p className="muted">Für diesen Tag liegt noch kein Rezept vor.</p>
        ) : (
          meals.map((meal) => {
            const main = recipes.find((r) => r.id === meal.recipeId)
            const side = recipes.find((r) => r.id === meal.sideRecipeId)
            const sideTitle = meal.sideTitle || side?.title
            const label = mealDishLabel(meal, recipes)
            const mealSent = Boolean(sentMealIds?.has(meal.id))
            const stockCount = meal.stockKeys?.length ?? 0
            return (
              <div
                key={meal.id}
                className={`stack day-meal-block${freshMeals.has(meal.id) ? ' fx-pop-in' : ''}`}
              >
                {meals.length > 1 ? (
                  <div className="row">
                    <h3 className="grow">{label}</h3>
                    {stockCount > 0 ? (
                      <span className="tag tag-stock">
                        {stockCount} auf Lager
                      </span>
                    ) : null}
                    {mealSent ? (
                      <span className="tag tag-bring">Auf Bring</span>
                    ) : null}
                    <MealEmoteControl day={day} meal={meal} />
                    {onRemoveMeal ? (
                      <button
                        type="button"
                        className="btn ghost sm icon-delete"
                        aria-label={`${label} löschen`}
                        onClick={(e) => removeWithBurst(meal.id, e)}
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    {stockCount > 0 ? (
                      <span className="tag tag-stock">
                        {stockCount} auf Lager
                      </span>
                    ) : null}
                    {mealSent ? (
                      <span className="tag tag-bring">Auf Bring</span>
                    ) : null}
                    <MealEmoteControl day={day} meal={meal} />
                    {onRemoveMeal ? (
                      <button
                        type="button"
                        className="btn ghost sm icon-delete"
                        aria-label={`${label} löschen`}
                        onClick={(e) => removeWithBurst(meal.id, e)}
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                )}
                <RecipeDetailBlock
                  recipe={main}
                  fallbackTitle={meal.title || label}
                  role={sideTitle ? 'Haupt / Basis' : undefined}
                  onBring={mealSent}
                  stockKeys={meal.stockKeys}
                  stockSource="main"
                  onToggleStock={(name) =>
                    toggleMealStock(day, meal.id, 'main', name)
                  }
                />
                {sideTitle ? (
                  <RecipeDetailBlock
                    recipe={side}
                    fallbackTitle={sideTitle}
                    role="Beilage"
                    onBring={mealSent}
                    stockKeys={meal.stockKeys}
                    stockSource="side"
                    onToggleStock={(name) =>
                      toggleMealStock(day, meal.id, 'side', name)
                    }
                  />
                ) : null}
                {meals.length === 1 && onRemoveMeal ? (
                  <button
                    type="button"
                    className="btn ghost sm icon-delete"
                    aria-label="Gericht vom Tag löschen"
                    onClick={() => {
                      onRemoveMeal(meal.id)
                      onClose()
                    }}
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                ) : null}
              </div>
            )
          })
        )}

        {onClear && meals.length > 1 ? (
          <button
            type="button"
            className="btn ghost sm icon-delete"
            aria-label="Alle Gerichte vom Tag löschen"
            onClick={() => {
              onClear()
              onClose()
            }}
          >
            <Trash2 size={18} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const JS_DAY_TO_WEEKDAY: Weekday[] = [
  'so',
  'mo',
  'di',
  'mi',
  'do',
  'fr',
  'sa',
]

function WeekCalendarModal({
  activeWeekId,
  weeks,
  onSelectDate,
  onClose,
}: {
  activeWeekId: string
  weeks: { id: string; status: string; slots: WeekSlot[] }[]
  onSelectDate: (date: Date) => void
  onClose: () => void
}) {
  const activeMonday = parseWeekMonday(activeWeekId) ?? mondayOf(new Date())
  const [cursor, setCursor] = useState(
    () => new Date(activeMonday.getFullYear(), activeMonday.getMonth(), 1),
  )

  const today = startOfToday()
  const activeWeekKey = weekIdFromMonday(activeMonday)

  const weeksById = useMemo(() => {
    const map = new Map(weeks.map((w) => [w.id, w]))
    return map
  }, [weeks])

  const cells = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const first = new Date(year, month, 1, 12)
    const gridStart = mondayOf(first)
    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      days.push(d)
    }
    return days
  }, [cursor])

  const monthTitle = cursor.toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal stack week-calendar-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Woche wählen"
      >
        <div className="section-head">
          <div>
            <h2>Kalender</h2>
            <p className="lede">Woche antippen — Mo bis So.</p>
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Schließen
          </button>
        </div>

        <div className="cal-nav">
          <button
            type="button"
            className="btn ghost sm"
            aria-label="Vorheriger Monat"
            onClick={() =>
              setCursor(
                (c) => new Date(c.getFullYear(), c.getMonth() - 1, 1),
              )
            }
          >
            ‹
          </button>
          <strong className="cal-month">{monthTitle}</strong>
          <button
            type="button"
            className="btn ghost sm"
            aria-label="Nächster Monat"
            onClick={() =>
              setCursor(
                (c) => new Date(c.getFullYear(), c.getMonth() + 1, 1),
              )
            }
          >
            ›
          </button>
        </div>

        <div className="cal-grid" role="grid" aria-label={monthTitle}>
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
          {cells.map((date) => {
            const weekKey = weekIdFromMonday(mondayOf(date))
            const week = weeksById.get(weekKey)
            const dayId = JS_DAY_TO_WEEKDAY[date.getDay()]
            const slot = week?.slots.find((s) => s.day === dayId)
            const inMonth = date.getMonth() === cursor.getMonth()
            const isToday = sameDay(date, today)
            const inActiveWeek = weekKey === activeWeekKey
            const hasMeal = slotHasMeal(slot)
            const weekLocked = week?.status === 'locked'
            const weekHasAny =
              week?.slots.some((s) => slotHasMeal(s)) ?? false

            const labelBits = [WEEKDAY_LABELS[dayId], String(date.getDate())]
            if (hasMeal) labelBits.push(weekLocked ? 'festgelegt' : 'geplant')
            else if (weekLocked) labelBits.push('Woche festgenagelt')

            return (
              <button
                key={date.toISOString()}
                type="button"
                title={labelBits.join(' · ')}
                aria-label={labelBits.join(', ')}
                className={[
                  'cal-day',
                  inMonth ? '' : 'outside',
                  isToday ? 'today' : '',
                  inActiveWeek ? 'in-active-week' : '',
                  hasMeal ? 'has-meal' : '',
                  weekLocked ? 'week-locked' : '',
                  weekLocked && hasMeal ? 'meal-locked' : '',
                  weekHasAny && !hasMeal ? 'week-has-plan' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  onSelectDate(date)
                  onClose()
                }}
              >
                <span className="cal-day-num">{date.getDate()}</span>
                {hasMeal ? (
                  <span className="cal-mark" aria-hidden>
                    {weekLocked ? '✓' : '·'}
                  </span>
                ) : weekLocked ? (
                  <span className="cal-mark faint" aria-hidden>
                    —
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="cal-legend muted tiny">
          <span>
            <i className="cal-swatch meal" /> geplant
          </span>
          <span>
            <i className="cal-swatch locked" /> festgelegt ✓
          </span>
          <span>
            <i className="cal-swatch active" /> aktuelle Woche
          </span>
        </div>
        <button
          type="button"
          className="btn secondary sm"
          onClick={() => {
            onSelectDate(new Date())
            onClose()
          }}
        >
          Zur aktuellen Woche
        </button>
      </div>
    </div>
  )
}

function startOfToday() {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d
}

function CookidooBrowseModal({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: (title: string) => void
}) {
  const settings = useStore((s) => s.settings)
  const importFromCookidooAccount = useStore((s) => s.importFromCookidooAccount)
  const [tab, setTab] = useState<'search' | 'lists' | 'link'>('search')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [recipes, setRecipes] = useState<CookidooBrowseRecipe[]>([])
  const [lists, setLists] = useState<
    { id: string | null; title: string; count?: number | null }[]
  >([])
  const [activeListTitle, setActiveListTitle] = useState<string | null>(null)
  const [manualRef, setManualRef] = useState('')
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)

  const cookies = settings.cookidoo.cookies
  const country = settings.cookidoo.country || 'de'
  const linked = settings.cookidoo.linked && Boolean(cookies)

  const runSearch = async () => {
    if (!linked || !cookies || !query.trim()) return
    setBusy(true)
    setFlash(null)
    setActiveListTitle(null)
    try {
      const res = await searchCookidooRecipes({
        cookies,
        query: query.trim(),
        country,
      })
      setRecipes(res.recipes ?? [])
      setFallbackUrl(res.searchUrl ?? null)
      setFlash(res.message + (res.hint ? ` — ${res.hint}` : ''))
    } catch (err) {
      setRecipes([])
      setFlash(err instanceof Error ? err.message : 'Suche fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const loadLists = async () => {
    if (!linked || !cookies) return
    setBusy(true)
    setFlash(null)
    try {
      const res = await listCookidooCollections({
        cookies,
        country,
      })
      setLists(res.lists ?? [])
      setFlash(res.message)
    } catch (err) {
      setLists([])
      setFlash(err instanceof Error ? err.message : 'Listen laden fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const openList = async (listId: string, title: string) => {
    if (!linked || !cookies) return
    setBusy(true)
    setFlash(null)
    setActiveListTitle(title)
    try {
      const res = await listCookidooCollectionRecipes({
        cookies,
        listId,
        country,
      })
      setRecipes(res.recipes ?? [])
      setFlash(res.message)
      setTab('search')
    } catch (err) {
      setRecipes([])
      setFlash(err instanceof Error ? err.message : 'Liste lesen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const importRecipe = async (ref: string, titleHint?: string) => {
    setImportingId(ref)
    setFlash(null)
    try {
      const res = await importFromCookidooAccount(ref)
      setFlash(res.message)
      if (res.ok) onImported(titleHint || ref)
    } catch (err) {
      setFlash(err instanceof Error ? err.message : 'Import fehlgeschlagen')
    } finally {
      setImportingId(null)
    }
  }

  useEffect(() => {
    if (tab === 'lists' && linked) {
      void loadLists()
    }
  }, [tab]) // load when switching to lists

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal stack cookidoo-browse-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Cookidoo stöbern"
      >
        <div className="section-head">
          <div>
            <h2>Cookidoo stöbern</h2>
            <p className="lede">Optional — suchen, Listen öffnen oder Link paste.</p>
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Schließen
          </button>
        </div>

        {!linked ? (
          <div className="flash bad">
            Cookidoo ist noch nicht verknüpft — Menü → Einstellungen → Cookidoo
            Login. Danach kannst du hier stöbern.
          </div>
        ) : null}

        <div className="row wrap">
          <button
            type="button"
            className={`btn sm ${tab === 'search' ? '' : 'secondary'}`}
            onClick={() => setTab('search')}
          >
            Suche
          </button>
          <button
            type="button"
            className={`btn sm ${tab === 'lists' ? '' : 'secondary'}`}
            onClick={() => setTab('lists')}
            disabled={!linked}
          >
            Meine Listen
          </button>
          <button
            type="button"
            className={`btn sm ${tab === 'link' ? '' : 'secondary'}`}
            onClick={() => setTab('link')}
          >
            Link / ID
          </button>
          <a
            className="btn sm secondary"
            href={
              query.trim()
                ? `https://cookidoo.de/search?query=${encodeURIComponent(query.trim())}`
                : 'https://cookidoo.de/'
            }
            target="_blank"
            rel="noreferrer"
          >
            cookidoo.de ↗
          </a>
        </div>

        {tab === 'search' ? (
          <div className="stack">
            <div className="row wrap">
              <div className="field grow" style={{ margin: 0 }}>
                <label htmlFor="cook-browse-q">Suchbegriff</label>
                <input
                  id="cook-browse-q"
                  value={query}
                  disabled={!linked || busy}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runSearch()
                  }}
                  placeholder="z. B. Pasta, Curry, Salat…"
                />
              </div>
              <button
                type="button"
                className="btn sm"
                disabled={!linked || busy || !query.trim()}
                onClick={() => void runSearch()}
                style={{ alignSelf: 'end' }}
              >
                <Search size={16} aria-hidden />
                {busy ? '…' : 'Suchen'}
              </button>
            </div>
            {activeListTitle ? (
              <p className="muted tiny">Liste: {activeListTitle}</p>
            ) : null}
          </div>
        ) : null}

        {tab === 'lists' ? (
          <div className="stack">
            <button
              type="button"
              className="btn secondary sm"
              disabled={!linked || busy}
              onClick={() => void loadLists()}
            >
              {busy ? 'Lade…' : 'Listen aktualisieren'}
            </button>
            {lists.length === 0 ? (
              <p className="muted tiny">
                Noch keine Listen — Favoriten/Custom Lists vom Konto erscheinen
                hier, wenn die API sie liefert.
              </p>
            ) : (
              lists.map((list, i) => (
                <button
                  key={`${list.id ?? list.title}-${i}`}
                  type="button"
                  className="btn secondary"
                  disabled={!list.id || busy}
                  onClick={() => {
                    if (list.id) void openList(list.id, list.title)
                  }}
                >
                  {list.title}
                  {list.count != null ? ` · ${list.count}` : ''}
                  {!list.id ? ' (ohne ID)' : ''}
                </button>
              ))
            )}
          </div>
        ) : null}

        {tab === 'link' ? (
          <div className="stack">
            <div className="field">
              <label htmlFor="cook-browse-ref">Cookidoo-Link oder ID</label>
              <input
                id="cook-browse-ref"
                value={manualRef}
                disabled={!linked || Boolean(importingId)}
                onChange={(e) => setManualRef(e.target.value)}
                placeholder="https://cookidoo.de/.../r123 oder r123"
              />
            </div>
            <button
              type="button"
              className="btn"
              disabled={!linked || !manualRef.trim() || Boolean(importingId)}
              onClick={() => void importRecipe(manualRef.trim())}
            >
              {importingId ? 'Importiere…' : 'Importieren'}
            </button>
          </div>
        ) : null}

        {flash ? <div className="flash">{flash}</div> : null}
        {fallbackUrl && recipes.length === 0 ? (
          <a className="tiny" href={fallbackUrl} target="_blank" rel="noreferrer">
            Stattdessen auf Cookidoo.de suchen ↗
          </a>
        ) : null}

        {tab !== 'link' && recipes.length > 0 ? (
          <div className="cookidoo-results">
            {recipes.map((r) => (
              <div key={r.id} className="cookidoo-result">
                {r.image ? (
                  <img
                    className="cookidoo-thumb"
                    src={r.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={64}
                    height={64}
                  />
                ) : (
                  <div className="cookidoo-thumb cookidoo-thumb-empty" aria-hidden />
                )}
                <div className="grow">
                  <strong>{r.title}</strong>
                  <p className="muted tiny">
                    {r.id}
                    {r.totalTime ? ` · ${r.totalTime}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn sm accent"
                  disabled={!linked || importingId === r.id}
                  onClick={() => void importRecipe(r.id, r.title)}
                >
                  {importingId === r.id ? '…' : 'Import'}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function LoginScreen() {
  const login = useStore((s) => s.login)
  const profiles = useStore((s) => s.settings.profiles)
  const darius = resolveUser('darius', profiles)
  const wendy = resolveUser('wendy', profiles)
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`
  return (
    <div className="app-shell login-shell">
      <div>
        <div className="login-hero">
          <img
            className="login-logo"
            src={logoSrc}
            alt="Wochenkochen"
            width={112}
            height={112}
          />
          <h1>Wochenkochen</h1>
          <p>
            Am Wochenende pitchen, festnageln, einkaufen — {darius.name} &amp;{' '}
            {wendy.name} planen die nächste Woche gemeinsam.
          </p>
        </div>
        <div className="panel solid stack">
          <div>
            <h2>Wer kocht mit?</h2>
            <p className="lede">Demo-Login — einfach antippen.</p>
          </div>
          <div className="user-pick">
            <button type="button" onClick={() => login('darius')}>
              <Avatar userId="darius" size={44} />
              <span>
                <strong>{darius.name}</strong>
                <span>Weiter als {darius.name}</span>
              </span>
            </button>
            <button type="button" onClick={() => login('wendy')}>
              <Avatar userId="wendy" size={44} />
              <span>
                <strong>{wendy.name}</strong>
                <span>Weiter als {wendy.name}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TopBar({
  tab,
  onOpenMenuPage,
  onHome,
}: {
  tab: Tab
  onOpenMenuPage: (page: 'settings' | 'help') => void
  onHome: () => void
}) {
  const currentUser = useStore((s) => s.currentUser)!
  const me = useResolvedUser(currentUser)
  const logout = useStore((s) => s.logout)
  const weeks = useStore((s) => s.weeks)
  const activeWeekId = useStore((s) => s.activeWeekId)
  const week = useMemo(
    () => weeks.find((w) => w.id === activeWeekId),
    [weeks, activeWeekId],
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: Event) => {
      const target = (e as globalThis.MouseEvent).target
      if (!menuRef.current?.contains(target as Node)) setMenuOpen(false)
    }
    const onKey = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const pageTitle =
    tab === 'settings'
      ? 'Einstellungen'
      : tab === 'help'
        ? 'Hilfe'
        : 'Wochenkochen'
  const onHomePage = tab === 'week'
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className={`home-btn logo-home ${onHomePage ? 'active' : ''}`}
          onClick={onHome}
          aria-label="Zur Startseite"
          title="Startseite"
        >
          <img src={logoSrc} alt="Wochenkochen" width={34} height={34} />
        </button>
        <div className="file-menu" ref={menuRef}>
          <button
            type="button"
            className={`file-menu-btn ${menuOpen ? 'open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Menü"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Menu size={18} />
            <span className="file-menu-label">Menü</span>
          </button>
          {menuOpen ? (
            <div className="file-menu-panel" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onHome()
                }}
              >
                <Home size={16} />
                Startseite
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onOpenMenuPage('settings')
                }}
              >
                <Settings size={16} />
                Einstellungen…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onOpenMenuPage('help')
                }}
              >
                <CircleHelp size={16} />
                Hilfe
              </button>
              <div className="file-menu-sep" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  logout()
                }}
              >
                Abmelden
              </button>
            </div>
          ) : null}
        </div>
        <button type="button" className="brand-mark brand-home" onClick={onHome}>
          <strong>{pageTitle}</strong>
          <span>{week?.label ?? 'Nächste Woche'}</span>
        </button>
      </div>
      <button
        type="button"
        className="user-chip"
        onClick={logout}
        title="Abmelden"
      >
        <Avatar userId={currentUser} />
        <span>{me.name}</span>
      </button>
    </header>
  )
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const bringEnabled = useStore((s) => s.settings.bring.enabled)
  const items: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
    { id: 'week', label: 'Plan', icon: CalendarDays },
    { id: 'pitch', label: 'Pitch', icon: MessageSquarePlus },
    { id: 'recipes', label: 'Rezepte', icon: ChefHat },
  ]
  if (bringEnabled) {
    items.push({ id: 'shop', label: 'Bring', icon: ShoppingCart })
  }
  return (
    <nav
      className={`bottom-nav cols-${items.length}`}
      aria-label="Hauptnavigation"
    >
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={tab === id ? 'active' : ''}
          onClick={() => setTab(id)}
        >
          <Icon />
          {label}
        </button>
      ))}
    </nav>
  )
}

function WeekView({
  onPitch,
  onShop,
}: {
  onPitch: () => void
  onShop: () => void
}) {
  const weeks = useStore((s) => s.weeks)
  const activeWeekId = useStore((s) => s.activeWeekId)
  const recipes = useStore((s) => s.recipes)
  const customCategories = useStore((s) => s.settings.customCategories ?? [])
  const allPitches = useStore((s) => s.pitches)
  const assignSlot = useStore((s) => s.assignSlot)
  const clearSlot = useStore((s) => s.clearSlot)
  const removeMeal = useStore((s) => s.removeMeal)
  const lockWeek = useStore((s) => s.lockWeek)
  const ensureWeekNotEmptyLocked = useStore((s) => s.ensureWeekNotEmptyLocked)
  const reopenWeek = useStore((s) => s.reopenWeek)
  const selectWeekByDate = useStore((s) => s.selectWeekByDate)
  const [pickingDay, setPickingDay] = useState<Weekday | null>(null)
  const [detailDay, setDetailDay] = useState<Weekday | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [pickerFilter, setPickerFilter] = useState<
    RecipeCategory | 'all' | 'pitches'
  >('all')
  const [pendingBase, setPendingBase] = useState<{
    recipeId: string
    title: string
  } | null>(null)

  const week = useMemo(
    () => weeks.find((w) => w.id === activeWeekId),
    [weeks, activeWeekId],
  )
  const weekMealIds = useMemo(() => {
    const ids: string[] = []
    for (const raw of week?.slots ?? []) {
      for (const meal of normalizeWeekSlot(raw).meals) ids.push(meal.id)
    }
    return ids
  }, [week?.slots])
  const freshMeals = useJustAppeared(weekMealIds)

  const removeMealWithBurst = (
    day: Weekday,
    mealId: string,
    el: HTMLElement | null,
  ) => {
    const weekId = activeWeekId
    playBurstExit(el, () => removeMeal(day, mealId, weekId))
  }

  const pitches = useMemo(
    () => allPitches.filter((p) => p.weekId === activeWeekId),
    [allPitches, activeWeekId],
  )
  const assignedPitchIds = useMemo(() => {
    const ids = new Set<string>()
    for (const raw of week?.slots ?? []) {
      for (const meal of normalizeWeekSlot(raw).meals) {
        if (meal.fromPitchId) ids.add(meal.fromPitchId)
      }
    }
    return ids
  }, [week?.slots])
  const pickerCategories = useMemo(
    () => listRecipeCategories(customCategories),
    [customCategories],
  )
  const sideRecipes = useMemo(
    () => recipes.filter((r) => (r.kind ?? 'meal') === 'side'),
    [recipes],
  )
  const mainRecipes = useMemo(
    () => recipes.filter((r) => (r.kind ?? 'meal') !== 'side'),
    [recipes],
  )
  const pickerRecipes = useMemo(() => {
    if (pickerFilter === 'pitches') return []
    if (pickerFilter === 'all') return mainRecipes
    return mainRecipes.filter(
      (r) => resolveRecipeCategory(r) === pickerFilter,
    )
  }, [mainRecipes, pickerFilter])
  const pickerSideRecipes = useMemo(() => {
    if (pickerFilter === 'all' || pickerFilter === 'pitches') return sideRecipes
    return sideRecipes.filter(
      (r) => resolveRecipeCategory(r) === pickerFilter,
    )
  }, [sideRecipes, pickerFilter])
  const plannedCount = useMemo(
    () => week?.slots.filter((s) => slotHasMeal(s)).length ?? 0,
    [week],
  )
  const mealCount = useMemo(
    () =>
      week?.slots.reduce(
        (n, s) => n + normalizeWeekSlot(s).meals.length,
        0,
      ) ?? 0,
    [week],
  )
  const detailSlot = useMemo(() => {
    const raw = week?.slots.find((s) => s.day === detailDay)
    return raw ? normalizeWeekSlot(raw) : null
  }, [week, detailDay])
  const sentMealIds = useMemo(
    () => new Set(week?.bringSentMealIds ?? []),
    [week?.bringSentMealIds],
  )

  useEffect(() => {
    ensureWeekNotEmptyLocked()
  }, [week?.id, week?.status, plannedCount, ensureWeekNotEmptyLocked])

  useEffect(() => {
    if (detailDay && detailSlot && detailSlot.meals.length === 0) {
      setDetailDay(null)
    }
  }, [detailDay, detailSlot])

  if (!week) return null

  const closePicker = () => {
    setPickingDay(null)
    setPendingBase(null)
    setPickerFilter('all')
  }

  const pickRecipeForDay = (r: (typeof recipes)[number]) => {
    if (!pickingDay) return
    if ((r.kind ?? 'meal') === 'base' || resolveRecipeCategory(r) === 'base') {
      setPendingBase({ recipeId: r.id, title: r.title })
      setPickerFilter('all')
      return
    }
    assignSlot(pickingDay, {
      recipeId: r.id,
      title: r.title,
    })
    closePicker()
  }

  const pitching = week.status === 'pitching'
  const phasePlan =
    pitching && plannedCount === 0
      ? 'current'
      : !pitching || plannedCount > 0
        ? 'done'
        : ''
  const phaseLock = !pitching
    ? 'done'
    : plannedCount > 0
      ? 'current'
      : 'next'
  const phaseShop = pitching
    ? 'idle'
    : week.bringSentAt
      ? 'done'
      : 'current'
  const activePhase = pitching
    ? plannedCount === 0
      ? 'plan'
      : 'lock'
    : week.bringSentAt
      ? 'sent'
      : 'shop'
  const bringSent = Boolean(week.bringSentAt)

  return (
    <div className="stack">
      <div className={`panel week-toolbar phase-${pitching ? 'open' : 'locked'} active-${activePhase}`}>
        <div className="week-toolbar-top">
          <div className="week-toolbar-title">
            <p className="week-toolbar-kicker">Wochenplan</p>
            <h2>{week.label}</h2>
            <p className={`week-toolbar-meta phase-meta-${activePhase}`}>
              <span className={`phase-badge phase-badge-${activePhase}`}>
                {activePhase === 'plan' && 'Planen'}
                {activePhase === 'lock' && 'Festnageln'}
                {activePhase === 'shop' && 'Einkaufen'}
                {activePhase === 'sent' && 'Auf Bring'}
              </span>
              {pitching
                ? plannedCount === 0
                  ? 'Tag tippen und Gericht wählen'
                  : mealCount > plannedCount
                    ? `${plannedCount}/7 Tage · ${mealCount} Gerichte`
                    : `${plannedCount}/7 geplant — dann einkaufen`
                : bringSent
                  ? `Zutaten an Bring gesendet · ${plannedCount} Tage`
                  : `${plannedCount} Tage fest — Plan öffnen zum Ändern`}
            </p>
          </div>
          <button
            type="button"
            className="btn secondary sm week-cal-btn"
            onClick={() => setCalendarOpen(true)}
            aria-label="Andere Woche wählen"
          >
            <CalendarRange size={18} aria-hidden />
          </button>
        </div>

        <ol className="week-steps" aria-label="Wochen-Phasen">
          <li className={`week-step step-plan ${phasePlan}`}>
            <span className="week-step-icon" aria-hidden>
              {phasePlan === 'done' ? <Check size={16} /> : <UtensilsCrossed size={16} />}
            </span>
            <span className="week-step-label">Planen</span>
          </li>
          <li className={`week-step step-lock ${phaseLock}`}>
            <span className="week-step-icon" aria-hidden>
              {phaseLock === 'done' ? <Check size={16} /> : <Pin size={16} />}
            </span>
            <span className="week-step-label">Festnageln</span>
          </li>
          <li className={`week-step step-shop ${phaseShop}`}>
            <span className="week-step-icon" aria-hidden>
              {phaseShop === 'done' ? (
                <Check size={16} />
              ) : phaseShop === 'current' ? (
                <ShoppingBasket size={16} />
              ) : (
                <Lock size={16} />
              )}
            </span>
            <span className="week-step-label">
              {phaseShop === 'done' ? 'Auf Bring' : 'Einkaufen'}
            </span>
          </li>
        </ol>

        <div className="week-toolbar-actions">
          {pitching ? (
            <>
              <button
                type="button"
                className="btn accent week-action-primary"
                disabled={plannedCount === 0}
                onClick={() => {
                  lockWeek()
                  onShop()
                }}
              >
                <ShoppingBasket size={18} aria-hidden />
                Festnageln &amp; einkaufen
              </button>
              <button
                type="button"
                className="btn secondary week-action-secondary"
                onClick={onPitch}
              >
                <Lightbulb size={16} aria-hidden />
                Ideen pitchen
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn accent week-action-primary"
                onClick={onShop}
              >
                <ShoppingBasket size={18} aria-hidden />
                Zur Einkaufsliste
              </button>
              <button
                type="button"
                className="btn ghost week-action-secondary"
                onClick={reopenWeek}
              >
                <LockOpen size={16} aria-hidden />
                Plan wieder öffnen
              </button>
            </>
          )}
        </div>
      </div>

      <div className="day-grid">
        {week.slots.map((rawSlot) => {
          const slot = normalizeWeekSlot(rawSlot)
          const hasMeal = slotHasMeal(slot)
          const dayAllSent =
            hasMeal && slot.meals.every((m) => sentMealIds.has(m.id))
          const daySomeSent = slot.meals.some((m) => sentMealIds.has(m.id))
          return (
            <div
              key={slot.day}
              className={`day-card ${hasMeal ? 'clickable' : 'empty'}${
                dayAllSent ? ' bring-sent' : ''
              }`}
              role={hasMeal ? 'button' : undefined}
              tabIndex={hasMeal ? 0 : undefined}
              onClick={hasMeal ? () => setDetailDay(slot.day) : undefined}
              onKeyDown={
                hasMeal
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setDetailDay(slot.day)
                      }
                    }
                  : undefined
              }
            >
              <div className="row">
                <strong className={`grow day-title ${WEEKDAY_COLOR_CLASS[slot.day]}`}>
                  {WEEKDAY_LABELS[slot.day]}
                </strong>
                {dayAllSent ? (
                  <span
                    className="tag tag-ordered"
                    title="Zutaten schon an Bring gesendet"
                  >
                    <Check size={14} strokeWidth={3} aria-hidden />
                    <ShoppingCart size={14} aria-hidden />
                    Auf Bring
                  </span>
                ) : daySomeSent ? (
                  <span className="tag tag-ordered" title="Teilweise auf Bring">
                    <ShoppingCart size={14} aria-hidden />
                    Teilweise
                  </span>
                ) : null}
              </div>
              {hasMeal ? (
                <ul className="day-meal-list">
                  {slot.meals.map((meal) => {
                    const recipe = recipes.find((r) => r.id === meal.recipeId)
                    const sideRecipe = recipes.find(
                      (r) => r.id === meal.sideRecipeId,
                    )
                    const side = meal.sideTitle || sideRecipe?.title
                    const mealSent = sentMealIds.has(meal.id)
                    return (
                      <li
                        key={meal.id}
                        className={`day-meal-item${freshMeals.has(meal.id) ? ' fx-pop-in' : ''}`}
                      >
                        <div className="row">
                          <h3 className="grow">{mealDishLabel(meal, recipes)}</h3>
                          {mealSent ? (
                            <span className="tag tag-ordered" title="Auf Bring">
                              <Check size={12} strokeWidth={3} aria-hidden />
                            </span>
                          ) : null}
                          {(meal.stockKeys?.length ?? 0) > 0 ? (
                            <span
                              className="tag tag-stock"
                              title="Zutaten auf Lager"
                            >
                              Lager
                            </span>
                          ) : null}
                          <MealEmoteControl day={slot.day} meal={meal} />
                          {pitching ? (
                            <button
                              type="button"
                              className="btn ghost sm icon-delete day-meal-remove"
                              aria-label="Gericht löschen"
                              onClick={(e) => {
                                e.stopPropagation()
                                const item = e.currentTarget.closest(
                                  '.day-meal-item',
                                ) as HTMLElement | null
                                removeMealWithBurst(slot.day, meal.id, item)
                              }}
                            >
                              <Trash2 size={16} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                        <div className="tags">
                          {recipe ? (
                            <>
                              {(() => {
                                const cat = resolveRecipeCategory(recipe)
                                return (
                                  <span className={categoryTagClass(cat)}>
                                    <CategoryIcon category={cat} size={13} />
                                    {categoryLabel(cat, customCategories)}
                                  </span>
                                )
                              })()}
                              {recipe.kind === 'base' &&
                              resolveRecipeCategory(recipe) !== 'base' ? (
                                <span className="tag tag-cat tag-cat-base">
                                  Basis
                                </span>
                              ) : null}
                              {sanitizeRecipeTags(recipe.tags, {
                                category: resolveRecipeCategory(recipe),
                                categoryLabel: categoryLabel(
                                  resolveRecipeCategory(recipe),
                                  customCategories,
                                ),
                                hasCookidoo: Boolean(
                                  recipe.cookidooUrl || recipe.cookidooId,
                                ),
                              }).map((t) => (
                                <span
                                  key={`${meal.id}-m-${t}`}
                                  className={`tag ${tagToneClass(t)}`}
                                >
                                  {t}
                                </span>
                              ))}
                            </>
                          ) : null}
                          {sideRecipe ? (
                            <>
                              {(() => {
                                const cat = resolveRecipeCategory(sideRecipe)
                                return (
                                  <span className={categoryTagClass(cat)}>
                                    <CategoryIcon category={cat} size={13} />
                                    {categoryLabel(cat, customCategories)}
                                  </span>
                                )
                              })()}
                              {sanitizeRecipeTags(sideRecipe.tags, {
                                category: resolveRecipeCategory(sideRecipe),
                                categoryLabel: categoryLabel(
                                  resolveRecipeCategory(sideRecipe),
                                  customCategories,
                                ),
                                hasCookidoo: Boolean(
                                  sideRecipe.cookidooUrl ||
                                    sideRecipe.cookidooId,
                                ),
                              }).map((t) => (
                                <span
                                  key={`${meal.id}-s-${t}`}
                                  className={`tag ${tagToneClass(t)}`}
                                >
                                  {t}
                                </span>
                              ))}
                            </>
                          ) : side ? (
                            <span className="tag tag-cat tag-cat-side">
                              Beilage
                            </span>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              {pitching ? (
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPendingBase(null)
                    setPickingDay(slot.day)
                  }}
                >
                  {hasMeal ? '+ weiteres Gericht' : 'Gericht wählen'}
                </button>
              ) : !hasMeal ? (
                <p className="muted tiny">Plan fest — zum Ändern wieder öffnen</p>
              ) : null}
            </div>
          )
        })}
      </div>

      {detailDay && detailSlot ? (
        <MealDetailModal
          day={detailDay}
          slot={detailSlot}
          recipes={recipes}
          sentMealIds={sentMealIds}
          onClose={() => setDetailDay(null)}
          onClear={
            pitching
              ? () => clearSlot(detailDay)
              : undefined
          }
          onRemoveMeal={
            pitching
              ? (mealId) => removeMeal(detailDay, mealId, activeWeekId)
              : undefined
          }
        />
      ) : null}

      {calendarOpen ? (
        <WeekCalendarModal
          activeWeekId={activeWeekId}
          weeks={weeks}
          onSelectDate={selectWeekByDate}
          onClose={() => setCalendarOpen(false)}
        />
      ) : null}

      {pickingDay && pitching ? (
        <div className="modal-backdrop" onClick={closePicker}>
          <div
            className="modal stack fx-pop-in meal-picker-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-head">
              <h2>
                {pendingBase
                  ? `Beilage zu ${pendingBase.title}`
                  : slotHasMeal(
                        week.slots.find((s) => s.day === pickingDay),
                      )
                    ? `Weiteres Gericht · ${WEEKDAY_LABELS[pickingDay]}`
                    : WEEKDAY_LABELS[pickingDay]}
              </h2>
              <button
                type="button"
                className="btn ghost sm"
                onClick={closePicker}
              >
                Schließen
              </button>
            </div>

            {pendingBase ? (
              <>
                <p className="muted tiny">
                  Beilage wählen oder ohne Beilage übernehmen.
                </p>
                <div
                  className="category-filters"
                  role="tablist"
                  aria-label="Beilagen-Kategorien"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={pickerFilter === 'all'}
                    className={`chip-filter chip-cat-all${pickerFilter === 'all' ? ' active' : ''}`}
                    onClick={() => setPickerFilter('all')}
                  >
                    <AllCategoriesIcon size={15} />
                    Alle ({sideRecipes.length})
                  </button>
                  {pickerCategories.map((c) => {
                    const count = sideRecipes.filter(
                      (r) => resolveRecipeCategory(r) === c.id,
                    ).length
                    if (!count) return null
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="tab"
                        aria-selected={pickerFilter === c.id}
                        className={categoryChipClass(
                          c.id,
                          pickerFilter === c.id,
                        )}
                        onClick={() => setPickerFilter(c.id)}
                      >
                        <CategoryIcon category={c.id} size={15} />
                        {c.label} ({count})
                      </button>
                    )
                  })}
                </div>
                {pickerSideRecipes.length === 0 ? (
                  <p className="muted">Keine Beilagen in dieser Kategorie.</p>
                ) : (
                  <div className="meal-picker-list">
                    {pickerSideRecipes.map((r) => {
                      const cat = resolveRecipeCategory(r)
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className="btn secondary meal-picker-item"
                          onClick={() => {
                            assignSlot(pickingDay, {
                              recipeId: pendingBase.recipeId,
                              title: pendingBase.title,
                              sideRecipeId: r.id,
                              sideTitle: r.title,
                            })
                            closePicker()
                          }}
                        >
                          <span className="meal-picker-item-title">
                            {r.title}
                          </span>
                          <span className={categoryTagClass(cat)}>
                            <CategoryIcon category={cat} size={13} />
                            {categoryLabel(cat, customCategories)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    assignSlot(pickingDay, {
                      recipeId: pendingBase.recipeId,
                      title: pendingBase.title,
                    })
                    closePicker()
                  }}
                >
                  Nur {pendingBase.title} (ohne Beilage)
                </button>
              </>
            ) : (
              <>
                <div
                  className="category-filters"
                  role="tablist"
                  aria-label="Rezept-Kategorien"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={pickerFilter === 'all'}
                    className={`chip-filter chip-cat-all${pickerFilter === 'all' ? ' active' : ''}`}
                    onClick={() => setPickerFilter('all')}
                  >
                    <AllCategoriesIcon size={15} />
                    Alle ({mainRecipes.length})
                  </button>
                  {pitches.length > 0 ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={pickerFilter === 'pitches'}
                      className={`chip-filter chip-cat-pitches${pickerFilter === 'pitches' ? ' active' : ''}`}
                      onClick={() => setPickerFilter('pitches')}
                    >
                      Pitches ({pitches.length})
                    </button>
                  ) : null}
                  {pickerCategories.map((c) => {
                    const count = mainRecipes.filter(
                      (r) => resolveRecipeCategory(r) === c.id,
                    ).length
                    if (!count && c.builtin) return null
                    if (!count && !c.builtin) return null
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="tab"
                        aria-selected={pickerFilter === c.id}
                        className={categoryChipClass(
                          c.id,
                          pickerFilter === c.id,
                        )}
                        onClick={() => setPickerFilter(c.id)}
                      >
                        <CategoryIcon category={c.id} size={15} />
                        {c.label} ({count})
                      </button>
                    )
                  })}
                </div>

                {pickerFilter === 'pitches' ? (
                  pitches.length === 0 ? (
                    <p className="muted">Noch keine Pitches — erst vorschlagen.</p>
                  ) : (
                    <div className="meal-picker-list">
                      {pitches.map((p) => {
                        const alreadyInPlan = assignedPitchIds.has(p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className={`btn secondary meal-picker-item${alreadyInPlan ? ' pitch-assigned' : ''}`}
                            onClick={() => {
                              assignSlot(pickingDay, {
                                recipeId: p.recipeId,
                                title: p.title,
                                sideRecipeId: p.sideRecipeId,
                                sideTitle: p.sideTitle,
                                fromPitchId: p.id,
                              })
                              closePicker()
                            }}
                          >
                            <span className="meal-picker-item-title">
                              {mealLabel(p.title, p.sideTitle)}
                              {alreadyInPlan ? ' · schon im Plan' : ''}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )
                ) : pickerRecipes.length === 0 ? (
                  <p className="muted">
                    {pickerFilter === 'side'
                      ? 'Beilagen wählst du nach einer Basis (z. B. Reis oder Nudeln).'
                      : 'Keine Rezepte in dieser Kategorie.'}
                  </p>
                ) : (
                  <div className="meal-picker-list">
                    {pickerRecipes.map((r) => {
                      const cat = resolveRecipeCategory(r)
                      const isBase =
                        (r.kind ?? 'meal') === 'base' || cat === 'base'
                      return (
                        <button
                          key={r.id}
                          type="button"
                          className="btn secondary meal-picker-item"
                          onClick={() => pickRecipeForDay(r)}
                        >
                          <span className="meal-picker-item-title">
                            {r.title}
                            {isBase ? ' · danach Beilage' : ''}
                          </span>
                          <span className={categoryTagClass(cat)}>
                            <CategoryIcon category={cat} size={13} />
                            {categoryLabel(cat, customCategories)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PitchView() {
  const currentUser = useStore((s) => s.currentUser)!
  const profiles = useStore((s) => s.settings.profiles)
  const recipes = useStore((s) => s.recipes)
  const allPitches = useStore((s) => s.pitches)
  const activeWeekId = useStore((s) => s.activeWeekId)
  const weeks = useStore((s) => s.weeks)
  const addPitch = useStore((s) => s.addPitch)
  const deletePitch = useStore((s) => s.deletePitch)
  const reactToPitch = useStore((s) => s.reactToPitch)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [recipeId, setRecipeId] = useState('')
  const [sideRecipeId, setSideRecipeId] = useState('')
  const [sideFree, setSideFree] = useState('')
  const [attachSide, setAttachSide] = useState(false)
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(
    null,
  )
  const pitches = useMemo(
    () => allPitches.filter((p) => p.weekId === activeWeekId),
    [allPitches, activeWeekId],
  )
  const pitchIds = useMemo(() => pitches.map((p) => p.id), [pitches])
  const freshPitches = useJustAppeared(pitchIds)
  const week = useMemo(
    () => weeks.find((w) => w.id === activeWeekId),
    [weeks, activeWeekId],
  )
  const locked = week?.status === 'locked'
  const selected = recipes.find((r) => r.id === recipeId)
  const showSideFields =
    attachSide || (selected?.kind ?? 'meal') === 'base' || Boolean(sideRecipeId || sideFree)
  const sideRecipes = recipes.filter((r) => (r.kind ?? 'meal') === 'side')
  const mainRecipes = recipes.filter((r) => (r.kind ?? 'meal') !== 'side')

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4500)
    return () => clearTimeout(t)
  }, [flash])

  return (
    <div className="stack">
      <div className="panel stack">
        <div>
          <h2>Pitch-Modus</h2>
          <p className="lede">
            {locked
              ? 'Woche ist festgenagelt — zum Weiterpitchen erst wieder öffnen.'
              : 'Vorschläge pitchen und abstimmen — doppeltes Yes übernimmt automatisch in den Rezepte-Pool und entfernt den Pitch.'}
          </p>
        </div>
        {locked ? (
          <p className="muted tiny">
            Abstimmen und neue Pitches sind während „Festgenagelt“ gesperrt.
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="pitch-recipe">Rezept / Basis</label>
          <select
            id="pitch-recipe"
            value={recipeId}
            disabled={locked}
            onChange={(e) => {
              setRecipeId(e.target.value)
              const r = recipes.find((x) => x.id === e.target.value)
              if (r) setTitle(r.title)
              setSideRecipeId('')
              setSideFree('')
              setAttachSide((r?.kind ?? 'meal') === 'base')
            }}
          >
            <option value="">— freier Pitch —</option>
            {mainRecipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
                {(r.kind ?? 'meal') === 'base' ? ' (Basis)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pitch-title">Titel</label>
          <input
            id="pitch-title"
            value={title}
            disabled={locked}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="z. B. Reis oder Ramen-Abend"
          />
        </div>
        {showSideFields ? (
          <>
            <div className="field">
              <label htmlFor="pitch-side">Beilage (abstimmen)</label>
              <select
                id="pitch-side"
                value={sideRecipeId}
                disabled={locked}
                onChange={(e) => {
                  setSideRecipeId(e.target.value)
                  if (e.target.value) setSideFree('')
                }}
              >
                <option value="">— Beilage wählen —</option>
                {sideRecipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pitch-side-free">Oder freie Beilage</label>
              <input
                id="pitch-side-free"
                value={sideFree}
                disabled={locked}
                onChange={(e) => {
                  setSideFree(e.target.value)
                  if (e.target.value) setSideRecipeId('')
                }}
                placeholder="z. B. Joghurt & Gurkensalat"
              />
            </div>
            <p className="muted tiny">
              Tipp: Mehrere Pitches mit derselben Basis (Reis) und anderen
              Beilagen — dann separat mit Yes/Maybe/Nope abstimmen.
            </p>
          </>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setAttachSide(true)}
          >
            + Beilage anhängen
          </button>
        )}
        <div className="field">
          <label htmlFor="pitch-note">Notiz</label>
          <textarea
            id="pitch-note"
            value={note}
            disabled={locked}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Warum cool? Zeitaufwand? Wünsche?"
          />
        </div>
        <button
          type="button"
          className="btn accent"
          disabled={locked || !title.trim()}
          onClick={() => {
            const sideTitle =
              sideFree.trim() ||
              sideRecipes.find((r) => r.id === sideRecipeId)?.title
            addPitch({
              title,
              note,
              recipeId: recipeId || undefined,
              sideRecipeId: sideRecipeId || undefined,
              sideTitle,
            })
            setTitle('')
            setNote('')
            setRecipeId('')
            setSideRecipeId('')
            setSideFree('')
            setAttachSide(false)
          }}
        >
          Pitch absenden
        </button>
      </div>

      {flash ? (
        <div className={`flash ${flash.ok ? '' : 'bad'}`}>{flash.message}</div>
      ) : null}

      {pitches.map((p) => (
          <article
            key={p.id}
            className={`pitch-card${freshPitches.has(p.id) ? ' fx-pop-in' : ''}`}
          >
            <div className="row">
              <Avatar userId={p.pitchedBy} />
              <div className="grow">
                <h3>{mealLabel(p.title, p.sideTitle)}</h3>
                <p className="muted tiny">
                  von {resolveUser(p.pitchedBy, profiles).name}
                  {p.sideTitle || p.sideRecipeId ? ' · Basis + Beilage' : ''}
                  {p.recipeId || p.poolRecipeId ? ' · Rezept verknüpft' : ''}
                </p>
              </div>
              {!locked ? (
                <button
                  type="button"
                  className="btn ghost sm icon-delete"
                  aria-label={`Pitch „${mealLabel(p.title, p.sideTitle)}“ löschen`}
                  onClick={(e) => {
                    const card = e.currentTarget.closest(
                      '.pitch-card',
                    ) as HTMLElement | null
                    playBurstExit(card, () => deletePitch(p.id, activeWeekId))
                  }}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              ) : null}
            </div>
            {p.note ? <p>{p.note}</p> : null}
            <div className="reaction">
              {(
                [
                  ['yes', 'Yes'],
                  ['maybe', 'Maybe'],
                  ['no', 'Nope'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  disabled={locked}
                  className={
                    p.reactions[currentUser] === key ? `active-${key}` : ''
                  }
                  onClick={() => {
                    const res = reactToPitch(p.id, key)
                    if (res.promoted) {
                      setFlash({
                        ok: true,
                        message:
                          (res.message ??
                            'Angenommen → Rezepte-Pool') +
                          ' · im Plan einem Tag zuweisen',
                      })
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="row wrap">
              {(['darius', 'wendy'] as UserId[]).map((uid) =>
                p.reactions[uid] ? (
                  <span key={uid} className="tag green">
                    {resolveUser(uid, profiles).name}: {p.reactions[uid]}
                  </span>
                ) : null,
              )}
            </div>
          </article>
        ))}
    </div>
  )
}

function RecipesView() {
  const recipes = useStore((s) => s.recipes)
  const settings = useStore((s) => s.settings)
  const customCategories = settings.customCategories ?? []
  const profiles = settings.profiles
  const allCategories = useMemo(
    () => listRecipeCategories(customCategories),
    [customCategories],
  )
  const weeks = useStore((s) => s.weeks)
  const activeWeekId = useStore((s) => s.activeWeekId)
  const addRecipe = useStore((s) => s.addRecipe)
  const updateRecipe = useStore((s) => s.updateRecipe)
  const duplicateRecipe = useStore((s) => s.duplicateRecipe)
  const deleteRecipe = useStore((s) => s.deleteRecipe)
  const restoreRecipe = useStore((s) => s.restoreRecipe)
  const purgeRecipeReferences = useStore((s) => s.purgeRecipeReferences)
  const addCustomCategory = useStore((s) => s.addCustomCategory)
  const removeCustomCategory = useStore((s) => s.removeCustomCategory)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseFlash, setBrowseFlash] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [catMenuId, setCatMenuId] = useState<string | null>(null)
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatKind, setNewCatKind] = useState<'meal' | 'base' | 'side'>('meal')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'meal' | 'base' | 'side'>('meal')
  const [category, setCategory] = useState<RecipeCategory>('main')
  const [tags, setTags] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<RecipeCategory | 'all'>(
    'all',
  )
  /** Empty = all category sections collapsed (default). */
  const [openCats, setOpenCats] = useState<Set<RecipeCategory>>(() => new Set())
  const recipeIds = useMemo(() => recipes.map((r) => r.id), [recipes])
  const freshRecipes = useJustAppeared(recipeIds)
  const [ingredients, setIngredients] = useState('')
  const [notes, setNotes] = useState('')
  const [cookidooUrl, setCookidooUrl] = useState('')
  const [cookFetchBusy, setCookFetchBusy] = useState(false)
  const [cookFetchHint, setCookFetchHint] = useState<string | null>(null)
  const cookFetchLastRef = useRef('')
  const [undo, setUndo] = useState<{
    recipe: (typeof recipes)[number]
    index: number
    secondsLeft: number
  } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingUndoRef = useRef<{
    recipe: (typeof recipes)[number]
    index: number
  } | null>(null)

  const recipesOnBring = useMemo(() => {
    const week = weeks.find((w) => w.id === activeWeekId)
    const ids = new Set<string>()
    const sentMeals = new Set(week?.bringSentMealIds ?? [])
    if (!week || sentMeals.size === 0) return ids
    for (const raw of week.slots) {
      const slot = normalizeWeekSlot(raw)
      for (const meal of slot.meals) {
        if (!sentMeals.has(meal.id)) continue
        if (meal.recipeId) ids.add(meal.recipeId)
        if (meal.sideRecipeId) ids.add(meal.sideRecipeId)
      }
    }
    return ids
  }, [weeks, activeWeekId])

  const recipeGroups = useMemo(() => {
    const filtered =
      categoryFilter === 'all'
        ? recipes
        : recipes.filter((r) => resolveRecipeCategory(r) === categoryFilter)
    const map = new Map<RecipeCategory, Recipe[]>()
    for (const r of filtered) {
      const cat = resolveRecipeCategory(r)
      const list = map.get(cat)
      if (list) list.push(r)
      else map.set(cat, [r])
    }
    const known = allCategories.map((c) => ({
      ...c,
      items: map.get(c.id) ?? [],
    }))
    const knownIds = new Set(allCategories.map((c) => c.id))
    const orphans = [...map.entries()]
      .filter(([id]) => !knownIds.has(id))
      .map(([id, items]) => ({
        id,
        label: categoryLabel(id, customCategories) || id,
        hint: 'Ehemalige Kategorie',
        builtin: false,
        kind: 'meal' as const,
        items,
      }))
    return [...known, ...orphans].filter((g) => g.items.length > 0)
  }, [recipes, categoryFilter, allCategories, customCategories])

  useEffect(() => {
    if (categoryFilter === 'all') {
      setOpenCats(new Set())
    } else {
      setOpenCats(new Set([categoryFilter]))
    }
  }, [categoryFilter])

  useEffect(() => {
    if (!catMenuId) return
    const onDoc = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest(`[data-cat-menu="${catMenuId}"]`)) return
      setCatMenuId(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCatMenuId(null)
    }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [catMenuId])

  const toggleCatOpen = (id: RecipeCategory) => {
    setOpenCats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearUndoTimers = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current)
      undoTimerRef.current = null
    }
    if (undoTickRef.current) {
      clearInterval(undoTickRef.current)
      undoTickRef.current = null
    }
  }

  const finalizePendingDelete = () => {
    const pending = pendingUndoRef.current
    if (pending) purgeRecipeReferences(pending.recipe.id)
    pendingUndoRef.current = null
    clearUndoTimers()
    setUndo(null)
  }

  const undoDelete = () => {
    const pending = pendingUndoRef.current
    if (!pending) return
    restoreRecipe(pending.recipe, pending.index)
    pendingUndoRef.current = null
    clearUndoTimers()
    setUndo(null)
    setFlash(`„${pending.recipe.title}“ wiederhergestellt`)
  }

  const requestDelete = (
    recipe: (typeof recipes)[number],
    el?: HTMLElement | null,
  ) => {
    const run = () => {
      // Commit any previous pending delete first.
      if (pendingUndoRef.current) {
        finalizePendingDelete()
      }
      const index = recipes.findIndex((r) => r.id === recipe.id)
      const removed = deleteRecipe(recipe.id)
      if (!removed) return
      if (detailId === recipe.id) setDetailId(null)
      if (editingId === recipe.id) {
        setFormOpen(false)
        setEditingId(null)
      }
      pendingUndoRef.current = { recipe: removed, index: index < 0 ? 0 : index }
      setUndo({
        recipe: removed,
        index: index < 0 ? 0 : index,
        secondsLeft: 5,
      })
      clearUndoTimers()
      undoTickRef.current = setInterval(() => {
        setUndo((prev) =>
          prev
            ? { ...prev, secondsLeft: Math.max(0, prev.secondsLeft - 1) }
            : prev,
        )
      }, 1000)
      undoTimerRef.current = setTimeout(() => {
        finalizePendingDelete()
      }, 5000)
    }
    if (el) playBurstExit(el, run)
    else run()
  }

  useEffect(() => {
    return () => {
      // Leaving the view: keep the delete and purge week/pitch refs.
      if (pendingUndoRef.current) {
        purgeRecipeReferences(pendingUndoRef.current.recipe.id)
      }
      clearUndoTimers()
      pendingUndoRef.current = null
    }
  }, [purgeRecipeReferences])

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setKind('meal')
    setCategory('main')
    setTags('')
    setIngredients('')
    setNotes('')
    setCookidooUrl('')
    setCookFetchBusy(false)
    setCookFetchHint(null)
    cookFetchLastRef.current = ''
  }

  const openCreate = () => {
    resetForm()
    setFormOpen(true)
  }

  const openEdit = (recipe: (typeof recipes)[number]) => {
    setEditingId(recipe.id)
    setTitle(recipe.title)
    const cat = resolveRecipeCategory(recipe)
    setCategory(cat)
    setKind(recipe.kind ?? kindFromCategoryWithCustom(cat, customCategories))
    setTags(
      sanitizeRecipeTags(recipe.tags, {
        category: cat,
        categoryLabel: categoryLabel(cat, customCategories),
        hasCookidoo: Boolean(recipe.cookidooUrl || recipe.cookidooId),
      }).join(', '),
    )
    setIngredients(
      recipe.ingredients
        .map((i) => (i.amount ? `${i.amount} ${i.name}` : i.name))
        .join('\n'),
    )
    setNotes(recipe.notes ?? '')
    setCookidooUrl(recipe.cookidooUrl ?? '')
    cookFetchLastRef.current = recipe.cookidooUrl?.trim() ?? ''
    setCookFetchHint(null)
    setFormOpen(true)
  }

  const parseIngredients = () =>
    ingredients
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(
          /^([\d.,/\s]+(?:g|kg|ml|l|EL|TL|Stk\.?)?)\s+(.+)$/i,
        )
        if (m) return { amount: m[1].trim(), name: m[2].trim() }
        return { name: line }
      })

  const looksLikeCookidooRef = (value: string) => {
    const v = value.trim()
    if (!v) return false
    return /cookidoo\./i.test(v) || /\br\d{3,}\b/i.test(v)
  }

  const loadFromCookidooLink = async (rawUrl?: string, force = false) => {
    const ref = (rawUrl ?? cookidooUrl).trim()
    if (!ref || !looksLikeCookidooRef(ref)) {
      setCookFetchHint('Bitte einen Cookidoo-Link oder eine Rezept-ID (z. B. r505099) einfügen.')
      return
    }
    if (!settings.cookidoo.enabled || !settings.cookidoo.linked || !settings.cookidoo.cookies) {
      setCookFetchHint('Cookidoo zuerst unter Einstellungen verknüpfen — dann lassen sich Zutaten laden.')
      return
    }
    if (cookFetchBusy) return
    if (!force && cookFetchLastRef.current === ref && ingredients.trim()) {
      return
    }
    setCookFetchBusy(true)
    setCookFetchHint('Lade Zutaten von Cookidoo …')
    try {
      const res = await importCookidooRecipeApi({
        cookies: settings.cookidoo.cookies,
        recipe: ref,
        country: settings.cookidoo.country || 'de',
      })
      if (!res.ok || !res.recipe) {
        setCookFetchHint(res.message || 'Cookidoo-Rezept konnte nicht geladen werden.')
        return
      }
      const r = res.recipe
      if (!editingId || !title.trim()) setTitle(r.title)

      const ingText = (r.ingredients || [])
        .map((i) => (i.amount ? `${i.amount} ${i.name}` : i.name))
        .join('\n')
      if (ingText) setIngredients(ingText)
      if (r.notes && (!notes.trim() || !editingId)) setNotes(r.notes)
      if (r.cookidooUrl) setCookidooUrl(r.cookidooUrl)

      const cat = r.category
      if (
        cat &&
        allCategories.some((c) => c.id === cat) &&
        (!editingId || category === 'main')
      ) {
        setCategory(cat as RecipeCategory)
        setKind(kindFromCategoryWithCustom(cat as RecipeCategory, customCategories))
      }

      const resolvedCat =
        cat && allCategories.some((c) => c.id === cat)
          ? (cat as RecipeCategory)
          : category
      const tagSet = new Set(
        sanitizeRecipeTags(
          [
            ...tags.split(',').map((t) => t.trim()),
            'cookidoo',
            ...(r.tags || []),
          ],
          {
            category: resolvedCat,
            categoryLabel: categoryLabel(resolvedCat, customCategories),
            hasCookidoo: true,
          },
        ),
      )
      setTags([...tagSet].join(', '))

      cookFetchLastRef.current = r.cookidooUrl || ref
      setCookFetchHint(
        `${(r.ingredients || []).length} Zutaten geladen — bei Bedarf anpassen und speichern.`,
      )
    } catch (err) {
      setCookFetchHint(
        err instanceof Error ? err.message : 'Cookidoo-Laden fehlgeschlagen.',
      )
    } finally {
      setCookFetchBusy(false)
    }
  }

  const saveForm = () => {
    if (!title.trim()) return
    const payload = {
      title: title.trim(),
      category,
      kind: kindFromCategoryWithCustom(category, customCategories),
      tags: sanitizeRecipeTags(
        tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        {
          category,
          categoryLabel: categoryLabel(category, customCategories),
          hasCookidoo: Boolean(cookidooUrl.trim()),
        },
      ),
      ingredients: parseIngredients(),
      notes: notes.trim() || undefined,
      cookidooUrl: cookidooUrl.trim() || undefined,
    }
    void kind
    if (editingId) {
      updateRecipe(editingId, payload)
      setFlash(`„${payload.title}“ gespeichert`)
      setDetailId(editingId)
    } else {
      addRecipe(payload)
      setFlash(`„${payload.title}“ angelegt`)
    }
    resetForm()
    setFormOpen(false)
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="section-head">
          <div>
            <h2>Rezepte</h2>
            <p className="lede">
              Nach Kategorie sortiert — auch Cookidoo-Imports werden zugeordnet.
            </p>
          </div>
        </div>
        <div className="row wrap">
          <button type="button" className="btn sm" onClick={openCreate}>
            <Plus size={16} aria-hidden />
            Neues Rezept
          </button>
          <button
            type="button"
            className="btn sm secondary"
            onClick={() => {
              setNewCatLabel('')
              setNewCatKind('meal')
              setCatModalOpen(true)
            }}
          >
            <Plus size={16} aria-hidden />
            Kategorie
          </button>
          {settings.cookidoo.enabled ? (
            <button
              type="button"
              className="btn sm secondary"
              onClick={() => setBrowseOpen(true)}
            >
              <Search size={16} aria-hidden />
              Cookidoo stöbern
            </button>
          ) : null}
        </div>
        <div className="category-filters" role="tablist" aria-label="Kategorien">
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === 'all'}
            className={`chip-filter chip-cat-all${categoryFilter === 'all' ? ' active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            <AllCategoriesIcon size={15} />
            Alle ({recipes.length})
          </button>
          {allCategories.map((c) => {
            const count = recipes.filter(
              (r) => resolveRecipeCategory(r) === c.id,
            ).length
            if (!count && c.builtin) return null
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={categoryFilter === c.id}
                className={categoryChipClass(c.id, categoryFilter === c.id)}
                onClick={() => setCategoryFilter(c.id)}
              >
                <CategoryIcon category={c.id} size={15} />
                {c.label} ({count})
              </button>
            )
          })}
        </div>
        {undo ? (
          <div className="undo-banner" role="status">
            <p>
              „{undo.recipe.title}“ gelöscht · noch {undo.secondsLeft}s
            </p>
            <button type="button" className="btn sm secondary" onClick={undoDelete}>
              Rückgängig
            </button>
          </div>
        ) : null}
        {flash ? <div className="flash">{flash}</div> : null}
        {browseFlash ? <div className="flash">{browseFlash}</div> : null}
      </div>

      {recipeGroups.length === 0 ? (
        <div className="panel">
          <p className="muted">Keine Rezepte in dieser Kategorie.</p>
        </div>
      ) : null}

      {recipeGroups.map((group) => {
        const isOpen = openCats.has(group.id)
        const canDelete = customCategories.some((c) => c.id === group.id)
        return (
          <section
            key={group.id}
            className={`recipe-category-group stack${isOpen ? ' open' : ' collapsed'}`}
          >
            <div className="recipe-category-bar">
              <button
                type="button"
                className="recipe-category-head"
                aria-expanded={isOpen}
                onClick={() => {
                  setCatMenuId(null)
                  toggleCatOpen(group.id)
                }}
              >
                <h3>
                  {isOpen ? (
                    <ChevronDown size={18} aria-hidden />
                  ) : (
                    <ChevronRight size={18} aria-hidden />
                  )}
                  <CategoryIcon category={group.id} size={18} />
                  {group.label}
                </h3>
                <span className="muted tiny">{group.items.length}</span>
              </button>
              {canDelete ? (
                <div
                  className="recipe-category-menu"
                  data-cat-menu={group.id}
                >
                  <button
                    type="button"
                    className="btn ghost sm recipe-category-more"
                    aria-label={`Menü für ${group.label}`}
                    aria-expanded={catMenuId === group.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setCatMenuId((id) =>
                        id === group.id ? null : group.id,
                      )
                    }}
                  >
                    <MoreVertical size={18} aria-hidden />
                  </button>
                  {catMenuId === group.id ? (
                    <div
                      className="recipe-category-menu-pop fx-pop-in"
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="recipe-category-menu-item danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          const res = removeCustomCategory(group.id)
                          setFlash(res.message)
                          setCatMenuId(null)
                          if (category === group.id) setCategory('other')
                          if (categoryFilter === group.id) {
                            setCategoryFilter('all')
                          }
                        }}
                      >
                        <Trash2 size={15} aria-hidden />
                        Löschen
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {isOpen
              ? group.items.map((r) => {
                  const onBring = recipesOnBring.has(r.id)
                  const cat = resolveRecipeCategory(r)
                  return (
                    <article
                      key={r.id}
                      className={`recipe-card clickable ${detailId === r.id ? 'open' : ''}${
                        onBring ? ' bring-sent' : ''
                      }${freshRecipes.has(r.id) ? ' fx-pop-in' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setDetailId(detailId === r.id ? null : r.id)
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setDetailId(detailId === r.id ? null : r.id)
                        }
                      }}
                    >
                      <div className="row">
                        <div className="grow">
                          <h3>{r.title}</h3>
                          <p className="muted tiny">
                            von {resolveUser(r.createdBy, profiles).name} ·{' '}
                            {r.ingredients.length} Zutaten
                            {detailId === r.id ? '' : ' · tippen für Details'}
                          </p>
                        </div>
                        <Avatar userId={r.createdBy} />
                      </div>
                      <div className="tags">
                        {onBring ? (
                          <span className="tag tag-bring">Auf Bring</span>
                        ) : null}
                        <span className={categoryTagClass(cat)}>
                          <CategoryIcon category={cat} size={14} />
                          {categoryLabel(cat, customCategories)}
                        </span>
                        {sanitizeRecipeTags(r.tags, {
                          category: cat,
                          categoryLabel: categoryLabel(cat, customCategories),
                          hasCookidoo: Boolean(r.cookidooUrl || r.cookidooId),
                        }).map((t) => (
                          <span key={t} className={`tag ${tagToneClass(t)}`}>
                            {t}
                          </span>
                        ))}
                        {r.cookidooUrl ? (
                          <span className="tag tag-cookidoo">Cookidoo</span>
                        ) : null}
                      </div>
                      {detailId === r.id ? (
                        <>
                          {r.notes ? <p className="muted">{r.notes}</p> : null}
                          <IngredientList
                            items={r.ingredients}
                            onBring={onBring}
                          />
                          {r.cookidooUrl ? (
                            <a
                              className="tiny"
                              href={r.cookidooUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              In Cookidoo öffnen ↗
                            </a>
                          ) : null}
                          <div
                            className="row wrap"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="btn sm secondary"
                              onClick={() => openEdit(r)}
                            >
                              Anpassen
                            </button>
                            <button
                              type="button"
                              className="btn sm secondary"
                              onClick={() => {
                                const id = duplicateRecipe(r.id)
                                if (id) {
                                  setDetailId(id)
                                  setFlash(`Kopie von „${r.title}“ angelegt`)
                                }
                              }}
                            >
                              Duplizieren
                            </button>
                            <button
                              type="button"
                              className="btn sm ghost icon-delete"
                              aria-label={`„${r.title}“ löschen`}
                              onClick={(e) => {
                                e.stopPropagation()
                                requestDelete(
                                  r,
                                  e.currentTarget.closest(
                                    '.recipe-card',
                                  ) as HTMLElement | null,
                                )
                              }}
                            >
                              <Trash2 size={16} aria-hidden />
                            </button>
                          </div>
                        </>
                      ) : r.notes ? (
                        <p className="muted">{r.notes}</p>
                      ) : null}
                    </article>
                  )
                })
              : null}
          </section>
        )
      })}

      {formOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setFormOpen(false)
            resetForm()
          }}
        >
          <div className="modal stack fx-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h2>{editingId ? 'Rezept anpassen' : 'Neues Rezept'}</h2>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setFormOpen(false)
                  resetForm()
                }}
              >
                Schließen
              </button>
            </div>
            <div className="field">
              <label htmlFor="r-title">Titel</label>
              <input
                id="r-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="r-category">Kategorie</label>
              <div className="category-select-row">
                <CategoryIcon category={category} size={20} />
                <select
                  id="r-category"
                  value={category}
                  onChange={(e) => {
                    const next = e.target.value as RecipeCategory
                    setCategory(next)
                    setKind(kindFromCategoryWithCustom(next, customCategories))
                  }}
                >
                  {allCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.builtin ? c.label : `${c.label} (eigen)`}
                    </option>
                  ))}
                </select>
              </div>
              <p className="muted tiny">
                {allCategories.find((c) => c.id === category)?.hint}
              </p>
            </div>
            <div className="field">
              <label htmlFor="r-tags">Tags (Komma)</label>
              <input
                id="r-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="schnell, vegetarisch"
              />
            </div>
            <div className="field">
              <label htmlFor="r-ing">Zutaten (eine pro Zeile)</label>
              <textarea
                id="r-ing"
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                placeholder={'400g Penne\n2 EL Öl'}
              />
            </div>
            <div className="field">
              <label htmlFor="r-notes">Notizen</label>
              <textarea
                id="r-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="r-cookidoo">Cookidoo-Link (optional)</label>
              <input
                id="r-cookidoo"
                value={cookidooUrl}
                onChange={(e) => {
                  setCookidooUrl(e.target.value)
                  setCookFetchHint(null)
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text')
                  if (!looksLikeCookidooRef(pasted)) return
                  // Let the paste apply, then fetch.
                  window.setTimeout(() => {
                    setCookidooUrl(pasted.trim())
                    void loadFromCookidooLink(pasted.trim())
                  }, 0)
                }}
                onBlur={() => {
                  if (
                    looksLikeCookidooRef(cookidooUrl) &&
                    cookFetchLastRef.current !== cookidooUrl.trim()
                  ) {
                    void loadFromCookidooLink()
                  }
                }}
                placeholder="https://cookidoo.de/.../r123 einfügen"
              />
              <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
                <button
                  type="button"
                  className="btn sm secondary"
                  disabled={cookFetchBusy || !cookidooUrl.trim()}
                  onClick={() => void loadFromCookidooLink(undefined, true)}
                >
                  {cookFetchBusy ? 'Lädt …' : 'Zutaten aus Link laden'}
                </button>
              </div>
              {cookFetchHint ? (
                <p className="muted tiny" style={{ marginTop: 6 }}>
                  {cookFetchHint}
                </p>
              ) : settings.cookidoo.enabled && settings.cookidoo.linked ? (
                <p className="muted tiny" style={{ marginTop: 6 }}>
                  Link einfügen — Titel und Zutaten werden automatisch übernommen.
                </p>
              ) : settings.cookidoo.enabled ? (
                <p className="muted tiny" style={{ marginTop: 6 }}>
                  Zum automatischen Laden Cookidoo unter Einstellungen verknüpfen.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="btn"
              disabled={!title.trim()}
              onClick={saveForm}
            >
              {editingId ? 'Änderungen speichern' : 'Speichern'}
            </button>
          </div>
        </div>
      ) : null}

      {catModalOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => setCatModalOpen(false)}
        >
          <div
            className="modal stack fx-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-head">
              <h2>Eigene Kategorien</h2>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setCatModalOpen(false)}
              >
                Schließen
              </button>
            </div>
            <p className="muted tiny">
              Eigene Kategorien erscheinen beim Anlegen/Bearbeiten von Rezepten
              und in der Filterleiste.
            </p>
            <div className="field">
              <label htmlFor="new-cat-label">Neue Kategorie</label>
              <input
                id="new-cat-label"
                value={newCatLabel}
                onChange={(e) => setNewCatLabel(e.target.value)}
                placeholder="z. B. Asiatisch, Meal Prep…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const res = addCustomCategory({
                      label: newCatLabel,
                      kind: newCatKind,
                    })
                    setFlash(res.message)
                    if (res.ok && res.id) {
                      setNewCatLabel('')
                      setCategory(res.id)
                    }
                  }
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="new-cat-kind">Typ</label>
              <select
                id="new-cat-kind"
                value={newCatKind}
                onChange={(e) =>
                  setNewCatKind(e.target.value as 'meal' | 'base' | 'side')
                }
              >
                <option value="meal">Gericht</option>
                <option value="base">Basis</option>
                <option value="side">Beilage</option>
              </select>
            </div>
            <button
              type="button"
              className="btn"
              disabled={!newCatLabel.trim()}
              onClick={() => {
                const res = addCustomCategory({
                  label: newCatLabel,
                  kind: newCatKind,
                })
                setFlash(res.message)
                if (res.ok && res.id) {
                  setNewCatLabel('')
                  setCategory(res.id)
                  setCatModalOpen(false)
                }
              }}
            >
              <Plus size={16} aria-hidden />
              Anlegen
            </button>
            {customCategories.length === 0 ? (
              <p className="muted">Noch keine eigenen Kategorien.</p>
            ) : (
              <ul className="custom-cat-list">
                {customCategories.map((c) => (
                  <li key={c.id} className="custom-cat-row">
                    <span className={categoryTagClass(c.id)}>
                      <CategoryIcon category={c.id} size={14} />
                      {c.label}
                    </span>
                    <span className="muted tiny">
                      {c.kind === 'base'
                        ? 'Basis'
                        : c.kind === 'side'
                          ? 'Beilage'
                          : 'Gericht'}
                    </span>
                    <button
                      type="button"
                      className="btn ghost sm icon-delete"
                      aria-label={`„${c.label}“ löschen`}
                      onClick={() => {
                        const res = removeCustomCategory(c.id)
                        setFlash(res.message)
                        if (category === c.id) setCategory('other')
                        if (categoryFilter === c.id) setCategoryFilter('all')
                      }}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {browseOpen ? (
        <CookidooBrowseModal
          onClose={() => setBrowseOpen(false)}
          onImported={(importedTitle) => {
            setBrowseFlash(`Importiert: ${importedTitle}`)
            setTimeout(() => setBrowseOpen(false), 600)
          }}
        />
      ) : null}
    </div>
  )
}

function ShopView({ onPlan }: { onPlan: () => void }) {
  const settings = useStore((s) => s.settings)
  const shoppingDraft = useStore((s) => s.shoppingDraft)
  const weeks = useStore((s) => s.weeks)
  const activeWeekId = useStore((s) => s.activeWeekId)
  const buildShoppingList = useStore((s) => s.buildShoppingList)
  const updateShoppingItem = useStore((s) => s.updateShoppingItem)
  const removeShoppingItem = useStore((s) => s.removeShoppingItem)
  const addShoppingItem = useStore((s) => s.addShoppingItem)
  const pushToBring = useStore((s) => s.pushToBring)
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [bringListKey, setBringListKey] = useState(0)

  const week = useMemo(
    () => weeks.find((w) => w.id === activeWeekId),
    [weeks, activeWeekId],
  )
  const locked = week?.status === 'locked'
  const bringSent = Boolean(week?.bringSentAt)
  const items = shoppingDraft
  const sendableCount = items.filter((i) => i.name.trim()).length
  const pendingCount = items.filter(
    (i) => i.name.trim() && !i.bringSent,
  ).length
  const alreadySentCount = sendableCount - pendingCount
  const groups = useMemo(() => {
    const map = new Map<string, typeof items>()
    for (const item of items) {
      const key = (item.dish || 'Extra').trim() || 'Extra'
      const list = map.get(key)
      if (list) list.push(item)
      else map.set(key, [item])
    }
    return [...map.entries()]
  }, [items])

  useEffect(() => {
    if (!locked) return
    if (shoppingDraft.length > 0) return
    buildShoppingList()
    // Only auto-load once per locked week visit — empty plans stay empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, activeWeekId])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4500)
    return () => clearTimeout(t)
  }, [flash])

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="section-head">
          <div>
            <h2>Einkaufsliste</h2>
            <p className="lede">
              Wird beim Festnageln automatisch aus dem Plan gebaut. Mengen
              anpassen — an Bring gehen nur neue Zutaten (schon gesendete bleiben
              markiert).
            </p>
          </div>
          <span
            className={`status-pill ${
              bringSent && pendingCount === 0
                ? 'bring'
                : locked
                  ? pendingCount > 0 && alreadySentCount > 0
                    ? 'warn'
                    : ''
                  : 'warn'
            }`}
          >
            {bringSent && pendingCount === 0
              ? 'Auf Bring'
              : pendingCount > 0 && alreadySentCount > 0
                ? `${pendingCount} neu`
                : locked
                  ? 'Plan final'
                  : 'Noch Pitch'}
          </span>
        </div>

        {!locked ? (
          <>
            <p className="muted">
              Noch kein finaler Plan — im Wochenplan Gerichte wählen und
              „Festnageln &amp; einkaufen“ tippen.
            </p>
            <button type="button" className="btn secondary" onClick={onPlan}>
              Zum Wochenplan
            </button>
          </>
        ) : (
          <>
            <div className="row wrap">
              <button
                type="button"
                className="btn sm secondary"
                onClick={() => {
                  const list = buildShoppingList()
                  setFlash({
                    ok: list.length > 0,
                    message:
                      list.length > 0
                        ? `${list.length} Zutaten neu geladen.`
                        : 'Im Plan sind noch keine Gerichte mit Zutaten.',
                  })
                }}
              >
                Liste neu laden
              </button>
              <button
                type="button"
                className="btn sm secondary"
                disabled={!locked}
                onClick={() => {
                  addShoppingItem()
                  setFlash({
                    ok: true,
                    message: 'Leere Zeile ergänzt — Name & Menge eintragen.',
                  })
                }}
              >
                Zutat +
              </button>
              <button
                type="button"
                className="btn sm accent"
                disabled={
                  busy ||
                  !settings.bring.enabled ||
                  !settings.bring.linked ||
                  pendingCount === 0
                }
                onClick={async () => {
                  setBusy(true)
                  const res = await pushToBring()
                  setFlash({ ok: res.ok, message: res.message })
                  setBusy(false)
                  if (res.ok) setBringListKey((k) => k + 1)
                }}
              >
                {busy
                  ? 'Sende…'
                  : alreadySentCount > 0
                    ? `Neue an Bring (${pendingCount})`
                    : 'Jetzt an Bring senden'}
              </button>
            </div>
            {settings.bring.enabled && settings.bring.linked ? (
              <p className="muted tiny">
                Ziel: {settings.bring.listName || 'Liste'}
                {settings.bring.accountName
                  ? ` · ${settings.bring.accountName}`
                  : ''}
                {settings.bring.email ? ` · ${settings.bring.email}` : ''}
              </p>
            ) : settings.bring.enabled ? (
              <p className="muted tiny">
                Bring ist an, aber noch nicht eingeloggt — Menü → Einstellungen.
              </p>
            ) : (
              <p className="muted tiny">
                Bring optional unter Menü → Einstellungen einschalten.
              </p>
            )}
          </>
        )}
        {settings.bring.lastError ? (
          <p className="muted tiny" style={{ color: 'var(--bad)' }}>
            {settings.bring.lastError}
          </p>
        ) : null}
      </div>

      {settings.bring.enabled && settings.bring.linked ? (
        <BringLiveListPanel refreshKey={bringListKey} />
      ) : null}

      {flash ? (
        <div className={`flash ${flash.ok ? '' : 'bad'}`}>{flash.message}</div>
      ) : null}

      <div className="shopping-list panel stack">
        {!locked ? (
          <p className="muted">
            Wartet auf „Festnageln &amp; einkaufen“ im Wochenplan.
          </p>
        ) : items.length === 0 ? (
          <p className="muted">
            Keine Zutaten im Plan — Gerichte brauchen hinterlegte Zutaten, oder
            „Zutat +“ nutzen.
          </p>
        ) : (
          groups.map(([dish, groupItems]) => {
            const day = groupItems.find((i) => i.day)?.day
            const groupAllSent = groupItems.every(
              (i) => !i.name.trim() || i.bringSent,
            )
            const groupSomeSent = groupItems.some((i) => i.bringSent)
            return (
              <section
                key={dish}
                className={`shop-group${groupAllSent ? ' bring-sent' : ''}`}
              >
                <div className="shop-group-head">
                  <h3
                    className={`shop-group-title ${day ? WEEKDAY_COLOR_CLASS[day] : ''}`}
                  >
                    {dish}
                  </h3>
                  {groupAllSent ? (
                    <span className="tag tag-bring">Auf Bring</span>
                  ) : groupSomeSent ? (
                    <span className="tag tag-bring">Teilweise</span>
                  ) : null}
                </div>
                {groupItems.map((item) => (
                  <div
                    key={item.id}
                    className={`shop-row${item.bringSent ? ' bring-sent' : ''}`}
                  >
                    <div className="shop-row-fields">
                      <input
                        className="shop-input name"
                        value={item.name}
                        placeholder="Zutat"
                        aria-label={`Zutat für ${dish}`}
                        onChange={(e) =>
                          updateShoppingItem(item.id, { name: e.target.value })
                        }
                      />
                      <input
                        className="shop-input amount"
                        value={item.amount ?? ''}
                        placeholder="Menge"
                        aria-label={`Menge für ${item.name || dish}`}
                        onChange={(e) =>
                          updateShoppingItem(item.id, {
                            amount: e.target.value,
                          })
                        }
                      />
                    </div>
                    {item.bringSent ? (
                      <span className="tag tag-bring shop-row-tag">Auf Bring</span>
                    ) : null}
                    <button
                      type="button"
                      className="btn ghost sm icon-delete shop-remove"
                      aria-label={`${item.name || 'Zutat'} löschen`}
                      onClick={() => removeShoppingItem(item.id)}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                ))}
              </section>
            )
          })
        )}
      </div>

      {settings.bring.lastPushItems?.length ? (
        <div className="panel stack">
          <h3>Letzter Bring-Push</h3>
          <p className="muted tiny">
            {settings.bring.lastPushAt
              ? new Date(settings.bring.lastPushAt).toLocaleString('de-DE')
              : ''}
          </p>
          {settings.bring.lastPushItems.map((line) => (
            <div key={line} className="tiny">
              · {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function BringLiveListPanel({ refreshKey }: { refreshKey: number }) {
  const bring = useStore((s) => s.settings.bring)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [purchase, setPurchase] = useState<BringListItem[]>([])
  const [recently, setRecently] = useState<BringListItem[]>([])
  const [loadedAt, setLoadedAt] = useState<string | null>(null)

  const canLoad =
    Boolean(bring.userUuid && bring.accessToken && bring.listUuid)

  const load = async () => {
    if (!canLoad) {
      setError('Bring-Liste nicht konfiguriert.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetchBringList({
        uuid: bring.userUuid,
        accessToken: bring.accessToken,
        listUuid: bring.listUuid,
      })
      if (!res.ok) {
        setError(res.message || 'Liste konnte nicht geladen werden.')
        setPurchase([])
        setRecently([])
      } else {
        setPurchase(res.purchase ?? [])
        setRecently(res.recently ?? [])
        setLoadedAt(new Date().toISOString())
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Bring-Liste nicht erreichbar.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [bring.listUuid, bring.accessToken, bring.userUuid, refreshKey])

  return (
    <div className="panel stack bring-live">
      <div className="bring-live-head">
        <button
          type="button"
          className="bring-live-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="bring-live-toggle-icon" aria-hidden>
            {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </span>
          <span className="bring-live-toggle-text">
            <strong>Bring-Liste</strong>
            <span className="muted tiny">
              {bring.listName || 'Liste'}
              {loading
                ? ' · lädt…'
                : purchase.length
                  ? ` · ${purchase.length} offen`
                  : loadedAt
                    ? ' · leer'
                    : ''}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="btn ghost sm bring-live-refresh"
          disabled={loading || !canLoad}
          aria-label="Bring-Liste aktualisieren"
          onClick={() => void load()}
        >
          <RefreshCw size={16} className={loading ? 'spin' : undefined} />
        </button>
      </div>

      {open ? (
        <div className="bring-live-body stack">
          {error ? (
            <p className="muted tiny" style={{ color: 'var(--bad)' }}>
              {error}
            </p>
          ) : null}
          {!error && !loading && purchase.length === 0 && recently.length === 0 ? (
            <p className="muted">Auf Bring steht gerade nichts drauf.</p>
          ) : null}
          {purchase.length > 0 ? (
            <ul className="bring-live-items">
              {purchase.map((item, idx) => (
                <li
                  key={item.uuid || `${item.name}-${item.specification}-${idx}`}
                >
                  <span className="bring-live-name">{item.name}</span>
                  {item.specification ? (
                    <span className="bring-live-spec muted tiny">
                      {item.specification}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {recently.length > 0 ? (
            <details className="bring-live-recent">
              <summary>
                Zuletzt erledigt ({recently.length})
              </summary>
              <ul className="bring-live-items faint">
                {recently.map((item, idx) => (
                  <li
                    key={
                      item.uuid ||
                      `recent-${item.name}-${item.specification}-${idx}`
                    }
                  >
                    <span className="bring-live-name">{item.name}</span>
                    {item.specification ? (
                      <span className="bring-live-spec muted tiny">
                        {item.specification}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {loadedAt ? (
            <p className="muted tiny">
              Stand:{' '}
              {new Date(loadedAt).toLocaleString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function syncLabel(status: SyncStatus) {
  switch (status) {
    case 'checking':
      return 'Prüfe SQLite…'
    case 'online':
      return 'Gemeinsame SQLite-DB'
    case 'saving':
      return 'Speichere…'
    case 'offline':
      return 'Nur dieser Browser'
    case 'error':
      return 'Sync-Fehler'
  }
}

function SettingsView() {
  const settings = useStore((s) => s.settings)
  const currentUser = useStore((s) => s.currentUser)!
  const me = useResolvedUser(currentUser)
  const partnerId: UserId = currentUser === 'darius' ? 'wendy' : 'darius'
  const partner = useResolvedUser(partnerId)
  const updateBring = useStore((s) => s.updateBring)
  const updateCookidoo = useStore((s) => s.updateCookidoo)
  const updateMyProfile = useStore((s) => s.updateMyProfile)
  const linkBring = useStore((s) => s.linkBring)
  const unlinkBring = useStore((s) => s.unlinkBring)
  const linkCookidoo = useStore((s) => s.linkCookidoo)
  const unlinkCookidoo = useStore((s) => s.unlinkCookidoo)
  const resetDemoData = useStore((s) => s.resetDemoData)
  const logout = useStore((s) => s.logout)

  const [bringPassword, setBringPassword] = useState('')
  const [cookPassword, setCookPassword] = useState('')
  const [bringBusy, setBringBusy] = useState(false)
  const [cookBusy, setCookBusy] = useState(false)
  const [displayName, setDisplayName] = useState(me.name)
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
    null,
  )
  const [sync, setSync] = useState(getSyncStatus)

  useEffect(() => {
    setDisplayName(me.name)
  }, [me.name, currentUser])

  useEffect(() => subscribeSync((next, detail) => {
    setSync({ status: next, detail: detail ?? '', revision: getSyncStatus().revision })
  }), [])

  useEffect(() => {
    const err = settings.cookidoo.lastError ?? ''
    // Drop outdated server-login diagnostics from before the OAuth fix.
    if (
      err.includes('Host/Netzwerk prüfen') ||
      (err.includes('Loginseite nicht erreichbar') && err.includes('Status 401'))
    ) {
      updateCookidoo({ lastError: undefined })
    }
  }, [settings.cookidoo.lastError, updateCookidoo])

  return (
    <div className="stack">
      <div className="panel stack">
        <h2>Dein Profil</h2>
        <p className="lede">
          Name und Avatar gelten überall in der App — auch für {partner.name}.
        </p>
        <div className="row" style={{ gap: 14, alignItems: 'center' }}>
          <Avatar userId={currentUser} size={56} />
          <div className="grow">
            <p className="muted tiny">Angemeldet als</p>
            <strong>{me.name}</strong>
          </div>
        </div>
        <div className="field">
          <label htmlFor="profile-name">Anzeigename</label>
          <input
            id="profile-name"
            value={displayName}
            maxLength={32}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => {
              if (displayName.trim() === me.name) return
              const res = updateMyProfile({ name: displayName })
              setStatus(res)
              if (!res.ok) setDisplayName(me.name)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            placeholder="Dein Name"
          />
        </div>
        <div className="field">
          <span className="muted tiny">Avatar-Emoji</span>
          <div className="avatar-emoji-grid" role="listbox" aria-label="Avatar wählen">
            <button
              type="button"
              role="option"
              aria-selected={!me.emoji}
              className={`avatar-emoji-option${!me.emoji ? ' active' : ''}`}
              title="Buchstabe"
              onClick={() => {
                const res = updateMyProfile({ emoji: '' })
                setStatus(res)
              }}
            >
              {me.short}
            </button>
            {AVATAR_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="option"
                aria-selected={me.emoji === emoji}
                className={`avatar-emoji-option${me.emoji === emoji ? ' active' : ''}`}
                onClick={() => {
                  const res = updateMyProfile({ emoji })
                  setStatus(res)
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel stack">
        <h2>Gemeinsamer Speicher</h2>
        <p className="lede">
          Auf dem Webspace liegen Rezepte, Pitches und der Wochenplan in einer
          mitgelieferten <strong>SQLite</strong>-Datei — {me.name} und{' '}
          {partner.name} sehen denselben Stand. Lokal ohne PHP nur im Browser.
        </p>
        <div
          className={`flash ${sync.status === 'online' || sync.status === 'saving' ? '' : sync.status === 'offline' ? '' : 'bad'}`}
        >
          {syncLabel(sync.status)}
          {sync.detail ? ` — ${sync.detail}` : ''}
          {sync.revision > 0 ? ` (Rev. ${sync.revision})` : ''}
        </div>
      </div>

      <div className="panel">
        <h2>Integrationen</h2>
        <p className="lede">
          Bring und Cookidoo sind optional. Einschalten → Login-Daten eingeben →
          verknüpfen.
        </p>

        {status ? (
          <div className={`flash ${status.ok ? '' : 'bad'}`}>{status.message}</div>
        ) : null}

        <div className="toggle-row">
          <div>
            <strong>Bring!</strong>
            <p className="muted tiny">Shopping-Liste auf dem iPhone</p>
          </div>
          <button
            type="button"
            className={`toggle ${settings.bring.enabled ? 'on' : ''}`}
            aria-pressed={settings.bring.enabled}
            aria-label="Bring umschalten"
            onClick={() =>
              updateBring({
                enabled: !settings.bring.enabled,
                ...(settings.bring.enabled
                  ? {
                      linked: false,
                      accessToken: '',
                      refreshToken: '',
                      userUuid: '',
                    }
                  : {}),
              })
            }
          />
        </div>

        {settings.bring.enabled ? (
          <div className="stack" style={{ marginTop: 8 }}>
            <div className="field">
              <label htmlFor="bring-email">Bring E-Mail</label>
              <input
                id="bring-email"
                type="email"
                value={settings.bring.email}
                onChange={(e) => updateBring({ email: e.target.value })}
                placeholder="ihr@email.de"
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label htmlFor="bring-password">Bring Passwort</label>
              <input
                id="bring-password"
                type="password"
                value={bringPassword}
                onChange={(e) => setBringPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            {settings.bring.lists.length > 0 ? (
              <div className="field">
                <label htmlFor="bring-list-select">Liste</label>
                <select
                  id="bring-list-select"
                  value={settings.bring.listUuid}
                  onChange={(e) => {
                    const list = settings.bring.lists.find(
                      (l) => l.listUuid === e.target.value,
                    )
                    updateBring({
                      listUuid: e.target.value,
                      listName: list?.name || settings.bring.listName,
                    })
                  }}
                >
                  {settings.bring.lists.map((l) => (
                    <option key={l.listUuid} value={l.listUuid}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="row wrap">
              <button
                type="button"
                className="btn secondary"
                disabled={bringBusy || !settings.bring.email || !bringPassword}
                onClick={async () => {
                  setBringBusy(true)
                  const res = await linkBring(settings.bring.email, bringPassword)
                  setStatus(res)
                  if (res.ok) setBringPassword('')
                  setBringBusy(false)
                }}
              >
                {bringBusy
                  ? 'Verbinde…'
                  : settings.bring.linked
                    ? 'Erneut einloggen'
                    : 'Bring-Konto verknüpfen'}
              </button>
              {settings.bring.linked ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    unlinkBring()
                    setStatus({ ok: true, message: 'Bring getrennt.' })
                  }}
                >
                  Trennen
                </button>
              ) : null}
            </div>
            {settings.bring.linked ? (
              <span className="status-pill">
                Verknüpft
                {settings.bring.accountName
                  ? ` · ${settings.bring.accountName}`
                  : ''}
              </span>
            ) : null}
            <p className="muted tiny">
              Login läuft über <code>api/bring.php</code> auf dem Webspace (kein
              CORS). Danach: Wochenplan → Bring-Tab → „An Bring senden“.
            </p>
          </div>
        ) : null}

        <div className="toggle-row">
          <div>
            <strong>Cookidoo</strong>
            <p className="muted tiny">Thermomix-Konto &amp; Rezept-Import</p>
          </div>
          <button
            type="button"
            className={`toggle ${settings.cookidoo.enabled ? 'on' : ''}`}
            aria-pressed={settings.cookidoo.enabled}
            aria-label="Cookidoo umschalten"
            onClick={() =>
              updateCookidoo({
                enabled: !settings.cookidoo.enabled,
                ...(settings.cookidoo.enabled
                  ? { linked: false, accessToken: '', refreshToken: '', cookies: '' }
                  : {}),
              })
            }
          />
        </div>

        {settings.cookidoo.enabled ? (
          <div className="stack" style={{ marginTop: 8 }}>
            <div className="field">
              <label htmlFor="cook-email">Cookidoo E-Mail</label>
              <input
                id="cook-email"
                type="email"
                value={settings.cookidoo.email}
                onChange={(e) => updateCookidoo({ email: e.target.value })}
                placeholder="ihr@email.de"
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label htmlFor="cook-password">Cookidoo Passwort</label>
              <input
                id="cook-password"
                type="password"
                value={cookPassword}
                onChange={(e) => setCookPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <div className="field">
              <label htmlFor="cook-country">Land</label>
              <select
                id="cook-country"
                value={settings.cookidoo.country}
                onChange={(e) => updateCookidoo({ country: e.target.value })}
              >
                <option value="de">Deutschland</option>
                <option value="at">Österreich</option>
                <option value="ch">Schweiz</option>
                <option value="ie">UK / IE</option>
              </select>
            </div>
            <div className="row wrap">
              <button
                type="button"
                className="btn secondary"
                disabled={cookBusy || !settings.cookidoo.email || !cookPassword}
                onClick={async () => {
                  setCookBusy(true)
                  const res = await linkCookidoo(
                    settings.cookidoo.email,
                    cookPassword,
                    settings.cookidoo.country,
                  )
                  setStatus(res)
                  if (res.ok) setCookPassword('')
                  setCookBusy(false)
                }}
              >
                {cookBusy
                  ? 'Verbinde…'
                  : settings.cookidoo.linked
                    ? 'Erneut einloggen'
                    : 'Cookidoo-Konto verknüpfen'}
              </button>
              {settings.cookidoo.linked ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    unlinkCookidoo()
                    setStatus({ ok: true, message: 'Cookidoo getrennt.' })
                  }}
                >
                  Trennen
                </button>
              ) : null}
            </div>
            {settings.cookidoo.linked ? (
              <span className="status-pill">Verknüpft · Rezepte importierbar</span>
            ) : null}
            {settings.cookidoo.lastError ? (
              <p className="muted tiny" style={{ color: 'var(--bad)' }}>
                {settings.cookidoo.lastError}
              </p>
            ) : null}
            <p className="muted tiny">
              Nach dem Login: unter Rezepte „Cookidoo stöbern“ — suchen, Listen
              öffnen oder Link/ID importieren. Läuft über{' '}
              <code>api/cookidoo.php</code>.
            </p>
          </div>
        ) : null}
      </div>

      <div className="panel stack">
        <h2>App</h2>
        <button type="button" className="btn secondary" onClick={resetDemoData}>
          Demo-Daten zurücksetzen
        </button>
        <button type="button" className="btn ghost" onClick={logout}>
          Abmelden
        </button>
      </div>
    </div>
  )
}

function HelpView({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="stack">
      <div className="panel stack">
        <h2>So funktioniert’s</h2>
        <p className="lede">
          Wochenenden: Gerichte pitchen, Plan festnageln, optional einkaufen.
        </p>
        <ol className="help-list">
          <li>
            <strong>Pitch</strong> — Vorschläge mit Notiz und Reaktion (Yes /
            Maybe / Nope). Doppeltes Yes → automatisch in den Rezepte-Pool und
            Pitch verschwindet. Danach im Plan einem Tag zuweisen.
          </li>
          <li>
            <strong>Plan</strong> — Gerichte den Wochentagen zuordnen (auch
            mehrere pro Tag); bei einer Basis danach die Beilage wählen. Tippe
            auf einen befüllten Tag für Details. Mit „Festnageln“ (bzw.
            „Festnageln &amp; einkaufen“) den Plan finalisieren.
          </li>
          <li>
            <strong>Rezepte</strong> — Bibliothek nach Kategorien pflegen
            (Hauptspeise, Suppe, Salat, Beilage, …).
          </li>
        </ol>
      </div>

      <div className="panel stack">
        <h2>Optionale Integrationen</h2>
        <p className="lede">
          Bring! und Cookidoo sind standardmäßig aus. Unter Einstellungen
          einschalten und mit Login verknüpfen.
        </p>
        <ul className="help-list bullets">
          <li>
            <strong>Bring!</strong> — Wochenplan-Zutaten an die gemeinsame
            Einkaufsliste senden. Nach Änderungen nur noch die neuen Positionen
            (bereits Gesendetes bleibt markiert).
          </li>
          <li>
            <strong>Cookidoo</strong> — Rezepte per Link/ID aus eurem Konto in
            den Planner laden.
          </li>
        </ul>
        <button type="button" className="btn secondary" onClick={onOpenSettings}>
          Zu den Einstellungen
        </button>
      </div>

      <div className="panel stack">
        <h2>Menü</h2>
        <p className="muted">
          Oben links: <strong>Menü</strong> → Einstellungen oder Hilfe. Unten:
          Plan, Pitch, Rezepte — und Bring nur, wenn in den Einstellungen
          aktiviert.
        </p>
      </div>
    </div>
  )
}

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const hold = reduce ? 400 : 1200
    const fade = reduce ? 0 : 380
    const leaveTimer = window.setTimeout(() => setLeaving(true), hold)
    const doneTimer = window.setTimeout(() => doneRef.current(), hold + fade)
    return () => {
      window.clearTimeout(leaveTimer)
      window.clearTimeout(doneTimer)
    }
  }, [])

  return (
    <div
      className={`splash${leaving ? ' splash-leave' : ''}`}
      role="status"
      aria-label="Wochenkochen startet"
    >
      <img
        className="splash-logo"
        src={logoSrc}
        alt="Wochenkochen"
        width={148}
        height={148}
      />
      <p className="splash-brand">Wochenkochen</p>
    </div>
  )
}

export default function App() {
  const currentUser = useStore((s) => s.currentUser)
  const bringEnabled = useStore((s) => s.settings.bring.enabled)
  const [tab, setTab] = useState<Tab>(() => readStoredTab())
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return sessionStorage.getItem('wochenkochen-splash') !== '1'
    } catch {
      return true
    }
  })

  useEffect(() => {
    writeStoredTab(tab)
  }, [tab])

  useEffect(() => {
    if (!bringEnabled && tab === 'shop') setTab('week')
  }, [bringEnabled, tab])

  if (showSplash) {
    return (
      <SplashScreen
        onDone={() => {
          try {
            sessionStorage.setItem('wochenkochen-splash', '1')
          } catch {
            /* ignore */
          }
          setShowSplash(false)
        }}
      />
    )
  }

  if (!currentUser) return <LoginScreen />

  return (
    <div className="app-shell">
      <TopBar
        tab={tab}
        onHome={() => setTab('week')}
        onOpenMenuPage={setTab}
      />
      {tab === 'week' ? (
        <WeekView
          onPitch={() => setTab('pitch')}
          onShop={() => setTab('shop')}
        />
      ) : null}
      {tab === 'pitch' ? <PitchView /> : null}
      {tab === 'recipes' ? <RecipesView /> : null}
      {tab === 'shop' ? <ShopView onPlan={() => setTab('week')} /> : null}
      {tab === 'settings' ? <SettingsView /> : null}
      {tab === 'help' ? (
        <HelpView onOpenSettings={() => setTab('settings')} />
      ) : null}
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  )
}
