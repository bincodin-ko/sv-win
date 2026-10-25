// S-600: Intent -> 동작 표. execute 를 setExecutor 로 B9 연결점에 등록한다.
// 내 메시지는 submit 이 이미 스레드에 남겼다 — 여기서는 답·계획 노트·보고만 더한다.
import { agentsList, defaultAgent } from "../agents/api";
import { getStore, type BoardStore } from "../board/boards";
import { GROUP_PAD, groupBounds, groupTitle, membersOf } from "../board/groups";
import { bounds as rectsBounds } from "../board/selection";
import { tidyBoard } from "../board/tidy";
import { isConsole, type BoardNode } from "../board/store";
import { fitBounds, zoomAt, zoomStep } from "../board/viewport";
import { MAX_SLOTS } from "../composer/slots";
import { spawnTeam } from "../composer/spawnTeam";
import { pauseAll, pauseSession, resumeAll, resumeSession } from "../console/pause";
import { getSession, type Session } from "../console/session";
import { sessionKey } from "../console/sessionKey";
import { useSettings } from "../settings/useSettings";
import { useShell } from "../shell/useShell";
import { closeWorkspaceFlow, createWorkspace, renameWorkspace, switchWorkspace, useRepoList, type WsItem } from "../shell/workspaces";
import { openSettings, useUi } from "../ui/useUi";
import { requestCloseStudio, requestOpenStudio } from "../studio/useStudio";
import { t, tp } from "../i18n";
import { showNotice } from "../lib/notice";
import { helpText, laterText, needsPlannerText, smallTalkText, statusText, whoFinishedText, type Row } from "./answers";
import { answerConfirm, askConfirm, dropConfirm, isNo } from "./confirm";
import { addNode } from "./addCmd";
import { cancelPending, deliver } from "./deliver";
import { runGitOp } from "./gitCmd";
import { cancelHandoffs, runForward, runHandoff, type World } from "./handoffCmd";
import { loopCmd } from "./loopCmd";
import { addOrchestratorCmd, connectCmd } from "./orchCmd";
import { onlyHttpText } from "./webCmd";
import { setExecutor, type ExecCtx } from "./executor";
import type { Intent, ParseCtx, Target } from "./intent";
import { parse } from "./parser";
import { pickTargets, restNote, stopText, type Cand } from "./pick";
import { showsPrompt } from "./prompts";
import { recordTask } from "../mission/tasks";
import { fmtDuration, recentOrders, track, type Order, type Snap } from "./report";
import type { Role } from "./roles";
import { guard } from "../orchestrator/scope";
import { mk, useThread } from "./thread";

// ---- 세계 읽기: 이 repo 의 열린 워크스페이스들(현재 것 먼저, S-618) ----
type C = { key: string; wsId: string; id: string; name: string; agentId: string; groupKey?: string; store: BoardStore };

const wsIds = (ctx: ExecCtx): string[] => {
  const open = useShell.getState().openRepos.find((r) => r.path === ctx.repo)?.workspaces.filter((w) => w.loaded).map((w) => w.id) ?? [];
  return [ctx.wsId, ...open.filter((id) => id !== ctx.wsId)];
};
const consolesOf = (ctx: ExecCtx, scoped = true): C[] =>
  wsIds(ctx).flatMap((wsId) => {
    const store = getStore(wsId);
    return Object.values(store.getState().nodes).filter(isConsole).map((n) => ({
      key: sessionKey(wsId, n.id), wsId, id: n.id, name: n.name, agentId: n.agentId, store,
      groupKey: n.groupId ? sessionKey(wsId, n.groupId) : undefined,
    })).filter((c) => !scoped || !ctx.scope || ctx.scope.consoles.includes(c.key)); // S-1260: 카드에서는 지휘 콘솔만
  });
const sessOf = (c: C): Session | undefined => getSession(c.wsId, c.id);
const tabs = (ctx: ExecCtx): WsItem[] => {
  const fromList = useRepoList.getState().repos.find((r) => r.path === ctx.repo)?.workspaces;
  if (fromList?.length) return fromList;
  const open = useShell.getState().openRepos.find((r) => r.path === ctx.repo)?.workspaces;
  return open?.length ? open.map((w) => ({ id: w.id, name: w.name })) : [{ id: ctx.wsId, name: "Workspace 1" }];
};

/** B10 parser 에 줄 목록. 같은 이름은 현재 워크스페이스 것만(S-618), group N/workspace N 은 화면 번호와 같은 배열 순서 */
async function parseCtx(ctx: ExecCtx, cs: C[]): Promise<ParseCtx> {
  const seen = new Set<string>();
  const fresh = (name: string) => !seen.has(name.trim().toLowerCase()) && !!seen.add(name.trim().toLowerCase());
  const consoles = cs.filter((c) => fresh(c.name)).map((c) => ({ id: c.key, name: c.name, agentId: c.agentId as string | null, groupId: c.groupKey }));
  const groups = wsIds(ctx).flatMap((wsId) => // D1: 이름이 아니라 그룹 id 로 구분(같은 이름이 둘이면 parser 가 ambiguous)
    (getStore(wsId).getState().groups ?? []).map((g) => ({ id: sessionKey(wsId, g.id), name: groupTitle(g), role: g.role as string })),
  );
  const agents = (await agentsList()).map((a) => ({ id: a.id, name: a.name, aliases: [] as string[] }));
  return { consoles, groups, workspaces: tabs(ctx).map((w) => ({ id: w.id, name: w.name })), agents };
}

const resolve = (t: Target, cs: C[]): C[] =>
  t.kind === "all" ? cs : t.kind === "console" ? cs.filter((c) => c.key === t.id) : t.kind === "group" ? cs.filter((c) => c.groupKey === t.id) : cs.filter((c) => c.agentId === t.agentId);
const uniq = (cs: C[]) => cs.filter((c, i) => cs.findIndex((d) => d.key === c.key) === i);
const joinNames = (n: string[]) => (n.length < 2 ? n.join("") : t("{list} and {last}", { list: n.slice(0, -1).join(", "), last: n.at(-1)! }));
const consolesOfAgent = (agent: string, n: number) => tp("{n} {agent} console", "{n} {agent} consoles", n, { agent });

// ---- 스레드에 남기기 ----
const say = (ctx: ExecCtx, text: string) => {
  useThread.getState().add(ctx.repo, mk("bot", text));
  if (!useThread.getState().open) showNotice(text.split(/\r?\n/)[0]!.slice(0, 120)); // S-2686
};
const note = (ctx: ExecCtx, text: string) => useThread.getState().add(ctx.repo, mk("plan", text));

const snapOf = (c: C): Snap | null => {
  const s = sessOf(c);
  if (!s) return null;
  const status = s.status();
  return { status, lastOut: s.lastDataAt(), agent: s.isAgent(), blocked: status === "PAUSED" || status === "NEEDS YOU" || showsPrompt(s.tail(12)) };
};
const cand = (c: C): Cand => {
  const s = sessOf(c);
  return { id: c.key, name: c.name, status: s?.status() ?? "DONE", agent: !!s?.isAgent() };
};

// ---- 주문 전달·보고 (S-604~S-611) ----
async function sendOne(ctx: ExecCtx, c: C, text: string, keys: string[]) {
  const s = sessOf(c);
  if (!s) return;
  const out = await deliver(c.key, s, text);
  if (out === "noOutput") return say(ctx, t("{name} hasn't started yet, so I didn't send that.", { name: c.name }));
  if (out === "promptTimeout") return say(ctx, t("{name} waited 15 minutes on a question, so I dropped that order.", { name: c.name }));
  if (out === "shell") return say(ctx, t("{name} is a shell, so I didn't send anything.", { name: c.name }));
  if (out !== "sent") return;
  recordTask(keys, text); // S-1311
  track({ repo: ctx.repo, name: c.name, nodeId: c.id, wsId: c.wsId, text }, () => snapOf(c), (o) => void report(ctx, c, o));
}
async function report(ctx: ExecCtx, c: C, o: Order) {
  const v = o.verdict;
  if (v.state === "expired") return say(ctx, t("{name} didn't answer in 30 minutes", { name: c.name }));
  if (v.state === "working") return;
  const result = v.state === "finished" ? t("finished · {d}", { d: fmtDuration(v.secs) }) : t("failed: {reason}", { reason: t(v.reason) });
  const reply = v.state === "finished" ? (await sessOf(c)?.fetchReply().catch(() => null)) ?? undefined : undefined;
  const head = reply?.split("\n").filter((l) => l.trim()).slice(0, 3).join("\n").slice(0, 240) || undefined;
  useThread.getState().add(ctx.repo, mk("report", `${c.name} ${result}`, { report: { console: c.name, nodeId: c.id, wsId: c.wsId, secs: v.secs, result, reply: head } }));
}
async function order(ctx: ExecCtx, cs: C[], targets: Target[], text: string, broadcast = false) {
  const named = uniq(targets.filter((t) => t.kind !== "all").flatMap((t) => resolve(t, cs)));
  if (!text.trim()) return say(ctx, named.length ? t("Say what {names} should do", { names: joinNames(named.map((c) => c.name)) }) : needsPlannerText());
  const p = pickTargets({ named: named.map(cand), all: cs.map(cand), broadcast });
  if (p.stop) return say(ctx, stopText(p.stop));
  const to = p.to.map((t) => cs.find((c) => c.key === t.id)!);
  const planTo = to.map((c) => `${c.name} 1`).join(", "), planText = text.slice(0, 40);
  note(ctx, broadcast ? t("Plan – broadcast → {to} ← {text}", { to: planTo, text: planText }) : t("Plan – tell → {to} ← {text}", { to: planTo, text: planText }));
  if (p.rest) say(ctx, restNote(p.rest));
  const groupIds = targets.flatMap((t) => (t.kind === "group" ? [t.id] : [])); // S-1311: 콘솔 + 주문 대상 그룹 + 카드
  to.forEach((c) => void sendOne(ctx, c, text, [c.key, ...groupIds.filter((id) => id === c.groupKey), ...(ctx.scope?.card ? [ctx.scope.card] : [])]));
}

// ---- 확인이 필요한 명령 (S-601) ----
function groupBy<T extends { wsId: string }>(xs: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  xs.forEach((x) => m.set(x.wsId, [...(m.get(x.wsId) ?? []), x]));
  return m;
}
function closeOrRestart(ctx: ExecCtx, cs: C[], i: Extract<Intent, { t: "restart" | "close" }>) {
  const scope = i.target.kind === "all" ? cs.filter((c) => c.wsId === ctx.wsId) : cs; // 전부 닫기는 지금 보드만
  const list = uniq(resolve(i.target, scope));
  if (!list.length) return say(ctx, i.t === "close" ? t("I couldn't find anything to close.") : t("I couldn't find anything to restart."));
  const names = joinNames(list.map((c) => c.name));
  askConfirm(ctx.repo, i.t === "close" ? t("Close {names}?", { names }) : t("Restart {names}?", { names }), () => {
    if (i.t === "restart") list.forEach((c) => sessOf(c)?.restart());
    else for (const [wsId, items] of groupBy(list)) {
      items.forEach((c) => sessOf(c)?.kill());
      getStore(wsId).getState().removeNodes(items.map((c) => c.id)); // 한 번에 = 되돌리기 1단계
    }
    say(ctx, i.t === "close" ? t("Closed {names}.", { names }) : t("Restarted {names}.", { names }));
  });
}

// ---- 카메라 (S-615) ----
const sizeOf = (wsId: string) => {
  const el = document.querySelector<HTMLElement>(`[data-ws="${wsId}"] [data-testid="board"]`);
  return { w: el?.clientWidth || window.innerWidth, h: el?.clientHeight || window.innerHeight };
};
function camera(ctx: ExecCtx, cs: C[], i: Extract<Intent, { t: "camera" }>) {
  const store = getStore(ctx.wsId);
  const st = store.getState();
  const fit = (st2: BoardStore, wsId: string, rects: { x: number; y: number; w: number; h: number }[]) => st2.getState().setViewport(fitBounds(rectsBounds(rects), sizeOf(wsId)));
  if (i.op === "zoomIn" || i.op === "zoomOut") return st.setViewport(zoomStep(st.viewport, i.op === "zoomIn" ? 1 : -1));
  if (i.op === "reset") return st.setViewport(zoomAt(st.viewport, { x: 0, y: 0 }, 1 / st.viewport.zoom));
  if (i.op === "fitAll" || !i.target) return fit(store, ctx.wsId, Object.values(st.nodes));
  const list = uniq(resolve(i.target, cs));
  if (!list.length) return say(ctx, t("I couldn't find that on the board."));
  const first = list[0]!;
  const ws = first.wsId;
  if (ws !== ctx.wsId) {
    const w = tabs(ctx).find((x) => x.id === ws);
    if (w) switchWorkspace(ctx.repo, w);
  }
  const s2 = first.store;
  const nodes = s2.getState().nodes;
  const mine = list.filter((c) => c.wsId === ws).map((c) => nodes[c.id]!).filter(Boolean) as BoardNode[];
  const box = i.target.kind === "group" ? groupBounds(membersOf(nodes, JSON.parse(i.target.id)[1] as string), GROUP_PAD) : null;
  s2.getState().select(mine.map((n) => n.id));
  fit(s2, ws, box ? [box] : mine);
  if (list.length === 1) setTimeout(() => document.querySelector<HTMLElement>(`[data-ws="${ws}"] [data-node-id="${first.id}"] .xterm-helper-textarea`)?.focus(), 0); // 콘솔이면 키보드도
}

// ---- 워크스페이스 (S-616·S-602) ----
async function workspace(ctx: ExecCtx, cs: C[], i: Extract<Intent, { t: "workspace" }>) {
  const list = tabs(ctx);
  const ws = i.op === "new" ? undefined : list.find((w) => w.id === (i.ref ?? ctx.wsId));
  if (i.op !== "new" && !ws) return say(ctx, t("I couldn't find that workspace."));
  if (i.op === "go") { switchWorkspace(ctx.repo, ws!); return say(ctx, t("Switched to {name}.", { name: ws!.name })); }
  if (i.op === "new") {
    const w = await createWorkspace(ctx.repo);
    if (!w) return say(ctx, t("I couldn't create a workspace."));
    if (i.name) await renameWorkspace(ctx.repo, w.id, i.name);
    return say(ctx, t("Created {name}.", { name: i.name?.trim() || w.name }));
  }
  if (i.op === "rename") {
    if (!i.name) return say(ctx, t("Say what to call it, like: rename workspace to QA"));
    await renameWorkspace(ctx.repo, ws!.id, i.name);
    return say(ctx, t("Renamed {from} to {to}.", { from: ws!.name, to: i.name.trim() }));
  }
  if (list.length < 2) return say(ctx, t("I can't close the only workspace."));
  const running = cs.filter((c) => c.wsId === ws!.id && sessOf(c)?.isAgent()).length;
  const close = async () => say(ctx, (await closeWorkspaceFlow(ctx.repo, ws!.id, true)) ? t("Closed {name}.", { name: ws!.name }) : t("I couldn't close {name}.", { name: ws!.name }));
  if (running) askConfirm(ctx.repo, tp("Close {name}? {n} running agent will end.", "Close {name}? {n} running agents will end.", running, { name: ws!.name }), close); // S-602
  else await close();
}

function closePanel(ctx: ExecCtx) {
  const ui = useUi.getState();
  if (ui.studio.open) void requestCloseStudio(); // S-1807: 저장 안 한 편집이 있으면 확인창이 먼저
  else if (ui.settings.open) ui.closeSettings();
  else if (ui.presetsOpen) useUi.setState({ presetsOpen: false });
  else if (ui.composer.open) ui.closeComposer();
  else if (ui.outputViewer.open) useUi.setState({ outputViewer: { open: false, nodeId: null } });
  else if (ui.loops.open) ui.closeLoops();
  else if (ui.memory.open) ui.closeMemory();
  else if (ui.mission.open) ui.closeMission();
  else if (ui.usage.open) ui.closeUsage();
  else if (useThread.getState().open) useThread.getState().setOpen(false);
  else say(ctx, t("Nothing is open."));
}

const rowsOf = (cs: C[]): Row[] =>
  cs.map((c) => {
    const s = sessOf(c);
    const status = s?.status() ?? "DONE";
    return { name: c.name, status, needsYou: !!s && s.isAgent() && status !== "PAUSED" && (status === "NEEDS YOU" || showsPrompt(s.tail(12))) };
  });

const world = (ctx: ExecCtx, cs: C[]): World => ({ repo: ctx.repo, wsId: ctx.wsId, say: (t) => say(ctx, t), cons: cs, resolve: (t) => uniq(resolve(t, cs)) });

export async function runIntent(i: Intent, ctx: ExecCtx): Promise<void> {
  const store = getStore(ctx.wsId);
  const cs = consolesOf(ctx);
  switch (i.t) {
    case "spawn": case "makeGroup": {
      const agent = i.agentId ?? (i.t === "spawn" && !i.role ? "shell" : store.getState().armedAgent ?? (await defaultAgent())); // D6: CLI·역할 없는 spawn 은 Shell
      const want = i.n;
      const agents = Array<string>(Math.min(want, MAX_SLOTS)).fill(agent);
      const grouped = i.t === "makeGroup" || ("role" in i && !!i.role);
      const r = grouped
        ? spawnTeam({ name: "", role: (("role" in i && i.role) || "general") as Role, agents }, store)
        : { ...store.getState().spawnMany(agents), clamped: false };
      const g = r.groupId ? store.getState().groups.find((x) => x.id === r.groupId) : undefined;
      const list = consolesOfAgent(agent, r.ids.length);
      const made = g ? t("Made {group} with {list}.", { group: groupTitle(g), list }) : t("Placed {list}.", { list });
      return say(ctx, `${made}${want > MAX_SLOTS ? ` ${t("{n} is the most at once.", { n: MAX_SLOTS })}` : ""}`);
    }
    case "addToGroup": {
      const [wsId, gid] = JSON.parse(i.groupId) as [string, string];
      const s2 = getStore(wsId);
      const g = s2.getState().groups.find((x) => x.id === gid);
      if (!g) return say(ctx, t("I couldn't find that group."));
      const agent = i.agentId ?? s2.getState().armedAgent ?? (await defaultAgent());
      const { ids } = s2.getState().spawnMany(Array<string>(Math.min(i.n, MAX_SLOTS)).fill(agent));
      ids.forEach((id) => s2.getState().setGroupOf(id, gid));
      return say(ctx, t("Added {list} to {group}.", { list: consolesOfAgent(agent, ids.length), group: groupTitle(g) }));
    }
    case "pause": case "resume": {
      const pause = i.t === "pause";
      const list = uniq(resolve(i.target, cs));
      const ss = list.flatMap((c) => sessOf(c) ?? []);
      if (i.target.kind === "all") {
        const n = (pause ? pauseAll : resumeAll)(ss);
        const nothing = pause ? t("Nothing to pause.") : t("Nothing to resume.");
        const cn = tp("{n} console", "{n} consoles", n);
        return say(ctx, n ? (pause ? t("Paused {list}.", { list: cn }) : t("Resumed {list}.", { list: cn })) : nothing);
      }
      const done = list.filter((c) => { const s = sessOf(c); return s && (pause ? pauseSession(s) : resumeSession(s)); });
      const names = joinNames(done.map((c) => c.name)), none = pause ? t("Nothing to pause.") : t("Nothing to resume.");
      return say(ctx, done.length ? (pause ? t("Paused {names}.", { names }) : t("Resumed {names}.", { names })) : none);
    }
    case "restart": case "close": return closeOrRestart(ctx, cs, i);
    case "tell": return order(ctx, cs, i.targets, i.text);
    case "orderUnrouted": return order(ctx, cs, [], i.text);
    case "broadcast": return order(ctx, cs, [], i.text, true);
    case "cancel": {
      const n = cancelPending(cs.map((c) => c.key)) + cancelHandoffs(); // S-1688: 기다리는 handoff·forward 도
      return say(ctx, n || dropConfirm() ? t("Cancelled.") : t("Nothing to cancel."));
    }
    case "status": return say(ctx, statusText(rowsOf(cs)));
    case "whoFinished": return say(ctx, whoFinishedText(recentOrders(ctx.repo), rowsOf(cs).filter((r) => r.needsYou).map((r) => r.name), Date.now()));
    case "help": return say(ctx, helpText());
    case "camera": return camera(ctx, cs, i);
    case "open": {
      const ui = useUi.getState();
      if (i.what === "documents" || i.what === "code" || i.what === "markdown" || i.what === "skills") { // S-1807 스튜디오: 못 열면 이유(등록 안 됨·repo 없음)를 답한다
        const why = await requestOpenStudio(i.what);
        return why ? say(ctx, why) : undefined;
      }
      return i.what === "settings" ? openSettings() : i.what === "presets" ? useUi.setState({ presetsOpen: true })
        : i.what === "mission" ? ui.openMission() : i.what === "memory" ? ui.openMemory() : i.what === "loops" ? ui.openLoops() : ui.openUsage();
    }
    case "addOrchestrator": return say(ctx, addOrchestratorCmd(i, store));
    case "connect": return say(ctx, connectCmd(i, store, ctx.wsId));
    case "loop": return say(ctx, await loopCmd(i, ctx));
    case "handoff": return runHandoff(i, world(ctx, cs));
    case "forward": return runForward(i, world(ctx, cs));
    case "closePanel": return closePanel(ctx);
    case "theme": useSettings.getState().patch({ theme: i.value }); return say(ctx, i.value === "og" ? t("Switched to dark theme.") : i.value === "light" ? t("Switched to light theme.") : t("Switched to system theme."));
    case "tidy": { // S-2724: 선택 무시, 보드 전체
      const s = store.getState();
      tidyBoard({ ...store, getState: () => ({ ...s, selection: [] }) } as unknown as typeof store);
      return say(ctx, t("Tidied the board."));
    }
    case "undo": return say(ctx, store.getState().undo() ? t("Undone.") : t("Nothing to undo."));
    case "redo": return say(ctx, store.getState().redo() ? t("Redone.") : t("Nothing to redo."));
    case "workspace": return workspace(ctx, cs, i);
    case "git": return say(ctx, await runGitOp(ctx.repo, i.op, i.message));
    case "add": addNode(store, i.what, i.text); return say(ctx, i.what === "note" ? t("Added a sticky note.") : i.what === "kanban" ? t("Added a kanban.") : i.what === "calendar" ? t("Added a calendar.") : i.what === "checklist" ? t("Added a checklist.") : t("Added a browser."));
    case "openWeb":
      if (i.bad) return say(ctx, onlyHttpText());
      addNode(store, "browser", i.url);
      return say(ctx, t("Opened {url}.", { url: i.url }));
    case "tool": store.getState().setTool(i.tool); return say(ctx, i.tool === "pen" ? t("Pen is on.") : t("Eraser is on."));
    case "later": case "unavailable": return say(ctx, laterText());
    case "needsPlanner": return say(ctx, needsPlannerText());
    case "smallTalk": return say(ctx, smallTalkText());
    case "notFound": return say(ctx, t('I couldn\'t find "{name}".', { name: i.name }));
    case "ambiguous": {
      const name = (id: string) => cs.find((c) => c.key === id)?.name ?? id;
      return say(ctx, t("Which {name}? {list}", { name: i.name, list: i.candidates.map(name).join(", ") }));
    }
  }
}

/** B9 submit 이 부른다: 확인 대기부터 보고, 아니면 해석해서 실행 */
export async function execute(text: string, ctx: ExecCtx): Promise<void> {
  const a = answerConfirm(ctx.repo, text);
  if (a === "ran") return;
  if (a === "cancelled") {
    say(ctx, t("Cancelled."));
    if (isNo(text)) return;
  }
  const intent = parse(text, await parseCtx(ctx, consolesOf(ctx, false))); // 이름은 범위 밖 것도 알아야 "연결 안 됨" 답을 준다
  const blocked = ctx.scope && guard(intent, ctx.scope);
  if (blocked) return say(ctx, blocked);
  await runIntent(intent, ctx);
}

setExecutor(execute);
