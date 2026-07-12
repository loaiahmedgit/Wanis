import opentype from "opentype.js";

export type HandWeight = "regular" | "bold";

let regularFont: opentype.Font | null = null;
let boldFont: opentype.Font | null = null;
let loadingPromise: Promise<void> | null = null;

/** Loads the real glyph-outline fonts once so lines can be traced as strokes, not typed as text. */
export function loadHandFonts(): Promise<void> {
  if (!loadingPromise) {
    loadingPromise = Promise.all([
      opentype.load("/fonts/Kalam-Regular.ttf"),
      opentype.load("/fonts/Kalam-Bold.ttf"),
    ]).then(([reg, bold]) => {
      regularFont = reg;
      boldFont = bold;
    });
  }
  return loadingPromise;
}

export function getHandFont(weight: HandWeight): opentype.Font | null {
  return weight === "bold" ? boldFont : regularFont;
}
