import clsx from "clsx";
import { Check, ExternalLink, Plus, Search, Soup, Star, Store, Trash2 } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Avatar, Button, Dialog, Spinner } from "../components/ui";
import type { Meal, Person, PlanEntry, Slot } from "../lib/api";
import { formatDate, formatRelativeDay, formatWeekday, fromISO } from "../lib/dates";
import { mealLabel, seatsFor } from "../lib/plan";
import { useAssign, useMeals, usePreviousMeal, useUnassign } from "../lib/queries";

export interface PickerTarget {
  date: string;
  slot: Slot;
  personIds: number[];
}

type Option = { kind: "meal"; meal: Meal } | { kind: "create"; name: string };

export function MealPicker({
  target,
  people,
  entries,
  onClose,
}: {
  target: PickerTarget | null;
  people: Person[];
  /** All plan entries for the target's date + slot. */
  entries: PlanEntry[];
  onClose: () => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target ? (target.slot === "lunch" ? "Lunch" : "Dinner") : ""}
      subtitle={target ? formatDate(fromISO(target.date)) : undefined}
    >
      {target && <PickerBody key={`${target.date}-${target.slot}`} target={target} people={people} entries={entries} onDone={onClose} />}
    </Dialog>
  );
}

function PickerBody({
  target,
  people,
  entries,
  onDone,
}: {
  target: PickerTarget;
  people: Person[];
  entries: PlanEntry[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<number[]>(target.personIds);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const deferredQuery = useDeferredValue(query.trim());
  const listRef = useRef<HTMLUListElement>(null);

  const { data: meals = [], isFetching, isPlaceholderData } = useMeals({
    q: deferredQuery || undefined,
    sort: deferredQuery ? "name" : "frequent",
    limit: 40,
  });
  const assign = useAssign();
  const unassign = useUnassign();
  // True while the visible list still belongs to an older search text.
  const stale = deferredQuery !== query.trim() || isPlaceholderData;
  const [pendingEnter, setPendingEnter] = useState(false);

  const selectedEntries = entries.filter((e) => selected.includes(e.person_id));
  const currentMealIds = new Set(selectedEntries.flatMap((e) => (e.meal && !e.leftovers ? [e.meal.id] : [])));
  const seats = seatsFor(people, entries);
  const nameOf = (id: number | null) => people.find((p) => p.id === id)?.name ?? "";
  // Selected kids who would stop eating along with the person they follow.
  const splitting = people.filter(
    (p) => selected.includes(p.id) && p.follows_person_id != null && !entries.some((e) => e.person_id === p.id),
  );

  // Leftovers come from the last meal of the selected people (kids: of who they follow).
  const sourceIds = [
    ...new Set(selected.flatMap((id) => [id, ...people.filter((p) => p.id === id && p.follows_person_id != null).map((p) => p.follows_person_id!)])),
  ];
  const { data: previous } = usePreviousMeal(target.date, target.slot, sourceIds);
  const leftoverMeal = previous?.meal ?? null;

  const chooseLeftovers = () => {
    if (!leftoverMeal || !selected.length || assign.isPending) return;
    assign.mutate(
      { date: target.date, slot: target.slot, person_ids: selected, meal_id: leftoverMeal.id, leftovers: true },
      { onSuccess: onDone },
    );
  };

  // Eating out: prefill the place when the selected people already eat out here.
  const currentOut = selectedEntries.find((e) => e.eating_out);
  const [outOpen, setOutOpen] = useState(false);
  const [outNote, setOutNote] = useState(currentOut?.note ?? "");
  const chooseEatingOut = () => {
    if (!selected.length || assign.isPending) return;
    assign.mutate(
      { date: target.date, slot: target.slot, person_ids: selected, eating_out: true, note: outNote.trim() || null },
      { onSuccess: onDone },
    );
  };

  const options = useMemo<Option[]>(() => {
    const q = deferredQuery.toLowerCase();
    // Exact match first, then names starting with the search text, then the rest.
    const rank = (m: Meal) => (m.name.toLowerCase() === q ? 0 : m.name.toLowerCase().startsWith(q) ? 1 : 2);
    const sorted = q ? [...meals].sort((a, b) => rank(a) - rank(b)) : meals;
    const opts: Option[] = sorted.map((meal) => ({ kind: "meal", meal }));
    if (q && !meals.some((m) => m.name.toLowerCase() === q)) {
      opts.push({ kind: "create", name: deferredQuery.replace(/\s+/g, " ") });
    }
    return opts;
  }, [meals, deferredQuery]);

  useEffect(() => setActive(0), [deferredQuery]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (opt: Option) => {
    if (!selected.length || assign.isPending) return;
    assign.mutate(
      {
        date: target.date,
        slot: target.slot,
        person_ids: selected,
        ...(opt.kind === "meal" ? { meal_id: opt.meal.id } : { meal_name: opt.name }),
      },
      { onSuccess: onDone },
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Don't pick from a list that doesn't match what was typed yet; wait for fresh results.
      if (stale) setPendingEnter(true);
      else if (options[active]) choose(options[active]);
    }
  };

  useEffect(() => {
    if (pendingEnter && !stale) {
      setPendingEnter(false);
      if (options[0]) choose(options[0]);
    }
  }, [pendingEnter, stale, options]);

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? (s.length > 1 ? s.filter((x) => x !== id) : s) : [...s, id]));

  return (
    <div className="flex flex-col gap-4">
      {people.length > 1 && (
        <div>
          <div className="mb-2 flex items-center justify-between text-sm font-medium text-stone-700 dark:text-stone-300">
            Who's eating?
            {selected.length < people.length && (
              <button
                type="button"
                className="cursor-pointer text-xs font-medium text-brand-600 hover:underline"
                onClick={() => setSelected(people.map((p) => p.id))}
              >
                Everyone
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = selected.includes(p.id);
              const seat = seats.find((x) => x.person.id === p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.id)}
                  className={clsx(
                    "flex cursor-pointer items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm ring-1 transition",
                    on
                      ? "bg-stone-900 text-white ring-stone-900 dark:bg-white dark:text-stone-900 dark:ring-white"
                      : "bg-white text-stone-600 ring-stone-200 hover:ring-stone-300 dark:bg-stone-900 dark:text-stone-400 dark:ring-stone-700",
                  )}
                >
                  <Avatar person={p} size="sm" />
                  <span className="font-medium">{p.name}</span>
                  {seat?.entry ? (
                    <span className={clsx("max-w-36 truncate text-xs", on ? "opacity-70" : "opacity-60")}>
                      · {seat.inherited ? `with ${nameOf(p.follows_person_id)}` : mealLabel(seat.entry)}
                    </span>
                  ) : (
                    p.follows_person_id != null && (
                      <span className={clsx("text-xs", on ? "opacity-70" : "opacity-60")}>· eats with {nameOf(p.follows_person_id)}</span>
                    )
                  )}
                </button>
              );
            })}
          </div>
          {splitting.length > 0 && (
            <p className="mt-2 text-xs text-stone-500">
              {splitting.map((p) => p.name).join(", ")} will get {splitting.length === 1 ? "a separate meal" : "separate meals"} instead of
              eating along. Clear it later to go back.
            </p>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search meals or type a new one…"
          role="combobox"
          aria-expanded="true"
          aria-controls="meal-options"
          aria-activedescendant={options[active] ? `meal-opt-${active}` : undefined}
          className="h-11 w-full rounded-xl bg-stone-100 pl-9 pr-9 text-[0.9375rem] outline-none ring-brand-500 transition placeholder:text-stone-400 focus:bg-white focus:ring-2 dark:bg-stone-800 dark:focus:bg-stone-900"
        />
        {isFetching && <Spinner className="absolute right-3 top-3 size-4 text-stone-400" />}
      </div>

      {!query && leftoverMeal && previous?.date && previous.slot && (
        <button
          type="button"
          onClick={chooseLeftovers}
          disabled={assign.isPending}
          className="-mt-1 flex cursor-pointer items-center gap-3 rounded-xl bg-amber-50 px-3 py-2.5 text-left ring-1 ring-amber-200/80 transition hover:bg-amber-100 dark:bg-amber-950/30 dark:ring-amber-800/50 dark:hover:bg-amber-950/60"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-200/70 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
            <Soup className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">Just leftovers: {leftoverMeal.name}</span>
            <span className="block text-xs text-stone-500">
              From {formatWeekday(fromISO(previous.date), true)} {previous.slot === "lunch" ? "lunch" : "dinner"}
            </span>
          </span>
        </button>
      )}

      {!query &&
        (outOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              chooseEatingOut();
            }}
            className="-mt-1 flex items-center gap-2 rounded-xl bg-sky-50 p-2 ring-1 ring-sky-200/80 dark:bg-sky-950/30 dark:ring-sky-800/50"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-200/70 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300">
              <Store className="size-4" />
            </span>
            <input
              autoFocus
              value={outNote}
              maxLength={100}
              onChange={(e) => setOutNote(e.target.value)}
              placeholder="Where? (optional)"
              aria-label="Where are you eating?"
              className="h-9 min-w-0 flex-1 rounded-lg bg-white px-2.5 text-sm outline-none ring-1 ring-sky-200 focus:ring-2 focus:ring-sky-500 dark:bg-stone-900 dark:ring-sky-800"
            />
            <Button type="submit" size="sm" variant="primary" disabled={assign.isPending}>
              Save
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOutOpen(true)}
            className={clsx(
              "flex cursor-pointer items-center gap-3 rounded-xl bg-sky-50 px-3 py-2.5 text-left ring-1 ring-sky-200/80 transition hover:bg-sky-100 dark:bg-sky-950/30 dark:ring-sky-800/50 dark:hover:bg-sky-950/60",
              !leftoverMeal && "-mt-1",
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-200/70 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300">
              <Store className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {currentOut ? `Eating out${currentOut.note ? `: ${currentOut.note}` : ""}` : "Eating out"}
              </span>
              <span className="block text-xs text-stone-500">Restaurant, invitation… doesn't count as a meal</span>
            </span>
          </button>
        ))}

      <ul ref={listRef} id="meal-options" role="listbox" className="-mx-2 max-h-80 overflow-y-auto">
        {!query && meals.length > 0 && (
          <li className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-stone-400">Most planned</li>
        )}
        {options.map((opt, i) => (
          <li
            key={opt.kind === "meal" ? opt.meal.id : "create"}
            id={`meal-opt-${i}`}
            data-index={i}
            role="option"
            aria-selected={i === active}
            onMouseMove={() => setActive(i)}
            onClick={() => choose(opt)}
            className={clsx(
              "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2",
              i === active && "bg-stone-100 dark:bg-stone-800",
            )}
          >
            {opt.kind === "create" ? (
              <>
                <span className="flex size-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
                  <Plus className="size-4" />
                </span>
                <span className="text-sm">
                  Create <span className="font-semibold">“{opt.name}”</span>
                </span>
              </>
            ) : (
              <MealOption meal={opt.meal} current={currentMealIds.has(opt.meal.id)} />
            )}
          </li>
        ))}
        {!options.length && !isFetching && (
          <li className="px-2 py-8 text-center text-sm text-stone-500">
            Your meal library is empty. Type a name to add your first meal.
          </li>
        )}
      </ul>

      {selectedEntries.length > 0 && (
        <div className="-mx-5 -mb-4 flex items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/60 px-5 py-3 dark:border-stone-800 dark:bg-stone-950/40">
          <span className="truncate text-sm text-stone-500">
            {selectedEntries.length === 1
              ? `Planned: ${mealLabel(selectedEntries[0])}`
              : `${selectedEntries.length} people have something planned`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/50"
            disabled={unassign.isPending}
            onClick={() => unassign.mutate(selectedEntries.map((e) => e.id), { onSuccess: onDone })}
          >
            <Trash2 className="size-4" /> Clear
          </Button>
        </div>
      )}
    </div>
  );
}

function MealOption({ meal, current }: { meal: Meal; current: boolean }) {
  return (
    <>
      <span
        className={clsx(
          "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold",
          current ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
        )}
      >
        {current ? <Check className="size-4" /> : meal.name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{meal.name}</span>
          {meal.favorite && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
          {meal.recipe_url && <ExternalLink className="size-3.5 shrink-0 text-stone-400" />}
        </span>
        <span className="block text-xs text-stone-500">
          {meal.usage_count
            ? `${meal.usage_count}× planned${meal.last_planned ? ` · ${formatRelativeDay(meal.last_planned)}` : ""}`
            : "Not planned yet"}
        </span>
      </span>
    </>
  );
}
