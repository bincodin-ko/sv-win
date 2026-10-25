// S-320: 홈 아래쪽 compose bar — repo pill(누르면 repo 목록 메뉴), preset pill("No preset" 고정 자리: B14), Dispatch/Resume. pill 모양은 추측.
import { useEffect, useState } from "react";
import type { RepoInfo } from "../board/persist";
import { dispatchArmed } from "../presets/actions";
import { useArmedPreset } from "../presets/armed";
import PresetMenu from "./PresetMenu";
import { useT } from "../i18n";

type P = {
  repos: RepoInfo[];
  selected: string | null;
  resume: boolean; // 고른 repo 가 이미 열려 있다
  disabled: boolean; // repo 없음 또는 폴더 없음
  onPick: (path: string) => void;
  onDispatch: () => void;
};
const pill = { all: "unset", cursor: "pointer", padding: "5px 12px", borderRadius: 16, background: "var(--panel-2)", border: "1px solid var(--border)", fontSize: 13 } as const;

export default function ComposeBar({ repos, selected, resume, disabled, onPick, onDispatch }: P) {
  const t = useT();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);
  const armed = useArmedPreset((s) => s.armed);
  const cur = repos.find((r) => r.path === selected);
  return (
    <div data-testid="compose-bar" style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, padding: 10, borderRadius: 14, background: "var(--panel)", border: "1px solid var(--border)", width: "100%", boxSizing: "border-box" }}>
      <button
        data-testid="repo-pill"
        disabled={!repos.length}
        onClick={(e) => {
          e.stopPropagation();
          setMenu(!menu);
        }}
        style={{ ...pill, opacity: repos.length ? 1 : 0.5 }}
      >
        {cur?.name ?? t("No repo")} ▾
      </button>
      <PresetMenu pill={pill} />
      <span style={{ flex: 1 }} />
      <button
        data-testid="dispatch"
        disabled={disabled}
        onClick={() => (armed && selected ? void dispatchArmed(selected) : onDispatch())}
        style={{ all: "unset", cursor: disabled ? "default" : "pointer", padding: "6px 16px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-text)", fontWeight: 600, fontSize: 13, opacity: disabled ? 0.4 : 1 }}
      >
        {resume && !armed ? t("Resume") : t("Dispatch")}
      </button>
      {menu && (
        <div role="menu" style={{ position: "absolute", left: 10, bottom: "100%", marginBottom: 6, minWidth: 180, padding: 4, borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)" }}>
          {repos.map((r) => (
            <button key={r.path} role="menuitem" onClick={() => { setMenu(false); onPick(r.path); }} style={{ all: "unset", display: "block", width: "100%", boxSizing: "border-box", padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
