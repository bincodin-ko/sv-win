// S-1020·S-1035: 보드 왼쪽 아래 GitHub pill. 그 repo 보드가 보이는 동안(이 컴포넌트가 마운트된 동안)만 10초마다·창 포커스 때 로컬 상태를 읽는다.
import { useEffect } from "react";
import { useUi } from "../ui/useUi";
import { repoOf, useGit } from "./useGit";
import { useT } from "../i18n";
import { startPoll } from "../perf/poll";

export const GithubMark = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export default function GithubPill({ repo }: { repo: string }) {
  const t = useT();
  const st = useGit((s) => repoOf(s.by, repo).st);
  const open = useUi((s) => s.gitOpen);
  useEffect(() => {
    const go = () => void useGit.getState().refresh(repo);
    const stop = startPoll(go, 10_000);
    window.addEventListener("focus", go);
    return () => { stop(); window.removeEventListener("focus", go); };
  }, [repo]);
  const label = !st ? "…" : st.gitMissing ? t("Git not found") : st.notGit ? t("Not a repo") : st.branch;
  const n = st && !st.notGit && !st.gitMissing ? st.total : 0;
  return (
    <button data-testid="git-pill" aria-pressed={open} onPointerDown={(e) => e.stopPropagation()}
      onClick={() => (open ? useUi.getState().closeGit() : useUi.getState().openGit())}
      style={{ position: "fixed", left: 12, bottom: 16, zIndex: 900, maxWidth: 200, display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 16, border: "1px solid var(--bd)", background: "var(--surface)", color: "var(--fg-2)", font: "12px system-ui", cursor: "pointer" }}>
      <GithubMark />
      <span data-testid="git-pill-branch" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {n > 0 && <span data-testid="git-pill-count" style={{ padding: "0 6px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-ink)", font: "11px system-ui" }}>{n}</span>}
    </button>
  );
}
