// Colour themes. The choice is per device (kept in localStorage), so everyone in the household can
// pick their own. index.html applies the stored theme before the first paint to avoid a flash.

export const THEMES = [
  { id: "terracotta", label: "Terracotta", hint: "The original" },
  { id: "blossom", label: "Blossom", hint: "Pastel pink" },
  { id: "lavender", label: "Lavender", hint: "Pastel purple" },
  { id: "mint", label: "Mint", hint: "Pastel green" },
  { id: "sky", label: "Sky", hint: "Pastel blue" },
  { id: "peach", label: "Peach", hint: "Pastel orange" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const KEY = "theme";
const DEFAULT: ThemeId = "terracotta";

const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

export function getTheme(): ThemeId {
  const current = document.documentElement.dataset.theme;
  return isTheme(current) ? current : DEFAULT;
}

export function setTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage can be blocked (private mode); the theme still applies for this visit.
  }
}
