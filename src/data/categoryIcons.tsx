import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  CakeSlice,
  Carrot,
  Coffee,
  Cookie,
  CupSoda,
  LayoutGrid,
  MoreHorizontal,
  Salad,
  Soup,
  UtensilsCrossed,
  Wheat,
} from 'lucide-react'
import type { RecipeCategory } from '../types'

export const CATEGORY_ICON: Record<RecipeCategory, LucideIcon> = {
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
  const Icon = CATEGORY_ICON[category]
  return <Icon size={size} aria-hidden {...props} />
}

export function AllCategoriesIcon({
  size = 16,
  ...props
}: LucideProps) {
  return <LayoutGrid size={size} aria-hidden {...props} />
}
