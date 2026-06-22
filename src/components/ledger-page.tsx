"use client";

import { CalendarDays, ChevronLeft, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthPanel, LoadingScreen } from "@/components/caltrack-app";
import { FoodAvatar } from "@/components/food-avatar";
import { authClient } from "@/lib/auth-client";
import { groupLogsByWeek, summarizeNutrition } from "@/lib/ledger";

type Source = "barcode" | "manual";

type FoodLog = {
  id: string;
  itemName: string;
  brandName?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  servingQuantity: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: Source;
  confidence?: number | null;
  assumptions?: string[];
  note?: string | null;
  loggedAt: string;
  createdAt: string;
  updatedAt: string;
};

type MotionStyle = React.CSSProperties & Record<"--i", number>;

function staggerStyle(index: number): MotionStyle {
  return { "--i": index };
}

function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(value);
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data as T;
}

export function LedgerPage() {
  const session = authClient.useSession();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!session.data?.user) return;
    setIsLoading(true);
    setError(null);
    try {
      const { logs: loadedLogs } = await apiJson<{ logs: FoodLog[] }>(
        "/api/food/logs",
      );
      setLogs(loadedLogs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load ledger.");
    } finally {
      setIsLoading(false);
    }
  }, [session.data?.user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLogs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  async function deleteLog(id: string) {
    await apiJson<{ deleted: boolean }>("/api/food/logs", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    setLogs((current) => current.filter((log) => log.id !== id));
  }

  const totals = useMemo(() => summarizeNutrition(logs), [logs]);
  const weeks = useMemo(() => groupLogsByWeek(logs), [logs]);

  if (session.isPending) {
    return <LoadingScreen />;
  }

  if (!session.data?.user) {
    return <AuthPanel />;
  }

  return (
    <main className="motion-app-bg min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="motion-shell mx-auto min-h-screen w-full max-w-7xl px-5 py-6 sm:px-8 lg:px-10">
        <header className="motion-stagger flex items-start justify-between gap-4" style={staggerStyle(0)}>
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">
              Signed in as {session.data.user.name}
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-none tracking-normal sm:text-5xl">
              Nutrition ledger
            </h1>
          </div>
          <Link
            href="/"
            className="pressable inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold"
          >
            <ChevronLeft className="h-4 w-4" />
            Today
          </Link>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <LedgerMetric label="Calories" value={formatNumber(totals.calories)} index={0} />
          <LedgerMetric label="Protein" value={`${formatNumber(totals.protein, 1)}g`} index={1} />
          <LedgerMetric label="Carbs" value={`${formatNumber(totals.carbs, 1)}g`} index={2} />
          <LedgerMetric label="Fat" value={`${formatNumber(totals.fat, 1)}g`} index={3} />
        </section>

        <section className="motion-stagger mt-8" style={staggerStyle(5)}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-normal">History</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {logs.length ? `${logs.length} logged items` : "No historical items yet"}
              </p>
            </div>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="motion-error rounded-[8px] border border-[oklch(70%_0.08_28)] bg-[oklch(96%_0.03_28)] p-4 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          {!weeks.length && !isLoading ? <LedgerEmptyState /> : null}

          <div className="space-y-5">
            {weeks.map((week, index) => (
              <section
                key={week.key}
                className="motion-stagger overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)]"
                style={staggerStyle(index)}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">{week.label}</h3>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {week.days.length} days logged
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold leading-none">
                      {formatNumber(week.total.calories)}
                    </div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                      Calories
                    </div>
                  </div>
                </div>
                <div>
                  {week.days.map((day) => (
                    <div key={day.key} className="border-b border-[var(--line)] last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-[oklch(96%_0.011_145)] px-4 py-3 text-sm">
                        <div className="font-semibold">{day.label}</div>
                        <div className="text-right text-[var(--muted)]">
                          {formatNumber(day.total.calories)} cal · P{" "}
                          {formatNumber(day.total.protein, 1)} · C{" "}
                          {formatNumber(day.total.carbs, 1)} · F{" "}
                          {formatNumber(day.total.fat, 1)}
                        </div>
                      </div>
                      <div className="hidden grid-cols-[48px_1fr_150px_110px_44px] items-center gap-4 border-b border-[var(--line)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)] last:border-b-0 md:grid">
                        <span />
                        <span>Item</span>
                        <span>Macros</span>
                        <span className="text-right">Calories</span>
                        <span />
                      </div>
                      {day.logs.map((log) => (
                        <LedgerRow key={log.id} log={log} onDelete={deleteLog} />
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function LedgerMetric({
  label,
  value,
  index,
}: {
  label: string;
  value: string;
  index: number;
}) {
  return (
    <div
      className="macro-tile motion-stagger rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_18px_48px_oklch(35%_0.02_120_/_0.08)]"
      style={staggerStyle(index)}
    >
      <div className="text-3xl font-semibold tracking-normal">{value}</div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </div>
    </div>
  );
}

function LedgerEmptyState() {
  return (
    <div className="motion-card rounded-[8px] border border-dashed border-[var(--line)] bg-[oklch(98%_0.012_86)] p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[8px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
        <CalendarDays className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">No history yet</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
        Scan an item from today to start building weekly nutrition history.
      </p>
    </div>
  );
}

function LedgerRow({
  log,
  onDelete,
}: {
  log: FoodLog;
  onDelete: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  return (
    <article
      className="timeline-row grid grid-cols-[48px_1fr_auto_40px] items-center gap-3 border-b border-[var(--line)] px-4 py-4 last:border-b-0 md:grid-cols-[48px_1fr_150px_110px_44px]"
      data-deleting={pending}
    >
      <FoodAvatar log={log} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{log.itemName}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
          <span>
            {new Date(log.loggedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <span>{log.source}</span>
          {log.brandName ? <span className="truncate">{log.brandName}</span> : null}
        </div>
        <div className="mt-2 text-xs text-[var(--muted)] md:hidden">
          P {formatNumber(log.protein, 1)} · C {formatNumber(log.carbs, 1)} · F{" "}
          {formatNumber(log.fat, 1)}
        </div>
      </div>
      <div className="hidden text-sm text-[var(--muted)] md:block">
        P {formatNumber(log.protein, 1)} · C {formatNumber(log.carbs, 1)} · F{" "}
        {formatNumber(log.fat, 1)}
      </div>
      <div className="text-right">
        <div className="text-lg font-semibold leading-none">{formatNumber(log.calories)}</div>
        <div className="mt-1 text-xs text-[var(--muted)] md:hidden">cal</div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await onDelete(log.id);
          } finally {
            setPending(false);
          }
        }}
        aria-label={`Delete ${log.itemName}`}
        className="icon-button col-start-4 row-start-1 grid h-9 w-9 place-items-center justify-self-end rounded-[8px] text-[var(--muted)] disabled:opacity-60 md:col-start-auto md:row-start-auto"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </article>
  );
}
