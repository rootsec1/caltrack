export type NutritionField = "calories" | "protein" | "carbs" | "fat";

export type NutritionValues = Record<NutritionField, number>;

export function roundNutritionValue(field: NutritionField, value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const factor = field === "calories" ? 1 : 10;
  return Math.round(safeValue * factor) / factor;
}

function servingMultiplier(servingQuantity: number) {
  if (!Number.isFinite(servingQuantity)) return 0;
  return Math.max(servingQuantity, 0);
}

function servingDivisor(servingQuantity: number) {
  return servingQuantity > 0 && Number.isFinite(servingQuantity)
    ? servingQuantity
    : 1;
}

export function nutritionPerServing(
  nutrition: NutritionValues,
  servingQuantity: number,
): NutritionValues {
  const divisor = servingDivisor(servingQuantity);
  return {
    calories: roundNutritionValue("calories", nutrition.calories / divisor),
    protein: roundNutritionValue("protein", nutrition.protein / divisor),
    carbs: roundNutritionValue("carbs", nutrition.carbs / divisor),
    fat: roundNutritionValue("fat", nutrition.fat / divisor),
  };
}

export function scaleNutrition(
  perServing: NutritionValues,
  servingQuantity: number,
): NutritionValues {
  const multiplier = servingMultiplier(servingQuantity);
  return {
    calories: roundNutritionValue("calories", perServing.calories * multiplier),
    protein: roundNutritionValue("protein", perServing.protein * multiplier),
    carbs: roundNutritionValue("carbs", perServing.carbs * multiplier),
    fat: roundNutritionValue("fat", perServing.fat * multiplier),
  };
}
