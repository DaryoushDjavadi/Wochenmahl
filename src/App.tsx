import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  ChefHat,
  CircleHelp,
  Menu,
  MessageSquarePlus,
  Settings,
  ShoppingCart,
} from 'lucide-react'
import { USERS, mealLabel, slotMealLabel } from './data/seed'
import { useStore } from './store'
import type { UserId, Weekday } from './types'

type Tab = 'week' | 'pitch' | 'recipes' | 'shop' | 'settings' | 'help'

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

function LoginScreen() {
  const login = useStore((s) => s.login)
  return (
    <div className="app-shell login-shell">
      <div>
        <div className="login-hero">
          <h1>Wochenkochen</h1>
          <p>
            Am Wochenende pitchen, festnageln, einkaufen — Darius &amp; Wendy
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
                <strong>Darius</strong>
                <span>Weiter als Darius</span>
              </span>
            </button>
            <button type="button" onClick={() => login('wendy')}>
              <Avatar userId="wendy" size={44} />
              <span>
                <strong>Wendy</strong>
                <span>Weiter als Wendy</span>
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
}: {
  tab: Tab
  onOpenMenuPage: (page: 'settings' | 'help') => void
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

  return (
    <header className="topbar">
      <div className="topbar-left">
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
            <span>Menü</span>
          </button>
          {menuOpen ? (
            <div className="file-menu-panel" role="menu">
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
        <div className="brand-mark">
          <strong>{pageTitle}</strong>
          <span>{week?.label ?? 'Nächste Woche'}</span>
        </div>
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
  const [pickingDay, setPickingDay] = useState<Weekday | null>(null)
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
  const locked = week?.status === 'locked'

  if (!week) return null

  const weekdayLabels: Record<Weekday, string> = {
    mo: 'Montag',
    di: 'Dienstag',
    mi: 'Mittwoch',
    do: 'Donnerstag',
    fr: 'Freitag',
    sa: 'Samstag',
    so: 'Sonntag',
  }

  const closePicker = () => {
    setPickingDay(null)
    setPendingBase(null)
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="section-head">
          <div>
            <h2>Wochenplan</h2>
            <p className="lede">
              Gerichte zuordnen — Basis wie Reis kann eine eigene Beilage
              bekommen.
            </p>
          </div>
          <span
            className={`status-pill ${week.status === 'locked' ? '' : 'warn'}`}
          >
            {week.status === 'locked' ? 'Festgelegt' : 'Pitch-Phase'}
          </span>
        </div>
        <div className="row wrap">
          {week.status === 'pitching' ? (
            <>
              <button type="button" className="btn sm" onClick={onPitch}>
                Zum Pitch
              </button>
              <button
                type="button"
                className="btn sm accent"
                onClick={lockWeek}
                disabled={plannedCount === 0}
              >
                Woche festnageln
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn sm secondary" onClick={reopenWeek}>
                Wieder öffnen
              </button>
              {bringEnabled ? (
                <button type="button" className="btn sm accent" onClick={onShop}>
                  Zur Einkaufsliste / Bring
                </button>
              ) : (
                <button type="button" className="btn sm" onClick={onShop}>
                  Einkaufsliste bauen
                </button>
              )}
            </>
          )}
        </div>
        {week.status === 'pitching' ? (
          <p className="muted tiny" style={{ marginTop: 10 }}>
            Einkaufen geht erst nach „Woche festnageln“ — dann bewusst an Bring
            senden.
          </p>
        ) : (
          <p className="muted tiny" style={{ marginTop: 10 }}>
            Plan steht ({plannedCount} Tage). Jetzt kannst du die Zutaten
            bewusst auf die Einkaufsliste / Bring legen.
          </p>
        )}
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
              className={`day-card ${hasMeal ? '' : 'empty'}`}
            >
              <div className="row">
                <strong className="grow">{weekdayLabels[slot.day]}</strong>
                {hasMeal && !locked ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => clearSlot(slot.day)}
                  >
                    Leeren
                  </button>
                ) : null}
              </div>
              {hasMeal ? (
                <>
                  <h3>{title}</h3>
                  {side ? (
                    <p className="muted tiny">
                      Basis + Beilage — Zutaten von beiden landen in der
                      Einkaufsliste.
                    </p>
                  ) : null}
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
              ) : locked ? (
                <p className="muted tiny">Leer — Plan ist festgenagelt.</p>
              ) : (
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={() => {
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

      {pickingDay ? (
        <div className="modal-backdrop" onClick={closePicker}>
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h2>
                {pendingBase
                  ? `Beilage zu ${pendingBase.title}`
                  : weekdayLabels[pickingDay]}
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
  const importCookidooRecipe = useStore((s) => s.importCookidooRecipe)
  const importFromCookidooAccount = useStore((s) => s.importFromCookidooAccount)
  const [open, setOpen] = useState(false)
  const [cookidooOpen, setCookidooOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<'meal' | 'base' | 'side'>('meal')
  const [tags, setTags] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [notes, setNotes] = useState('')
  const [cTitle, setCTitle] = useState('')
  const [cUrl, setCUrl] = useState('')
  const [cIngredients, setCIngredients] = useState('')
  const [cNotes, setCNotes] = useState('')
  const [cBusy, setCBusy] = useState(false)
  const [cFlash, setCFlash] = useState<string | null>(null)

  return (
    <div className="stack">
      <div className="panel">
        <div className="section-head">
          <div>
            <h2>Rezepte</h2>
            <p className="lede">
              Bibliothek — volle Gerichte, Basis (z.&nbsp;B. Reis) und Beilagen.
            </p>
          </div>
        </div>
        <div className="row wrap">
          <button type="button" className="btn sm" onClick={() => setOpen(true)}>
            Neu
          </button>
          {settings.cookidoo.enabled ? (
            <button
              type="button"
              className="btn sm secondary"
              onClick={() => setCookidooOpen(true)}
            >
              Cookidoo import
            </button>
          ) : null}
        </div>
      </div>

      {recipes.map((r) => (
        <article key={r.id} className="recipe-card">
          <div className="row">
            <div className="grow">
              <h3>{r.title}</h3>
              <p className="muted tiny">
                von {USERS[r.createdBy].name} · {r.ingredients.length} Zutaten
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
          {r.notes ? <p className="muted">{r.notes}</p> : null}
          {r.cookidooUrl ? (
            <a className="tiny" href={r.cookidooUrl} target="_blank" rel="noreferrer">
              In Cookidoo öffnen ↗
            </a>
          ) : null}
        </article>
      ))}

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <h2>Neues Rezept</h2>
            <div className="field">
              <label htmlFor="r-title">Titel</label>
              <input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} />
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
              <textarea id="r-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <button
              type="button"
              className="btn"
              disabled={!title.trim()}
              onClick={() => {
                addRecipe({
                  title: title.trim(),
                  kind,
                  tags: tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                  ingredients: ingredients
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const m = line.match(
                        /^([\d.,/\s]+(?:g|kg|ml|l|EL|TL|Stk\.?)?)\s+(.+)$/i,
                      )
                      if (m) return { amount: m[1].trim(), name: m[2].trim() }
                      return { name: line }
                    }),
                  notes: notes.trim() || undefined,
                })
                setTitle('')
                setKind('meal')
                setTags('')
                setIngredients('')
                setNotes('')
                setOpen(false)
              }}
            >
              Speichern
            </button>
          </div>
        </div>
      ) : null}

      {cookidooOpen ? (
        <div className="modal-backdrop" onClick={() => setCookidooOpen(false)}>
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <h2>Cookidoo Import</h2>
            {settings.cookidoo.linked ? (
              <>
                <p className="lede">
                  Mit verknüpftem Konto: Link oder Rezept-ID laden (z.&nbsp;B.
                  https://cookidoo.de/…/r59322 oder r59322).
                </p>
                <div className="field">
                  <label htmlFor="c-url">Cookidoo-Link oder ID</label>
                  <input
                    id="c-url"
                    value={cUrl}
                    onChange={(e) => setCUrl(e.target.value)}
                    placeholder="https://cookidoo.de/.../r123 oder r123"
                  />
                </div>
                {cFlash ? <div className="flash">{cFlash}</div> : null}
                <button
                  type="button"
                  className="btn"
                  disabled={!cUrl.trim() || cBusy}
                  onClick={async () => {
                    setCBusy(true)
                    const res = await importFromCookidooAccount(cUrl.trim())
                    setCFlash(res.message)
                    setCBusy(false)
                    if (res.ok) {
                      setCUrl('')
                      setTimeout(() => setCookidooOpen(false), 700)
                    }
                  }}
                >
                  {cBusy ? 'Lade…' : 'Vom Konto laden'}
                </button>
                <div className="divider" />
                <p className="muted tiny">Oder manuell eintragen:</p>
              </>
            ) : (
              <p className="lede">
                Konto unter Menü → Einstellungen verknüpfen für Auto-Import — oder
                Titel, Link und Zutaten manuell einfügen.
              </p>
            )}
            <div className="field">
              <label htmlFor="c-url-manual">Cookidoo-Link</label>
              <input
                id="c-url-manual"
                value={cUrl}
                onChange={(e) => setCUrl(e.target.value)}
                placeholder="https://cookidoo.de/..."
              />
            </div>
            <div className="field">
              <label htmlFor="c-title">Titel</label>
              <input id="c-title" value={cTitle} onChange={(e) => setCTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="c-ing">Zutaten</label>
              <textarea
                id="c-ing"
                value={cIngredients}
                onChange={(e) => setCIngredients(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="c-notes">Notizen</label>
              <textarea id="c-notes" value={cNotes} onChange={(e) => setCNotes(e.target.value)} />
            </div>
            <button
              type="button"
              className="btn secondary"
              disabled={!cUrl.trim() || !cTitle.trim()}
              onClick={() => {
                importCookidooRecipe({
                  title: cTitle,
                  url: cUrl,
                  ingredientsText: cIngredients,
                  notes: cNotes || undefined,
                })
                setCTitle('')
                setCUrl('')
                setCIngredients('')
                setCNotes('')
                setCookidooOpen(false)
              }}
            >
              Manuell speichern
            </button>
          </div>
        </div>
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
  const items = useMemo(
    () => (shoppingDraft.length ? shoppingDraft : []),
    [shoppingDraft],
  )

  return (
    <div className="stack">
      <div className="panel stack">
        <div className="section-head">
          <div>
            <h2>Einkaufsliste</h2>
            <p className="lede">
              Erst wenn die Woche festgenagelt ist — dann bewusst an Bring
              senden.
            </p>
          </div>
          <span
            className={`status-pill ${locked ? '' : 'warn'}`}
          >
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
                        ? `${list.length} Zutaten aus dem finalen Plan.`
                        : 'Im finalen Plan sind noch keine Gerichte mit Zutaten.',
                  })
                }}
              >
                Liste aus Plan laden
              </button>
              <button
                type="button"
                className="btn sm accent"
                disabled={
                  busy ||
                  !settings.bring.enabled ||
                  !settings.bring.linked ||
                  items.length === 0
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
                unten kannst du trotzdem laden.
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

      <ul className="shopping-list panel">
        {!locked ? (
          <li>
            <span className="muted">
              Wartet auf finalen Wochenplan („Woche festnageln“).
            </span>
          </li>
        ) : items.length === 0 ? (
          <li>
            <span className="muted">
              Noch leer — „Liste aus Plan laden“, dann bei Bedarf an Bring
              senden.
            </span>
          </li>
        ) : (
          items.map((item) => (
            <li key={`${item.name}-${item.amount ?? ''}`}>
              <span>{item.name}</span>
              <span className="muted">{item.amount}</span>
            </li>
          ))
        )}
      </ul>

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

  return (
    <div className="stack">
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
                  ? { linked: false, accessToken: '', refreshToken: '' }
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
              Nach dem Login: unter Rezepte „Cookidoo import“ mit Link oder ID
              (z.&nbsp;B. r59322). Läuft über <code>api/cookidoo.php</code>.
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
            Basis danach die Beilage wählen. Erst nach „Woche festnageln“
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
      <TopBar tab={tab} onOpenMenuPage={setTab} />
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
