import { z } from "zod";

export const foodSourceSchema = z.enum(["barcode"]);

export const normalizedFoodSchema = z.object({
  itemName: z.string().min(1),
  brandName: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  imageUrl: z.url().nullable().optional(),
  servingQuantity: z.number().positive().default(1),
  servingUnit: z.string().min(1).default("serving"),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative().default(0),
  carbs: z.number().nonnegative().default(0),
  fat: z.number().nonnegative().default(0),
  source: foodSourceSchema,
  confidence: z.number().min(0).max(1).nullable().optional(),
  assumptions: z.array(z.string()).default([]),
  note: z.string().nullable().optional(),
});

export const foodLogInputSchema = normalizedFoodSchema.extend({
  loggedAt: z.coerce.date().optional(),
});

export type NormalizedFood = z.infer<typeof normalizedFoodSchema>;
export type FoodLogInput = z.infer<typeof foodLogInputSchema>;

type OpenFoodFactsProduct = {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  image_url?: string;
  image_front_url?: string;
  serving_size?: string;
  nutriments?: Record<string, unknown>;
};

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberFrom(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstUrl(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const parsed = z.url().safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return null;
}

function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeOpenFoodFactsProduct(
  barcode: string,
  product: OpenFoodFactsProduct,
): NormalizedFood | null {
  const nutriments = product.nutriments ?? {};
  const protein =
    firstNumber(nutriments.proteins_serving, nutriments.proteins_100g) ?? 0;
  const carbs =
    firstNumber(
      nutriments.carbohydrates_serving,
      nutriments.carbohydrates_100g,
    ) ?? 0;
  const fat = firstNumber(nutriments.fat_serving, nutriments.fat_100g) ?? 0;
  const calories =
    firstNumber(
      nutriments["energy-kcal_serving"],
      nutriments["energy-kcal"],
      nutriments["energy-kcal_100g"],
    ) ?? protein * 4 + carbs * 4 + fat * 9;

  const itemName =
    product.product_name || product.product_name_en || product.generic_name;
  if (!itemName || calories <= 0) return null;

  const hasServingData =
    numberFrom(nutriments["energy-kcal_serving"]) !== null ||
    numberFrom(nutriments.proteins_serving) !== null ||
    numberFrom(nutriments.carbohydrates_serving) !== null ||
    numberFrom(nutriments.fat_serving) !== null;

  return {
    itemName,
    brandName: product.brands || null,
    barcode,
    imageUrl: firstUrl(product.image_front_url, product.image_url),
    servingQuantity: 1,
    servingUnit: hasServingData ? product.serving_size || "serving" : "100 g",
    calories: round(calories, 0),
    protein: round(protein),
    carbs: round(carbs),
    fat: round(fat),
    source: "barcode",
    confidence: 0.92,
    assumptions: hasServingData
      ? ["Nutrition values came from the product serving data."]
      : ["No serving nutrition was available, so values are based on 100 g."],
  };
}

export type FoodLogRow = {
  loggedAt: Date;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function summarizeFoodLogs(logs: FoodLogRow[]) {
  return logs.reduce(
    (summary, log) => ({
      calories: summary.calories + log.calories,
      protein: summary.protein + log.protein,
      carbs: summary.carbs + log.carbs,
      fat: summary.fat + log.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function serializeAssumptions(assumptions?: string[] | null) {
  return JSON.stringify(assumptions ?? []);
}

export function parseAssumptions(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return z.array(z.string()).catch([]).parse(parsed);
  } catch {
    return [];
  }
}
