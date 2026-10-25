import { tm } from "../i18n";
// S-364~S-366: 보드 한 글자 키 표(순수). 설정 `keymap` 에는 기본과 다른 것만 담는다.
export type Action = "select" | "spawn" | "needsYou" | "pen" | "eraser" | "git" | "memory" | "loops" | "skills" | "markdown";
export type Keymap = Record<string, string>;
export type Rebind = { ok: true; map: Keymap } | { ok: false; reason: { kind: "conflict" | "fixed" | "reserved"; with?: string } };

export const DEFAULT_KEYMAP: Record<Action, string> = { select: "v", spawn: "t", needsYou: "n", pen: "p", eraser: "e", git: "g", memory: "m", loops: "l", skills: "s", markdown: "d" };
export const ACTION_LABEL: Record<Action, string> = { select: tm("Select"), spawn: tm("Spawn agent"), needsYou: tm("Jump to the console that needs you"), pen: tm("Pen"), eraser: tm("Eraser"), git: tm("Git panel"), memory: tm("Memory"), loops: tm("Loops"), skills: tm("Skills"), markdown: tm("Markdown") };
// 뒤 묶음이 줄을 더할 기본 키: 지금 다른 동작이 가져가지 못하게 비워 둔다(X 는 못 바꿈). 5묶음 E1 이 s·d 를 Skills·Markdown 줄로 올렸다
const LATER: Record<string, string> = {};

export function keyFor(map: Keymap | undefined, action: Action): string {
  return map?.[action] || DEFAULT_KEYMAP[action];
}

/** key = KeyboardEvent.key (Ctrl/Alt/Shift 와 같이 눌렸으면 "Ctrl+b" 꼴). Escape = 유지, Delete = 기본값 복원 */
export function rebind(map: Keymap, action: Action, key: string): Rebind {
  if (key === "Escape") return { ok: true, map };
  if (key === "Delete") {
    const { [action]: _, ...rest } = map;
    return { ok: true, map: rest };
  }
  if (key.length !== 1 || key === " " || key === "!") return { ok: false, reason: { kind: "fixed" } }; // 이름 있는 키·조합·Space·Shift+1
  const k = key.toLowerCase();
  if (k === "x") return { ok: false, reason: { kind: "reserved", with: "X" } };
  const other = (Object.keys(DEFAULT_KEYMAP) as Action[]).find((a) => a !== action && keyFor(map, a) === k);
  if (other) return { ok: false, reason: { kind: "conflict", with: ACTION_LABEL[other] } };
  if (LATER[k]) return { ok: false, reason: { kind: "conflict", with: LATER[k] } };
  const { [action]: _, ...rest } = map;
  return { ok: true, map: k === DEFAULT_KEYMAP[action] ? rest : { ...rest, [action]: k } };
}
