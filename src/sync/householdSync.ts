import type { AppSettings, Pitch, Recipe, ShoppingItem, WeekPlan } from '../types'
import {
  loadHousehold,
  pingStore,
  saveHousehold,
  type HouseholdState,
} from '../api/store'
import { useStore } from '../store'

export type SyncStatus =
  | 'checking'
  | 'online'
  | 'offline'
  | 'saving'
  | 'error'

type SyncListener = (status: SyncStatus, detail?: string) => void

let revision = 0
let status: SyncStatus = 'checking'
let detail = ''
let applyingRemote = false
let dirty = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let started = false
const listeners = new Set<SyncListener>()

function setStatus(next: SyncStatus, nextDetail = '') {
  status = next
  detail = nextDetail
  for (const fn of listeners) fn(status, detail)
}

export function getSyncStatus() {
  return { status, detail, revision }
}

export function subscribeSync(fn: SyncListener) {
  listeners.add(fn)
  fn(status, detail)
  return () => {
    listeners.delete(fn)
  }
}

function settingsForSync(settings: AppSettings): AppSettings {
  // Transient UI errors must not stick in shared SQLite forever.
  return {
    ...settings,
    bring: { ...settings.bring, lastError: undefined },
    cookidoo: { ...settings.cookidoo, lastError: undefined },
  }
}

function snapshotHousehold(): HouseholdState {
  const s = useStore.getState()
  return {
    recipes: s.recipes,
    pitches: s.pitches,
    weeks: s.weeks,
    activeWeekId: s.activeWeekId,
    shoppingDraft: s.shoppingDraft,
    settings: settingsForSync(s.settings),
  }
}

function applyRemote(state: HouseholdState, nextRevision: number) {
  applyingRemote = true
  revision = nextRevision
  const local = useStore.getState()
  const remoteSettings = (state.settings as AppSettings) ?? local.settings
  useStore.setState({
    recipes: (state.recipes as Recipe[]) ?? local.recipes,
    pitches: (state.pitches as Pitch[]) ?? [],
    weeks: (state.weeks as WeekPlan[]) ?? local.weeks,
    activeWeekId: state.activeWeekId || local.activeWeekId,
    shoppingDraft: (state.shoppingDraft as ShoppingItem[]) ?? [],
    settings: {
      ...remoteSettings,
      bring: {
        ...remoteSettings.bring,
        // Keep ephemeral local diagnostics; never resurrect remote lastError.
        lastError: local.settings.bring.lastError,
      },
      cookidoo: {
        ...remoteSettings.cookidoo,
        lastError: local.settings.cookidoo.lastError,
      },
    },
  })
  queueMicrotask(() => {
    applyingRemote = false
  })
}

async function pushSave() {
  if (applyingRemote) return
  if (status === 'offline') return

  setStatus('saving')
  try {
    const res = await saveHousehold(snapshotHousehold(), revision)
    if (res.conflict && res.state && typeof res.revision === 'number') {
      applyRemote(res.state, res.revision)
      setStatus('online', 'Mit Server abgeglichen')
      return
    }
    if (!res.ok) {
      setStatus('error', res.message || 'Speichern fehlgeschlagen')
      return
    }
    revision = res.revision ?? revision + 1
    dirty = false
    setStatus('online', 'In SQLite gespeichert')
  } catch (err) {
    setStatus(
      'offline',
      err instanceof Error ? err.message : 'Kein PHP/SQLite erreichbar',
    )
  }
}

function scheduleSave() {
  if (applyingRemote) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void pushSave()
  }, 450)
}

async function pull() {
  try {
    const res = await loadHousehold()
    if (!res.ok) {
      setStatus('error', res.message || 'Laden fehlgeschlagen')
      return
    }
    if (res.empty || !res.state) {
      // First run on server: upload local household.
      setStatus('online', 'SQLite leer — lokal hochladen')
      dirty = true
      await pushSave()
      return
    }
    if (res.revision > revision && res.state) {
      applyRemote(res.state, res.revision)
      dirty = false
      setStatus('online', 'Vom Server geladen')
      return
    }
    if (dirty || res.revision < revision) {
      setStatus('online')
      await pushSave()
      return
    }
    revision = res.revision
    setStatus('online', 'Aktuell')
  } catch (err) {
    setStatus(
      'offline',
      err instanceof Error ? err.message : 'Kein PHP/SQLite erreichbar',
    )
  }
}

export async function startHouseholdSync() {
  if (started) return
  started = true
  setStatus('checking')

  try {
    const ping = await pingStore()
    if (!ping.ok) {
      setStatus('offline', ping.message || 'Store nicht bereit')
    }
  } catch (err) {
    setStatus(
      'offline',
      err instanceof Error
        ? err.message
        : 'Lokal ohne PHP: Daten nur in diesem Browser.',
    )
  }

  await pull()

  useStore.subscribe(() => {
    if (applyingRemote) return
    dirty = true
    if (status === 'offline' || status === 'checking' || status === 'error') return
    scheduleSave()
  })

  pollTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') return
    void pull()
  }, 4000)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && status !== 'offline') {
      void pull()
    }
  })
}

export function stopHouseholdSync() {
  if (saveTimer) clearTimeout(saveTimer)
  if (pollTimer) clearInterval(pollTimer)
  started = false
}
