import type {
  CustomRecipeCategory,
  Recipe,
  RecipeCategory,
  BuiltinRecipeCategory,
} from '../types'

export type CategoryDef = {
  id: RecipeCategory
  label: string
  hint: string
  builtin: boolean
  kind: Recipe['kind']
}

export const RECIPE_CATEGORIES: {
  id: BuiltinRecipeCategory
  label: string
  hint: string
}[] = [
  { id: 'main', label: 'Hauptspeise', hint: 'Abendessen / Hauptgericht' },
  { id: 'soup', label: 'Suppe', hint: 'Suppen & Eintöpfe' },
  { id: 'salad', label: 'Salat', hint: 'Salate & Bowls' },
  { id: 'side', label: 'Beilage', hint: 'Als Beilage zum Pitchen' },
  { id: 'base', label: 'Basis', hint: 'z. B. Reis, Nudeln' },
  { id: 'breakfast', label: 'Frühstück', hint: 'Morgens' },
  { id: 'dessert', label: 'Dessert', hint: 'Süßes & Nachtisch' },
  { id: 'snack', label: 'Snack', hint: 'Kleinigkeiten' },
  { id: 'drink', label: 'Getränk', hint: 'Shakes, Säfte, …' },
  { id: 'other', label: 'Sonstiges', hint: 'Alles andere' },
]

const BUILTIN_IDS = new Set(RECIPE_CATEGORIES.map((c) => c.id))

/** @deprecated Prefer categoryLabel() — kept for builtin lookups. */
export const CATEGORY_LABEL: Record<BuiltinRecipeCategory, string> =
  Object.fromEntries(
    RECIPE_CATEGORIES.map((c) => [c.id, c.label]),
  ) as Record<BuiltinRecipeCategory, string>

export function isBuiltinCategory(id: string): id is BuiltinRecipeCategory {
  return BUILTIN_IDS.has(id as BuiltinRecipeCategory)
}

export function listRecipeCategories(
  custom: CustomRecipeCategory[] = [],
): CategoryDef[] {
  return [
    ...RECIPE_CATEGORIES.map((c) => ({
      id: c.id as RecipeCategory,
      label: c.label,
      hint: c.hint,
      builtin: true,
      kind: kindFromCategory(c.id),
    })),
    ...custom.map((c) => ({
      id: c.id,
      label: c.label,
      hint: c.hint?.trim() || 'Eigene Kategorie',
      builtin: false,
      kind: c.kind ?? 'meal',
    })),
  ]
}

export function categoryLabel(
  id: RecipeCategory | undefined | null,
  custom: CustomRecipeCategory[] = [],
): string {
  if (!id) return ''
  if (isBuiltinCategory(id)) return CATEGORY_LABEL[id]
  const hit = custom.find((c) => c.id === id)
  return hit?.label || id
}

export function findCategoryDef(
  id: RecipeCategory,
  custom: CustomRecipeCategory[] = [],
): CategoryDef | undefined {
  return listRecipeCategories(custom).find((c) => c.id === id)
}

export function categoryToneIndex(id: string): number {
  const s = id.trim().toLowerCase()
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 33 + s.charCodeAt(i)) >>> 0
  }
  return h % 8
}

export function categoryChipClass(
  id: RecipeCategory,
  active = false,
): string {
  if (isBuiltinCategory(id)) {
    return `chip-filter chip-cat-${id}${active ? ' active' : ''}`
  }
  return `chip-filter chip-cat-custom tone-${categoryToneIndex(id)}${
    active ? ' active' : ''
  }`
}

export function categoryTagClass(id: RecipeCategory): string {
  if (isBuiltinCategory(id)) return `tag tag-cat tag-cat-${id}`
  return `tag tag-cat tag-cat-custom tone-${categoryToneIndex(id)}`
}

export function kindFromCategory(category: RecipeCategory): Recipe['kind'] {
  if (category === 'base') return 'base'
  if (category === 'side') return 'side'
  return 'meal'
}

export function kindFromCategoryWithCustom(
  category: RecipeCategory,
  custom: CustomRecipeCategory[] = [],
): Recipe['kind'] {
  const def = findCategoryDef(category, custom)
  if (def) return def.kind
  return kindFromCategory(category)
}

export function categoryFromKind(kind: Recipe['kind']): RecipeCategory {
  if (kind === 'base') return 'base'
  if (kind === 'side') return 'side'
  return 'main'
}

export function slugifyCategoryLabel(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28)
  return base || 'kategorie'
}

export function makeCustomCategoryId(
  label: string,
  existing: CustomRecipeCategory[],
): string {
  const slug = slugifyCategoryLabel(label)
  let id = `c-${slug}`
  if (isBuiltinCategory(id) || existing.some((c) => c.id === id)) {
    id = `c-${slug}-${Math.random().toString(36).slice(2, 6)}`
  }
  while (isBuiltinCategory(id) || existing.some((c) => c.id === id)) {
    id = `c-${slug}-${Math.random().toString(36).slice(2, 6)}`
  }
  return id
}

/** Map free-text / Cookidoo labels to our categories. */
export function inferCategoryFromText(
  ...parts: (string | null | undefined)[]
): RecipeCategory | null {
  const blob = parts.filter(Boolean).join(' ').toLowerCase()
  if (!blob) return null

  const rules: { cat: BuiltinRecipeCategory; re: RegExp }[] = [
    {
      cat: 'dessert',
      re: /\b(dessert|nachtisch|nachspeise|kuchen|torte|kekse|cookie|eis|mousse|pudding|süßspeise|suessspeise|brownie|muffin|tiramisu|crumble|parfait|eiscreme|backen\s*[-–]?\s*süß|baking\s*[-–]?\s*sweet)\b/,
    },
    { cat: 'soup', re: /\b(suppe|eintopf|soup|stew|bouillon|brühe|bruehe)\b/ },
    { cat: 'salad', re: /\b(salat|salad|bowl)\b/ },
    {
      cat: 'breakfast',
      re: /\b(frühstück|fruehstueck|breakfast|müsli|muesli|porridge|smoothie\s*bowl)\b/,
    },
    {
      cat: 'drink',
      re: /\b(getränk|getraenk|drink|shake|smoothie|saft|cocktail|limonade)\b/,
    },
    {
      cat: 'snack',
      re: /\b(snack|fingerfood|vorspeise|starter|appetizer|häppchen|haeppchen)\b/,
    },
    {
      cat: 'side',
      re: /\b(beilage|side\s*dish|gemüsebeilage|gemuesebeilage)\b/,
    },
    {
      cat: 'base',
      re: /\b(basis|reis\b|nudeln|pasta\b|quinoa|couscous|kartoffelpüree|kartoffelpuree)\b/,
    },
    {
      cat: 'main',
      re: /\b(haupt(speise|gericht)|main\s*dish|abendessen|dinner)\b/,
    },
  ]

  for (const rule of rules) {
    if (rule.re.test(blob)) return rule.cat
  }
  return null
}

export function resolveRecipeCategory(recipe: {
  category?: RecipeCategory
  kind?: Recipe['kind']
  title?: string
  tags?: string[]
  notes?: string
}): RecipeCategory {
  if (recipe.category) return recipe.category
  const fromText = inferCategoryFromText(
    recipe.title,
    ...(recipe.tags || []),
    recipe.notes,
  )
  if (fromText) return fromText
  return categoryFromKind(recipe.kind ?? 'meal')
}

export function tagToneClass(label: string): string {
  const s = label.trim().toLowerCase()
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 33 + s.charCodeAt(i)) >>> 0
  }
  return `tag-tone-${h % 8}`
}

/** Season / holiday / internal Cookidoo noise — not useful for our planner. */
const TAG_NOISE = new Set(
  [
    'frühling',
    'fruehling',
    'sommer',
    'herbst',
    'winter',
    'spring',
    'summer',
    'autumn',
    'fall',
    'silvester',
    'weihnachten',
    'ostern',
    'advent',
    'halloween',
    'neujahr',
    'valentine',
    'valentinstag',
    'christmas',
    'easter',
    'new year',
    'newyear',
  ].map((s) => s.toLowerCase()),
)

const CATEGORY_TAG_ALIASES = new Set(
  [
    ...RECIPE_CATEGORIES.map((c) => c.id),
    ...RECIPE_CATEGORIES.map((c) => c.label),
    'hauptspeise',
    'hauptgericht',
    'abendessen',
    'dinner',
    'main dish',
    'main course',
    'side dish',
    'beilagen',
    'nachtisch',
    'nachspeise',
    'vorspeise',
    'getränk',
    'getraenk',
    'fruehstueck',
    'meal',
    'dish',
  ].map((s) => s.toLowerCase()),
)

function isJunkRecipeTag(raw: string): boolean {
  const t = raw.trim()
  if (!t || t.length > 36) return true
  const lower = t.toLowerCase()
  if (TAG_NOISE.has(lower)) return true
  if (CATEGORY_TAG_ALIASES.has(lower)) return true
  if (/marketing\s*tag|marketingtag|rdpf\d*/i.test(t)) return true
  if (/^\d+[-_]/.test(t)) return true
  if (/^[0-9a-f]{8,}(-[0-9a-f]{4,})+$/i.test(t)) return true
  if (/^r\d{3,}$/i.test(t)) return true
  if (/^\d+$/.test(t)) return true
  if (/^[a-z]{1,3}\d{2,}[-_]/i.test(t)) return true
  return false
}

/**
 * Keep only human-relevant tags; case-insensitive dedupe.
 * Drops Cookidoo marketing IDs, seasons, and category duplicates.
 */
export function sanitizeRecipeTags(
  tags: string[] | undefined,
  opts?: {
    category?: RecipeCategory
    categoryLabel?: string
    hasCookidoo?: boolean
    max?: number
  },
): string[] {
  const max = opts?.max ?? 8
  const out: string[] = []
  const seen = new Set<string>()
  const catLabel = (opts?.categoryLabel || '').toLowerCase()

  for (const raw of tags ?? []) {
    const t = raw.trim().replace(/\s+/g, ' ')
    if (!t || isJunkRecipeTag(t)) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    if (opts?.hasCookidoo && key === 'cookidoo') continue
    if (opts?.category) {
      const cat = opts.category
      if (key === cat.toLowerCase()) continue
      if (catLabel && key === catLabel) continue
      if (isBuiltinCategory(cat) && key === CATEGORY_LABEL[cat].toLowerCase()) {
        continue
      }
    }
    seen.add(key)
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

export function repairRecipeTags(recipes: Recipe[]): Recipe[] {
  return recipes.map((r) => {
    const category = resolveRecipeCategory(r)
    const tags = sanitizeRecipeTags(r.tags, {
      category,
      categoryLabel: isBuiltinCategory(category)
        ? CATEGORY_LABEL[category]
        : undefined,
      hasCookidoo: Boolean(r.cookidooUrl || r.cookidooId),
    })
    if (
      tags.length === r.tags.length &&
      tags.every((t, i) => t === r.tags[i])
    ) {
      return r
    }
    return { ...r, tags }
  })
}

export function repairRecipeCategories(recipes: Recipe[]): Recipe[] {
  return recipes.map((r) => {
    const category = resolveRecipeCategory(r)
    // Custom categories keep their kind from recipe if already set as meal/base/side
    const nextKind =
      !isBuiltinCategory(category) && r.kind
        ? r.kind
        : kindFromCategory(category)
    if (r.category === category && (r.kind ?? 'meal') === nextKind) return r
    return { ...r, category, kind: nextKind }
  })
}

export function normalizeCustomCategories(
  raw: unknown,
): CustomRecipeCategory[] {
  if (!Array.isArray(raw)) return []
  const out: CustomRecipeCategory[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Partial<CustomRecipeCategory>
    const label = typeof r.label === 'string' ? r.label.trim() : ''
    if (!label) continue
    let id =
      typeof r.id === 'string' && r.id.trim()
        ? r.id.trim()
        : makeCustomCategoryId(label, out)
    if (isBuiltinCategory(id) || seen.has(id)) {
      id = makeCustomCategoryId(label, out)
    }
    seen.add(id)
    const kind =
      r.kind === 'base' || r.kind === 'side' || r.kind === 'meal'
        ? r.kind
        : 'meal'
    out.push({
      id,
      label,
      hint: typeof r.hint === 'string' ? r.hint.trim() : undefined,
      kind,
    })
  }
  return out
}
