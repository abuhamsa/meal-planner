import clsx from "clsx";
import { ChefHat, ExternalLink, Plus, Search, Star } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Button, Spinner } from "../components/ui";
import type { Meal } from "../lib/api";
import { formatRelativeDay, hostname } from "../lib/dates";
import { useMeals, useToggleFavorite } from "../lib/queries";
import { MealDialog } from "./MealDialog";

type Sort = "name" | "frequent" | "recent";
const SORTS: { value: Sort; label: string }[] = [
  { value: "name", label: "A–Z" },
  { value: "frequent", label: "Most planned" },
  { value: "recent", label: "Recently planned" },
];

export function MealsView() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [editing, setEditing] = useState<Partial<Meal> | null>(null);
  const q = useDeferredValue(query.trim());
  const { data: meals = [], isLoading, isPlaceholderData } = useMeals({ q: q || undefined, sort });
  const toggleFavorite = useToggleFavorite();

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your meals…"
            className="h-10 w-full rounded-lg bg-white pl-9 pr-3 text-sm shadow-sm ring-1 ring-stone-200 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500 dark:bg-stone-900 dark:ring-stone-700"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg bg-stone-200/60 p-1 dark:bg-stone-800/60">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSort(s.value)}
                className={clsx(
                  "cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition",
                  sort === s.value
                    ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white"
                    : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button variant="primary" onClick={() => setEditing({ name: query.trim() })} className="ml-auto">
            <Plus className="size-4" /> <span className="hidden sm:inline">New meal</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24 text-stone-400">
          <Spinner />
        </div>
      ) : meals.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-300 px-6 py-16 text-center dark:border-stone-700">
          <ChefHat className="mb-3 size-10 text-stone-300 dark:text-stone-600" />
          <p className="font-medium">{q ? `No meals match “${q}”` : "No meals yet"}</p>
          <p className="mt-1 max-w-sm text-sm text-stone-500">
            {q ? "Create it as a new meal, or try another search." : "Add meals here, or create them directly in the plan. Each meal is saved once and can be reused any time."}
          </p>
          <Button variant="primary" className="mt-4" onClick={() => setEditing({ name: q })}>
            <Plus className="size-4" /> {q ? `Create “${q}”` : "Add a meal"}
          </Button>
        </div>
      ) : (
        <ul className={clsx("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", isPlaceholderData && "opacity-60")}>
          {meals.map((meal) => (
            <li key={meal.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setEditing(meal)}
                onKeyDown={(e) => e.key === "Enter" && setEditing(meal)}
                className="group flex h-full cursor-pointer flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/80 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-200 dark:bg-stone-900 dark:ring-stone-800 dark:hover:ring-brand-700/50"
              >
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 font-semibold leading-snug">{meal.name}</h3>
                  <button
                    type="button"
                    aria-label={meal.favorite ? "Remove from favorites" : "Mark as favorite"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite.mutate(meal);
                    }}
                    className="-m-1 cursor-pointer rounded-md p-1 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <Star
                      className={clsx(
                        "size-4 transition",
                        meal.favorite ? "fill-amber-400 text-amber-400" : "text-stone-300 group-hover:text-stone-400 dark:text-stone-600",
                      )}
                    />
                  </button>
                </div>
                {meal.notes && <p className="mt-1 line-clamp-2 text-sm text-stone-500">{meal.notes}</p>}
                <div className="mt-auto flex items-center gap-3 pt-3 text-xs text-stone-500">
                  <span>
                    {meal.usage_count ? `${meal.usage_count}× planned` : "Not planned yet"}
                    {meal.last_planned && ` · ${formatRelativeDay(meal.last_planned)}`}
                  </span>
                  {meal.recipe_url && (
                    <a
                      href={meal.recipe_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto inline-flex max-w-[50%] items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 font-medium text-stone-600 hover:bg-brand-100 hover:text-brand-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-brand-900/50 dark:hover:text-brand-200"
                    >
                      <ExternalLink className="size-3 shrink-0" />
                      <span className="truncate">{hostname(meal.recipe_url)}</span>
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MealDialog meal={editing} onClose={() => setEditing(null)} />
    </>
  );
}
