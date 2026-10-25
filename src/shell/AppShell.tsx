// B2 S-300·S-301·S-343: 열린 워크스페이스마다 보드를 마운트해 두고 보이는 하나만 display 로 드러낸다(콘솔이 안 죽는다).
// 시작 흐름·Ctrl+Q·읽기 전용 배너·ResumeAll·종료 확인은 여기(예전 App.tsx 의 Workspace).
import "../commandbar/exec"; // B12: 명령 실행기를 B9 연결점(setExecutor)에 등록
import { useEffect } from "react";
import Board from "../board/Board";
import ComposerHost from "../composer/ComposerHost";
import { BoardScope } from "../board/BoardScope";
import { getStore, registry } from "../board/boards";
import CommandBar from "../commandbar/CommandBar";
import VoiceHost from "../voice/VoiceHost";
import ResumeAllBanner from "../board/ResumeAllBanner";
import { READONLY_BANNER, flushAll, startWorkspace } from "../board/persist";
import { useBoard } from "../board/store";
import { QuitConfirmHost, confirmQuit } from "../app/QuitConfirm";
import { quit } from "../app/quit";
import { runningCount } from "../console/session";
import { appQuit, boardLoad, dirExists, onQuitRequested, reposGet, reposSet } from "../lib/ipc";
import GitHost from "../git/GitHost";
import GithubPill from "../git/GithubPill";
import HomeScreen from "../home/HomeScreen";
import PresetsHost from "../presets/PresetsHost";
import DropHost from "../files/DropHost";
import MissionHost from "../mission/MissionHost";
import MemoryHost from "../memory/MemoryHost";
import LoopsHost from "../loops/LoopsHost";
import UsagePanel from "../usage/UsagePanel";
import { useSettings } from "../settings/useSettings";
import StudioHost from "../studio/StudioHost";
import { confirmUnsaved } from "../studio/unsaved";
import { AppNotice } from "../lib/notice";
import TopBar, { BAR_H } from "./TopBar";
import { updateRepos } from "./workspaces";
import { handleOf, loadWorkspace, useShell } from "./useShell";

// ?demo: 빈 상자 노드 2개
const demo = (store: typeof useBoard) => {
  const { nodes, addNode } = store.getState();
  if (!nodes.n1) addNode({ id: "n1", kind: "box", x: -300, y: -200, w: 400, h: 300, z: 0 });
  if (!nodes.n2) addNode({ id: "n2", kind: "box", x: 500, y: 300, w: 400, h: 300, z: 0 });
};

export default function AppShell({ q }: { q: URLSearchParams }) {
  const repos = useShell((s) => s.openRepos);
  const activeRepo = useShell((s) => s.activeRepo);
  const view = useShell((s) => s.view);
  const list = repos.flatMap((r) => r.workspaces.map((w) => ({ ...w, path: r.path, visible: view === "board" && r.path === activeRepo && r.activeWs === w.id })));
  const shown = list.find((w) => w.visible);

  // 시작(S-324): 설정 reopenLastRepo 가 켜져 있고 lastRepo 폴더가 있으면 그 보드, 아니면 홈 화면(선택창 없음)
  useEffect(() => {
    void (async () => {
      await useSettings.getState().load();
      const res = await startWorkspace({ reposGet, reposSet, dirExists }, { reopenLastRepo: useSettings.getState().s.reopenLastRepo !== false });
      if (res.kind === "home") return useShell.getState().showHome();
      const ws = res.ws;
      useShell.getState().openWorkspace({ path: ws.repoPath, id: ws.id, name: ws.name });
      const n = Number(q.get("console")); // A4 시험용: ?console=N&agent=<id> — 콘솔 N개(한 번만)
      await loadWorkspace(ws, (store) => {
        if (n > 0 && Object.keys(store.getState().nodes).length === 0) for (let i = 0; i < n; i++) store.getState().spawnConsole(q.get("agent") ?? "shell");
        if (q.has("demo")) demo(store);
      });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 열린 워크스페이스는 모두 불러온다(이미 불러온 것은 그대로)
  useEffect(() => {
    for (const r of repos) for (const w of r.workspaces) if (!w.loaded) void loadWorkspace({ id: w.id, name: w.name, repoPath: r.path });
  }, [repos]);
  // S-307: 보고 있는 워크스페이스를 repo 별로 기억
  useEffect(() => {
    if (!shown) return;
    void updateRepos((r) => (r.lastWorkspace?.[shown.path] === shown.id ? r : { ...r, lastWorkspace: { ...r.lastWorkspace, [shown.path]: shown.id } })); // B4: repos.json 갱신을 한 줄로
  }, [shown?.id, shown?.path]);

  // A9 종료(S-230·S-231): Ctrl+Q(⌘Q 대신)와 창 닫기(X·Alt+F4, Rust 가 가로채 알림)가 같은 절차를 탄다. 세션 수는 열린 모든 워크스페이스의 합계(S-306)
  useEffect(() => {
    const go = () => void confirmUnsaved().then((ok) => ok && quit({ running: runningCount, confirm: confirmQuit, flush: flushAll, appQuit })); // S-1810: 저장 안 한 편집을 먼저 묻는다
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === "q") {
        e.preventDefault();
        e.stopPropagation(); // 터미널로 XON(^Q)이 가지 않게
        go();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const off = onQuitRequested(go);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      off();
    };
  }, []);

  return (
    <>
      {shown?.readOnly && (
        <div role="status" style={{ position: "fixed", top: BAR_H, left: 0, right: 0, zIndex: 10000, padding: "6px 12px", background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
          {READONLY_BANNER}
        </div>
      )}
      <TopBar />
      <ResumeAllBanner />
      <AppNotice />
      <QuitConfirmHost />
      <PresetsHost />
      <DropHost />
      <MissionHost />
      <MemoryHost />
      <LoopsHost />
      <StudioHost />
      <UsagePanel />
      {view === "home" && <HomeScreen />}
      {list.map((w) =>
        w.loaded ? (
          <div key={w.id} data-ws={w.id} inert={!w.visible} style={{ width: "100%", height: "100%", display: w.visible ? "block" : "none" }}>
            <BoardScope wsId={w.id} store={getStore(w.id)} visible={w.visible}>
              <WsBoard id={w.id} visible={w.visible} />
            </BoardScope>
          </div>
        ) : null,
      )}
      {shown && <GithubPill repo={shown.path} />}
      {shown && <GitHost repo={shown.path} wsId={shown.id} />}
      {shown && <CommandBar wsId={shown.id} repo={shown.path} />}
      <VoiceHost ctx={shown ? { wsId: shown.id, repo: shown.path } : null} />
    </>
  );
}

// 숨은 워크스페이스는 1분마다만 저장(S-305)
function WsBoard({ id, visible }: { id: string; visible: boolean }) {
  useEffect(() => void handleOf(id)?.then((h) => h.autosave.setBackground(!visible)), [id, visible]);
  return <><Board renderNode={(nid) => (nid === "n1" ? <input style={{ width: "100%" }} /> : null)} />{visible && <ComposerHost />}</>;
}

// 시험용 후크(가짜 IPC 에서만). Playwright e2e/workspaces.spec.ts 가 쓴다.
if (typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window)) {
  const sh = () => useShell.getState();
  const flat = () => sh().openRepos.flatMap((r) => r.workspaces.map((w) => ({ id: w.id, loaded: w.loaded, visible: sh().view === "board" && sh().activeRepo === r.path && r.activeWs === w.id })));
  Object.assign(window, {
    __setArmed: (id: string | null) => [useBoard, ...registry.values()].forEach((s) => s.setState({ armedAgent: id })),
    __shell: {
      openWs: async (path: string, id: string) => {
        sh().openWorkspace({ path, id, name: id });
        await loadWorkspace({ id, name: id, repoPath: path });
      },
      list: flat,
      home: () => sh().showHome(),
      group: (wsId: string, ids: string[]) => getStore(wsId).getState().createGroup(ids),
      select: (wsId: string, ids: string[]) => getStore(wsId).getState().select(ids),
      showHome: () => sh().showHome(),
      activeRepo: () => sh().activeRepo,
      repos: () => reposGet(),
      view: () => sh().view,
      show: (id: string) => sh().showWorkspace(id),
      spawn: (wsId: string, agentId: string) => getStore(wsId).getState().spawnConsole(agentId),
      update: (wsId: string, nodeId: string, patch: Record<string, unknown>) => getStore(wsId).getState().updateNode(nodeId, patch),
      running: () => runningCount(),
      saved: async (id: string) => (await boardLoad(id)).json,
    },
  });
}
