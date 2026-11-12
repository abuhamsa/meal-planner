export type Slot = "lunch" | "dinner";
export const SLOTS: Slot[] = ["lunch", "dinner"];

export interface Person {
  id: number;
  name: string;
  color: string;
  position: number;
  /** Set for kids: without their own plan entry they eat what this person eats. */
  follows_person_id: number | null;
}

export interface Meal {
  id: number;
  name: string;
  recipe_url: string | null;
  notes: string | null;
  favorite: boolean;
  usage_count?: number;
  last_planned?: string | null;
}

export interface PlanEntry {
  id: number;
  date: string;
  slot: Slot;
  person_id: number;
  leftovers: boolean;
  meal: Meal;
}

export interface AssignInput {
  date: string;
  slot: Slot;
  person_ids: number[];
  meal_id?: number;
  meal_name?: string;
  leftovers?: boolean;
}

export interface Me {
  user: { username: string; name: string; email: string | null };
  version: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const RELOAD_KEY = "mealplanner:auth-reload";

/**
 * Authentication happens in SWAG + Authentik. When the Authentik session has expired, the
 * proxy answers API calls with a redirect to the login page (or a 401). A fetch can't follow
 * that usefully, so reload the page and let the proxy show the login. Guard against a reload
 * loop in case the proxy is misconfigured and never forwards the user header.
 */
function handleAuthLost(): never {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    /* storage unavailable */
  }
  if (Date.now() - last > 30_000) {
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      /* storage unavailable */
    }
    window.location.reload();
  }
  throw new ApiError(401, "Your session has expired, or the proxy isn't forwarding the login. Reload the page to sign in again.");
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      redirect: "manual",
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }

  if (res.type === "opaqueredirect" || res.status === 401) handleAuthLost();
  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data ?? {});
  }
  if (!isJson) handleAuthLost(); // An HTML login page instead of JSON.
  return data as T;
}

export const api = {
  me: () => request<Me>("GET", "/me"),

  people: () => request<Person[]>("GET", "/people"),
  createPerson: (data: Partial<Person>) => request<Person>("POST", "/people", data),
  updatePerson: (id: number, data: Partial<Person>) => request<Person>("PATCH", `/people/${id}`, data),
  deletePerson: (id: number, force = false) => request<void>("DELETE", `/people/${id}${force ? "?force=true" : ""}`),

  meals: (params: { q?: string; sort?: "name" | "frequent" | "recent"; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.sort) qs.set("sort", params.sort);
    if (params.limit) qs.set("limit", String(params.limit));
    return request<Meal[]>("GET", `/meals?${qs}`);
  },
  createMeal: (data: Partial<Meal>) => request<Meal>("POST", "/meals", data),
  updateMeal: (id: number, data: Partial<Meal>) => request<Meal>("PATCH", `/meals/${id}`, data),
  deleteMeal: (id: number, force = false) => request<void>("DELETE", `/meals/${id}${force ? "?force=true" : ""}`),

  plan: (start: string, days = 7) => request<PlanEntry[]>("GET", `/plan?start=${start}&days=${days}`),
  assign: (data: AssignInput) => request<PlanEntry[]>("PUT", "/plan", data),
  previousMeal: (date: string, slot: Slot, personIds: number[]) =>
    request<{ meal: Meal | null; date?: string; slot?: Slot }>(
      "GET",
      `/plan/previous?date=${date}&slot=${slot}&person_ids=${personIds.join(",")}`,
    ),
  unassign: (entryId: number) => request<void>("DELETE", `/plan/${entryId}`),
  copyPlan: (data: { from: string; to: string; days?: number; overwrite?: boolean }) =>
    request<{ copied: number }>("POST", "/plan/copy", data),
};
