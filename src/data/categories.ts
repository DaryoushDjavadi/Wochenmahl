import type { Recipe, RecipeCategory } from '../types'

export const RECIPE_CATEGORIES: {
  id: RecipeCategory
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

export const CATEGORY_LABEL: Record<RecipeCategory, string> =
  Object.fromEntries(
    RECIPE_CATEGORIES.map((c) => [c.id, c.label]),
  ) as Record<RecipeCategory, string>

export function kindFromCategory(
  category: RecipeCategory,
): Recipe['kind'] {
  if (category === 'base') return 'base'
  if (category === 'side') return 'side'
  return 'meal'
}

export function categoryFromKind(kind: Recipe['kind']): RecipeCategory {
  if (kind === 'base') return 'base'
  if (kind === 'side') return 'side'
  return 'main'
}

/** Map free-text / Cookidoo labels to our categories. */
export function inferCategoryFromText(
  ...parts: (string | null | undefined)[]
): RecipeCategory | null {
  const blob = parts.filter(Boolean).join(' ').toLowerCase()
  if (!blob) return null

  const rules: { cat: RecipeCategory; re: RegExp }[] = [
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

export function repairRecipeCategories(recipes: Recipe[]): Recipe[] {
  return recipes.map((r) => {
    const category = resolveRecipeCategory(r)
    const kind = kindFromCategory(category)
    if (r.category === category && (r.kind ?? 'meal') === kind) return r
    return { ...r, category, kind }
  })
}
