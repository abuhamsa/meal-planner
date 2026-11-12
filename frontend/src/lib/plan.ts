import type { Person, PlanEntry } from "./api";

export interface Seat {
  person: Person;
  /** The entry this person eats from: their own, or the followed person's. */
  entry: PlanEntry | null;
  /** True when the person is a kid eating along with the person they follow. */
  inherited: boolean;
}

/** What everyone eats in one slot, resolving kids who follow another person. */
export function seatsFor(people: Person[], entries: PlanEntry[]): Seat[] {
  const own = new Map(entries.map((e) => [e.person_id, e]));
  return people.map((person) => {
    const mine = own.get(person.id);
    if (mine) return { person, entry: mine, inherited: false };
    const followed = person.follows_person_id != null ? own.get(person.follows_person_id) : undefined;
    return { person, entry: followed ?? null, inherited: Boolean(followed) };
  });
}

/**
 * People to assign when the user picks a meal for a group: kids who follow someone in the
 * group are left out, so they keep following instead of getting a fixed copy.
 */
export function withoutFollowers(people: Person[], ids: number[]): number[] {
  const set = new Set(ids);
  const result = ids.filter((id) => {
    const p = people.find((x) => x.id === id);
    return !(p?.follows_person_id != null && set.has(p.follows_person_id));
  });
  return result.length ? result : ids;
}

export const mealLabel = (entry: Pick<PlanEntry, "leftovers" | "meal">) =>
  entry.leftovers ? `Leftovers: ${entry.meal.name}` : entry.meal.name;
