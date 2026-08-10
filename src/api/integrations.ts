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
  cookies?: { key: string; value: string; domain: string; path: string }[]
  country?: string
  language?: string
  suggestions?: { title: string; id?: string | null }[]
  debug?: {
    finalUrl?: string | null
    status?: number | null
    cookieKeys?: string[]
    market?: string
    base?: string
    badPassword?: boolean
  }
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
  accessToken?: string
  cookies?: string
  recipe: string
  country?: string
}) {
  return postJson<CookidooImportResult>('cookidoo.php', {
    action: 'importRecipe',
    accessToken: input.accessToken,
    cookies: input.cookies,
    recipe: input.recipe,
    country: input.country ?? 'de',
  })
}

export type CookidooBrowseRecipe = {
  id: string
  title: string
  totalTime?: string | null
  image?: string | null
}

export type CookidooSearchResult = {
  ok: boolean
  message: string
  recipes?: CookidooBrowseRecipe[]
  hint?: string
  searchUrl?: string
}

export type CookidooListsResult = {
  ok: boolean
  message: string
  lists?: { id: string | null; title: string; count?: number | null }[]
}

export type CookidooListRecipesResult = {
  ok: boolean
  message: string
  recipes?: CookidooBrowseRecipe[]
}

export function searchCookidooRecipes(input: {
  accessToken?: string
  cookies?: string
  query: string
  country?: string
}) {
  return postJson<CookidooSearchResult>('cookidoo.php', {
    action: 'search',
    accessToken: input.accessToken,
    cookies: input.cookies,
    query: input.query,
    country: input.country ?? 'de',
  })
}

export function listCookidooCollections(input: {
  accessToken?: string
  cookies?: string
  country?: string
}) {
  return postJson<CookidooListsResult>('cookidoo.php', {
    action: 'lists',
    accessToken: input.accessToken,
    cookies: input.cookies,
    country: input.country ?? 'de',
  })
}

export function listCookidooCollectionRecipes(input: {
  accessToken?: string
  cookies?: string
  listId: string
  country?: string
}) {
  return postJson<CookidooListRecipesResult>('cookidoo.php', {
    action: 'listRecipes',
    accessToken: input.accessToken,
    cookies: input.cookies,
    listId: input.listId,
    country: input.country ?? 'de',
  })
}
