// S-393~S-396: ② Your first repo — Open a folder / Clone a repository / Create a new repo. 건너뛸 수 있다(다음).
import { useEffect, useRef, useState } from "react";
import { gitCancel, gitClone, gitCloneStatus, gitInit, homeDirs, pathTaken, pickFolder } from "../lib/ipc";
import { defaultBase, joinDest, nameError, repoNameFromUrl } from "./repoNames";
import { useT } from "../i18n";

const input: React.CSSProperties = { padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "inherit", font: "inherit" };
const btn: React.CSSProperties = { padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

/** add: repo 로 등록(홈 목록에도 반영). added: 이 단계에서 더한 폴더들(맨 앞이 처음 더한 repo) */
export default function RepoStep({ add, added }: { add: (path: string) => Promise<void>; added: string[] }) {
  const t = useT();
  const [mode, setMode] = useState<"clone" | "new" | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [base, setBase] = useState("");
  const [mainBranch, setMainBranch] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const job = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => void homeDirs().then((h) => setBase((b) => b || defaultBase(h.home, h.hasHypervibe))), []);

  const cloneName = repoNameFromUrl(url);
  const dest = mode === "clone" ? (cloneName && base ? joinDest(base, cloneName) : "") : name.trim() && base ? joinDest(base, name.trim()) : "";

  const openFolder = async () => {
    const p = await pickFolder();
    if (p) await add(p);
  };
  const change = async () => {
    const p = await pickFolder();
    if (p) setBase(p);
  };
  const clone = async () => {
    if (!dest || busy) return;
    const bad = nameError(cloneName ?? "", await pathTaken(dest));
    if (bad) return setStatus(bad);
    setBusy(true);
    setStatus(t("Cloning…"));
    try {
      const id = (job.current = await gitClone(url.trim(), dest));
      let st = await gitCloneStatus(id);
      while (st.state === "Running") {
        await sleep(300);
        st = await gitCloneStatus(id);
      }
      if (st.state === "Done") {
        await add(dest);
        setStatus(t("Cloned {name}", { name: cloneName ?? "" }));
      } else setStatus(st.message ?? t("git failed"));
    } catch (e) {
      setStatus(String(e));
    } finally {
      job.current = null;
      setBusy(false);
    }
  };
  const create = async () => {
    const bad = nameError(name, dest ? await pathTaken(dest) : false);
    if (bad || !dest) return setError(bad ?? t("Enter a name"));
    setError("");
    try {
      await gitInit(dest, mainBranch);
      await add(dest);
      setName("");
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{t("Your first repo")}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btn} onClick={() => void openFolder()}>{t("Open a folder")}</button>
        <button style={btn} aria-pressed={mode === "clone"} onClick={() => setMode(mode === "clone" ? null : "clone")}>{t("Clone a repository")}</button>
        <button style={btn} aria-pressed={mode === "new"} onClick={() => setMode(mode === "new" ? null : "new")}>{t("Create a new repo")}</button>
      </div>
      {mode && (
        <div style={{ display: "grid", gap: 8 }}>
          {mode === "clone" ? (
            <input data-testid="fr-clone-url" style={input} value={url} placeholder={t("https://, ssh:// or git@ address")} onChange={(e) => setUrl(e.target.value)} />
          ) : (
            <>
              <input data-testid="fr-new-name" style={input} value={name} placeholder={t("Repo name")} onChange={(e) => setName(e.target.value)} />
              <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
                <input data-testid="fr-new-main" type="checkbox" checked={mainBranch} onChange={(e) => setMainBranch(e.target.checked)} />
                {t("Start as a git repository on branch main")}
              </label>
            </>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--text-dim)" }}>
            <span>{t("Location:")}</span>
            <span data-testid="fr-dest" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dest}</span>
            <button data-testid="fr-change" style={btn} onClick={() => void change()}>{t("Change")}</button>
          </div>
          {mode === "clone" ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button data-testid="fr-clone-go" style={btn} disabled={!dest || busy} onClick={() => void clone()}>{t("Clone")}</button>
              {busy && <button data-testid="fr-cancel" style={btn} onClick={() => job.current !== null && void gitCancel(job.current)}>{t("Cancel")}</button>}
              <span data-testid="fr-status" style={{ fontSize: 12 }}>{status}</span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button data-testid="fr-new-go" style={btn} onClick={() => void create()}>{t("Create")}</button>
              <span data-testid="fr-new-error" style={{ fontSize: 12, color: "var(--err-text)" }}>{error}</span>
            </div>
          )}
        </div>
      )}
      {added.length > 0 && (
        <ul data-testid="fr-added" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {added.map((p) => <li key={p} title={p}>{baseName(p)}</li>)}
        </ul>
      )}
    </div>
  );
}
