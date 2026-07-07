/**
 * MapLibre's paint properties are parsed by an internal CSS-color parser
 * that does NOT understand `oklch()` (the format every semantic token in
 * globals.css is authored in) — only hex/rgb/hsl/named colors. So reading a
 * token straight out of `getComputedStyle` and handing it to a `fill-color`
 * paint property silently fails. This module reads the token (oklch string)
 * and converts it to an `rgb()` string MapLibre can actually render, using
 * the standard OKLCH -> OKLab -> linear sRGB -> sRGB pipeline (Björn
 * Ottosson's published matrices).
 */

const OKLCH_RE = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function linearToSrgb(value: number): number {
  const v = clamp01(value);
  const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(clamp01(encoded) * 255);
}

/** Converts an `oklch(L C H)` string to `rgb(r, g, b)`. Returns null if the
 * input isn't in that format (e.g. a token that's already a hex color). */
export function oklchToRgbString(oklch: string): string | null {
  const match = OKLCH_RE.exec(oklch.trim());
  if (!match) return null;
  const L = Number(match[1]);
  const C = Number(match[2]);
  const hRad = (Number(match[3]) * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return `rgb(${linearToSrgb(r)}, ${linearToSrgb(g)}, ${linearToSrgb(bl)})`;
}

let colorCtx: CanvasRenderingContext2D | null = null;
const colorCache = new Map<string, string>();

/** Lets the browser itself normalize ANY css color (oklch, lab, color(),
 * hex, named…) to the `#rrggbb`/`rgba()` form a canvas serializes — which
 * MapLibre parses. Tailwind v4 registers theme variables as typed colors,
 * so `getComputedStyle` can return them canonicalized in whatever space the
 * engine prefers (Chromium serializes as `lab(...)`); a hand-rolled oklch
 * parser alone misses those. The double-baseline write detects invalid
 * input (an invalid color leaves the previous fillStyle untouched). */
function normalizeViaCanvas(raw: string): string | null {
  try {
    // Serialization-based tricks (reading fillStyle back) fail here: since
    // the CSS Color 4 spec change, Chromium serializes non-sRGB fillStyles
    // in their own space (`lab(...)`), which MapLibre can't parse either.
    // Painting one pixel and reading the bytes is representation-proof.
    if (typeof CSS !== "undefined" && !CSS.supports("color", raw)) return null;
    if (!colorCtx) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      colorCtx = canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!colorCtx) return null;
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = raw;
    colorCtx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return null;
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return null;
  }
}

/** Reads a CSS custom property off `<html>` and converts it to a color
 * MapLibre can paint with. Falls back to `fallback` on the server (no
 * `window`), when the variable is unset, or when it doesn't parse.
 * MAP-PAINT ONLY: for DOM styling use `var(--token)` directly so server
 * and client render identical markup (hydration safety). */
export function readColorToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!raw) return fallback;
  const cached = colorCache.get(raw);
  if (cached) return cached;
  const normalized = normalizeViaCanvas(raw) ?? oklchToRgbString(raw) ?? raw;
  colorCache.set(raw, normalized);
  return normalized;
}

/** Stable 6-color categorical palette for crop/stage choropleth layers.
 * Map-data colors are exempt from the semantic-token rule (per the design
 * system's crop legend), so these are plain literal colors, not tokens. */
export const CATEGORICAL_PALETTE = [
  "#2f9e6e",
  "#c2559c",
  "#e0912b",
  "#3f7fbf",
  "#8a5fc7",
  "#3fa0a0",
] as const;

/** Deterministic name -> color assignment: sort unique names, cycle through
 * the palette. Stable across renders as long as the input name set doesn't
 * change (new/renamed crops or stages may shift assignments, which is
 * acceptable for a categorical legend). */
export function assignCategoricalColors(
  names: readonly string[],
): Map<string, string> {
  const unique = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  return new Map(
    unique.map((name, i) => [name, CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]]),
  );
}
