import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChefHat,
  CircleHelp,
  Home,
  Lightbulb,
  Lock,
  Menu,
  MessageSquarePlus,
  Pin,
  Search,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  UtensilsCrossed,
} from 'lucide-react'
import {
  USERS,
  mealLabel,
  mondayOf,
  parseWeekMonday,
  slotMealLabel,
  weekIdFromMonday,
} from './data/seed'
import {
  listCookidooCollectionRecipes,
  listCookidooCollections,
  searchCookidooRecipes,
  type CookidooBrowseRecipe,
} from './api/integrations'
import { useStore } from './store'
import {
  getSyncStatus,
  subscribeSync,
  type SyncStatus,
} from './sync/householdSync'
import type { Ingredient, Recipe, UserId, WeekSlot, Weekday } from './types'

type Tab = 'week' | 'pitch' | 'recipes' | 'shop' | 'settings' | 'help'

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

const KIND_LABEL: Record<'meal' | 'base' | 'side', string> = {
  meal: 'Gericht',
  base: 'Basis',
  side: 'Beilage',
}

function Avatar({ userId, size = 28 }: { userId: UserId; size?: number }) {
  const user = USERS[userId]
  return (
    <span
      className="avatar"
      style={{ background: user.color, width: size, height: size }}
      aria-hidden
    >
      {user.short}
    </span>
  )
}

function IngredientList({ items }: { items: Ingredient[] }) {
  if (items.length === 0) {
    return <p className="muted tiny">Keine Zutaten hinterlegt.</p>
  }
  return (
    <ul className="ingredient-list">
      {items.map((item, i) => (
        <li key={`${item.name}-${i}`}>
          <span>{item.name}</span>
          {item.amount ? <strong>{item.amount}</strong> : null}
        </li>
      ))}
    </ul>
  )
}

function RecipeDetailBlock({
  recipe,
  fallbackTitle,
  role,
}: {
  recipe?: Recipe
  fallbackTitle?: string
  role?: string
}) {
  const title = recipe?.title || fallbackTitle
  if (!title) return null
  const kind = recipe?.kind ?? 'meal'

  return (
    <section className="recipe-detail">
      <div className="row">
        <div className="grow">
          {role ? <p className="muted tiny">{role}</p> : null}
          <h3>{title}</h3>
          {recipe ? (
            <p className="muted tiny">
              {KIND_LABEL[kind]} · von {USERS[recipe.createdBy].name} ·{' '}
              {recipe.ingredients.length} Zutaten
            </p>
          ) : (
            <p className="muted tiny">Freitext — kein Bibliotheks-Rezept</p>
          )}
        </div>
        {recipe ? <Avatar userId={recipe.createdBy} /> : null}
      </div>
      <div className="tags">
        {kind === 'base' ? <span className="tag green">Basis</span> : null}
        {kind === 'side' ? <span className="tag">Beilage</span> : null}
        {recipe?.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
        {recipe?.cookidooUrl ? (
          <span className="tag green">Cookidoo</span>
        ) : null}
      </div>
      {recipe?.notes ? <p className="muted">{recipe.notes}</p> : null}
      {recipe ? <IngredientList items={recipe.ingredients} /> : null}
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
  onClose,
  onClear,
}: {
  day: Weekday
  slot: WeekSlot
  recipes: Recipe[]
  onClose: () => void
  onClear?: () => void
}) {
  const main = recipes.find((r) => r.id === slot.recipeId)
  const side = recipes.find((r) => r.id === slot.sideRecipeId)
  const sideTitle = slot.sideTitle || side?.title
  const headline = slotMealLabel(slot, recipes)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal stack meal-detail-modal"
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
            <h2>{headline || 'Gericht'}</h2>
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Schließen
          </button>
        </div>

        <RecipeDetailBlock
          recipe={main}
          fallbackTitle={slot.title || headline}
          role={sideTitle ? 'Haupt / Basis' : undefined}
        />

        {sideTitle ? (
          <RecipeDetailBlock
            recipe={side}
            fallbackTitle={sideTitle}
            role="Beilage"
          />
        ) : null}

        {!main && !side && !slot.title && !sideTitle ? (
          <p className="muted">Für diesen Tag liegt noch kein Rezept vor.</p>
        ) : null}

        {onClear ? (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              onClear()
              onClose()
            }}
          >
            Gericht vom Tag löschen
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

function slotHasMeal(slot?: WeekSlot | null) {
  if (!slot) return false
  return Boolean(
    slot.recipeId || slot.title || slot.sideRecipeId || slot.sideTitle,
  )
}

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
  return (
    <div className="app-shell login-shell">
      <div>
        <div className="login-hero">
          <h1>Wochenkochen</h1>
          <p>
            Am Wochenende pitchen, festnageln, einkaufen — Daryoush &amp; Wendi
            planen die nächste Woche gemeinsam.
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
                <strong>Daryoush</strong>
                <span>Weiter als Daryoush</span>
              </span>
            </button>
            <button type="button" onClick={() => login('wendy')}>
              <Avatar userId="wendy" size={44} />
              <span>
                <strong>Wendi</strong>
                <span>Weiter als Wendi</span>
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
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
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

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className={`home-btn ${onHomePage ? 'active' : ''}`}
          onClick={onHome}
          aria-label="Zur Startseite"
          title="Startseite"
        >
          <Home size={18} aria-hidden />
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
        <span>{USERS[currentUser].name}</span>
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
  const allPitches = useStore((s) => s.pitches)
  const bringEnabled = useStore((s) => s.settings.bring.enabled)
  const assignSlot = useStore((s) => s.assignSlot)
  const clearSlot = useStore((s) => s.clearSlot)
  const lockWeek = useStore((s) => s.lockWeek)
  const reopenWeek = useStore((s) => s.reopenWeek)
  const selectWeekByDate = useStore((s) => s.selectWeekByDate)
  const [pickingDay, setPickingDay] = useState<Weekday | null>(null)
  const [detailDay, setDetailDay] = useState<Weekday | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [pendingBase, setPendingBase] = useState<{
    recipeId: string
    title: string
  } | null>(null)

  const week = useMemo(
    () => weeks.find((w) => w.id === activeWeekId),
    [weeks, activeWeekId],
  )
  const pitches = useMemo(
    () => allPitches.filter((p) => p.weekId === activeWeekId),
    [allPitches, activeWeekId],
  )
  const sideRecipes = useMemo(
    () => recipes.filter((r) => (r.kind ?? 'meal') === 'side'),
    [recipes],
  )
  const mainRecipes = useMemo(
    () => recipes.filter((r) => (r.kind ?? 'meal') !== 'side'),
    [recipes],
  )
  const plannedCount = useMemo(
    () =>
      week?.slots.filter(
        (s) => s.recipeId || s.title || s.sideRecipeId || s.sideTitle,
      ).length ?? 0,
    [week],
  )
  const detailSlot = useMemo(
    () => week?.slots.find((s) => s.day === detailDay) ?? null,
    [week, detailDay],
  )

  if (!week) return null

  const closePicker = () => {
    setPickingDay(null)
    setPendingBase(null)
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
  const phaseShop = pitching ? 'idle' : 'current'
  const activePhase = !pitching ? 'shop' : plannedCount === 0 ? 'plan' : 'lock'

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
              </span>
              {pitching
                ? plannedCount === 0
                  ? 'Tag tippen und Gericht wählen'
                  : `${plannedCount}/7 geplant — dann festnageln`
                : `${plannedCount} Tage festgelegt`}
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
              {phaseShop === 'current' ? (
                <ShoppingBasket size={16} />
              ) : (
                <Lock size={16} />
              )}
            </span>
            <span className="week-step-label">Einkaufen</span>
          </li>
        </ol>

        <div className="week-toolbar-actions">
          {pitching ? (
            <>
              <button
                type="button"
                className="btn accent week-action-primary"
                onClick={lockWeek}
                disabled={plannedCount === 0}
              >
                <Pin size={18} aria-hidden />
                Woche festnageln
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
                {bringEnabled ? 'Zur Einkaufsliste' : 'Einkaufsliste bauen'}
              </button>
              <button
                type="button"
                className="btn ghost week-action-secondary"
                onClick={reopenWeek}
              >
                <Lock size={16} aria-hidden />
                Woche wieder öffnen
              </button>
            </>
          )}
        </div>
      </div>

      <div className="day-grid">
        {week.slots.map((slot) => {
          const recipe = recipes.find((r) => r.id === slot.recipeId)
          const side =
            slot.sideTitle ||
            recipes.find((r) => r.id === slot.sideRecipeId)?.title
          const title = slotMealLabel(slot, recipes)
          const hasMeal = Boolean(slot.title || recipe || side)
          return (
            <div
              key={slot.day}
              className={`day-card ${hasMeal ? 'clickable' : 'empty'}`}
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
                {hasMeal ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearSlot(slot.day)
                    }}
                  >
                    Löschen
                  </button>
                ) : null}
              </div>
              {hasMeal ? (
                <>
                  <h3>{title}</h3>
                  <div className="tags">
                    {recipe?.kind === 'base' ? (
                      <span className="tag green">Basis</span>
                    ) : null}
                    {side ? <span className="tag">Beilage</span> : null}
                    {recipe?.tags?.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPendingBase(null)
                    setPickingDay(slot.day)
                  }}
                >
                  Gericht wählen
                </button>
              )}
            </div>
          )
        })}
      </div>

      {detailDay && detailSlot ? (
        <MealDetailModal
          day={detailDay}
          slot={detailSlot}
          recipes={recipes}
          onClose={() => setDetailDay(null)}
          onClear={() => clearSlot(detailDay)}
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

      {pickingDay ? (
        <div className="modal-backdrop" onClick={closePicker}>
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h2>
                {pendingBase
                  ? `Beilage zu ${pendingBase.title}`
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
                {sideRecipes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="btn secondary"
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
                    {r.title}
                  </button>
                ))}
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
                <p className="muted tiny">Aus Pitches</p>
                {pitches.length === 0 ? (
                  <p className="muted">Noch keine Pitches — erst vorschlagen.</p>
                ) : (
                  pitches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="btn secondary"
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
                      {mealLabel(p.title, p.sideTitle)}
                    </button>
                  ))
                )}
                <div className="divider" />
                <p className="muted tiny">Basis / Gerichte</p>
                {mainRecipes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      if ((r.kind ?? 'meal') === 'base') {
                        setPendingBase({ recipeId: r.id, title: r.title })
                      } else {
                        assignSlot(pickingDay, {
                          recipeId: r.id,
                          title: r.title,
                        })
                        closePicker()
                      }
                    }}
                  >
                    {r.title}
                    {(r.kind ?? 'meal') === 'base' ? ' · Basis' : ''}
                  </button>
                ))}
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
  const recipes = useStore((s) => s.recipes)
  const allPitches = useStore((s) => s.pitches)
  const activeWeekId = useStore((s) => s.activeWeekId)
  const weeks = useStore((s) => s.weeks)
  const addPitch = useStore((s) => s.addPitch)
  const reactToPitch = useStore((s) => s.reactToPitch)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [recipeId, setRecipeId] = useState('')
  const [sideRecipeId, setSideRecipeId] = useState('')
  const [sideFree, setSideFree] = useState('')
  const [attachSide, setAttachSide] = useState(false)
  const pitches = useMemo(
    () => allPitches.filter((p) => p.weekId === activeWeekId),
    [allPitches, activeWeekId],
  )
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

  return (
    <div className="stack">
      <div className="panel stack">
        <div>
          <h2>Pitch-Modus</h2>
          <p className="lede">
            {locked
              ? 'Woche ist festgenagelt — zum Weiterpitchen erst wieder öffnen.'
              : 'Vorschläge pitchen und abstimmen — z. B. Reis + unterschiedliche Beilagen als eigene Pitches.'}
          </p>
        </div>
        {locked ? (
          <p className="muted tiny">
            Abstimmen und neue Pitches sind während „Festgelegt“ gesperrt.
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

      {pitches.map((p) => (
        <article key={p.id} className="pitch-card">
          <div className="row">
            <Avatar userId={p.pitchedBy} />
            <div className="grow">
              <h3>{mealLabel(p.title, p.sideTitle)}</h3>
              <p className="muted tiny">
                von {USERS[p.pitchedBy].name}
                {p.sideTitle || p.sideRecipeId ? ' · Basis + Beilage' : ''}
                {p.recipeId ? ' · Rezept verknüpft' : ''}
              </p>
            </div>
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
                onClick={() => reactToPitch(p.id, key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="row wrap">
            {(['darius', 'wendy'] as UserId[]).map((uid) =>
              p.reactions[uid] ? (
                <span key={uid} className="tag green">
                  {USERS[uid].name}: {p.reactions[uid]}
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
  const addRecipe = useStore((s) => s.addRecipe)
  const updateRecipe = useStore((s) => s.updateRecipe)
  const duplicateRecipe = useStore((s) => s.duplicateRecipe)
  const deleteRecipe = useStore((s) => s.deleteRecipe)
  const restoreRecipe = useStore((s) => s.restoreRecipe)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseFlash, setBrowseFlash] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'meal' | 'base' | 'side'>('meal')
  const [tags, setTags] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [notes, setNotes] = useState('')
  const [cookidooUrl, setCookidooUrl] = useState('')
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
    pendingUndoRef.current = null
    clearUndoTimers()
    setUndo(null)
  }

  const undoDelete = () => {
    const pending = pendingUndoRef.current
    if (!pending) return
    restoreRecipe(pending.recipe, pending.index)
    finalizePendingDelete()
    setFlash(`„${pending.recipe.title}“ wiederhergestellt`)
  }

  const requestDelete = (recipe: (typeof recipes)[number]) => {
    // Commit any previous pending delete first.
    if (pendingUndoRef.current) {
      pendingUndoRef.current = null
      clearUndoTimers()
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

  useEffect(() => {
    return () => {
      // Leaving the view keeps the delete (already applied).
      clearUndoTimers()
      pendingUndoRef.current = null
    }
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setKind('meal')
    setTags('')
    setIngredients('')
    setNotes('')
    setCookidooUrl('')
  }

  const openCreate = () => {
    resetForm()
    setFormOpen(true)
  }

  const openEdit = (recipe: (typeof recipes)[number]) => {
    setEditingId(recipe.id)
    setTitle(recipe.title)
    setKind(recipe.kind ?? 'meal')
    setTags(recipe.tags.join(', '))
    setIngredients(
      recipe.ingredients
        .map((i) => (i.amount ? `${i.amount} ${i.name}` : i.name))
        .join('\n'),
    )
    setNotes(recipe.notes ?? '')
    setCookidooUrl(recipe.cookidooUrl ?? '')
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

  const saveForm = () => {
    if (!title.trim()) return
    const payload = {
      title: title.trim(),
      kind,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      ingredients: parseIngredients(),
      notes: notes.trim() || undefined,
      cookidooUrl: cookidooUrl.trim() || undefined,
    }
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
              Bibliothek — anlegen, anpassen, duplizieren oder löschen.
            </p>
          </div>
        </div>
        <div className="row wrap">
          <button type="button" className="btn sm" onClick={openCreate}>
            Neu
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

      {recipes.map((r) => (
        <article
          key={r.id}
          className={`recipe-card clickable ${detailId === r.id ? 'open' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => setDetailId(detailId === r.id ? null : r.id)}
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
                von {USERS[r.createdBy].name} · {r.ingredients.length} Zutaten
                {detailId === r.id ? '' : ' · tippen für Details'}
              </p>
            </div>
            <Avatar userId={r.createdBy} />
          </div>
          <div className="tags">
            {(r.kind ?? 'meal') === 'base' ? (
              <span className="tag green">Basis</span>
            ) : null}
            {(r.kind ?? 'meal') === 'side' ? (
              <span className="tag">Beilage</span>
            ) : null}
            {r.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
            {r.cookidooUrl ? <span className="tag green">Cookidoo</span> : null}
          </div>
          {detailId === r.id ? (
            <>
              {r.notes ? <p className="muted">{r.notes}</p> : null}
              <IngredientList items={r.ingredients} />
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
                  className="btn sm danger"
                  onClick={() => requestDelete(r)}
                >
                  Löschen
                </button>
              </div>
            </>
          ) : r.notes ? (
            <p className="muted">{r.notes}</p>
          ) : null}
        </article>
      ))}

      {formOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setFormOpen(false)
            resetForm()
          }}
        >
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
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
              <label htmlFor="r-kind">Typ</label>
              <select
                id="r-kind"
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as 'meal' | 'base' | 'side')
                }
              >
                <option value="meal">Volles Gericht</option>
                <option value="base">Basis (z. B. Reis)</option>
                <option value="side">Beilage</option>
              </select>
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
                onChange={(e) => setCookidooUrl(e.target.value)}
                placeholder="https://cookidoo.de/..."
              />
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

  const week = useMemo(
    () => weeks.find((w) => w.id === activeWeekId),
    [weeks, activeWeekId],
  )
  const locked = week?.status === 'locked'
  const items = shoppingDraft
  const sendableCount = items.filter((i) => i.name.trim()).length
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

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="section-head">
          <div>
            <h2>Einkaufsliste</h2>
            <p className="lede">
              Nach dem Festnageln: Liste laden — Zutaten nach Gericht geordnet,
              Mengen anpassen, dann an Bring senden.
            </p>
          </div>
          <span className={`status-pill ${locked ? '' : 'warn'}`}>
            {locked ? 'Plan final' : 'Noch Pitch'}
          </span>
        </div>

        {!locked ? (
          <>
            <p className="muted">
              Während der Pitch-Phase wird nichts auf die Einkaufsliste / Bring
              geschrieben. Gerichte festlegen, Woche festnageln, dann hierher
              zurück.
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
                className="btn sm"
                onClick={() => {
                  const list = buildShoppingList()
                  setFlash({
                    ok: list.length > 0,
                    message:
                      list.length > 0
                        ? `${list.length} Zutaten geladen — Mengen kannst du noch ändern.`
                        : 'Im finalen Plan sind noch keine Gerichte mit Zutaten.',
                  })
                }}
              >
                Liste aus Plan laden
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
                  sendableCount === 0
                }
                onClick={async () => {
                  setBusy(true)
                  const res = await pushToBring()
                  setFlash({ ok: res.ok, message: res.message })
                  setBusy(false)
                }}
              >
                {busy ? 'Sende…' : 'Jetzt an Bring senden'}
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
                Bring optional unter Menü → Einstellungen einschalten. Die Liste
                unten kannst du trotzdem laden und bearbeiten.
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

      {flash ? (
        <div className={`flash ${flash.ok ? '' : 'bad'}`}>{flash.message}</div>
      ) : null}

      <div className="shopping-list panel stack">
        {!locked ? (
          <p className="muted">
            Wartet auf finalen Wochenplan („Woche festnageln“).
          </p>
        ) : items.length === 0 ? (
          <p className="muted">
            Noch leer — „Liste aus Plan laden“, Mengen anpassen, dann an Bring
            senden.
          </p>
        ) : (
          groups.map(([dish, groupItems]) => {
            const day = groupItems.find((i) => i.day)?.day
            return (
              <section key={dish} className="shop-group">
                <h3
                  className={`shop-group-title ${day ? WEEKDAY_COLOR_CLASS[day] : ''}`}
                >
                  {dish}
                </h3>
                {groupItems.map((item) => (
                  <div key={item.id} className="shop-row">
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
                    <button
                      type="button"
                      className="btn ghost sm shop-remove"
                      aria-label={`${item.name || 'Zutat'} entfernen`}
                      onClick={() => removeShoppingItem(item.id)}
                    >
                      ✕
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
  const updateBring = useStore((s) => s.updateBring)
  const updateCookidoo = useStore((s) => s.updateCookidoo)
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
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
    null,
  )
  const [sync, setSync] = useState(getSyncStatus)

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
        <h2>Gemeinsamer Speicher</h2>
        <p className="lede">
          Auf dem Webspace liegen Rezepte, Pitches und der Wochenplan in einer
          mitgelieferten <strong>SQLite</strong>-Datei — Daryoush und Wendi sehen
          denselben Stand. Lokal ohne PHP nur im Browser.
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
            Maybe / Nope). Basis + Beilage (z.&nbsp;B. Reis + Salat) als eigene
            Pitches abstimmen.
          </li>
          <li>
            <strong>Plan</strong> — Gerichte den Wochentagen zuordnen; bei einer
            Basis danach die Beilage wählen. Tippe auf einen befüllten Tag, um
            Rezept-Details und Zutaten zu sehen. Erst nach „Woche festnageln“
            Einkaufsliste laden / an Bring senden.
          </li>
          <li>
            <strong>Rezepte</strong> — Bibliothek als Gericht, Basis oder
            Beilage pflegen.
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
            Einkaufsliste senden.
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

export default function App() {
  const currentUser = useStore((s) => s.currentUser)
  const bringEnabled = useStore((s) => s.settings.bring.enabled)
  const [tab, setTab] = useState<Tab>('week')

  useEffect(() => {
    if (!bringEnabled && tab === 'shop') setTab('week')
  }, [bringEnabled, tab])

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
