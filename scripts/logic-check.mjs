/**
 * Pure logic checks for Wochenkochen (no browser).
 * Run: node scripts/logic-check.mjs
 */
import assert from 'node:assert/strict'

function mealLabel(main, side) {
  const a = (main || '').trim()
  const b = (side || '').trim()
  if (a && b) {
    if (a === b || a.endsWith(` + ${b}`) || a.includes(` + ${b}`)) return a
    return `${a} + ${b}`
  }
  return a || b || 'Gericht'
}

function slotMealLabel(slot, recipes) {
  const recipe = recipes.find((r) => r.id === slot.recipeId)
  const sideRecipe = recipes.find((r) => r.id === slot.sideRecipeId)
  const side = (slot.sideTitle || sideRecipe?.title || '').trim()
  let main = (recipe?.title || slot.title || '').trim()
  if (side && main.endsWith(` + ${side}`)) {
    main = main.slice(0, -(side.length + 3)).trim()
  }
  return mealLabel(main || recipe?.title, side)
}

function mergeIngredients(items) {
  const map = new Map()
  for (const item of items) {
    const key = item.name.trim().toLowerCase()
    if (!key) continue
    const existing = map.get(key)
    if (!existing) map.set(key, { ...item, name: item.name.trim() })
    else if (item.amount && existing.amount && item.amount !== existing.amount) {
      existing.amount = `${existing.amount} + ${item.amount}`
    } else if (item.amount && !existing.amount) existing.amount = item.amount
  }
  return [...map.values()]
}

// --- mealLabel ---
assert.equal(mealLabel('Reis', 'Salat'), 'Reis + Salat')
assert.equal(mealLabel('Reis + Salat', 'Salat'), 'Reis + Salat')
assert.equal(mealLabel('Pasta', null), 'Pasta')

// --- slot display no double side ---
const recipes = [
  { id: 'rice', title: 'Reis', ingredients: [{ name: 'Reis', amount: '300g' }] },
  {
    id: 'salad',
    title: 'Salat',
    ingredients: [
      { name: 'Gurke', amount: '1' },
      { name: 'Tomaten', amount: '2' },
    ],
  },
]
assert.equal(
  slotMealLabel(
    { recipeId: 'rice', title: 'Reis', sideRecipeId: 'salad', sideTitle: 'Salat' },
    recipes,
  ),
  'Reis + Salat',
)
assert.equal(
  slotMealLabel(
    {
      recipeId: 'rice',
      title: 'Reis + Salat',
      sideRecipeId: 'salad',
      sideTitle: 'Salat',
    },
    recipes,
  ),
  'Reis + Salat',
)

// --- shopping merge from base+side ---
const slots = [
  { recipeId: 'rice', sideRecipeId: 'salad' },
  { recipeId: 'rice', sideRecipeId: 'salad' },
]
const items = []
for (const slot of slots) {
  items.push(...recipes.find((r) => r.id === slot.recipeId).ingredients)
  items.push(...recipes.find((r) => r.id === slot.sideRecipeId).ingredients)
}
const merged = mergeIngredients(items)
assert.equal(merged.find((i) => i.name === 'Reis').amount, '300g')
assert.ok(merged.find((i) => i.name === 'Gurke'))

// --- lock gate ---
function canShop(status) {
  return status === 'locked'
}
assert.equal(canShop('pitching'), false)
assert.equal(canShop('locked'), true)

// --- cookidoo flow gates ---
function canAccountImport(settings) {
  return Boolean(settings.enabled && settings.linked && settings.accessToken)
}
function canManualImport(settings) {
  return Boolean(settings.enabled)
}
assert.equal(canAccountImport({ enabled: true, linked: false, accessToken: '' }), false)
assert.equal(canManualImport({ enabled: true }), true)
assert.equal(
  canAccountImport({ enabled: true, linked: true, accessToken: 'tok' }),
  true,
)

console.log('logic-check PASS')
