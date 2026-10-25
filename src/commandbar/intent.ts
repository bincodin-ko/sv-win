// B10 계약: B12가 이 모양을 그대로 받는다.
export type ParseCtx = {
  consoles: { id: string; name: string; agentId: string | null; groupId?: string }[];
  groups: { id: string; name: string; role: string }[];
  workspaces: { id: string; name: string }[];
  agents: { id: string; name: string; aliases: string[] }[];
  /** planner 가 켜져 있나 — 켜져 있으면 못 읽은 생성 문장을 콘솔로 보내지 않고 planner 로 */
  planner?: boolean;
};

export type Target =
  | { kind: "all" }
  | { kind: "console"; id: string }
  | { kind: "group"; id: string }
  | { kind: "cli"; agentId: string };

export type Intent =
  | { t: "spawn"; n: number; agentId?: string; role?: string; name?: string }
  | { t: "makeGroup"; n: number; agentId?: string }
  | { t: "addToGroup"; n: number; groupId: string; agentId?: string }
  | { t: "pause" | "resume"; target: Target }
  | { t: "restart" | "close"; target: Target }
  | { t: "tell"; targets: Target[]; text: string }
  | { t: "orderUnrouted"; text: string }
  | { t: "broadcast"; text: string }
  | { t: "cancel" }
  | { t: "status" }
  | { t: "whoFinished" }
  | { t: "help" }
  | { t: "camera"; op: "fitAll" | "zoomIn" | "zoomOut" | "reset" | "goto" | "focusGroup" | "cliLanes"; target?: Target }
  | { t: "open"; what: "settings" | "presets" | "mission" | "memory" | "loops" | "usage" | "documents" | "code" | "markdown" | "skills" | "conversations" }
  | { t: "addOrchestrator"; groupId?: string; name?: string }
  | { t: "connect"; target: Target; card?: string }
  | { t: "loop"; minutes?: number; text?: string; bad?: "range" | "empty" }
  | { t: "handoff"; agentId: string; from?: string }
  | { t: "forward"; sources: Target[]; they?: boolean; dests: Target[]; everyone?: boolean }
  | { t: "unavailable"; what: string }
  | { t: "closePanel" }
  | { t: "theme"; value: "og" | "light" | "system" }
  | { t: "tidy" }
| { t: "undo" }
  | { t: "redo" }
  | { t: "workspace"; op: "go" | "new" | "rename" | "close"; ref?: string; name?: string }
  | { t: "git"; op: "commitPush" | "push" | "pull" | "commit"; message?: string }
  | { t: "add"; what: "note" | "kanban" | "calendar" | "checklist" | "browser"; text?: string }
  | { t: "openWeb"; url: string; bad?: boolean }
  | { t: "tool"; tool: "pen" | "eraser" }
  | { t: "later"; kind: "git" | "add" | "draw" }
  | { t: "smallTalk" }
  | { t: "needsPlanner" }
  | { t: "notFound"; name: string }
  | { t: "ambiguous"; name: string; candidates: string[] };
