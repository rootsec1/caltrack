import { describe, expect, it } from "vitest";
import { nutritionPerServing, scaleNutrition } from "./nutrition";

describe("nutrition serving math", () => {
  it("multiplies calories and macros by serving quantity", () => {
    expect(
      scaleNutrition(
        {
          calories: 120,
          protein: 8,
          carbs: 15,
          fat: 3.5,
        },
        4,
      ),
    ).toEqual({
      calories: 480,
      protein: 32,
      carbs: 60,
      fat: 14,
    });
  });

  it("derives per-serving values from existing totals without compounding", () => {
    const perServing = nutritionPerServing(
      {
        calories: 480,
        protein: 32,
        carbs: 60,
        fat: 14,
      },
      4,
    );

    expect(scaleNutrition(perServing, 2)).toEqual({
      calories: 240,
      protein: 16,
      carbs: 30,
      fat: 7,
    });
  });
});
