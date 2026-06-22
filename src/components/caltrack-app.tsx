"use client";

import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  Flame,
  ImagePlus,
  Loader2,
  LogOut,
  ScanBarcode,
  Sparkles,
  Trash2,
  X,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FoodAvatar } from "@/components/food-avatar";
import { LogoMark } from "@/components/logo-mark";
import { authClient } from "@/lib/auth-client";
import {
  endOfLocalDay,
  groupLogsByWeek,
  localDayKey,
  startOfLocalDay,
  summarizeNutrition,
} from "@/lib/ledger";
import {
  nutritionPerServing,
  roundNutritionValue,
  scaleNutrition,
  type NutritionField,
  type NutritionValues,
} from "@/lib/nutrition";

type Source = "barcode" | "manual";

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
const estimateFallbackPrompt =
  "Tell Gemini what you are eating, then review the filled nutrition details.";

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

function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(value);
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

function blankManualFood(): ReviewFood {
  return {
    itemName: "",
    brandName: null,
    barcode: null,
    imageUrl: null,
    servingQuantity: 1,
    servingUnit: "serving",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    source: "manual",
    confidence: null,
    assumptions: ["No barcode was available. Fill the nutrition details manually."],
    note: null,
  };
}

function nutritionValuesFromFood(food: ReviewFood): NutritionValues {
  return {
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
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
  const [scanStartsWithEstimate, setScanStartsWithEstimate] = useState(false);
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

  useEffect(() => {
    if (reviewFood) {
      document.body.dataset.caltrackModalOpen = "true";
      return () => {
        delete document.body.dataset.caltrackModalOpen;
      };
    }

    delete document.body.dataset.caltrackModalOpen;
    return undefined;
  }, [reviewFood]);

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
    setScanStartsWithEstimate(false);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  }

  function openScan(startWithEstimate = false) {
    setScanStartsWithEstimate(startWithEstimate);
    setView("scan");
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
        <section className="relative mx-auto min-h-screen w-full max-w-[460px] min-w-0 overflow-hidden border-[var(--line)] bg-[var(--surface)] lg:mx-0 lg:max-w-none lg:border-r">
          <div className="absolute inset-x-0 top-0 h-56 bg-[linear-gradient(135deg,oklch(88%_0.06_145),oklch(93%_0.028_168)_58%,oklch(86%_0.045_36))]" />
          <div className="relative flex min-h-screen flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-7 lg:px-8">
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
                onScan={() => openScan(false)}
                onEstimate={() => openScan(true)}
                onDelete={deleteLog}
              />
            ) : null}
            {view === "scan" ? (
              <ScanView
                initialEstimateOpen={scanStartsWithEstimate}
                onBack={() => {
                  setView("home");
                  setScanStartsWithEstimate(false);
                }}
                onReview={setReviewFood}
              />
            ) : null}
          </div>
        </section>
        <DesktopJournal logs={rangeLogs} todayLogs={logs} />
      </div>
      {view === "home" && logs.length > 0 ? (
        <ScanFab onClick={() => openScan(false)} />
      ) : null}
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

export function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)]">
      <div className="motion-pop flex items-center gap-3 text-sm font-medium text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Opening Caltrack
      </div>
    </main>
  );
}

export function AuthPanel() {
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
            <LogoMark className="h-10 w-10 text-[var(--foreground)]" />
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
          <LogoMark className="h-9 w-9 text-[var(--foreground)]" />
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
  onEstimate,
  onDelete,
}: {
  logs: FoodLog[];
  rangeLogs: FoodLog[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onScan: () => void;
  onEstimate: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const totals = useMemo(() => summarizeNutrition(logs), [logs]);
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
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:inline">
              Calories
            </span>
            <Link
              href="/ledger"
              className="pressable inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)]"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Ledger
            </Link>
          </div>
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
        {logs.length === 0 && !isLoading ? (
          <EmptyTimeline onScan={onScan} onEstimate={onEstimate} />
        ) : null}
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
      className="scan-fab pressable fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-strong)] text-[var(--surface)] shadow-[0_18px_44px_oklch(22%_0.045_145_/_0.34)] sm:bottom-8 sm:right-8"
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

function EmptyTimeline({
  onScan,
  onEstimate,
}: {
  onScan: () => void;
  onEstimate: () => void;
}) {
  return (
    <div className="motion-card rounded-[8px] border border-dashed border-[var(--line)] bg-[oklch(98%_0.012_86)] p-4 text-center">
      <div className="motion-pop mx-auto grid h-12 w-12 place-items-center rounded-[8px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
        <Flame className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">Nothing logged today</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[var(--muted)]">
        Scan a package, or use an estimate when there is no barcode.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onScan}
          className="pressable flex h-12 items-center justify-center gap-2 rounded-[8px] bg-[var(--foreground)] px-3 text-sm font-semibold text-[var(--surface)]"
        >
          <ScanBarcode className="h-4 w-4" />
          Scan
        </button>
        <button
          type="button"
          onClick={onEstimate}
          className="pressable flex h-12 items-center justify-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)]"
        >
          <Sparkles className="h-4 w-4" />
          No barcode
        </button>
      </div>
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

function ScanView({
  initialEstimateOpen,
  onBack,
  onReview,
}: {
  initialEstimateOpen: boolean;
  onBack: () => void;
  onReview: (food: ReviewFood) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lookupTimeoutRef = useRef<number | undefined>(undefined);
  const foundRef = useRef(false);
  const estimatePanelRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("Hold the barcode flat inside the frame.");
  const [pending, setPending] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(initialEstimateOpen);
  const [fallbackReason, setFallbackReason] = useState<string | null>(
    initialEstimateOpen ? estimateFallbackPrompt : null,
  );
  const [unmatchedBarcode, setUnmatchedBarcode] = useState<string | null>(null);
  const [estimatePrompt, setEstimatePrompt] = useState("");
  const [estimateImage, setEstimateImage] = useState<File | null>(null);
  const [estimatePreview, setEstimatePreview] = useState<string | null>(null);
  const [estimatePending, setEstimatePending] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const openEstimatePanel = useCallback(
    (reason?: string, barcode?: string) => {
      controlsRef.current?.stop();
      if (lookupTimeoutRef.current) {
        window.clearTimeout(lookupTimeoutRef.current);
        lookupTimeoutRef.current = undefined;
      }
      foundRef.current = true;
      setPending(false);
      setEstimateOpen(true);
      setFallbackReason(reason ?? estimateFallbackPrompt);
      setUnmatchedBarcode(barcode ?? null);
      if (reason) setStatus(reason);
      window.requestAnimationFrame(() => {
        estimatePanelRef.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      });
    },
    [],
  );

  const resetToScanner = useCallback(() => {
    setEstimateOpen(false);
    setFallbackReason(null);
    setUnmatchedBarcode(null);
    setEstimateError(null);
    setPending(false);
    foundRef.current = false;
    setStatus("Hold the barcode flat inside the frame.");
  }, []);

  const lookupBarcode = useCallback(
    async (barcode: string) => {
      if (foundRef.current) return;
      foundRef.current = true;
      const controller = new AbortController();
      let finished = false;
      const finishLookup = (food: ReviewFood, message?: string) => {
        if (finished) return;
        finished = true;
        if (lookupTimeoutRef.current) {
          window.clearTimeout(lookupTimeoutRef.current);
          lookupTimeoutRef.current = undefined;
        }
        if (message) setStatus(message);
        setPending(false);
        onReview(food);
      };
      const finishWithEstimateFallback = (message: string) => {
        if (finished) return;
        finished = true;
        openEstimatePanel(message, barcode);
      };

      setPending(true);
      setStatus(`Found ${barcode}. Looking up nutrition.`);
      controlsRef.current?.stop();
      lookupTimeoutRef.current = window.setTimeout(() => {
        controller.abort();
        finishWithEstimateFallback("Lookup timed out. Use an estimate or type the label manually.");
      }, 10000);

      try {
        const { product } = await apiJson<{ product: ReviewFood | null }>("/api/food/lookup", {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({ barcode }),
        });
        if (!product) {
          finishWithEstimateFallback("No product match found. Use an estimate or type the label manually.");
          return;
        }
        finishLookup(product);
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === "AbortError"
            ? "Lookup timed out. Fill in the label details."
            : error instanceof Error
              ? error.message
              : "Lookup failed. Fill in the details.";
        finishWithEstimateFallback(message);
      }
    },
    [onReview, openEstimatePanel],
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
      if (estimateOpen) return;
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
      if (lookupTimeoutRef.current) window.clearTimeout(lookupTimeoutRef.current);
      controlsRef.current?.stop();
    };
  }, [lookupBarcode, estimateOpen]);

  useEffect(() => {
    return () => {
      if (estimatePreview) URL.revokeObjectURL(estimatePreview);
    };
  }, [estimatePreview]);

  function updateEstimateImage(file: File | null) {
    setEstimateError(null);
    setEstimateImage(file);
    setEstimatePreview(file ? URL.createObjectURL(file) : null);
  }

  async function estimateFood() {
    if (pending) return;

    if (!estimatePrompt.trim() && !estimateImage) {
      setEstimateError("Add a short note or attach a food photo.");
      return;
    }

    setEstimatePending(true);
    setEstimateError(null);
    controlsRef.current?.stop();
    foundRef.current = true;

    try {
      const formData = new FormData();
      formData.append("prompt", estimatePrompt.trim());
      if (estimateImage) formData.append("image", estimateImage);
      const { product } = await apiJson<{ product: ReviewFood }>(
        "/api/food/estimate",
        {
          method: "POST",
          body: formData,
        },
      );
      onReview(product);
    } catch (error) {
      setEstimateError(
        error instanceof Error ? error.message : "Could not estimate this food.",
      );
    } finally {
      setEstimatePending(false);
    }
  }

  return (
    <div className="motion-view flex flex-1 flex-col">
      <BackButton onClick={onBack} label="Add food" />

      {estimateOpen ? (
        <div
          ref={estimatePanelRef}
          className="estimate-panel motion-card mt-4 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_18px_48px_oklch(28%_0.03_120_/_0.10)]"
        >
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              {estimatePending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-normal">
                Estimate from note or photo
              </h2>
              <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
                {fallbackReason}
              </p>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              What are you eating?
            </span>
            <textarea
              value={estimatePrompt}
              onChange={(event) => setEstimatePrompt(event.target.value)}
              placeholder="Example: paneer wrap with chutney, one serving"
              className="mt-2 min-h-28 w-full resize-none rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-base leading-6 outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[oklch(58%_0.018_126)] focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_oklch(45%_0.085_145_/_0.12)]"
            />
          </label>

          <div className="mt-3 grid gap-3">
            <label className="pressable flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-dashed border-[var(--line)] bg-[oklch(97%_0.012_145)] px-3 text-sm font-semibold text-[var(--foreground)]">
              <ImagePlus className="h-4 w-4" />
              {estimateImage ? "Change photo" : "Add optional photo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  updateEstimateImage(event.target.files?.[0] ?? null);
                }}
              />
            </label>
            {estimatePreview ? (
              <div className="relative h-28 overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-strong)]">
                <div
                  aria-label="Selected food photo preview"
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${estimatePreview})` }}
                />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => updateEstimateImage(null)}
                  className="icon-button absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-[8px] bg-[oklch(98%_0.01_86_/_0.92)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>

          {estimatePending ? (
            <div className="motion-pop mt-3 rounded-[8px] bg-[oklch(96%_0.018_86)] p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Loader2 className="h-4 w-4 animate-spin" />
                Filling the review sheet
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                <span className="estimate-step">Reading note</span>
                <span className="estimate-step">Checking image</span>
                <span className="estimate-step">Balancing macros</span>
              </div>
            </div>
          ) : null}

          {estimateError ? (
            <p className="motion-error mt-3 text-sm text-[var(--danger)]">
              {estimateError}
            </p>
          ) : null}

          <button
            type="button"
            disabled={estimatePending}
            onClick={() => void estimateFood()}
            className="pressable mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--surface)] disabled:opacity-60"
          >
            {estimatePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Estimate nutrition
          </button>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={estimatePending}
              onClick={() => {
                foundRef.current = true;
                onReview(
                  unmatchedBarcode
                    ? blankScannedFood(unmatchedBarcode)
                    : blankManualFood(),
                );
              }}
              className="pressable flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[var(--line)] px-4 text-sm font-semibold text-[var(--foreground)] disabled:opacity-60"
            >
              <Utensils className="h-4 w-4" />
              Type manually
            </button>
            <button
              type="button"
              disabled={estimatePending}
              onClick={resetToScanner}
              className="pressable flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted)] disabled:opacity-60"
            >
              <ScanBarcode className="h-4 w-4" />
              Scan instead
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => openEstimatePanel()}
            className="scan-choice motion-stagger mt-4 flex w-full items-center gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-3 text-left shadow-[0_12px_34px_oklch(28%_0.03_120_/_0.08)]"
            style={staggerStyle(1)}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">No barcode? Use AI estimate</span>
              <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">
                Add a note or photo, then review nutrition before saving.
              </span>
            </span>
          </button>

          <div className="motion-card relative mt-4 h-[min(52svh,520px)] min-h-[330px] overflow-hidden rounded-[8px] bg-[var(--foreground)]">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="scanner-frame absolute inset-x-5 top-1/2 h-32 -translate-y-1/2 rounded-[8px] border-2 border-[oklch(96%_0.02_90)] sm:inset-x-6 sm:h-36" />
            <div className="scanner-status absolute bottom-4 left-4 right-4 rounded-[8px] bg-[oklch(98%_0.01_86_/_0.94)] p-4">
              <p className="text-sm font-semibold">{status}</p>
              {pending ? (
                <div className="mt-3">
                  <div className="mb-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Checking Open Food Facts
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[oklch(88%_0.02_126)]">
                    <div className="scanner-line h-full w-1/2 rounded-full bg-[var(--accent)]" />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
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
  const [perServingNutrition, setPerServingNutrition] = useState<NutritionValues>(() =>
    nutritionPerServing(nutritionValuesFromFood(food), food.servingQuantity),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof ReviewFood>(key: K, value: ReviewFood[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateServingQuantity(value: number) {
    const scaledNutrition = scaleNutrition(perServingNutrition, value);
    setDraft((current) => ({
      ...current,
      servingQuantity: value,
      ...scaledNutrition,
    }));
  }

  function updateNutrition(field: NutritionField, value: number) {
    const divisor =
      draft.servingQuantity > 0 && Number.isFinite(draft.servingQuantity)
        ? draft.servingQuantity
        : 1;

    setPerServingNutrition((current) => ({
      ...current,
      [field]: roundNutritionValue(field, value / divisor),
    }));
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="motion-sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-[oklch(18%_0.02_80_/_0.42)] p-3 sm:items-center">
      <div className="motion-sheet max-h-[calc(100svh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_28px_80px_oklch(20%_0.02_80_/_0.28)] sm:pb-4">
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
            onChange={updateServingQuantity}
          />
          <TextInput
            label="Unit"
            value={draft.servingUnit}
            onChange={(value) => update("servingUnit", value)}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField
            label="Calories"
            value={draft.calories}
            onChange={(value) => updateNutrition("calories", value)}
          />
          <NumberField
            label="Protein g"
            value={draft.protein}
            onChange={(value) => updateNutrition("protein", value)}
          />
          <NumberField
            label="Carbs g"
            value={draft.carbs}
            onChange={(value) => updateNutrition("carbs", value)}
          />
          <NumberField
            label="Fat g"
            value={draft.fat}
            onChange={(value) => updateNutrition("fat", value)}
          />
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
  const totals = summarizeNutrition(todayLogs);
  const weeks = useMemo(() => groupLogsByWeek(logs).slice(0, 3), [logs]);
  return (
    <aside className="desktop-panel hidden min-h-screen bg-[oklch(91.5%_0.018_150)] p-10 lg:block">
      <div className="sticky top-10">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-3xl font-semibold tracking-normal">Nutrition ledger</h2>
          <Link
            href="/ledger"
            className="pressable inline-flex h-10 items-center gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold"
          >
            <BookOpen className="h-4 w-4" />
            Full ledger
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <DesktopMetric label="Calories" value={formatNumber(totals.calories)} index={0} />
          <DesktopMetric label="Protein" value={`${formatNumber(totals.protein, 1)}g`} index={1} />
          <DesktopMetric label="Carbs" value={`${formatNumber(totals.carbs, 1)}g`} index={2} />
          <DesktopMetric label="Fat" value={`${formatNumber(totals.fat, 1)}g`} index={3} />
        </div>
        <div className="mt-8 rounded-[8px] border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            <span>Recent weeks</span>
            <span>Calories</span>
          </div>
          {weeks.length ? (
            weeks.map((week, weekIndex) => (
              <div
                key={week.key}
                className="motion-stagger border-b border-[var(--line)] px-4 py-4 last:border-b-0"
                style={staggerStyle(weekIndex)}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-[var(--muted)]" />
                    <span className="text-sm font-semibold">{week.label}</span>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatNumber(week.total.calories)}
                  </span>
                </div>
                <div className="space-y-3">
                  {week.days.slice(0, 4).map((day) => (
                    <div key={day.key}>
                      <div className="mb-2 flex items-center justify-between text-xs text-[var(--muted)]">
                        <span>{day.label}</span>
                        <span>{formatNumber(day.total.calories)} cal</span>
                      </div>
                      <div className="space-y-2">
                        {day.logs.slice(0, 2).map((log) => (
                          <div key={log.id} className="grid grid-cols-[48px_1fr_auto] items-center gap-3">
                            <FoodAvatar log={log} />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{log.itemName}</div>
                              <div className="text-xs text-[var(--muted)]">
                                P {formatNumber(log.protein, 1)} · C{" "}
                                {formatNumber(log.carbs, 1)} · F {formatNumber(log.fat, 1)}
                              </div>
                            </div>
                            <div className="text-sm font-semibold">{formatNumber(log.calories)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-sm text-[var(--muted)]">
              Weekly history fills in as food gets logged from the scanner.
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
