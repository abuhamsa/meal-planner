// The favicon is the header logo (lucide's UtensilsCrossed on a brand-600 tile), redrawn in the
// current theme's colour. public/favicon.svg is the static terracotta copy used before JS runs.

const ICON_PATHS = [
  "m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8",
  "M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7",
  "m2.1 21.8 6.4-6.3",
  "m19 5-7 7",
];

function svg(color: string) {
  const paths = ICON_PATHS.map((d) => `<path d="${d}"/>`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="8" fill="${color}"/>` +
    `<g transform="translate(6 6) scale(0.8333)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>` +
    `</svg>`
  );
}

/** Point the favicon at an SVG drawn in the active theme's brand colour. */
export function updateFavicon() {
  const color = getComputedStyle(document.documentElement).getPropertyValue("--color-brand-600").trim();
  if (!color) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = `data:image/svg+xml,${encodeURIComponent(svg(color))}`;
}
