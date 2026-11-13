import { Clock, ExternalLink, Users } from "lucide-react";
import { Dialog, Spinner } from "../components/ui";
import type { Meal } from "../lib/api";
import { hostname } from "../lib/dates";
import { useRecipe } from "../lib/queries";

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** Shows an imported recipe. `meal` is null when closed. */
export function RecipeDialog({ meal, onClose }: { meal: Pick<Meal, "id" | "name"> | null; onClose: () => void }) {
  return (
    <Dialog open={meal !== null} onClose={onClose} title={meal?.name ?? ""} wide>
      {meal && <RecipeBody mealId={meal.id} />}
    </Dialog>
  );
}

function RecipeBody({ mealId }: { mealId: number }) {
  const { data: recipe, isLoading, error } = useRecipe(mealId);

  if (isLoading)
    return (
      <div className="flex justify-center py-16 text-stone-400">
        <Spinner />
      </div>
    );
  if (error || !recipe) return <p className="py-8 text-center text-sm text-stone-500">{error?.message ?? "No recipe saved."}</p>;

  const time = recipe.total_time ?? ((recipe.prep_time ?? 0) + (recipe.cook_time ?? 0) || null);
  const site = recipe.site || hostname(recipe.source_url);

  return (
    <div className="flex flex-col gap-5">
      {recipe.image_url && (
        <img
          src={recipe.image_url}
          alt=""
          className="-mx-5 -mt-4 aspect-[2/1] max-h-72 w-[calc(100%+2.5rem)] max-w-none object-cover short:hidden"
        />
      )}

      {(recipe.yields || time) && (
        <div className="flex flex-wrap gap-2 text-sm text-stone-600 dark:text-stone-300">
          {recipe.yields && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-2.5 py-1 dark:bg-stone-800">
              <Users className="size-4 text-stone-400" /> {recipe.yields}
            </span>
          )}
          {time && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-2.5 py-1 dark:bg-stone-800">
              <Clock className="size-4 text-stone-400" /> {formatMinutes(time)}
            </span>
          )}
        </div>
      )}

      <div lang="de" className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8 short:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] short:gap-6">
        {recipe.ingredient_groups.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Ingredients</h3>
            <div className="flex flex-col gap-4">
              {recipe.ingredient_groups.map((group, i) => (
                <div key={i}>
                  {group.purpose && <h4 className="mb-1 text-sm font-semibold">{group.purpose}</h4>}
                  <ul className="flex flex-col divide-y divide-stone-100 text-[0.9375rem] dark:divide-stone-800">
                    {group.ingredients.map((line, j) => (
                      <li key={j} className="py-1.5 leading-snug">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {recipe.instructions.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Steps</h3>
            <ol className="flex flex-col gap-3 text-[0.9375rem]">
              {recipe.instructions.map((step, i) => (
                <li key={i} className="flex gap-3 leading-relaxed">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
                    {i + 1}
                  </span>
                  <span className="min-w-0 hyphens-auto">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <a
        href={recipe.source_url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
      >
        <ExternalLink className="size-4" /> Original recipe on {site}
      </a>
    </div>
  );
}
