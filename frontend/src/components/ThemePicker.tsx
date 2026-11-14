import clsx from "clsx";
import { Check, Palette } from "lucide-react";
import { useState } from "react";
import { getTheme, setTheme, THEMES, type ThemeId } from "../lib/theme";
import { Button, Dialog } from "./ui";

/** Header button that opens a dialog of colour themes. Picking one applies it straight away. */
export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<ThemeId>(getTheme);

  const pick = (id: ThemeId) => {
    setTheme(id);
    setCurrent(id);
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Colour theme" title="Colour theme">
        <Palette className="size-4" />
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Colour theme"
        subtitle="Saved on this device only."
        footer={
          <Button variant="primary" className="ml-auto" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEMES.map((t) => (
            // data-theme on the swatch makes it render in its own theme's colours.
            <button
              key={t.id}
              type="button"
              data-theme={t.id}
              onClick={() => pick(t.id)}
              aria-pressed={current === t.id}
              className={clsx(
                "relative cursor-pointer overflow-hidden rounded-xl bg-stone-50 p-3 text-left ring-1 transition dark:bg-stone-950",
                current === t.id ? "ring-2 ring-brand-500" : "ring-stone-200 hover:ring-brand-300 dark:ring-stone-800",
              )}
            >
              <div className="flex gap-1.5">
                <span className="size-6 rounded-full bg-brand-600" />
                <span className="size-6 rounded-full bg-brand-200 dark:bg-brand-900" />
                <span className="size-6 rounded-full bg-stone-200 dark:bg-stone-800" />
              </div>
              <div className="mt-3 rounded-lg bg-white px-2 py-1.5 text-sm font-medium text-stone-900 shadow-sm dark:bg-stone-900 dark:text-stone-100">
                {t.label}
                <div className="text-xs font-normal text-stone-500 dark:text-stone-400">{t.hint}</div>
              </div>
              {current === t.id && (
                <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-brand-600 text-white">
                  <Check className="size-3" />
                </span>
              )}
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}
