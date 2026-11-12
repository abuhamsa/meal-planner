import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Meal, type Person, type Slot } from "./api";
import { toast } from "../components/Toaster";

export const keys = {
  me: ["me"] as const,
  people: ["people"] as const,
  meals: (params: object = {}) => ["meals", params] as const,
  plan: (start: string) => ["plan", start] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.me, staleTime: Infinity });

export const usePeople = () => useQuery({ queryKey: keys.people, queryFn: api.people });

export const useMeals = (params: Parameters<typeof api.meals>[0] = {}) =>
  useQuery({ queryKey: keys.meals(params), queryFn: () => api.meals(params), placeholderData: keepPreviousData });

export const usePlan = (start: string) =>
  useQuery({ queryKey: keys.plan(start), queryFn: () => api.plan(start), placeholderData: keepPreviousData });

const onError = (e: Error) => toast.error(e.message);

/** Plan changes also change meal statistics (usage count, last planned), so refresh both. */
function useInvalidatePlanAndMeals() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ["plan"] }), qc.invalidateQueries({ queryKey: ["meals"] })]);
}

export function useAssign() {
  const invalidate = useInvalidatePlanAndMeals();
  return useMutation({
    mutationFn: (data: { date: string; slot: Slot; person_ids: number[]; meal_id?: number; meal_name?: string }) =>
      api.assign(data),
    onSuccess: invalidate,
    onError,
  });
}

export function useUnassign() {
  const invalidate = useInvalidatePlanAndMeals();
  return useMutation({
    mutationFn: (entryIds: number[]) => Promise.all(entryIds.map(api.unassign)),
    onSuccess: invalidate,
    onError,
  });
}

export function useCopyWeek() {
  const invalidate = useInvalidatePlanAndMeals();
  return useMutation({
    mutationFn: api.copyPlan,
    onSuccess: async ({ copied }) => {
      await invalidate();
      toast.success(copied ? `Copied ${copied} meal${copied === 1 ? "" : "s"} from last week` : "Nothing to copy, last week is empty or this week is already filled");
    },
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
