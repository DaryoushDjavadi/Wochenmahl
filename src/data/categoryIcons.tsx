import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  CakeSlice,
  Carrot,
  Coffee,
  Cookie,
  CupSoda,
  FolderKanban,
  LayoutGrid,
  MoreHorizontal,
  Salad,
  Soup,
  UtensilsCrossed,
  Wheat,
} from 'lucide-react'
import type { BuiltinRecipeCategory, RecipeCategory } from '../types'
import { isBuiltinCategory } from './categories'

export const CATEGORY_ICON: Record<BuiltinRecipeCategory, LucideIcon> = {
  main: UtensilsCrossed,
  soup: Soup,
  salad: Salad,
  side: Carrot,
  base: Wheat,
  breakfast: Coffee,
  dessert: CakeSlice,
  snack: Cookie,
  drink: CupSoda,
  other: MoreHorizontal,
}

export function CategoryIcon({
  category,
  size = 16,
  ...props
}: { category: RecipeCategory } & LucideProps) {
  const Icon = isBuiltinCategory(category)
    ? CATEGORY_ICON[category]
    : FolderKanban
  return <Icon size={size} aria-hidden {...props} />
}

export function AllCategoriesIcon({
  size = 16,
  ...props
}: LucideProps) {
  return <LayoutGrid size={size} aria-hidden {...props} />
}
