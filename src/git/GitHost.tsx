// S-1021: useUi.gitOpen 을 보고 패널을 그린다(Esc 로 닫힘). 열 때 상태·이력을 읽는다(S-1035).
import { useEffect } from "react";
import { useUi } from "../ui/useUi";
import GitPanel from "./GitPanel";
import { useGit } from "./useGit";

export default function GitHost({ repo, wsId }: { repo: string; wsId: string }) {
  const open = useUi((s) => s.gitOpen);
  useEffect(() => {
    if (!open) return;
    void useGit.getState().refresh(repo);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector('[role="dialog"]')) useUi.getState().closeGit(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, repo]);
  return open ? <GitPanel repo={repo} wsId={wsId} /> : null;
}
