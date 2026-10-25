// S-310~S-325: 홈 화면 — 인사·orb·repo 목록·Add a repo·compose bar·해/달·톱니. 상태(목록·선택·이름 바꾸는 중)는 여기, 규칙은 repoList.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Repos } from "../board/persist";
import { useSettings } from "../settings/useSettings";
import { useShell, openRepo, removeRepo } from "../shell/useShell";
import { createHub, homeHooks, openHub, removeHub } from "../shell/workspaces";
import { confirmDialog } from "../ui/ConfirmDialog";
import { openSettings, useUi } from "../ui/useUi";
import { dirExists, onFolderDrop, pickFolder, repoBranch, reposGet, reposSet } from "../lib/ipc";
import AddRepoCard from "./AddRepoCard";
import HubList from "./HubList";
import ComposeBar from "./ComposeBar";
import FirstRunCard from "../firstrun/FirstRunCard";
import { shouldShow } from "../firstrun/steps";
import { greeting } from "./greeting";
import Orb from "./Orb";
import RepoList, { type RowInfo } from "./RepoRows";
import { addFolders, moveSel, renameRepo } from "./repoList";
import { useT } from "../i18n";

const iconBtn = { all: "unset", cursor: "pointer", width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 8, color: "var(--text-dim)", fontSize: 18 } as const;

export default function HomeScreen() {
  const t = useT();
  const [data, setData] = useState<Repos | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [info, setInfo] = useState<Record<string, RowInfo>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [firstRun, setFirstRun] = useState(false); // B17: 첫 실행 카드(S-390). 처음 목록을 읽을 때 한 번만 정한다(카드 중에 repo 를 더해도 안 걷힘)
  const name = useSettings((s) => s.s.profileName) as string;
  const openRepos = useShell((s) => s.openRepos);
  const repos = data?.repos ?? [];

  // 항상 저장된 최신 목록에서 고쳐 쓴다(다른 곳이 쓴 lastWorkspace 를 덮지 않게)
  const mutate = useCallback(async (f: (r: Repos) => Repos) => {
    const next = f(await reposGet());
    await reposSet(next);
    setData(next);
    return next;
  }, []);

  useEffect(() => {
    void reposGet().then((r) => {
      const gate = shouldShow(useSettings.getState().s, r.repos.length);
      if (gate === "show") setFirstRun(true);
      else if (gate === "mark-done") useSettings.getState().patch({ firstRunDone: true }); // 기존 사용자: 카드 없이 조용히
      setData(r);
      setSel(r.lastRepo && r.repos.some((x) => x.path === r.lastRepo) ? r.lastRepo : (r.repos[0]?.path ?? null));
    });
  }, []);
  // 행마다 폴더가 있는지·브랜치(S-315)를 한 번씩 읽는다
  useEffect(() => {
    for (const r of repos)
      if (!info[r.path]) {
        setInfo((m) => ({ ...m, [r.path]: { branch: null, exists: true } }));
        void Promise.all([dirExists(r.path), repoBranch(r.path)]).then(([exists, branch]) => setInfo((m) => ({ ...m, [r.path]: { exists, branch: exists ? branch : null } })));
      }
  }, [repos]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = useCallback(
    async (paths: string[]) => {
      const dirs: string[] = [];
      for (const p of paths) if (await dirExists(p)) dirs.push(p);
      if (!dirs.length) return;
      let picked: string | null = null;
      await mutate((r) => {
        const a = addFolders(r, dirs);
        picked = a.selected;
        return a.repos;
      });
      if (picked) setSel(picked);
    },
    [mutate],
  );
  const pickAndAdd = useCallback(async () => {
    const p = await pickFolder();
    if (p) await add([p]);
  }, [add]);
  useEffect(() => { homeHooks.addFolder = pickAndAdd; return () => { homeHooks.addFolder = null; }; }, [pickAndAdd]); // D5: 앱 키 Ctrl+O 가 부른다
  useEffect(() => onFolderDrop((paths) => void add(paths)), [add]);

  const open = async (path: string) => {
    if (info[path]?.exists === false) return; // Folder missing: 열 수 없다
    await openRepo(path);
  };
  const remove = async (path: string) => {
    const r = repos.find((x) => x.path === path);
    if (!r) return;
    const ok = await confirmDialog({ title: t("Remove {name}?", { name: r.name }), message: t("Files stay on disk; consoles running in this repo end."), confirmLabel: t("Remove"), danger: true });
    if (!ok) return;
    const i = repos.findIndex((x) => x.path === path);
    await removeRepo(path);
    const next = await reposGet();
    setData(next);
    setSel(next.repos[Math.min(i, next.repos.length - 1)]?.path ?? null);
  };

  const removeHubAsk = async (h: { id: string; name: string }) => {
    const ok = await confirmDialog({ title: t("Remove {name}? Its consoles close.", { name: h.name }), confirmLabel: t("Remove"), danger: true });
    if (!ok) return;
    await removeHub(h.id);
    setData(await reposGet());
  };

  // S-322: ↑↓ 이동, Return 열기, Delete 제거, Ctrl+O 폴더 추가(앱 키 S-342 가 homeHooks 로 부른다). 확인창·설정이 떠 있거나 입력·버튼에 포커스가 있으면 비킨다.
  // 리스너는 한 번만 달고 최신 상태는 ref 로 읽는다(목록이 막 뜬 순간의 키가 옛 상태를 보지 않게)
  const latest = useRef({ repos, sel, open, remove });
  latest.current = { repos, sel, open, remove };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable]")) return;
      const { repos, sel, open, remove } = latest.current;
      const k = e.key;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      else if (k === "F2" && sel) { e.preventDefault(); setEditing(sel); } // S-2705
      else if (k === "ArrowDown" || k === "ArrowUp") {
        e.preventDefault();
        const cur = repos.findIndex((r) => r.path === sel);
        setSel(repos[cur < 0 ? 0 : moveSel(cur, k === "ArrowDown" ? 1 : -1, repos.length)]?.path ?? null); // 고른 게 없을 땐 첫 행부터
      } else if (k === "Enter" && sel && !t?.closest("button")) void open(sel);
      else if (k === "Delete" && sel) void remove(sel);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleTheme = () => useSettings.getState().patch({ theme: document.documentElement.getAttribute("data-theme") === "light" ? "og" : "light" }); // S-313: Match system 도 지금 보이는 테마의 반대로 고정
  const isOpen = useMemo(() => openRepos.some((r) => r.path === sel), [openRepos, sel]);
  const dispatchOff = !sel || info[sel]?.exists === false;

  return (
    <div data-testid="home" style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", background: "var(--bg)", color: "var(--text)", overflow: "auto" }}>
      <div style={{ alignSelf: "stretch", display: "flex", justifyContent: "flex-end", gap: 4, padding: 12 }}>
        <button data-testid="home-conversations" aria-label={t("All conversations")} title={t("All conversations")} onClick={() => useUi.getState().openConversations()} style={iconBtn}>💬</button>
        <button data-testid="theme-toggle" aria-label={t("Toggle theme")} title="OG / Light" onClick={toggleTheme} style={iconBtn}>◐</button>
        <button data-testid="home-settings" aria-label={t("Settings")} title={t("Settings (Ctrl+,)")} onClick={() => openSettings()} style={iconBtn}>⚙</button>
      </div>
      <div style={{ width: "min(640px, calc(100% - 48px))", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, justifyItems: "center", paddingTop: 24 }}>
        <Orb />
        <h1 data-testid="greeting" style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>{greeting(new Date(), name)}</h1>
        {repos.length > 0 && (
          <RepoList
            repos={repos}
            info={info}
            selected={sel}
            active={data?.lastRepo ?? null}
            editing={editing}
            onSelect={setSel}
            onOpen={(p) => void open(p)}
            onEdit={setEditing}
            onRename={(p, n) => void mutate((r) => renameRepo(r, p, n))}
            onRemove={(p) => void remove(p)}
          />
        )}
        <AddRepoCard onAdd={() => void pickAndAdd()} />
        <HubList hubs={data?.hubs ?? []} onNew={() => void createHub()} onOpen={openHub} onRemove={(h) => void removeHubAsk(h)} />
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ width: "min(640px, calc(100% - 48px))", padding: "0 0 24px" }}>
        <ComposeBar repos={repos} selected={sel} resume={isOpen} disabled={dispatchOff} onPick={setSel} onDispatch={() => sel && void open(sel)} />
      </div>
      {firstRun && <FirstRunCard add={(p) => add([p])} onDone={() => setFirstRun(false)} />}
    </div>
  );
}
