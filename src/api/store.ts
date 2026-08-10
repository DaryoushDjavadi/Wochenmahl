const API_BASE = './api'

export type HouseholdState = {
  recipes: unknown[]
  pitches: unknown[]
  weeks: unknown[]
  activeWeekId: string
  shoppingDraft: unknown[]
  settings: unknown
}

export type StoreLoadResult = {
  ok: boolean
  empty?: boolean
  revision: number
  updatedAt: string | null
  state: HouseholdState | null
  engine?: string
  message?: string
}

export type StoreSaveResult = {
  ok: boolean
  conflict?: boolean
  revision?: number
  updatedAt?: string
  state?: HouseholdState | null
  engine?: string
  message?: string
}

export type StorePingResult = {
  ok: boolean
  engine?: string
  message?: string
}

async function parseJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    throw new Error(
      `Store-API antwortet nicht (${res.status}). SQLite braucht PHP + PDO_SQLITE auf dem Webspace.`,
    )
  }
}

export async function pingStore(): Promise<StorePingResult> {
  const res = await fetch(`${API_BASE}/store.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ping' }),
  })
  return parseJson<StorePingResult>(res)
}

export async function loadHousehold(): Promise<StoreLoadResult> {
  const res = await fetch(`${API_BASE}/store.php`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  return parseJson<StoreLoadResult>(res)
}

export async function saveHousehold(
  state: HouseholdState,
  revision: number,
): Promise<StoreSaveResult> {
  const res = await fetch(`${API_BASE}/store.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save',
      revision,
      state,
    }),
  })
  return parseJson<StoreSaveResult>(res)
}
