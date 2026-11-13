import { BookOpen, PenLine, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "../components/Toaster";
import { Button, Dialog, Input, Label, Spinner, Textarea } from "../components/ui";
import { ApiError, type Meal } from "../lib/api";
import { useDeleteMeal, useDeleteRecipe, useImportRecipe, useSaveMeal } from "../lib/queries";
import { RecipeDialog } from "./RecipeDialog";

/** `meal` is null when closed, `{}` to create a new meal, or an existing meal to edit. */
export function MealDialog({ meal, onClose }: { meal: Partial<Meal> | null; onClose: () => void }) {
  return (
    <Dialog open={meal !== null} onClose={onClose} title={meal?.id ? "Edit meal" : "New meal"}>
      {meal && <MealForm key={meal.id ?? "new"} meal={meal} onDone={onClose} />}
    </Dialog>
  );
}

function MealForm({ meal, onDone }: { meal: Partial<Meal>; onDone: () => void }) {
  const [name, setName] = useState(meal.name ?? "");
  const [recipeUrl, setRecipeUrl] = useState(meal.recipe_url ?? "");
  const [notes, setNotes] = useState(meal.notes ?? "");
  const [favorite, setFavorite] = useState(meal.favorite ?? false);
  const [importRecipe, setImportRecipe] = useState(false);
  const [hasRecipe, setHasRecipe] = useState(meal.has_recipe ?? false);
  const [recipeMode, setRecipeMode] = useState<"view" | "edit" | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const save = useSaveMeal();
  const del = useDeleteMeal();
  const importer = useImportRecipe();
  const removeRecipe = useDeleteRecipe();
  const busy = save.isPending || importer.isPending;
  const wantsImport = importRecipe && !!recipeUrl.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate(
      {
        id: meal.id,
        name,
        recipe_url: recipeUrl.trim() || null,
        notes: notes.trim() || null,
        favorite,
      },
      {
        onSuccess: (saved) => {
          const what = meal.id ? `Saved “${saved.name}”` : `Added “${saved.name}” to your meals`;
          if (!wantsImport) {
            toast.success(what);
            onDone();
            return;
          }
          // The meal is saved either way; a failed import only means no recipe to show.
          importer.mutate(saved.id, {
            onSuccess: () => toast.success(`${what} with its recipe`),
            onError: (err) => toast.error(`${what}. ${err.message}`),
            onSettled: onDone,
          });
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  const remove = (force: boolean) => {
    if (!meal.id) return;
    del.mutate(
      { id: meal.id, force },
      {
        onSuccess: () => {
          toast.success(`Deleted “${meal.name}”`);
          onDone();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) setConfirmDelete(Number(err.data.usage_count ?? 0));
          else setError(err.message);
        },
      },
    );
  };

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="block">
          <Label>Name</Label>
          <div className="flex gap-2">
            <Input autoFocus required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spaghetti Bolognese" />
            <Button
              size="icon"
              className="size-10"
              aria-pressed={favorite}
              aria-label={favorite ? "Remove from favorites" : "Mark as favorite"}
              onClick={() => setFavorite((f) => !f)}
            >
              <Star className={favorite ? "size-4 fill-amber-400 text-amber-400" : "size-4 text-stone-400"} />
            </Button>
          </div>
        </label>
        <label className="block">
          <Label hint="Optional">Recipe link</Label>
          <Input type="url" maxLength={500} value={recipeUrl} onChange={(e) => setRecipeUrl(e.target.value)} placeholder="https://…" />
        </label>
        {hasRecipe && meal.id && (
          <div className="-mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <BookOpen className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">Recipe saved</span>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setRecipeMode("view")}>
              View
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setRecipeMode("edit")}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-red-600 hover:text-red-700 dark:text-red-400"
              disabled={removeRecipe.isPending}
              onClick={() =>
                removeRecipe.mutate(meal.id!, {
                  onSuccess: () => setHasRecipe(false),
                })
              }
            >
              Remove
            </Button>
          </div>
        )}
        {!hasRecipe && meal.id && (
          <Button size="sm" variant="ghost" className="-mt-2 w-fit text-brand-700 dark:text-brand-300" onClick={() => setRecipeMode("new")}>
            <PenLine className="size-4" /> Write the recipe yourself
          </Button>
        )}
        {recipeUrl.trim() && (
          <label className="-mt-2 flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={importRecipe}
              onChange={(e) => setImportRecipe(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand-600"
            />
            <span>
              {hasRecipe ? "Import the recipe again" : "Import the recipe from this link"}
              <span className="block text-xs text-stone-500">
                {hasRecipe
                  ? "Replaces the saved recipe with the current version of the page."
                  : "Saves ingredients, steps and picture so you can open them here."}
              </span>
            </span>
          </label>
        )}
        <label className="block">
          <Label hint="Optional">Notes</Label>
          <Textarea
            rows={3}
            maxLength={5000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Variations, sides, who likes it…"
          />
        </label>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}

        {confirmDelete !== null && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p>
              “{meal.name}” is planned {confirmDelete} time
              {confirmDelete === 1 ? "" : "s"}. Deleting it also removes it from the plan.
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="danger" disabled={del.isPending} onClick={() => remove(true)}>
                Delete anyway
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                Keep it
              </Button>
            </div>
          </div>
        )}

        <div className="-mx-5 -mb-4 mt-2 flex items-center gap-2 border-t border-stone-100 bg-stone-50/60 px-5 py-3 dark:border-stone-800 dark:bg-stone-950/40">
          {meal.id && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/50"
              disabled={del.isPending}
              onClick={() => remove(false)}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {importer.isPending ? (
              <>
                <Spinner className="size-4" /> Importing recipe…
              </>
            ) : meal.id ? (
              "Save"
            ) : (
              "Add meal"
            )}
          </Button>
        </div>
      </form>
      {meal.id && (
        <RecipeDialog
          meal={recipeMode ? { id: meal.id, name: meal.name ?? name } : null}
          start={recipeMode ?? "view"}
          onClose={() => setRecipeMode(null)}
          onSaved={() => setHasRecipe(true)}
        />
      )}
    </>
  );
}
