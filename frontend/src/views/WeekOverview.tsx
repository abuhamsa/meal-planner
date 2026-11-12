import clsx from "clsx";
import { ChevronLeft, ChevronRight, Moon, Pencil, Soup, Store, Sun } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Spinner } from "../components/ui";
import type { Person, PlanEntry, Slot } from "../lib/api";
import { SLOTS } from "../lib/api";
import {
  addDays,
  formatDayMonth,
  formatWeekRange,
  formatWeekday,
  fromISO,
  isToday,
  toISO,
  weekDays,
  weekNumber,
  weekStart as getWeekStart,
} from "../lib/dates";
import { entryGroupKey, seatsFor, type Seat } from "../lib/plan";
import { usePeople, usePlan } from "../lib/queries";

const SLOT_META: Record<Slot, { label: string; icon: typeof Sun }> = {
  lunch: { label: "Lunch", icon: Sun },
  dinner: { label: "Dinner", icon: Moon },
};

function weekFromUrl() {
  const start = new URLSearchParams(window.location.search).get("start");
  const parsed = start ? fromISO(start) : null;
  return getWeekStart(parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date());
}

/**
 * Read-only overview of one week that fits on a single screen: days as rows in portrait,
 * as columns in landscape. Lives at /week (optionally /week?start=YYYY-MM-DD).
 */
export function WeekOverview() {
  const [week, setWeek] = useState(weekFromUrl);
  const start = toISO(week);
  const isCurrentWeek = start === toISO(getWeekStart(new Date()));
  const { data: people = [], isLoading: loadingPeople } = usePeople();
  // Refresh regularly so the page can stay open on a tablet or the fridge.
  const { data: entries = [], isLoading: loadingPlan, isPlaceholderData } = usePlan(start, { refetchInterval: 60_000 });

  useEffect(() => {
    const url = isCurrentWeek ? "/week" : `/week?start=${start}`;
    window.history.replaceState(null, "", url);
    document.title = `Week ${weekNumber(week)} · Meal Planner`;
  }, [start, isCurrentWeek, week]);

  // Re-render after midnight so "today" moves along.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const go = (weeks: number) => setWeek((w) => addDays(w, weeks * 7));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Swipe left/right to change the week.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  const byCell = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const e of entries) map.set(`${e.date}|${e.slot}`, [...(map.get(`${e.date}|${e.slot}`) ?? []), e]);
    return map;
  }, [entries]);

  const shortName = useMemo(() => shortNames(people), [people]);
  const days = weekDays(week);
  const today = toISO(new Date());
  const cell = (day: Date, slot: Slot, layout: Layout) => (
    <Cell
      people={people}
      short={shortName}
      layout={layout}
      seats={seatsFor(people, byCell.get(`${toISO(day)}|${slot}`) ?? [])}
    />
  );

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] md:px-6"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <header className="flex shrink-0 items-center gap-2 py-2 short:py-1">
        <div className="min-w-0 flex-1">
          <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-stone-500 short:hidden">Week {weekNumber(week)}</div>
          <h1 className="truncate text-base font-semibold tracking-tight md:text-xl short:md:text-base">
            <span className="hidden text-stone-500 short:inline">W{weekNumber(week)} · </span>
            {formatWeekRange(week)}
          </h1>
        </div>
        {!isCurrentWeek && (
          <NavButton onClick={() => setWeek(getWeekStart(new Date()))} label="This week">
            <span className="px-1.5 text-xs font-medium">Today</span>
          </NavButton>
        )}
        <NavButton onClick={() => go(-1)} label="Previous week">
          <ChevronLeft className="size-4" />
        </NavButton>
        <NavButton onClick={() => go(1)} label="Next week">
          <ChevronRight className="size-4" />
        </NavButton>
        <a
          href={isCurrentWeek ? "/#/plan" : `/?week=${start}#/plan`}
          className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-200/60 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          title="Open the planner to edit"
          aria-label="Open the planner to edit"
        >
          <Pencil className="size-4" />
        </a>
      </header>

      {people.length > 1 && (
        <div className="-mt-1 hidden shrink-0 flex-wrap gap-x-3 gap-y-0.5 pb-1.5 text-xs text-stone-500 portrait:max-sm:flex short:flex short:landscape:-mt-0.5">
          {people.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1">
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-bold leading-none text-white"
                style={{ backgroundColor: p.color }}
              >
                {shortName.get(p.id)}
              </span>
              {p.name}
            </span>
          ))}
        </div>
      )}

      {loadingPeople || loadingPlan ? (
        <div className="flex flex-1 items-center justify-center text-stone-400">
          <Spinner />
        </div>
      ) : (
        <main className={clsx("min-h-0 flex-1 transition-opacity", isPlaceholderData && "opacity-50")}>
          {/* Portrait: a row per day, lunch and dinner side by side. */}
          <div className="grid h-full grid-cols-[2.75rem_minmax(0,1fr)_minmax(0,1fr)] grid-rows-[auto_repeat(7,minmax(0,1fr))] gap-x-1.5 gap-y-1 landscape:hidden sm:gap-x-2 sm:gap-y-1.5">
            <span />
            {SLOTS.map((slot) => (
              <SlotLabel key={slot} slot={slot} />
            ))}
            {days.map((day) => {
              const iso = toISO(day);
              return (
                <div key={iso} className="contents">
                  <DayLabel day={day} past={iso < today} />
                  {SLOTS.map((slot) => (
                    <CellBox key={slot} today={isToday(day)} past={iso < today} layout="rows" content={entries}>
                      {cell(day, slot, "rows")}
                    </CellBox>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Landscape: a column per day. */}
          <div className="hidden h-full grid-cols-[auto_repeat(7,minmax(0,1fr))] grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-2 landscape:grid short:gap-1.5">
            <span />
            {days.map((day) => (
              <DayLabel key={toISO(day)} day={day} past={toISO(day) < today} wide />
            ))}
            {SLOTS.map((slot) => (
              <div key={slot} className="contents">
                <SlotLabel slot={slot} vertical />
                {days.map((day) => (
                  <CellBox key={toISO(day)} today={isToday(day)} past={toISO(day) < today} layout="columns" content={entries}>
                    {cell(day, slot, "columns")}
                  </CellBox>
                ))}
              </div>
            ))}
          </div>
        </main>
      )}
    </div>
  );
}

function NavButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg bg-white text-stone-700 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-700 dark:hover:bg-stone-800"
    >
      {children}
    </button>
  );
}

function SlotLabel({ slot, vertical }: { slot: Slot; vertical?: boolean }) {
  const { label, icon: Icon } = SLOT_META[slot];
  return (
    <div
      className={clsx(
        "flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-stone-400",
        vertical ? "flex-col justify-center [writing-mode:vertical-rl] rotate-180" : "px-1 pb-0.5",
      )}
    >
      <Icon className={clsx("size-3", vertical && "rotate-90")} /> {label}
    </div>
  );
}

function DayLabel({ day, past, wide }: { day: Date; past: boolean; wide?: boolean }) {
  const today = isToday(day);
  return (
    <div
      className={clsx(
        "flex min-h-0 flex-col justify-center leading-tight",
        wide ? "px-1 pb-1 short:flex-row short:items-baseline short:gap-1 short:pb-0" : "items-start",
        past && !today && "opacity-50",
      )}
    >
      <span className={clsx("text-[0.6875rem] font-semibold uppercase", today ? "text-brand-600 dark:text-brand-400" : "text-stone-500")}>
        <span className={clsx(wide && "short:hidden")}>{formatWeekday(day, wide)}</span>
        {wide && <span className="hidden short:inline">{formatWeekday(day)}</span>}
      </span>
      <span className={clsx("whitespace-nowrap font-semibold tabular-nums", wide ? "text-lg short:text-sm" : "text-sm", today && "text-brand-700 dark:text-brand-300")}>
        {wide ? formatDayMonth(day) : day.getDate()}
      </span>
    </div>
  );
}

type Layout = "rows" | "columns";

const MIN_TEXT_SIZE = 10;
// Big cells (tablets in portrait) get bigger text.
const maxTextSize = (layout: Layout, width: number) => Math.min(layout === "rows" && width > 240 ? 18 : 16, width / 7);

/**
 * Picks the largest text size (in 0.5px steps) at which the cell's content fits, so meal
 * names are never cut off. A single long word may not shrink the text below 80%: from there
 * on it gets broken instead (with a hyphen where the browser knows how).
 */
function useFitText(layout: Layout, content: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const overflows = () => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    const fit = () => {
      if (!el.offsetParent) return; // the layout for the other orientation is hidden
      const max = Math.max(MIN_TEXT_SIZE, Math.floor(maxTextSize(layout, el.clientWidth) * 2) / 2);
      for (let size = max; size >= MIN_TEXT_SIZE; size -= 0.5) {
        el.style.fontSize = `${size}px`;
        if (size < max * 0.8) el.dataset.squeezed = "";
        else delete el.dataset.squeezed;
        if (!overflows()) break;
      }
      if (overflows()) el.dataset.squeezed = "";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [layout, content]);
  return ref;
}

function CellBox({
  today,
  past,
  layout,
  content,
  children,
}: {
  today: boolean;
  past: boolean;
  layout: Layout;
  content: unknown;
  children: ReactNode;
}) {
  const ref = useFitText(layout, content);
  return (
    <div
      ref={ref}
      className={clsx(
        "@container flex min-h-0 min-w-0 flex-col overflow-hidden ring-1 data-squeezed:[overflow-wrap:anywhere]",
        layout === "rows"
          ? "justify-center rounded-lg px-2 py-1 sm:rounded-xl sm:px-3"
          : "justify-start rounded-xl p-3 short:rounded-lg short:px-2 short:py-1.5",
        today
          ? "bg-brand-50 ring-2 ring-brand-400 dark:bg-brand-900/25 dark:ring-brand-600"
          : "bg-white ring-stone-200/80 dark:bg-stone-900 dark:ring-stone-800",
        past && !today && "opacity-55",
      )}
    >
      {children}
    </div>
  );
}

// Name chips: initials where cells are narrow (with a legend at the top), full names where there's room.
const shortCls: Record<Layout, string> = { rows: "@[13rem]:hidden", columns: "hidden short:inline" };
const nameCls: Record<Layout, string> = { rows: "hidden @[13rem]:inline", columns: "short:hidden" };
const full: Record<Layout, string> = {
  rows: "@[13rem]:rounded-md @[13rem]:px-[0.45em] @[13rem]:font-semibold",
  columns: "rounded-md px-[0.45em] font-semibold short:rounded-full short:px-[0.35em] short:font-bold",
};

/** Shortest name prefix (1-3 letters) that tells people apart, for the badges on phones. */
function shortNames(people: Person[]) {
  const names = people.map((p) => p.name.trim());
  return new Map(
    people.map((p, i) => {
      let n = 1;
      while (n < 3 && names.some((o, j) => j !== i && o.slice(0, n).toLowerCase() === names[i].slice(0, n).toLowerCase())) n++;
      return [p.id, names[i].slice(0, n) || "?"];
    }),
  );
}

function Cell({
  people,
  short,
  layout,
  seats,
}: {
  people: Person[];
  short: Map<number, string>;
  layout: Layout;
  seats: Seat[];
}) {
  const groups = new Map<string, { entry: PlanEntry; people: Person[] }>();
  for (const seat of seats) {
    if (!seat.entry) continue;
    const key = entryGroupKey(seat.entry);
    const g = groups.get(key) ?? { entry: seat.entry, people: [] };
    g.people.push(seat.person);
    groups.set(key, g);
  }
  if (!groups.size) return <span className="text-stone-300 dark:text-stone-700">–</span>;

  // Name who eats what, but only when people eat different things.
  const showWho = people.length > 1 && (groups.size > 1 || [...groups.values()][0].people.length < people.length);
  return (
    <ul className={clsx("flex flex-col", showWho ? "gap-[0.35em]" : "gap-[0.2em]", showWho && layout === "columns" && "gap-[0.5em] short:gap-[0.35em]")}>
      {[...groups.values()].map(({ entry, people: eaters }) => (
        <li
          key={entryGroupKey(entry)}
          className="min-w-0"
        >
          {showWho && (
            <span
              className={clsx(
                "mr-[0.3em] inline-flex flex-wrap gap-[0.15em] align-[0.05em]",
                layout === "columns" && "mb-[0.15em] flex w-fit short:mb-0 short:inline-flex",
              )}
            >
              {eaters.map((p) => (
                <span
                  key={p.id}
                  title={p.name}
                  className={clsx(
                    "inline-flex h-[1.4em] min-w-[1.4em] items-center justify-center rounded-full px-[0.35em] text-[0.75em] font-bold leading-none text-white",
                    full[layout],
                  )}
                  style={{ backgroundColor: p.color }}
                >
                  <span className={shortCls[layout]}>{short.get(p.id)}</span>
                  <span className={nameCls[layout]}>{p.name}</span>
                </span>
              ))}
            </span>
          )}
          <span lang="de" className="font-medium leading-snug hyphens-auto">
            {entry.eating_out || !entry.meal ? (
              <span className="text-sky-700 dark:text-sky-300">
                <Store className="mr-[0.2em] inline size-[0.85em] -translate-y-px" />
                {entry.note || "Eating out"}
              </span>
            ) : (
              <>
                {entry.leftovers && (
                  <Soup aria-label="Leftovers" className="mr-[0.25em] inline size-[1em] -translate-y-px text-amber-600 dark:text-amber-400">
                    <title>Leftovers</title>
                  </Soup>
                )}
                {entry.meal.name}
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
