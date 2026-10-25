import type { Intent, ParseCtx, Target } from "./intent";
import { ROLE_AGENT, roleOf } from "./roles";
import { BUILTIN_CLI, UNAVAILABLE, countOf } from "./words";
import { parseOpen } from "./webCmd";
import { parseKo } from "./parserKo";

// 순수 함수: 네트워크·시계·저장소를 읽지 않고 던지지 않는다(실패 = needsPlanner).
const NP: Intent = { t: "needsPlanner" };
type R = { ok: Target } | { err: Intent };
const ALL: Target = { kind: "all" };

const EXACT: Record<string, Intent> = {
  thanks: { t: "smallTalk" }, "thank you": { t: "smallTalk" }, thx: { t: "smallTalk" }, ty: { t: "smallTalk" },
  hi: { t: "smallTalk" }, hello: { t: "smallTalk" }, hey: { t: "smallTalk" }, ok: { t: "smallTalk" },
  okay: { t: "smallTalk" }, cool: { t: "smallTalk" }, nice: { t: "smallTalk" }, great: { t: "smallTalk" },
  "cancel that": { t: "cancel" }, cancel: { t: "cancel" }, "never mind": { t: "cancel" },
  nevermind: { t: "cancel" }, "scratch that": { t: "cancel" },
  undo: { t: "undo" }, redo: { t: "redo" },
  "tidy up": { t: "tidy" }, tidy: { t: "tidy" }, "arrange the board": { t: "tidy" }, "tidy the board": { t: "tidy" },
  help: { t: "help" }, "what can you do": { t: "help" }, "what can i say": { t: "help" },
  status: { t: "status" }, "how's it going": { t: "status" }, "hows it going": { t: "status" }, "how is it going": { t: "status" },
  "who finished": { t: "whoFinished" }, "who's done": { t: "whoFinished" }, "what happened": { t: "whoFinished" },
  "give me a summary": { t: "whoFinished" },
  "show me everything": { t: "camera", op: "fitAll" }, "show everything": { t: "camera", op: "fitAll" },
  "zoom in": { t: "camera", op: "zoomIn" }, "zoom out": { t: "camera", op: "zoomOut" },
  "reset zoom": { t: "camera", op: "reset" },
  "close that": { t: "closePanel" }, "close this": { t: "closePanel" }, "close it": { t: "closePanel" },
  "close panel": { t: "closePanel" }, "close the panel": { t: "closePanel" },
  "light mode": { t: "theme", value: "light" }, "dark mode": { t: "theme", value: "og" },
  "match system": { t: "theme", value: "system" }, "match macos": { t: "theme", value: "system" },
  "match windows": { t: "theme", value: "system" },
  pause: { t: "pause", target: ALL }, wait: { t: "pause", target: ALL },
  resume: { t: "resume", target: ALL }, continue: { t: "resume", target: ALL }, "keep going": { t: "resume", target: ALL },
  push: { t: "git", op: "push" }, pull: { t: "git", op: "pull" }, commit: { t: "git", op: "commit" },
  eraser: { t: "tool", tool: "eraser" }, "i want to draw": { t: "tool", tool: "pen" },
};

const ALL_WORDS = /^(everyone|everybody|all|everything|all of them|all consoles|all agents)$/i;
const FILLER = /\s+(agents?|consoles?|shells?|terminals?)$/;

export function cliId(word: string, ctx: ParseCtx): string | null {
  for (const w0 of [word.toLowerCase().trim(), word.toLowerCase().trim().replace(/s$/, "")]) {
    const a = ctx.agents.find((x) => x.id.toLowerCase() === w0 || x.name.toLowerCase() === w0 || x.aliases.some((al) => al.toLowerCase() === w0));
    if (a) return a.id;
    if (BUILTIN_CLI[w0]) return BUILTIN_CLI[w0];
  }
  return null;
}

/** "reviewers" / "codex" / "claude code agents" / "claude reviewers" -> {agentId?, role?}; 못 알아들으면 null */
export function kind(rest: string, ctx: ParseCtx): { agentId?: string; role?: string } | null {
  const r = rest.toLowerCase().trim().replace(FILLER, "").trim();
  if (/^(shells?|terminals?)$/.test(rest.toLowerCase().trim())) return { agentId: "shell" }; // S-571: 일반 Shell 을 직접 말한 것
  if (!r || /^(agents?|consoles?)$/.test(r)) return {};
  const role = roleOf(r);
  if (role) return { role };
  const id = cliId(r, ctx);
  if (id) return { agentId: id };
  const sp = r.split(" ");
  for (let i = 1; i < sp.length; i++) {
    const a = sp.slice(0, i).join(" "), b = sp.slice(i).join(" ");
    const c1 = cliId(a, ctx), r1 = roleOf(b);
    if (c1 && r1) return { agentId: c1, role: r1 };
  }
  return null;
}

/** "two codex" -> {n, rest} */
function countRest(s: string, dflt: number): { n: number; rest: string } {
  const m = mt(s.trim(), /^(\S+)\s*(.*)$/);
  const n = m ? countOf(m[1]) : null;
  return n === null || !m ? { n: dflt, rest: s.trim() } : { n, rest: m[2] };
}

function groupBy(x: string, ctx: ParseCtx): R {
  const role = roleOf(x);
  const gs = ctx.groups.filter((g) => g.name.toLowerCase() === x.toLowerCase() || (role !== null && g.role === role));
  if (gs.length === 1) return { ok: { kind: "group", id: gs[0]!.id } };
  if (gs.length > 1) return { err: { t: "ambiguous", name: x, candidates: gs.map((g) => g.id) } };
  return { err: { t: "notFound", name: x } };
}

export function resolveTarget(phrase: string, ctx: ParseCtx): R {
  const p = phrase.trim().replace(/^the\s+/i, "").replace(/\s+please$/i, "");
  const pl = p.toLowerCase();
  if (ALL_WORDS.test(p)) return { ok: ALL };
  const gn = mt(pl, /^group\s+(\d+)$/);
  if (gn) {
    const g = ctx.groups.find((x) => x.name.trim().toLowerCase() === `group ${gn[1]}`) ?? ctx.groups[Number(gn[1]) - 1]; // D2: 화면 이름 먼저
    return g ? { ok: { kind: "group", id: g.id } } : { err: { t: "notFound", name: `group ${gn[1]}` } };
  }
  const gm = mt(p, /^group\s+(.+)$/i) ?? mt(p, /^(.+?)\s+group$/i);
  if (gm) return groupBy(gm[1], ctx);
  const cm = mt(p, /^(.+?)\s+(?:consoles?|lanes?|agents?)$/i);
  const cid = cm ? cliId(cm[1], ctx) : null;
  if (cid) return { ok: { kind: "cli", agentId: cid } };
  const cs = ctx.consoles.filter((c) => c.name.toLowerCase() === pl);
  if (cs.length === 1) return { ok: { kind: "console", id: cs[0]!.id } };
  if (cs.length > 1) return { err: { t: "ambiguous", name: p, candidates: cs.map((c) => c.id) } };
  const g = groupBy(p, ctx);
  if ("ok" in g || g.err.t === "ambiguous") return g;
  const id = cliId(p, ctx);
  if (id) return { ok: { kind: "cli", agentId: id } };
  return { err: { t: "notFound", name: p } };
}

export function wsRef(x: string, ctx: ParseCtx): { ok: string } | { err: Intent } {
  const p = x.trim().replace(/^the\s+/i, "").replace(/\s+workspace$/i, "");
  if (/^\d+$/.test(p)) {
    const w = ctx.workspaces[Number(p) - 1];
    return w ? { ok: w.id } : { err: { t: "notFound", name: `workspace ${p}` } };
  }
  const ws = ctx.workspaces.filter((w) => w.name.toLowerCase() === p.toLowerCase());
  if (ws.length === 1) return { ok: ws[0]!.id };
  if (ws.length > 1) return { err: { t: "ambiguous", name: p, candidates: ws.map((w) => w.id) } };
  return { err: { t: "notFound", name: p } };
}

/** match 결과를 4칸 문자열 튜플로(빈 칸 = "") */
const mt = (s: string, re: RegExp): [string, string, string, string] | null => {
  const m = s.match(re);
  return m ? [m[0], m[1] ?? "", m[2] ?? "", m[3] ?? ""] : null;
};
const wrap = (r: R, f: (t: Target) => Intent): Intent => ("ok" in r ? f(r.ok) : r.err);
const opt = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ---- D15 (S-1730~S-1738): 패널 열기·orchestrator·loop·handoff·forward 말 ----
const PANELS: Record<string, "mission" | "memory" | "loops" | "usage" | "conversations"> = { conversations: "conversations", "all conversations": "conversations", "mission map": "mission", mission: "mission", memory: "memory", loops: "loops", loop: "loops", usage: "usage" };
const HAND = [
  /^hand\s+(?:(?:this|it|that|the task)\s+)?off\s+to\s+(.+)$/i,
  /^(?:pass|hand|send|move)\s+(?:this task|this|it|that|the task)\s+(?:over\s+)?to\s+(.+)$/i,
];
const FWD = /^(?:when|once|after)\s+(.+?)\s+(?:finish(?:es|ed)?|(?:is|are)\s+(?:done|finished))\s*,?\s*(?:then\s+)?(?:pass|send|forward|hand|give|move)\s+(?:it|them|everything|all of it|the results?|the output)\s+(?:over\s+)?to\s+(.+)$/i;
const EVERY = /^every\s+(?:(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+)?(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)\b[\s,:]*(.*)$/i;

/** "Otto and Mia" / "group 1" -> 대상 목록 (통째로 먼저, 안 되면 쉼표·and 로 쪼갠다) */
function targetList(phrase: string, ctx: ParseCtx): { ok: Target[] } | { err: Intent } {
  const whole = resolveTarget(phrase, ctx);
  if ("ok" in whole) return { ok: [whole.ok] };
  const parts = phrase.split(/\s*(?:,|\band\b)\s*/i).filter(Boolean);
  if (parts.length < 2) return { err: whole.err };
  const ok: Target[] = [];
  for (const p of parts) {
    const r = resolveTarget(p, ctx);
    if ("err" in r) return r;
    ok.push(r.ok);
  }
  return { ok };
}

/** D3: `@` 뒤를 문맥의 콘솔·그룹 이름(공백 포함, 긴 것부터)과 먼저 맞추고, 없으면 기존 한 토큰 */
export function mentionRe(ctx: ParseCtx): RegExp {
  const esc = (x: string) => x.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const names = [...ctx.consoles, ...ctx.groups].map((x) => x.name).filter((n) => n.trim()).sort((a, b) => b.length - a.length).map(esc);
  return new RegExp(`(^|\\s)@(${[...names, "[^\\s@,:;]+"].join("|")})(?=$|[\\s,:;.!?])`, "gi");
}

function handoffOf(s: string, ctx: ParseCtx): Intent | null {
  const mre = mentionRe(ctx);
  const bare = s.replace(mre, " ").replace(/\s+/g, " ").trim();
  for (const re of HAND) {
    const m = mt(bare, re);
    if (!m) continue;
    const dest = m[1].trim().replace(/^the\s+/i, "").replace(FILLER, "");
    const agentId = cliId(dest, ctx) ?? dest.toLowerCase();
    const first = [...s.matchAll(mre)][0]?.[2];
    if (!first) return { t: "handoff", agentId };
    const r = resolveTarget(first, ctx);
    if ("err" in r) return r.err;
    return r.ok.kind === "console" ? { t: "handoff", agentId, from: r.ok.id } : { t: "notFound", name: first };
  }
  return null;
}

export function loopOf(m: [string, string, string, string]): Intent {
  const unit = m[2].toLowerCase();
  const n = !m[1] ? 1 : /^\d+$/.test(m[1]) ? Number(m[1]) : countOf(m[1]) ?? 1;
  const minutes = /^(min|hour|hr)/.test(unit) ? (unit.startsWith("m") ? n : n * 60) : 0; // 초·일·주는 0 = 범위 밖
  if (minutes < 1 || minutes > 1440) return { t: "loop", bad: "range" };
  return m[3].trim() ? { t: "loop", minutes, text: m[3].trim() } : { t: "loop", bad: "empty" };
}

function run(text: string, ctx: ParseCtx): Intent {
  const s = text.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().replace(/[\s.!?,;:]+$/, "");
  if (!s) return NP;
  const l = s.toLowerCase();
  if (EXACT[l]) return EXACT[l];
  if (/[가-힣]/.test(s)) { const k = parseKo(s, ctx); if (k) return k; } // K8 S-2490: 한글이 있는 입력만

  const ho = handoffOf(s, ctx); // "hand off @Otto to codex" 는 멘션 처리보다 먼저
  if (ho) return ho;

  // @멘션 (글 어디에 있든 글자는 지우고 나머지는 그대로)
  const mre = mentionRe(ctx);
  const names = [...s.matchAll(mre)].map((m) => m[2] ?? "");
  if (names.length) {
    const targets: Target[] = [];
    for (const n of names) {
      const r = resolveTarget(n, ctx);
      if ("err" in r) return r.err;
      if (!targets.some((t) => JSON.stringify(t) === JSON.stringify(r.ok))) targets.push(r.ok);
    }
    const body = s.replace(mre, " ").replace(/\s+/g, " ").trim().replace(/^[,:\s]+/, "");
    return { t: "tell", targets, text: body };
  }

  let m: ReturnType<typeof mt>;

  // H2 S-2821: 맨말 conversations / all conversations 도 연다
  if (PANELS[s.toLowerCase()] === "conversations") return { t: "open", what: "conversations" };
  // 화면 열기
  if ((m = mt(s, /^open\s+(.+)$/i))) {
    const w = m[1].toLowerCase();
    if (w === "settings" || w === "preferences") return { t: "open", what: "settings" };
    if (w === "presets") return { t: "open", what: "presets" };
    if (PANELS[w]) return { t: "open", what: PANELS[w] };
    if (w === "documents" || w === "code" || w === "markdown" || w === "skills") return { t: "open", what: w }; // S-1807 스튜디오
    if (UNAVAILABLE.includes(w)) return { t: "unavailable", what: w };
    const web = parseOpen(m[1]);
    if (web) return "url" in web ? { t: "openWeb", url: web.url } : { t: "openWeb", url: m[1], bad: true };
    return NP;
  }

  // 워크스페이스 (일반 go to / close 보다 먼저)
  if ((m = mt(s, /^(?:go|switch) to workspace\s+(.+)$/i))) {
    const r = wsRef(m[1], ctx);
    return "ok" in r ? { t: "workspace", op: "go", ref: r.ok } : r.err;
  }
  if ((m = mt(s, /^(?:new|create|add|make)\s+(?:a\s+)?workspace(?:\s+(?:called|named)\s+(.+))?$/i)))
    return opt({ t: "workspace", op: "new", name: m[1] || undefined });
  if ((m = mt(s, /^rename\s+(?:this|the current|current)\s+workspace\s+to\s+(.+)$/i)))
    return { t: "workspace", op: "rename", name: m[1] };
  if ((m = mt(s, /^rename\s+workspace\s+(.+?)\s+to\s+(.+)$/i))) {
    const r = wsRef(m[1], ctx);
    return "ok" in r ? { t: "workspace", op: "rename", ref: r.ok, name: m[2] } : r.err;
  }
  if ((m = mt(s, /^close\s+workspace\s+(.+)$/i))) {
    const r = wsRef(m[1], ctx);
    return "ok" in r ? { t: "workspace", op: "close", ref: r.ok } : r.err;
  }

  // 카메라
  if ((m = mt(s, /^show me (?:the\s+)?(.+?)\s+(?:lanes?|consoles?)$/i))) {
    const id = cliId(m[1], ctx);
    return id ? { t: "camera", op: "cliLanes", target: { kind: "cli", agentId: id } } : { t: "notFound", name: m[1] };
  }
  if ((m = mt(s, /^go to\s+(.+)$/i))) return wrap(resolveTarget(m[1], ctx), (target) => ({ t: "camera", op: "goto", target }));
  if ((m = mt(s, /^focus(?:\s+on)?\s+(.+)$/i)))
    return wrap(resolveTarget(m[1], ctx), (target) => ({ t: "camera", op: target.kind === "group" ? "focusGroup" : "goto", target }));

  // D15: loop · orchestrator · forward
  if ((m = mt(s, EVERY))) return loopOf(m);
  if ((m = mt(s, FWD))) {
    const they = /^(?:they|them)$/i.test(m[1].trim());
    const src = they ? { ok: [] as Target[] } : targetList(m[1], ctx);
    if ("err" in src) return src.err;
    const ev = mt(m[2], /^(.*?)\s*\bto\s+(?:everyone|everybody|each of them|all of them)$/i);
    const dests = ev ? ev[1] : m[2];
    if (!dests.trim()) return NP;
    const d = targetList(dests, ctx);
    if ("err" in d) return d.err;
    return opt({ t: "forward", sources: src.ok, they: they || undefined, dests: d.ok, everyone: ev ? true : undefined });
  }
  if ((m = mt(s, /^add\s+an?\s+orchestrator(?:\s+for\s+(.+?))?(?:\s+(?:called|named)\s+(.+))?$/i))) {
    if (!m[1]) return opt({ t: "addOrchestrator", name: m[2] || undefined });
    const r = resolveTarget(m[1], ctx);
    if ("err" in r) return r.err;
    return r.ok.kind === "group" ? opt({ t: "addOrchestrator", groupId: r.ok.id, name: m[2] || undefined }) : { t: "notFound", name: m[1] };
  }
  if ((m = mt(s, /^(?:connect|wire|link)\s+(.+?)\s+to\s+(?:the\s+|an?\s+)?(?:orchestrator(?:\s+(\S.*))?|(.+?)\s+orchestrator)$/i))) {
    const r = resolveTarget(m[1], ctx);
    if ("err" in r) return r.err;
    return r.ok.kind === "group" || r.ok.kind === "console" ? opt({ t: "connect", target: r.ok, card: m[2] || m[3] || undefined }) : { t: "notFound", name: m[1] };
  }
  // 뒤 묶음 기능
  // S-1063: commit and push [with the message X] / commit [with the message X | : X]
  if ((m = mt(s, /^commit\s+and\s+push(?:(?:\s+with\s+(?:the\s+)?message\s+|\s*:\s*)(.+))?$/i))) return opt({ t: "git", op: "commitPush", message: m[1] || undefined });
  if ((m = mt(s, /^commit(?:\s+with\s+(?:the\s+)?message\s+|\s*:\s*)(.+)$/i))) return { t: "git", op: "commit", message: m[1] };
  if (/^git\b/i.test(s) || /^commit\b/i.test(s)) return { t: "later", kind: "git" };
  // S-1064·S-1065: add a note|sticky [that says X | : X] / kanban / calendar / checklist|todo / browser. 그 밖(orchestrator·timer)은 later
  if ((m = mt(s, /^add\s+an?\s+(?:note|sticky)(?:\s+(?:that\s+says|which\s+says|saying|says)\s+|\s*:\s*)(.+)$/i))) return { t: "add", what: "note", text: m[1] };
  if ((m = mt(s, /^add\s+an?\s+(note|sticky|kanban|calendar|checklist|todo|browser)$/i)))
    return { t: "add", what: m[1].toLowerCase() === "sticky" ? "note" : m[1].toLowerCase() === "todo" ? "checklist" : (m[1].toLowerCase() as "note") };
  if (/^add\s+an?\s+(?:note|kanban|calendar|browser|timer|todo|sticky|checklist)\b/i.test(s) && !/^add\s+an?\s+\S+\s+to\s+(?:group|the)/i.test(s))
    return { t: "later", kind: "add" };

  // 시작 / 그룹
  if ((m = mt(s, /^(?:make|create|build|start|spawn)\s+(?:me\s+)?a\s+group(?:\s+of)?(?:\s+(.+))?$/i))) {
    const { n, rest } = countRest(m[1] ?? "", 3);
    const k = kind(rest, ctx);
    if (!k) return NP;
    const agentId = k.agentId ?? (k.role ? ROLE_AGENT[k.role as keyof typeof ROLE_AGENT] ?? undefined : undefined);
    return opt({ t: "makeGroup", n, agentId });
  }
  if ((m = mt(s, /^(?:spawn|spin up|start|launch)\s+(.+)$/i))) {
    const { n, rest } = countRest(m[1], 1);
    const k = kind(rest, ctx);
    if (!k) return NP;
    const agentId = k.agentId ?? (k.role ? ROLE_AGENT[k.role as keyof typeof ROLE_AGENT] ?? undefined : undefined);
    return opt({ t: "spawn", n, agentId, role: k.role });
  }
  if ((m = mt(s, /^add\s+(.+?)\s+to\s+(.+)$/i))) {
    const { n, rest } = countRest(m[1], 1);
    const k = kind(rest, ctx);
    if (k) {
      const r = resolveTarget(m[2], ctx);
      if ("err" in r) return r.err;
      if (r.ok.kind !== "group") return { t: "notFound", name: m[2] };
      return opt({ t: "addToGroup", n, groupId: r.ok.id, agentId: k.agentId });
    }
  }

  // 멈춤 / 재개 / 다시 시작 / 닫기
  if ((m = mt(s, /^(pause|wait|hold|resume|continue|unpause)\s+(.+)$/i))) {
    if (/^for\b/i.test(m[2])) return NP;
    const t = /^(pause|wait|hold)$/i.test(m[1]) ? "pause" : "resume";
    return wrap(resolveTarget(m[2], ctx), (target) => ({ t, target }));
  }
  if ((m = mt(s, /^(restart|reset|reboot|relaunch)\s+(.+)$/i))) return wrap(resolveTarget(m[2], ctx), (target) => ({ t: "restart", target }));
  if ((m = mt(s, /^(?:kill|delete|remove|close|quit|terminate)\s+(.+)$/i))) return wrap(resolveTarget(m[1], ctx), (target) => ({ t: "close", target }));

  // 일 주기
  if ((m = mt(s, /^tell\s+the\s+board\b\s*(?:to\s+|[:,]\s*)?(.*)$/i))) return m[1] ? { t: "orderUnrouted", text: m[1] } : NP;
  if (
    (m = mt(s, /^(?:give|send|tell)\s+(?:everyone|everybody|all(?:\s+of\s+them)?|every\s+console)\s+(?:the\s+)?(?:same|identical)\s+(?:prompt|text|message|task|order)s?\s*[:\-,]?\s*(.+)$/i)) ||
    (m = mt(s, /^(?:broadcast(?:\s*[:\-,]\s*|\s+)|everyone\s*:|all\s*:)\s*(.+)$/i)) || // S-2687
    (m = mt(s, /^(?:same|identical)\s+(?:prompt|text|message|task|order)s?(?:\s+(?:for|to)\s+(?:everyone|all))?\s*[:\-,]\s*(.+)$/i))
  )
    return { t: "broadcast", text: m[1] };
  if ((m = mt(s, /^tell\s+(.+?)\s+to\s+(.+)$/i))) return wrap(resolveTarget(m[1], ctx), (t) => ({ t: "tell", targets: [t], text: m![2] }));
  if ((m = mt(s, /^(.+?),\s+(.+)$/))) {
    const r = resolveTarget(m[1], ctx);
    if ("ok" in r) return { t: "tell", targets: [r.ok], text: m[2] };
    if (r.err.t === "ambiguous") return r.err;
  }
  // ponytail: 동사 목록 휴리스틱 — 목록 밖 문장은 needsPlanner, 모자라면 동사를 더한다
  if (ctx.planner && /\b(?:spawn|open|make|create|launch|start|add|set\s*up)\b.*\b(?:claude|codex|gemini|console|terminal|agent|session|window|tab)\b/i.test(s)) return NP; // 최종 확인 8번: 콘솔을 만드는 말을 못 읽었으면 콘솔로 보내지 않는다
  if (/^(run|write|review|fix|test|check|implement|refactor|update|debug|investigate|summarize|explain|read|build|deploy|lint|document)\b.+/i.test(s))
    return { t: "orderUnrouted", text: s };
  return NP;
}

export function parse(text: string, ctx: ParseCtx): Intent {
  try {
    return run(text, ctx);
  } catch {
    return NP;
  }
}
