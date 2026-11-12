import clsx from "clsx";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Users, UtensilsCrossed } from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster } from "./components/Toaster";
import { Button } from "./components/ui";
import { addDays, formatWeekRange, toISO, weekNumber, weekStart as getWeekStart } from "./lib/dates";
import { MealsView } from "./views/MealsView";
import { PeopleView } from "./views/PeopleView";
import { PlanView } from "./views/PlanView";

type Tab = "plan" | "meals" | "people";
const TABS: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: "plan", label: "Plan", icon: CalendarDays },
  { id: "meals", label: "Meals", icon: BookOpen },
  { id: "people", label: "People", icon: Users },
];

const tabFromHash = (): Tab => {
  const h = window.location.hash.replace(/^#\/?/, "");
  return TABS.some((t) => t.id === h) ? (h as Tab) : "plan";
};

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [week, setWeek] = useState(() => getWeekStart(new Date()));
  const isCurrentWeek = toISO(week) === toISO(getWeekStart(new Date()));

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Arrow keys switch weeks on the plan, unless the user is typing or a dialog is open.
  useEffect(() => {
    if (tab !== "plan") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, dialog") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") setWeek((w) => addDays(w, -7));
      if (e.key === "ArrowRight") setWeek((w) => addDays(w, 7));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-stone-50/85 pt-[env(safe-area-inset-top)] backdrop-blur-lg dark:border-stone-800/70 dark:bg-stone-950/85">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <a href="#/plan" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
              <UtensilsCrossed className="size-4" />
            </span>
            <span className="hidden sm:inline">Meal Planner</span>
          </a>
          <nav className="ml-auto flex rounded-xl bg-stone-200/60 p-1 dark:bg-stone-800/60">
            {TABS.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#/${id}`}
                aria-current={tab === id ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  tab === id
                    ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white"
                    : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200",
                )}
              >
                <Icon className="size-4" />
                {label}
              </a>
            ))}
          </nav>
        </div>

        {tab === "plan" && (
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 pb-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium uppercase tracking-wider text-stone-500">Week {weekNumber(week)}</div>
              <div className="truncate text-lg font-semibold tracking-tight sm:text-xl">{formatWeekRange(week)}</div>
            </div>
            {!isCurrentWeek && (
              <Button size="sm" onClick={() => setWeek(getWeekStart(new Date()))}>
                Today
              </Button>
            )}
            <Button size="icon" onClick={() => setWeek((w) => addDays(w, -7))} aria-label="Previous week" title="Previous week (←)">
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon" onClick={() => setWeek((w) => addDays(w, 7))} aria-label="Next week" title="Next week (→)">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {tab === "plan" && <PlanView weekStart={week} />}
        {tab === "meals" && <MealsView />}
        {tab === "people" && <PeopleView />}
      </main>

      <Toaster />
    </div>
  );
}
