// 5묶음 E7 S-2078: Edit — 머리말까지 통째로 고정폭 입력창. Save 는 연 때의 mtime 을 보내 디스크가 달라졌으면 거절하고 Reload 를 준다.
// 고친 채 닫으면 S-1810 확인창("Save your skill changes?") — unsaved 에 등록한다.
import { useEffect, useRef, useState } from "react";
import { t, tm, useT } from "../../i18n";
import { skillsScan, skillsWrite } from "../../lib/ipc";
import { confirmUnsaved, unsaved } from "../unsaved";
import { btn, errText, mono, primary, pkey, type Row } from "./view";

const CHANGED = tm("This file changed on disk since you opened it.");

export default function EditForm({ r, repo, onSaved, onCancel }: { r: Row; repo: string | null; onSaved: () => void; onCancel: () => void }) {
  useT();
  const [text, setText] = useState(r.e.raw);
  const [error, setError] = useState("");
  const cur = useRef(text), base = useRef(r.e.raw), mtime = useRef(r.e.mtime);
  cur.current = text;
  const save = async (): Promise<boolean> => {
    try {
      mtime.current = await skillsWrite(repo, r.e.path, cur.current, mtime.current);
      base.current = cur.current;
      onSaved();
      return true;
    } catch (e) { setError(String(e)); return false; }
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => unsaved.register("skills-edit", { label: "skill", dirty: () => cur.current !== base.current, save: () => saveRef.current(), discard: () => void (cur.current = base.current) }), []);
  const reload = async () => {
    const fresh = (await skillsScan(repo)).skills.find((s) => pkey(s.path) === r.id);
    if (!fresh) return setError(t("This skill no longer exists."));
    base.current = fresh.raw; mtime.current = fresh.mtime;
    setText(fresh.raw); setError("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "14px 18px", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, fontWeight: 600 }}>{t("Editing {name}", { name: r.p.name })}</div>
        <button style={btn} onClick={async () => { if (await confirmUnsaved()) onCancel(); }}>{t("Cancel")}</button>
        <button data-testid="skill-save" style={primary} onClick={() => void save()}>{t("Save")}</button>
      </div>
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span data-testid="skill-edit-error" style={errText}>{error === CHANGED ? t(CHANGED) : error}</span>
          {error === CHANGED && <button data-testid="skill-reload" style={btn} onClick={() => void reload()}>{t("Reload")}</button>}
        </div>
      )}
      <textarea data-testid="skill-edit-text" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)}
        style={{ ...mono, flex: 1, minHeight: 240, resize: "none", padding: 10, borderRadius: 6, border: "1px solid var(--bd-2)", background: "var(--skill-code-bg)", color: "var(--fg)" }} />
    </div>
  );
}
