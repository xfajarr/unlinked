import { loadFont as loadMona } from "@remotion/google-fonts/MonaSans";
import { loadFont as loadFigtree } from "@remotion/google-fonts/Figtree";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const mona = loadMona("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});
const figtree = loadFigtree("normal", {
  weights: ["500", "600", "700"],
  subsets: ["latin"],
});
const mono = loadMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});

export const font = {
  ui: mona.fontFamily,
  num: figtree.fontFamily,
  mono: mono.fontFamily,
};

// Tokens from unlinked-fe/src/index.css
export const c = {
  ground: "#ffffff",
  surface: "#ffffff",
  well: "#eceef3",
  wellStrong: "#e3e6ed",
  ink12: "#0b0d14",
  ink11: "#4b5060",
  ink10: "#737a8c",
  ink9: "#a2a8b6",
  line: "rgba(15, 20, 40, 0.08)",
  blue3: "#eaf0ff",
  blue6: "#b9cbff",
  blue9: "#2563ff",
  blue10: "#1d55e8",
  blue11: "#1b48c9",
  green3: "#e6f7ef",
  green11: "#137a4b",
  amber3: "#fdf1dc",
  amber11: "#8a5a00",
};

export const r = { card: 28, row: 20 };

export const shadow = {
  card: "0 0 0 1px rgba(15, 20, 40, 0.09), 0 24px 60px -24px rgba(15, 30, 80, 0.18)",
  lift: "0 0 0 1px rgba(15, 20, 40, 0.08), 0 40px 90px -30px rgba(15, 30, 80, 0.28)",
};

export const FPS = 30;
