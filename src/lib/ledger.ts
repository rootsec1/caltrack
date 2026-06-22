export type NutritionSummary = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type LedgerLogBase = NutritionSummary & {
  id: string;
  loggedAt: string | Date;
};

export type LedgerDayGroup<TLog extends LedgerLogBase> = {
  key: string;
  date: Date;
  label: string;
  total: NutritionSummary;
  logs: TLog[];
};

export type LedgerWeekGroup<TLog extends LedgerLogBase> = {
  key: string;
  start: Date;
  end: Date;
  label: string;
  total: NutritionSummary;
  days: LedgerDayGroup<TLog>[];
};

const dayMs = 24 * 60 * 60 * 1000;

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfLocalDay(date = new Date()) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

export function startOfLocalWeek(value: string | Date) {
  const date = startOfLocalDay(toDate(value));
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

export function endOfLocalWeek(value: string | Date) {
  return new Date(startOfLocalWeek(value).getTime() + 6 * dayMs);
}

export function localDateKey(value: string | Date) {
  const date = toDate(value);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function localDayKey(value: string | Date) {
  return toDate(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function localDayHeading(value: string | Date) {
  return toDate(value).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function localWeekLabel(start: string | Date, end: string | Date) {
  const startDate = toDate(start);
  const endDate = toDate(end);
  const sameMonth = startDate.getMonth() === endDate.getMonth();
  const startLabel = startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endLabel = endDate.toLocaleDateString("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
  });
  return `${startLabel} - ${endLabel}`;
}

export function summarizeNutrition(logs: NutritionSummary[]) {
  return logs.reduce<NutritionSummary>(
    (summary, log) => ({
      calories: summary.calories + log.calories,
      protein: summary.protein + log.protein,
      carbs: summary.carbs + log.carbs,
      fat: summary.fat + log.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function groupLogsByWeek<TLog extends LedgerLogBase>(
  logs: TLog[],
): LedgerWeekGroup<TLog>[] {
  const sorted = [...logs].sort(
    (left, right) =>
      toDate(right.loggedAt).getTime() - toDate(left.loggedAt).getTime(),
  );
  const weeks = new Map<string, LedgerWeekGroup<TLog>>();

  for (const log of sorted) {
    const weekStart = startOfLocalWeek(log.loggedAt);
    const weekEnd = endOfLocalWeek(log.loggedAt);
    const weekKey = localDateKey(weekStart);
    let week = weeks.get(weekKey);
    if (!week) {
      week = {
        key: weekKey,
        start: weekStart,
        end: weekEnd,
        label: localWeekLabel(weekStart, weekEnd),
        total: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        days: [],
      };
      weeks.set(weekKey, week);
    }

    const dayKey = localDateKey(log.loggedAt);
    let day = week.days.find((entry) => entry.key === dayKey);
    if (!day) {
      const date = startOfLocalDay(toDate(log.loggedAt));
      day = {
        key: dayKey,
        date,
        label: localDayHeading(date),
        total: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        logs: [],
      };
      week.days.push(day);
    }

    day.logs.push(log);
  }

  return [...weeks.values()].map((week) => ({
    ...week,
    total: summarizeNutrition(week.days.flatMap((day) => day.logs)),
    days: week.days.map((day) => ({
      ...day,
      total: summarizeNutrition(day.logs),
    })),
  }));
}
