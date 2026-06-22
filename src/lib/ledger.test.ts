import { describe, expect, it } from "vitest";
import {
  groupLogsByWeek,
  localDateKey,
  startOfLocalWeek,
  summarizeNutrition,
} from "./ledger";

const log = (
  id: string,
  loggedAt: Date,
  calories: number,
  protein = 0,
  carbs = 0,
  fat = 0,
) => ({
  id,
  loggedAt,
  calories,
  protein,
  carbs,
  fat,
});

describe("startOfLocalWeek", () => {
  it("uses Monday as the start of the week", () => {
    expect(localDateKey(startOfLocalWeek(new Date(2026, 5, 22)))).toBe(
      "2026-06-22",
    );
    expect(localDateKey(startOfLocalWeek(new Date(2026, 5, 28)))).toBe(
      "2026-06-22",
    );
    expect(localDateKey(startOfLocalWeek(new Date(2026, 5, 21)))).toBe(
      "2026-06-15",
    );
  });
});

describe("summarizeNutrition", () => {
  it("adds calories and macros", () => {
    expect(
      summarizeNutrition([
        { calories: 160, protein: 30, carbs: 2, fat: 3 },
        { calories: 210, protein: 8, carbs: 28, fat: 7 },
      ]),
    ).toEqual({ calories: 370, protein: 38, carbs: 30, fat: 10 });
  });
});

describe("groupLogsByWeek", () => {
  it("groups entries by newest Monday-Sunday week and day", () => {
    const groups = groupLogsByWeek([
      log("old", new Date(2026, 5, 17, 12), 3, 0, 0.3, 0),
      log("new", new Date(2026, 5, 22, 9), 160, 30, 2, 3),
      log("same-day", new Date(2026, 5, 22, 18), 210, 8, 28, 7),
      log("sunday", new Date(2026, 5, 21, 10), 90, 3, 16, 2),
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      "2026-06-22",
      "2026-06-15",
    ]);
    expect(groups[0].days).toHaveLength(1);
    expect(groups[0].days[0].logs.map((entry) => entry.id)).toEqual([
      "same-day",
      "new",
    ]);
    expect(groups[0].total).toEqual({
      calories: 370,
      protein: 38,
      carbs: 30,
      fat: 10,
    });
    expect(groups[1].days.map((day) => day.key)).toEqual([
      "2026-06-21",
      "2026-06-17",
    ]);
  });
});
