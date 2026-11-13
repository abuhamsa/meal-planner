import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "../components/Toaster";
import { Button, Input, Label, Spinner, Textarea } from "../components/ui";
import type { Recipe, RecipeInput } from "../lib/api";
import { useSaveRecipe } from "../lib/queries";

type Groups = Recipe["ingredient_groups"];

/** One ingredient per line; a line ending with ":" starts a group ("Für die Sauce:"). */
export function parseIngredients(text: string): Groups {
  const groups: Groups = [{ purpose: null, ingredients: [] }];
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/^[-*•]\s+/, "");
    if (!line) continue;
    if (line.endsWith(":") && line.length > 1) groups.push({ purpose: line.slice(0, -1).trim(), ingredients: [] });
    else groups[groups.length - 1].ingredients.push(line);
  }
  return groups.filter((g) => g.ingredients.length > 0);
}

export function formatIngredients(groups: Groups) {
  return groups.map((g) => (g.purpose ? `${g.purpose.replace(/:\s*$/, "")}:\n` : "") + g.ingredients.join("\n")).join("\n\n");
}

/** One step per line. Numbers or bullets pasted from elsewhere ("1.", "2)", "-") are removed. */
export function parseSteps(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^(\d+[.)]|[-*•])\s+/, ""))
    .filter(Boolean);
}

/** A blank line between steps, so long steps that wrap are still easy to tell apart. */
export const formatSteps = (steps: string[]) => steps.map((s) => s.replace(/\s*\n\s*/g, " ")).join("\n\n");

/** Write a recipe by hand, or edit a saved one (its picture and source link stay). */
export function RecipeEditor({
  mealId,
  recipe,
  onDone,
  onCancel,
}: {
  mealId: number;
  recipe?: Recipe;
  onDone: (saved: Recipe) => void;
  onCancel: () => void;
}) {
  const [yields, setYields] = useState(recipe?.yields ?? "");
  const initialTime = recipe?.total_time ?? ((recipe?.prep_time ?? 0) + (recipe?.cook_time ?? 0) || null);
  const [time, setTime] = useState(initialTime ? String(initialTime) : "");
  const [ingredients, setIngredients] = useState(recipe ? formatIngredients(recipe.ingredient_groups) : "");
  const [steps, setSteps] = useState(recipe ? formatSteps(recipe.instructions) : "");
  const [error, setError] = useState<string | null>(null);
  const save = useSaveRecipe();
  const formRef = useRef<HTMLFormElement>(null);
  // Coming from the end of a long recipe view, start at the top.
  useEffect(() => {
    formRef.current?.parentElement?.scrollTo(0, 0);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const data: RecipeInput = {
      yields: yields.trim() || null,
      total_time: time ? Number(time) : null,
      ingredient_groups: parseIngredients(ingredients),
      instructions: parseSteps(steps),
    };
    if (!data.ingredient_groups.length && !data.instructions.length) {
      setError("Add at least one ingredient or step.");
      return;
    }
    save.mutate(
      { mealId, data },
      {
        onSuccess: (saved) => {
          toast.success("Recipe saved");
          onDone(saved);
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <Label hint="Optional">Servings</Label>
          <Input maxLength={100} value={yields} onChange={(e) => setYields(e.target.value)} placeholder="e.g. 4 Portionen" />
        </label>
        <label className="block">
          <Label hint="Optional">Time in minutes</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            step={1}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="e.g. 45"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] short:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <label className="flex flex-col">
          <Label>Ingredients</Label>
          <Textarea
            autoFocus={!recipe}
            rows={10}
            lang="de"
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            placeholder={"500 g Spaghetti\n1 Zwiebel\n\nFür die Sauce:\n400 g Tomaten\nSalz, Pfeffer"}
            className="flex-1"
          />
          <span className="mt-1 text-xs text-stone-500">One per line. A line ending with “:” starts a group.</span>
        </label>
        <label className="flex flex-col">
          <Label>Steps</Label>
          <Textarea
            rows={10}
            lang="de"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder={"Wasser aufkochen und salzen.\n\nZwiebel hacken und andünsten.\n\nTomaten dazugeben, 20 Minuten köcheln lassen."}
            className="flex-1"
          />
          <span className="mt-1 text-xs text-stone-500">One step per line. Empty lines are ignored.</span>
        </label>
      </div>

      {recipe?.source_url && <p className="text-xs text-stone-500">Importing the recipe again later replaces your changes.</p>}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}

      <div className="sticky -bottom-4 -mx-5 -mb-4 flex items-center justify-end gap-2 border-t border-stone-100 bg-stone-50 px-5 py-3 dark:border-stone-800 dark:bg-stone-950">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {save.isPending && <Spinner className="size-4" />} Save recipe
        </Button>
      </div>
    </form>
  );
}
