// 5묶음 E5 S-1920~S-1940: Markdown 스튜디오 본체. 왼쪽 vault(VaultTree), 오른쪽 위 탭 Reading / Source / Graph + Add to Board + Export PDF.
// 한 번에 글 하나(doc). 자동 저장·초안·상태 = status.ts, 디스크 변경 보기 = poll.ts. 이 스튜디오는 unsaved 에 등록하지 않는다(자동 저장이라) — 닫을 때 끝날 때까지 기다린다.
import { t, tm, useT } from "../../i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { placeNew } from "../../board/kinds/registry";
import { baseName, makeMarkdown } from "../../files/make";
import { draftClear, draftGet, draftPut, fsReveal, studioCreate, studioDuplicate, studioMemoryDir, studioRead, studioRename, studioTree, studioVault, studioWrite, trashMove, type StudioEntry, type StudioOpts } from "../../lib/ipc";
import { profileEnvFor } from "../../profiles/env";
import { exportPdf } from "../../pdf/exportPdf";
import { activeStore } from "../../presets/actions";
import { useShell } from "../../shell/useShell";
import { useModal } from "../../ui/useModal";
import EolNotice from "../EolNotice";
import StudioFrame from "../StudioFrame";
import { closeStudioRequest, studioTitle } from "../useStudio";
import GraphView from "./GraphView";
import { buildGraph } from "./graph";
import { dirOf, isInside, isMdPath } from "./links";
import { createPoll } from "./poll";
import Reading from "./Reading";
import Source from "./Source";
import { createSaver, type Saver, type StatusText } from "./status";
import { buildVaultTree, normalizeNoteName, renameTarget, searchVault } from "./vault";
import VaultTree, { type FileAction, type NewPlace } from "./VaultTree";

type Tab = "reading" | "source" | "graph";
type Doc = { path: string; text: string };
type Enc = { encoding: string; bom: boolean; crlf: boolean };
const fwd = (p: string) => p.replace(/\\/g, "/");
const TABS: [Tab, string][] = [["reading", tm("Reading")], ["source", tm("Source")], ["graph", tm("Graph")]];
const btn: React.CSSProperties = { padding: "5px 12px", borderRadius: 6, border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg)", font: "13px system-ui", cursor: "pointer" };

export default function MarkdownStudio({ arg }: { arg?: string }) {
  useT();
  const repo = fwd(useShell((s) => s.activeRepo) ?? "");
  const repoName = repo.split("/").filter(Boolean).pop() ?? repo;
  const [files, setFiles] = useState<StudioEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [mem, setMem] = useState<{ dir: string; files: { path: string }[] }>({ dir: "", files: [] });
  const [doc, setDoc] = useState<Doc | null>(null);
  const [tab, setTab] = useState<Tab>("reading");
  const [status, setStatus] = useState<StatusText>("");
  const [banner, setBanner] = useState(false);
  const [note, setNote] = useState("");
  const [mixed, setMixed] = useState<boolean | null>(null); // 줄 끝이 섞인 글이면 저장 때 쓸 쪽(crlf)
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState<NewPlace | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [graphFiles, setGraphFiles] = useState<{ path: string; text: string }[] | null>(null);

  const cur = useRef<{ path: string; io: StudioOpts; enc: Enc; mtime: number; text: string; saver: Saver; poll: ReturnType<typeof createPoll>; force: boolean } | null>(null);
  const memRef = useRef(mem); memRef.current = mem;
  const alive = useRef(true);
  const say = (m: string) => alive.current && setNote(m);
  const ioOf = (path: string): StudioOpts => (memRef.current.dir && isInside(memRef.current.dir, path) ? { root: memRef.current.dir } : { root: repo });

  const refresh = useCallback(async () => {
    const v = await studioVault(repo);
    let dir = "", mf: { path: string }[] = [];
    try {
      const cfg = (await profileEnvFor("claude").catch(() => []))[0]?.[1]; // 계정(프로필) 설정 폴더 (S-1922)
      dir = fwd(await studioMemoryDir(repo, cfg));
      mf = (await studioTree(dir, dir).catch(() => [] as StudioEntry[])).filter((e) => !e.isDir && isMdPath(e.name)).map((e) => ({ path: e.path }));
    } catch { /* memory 폴더를 모르면 비어 있는 것으로 */ }
    if (!alive.current) return;
    setFiles(v.files); setTruncated(v.truncated); setMem({ dir, files: mf });
  }, [repo]);

  /** 지금 글을 끝까지 저장한다(바꾸기 전·닫기 전) */
  const flush = async () => { const c = cur.current; if (!c) return; void c.saver.saveNow(); await c.saver.settled(); };

  const leave = () => { const c = cur.current; if (c) { c.poll.stop(); c.saver.dispose(); } cur.current = null; };

  const openFile = useCallback(async (path: string, o: { tab?: Tab; fresh?: boolean } = {}) => {
    await flush();
    leave();
    setBanner(false); setNote(""); setMixed(null);
    const io = ioOf(path);
    let f;
    try { f = await studioRead(path, io); } catch (e) { setDoc(null); say(t("Can't open {name}: {err}", { name: baseName(path), err: String(e) })); setStatus(""); return; }
    if (f.text === undefined) { setDoc(null); say(t("Can't show {name} ({why}).", { name: baseName(path), why: f.unreadable ?? t("unreadable") })); setStatus(""); return; }
    if (f.mixedEol) setMixed(f.crlf);
    const d = o.fresh ? null : await draftGet(path).catch(() => null);
    const text = d && d.text !== f.text ? d.text : f.text;
    const c = {
      path, io, enc: { encoding: f.encoding, bom: f.bom, crlf: f.crlf }, mtime: f.mtimeMs, text, force: false,
      saver: createSaver({
        save: async () => {
          const me = cur.current;
          if (!me || me.path !== path) return "ok";
          const force = me.force; me.force = false;
          try {
            const r = await studioWrite(path, me.text, me.enc.encoding, me.enc.bom, me.enc.crlf, force ? undefined : me.mtime, force, io);
            me.mtime = r.mtimeMs; me.poll.setKnown(r.mtimeMs);
            if (force) setBanner(false);
            return "ok";
          } catch (e) {
            if (String(e) === "changed") { setBanner(true); return "changed"; }
            say(t("Could not save: {err}", { err: String(e) }));
            return "fail";
          }
        },
        draft: () => void draftPut(path, cur.current?.text ?? "", cur.current?.mtime ?? 0).catch(() => {}),
        clearDraft: () => void draftClear(path).catch(() => {}),
        onStatus: (s) => alive.current && cur.current?.path === path && setStatus(s),
      }),
      poll: createPoll({
        read: () => studioRead(path, io),
        isDirty: () => cur.current?.saver.dirty() ?? false,
        onSilent: (nf) => {
          const me = cur.current;
          if (!me || me.path !== path || nf.text === undefined) return;
          me.text = nf.text; me.mtime = nf.mtimeMs; me.enc = { encoding: nf.encoding, bom: nf.bom, crlf: nf.crlf };
          setDoc({ path, text: nf.text });
        },
        onConflict: () => { setBanner(true); cur.current?.saver.found(); },
      }),
    };
    cur.current = c;
    c.poll.setKnown(f.mtimeMs);
    c.poll.start();
    setDoc({ path, text });
    setStatus("");
    if (d && d.text !== f.text) c.saver.recovered();
    if (o.tab) setTab(o.tab); else setTab((t) => (t === "graph" ? "reading" : t));
  }, [repo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    alive.current = true;
    void refresh().then(() => { if (arg && isMdPath(arg)) void openFile(fwd(arg)); });
    return () => { alive.current = false; const c = cur.current; if (c?.saver.dirty()) void draftPut(c.path, c.text, c.mtime).catch(() => {}); leave(); };
  }, [arg]); // eslint-disable-line react-hooks/exhaustive-deps

  const onText = (t: string) => { const c = cur.current; if (!c) return; c.text = t; setDoc({ path: c.path, text: t }); c.saver.edit(); };

  // ---- 그래프 자료: vault 의 모든 글을 읽는다(Graph 탭을 열 때·vault 가 바뀔 때) ----
  useEffect(() => {
    if (tab !== "graph") return;
    let dead = false;
    (async () => {
      const out: { path: string; text: string }[] = [];
      for (let i = 0; i < files.length; i += 16) {
        const part = await Promise.all(files.slice(i, i + 16).map((e) => studioRead(e.path, { root: repo }).then((r) => ({ path: e.path, text: r.text ?? "" }), () => ({ path: e.path, text: "" }))));
        out.push(...part);
      }
      if (!dead) setGraphFiles(out);
    })();
    return () => { dead = true; };
  }, [tab, files, repo]);
  const graph = useMemo(() => buildGraph((graphFiles ?? []).map((f) => (doc && f.path === doc.path ? { ...f, text: doc.text } : f))), [graphFiles, doc]);

  const vaultSet = useMemo(() => new Set(files.map((f) => fwd(f.path).toLowerCase())), [files]);
  const exists = useCallback((p: string) => vaultSet.has(fwd(p).toLowerCase()), [vaultSet]);
  const tree = useMemo(() => buildVaultTree(files, repo, { dir: mem.dir, files: mem.files }), [files, repo, mem]);
  const results = query.trim()
    ? [...searchVault(files, repo, query), ...searchVault(mem.files, mem.dir, query).map((r) => ({ ...r, rel: `${t("Agent memory")}/${r.rel}` }))]
    : null;

  // ---- 파일 메뉴·새 글 ----
  const closeAfter = async (after: () => void) => { await flush(); after(); closeStudioRequest(); };
  const addToBoard = (path: string) => void closeAfter(() => {
    const store = activeStore();
    if (store) placeNew(store, "markdown", makeMarkdown(path));
  });
  const gone = async (path: string) => { // S-1940: 지우거나 옮기면 열려 있던 글은 닫히고 트리를 새로 읽는다
    if (cur.current && fwd(cur.current.path) === fwd(path)) { leave(); setDoc(null); setStatus(""); setBanner(false); }
    await refresh();
  };
  const onAction = async (a: FileAction, path: string) => {
    try {
      if (a === "open") await openFile(path);
      else if (a === "board") addToBoard(path);
      else if (a === "rename") setRenaming(path);
      else if (a === "reveal") await fsReveal(path);
      else if (a === "trash") setConfirm(path);
      else { await studioDuplicate(path, ioOf(path)); await refresh(); }
    } catch (e) { say(String(e)); }
  };
  const onRename = async (path: string, input: string | null) => {
    setRenaming(null);
    if (input === null) return;
    const to = renameTarget(baseName(path), input);
    if (!to) return say(t("That name can't be used."));
    if (to === baseName(path)) return;
    try {
      const wasOpen = !!cur.current && fwd(cur.current.path) === fwd(path);
      if (wasOpen) await flush();
      await studioRename(path, to, ioOf(path));
      await gone(path); // 열려 있던 글은 닫힌다(다른 글의 링크는 고치지 않는다)
    } catch (e) { say(String(e) === "exists" ? t("A note with that name already exists.") : String(e)); }
  };
  const onCreate = async (name: string | null) => {
    const place = creating;
    setCreating(null);
    if (name === null || !place) return;
    const file = normalizeNoteName(name);
    if (!file) return say(t("That name can't be used."));
    const dir = place === "repo" ? repo : place === "docs" ? `${repo}/docs` : mem.dir;
    const io: StudioOpts = place === "memory" ? { root: mem.dir } : { root: repo };
    try {
      if (place !== "repo") await studioCreate(dir, true, io).catch((e) => { if (String(e) !== "exists") throw e; }); // 없으면 폴더도 상위째 만든다
      await studioCreate(`${dir}/${file}`, false, io);
      await refresh();
      await openFile(`${dir}/${file}`, { tab: "source", fresh: true });
    } catch (e) { say(String(e) === "exists" ? t("A note with that name already exists.") : String(e)); }
  };
  const doExport = async () => {
    const c = cur.current;
    if (!c) return;
    const h1 = /^#\s+(.+)$/m.exec(c.text)?.[1]?.trim();
    try {
      const out = await exportPdf({ title: h1 || baseName(c.path).replace(/\.[^.]*$/, ""), repo: repoName, date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), md: c.text, baseDir: dirOf(c.path), toast: (t) => say(t.message) });
      if (out === null) say("");
    } catch (e) { say(String(e)); }
  };

  const keepMine = () => { const c = cur.current; if (!c) return; c.force = true; void c.saver.saveNow(); };
  const reload = () => { const c = cur.current; if (c) void openFile(c.path, { fresh: true }).then(() => void draftClear(c.path).catch(() => {})); };

  return (
    <StudioFrame title={studioTitle("Markdown")} onClose={() => void closeAfter(() => {})}
      left={<VaultTree tree={tree} results={results} query={query} setQuery={setQuery} openPath={doc?.path ?? ""} truncated={truncated} renaming={renaming}
        onOpen={(p) => void openFile(p)} onAction={(a, p) => void onAction(a, p)} onRename={(p, i) => void onRename(p, i)}
        onNew={(pl) => setCreating(pl)} creating={creating} onCreate={(n) => void onCreate(n)} />}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--studio-line)" }}>
        <span data-testid="md-filename" title={doc?.path} style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc ? baseName(doc.path) : ""}</span>
        <span data-testid="md-status" role="status" style={{ color: status === "Could not save" ? "var(--danger)" : "var(--mute-2)", fontSize: 12 }}>{status ? t(status) : ""}</span>
        <span data-testid="md-note" style={{ flex: 1, minWidth: 0, color: "var(--mute-2)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note}</span>
        <div role="tablist" style={{ display: "flex", gap: 2 }}>
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" data-testid={`md-tab-${id}`} aria-selected={tab === id} onClick={() => setTab(id)}
              style={{ ...btn, border: 0, background: tab === id ? "var(--studio-sel)" : "transparent", fontWeight: tab === id ? 600 : 400 }}>{t(label)}</button>
          ))}
        </div>
        <button data-testid="md-add-board" style={btn} disabled={!doc} onClick={() => doc && addToBoard(doc.path)}>{t("Add to Board")}</button>
        <button data-testid="md-export-pdf" style={{ ...btn, border: 0, background: "var(--accent)", color: "var(--accent-text)" }} disabled={!doc} onClick={() => void doExport()}>{t("Export PDF")}</button>
      </div>
      {banner && (
        <div data-testid="md-banner" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
          <span style={{ flex: 1 }}>{t("Found a change on disk")}</span>
          <button style={btn} onClick={reload}>{t("Reload")}</button>
          <button style={btn} onClick={keepMine}>{t("Keep mine")}</button>
        </div>
      )}
      {mixed !== null && <EolNotice crlf={mixed} />}
      {tab === "graph" ? <GraphView graph={graph} openPath={doc?.path ?? ""} onOpen={(p) => void openFile(p, { tab: "reading" })} />
        : !doc ? <div style={{ padding: 24, color: "var(--mute-3)" }}>{t("Select a note to read it.")}</div>
        : tab === "source" ? <Source text={doc.text} onChange={onText} onSave={() => void cur.current?.saver.saveNow()} />
        : <Reading text={doc.text} path={doc.path} exists={exists} onOpen={(p) => void openFile(p)} />}
      {confirm && <TrashConfirm name={baseName(confirm)} onCancel={() => setConfirm(null)}
        onOk={() => { const p = confirm; setConfirm(null); void trashMove(p).then(() => gone(p), (e) => say(String(e))); }} />}
    </StudioFrame>
  );
}

// S-2605·S-2606·S-2740: 휴지통 확인은 위험 → 주 동작 왼쪽·Cancel 오른쪽, 기본 포커스 Cancel
function TrashConfirm({ name, onOk, onCancel }: { name: string; onOk: () => void; onCancel: () => void }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useModal(box, { onClose: onCancel, initialFocus: () => cancel.current });
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9600, display: "grid", placeItems: "center", background: "var(--scrim-50)" }}>
      <div ref={box} data-testid="md-confirm" role="dialog" aria-modal="true" aria-label={t("Move to Recycle Bin?")}
        style={{ width: 360, padding: 20, borderRadius: 12, background: "var(--surface)", color: "var(--fg)", border: "1px solid var(--bd)", font: "13px system-ui" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{t("Move {name} to the Recycle Bin?", { name })}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button style={{ ...btn, border: 0, background: "var(--danger)", color: "var(--accent-text)" }} onClick={onOk}>{t("Move to Recycle Bin")}</button>
          <button ref={cancel} style={btn} onClick={onCancel}>{t("Cancel")}</button>
        </div>
      </div>
    </div>
  );
}
