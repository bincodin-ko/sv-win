// S-360·S-361: <html data-theme="og|light">. system 은 OS 밝기를 따라가며 바뀌면 같이 바뀐다.
export type Theme = "og" | "light" | "system";
let off: (() => void) | null = null;

export function applyTheme(t: Theme): void {
  off?.();
  off = null;
  const root = document.documentElement;
  if (t !== "system") return root.setAttribute("data-theme", t);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => root.setAttribute("data-theme", mq.matches ? "og" : "light");
  sync();
  mq.addEventListener("change", sync);
  off = () => mq.removeEventListener("change", sync);
}
