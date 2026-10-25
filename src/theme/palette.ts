// S-361/S-411: xterm 팔레트(OG/Light). OG 는 xterm 기본 ANSI 색(지금 보이는 값) + 보드 바탕.
export type Mode = "og" | "light";
export const TERM_KEYS = ["background", "foreground", "cursor", "selectionBackground", "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"] as const;
export type TermTheme = Record<(typeof TERM_KEYS)[number], string>;

const OG: TermTheme = {
  background: "#000000", foreground: "#ffffff", cursor: "#ffffff", selectionBackground: "rgba(255, 255, 255, 0.3)",
  black: "#2e3436", red: "#cc0000", green: "#4e9a06", yellow: "#c4a000", blue: "#3465a4", magenta: "#75507b", cyan: "#06989a", white: "#d3d7cf",
  brightBlack: "#555753", brightRed: "#ef2929", brightGreen: "#8ae234", brightYellow: "#fce94f", brightBlue: "#729fcf", brightMagenta: "#ad7fa8", brightCyan: "#34e2e2", brightWhite: "#eeeeec",
};
const LIGHT: TermTheme = {
  background: "#fffdf8", foreground: "#1d1b16", cursor: "#1d1b16", selectionBackground: "rgba(194, 65, 12, 0.25)",
  black: "#1d1b16", red: "#b91c1c", green: "#15803d", yellow: "#8a5a00", blue: "#1d4ed8", magenta: "#86198f", cyan: "#0e7490", white: "#6f6a5e",
  brightBlack: "#4a463b", brightRed: "#dc2626", brightGreen: "#16a34a", brightYellow: "#a16207", brightBlue: "#2563eb", brightMagenta: "#a21caf", brightCyan: "#0891b2", brightWhite: "#3a362d",
};
export const termTheme = (m: Mode): TermTheme => (m === "light" ? LIGHT : OG);
