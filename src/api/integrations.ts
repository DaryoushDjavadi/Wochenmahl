const API_BASE = './api'

export type BringList = { listUuid: string; name: string }

export type BringLoginResult = {
  ok: boolean
  message: string
  uuid?: string
  accessToken?: string
  refreshToken?: string
  name?: string
  lists?: BringList[]
}

export type BringPushResult = {
  ok: boolean
  message: string
  added?: string[]
  failed?: string[]
}

export type CookidooLoginResult = {
  ok: boolean
  message: string
  hint?: string
  accessToken?: string
  refreshToken?: string
  country?: string
  language?: string
  suggestions?: { title: string; id?: string | null }[]
}

export type CookidooImportResult = {
  ok: boolean
  message: string
  recipe?: {
    id: string
    title: string
    ingredients: { name: string; amount?: string | null }[]
    notes?: string
    cookidooUrl?: string
    tags?: string[]
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data: T & { message?: string; ok?: boolean }
  try {
    data = (await res.json()) as T & { message?: string; ok?: boolean }
  } catch {
    throw new Error(
      `API antwortet nicht (${res.status}). Liegt die Seite auf einem PHP-Webspace? Lokaler Vite-Dev braucht ebenfalls PHP oder Upload nach www/.`,
    )
  }
  return data
}

export function linkBringAccount(email: string, password: string) {
  return postJson<BringLoginResult>('bring.php', {
    action: 'login',
    email,
    password,
  })
}

export function pushItemsToBring(input: {
  uuid: string
  accessToken: string
  listUuid: string
  items: { name: string; amount?: string }[]
}) {
  return postJson<BringPushResult>('bring.php', {
    action: 'push',
    ...input,
  })
}

export function linkCookidooAccount(
  email: string,
  password: string,
  country = 'de',
) {
  return postJson<CookidooLoginResult>('cookidoo.php', {
    action: 'login',
    email,
    password,
    country,
  })
}

export function importCookidooRecipeApi(input: {
  accessToken: string
  recipe: string
  country?: string
}) {
  return postJson<CookidooImportResult>('cookidoo.php', {
    action: 'importRecipe',
    accessToken: input.accessToken,
    recipe: input.recipe,
    country: input.country ?? 'de',
  })
}
