import { describe, expect, it } from "vitest";
import {
  normalizeOpenFoodFactsProduct,
  summarizeFoodLogs,
} from "./food";

describe("normalizeOpenFoodFactsProduct", () => {
  it("uses serving nutrition when Open Food Facts provides it", () => {
    const product = normalizeOpenFoodFactsProduct("737628064502", {
      product_name: "Thai peanut noodle kit",
      brands: "Thai Kitchen",
      image_front_url: "https://images.openfoodfacts.org/images/products/737/628/064/502/front_en.3.400.jpg",
      serving_size: "52 g",
      nutriments: {
        "energy-kcal_serving": 200,
        proteins_serving: 5,
        carbohydrates_serving: 37,
        fat_serving: 4,
      },
    });

    expect(product).toMatchObject({
      itemName: "Thai peanut noodle kit",
      brandName: "Thai Kitchen",
      barcode: "737628064502",
      imageUrl: "https://images.openfoodfacts.org/images/products/737/628/064/502/front_en.3.400.jpg",
      servingUnit: "52 g",
      calories: 200,
      protein: 5,
      carbs: 37,
      fat: 4,
      source: "barcode",
    });
  });

  it("falls back to 100 g nutrition when serving data is absent", () => {
    const product = normalizeOpenFoodFactsProduct("1234567890123", {
      product_name: "Greek yogurt",
      nutriments: {
        "energy-kcal_100g": 95,
        proteins_100g: 9.5,
        carbohydrates_100g: 3.8,
        fat_100g: 4,
      },
    });

    expect(product?.servingUnit).toBe("100 g");
    expect(product?.calories).toBe(95);
    expect(product?.assumptions[0]).toContain("100 g");
  });

  it("returns null when no usable name or calories exist", () => {
    expect(normalizeOpenFoodFactsProduct("123", { nutriments: {} })).toBeNull();
  });
});

describe("summarizeFoodLogs", () => {
  it("adds calories and macros across logs", () => {
    expect(
      summarizeFoodLogs([
        {
          loggedAt: new Date("2026-06-17T12:00:00Z"),
          calories: 210,
          protein: 12,
          carbs: 24,
          fat: 8,
        },
        {
          loggedAt: new Date("2026-06-17T15:00:00Z"),
          calories: 90,
          protein: 3,
          carbs: 16,
          fat: 2,
        },
      ]),
    ).toEqual({ calories: 300, protein: 15, carbs: 40, fat: 10 });
  });
});
