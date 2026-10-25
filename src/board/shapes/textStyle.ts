import { tm } from "../../i18n";
// S-824·S-845: 글꼴 8개·크기 4개 (Windows 기본 설치 글꼴, 추측). 도형 안 글과 인스펙터 Text 절이 같이 쓴다
export const FONTS = [
  { id: "sketch", label: tm("Sketch"), stack: '"Segoe Print", cursive' },
  { id: "clean", label: tm("Clean"), stack: '"Segoe UI", system-ui, sans-serif' },
  { id: "serif", label: tm("Serif"), stack: "Georgia, serif" },
  { id: "rounded", label: tm("Rounded"), stack: '"Arial Rounded MT Bold", "Segoe UI", sans-serif' },
  { id: "mono", label: tm("Mono"), stack: '"Cascadia Mono", monospace' },
  { id: "typewriter", label: tm("Typewriter"), stack: '"Courier New", monospace' },
  { id: "marker", label: tm("Marker"), stack: '"Ink Free", cursive' },
  { id: "script", label: tm("Script"), stack: '"Segoe Script", cursive' },
] as const;
export const SIZES = { S: 16, M: 24, L: 36, XL: 52 } as const;
export const fontStack = (id: unknown): string => FONTS.find((f) => f.id === id)?.stack ?? FONTS[1].stack;
export const sizePx = (s: unknown): number => SIZES[s as keyof typeof SIZES] ?? SIZES.M;
