
export enum AppScreen {
  LANDING = 'LANDING',
  RESULT = 'RESULT',
  SHOPPING = 'SHOPPING',
  COOKING = 'COOKING',
  COOKBOOK = 'COOKBOOK',
  RECIPE_DETAIL = 'RECIPE_DETAIL',
  SUCCESS = 'SUCCESS'
}

export interface SubstitutionHack {
  missing_item: string;
  suggested_hack: string;
  suggested_quantity: string;
  effectiveness_score: number;
  safety_risk: 'None' | 'Low' | 'High';
  reason: string;
}

export interface Ingredient {
  name: string;
  quantity: string;
}

export interface SafetyFactor {
  name: string;
  score: number;
  icon: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  ingredients: Ingredient[];
  already_have: Ingredient[];
  need_to_buy: Ingredient[];
  estimated_shopping_cost: number;
  steps: string[];
  hacks: SubstitutionHack[];
  prepTime: string;
  totalTime: string;
  servings: number;
  difficulty: 'Easy' | 'Medium' | 'Chef';
  isHackRecommended: boolean;
  safety_score: number;
  safety_factors: SafetyFactor[];
  tips: string[];
  savings_dh: number;
  co2_saved_kg: number;
  waste_avoided_g: number;
  imageUrl?: string;
  type?: 'HACK_IT' | 'SHOP_IT';
  savedDate?: string;
}

export interface StoreLocation {
  name: string;
  address: string;
  rating?: number;
  open_now?: boolean;
  uri?: string;
}

export interface AppState {
  screen: AppScreen;
  city: string;
  currentRecipe: Recipe | null;
  selectedCookbookRecipe: Recipe | null;
  scannedIngredients: string[];
  wasteSaved: number;
  cookbook: Recipe[];
  selectedMode: 'HACK' | 'SHOP' | null;
}
