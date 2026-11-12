import { Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "../components/Toaster";
import { Button, Dialog, Input, Label } from "../components/ui";
import { ApiError, type Meal } from "../lib/api";
import { useDeleteMeal, useSaveMeal } from "../lib/queries";

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
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const save = useSaveMeal();
  const del = useDeleteMeal();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate(
      { id: meal.id, name, recipe_url: recipeUrl.trim() || null, notes: notes.trim() || null, favorite },
      {
        onSuccess: (saved) => {
          toast.success(meal.id ? `Saved “${saved.name}”` : `Added “${saved.name}” to your meals`);
          onDone();
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
      <label className="block">
        <Label hint="Optional">Notes</Label>
        <textarea
          rows={3}
          maxLength={5000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Variations, sides, who likes it…"
          className="w-full resize-y rounded-lg bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-stone-200 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500 dark:bg-stone-900 dark:ring-stone-700"
        />
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}

      {confirmDelete !== null && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p>
            “{meal.name}” is planned {confirmDelete} time{confirmDelete === 1 ? "" : "s"}. Deleting it also removes it from the plan.
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
        <Button type="submit" variant="primary" disabled={save.isPending || !name.trim()}>
          {meal.id ? "Save" : "Add meal"}
        </Button>
      </div>
    </form>
  );
}
