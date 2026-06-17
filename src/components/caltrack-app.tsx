"use client";

import {
  BarChart3,
  Check,
  ChevronLeft,
  Flame,
  Loader2,
  LogOut,
  ScanBarcode,
  Trash2,
  Utensils,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Source = "barcode";

type ReviewFood = {
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
};

type FoodLog = ReviewFood & {
  id: string;
  loggedAt: string;
  createdAt: string;
  updatedAt: string;
};

type View = "home" | "scan";
type MotionStyle = React.CSSProperties & Record<"--i", number>;
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfLocalDay(date = new Date()) {
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

function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(value);
}

function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function summarize(logs: Pick<FoodLog, "calories" | "protein" | "carbs" | "fat">[]) {
  return logs.reduce(
    (total, log) => ({
      calories: total.calories + log.calories,
      protein: total.protein + log.protein,
      carbs: total.carbs + log.carbs,
      fat: total.fat + log.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function staggerStyle(index: number): MotionStyle {
  return { "--i": index };
}

function blankScannedFood(barcode: string): ReviewFood {
  return {
    itemName: "",
    brandName: null,
    barcode,
    imageUrl: null,
    servingQuantity: 1,
    servingUnit: "serving",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    source: "barcode",
    confidence: null,
    assumptions: ["No product match was found for this barcode. Fill the nutrition details."],
    note: null,
  };
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

export function CaltrackApp() {
  const session = authClient.useSession();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [rangeLogs, setRangeLogs] = useState<FoodLog[]>([]);
  const [view, setView] = useState<View>("home");
  const [reviewFood, setReviewFood] = useState<ReviewFood | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!session.data?.user) return;
    setIsLoadingLogs(true);
    setError(null);
    try {
      const todayStart = startOfLocalDay();
      const todayEnd = endOfLocalDay();
      const rangeStart = startOfLocalDay(
        new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      );
      const [today, range] = await Promise.all([
        apiJson<{ logs: FoodLog[] }>(
          `/api/food/logs?start=${todayStart.toISOString()}&end=${todayEnd.toISOString()}`,
        ),
        apiJson<{ logs: FoodLog[] }>(
          `/api/food/logs?start=${rangeStart.toISOString()}&end=${todayEnd.toISOString()}`,
        ),
      ]);
      setLogs(today.logs);
      setRangeLogs(range.logs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load logs.");
    } finally {
      setIsLoadingLogs(false);
    }
  }, [session.data?.user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLogs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  async function saveFood(food: ReviewFood) {
    const payload = {
      ...food,
      loggedAt: new Date().toISOString(),
      assumptions: food.assumptions ?? [],
    };
    const { log } = await apiJson<{ log: FoodLog }>("/api/food/logs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setLogs((current) => [log, ...current]);
    setRangeLogs((current) => [log, ...current]);
    setReviewFood(null);
    setView("home");
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  }

  async function deleteLog(id: string) {
    await apiJson<{ deleted: boolean }>("/api/food/logs", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    setLogs((current) => current.filter((log) => log.id !== id));
    setRangeLogs((current) => current.filter((log) => log.id !== id));
  }

  if (session.isPending) {
    return <LoadingScreen />;
  }

  if (!session.data?.user) {
    return <AuthPanel />;
  }

  return (
    <main className="motion-app-bg min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="motion-shell relative mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 lg:grid-cols-[420px_1fr]">
        <section className="relative min-h-screen border-[var(--line)] bg-[var(--surface)] lg:border-r">
          <div className="absolute inset-x-0 top-0 h-56 bg-[linear-gradient(135deg,oklch(88%_0.06_145),oklch(93%_0.028_168)_58%,oklch(86%_0.045_36))]" />
          <div className="relative flex min-h-screen flex-col px-5 pb-24 pt-5 sm:px-8">
            <AppHeader
              userName={session.data.user.name}
              onSignOut={() => {
                void authClient.signOut().then(() => window.location.reload());
              }}
            />
            {view === "home" ? (
              <Dashboard
                logs={logs}
                rangeLogs={rangeLogs}
                isLoading={isLoadingLogs}
                error={error}
                onRefresh={loadLogs}
                onScan={() => setView("scan")}
                onDelete={deleteLog}
              />
            ) : null}
            {view === "scan" ? (
              <ScanView
                onBack={() => setView("home")}
                onReview={setReviewFood}
              />
            ) : null}
          </div>
        </section>
        <DesktopJournal logs={rangeLogs} todayLogs={logs} />
      </div>
      {view === "home" ? <ScanFab onClick={() => setView("scan")} /> : null}
      {savedNotice ? <SavedToast /> : null}
      {reviewFood ? (
        <ReviewSheet
          food={reviewFood}
          onClose={() => setReviewFood(null)}
          onSave={saveFood}
        />
      ) : null}
    </main>
  );
}

function SavedToast() {
  return (
    <div className="motion-toast fixed bottom-5 left-1/2 z-[60] flex h-12 -translate-x-1/2 items-center gap-3 overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--surface)] shadow-[0_18px_48px_oklch(20%_0.03_120_/_0.28)]">
      <Check className="h-4 w-4" />
      Saved to today
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)]">
      <div className="motion-pop flex items-center gap-3 text-sm font-medium text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Opening Caltrack
      </div>
    </main>
  );
}

function AuthPanel() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              name: name || email.split("@")[0],
              email,
              password,
            })
          : await authClient.signIn.email({ email, password });

      if (result.error) {
        throw new Error(result.error.message || "Authentication failed.");
      }

      if (mode === "signup") {
        setMode("signin");
      }
      window.location.reload();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="motion-app-bg min-h-screen bg-[var(--background)] px-5 py-6 text-[var(--foreground)]">
      <div className="motion-shell relative mx-auto grid min-h-[calc(100vh-48px)] max-w-6xl overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_30px_90px_oklch(35%_0.03_80_/_0.16)] md:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col justify-between bg-[linear-gradient(145deg,oklch(91%_0.062_145),oklch(94%_0.028_168)_55%,oklch(87%_0.05_36))] p-7 md:p-10">
          <div className="motion-stagger flex items-center gap-3" style={staggerStyle(0)}>
            <div className="grid h-10 w-10 place-items-center rounded-[8px] bg-[var(--foreground)] text-[var(--surface)]">
              <Utensils className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Caltrack</span>
          </div>
          <div className="motion-stagger max-w-xl py-16 md:py-24" style={staggerStyle(1)}>
            <h1 className="text-5xl font-semibold leading-[0.95] tracking-normal md:text-7xl">
              A food log that starts with the camera.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-[var(--ink-soft)]">
              Scan packaged food, confirm the label, and keep a clear running
              count of what you ate today.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {["Scan", "Review", "Timeline"].map((item, index) => (
              <div key={item} className="motion-stagger border-t border-[oklch(45%_0.035_145_/_0.35)] pt-3" style={staggerStyle(index + 2)}>
                {item}
              </div>
            ))}
          </div>
        </section>
        <section className="flex items-center justify-center p-5 md:p-10">
          <form
            onSubmit={submit}
            className="motion-panel w-full max-w-sm rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_20px_60px_oklch(25%_0.025_80_/_0.08)]"
          >
            <h2 className="text-2xl font-semibold tracking-normal">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Open signup is enabled for v1. Google sign-in can be added later
              without replacing auth.
            </p>
            <div className="mt-6 space-y-3">
              {mode === "signup" ? (
                <Field
                  label="Name"
                  value={name}
                  onChange={setName}
                  autoComplete="name"
                />
              ) : null}
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
              />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
            {error ? <p className="motion-error mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
            <button
              disabled={pending}
              className="pressable mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--surface)] disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="pressable mt-3 h-11 w-full rounded-[8px] border border-[var(--line)] text-sm font-medium text-[var(--ink-soft)]"
            >
              {mode === "signin" ? "Create an account" : "I already have an account"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </span>
      <input
        required
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-base outline-none transition-[border-color,box-shadow,transform] duration-200 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_oklch(45%_0.085_145_/_0.12)]"
      />
    </label>
  );
}

function AppHeader({
  userName,
  onSignOut,
}: {
  userName: string;
  onSignOut: () => void;
}) {
  return (
    <header className="motion-stagger mb-8 flex items-center justify-between" style={staggerStyle(0)}>
      <div>
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-[8px] bg-[var(--foreground)] text-[var(--surface)]">
            <Utensils className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Caltrack</span>
        </div>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">Signed in as {userName}</p>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        aria-label="Sign out"
        className="icon-button pressable grid h-10 w-10 place-items-center rounded-[8px] border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </header>
  );
}

function Dashboard({
  logs,
  rangeLogs,
  isLoading,
  error,
  onRefresh,
  onScan,
  onDelete,
}: {
  logs: FoodLog[];
  rangeLogs: FoodLog[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onScan: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const totals = useMemo(() => summarize(logs), [logs]);
  const [rangeAnchor] = useState(() => Date.now());
  const weekByDay = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = startOfLocalDay(new Date(rangeAnchor - (6 - index) * 86400000));
      return {
        key: localDayKey(date),
        total: 0,
      };
    });
    for (const log of rangeLogs) {
      const key = localDayKey(log.loggedAt);
      const day = days.find((entry) => entry.key === key);
      if (day) day.total += log.calories;
    }
    const max = Math.max(...days.map((day) => day.total), 1);
    return days.map((day) => ({ ...day, height: Math.max(10, (day.total / max) * 100) }));
  }, [rangeAnchor, rangeLogs]);

  return (
    <div className="motion-view flex flex-1 flex-col">
      <section className="motion-card success-pulse rounded-[8px] border border-[oklch(68%_0.035_82_/_0.35)] bg-[oklch(99%_0.008_85_/_0.82)] p-5 shadow-[0_20px_60px_oklch(33%_0.03_80_/_0.10)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--ink-soft)]">Today consumed</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-6xl font-semibold leading-none tracking-normal">
                {formatNumber(totals.calories)}
              </span>
              <span className="pb-2 text-sm font-semibold text-[var(--muted)]">cal</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="icon-button pressable grid h-10 w-10 place-items-center rounded-[8px] border border-[var(--line)] bg-[var(--surface)]"
            aria-label="Refresh logs"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-7 grid grid-cols-3 gap-2">
          <MacroTile label="Protein" value={totals.protein} tone="green" index={0} />
          <MacroTile label="Carbs" value={totals.carbs} tone="gold" index={1} />
          <MacroTile label="Fat" value={totals.fat} tone="ink" index={2} />
        </div>
      </section>

      <section className="motion-stagger mt-6" style={staggerStyle(3)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-normal">Last 7 days</h2>
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Calories
          </span>
        </div>
        <div className="grid h-28 grid-cols-7 items-end gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 pb-3 pt-4">
          {weekByDay.map((day, index) => (
            <div key={day.key} className="grid min-w-0 grid-rows-[64px_16px] gap-1">
              <div className="flex h-16 w-full items-end overflow-hidden">
                <div
                  className="chart-bar w-full rounded-[6px] bg-[var(--accent)]"
                  style={{ ...staggerStyle(index), height: `${day.height}%` }}
                  title={`${day.key}: ${formatNumber(day.total)} calories`}
                />
              </div>
              <span className="truncate text-center text-[10px] font-medium leading-4 text-[var(--muted)]">
                {day.key}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="motion-stagger mt-6 flex-1" style={staggerStyle(4)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-normal">Timeline</h2>
          <span className="text-sm text-[var(--muted)]">{logs.length} items</span>
        </div>
        {error ? (
          <div className="motion-error rounded-[8px] border border-[oklch(70%_0.08_28)] bg-[oklch(96%_0.03_28)] p-4 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}
        {logs.length === 0 && !isLoading ? <EmptyTimeline onScan={onScan} /> : null}
        <div className="space-y-2">
          {logs.map((log, index) => (
            <TimelineRow key={log.id} log={log} index={index} onDelete={onDelete} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ScanFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Scan barcode"
      className="scan-fab pressable fixed bottom-6 right-5 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-strong)] text-[var(--surface)] shadow-[0_18px_44px_oklch(22%_0.045_145_/_0.34)] sm:bottom-8 sm:right-8"
    >
      <ScanBarcode className="h-7 w-7" />
    </button>
  );
}

function MacroTile({
  label,
  value,
  tone,
  index,
}: {
  label: string;
  value: number;
  tone: "green" | "gold" | "ink";
  index: number;
}) {
  const colors = {
    green: "bg-[oklch(90%_0.055_145)] text-[oklch(32%_0.09_145)]",
    gold: "bg-[oklch(91%_0.06_82)] text-[oklch(36%_0.07_76)]",
    ink: "bg-[oklch(91%_0.014_250)] text-[oklch(30%_0.035_250)]",
  };
  return (
    <div className={`macro-tile motion-stagger rounded-[8px] p-3 ${colors[tone]}`} style={staggerStyle(index + 1)}>
      <div className="text-2xl font-semibold leading-none">{formatNumber(value, 1)}g</div>
      <div className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] opacity-75">
        {label}
      </div>
    </div>
  );
}

function EmptyTimeline({ onScan }: { onScan: () => void }) {
  return (
    <div className="motion-card rounded-[8px] border border-dashed border-[var(--line)] bg-[oklch(98%_0.012_86)] p-6 text-center">
      <div className="motion-pop mx-auto grid h-12 w-12 place-items-center rounded-[8px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
        <Flame className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">Nothing logged today</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[var(--muted)]">
        Scan a packaged item to start today&apos;s log.
      </p>
      <button
        type="button"
        onClick={onScan}
        className="pressable mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--surface)]"
      >
        <ScanBarcode className="h-4 w-4" />
        Start scanning
      </button>
    </div>
  );
}

function TimelineRow({
  log,
  index,
  onDelete,
}: {
  log: FoodLog;
  index: number;
  onDelete: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <article className="timeline-row flex items-center gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3" data-deleting={pending} style={staggerStyle(index)}>
      <FoodAvatar log={log} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{log.itemName}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
          <span>{new Date(log.loggedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          <span>{formatNumber(log.protein, 1)}g protein</span>
          {log.brandName ? <span className="truncate">{log.brandName}</span> : null}
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-semibold leading-none">{formatNumber(log.calories)}</div>
        <div className="mt-1 text-xs text-[var(--muted)]">cal</div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await onDelete(log.id);
        }}
        aria-label={`Delete ${log.itemName}`}
        className="icon-button grid h-9 w-9 place-items-center rounded-[8px] text-[var(--muted)]"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </article>
  );
}

function FoodAvatar({
  log,
}: {
  log: Pick<FoodLog, "imageUrl" | "itemName" | "source">;
}) {
  const [failed, setFailed] = useState(false);
  const imageUrl = failed ? null : log.imageUrl;

  return (
    <div className="food-thumb grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-[var(--surface-strong)]">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          width={48}
          height={48}
          unoptimized
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-0.5"
        />
      ) : (
        <ScanBarcode className="h-5 w-5" />
      )}
    </div>
  );
}

function ScanView({
  onBack,
  onReview,
}: {
  onBack: () => void;
  onReview: (food: ReviewFood) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const foundRef = useRef(false);
  const [status, setStatus] = useState("Hold the barcode flat inside the frame.");
  const [pending, setPending] = useState(false);

  const lookupBarcode = useCallback(
    async (barcode: string) => {
      if (foundRef.current) return;
      foundRef.current = true;
      setPending(true);
      setStatus(`Found ${barcode}. Looking up nutrition.`);
      controlsRef.current?.stop();
      try {
        const { product } = await apiJson<{ product: ReviewFood | null }>(
          "/api/food/lookup",
          {
            method: "POST",
            body: JSON.stringify({ barcode }),
          },
        );
        if (!product) {
          setStatus("No product match found. Fill in the label details.");
          onReview(blankScannedFood(barcode));
          return;
        }
        onReview(product);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Lookup failed. Fill in the details.");
        onReview(blankScannedFood(barcode));
      } finally {
        setPending(false);
      }
    },
    [onReview],
  );

  useEffect(() => {
    let stopped = false;
    let nativeTimer: number | undefined;

    function startNativeDetector() {
      const NativeBarcodeDetector = window.BarcodeDetector;
      const video = videoRef.current;
      if (!NativeBarcodeDetector || !video) return;

      const detector = new NativeBarcodeDetector({
        formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128", "code_39"],
      });

      nativeTimer = window.setInterval(() => {
        if (stopped || foundRef.current || video.readyState < 2) return;
        void detector
          .detect(video)
          .then((codes) => {
            const rawValue = codes.find((code) => code.rawValue)?.rawValue;
            if (rawValue) void lookupBarcode(rawValue);
          })
          .catch(() => {
            window.clearInterval(nativeTimer);
          });
      }, 260);
    }

    async function start() {
      if (!videoRef.current) return;
      try {
        const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] =
          await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        if (stopped || !videoRef.current) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
        ]);
        const reader = new BrowserMultiFormatOneDReader(hints, {
          delayBetweenScanAttempts: 180,
        });
        startNativeDetector();
        controlsRef.current = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          },
          videoRef.current,
          (result) => {
            if (result?.getText()) {
              void lookupBarcode(result.getText());
            }
          },
        );
      } catch {
        setStatus("Camera access failed. Reload and allow camera access to scan.");
      }
    }
    void start();
    return () => {
      stopped = true;
      window.clearInterval(nativeTimer);
      controlsRef.current?.stop();
    };
  }, [lookupBarcode]);

  return (
    <div className="motion-view flex flex-1 flex-col">
      <BackButton onClick={onBack} label="Scanner" />
      <div className="motion-card relative mt-4 aspect-[3/4] overflow-hidden rounded-[8px] bg-[var(--foreground)]">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="scanner-frame absolute inset-x-6 top-1/2 h-36 -translate-y-1/2 rounded-[8px] border-2 border-[oklch(96%_0.02_90)]" />
        <div className="scanner-status absolute bottom-4 left-4 right-4 rounded-[8px] bg-[oklch(98%_0.01_86_/_0.94)] p-4">
          <p className="text-sm font-semibold">{status}</p>
          {pending ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking Open Food Facts
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable motion-stagger inline-flex h-11 w-fit items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold"
      style={staggerStyle(0)}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

function ReviewSheet({
  food,
  onClose,
  onSave,
}: {
  food: ReviewFood;
  onClose: () => void;
  onSave: (food: ReviewFood) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ReviewFood>(food);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof ReviewFood>(key: K, value: ReviewFood[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="motion-sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-[oklch(18%_0.02_80_/_0.42)] p-3 sm:items-center">
      <div className="motion-sheet w-full max-w-lg rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_28px_80px_oklch(20%_0.02_80_/_0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              Review before logging
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal">
              {draft.itemName || "Fill product details"}
            </h2>
            {draft.barcode ? (
              <p className="mt-1 text-sm text-[var(--muted)]">Barcode {draft.barcode}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-button pressable grid h-9 w-9 place-items-center rounded-[8px] border border-[var(--line)]"
          >
            <ChevronLeft className="h-4 w-4 rotate-[-90deg]" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <TextInput
            label="Item"
            value={draft.itemName}
            onChange={(value) => update("itemName", value)}
            autoFocus={!draft.itemName}
          />
          <TextInput
            label="Brand"
            value={draft.brandName ?? ""}
            onChange={(value) => update("brandName", value || null)}
          />
        </div>
        <div className="mt-3 grid grid-cols-[1fr_1.4fr] gap-3">
          <NumberField
            label="Serving"
            value={draft.servingQuantity}
            onChange={(value) => update("servingQuantity", value)}
          />
          <TextInput
            label="Unit"
            value={draft.servingUnit}
            onChange={(value) => update("servingUnit", value)}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="Calories" value={draft.calories} onChange={(value) => update("calories", value)} />
          <NumberField label="Protein g" value={draft.protein} onChange={(value) => update("protein", value)} />
          <NumberField label="Carbs g" value={draft.carbs} onChange={(value) => update("carbs", value)} />
          <NumberField label="Fat g" value={draft.fat} onChange={(value) => update("fat", value)} />
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Note
          </span>
          <textarea
            value={draft.note ?? ""}
            onChange={(event) => update("note", event.target.value)}
            className="mt-2 min-h-20 w-full resize-none rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        {draft.assumptions?.length ? (
          <div className="motion-pop mt-3 rounded-[8px] bg-[oklch(96%_0.018_86)] p-3 text-xs leading-5 text-[var(--muted)]">
            {draft.confidence !== null && draft.confidence !== undefined ? (
              <div className="mb-1 font-semibold text-[var(--foreground)]">
                Confidence {Math.round(draft.confidence * 100)}%
              </div>
            ) : null}
            {draft.assumptions.join(" ")}
          </div>
        ) : null}

        {error ? <p className="motion-error mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              if (!draft.itemName.trim()) {
                throw new Error("Item name is required.");
              }
              await onSave(draft);
            } catch (saveError) {
              setError(saveError instanceof Error ? saveError.message : "Could not save.");
            } finally {
              setPending(false);
            }
          }}
          className="pressable mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent-strong)] text-sm font-semibold text-[var(--surface)] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save to today
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </span>
      <input
        type="number"
        min="0"
        step="0.1"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm outline-none transition-[border-color,box-shadow,transform] duration-200 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_oklch(45%_0.085_145_/_0.12)]"
      />
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </span>
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm outline-none transition-[border-color,box-shadow,transform] duration-200 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_oklch(45%_0.085_145_/_0.12)]"
      />
    </label>
  );
}

function DesktopJournal({
  logs,
  todayLogs,
}: {
  logs: FoodLog[];
  todayLogs: FoodLog[];
}) {
  const totals = summarize(todayLogs);
  const recent = logs.slice(0, 8);
  return (
    <aside className="desktop-panel hidden min-h-screen bg-[oklch(91.5%_0.018_150)] p-10 lg:block">
      <div className="sticky top-10">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-3xl font-semibold tracking-normal">Nutrition ledger</h2>
          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold">
            Today
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <DesktopMetric label="Calories" value={formatNumber(totals.calories)} index={0} />
          <DesktopMetric label="Protein" value={`${formatNumber(totals.protein, 1)}g`} index={1} />
          <DesktopMetric label="Carbs" value={`${formatNumber(totals.carbs, 1)}g`} index={2} />
          <DesktopMetric label="Fat" value={`${formatNumber(totals.fat, 1)}g`} index={3} />
        </div>
        <div className="mt-8 rounded-[8px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="grid grid-cols-[1fr_110px_110px] border-b border-[var(--line)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            <span>Item</span>
            <span>Macros</span>
            <span className="text-right">Calories</span>
          </div>
          {recent.length ? (
            recent.map((log, index) => (
              <div
                key={log.id}
                className="motion-stagger grid grid-cols-[1fr_110px_110px] items-center border-b border-[var(--line)] px-4 py-4 last:border-b-0"
                style={staggerStyle(index)}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{log.itemName}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {localDayKey(log.loggedAt)} · {log.source}
                  </div>
                </div>
                <div className="text-xs leading-5 text-[var(--muted)]">
                  P {formatNumber(log.protein, 1)} · C {formatNumber(log.carbs, 1)} · F{" "}
                  {formatNumber(log.fat, 1)}
                </div>
                <div className="text-right text-lg font-semibold">{formatNumber(log.calories)}</div>
              </div>
            ))
          ) : (
            <div className="p-8 text-sm text-[var(--muted)]">
              The desktop view fills in as food gets logged from the mobile scanner.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function DesktopMetric({
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
      className="motion-stagger rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4"
      style={staggerStyle(index)}
    >
      <div className="text-2xl font-semibold tracking-normal">{value}</div>
      <div className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </div>
    </div>
  );
}
