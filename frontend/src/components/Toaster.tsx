import { CircleAlert, CircleCheck } from "lucide-react";
import { useSyncExternalStore } from "react";

type Toast = { id: number; kind: "success" | "error"; message: string };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(kind: Toast["kind"], message: string) {
  const id = nextId++;
  toasts = [...toasts, { id, kind, message }].slice(-3);
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, kind === "error" ? 6000 : 3500);
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
};

export function Toaster() {
  const items = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-md animate-toast items-center gap-2.5 rounded-xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg ring-1 ring-white/10 dark:bg-stone-800"
        >
          {t.kind === "success" ? (
            <CircleCheck className="size-4 shrink-0 text-emerald-400" />
          ) : (
            <CircleAlert className="size-4 shrink-0 text-red-400" />
          )}
          {t.message}
        </div>
      ))}
    </div>
  );
}
