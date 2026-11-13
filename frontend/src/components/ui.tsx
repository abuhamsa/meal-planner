import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import type { Person } from "../lib/api";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary:
    "bg-white text-stone-800 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-100 dark:ring-stone-700 dark:hover:bg-stone-800",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "icon" }) {
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "icon" && "size-9",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "h-10 w-full rounded-lg bg-white px-3 text-sm shadow-sm ring-1 ring-stone-200 outline-none transition placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500 dark:bg-stone-900 dark:ring-stone-700",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "w-full resize-y rounded-lg bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-stone-200 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500 dark:bg-stone-900 dark:ring-stone-700",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-stone-700 dark:text-stone-300">
      {children}
      {hint && <span className="text-xs font-normal text-stone-400">{hint}</span>}
    </span>
  );
}

/** Modal built on the native <dialog> element: focus trap, Esc to close and top layer for free. */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx(
        "m-auto overflow-hidden rounded-2xl bg-white p-0 text-stone-900 shadow-2xl ring-1 ring-stone-200 open:animate-pop dark:bg-stone-900 dark:text-stone-100 dark:ring-stone-800",
        wide ? "max-h-[min(56rem,calc(100dvh-2rem))] w-[min(52rem,calc(100vw-2rem))]" : "max-h-[min(44rem,calc(100dvh-2rem))] w-[min(32rem,calc(100vw-2rem))]",
      )}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <header className="flex items-start gap-3 border-b border-stone-100 px-5 py-4 dark:border-stone-800">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>}
            </div>
            <Button variant="ghost" size="icon" className="-mr-2 -mt-1" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex flex-wrap items-center gap-2 border-t border-stone-100 bg-stone-50/60 px-5 py-3 dark:border-stone-800 dark:bg-stone-950/40">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}

export function Avatar({
  person,
  size = "md",
  ring,
  title,
}: {
  person: Person;
  size?: "sm" | "md";
  ring?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title ?? person.name}
      className={clsx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white",
        size === "sm" ? "size-5 text-[0.625rem]" : "size-7 text-xs",
        ring && "ring-2 ring-white dark:ring-stone-900",
      )}
      style={{ backgroundColor: person.color }}
    >
      {person.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx("inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
      aria-label="Loading"
    />
  );
}
