// S-2913: intent 표 하나. 프라이머(prompt.ts)와 검증기(schema.ts)가 둘 다 여기서 나온다.
import type { Intent } from "../commandbar/intent";

export type Risk = "run" | "confirm";
export type Field =
  | { k: "count" | "minutes" | "text" | "name" | "label" | "message" | "agent" | "role" | "target" | "targets" | "group" | "ws" | "url"; req?: boolean }
  | { k: "enum"; values: readonly string[]; req?: boolean };
export type Entry = { fields: Record<string, Field>; risk: Risk };

export const OPEN_WHAT = ["settings", "presets", "mission", "memory", "loops", "usage", "documents", "code", "markdown", "skills", "conversations"] as const;
// Intent의 open.what 값과 양방향으로 같아야 컴파일된다
type OpenWhat = Extract<Intent, { t: "open" }>["what"];
const _openSame: OpenWhat extends (typeof OPEN_WHAT)[number] ? true : never = true;
void _openSame;

const e = (values: readonly string[]): Field => ({ k: "enum", values, req: true });
const f = (k: Exclude<Field["k"], "enum">, req = false): Field => ({ k, req });
const run = (fields: Record<string, Field> = {}): Entry => ({ fields, risk: "run" });
const confirm = (fields: Record<string, Field>): Entry => ({ fields, risk: "confirm" });
const target = { target: f("target", true) };

const TABLE = {
  spawn: run({ n: f("count"), agent: f("agent"), role: f("role"), name: f("label") }),
  makeGroup: run({ n: f("count"), agent: f("agent") }),
  addToGroup: run({ n: f("count"), group: f("group", true), agent: f("agent") }),
  pause: run(target),
  resume: run(target),
  restart: run(target),
  close: run(target),
  tell: confirm({ targets: f("targets", true), text: f("text", true) }),
  broadcast: confirm({ text: f("text", true) }),
  camera: run({ op: e(["fitAll", "zoomIn", "zoomOut", "reset", "goto", "focusGroup", "cliLanes"]), target: f("target") }),
  open: run({ what: e(OPEN_WHAT) }),
  tidy: run(),
  undo: run(),
  redo: run(),
  theme: run({ value: e(["og", "light", "system"]) }),
  workspace: run({ op: e(["go", "new", "rename", "close"]), ref: f("ws"), name: f("name") }),
  git: confirm({ op: e(["commitPush", "push", "pull", "commit"]), message: f("message") }),
  add: run({ what: e(["note", "kanban", "calendar", "checklist", "browser"]), text: f("text") }),
  openWeb: run({ url: f("url", true) }),
  tool: run({ tool: e(["pen", "eraser"]) }),
  status: run(),
  whoFinished: run(),
  help: run(),
  closePanel: run(),
  loop: run({ minutes: f("minutes", true), text: f("text", true) }),
} satisfies Partial<Record<Intent["t"], Entry>>;

export const INTENT_TABLE: Record<string, Entry> = TABLE;
