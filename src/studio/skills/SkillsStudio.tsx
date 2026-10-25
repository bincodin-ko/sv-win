// 5묶음 E7 S-2070~S-2085: Skills 관리자 — 왼쪽(탭 Installed/Starters·필터 칩·목록), 오른쪽(상세·Edit·New·Import·Starters 미리보기).
// 다시 읽기(S-2085): 열 때, 탭을 바꿀 때, 쓰기 작업 뒤. 파일 감시는 하지 않는다.
import { t, useT } from "../../i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { pickFolder, skillsDelete, skillsDuplicate, skillsImport, skillsImportCheck, skillsScan, type SkillScope, type SkillsScan } from "../../lib/ipc";
import { useShell } from "../../shell/useShell";
import StudioFrame from "../StudioFrame";
import { confirmUnsaved } from "../unsaved";
import { closeStudioRequest, studioTitle } from "../useStudio";
import Detail from "./Detail";
import EditForm from "./EditForm";
import ImportFlow, { type Imp } from "./ImportFlow";
import List, { Tabs, type Tab } from "./List";
import NewForm from "./NewForm";
import { StarterList, StarterPreview } from "./StartersTab";
import { STARTERS } from "./starters";
import { btn, catOf, errText, isRow, pkey, toRows, type Cat } from "./view";

type Mode = "view" | "edit" | "new" | "import";

export default function SkillsStudio() {
  useT();
  const repo = useShell((s) => s.activeRepo);
  const [scan, setScan] = useState<SkillsScan>({ skills: [], truncated: false });
  const [tab, setTab] = useState<Tab>("installed");
  const [chips, setChips] = useState<Set<Cat>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [imp, setImp] = useState<Imp | null>(null);
  const [starter, setStarter] = useState(STARTERS[0]!.name);
  const [note, setNote] = useState("");
  const rows = useMemo(() => toRows(scan.skills), [scan]);
  const reload = useCallback(async () => { try { setScan(await skillsScan(repo)); } catch { /* 읽기 실패는 목록을 그대로 둔다 */ } }, [repo]);
  useEffect(() => { void reload(); }, [reload, tab]);

  /** 저장 안 한 편집이 있으면 먼저 묻고(S-1810), 계속해도 될 때만 */
  const go = async (fn: () => void | Promise<void>) => { if (await confirmUnsaved()) { setNote(""); await fn(); } };
  const show = (key: string | null) => { setSel(key); setMode("view"); };
  const cur = rows.find((r) => isRow(r, sel));
  const visible = chips.size ? rows.filter((r) => chips.has(catOf(r.e))) : rows;
  const fail = (e: unknown) => setNote(String(e));

  const duplicate = async (scope: SkillScope) => {
    if (!cur) return;
    try { const p = await skillsDuplicate(repo, cur.e.dir, scope); await reload(); show(pkey(p)); } catch (e) { fail(e); }
  };
  const remove = async () => {
    if (!cur) return;
    try { await skillsDelete(repo, cur.e.dir); await reload(); show(null); } catch (e) { fail(e); }
  };
  const pick = () => go(async () => {
    const src = await pickFolder();
    if (!src) return;
    try { setImp({ src, name: await skillsImportCheck(src) }); } catch (e) { setImp({ src, error: String(e) }); }
    setMode("import");
  });
  const doImport = async (scope: SkillScope) => {
    if (!imp) return;
    try { const p = await skillsImport(repo, scope, imp.src); setImp(null); await reload(); show(pkey(p)); } catch (e) { setImp({ ...imp, error: String(e) }); }
  };

  const left = (
    <>
      <Tabs tab={tab} onTab={(t) => void go(() => { setTab(t); setMode("view"); })} />
      {tab === "installed" ? (
        <>
          <div style={{ display: "flex", gap: 6, padding: "8px 10px 0" }}>
            <button data-testid="skills-new" style={btn} onClick={() => void go(() => setMode("new"))}>{t("New skill")}</button>
            <button data-testid="skills-import" style={btn} onClick={() => void pick()}>{t("Import…")}</button>
          </div>
          <List rows={visible} chips={chips} hasRepo={!!repo} selected={cur?.id ?? null} truncated={scan.truncated}
            onChip={(c) => setChips((s) => { const n = new Set(s); if (!n.delete(c)) n.add(c); return n; })}
            onSelect={(r) => void go(() => show(r.id))} />
        </>
      ) : <StarterList rows={rows} selected={starter} onSelect={setStarter} />}
    </>
  );

  let main: React.ReactNode;
  if (tab === "starters") main = <StarterPreview starter={STARTERS.find((s) => s.name === starter)!} rows={rows} repo={repo} onInstalled={() => void reload()} />;
  else if (mode === "new") main = <NewForm repo={repo} onCancel={() => setMode("view")} onCreated={(p) => void reload().then(() => show(pkey(p)))} />;
  else if (mode === "import" && imp) main = <ImportFlow imp={imp} hasRepo={!!repo} onImport={(s) => void doImport(s)} onCancel={() => { setImp(null); setMode("view"); }} />;
  else if (mode === "edit" && cur) main = <EditForm key={cur.id} r={cur} repo={repo} onCancel={() => setMode("view")} onSaved={() => void reload().then(() => setMode("view"))} />;
  else if (cur) main = <Detail r={cur} hasRepo={!!repo} onEdit={() => setMode("edit")} onDuplicate={(s) => void duplicate(s)} onDelete={() => void remove()} />;
  else main = <div style={{ padding: 24, color: "var(--text-dim)" }}>{t("Pick a skill on the left, or start from Starters.")}</div>;

  return (
    <StudioFrame title={studioTitle("Skills")} left={left} onClose={closeStudioRequest}>
      {note && <div data-testid="skills-note" style={{ ...errText, padding: "8px 18px" }}>{note}</div>}
      {main}
    </StudioFrame>
  );
}
