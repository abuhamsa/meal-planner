import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AssignInput, type Meal, type Person, type PlanSlot, type RecipeInput, type Slot } from "./api";
import { toast } from "../components/Toaster";

export const keys = {
  me: ["me"] as const,
  people: ["people"] as const,
  meals: (params: object = {}) => ["meals", params] as const,
  plan: (start: string) => ["plan", start] as const,
  planSlots: (start: string) => ["plan", start, "slots"] as const,
  recipe: (mealId: number) => ["recipe", mealId] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.me, staleTime: Infinity });

export const usePeople = () => useQuery({ queryKey: keys.people, queryFn: api.people });

export const useMeals = (params: Parameters<typeof api.meals>[0] = {}) =>
  useQuery({ queryKey: keys.meals(params), queryFn: () => api.meals(params), placeholderData: keepPreviousData });

export const usePlan = (start: string, options: { refetchInterval?: number } = {}) =>
  useQuery({ queryKey: keys.plan(start), queryFn: () => api.plan(start), placeholderData: keepPreviousData, ...options });

const onError = (e: Error) => toast.error(e.message);

/** Plan changes also change meal statistics (usage count, last planned), so refresh both. */
function useInvalidatePlanAndMeals() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ["plan"] }), qc.invalidateQueries({ queryKey: ["meals"] })]);
}

export const usePlanSlots = (start: string, options: { refetchInterval?: number } = {}) =>
  useQuery({ queryKey: keys.planSlots(start), queryFn: () => api.planSlots(start), placeholderData: keepPreviousData, ...options });

/** Index slot details by "date|slot". */
export const slotMap = (slots: PlanSlot[] = []) => new Map(slots.map((s) => [`${s.date}|${s.slot}`, s]));

export function useSetGuests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { date: string; slot: Slot; guests: boolean; guests_note?: string | null }) => api.setPlanSlot(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan"] }),
    onError,
  });
}

export function useAssign() {
  const invalidate = useInvalidatePlanAndMeals();
  return useMutation({
    mutationFn: (data: AssignInput) => api.assign(data),
    onSuccess: invalidate,
    onError,
  });
}

export const usePreviousMeal = (date: string, slot: Slot, personIds: number[]) =>
  useQuery({
    queryKey: ["plan", "previous", date, slot, [...personIds].sort()],
    queryFn: () => api.previousMeal(date, slot, personIds),
    enabled: personIds.length > 0,
  });

export function useUnassign() {
  const invalidate = useInvalidatePlanAndMeals();
  return useMutation({
    mutationFn: (entryIds: number[]) => Promise.all(entryIds.map(api.unassign)),
    onSuccess: invalidate,
    onError,
  });
}

export function useSaveMeal() {
  const invalidate = useInvalidatePlanAndMeals();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Meal>) => (id ? api.updateMeal(id, data) : api.createMeal(data)),
    onSuccess: invalidate,
  });
}

export function useDeleteMeal() {
  const invalidate = useInvalidatePlanAndMeals();
  return useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) => api.deleteMeal(id, force),
    onSuccess: invalidate,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meal: Meal) => api.updateMeal(meal.id, { favorite: !meal.favorite }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meals"] }),
    onError,
  });
}

export function useSavePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Person>) => (id ? api.updatePerson(id, data) : api.createPerson(data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.people }),
    onError,
  });
}

export function useDeletePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) => api.deletePerson(id, force),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: keys.people }), qc.invalidateQueries({ queryKey: ["plan"] })]),
  });
}

export const useRecipe = (mealId: number | undefined) =>
  useQuery({ queryKey: keys.recipe(mealId ?? 0), queryFn: () => api.recipe(mealId!), enabled: !!mealId });

/** Recipes change `has_recipe` on meals, which plan entries embed too. */
function useInvalidateRecipe() {
  const qc = useQueryClient();
  const invalidate = useInvalidatePlanAndMeals();
  return (mealId: number) => Promise.all([qc.invalidateQueries({ queryKey: keys.recipe(mealId) }), invalidate()]);
}

export function useImportRecipe() {
  const invalidate = useInvalidateRecipe();
  return useMutation({
    mutationFn: (mealId: number) => api.importRecipe(mealId),
    onSuccess: (_, mealId) => invalidate(mealId),
  });
}

export function useSaveRecipe() {
  const qc = useQueryClient();
  const invalidate = useInvalidateRecipe();
  return useMutation({
    mutationFn: ({ mealId, data }: { mealId: number; data: RecipeInput }) => api.saveRecipe(mealId, data),
    onSuccess: (saved, { mealId }) => {
      qc.setQueryData(keys.recipe(mealId), saved);
      return invalidate(mealId);
    },
  });
}

export function useDeleteRecipe() {
  const invalidate = useInvalidateRecipe();
  return useMutation({
    mutationFn: (mealId: number) => api.deleteRecipe(mealId),
    onSuccess: (_, mealId) => invalidate(mealId),
    onError,
  });
}
