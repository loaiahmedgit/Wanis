import opentype from "opentype.js";

export type HandWeight = "regular" | "bold";

let regularFont: opentype.Font | null = null;
let boldFont: opentype.Font | null = null;
let loadingPromise: Promise<void> | null = null;

// The bundled opentype.js build stubs out load()/loadSync() (they just log a
// deprecation notice and return undefined — they never fetch anything), so
// fonts must be fetched manually and parsed via opentype.parse().
async function fetchFont(url: string): Promise<opentype.Font> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch font ${url}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return opentype.parse(buffer);
}

/** Loads the real glyph-outline fonts once so lines can be traced as strokes, not typed as text. */
export function loadHandFonts(): Promise<void> {
  if (!loadingPromise) {
    loadingPromise = Promise.all([fetchFont("/fonts/Kalam-Regular.ttf"), fetchFont("/fonts/Kalam-Bold.ttf")]).then(
      ([reg, bold]) => {
        regularFont = reg;
        boldFont = bold;
      },
    );
  }
  return loadingPromise;
}

export function getHandFont(weight: HandWeight): opentype.Font | null {
  return weight === "bold" ? boldFont : regularFont;
}
