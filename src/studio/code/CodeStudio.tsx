// 5묶음 E4 S-1870~S-1889: Code 스튜디오 본체. 왼쪽 트리 + 오른쪽 편집기(찾기·띠·Save·Insert·Add folder). 순수 상태는 state.ts.
import { t, tm, useT } from "../../i18n";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getStore } from "../../board/boards";
import { placeNew } from "../../board/kinds/registry";
import { makeCode, makeExplorer, EXPLORER_MAX } from "../../files/make";
import { langOf } from "../../files/highlight";
import { dirFiles, draftGet, fsReveal, studioCreate, studioRead, studioTree, studioWrite, trashMove, type StudioEntry } from "../../lib/ipc";
import { useShell } from "../../shell/useShell";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { useUi } from "../../ui/useUi";
import { draftSaver } from "../drafts";
import StudioFrame from "../StudioFrame";
import { confirmUnsaved, unsaved } from "../unsaved";
import { closeStudioRequest, studioTitle } from "../useStudio";
import EolNotice from "../EolNotice";
import Banner from "./Banner";
import Editor, { LINE_H } from "./Editor";
import FindBar from "./FindBar";
import { findMatches, firstFrom, step } from "./find";
import { addFolderDir, canSave, closesOpen, headParts, initial, isDirty, nameError, needsConvert, newItemDir, outsideMemory, pickFirst, reduce, sortEntries } from "./state";
import Tree, { ContextMenu, NameInput, relOf, slash } from "./Tree";

const BLOCK_BYTES = 800_000; // 명세: 800 KB 넘는 파일은 열지 않는다(Rust 읽기 상한은 5 MB)
const BLOCKED = tm("This file can't be shown (binary or over 800 KB).");
type Sel = { path: string; isDir: boolean } | null;
type NewItem = { dir: string; isDir: boolean; error: string | null } | null;
type Menu = { x: number; y: number; items: { label: string; run: () => void }[] } | null;
const btn: React.CSSProperties = { height: 26, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", font: "12px system-ui", cursor: "pointer" };

export default function CodeStudio(_p: { arg?: string }) {
  useT();
  const root = useShell((s) => s.activeRepo) ?? "";
  const [state, dispatch] = useReducer(reduce, initial);
  const sref = useRef(state);
  sref.current = state;
  const [dirs, setDirs] = useState<Record<string, StudioEntry[]>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [mixed, setMixed] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [newItem, setNewItem] = useState<NewItem>(null);
  const [err, setErr] = useState<string | null>(null);
  const [find, setFind] = useState<{ q: string; cur: number } | null>(null);
  const saver = useRef<ReturnType<typeof draftSaver> | null>(null);
  const flash = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const scroll = useRef<HTMLDivElement | null>(null);
  const findIn = useRef<HTMLInputElement | null>(null);
  const dirsRef = useRef(dirs);
  dirsRef.current = dirs;

  const load = useCallback(async (dir: string) => {
    const list = sortEntries(await studioTree(root, dir).catch(() => [] as StudioEntry[]));
    setDirs((d) => ({ ...d, [dir]: list }));
    return list;
  }, [root]);

  // ---- 파일 열기(저장 안 한 편집이 있으면 먼저 묻는다) ----
  const openFile = useCallback(async (path: string, force = false) => {
    if (!force && isDirty(sref.current) && !(await confirmUnsaved())) return;
    setErr(null); setFind(null);
    setActive(path); setSel({ path, isDir: false });
    const f = await studioRead(path).catch((e) => { setErr(t("Can't open this file: {err}", { err: String(e) })); return null; });
    if (!f) return;
    setMixed(false);
    if (f.unreadable || f.text === undefined || f.bytes > BLOCK_BYTES) { setBlocked(true); saver.current = null; dispatch({ t: "close" }); return; }
    setBlocked(false); setMixed(!!f.mixedEol);
    const draft = await draftGet(path).catch(() => null);
    saver.current = draftSaver(path, () => sref.current.text, () => sref.current.doc?.mtimeMs ?? 0, 500);
    dispatch({ t: "open", doc: { path, realPath: f.realPath, outside: f.outside, text: f.text, encoding: f.encoding, bom: f.bom, crlf: f.crlf, mtimeMs: f.mtimeMs, bytes: f.bytes }, draft: draft ?? undefined });
    if (f.outside && outsideMemory.get(f.realPath) === "readonly") dispatch({ t: "readOnly" });
  }, []);

  // ---- 처음 열기: 루트 목록 → README 먼저 ----
  useEffect(() => {
    let live = true;
    void load(root).then((list) => { const f = pickFirst(list); if (live && f) void openFile(f.path, true); });
    return () => { live = false; };
  }, [root, load, openFile]);

  // ---- 저장(S-1879·S-1882·S-1885·S-1886) ----
  const save = useCallback(async (enc?: string): Promise<boolean> => {
    const s = sref.current, d = s.doc;
    if (!d) return true;
    if (s.readOnly) return false;
    const encoding = enc ?? d.encoding;
    if (needsConvert(encoding, s.text)) { dispatch({ t: "cantEncode" }); return false; }
    let allow = false;
    if (d.outside) {
      let m = outsideMemory.get(d.realPath);
      if (!m) {
        m = (await confirmDialog({ title: t("Save outside the repo?"), message: `${d.realPath}\n${t("is outside this repo.")}`, confirmLabel: t("Allow Saving There"), cancelLabel: t("Keep Read-Only") })) ? "allow" : "readonly";
        outsideMemory.set(d.realPath, m);
      }
      if (m === "readonly") { dispatch({ t: "readOnly" }); return false; }
      allow = true;
    }
    try {
      const r = await studioWrite(d.path, s.text, encoding, d.bom, d.crlf, s.forced ? undefined : d.mtimeMs, s.forced, allow ? { allowOutside: true } : undefined);
      dispatch({ t: "saved", mtimeMs: r.mtimeMs });
      void saver.current?.clear();
      setErr(null);
      clearTimeout(flash.current);
      flash.current = setTimeout(() => dispatch({ t: "flashOff" }), 1500);
      return true;
    } catch (e) {
      if (String(e) === "changed") dispatch({ t: "changed" });
      else setErr(t("Couldn't save: {err}", { err: String(e) }));
      return false;
    }
  }, []);

  // ---- 저장 안 한 편집 등록: 열린 파일 하나만(S-1881) ----
  useEffect(() => unsaved.register("code", {
    label: "code",
    dirty: () => isDirty(sref.current),
    save: () => save(),
    discard: async () => {
      await saver.current?.clear();
      sref.current = reduce(sref.current, { t: "discardDraft" }); // 닫으면서 초안이 되살아나지 않게
      dispatch({ t: "discardDraft" });
    },
  }), [save]);
  useEffect(() => () => { clearTimeout(flash.current); if (isDirty(sref.current)) void saver.current?.flush(); }, []);
  useEffect(() => { if (isDirty(state)) saver.current?.schedule(); }, [state.text]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 트리 ----
  const clickRow = (e: StudioEntry) => {
    if (e.isDir) {
      setSel({ path: e.path, isDir: true });
      const was = open.has(e.path);
      setOpen((o) => { const n = new Set(o); if (was) n.delete(e.path); else n.add(e.path); return n; });
      if (!was && !dirs[e.path]) void load(e.path);
    } else void openFile(e.path);
  };
  const startNew = (dir: string, isDir: boolean) => { setMenu(null); setNewItem({ dir, isDir, error: null }); };
  const trash = async (e: StudioEntry) => {
    if (!(await confirmDialog({ title: t("Move {name} to the Recycle Bin?", { name: e.name }), confirmLabel: t("Move to Recycle Bin"), danger: true }))) return;
    try { await trashMove(e.path); } catch (x) { setErr(t("Couldn't move it: {err}", { err: String(x) })); return; }
    if (closesOpen(sref.current.doc?.path ?? active, e.path)) { await saver.current?.clear(); saver.current = null; setActive(null); setBlocked(false); dispatch({ t: "close" }); }
    await load(slash(e.path).replace(/\/[^/]*$/, ""));
  };
  const rowMenu = (e: StudioEntry, x: number, y: number) => {
    setSel({ path: e.path, isDir: e.isDir });
    setMenu({
      x, y, items: [
        ...(e.isDir ? [{ label: t("New file here"), run: () => startNew(e.path, false) }, { label: t("New folder here"), run: () => startNew(e.path, true) }] : []),
        { label: t("Reveal in Explorer"), run: () => void fsReveal(e.path).catch(() => {}) },
        { label: t("Move to Recycle Bin"), run: () => void trash(e) },
      ],
    });
  };
  const submitNew = async (name: string) => {
    if (!newItem) return;
    const list = dirsRef.current[newItem.dir] ?? (await load(newItem.dir));
    const bad = nameError(name, list.map((x) => x.name));
    if (bad) return setNewItem({ ...newItem, error: bad });
    const path = `${slash(newItem.dir)}/${name}`;
    try { await studioCreate(path, newItem.isDir); } catch (x) { return setNewItem({ ...newItem, error: String(x) }); }
    setNewItem(null);
    await load(newItem.dir);
    setOpen((o) => new Set(o).add(newItem.dir));
    if (newItem.isDir) setSel({ path, isDir: true }); else await openFile(path);
  };

  // ---- 찾기(S-1878) ----
  const matches = find ? findMatches(state.text, find.q) : [];
  const setQ = (q: string) => {
    const m = findMatches(state.text, q), cur = firstFrom(m, ta.current?.selectionStart ?? 0);
    setFind({ q, cur });
    if (cur >= 0) select2(m, cur, q);
  };
  const select2 = (m: number[], cur: number, q: string) => {
    const t = ta.current, sc = scroll.current;
    if (!t || m[cur] === undefined) return;
    t.setSelectionRange(m[cur]!, m[cur]! + q.length);
    if (sc) {
      const top = state.text.slice(0, m[cur]!).split("\n").length * LINE_H - LINE_H;
      if (top < sc.scrollTop || top > sc.scrollTop + sc.clientHeight - 2 * LINE_H) sc.scrollTop = Math.max(0, top - sc.clientHeight / 2);
    }
  };
  const doStep = (dir: 1 | -1) => {
    if (!find) return;
    const cur = step(find.cur, matches.length, dir);
    setFind({ ...find, cur });
    select2(matches, cur, find.q);
  };
  const closeFind = () => { setFind(null); requestAnimationFrame(() => ta.current?.focus()); };

  // ---- Insert·Add folder(S-1887·S-1888): 보드에 놓고 스튜디오를 닫는다 ----
  const store = () => {
    const sh = useShell.getState(), ws = sh.openRepos.find((r) => r.path === sh.activeRepo)?.activeWs;
    return ws ? getStore(ws) : null;
  };
  const insert = () => {
    const d = sref.current.doc, st = store();
    if (!d || !st) return;
    placeNew(st, "code", makeCode(d.path, sref.current.text));
    useUi.getState().closeStudio();
  };
  const addFolder = async () => {
    const st = store();
    if (!st) return;
    const dir = addFolderDir(root, sel?.isDir ? sel.path : null, sref.current.doc?.path ?? active);
    const files = await dirFiles(dir, EXPLORER_MAX).catch(() => [] as string[]);
    if (!files.length) return setErr(t("No files to show in this folder."));
    placeNew(st, "explorer", makeExplorer(dir, files));
    useUi.getState().closeStudio();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "s") { e.preventDefault(); void save(); }
    else if (k === "f" && state.doc) {
      e.preventDefault();
      if (!find) { const q = ""; setFind({ q, cur: -1 }); } else findIn.current?.focus();
    }
  };

  const d = state.doc;
  const lang = d ? langOf(d.path) : "plain";
  const head = d ? headParts(d, state.text, lang === "plain" ? t("Plain text") : lang).join(" · ") : "";
  return (
    <div onKeyDown={onKeyDown}>
      <StudioFrame title={studioTitle("Code")} onClose={closeStudioRequest}
        left={
          <>
            {newItem && <NameInput label={newItem.isDir ? t("New folder in {where}", { where: relOf(root, newItem.dir) || t("repo") }) : t("New file in {where}", { where: relOf(root, newItem.dir) || t("repo") })} error={newItem.error} onSubmit={(n) => void submitNew(n)} onCancel={() => setNewItem(null)} />}
            <Tree root={root} dirs={dirs} open={open} active={active} sel={sel} onClick={clickRow} onMenu={rowMenu}
              onPlus={(x, y) => setMenu({ x, y, items: [{ label: t("New file"), run: () => startNew(newItemDir(root, sel), false) }, { label: t("New folder"), run: () => startNew(newItemDir(root, sel), true) }] })} />
          </>
        }>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--studio-line)", minHeight: 28 }}>
          <div data-testid="code-head" title={head} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-dim)", font: "12px system-ui" }}>{head}</div>
          <button data-testid="code-add-folder" style={btn} onClick={() => void addFolder()}>{t("Add folder")}</button>
          <button data-testid="code-save" style={{ ...btn, ...(state.flash ? { color: "var(--ok)" } : {}) }} disabled={!canSave(state)} onClick={() => void save()}>{state.flash ? t("Saved") : t("Save")}</button>
          <button data-testid="code-insert" disabled={!d} style={{ ...btn, border: 0, background: "var(--accent)", color: "var(--accent-text)" }} onClick={insert}>{t("Insert")}</button>
        </div>
        <Banner banner={state.banner} error={err} on={{
          discard: () => { void saver.current?.clear(); dispatch({ t: "discardDraft" }); },
          reload: () => { if (d) void openFile(d.path, true); },
          keepMine: () => dispatch({ t: "keepMine" }),
          convert: () => { dispatch({ t: "convert" }); void save("utf-8"); },
        }} />
        {d && mixed && <EolNotice crlf={d.crlf} />}
        {find && <FindBar q={find.q} cur={find.cur} count={matches.length} inputRef={findIn} onQ={setQ} onStep={doStep} onClose={closeFind} />}
        {d ? <Editor text={state.text} lang={lang} readOnly={state.readOnly} taRef={ta} scrollRef={scroll} onChange={(t) => dispatch({ t: "edit", text: t })} />
          : <div data-testid="code-empty" style={{ padding: 24, color: "var(--text-dim)" }}>{blocked ? t(BLOCKED) : t("Pick a file on the left.")}</div>}
      </StudioFrame>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
