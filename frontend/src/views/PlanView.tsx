import clsx from "clsx";
import { CopyPlus, ExternalLink, Moon, Plus, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, Button, Spinner } from "../components/ui";
import type { Person, PlanEntry, Slot } from "../lib/api";
import { SLOTS } from "../lib/api";
import { addDays, formatDayMonth, formatWeekday, isToday, toISO, weekDays } from "../lib/dates";
import { seatsFor, withoutFollowers } from "../lib/plan";
import { useCopyWeek, usePeople, usePlan } from "../lib/queries";
import { MealPicker, type PickerTarget } from "./MealPicker";

const SLOT_META: Record<Slot, { label: string; icon: typeof Sun }> = {
  lunch: { label: "Lunch", icon: Sun },
  dinner: { label: "Dinner", icon: Moon },
};

export function PlanView({ weekStart }: { weekStart: Date }) {
  const start = toISO(weekStart);
  const { data: people = [], isLoading: loadingPeople } = usePeople();
  const { data: entries = [], isLoading: loadingPlan, isPlaceholderData } = usePlan(start);
  const copyWeek = useCopyWeek();
  const [target, setTarget] = useState<PickerTarget | null>(null);

  const byCell = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const e of entries) {
      const k = `${e.date}|${e.slot}`;
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return map;
  }, [entries]);

  if (loadingPeople || loadingPlan) {
    return (
      <div className="flex justify-center py-24 text-stone-400">
        <Spinner />
      </div>
    );
  }

  const today = toISO(new Date());
  const days = weekDays(weekStart);
  // Count seats, so a kid eating along with someone counts as planned.
  const planned = days.reduce(
    (sum, day) =>
      sum +
      SLOTS.reduce(
        (s, slot) => s + seatsFor(people, byCell.get(`${toISO(day)}|${slot}`) ?? []).filter((seat) => seat.entry).length,
        0,
      ),
    0,
  );
  const total = days.length * SLOTS.length * people.length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-28 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
            <div
              className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
              style={{ width: `${total ? (planned / total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm text-stone-500">
            {planned} of {total} planned
          </span>
        </div>
        <Button
          size="sm"
          disabled={copyWeek.isPending}
          onClick={() => copyWeek.mutate({ from: toISO(addDays(weekStart, -7)), to: start })}
          title="Copy last week's meals into empty slots of this week"
        >
          <CopyPlus className="size-4" /> Copy last week
        </Button>
      </div>

      <div className={clsx("flex flex-col gap-3 transition-opacity", isPlaceholderData && "opacity-60")}>
        {days.map((day) => {
          const iso = toISO(day);
          const isPast = iso < today;
          return (
            <section
              key={iso}
              className={clsx(
                "grid gap-x-4 gap-y-2 rounded-2xl bg-white p-3 shadow-sm ring-1 sm:grid-cols-[5.5rem_1fr_1fr] sm:p-4 dark:bg-stone-900",
                isToday(day) ? "ring-2 ring-brand-500/70" : "ring-stone-200/80 dark:ring-stone-800",
              )}
            >
              <header className={clsx("flex items-baseline gap-2 sm:flex-col sm:gap-0", isPast && "opacity-50")}>
                <span
                  className={clsx(
                    "text-xs font-semibold uppercase tracking-wider",
                    isToday(day) ? "text-brand-600 dark:text-brand-400" : "text-stone-500",
                  )}
                >
                  {isToday(day) ? "Today" : formatWeekday(day)}
                </span>
                <span className="text-lg font-semibold tabular-nums sm:text-2xl">{formatDayMonth(day)}</span>
              </header>
              {SLOTS.map((slot) => (
                <SlotCell
                  key={slot}
                  slot={slot}
                  people={people}
                  entries={byCell.get(`${iso}|${slot}`) ?? []}
                  dimmed={isPast}
                  onPick={(personIds) => setTarget({ date: iso, slot, personIds })}
                />
              ))}
            </section>
          );
        })}
      </div>

      <MealPicker
        target={target}
        people={people}
        entries={target ? (byCell.get(`${target.date}|${target.slot}`) ?? []) : []}
        onClose={() => setTarget(null)}
      />
    </>
  );
}

function SlotCell({
  slot,
  people,
  entries,
  dimmed,
  onPick,
}: {
  slot: Slot;
  people: Person[];
  entries: PlanEntry[];
  dimmed: boolean;
  onPick: (personIds: number[]) => void;
}) {
  const { label, icon: Icon } = SLOT_META[slot];

  // People sharing a meal are shown together on one card; kids sit with the person they follow.
  const seats = seatsFor(people, entries);
  const groups = new Map<string, { entry: PlanEntry; seats: typeof seats }>();
  for (const seat of seats) {
    if (!seat.entry) continue;
    const key = `${seat.entry.meal.id}|${seat.entry.leftovers}`;
    const g = groups.get(key) ?? { entry: seat.entry, seats: [] };
    g.seats.push(seat);
    groups.set(key, g);
  }
  const unplanned = seats.filter((s) => !s.entry).map((s) => s.person);
  // Editing a card changes the people with their own entry; kids eating along keep following.
  const ownIds = (group: typeof seats) => group.filter((s) => !s.inherited).map((s) => s.person.id);

  return (
    <div className={clsx("min-w-0", dimmed && "opacity-60 transition-opacity hover:opacity-100")}>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-400">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="flex flex-col gap-1.5">
        {[...groups.entries()].map(([key, { entry, seats: eaters }]) => {
          const meal = entry.meal;
          const pick = () => onPick(ownIds(eaters));
          return (
          <div
            key={key}
            role="button"
            tabIndex={0}
            onClick={pick}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick())}
            className="group flex cursor-pointer items-center gap-2.5 rounded-xl bg-stone-50 px-2.5 py-2 ring-1 ring-stone-200/70 transition hover:bg-brand-50 hover:ring-brand-200 dark:bg-stone-800/60 dark:ring-stone-700/60 dark:hover:bg-brand-900/30 dark:hover:ring-brand-700/50"
          >
            {people.length > 1 && (
              <span className="flex -space-x-1.5">
                {eaters.map(({ person, inherited }) => (
                  <Avatar
                    key={person.id}
                    person={person}
                    size="sm"
                    ring
                    title={inherited ? `${person.name} eats along` : person.name}
                  />
                ))}
              </span>
            )}
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {entry.leftovers && (
                <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  Leftovers
                </span>
              )}
              <span className="truncate text-sm font-medium">{meal.name}</span>
            </span>
            {meal.recipe_url && (
              <a
                href={meal.recipe_url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(e) => e.stopPropagation()}
                className="-m-1 rounded-md p-1 text-stone-400 hover:bg-white hover:text-brand-600 dark:hover:bg-stone-900"
                title="Open recipe"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
          );
        })}
        {unplanned.length > 0 && (
          <button
            type="button"
            onClick={() => onPick(withoutFollowers(people, unplanned.map((p) => p.id)))}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-stone-300 px-2.5 py-2 text-sm text-stone-400 transition hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700 dark:border-stone-700 dark:hover:border-brand-600 dark:hover:bg-brand-900/20 dark:hover:text-brand-300"
          >
            <Plus className="size-4" />
            <span className="truncate">
              {groups.size === 0 || unplanned.length === people.length ? "Add meal" : `Add for ${unplanned.map((p) => p.name).join(", ")}`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
