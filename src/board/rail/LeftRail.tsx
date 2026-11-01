import { useState } from "react";
import { useBoardStore } from "../BoardScope";
import { keyFor, type Keymap } from "../keymap";
import { tools } from "../toolsRegistry";
import { useSettings } from "../../settings/useSettings";
import { useT } from "../../i18n";

// S-040·S-803: 도구 표(toolsRegistry)를 order 순으로 그린다. 활성 도구는 주황 원, 버튼마다 data-testid="rail-<id>"
const btn = (active: boolean): React.CSSProperties => ({ width: 36, height: 36, borderRadius: 18, border: 0, background: active ? "var(--accent)" : "transparent", color: active ? "var(--accent-ink)" : "var(--fg-3)", font: "16px system-ui", cursor: "pointer" });

/** 접힌 막대 자리의 작은 탭(왼쪽·오른쪽 레일 같이 씀) */
export const tabStyle: React.CSSProperties = { position: "absolute", top: "50%", transform: "translateY(-50%)", width: 18, height: 48, padding: 0, border: "1px solid var(--bd)", background: "var(--surface)", color: "var(--fg-3)", font: "13px system-ui", cursor: "pointer", zIndex: 20 };

export default function LeftRail({ flyout, onSpawnClick, onFit }: { flyout: React.ReactNode; onSpawnClick: () => void; onFit: () => void }) {
  const t = useT();
  const useBoard = useBoardStore();
  const tool = useBoard((s) => s.tool);
  const armed = useBoard((s) => s.armedAgent);
  const setTool = useBoard((s) => s.setTool);
  const km = useSettings((s) => s.s.keymap) as Keymap | undefined;
  const [flyId, setFlyId] = useState<string | null>(null);
  const Fly = tools().find((x) => x.id === flyId)?.flyout;
  const hidden = useSettings((s) => s.s.leftRailHidden === true); // 대기열 2번: 접어 둘 수 있게(설정에 기억)
  if (hidden)
    return <button data-testid="rail-show" data-chrome aria-label={t("Show tools")} title={t("Show tools")} onClick={() => useSettings.getState().patch({ leftRailHidden: false })} onPointerDown={(e) => e.stopPropagation()}
      style={{ ...tabStyle, left: 0, borderRadius: "0 10px 10px 0", borderLeft: 0 }}>›</button>;
  return (
    <div data-testid="rail" data-chrome onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 4, padding: 4, background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 22, zIndex: 20 }}>
      {tools().map((td) => {
        const label = t(td.label);
        const title = td.key ? `${label} (${keyFor(km, td.key).toUpperCase()})` : label;
        const common = { "data-testid": `rail-${td.id}`, "aria-label": label, title };
        if (td.id === "fit") return <button key={td.id} {...common} style={btn(false)} onClick={onFit}>{td.icon}</button>;
        const click = () => {
          setTool(td.id);
          setFlyId(td.flyout && flyId !== td.id ? td.id : null);
          if (td.id === "spawn") onSpawnClick();
        };
        return (
          <button key={td.id} {...common} data-active={tool === td.id} {...(td.id === "spawn" ? { "data-armed": armed ?? "" } : {})} style={btn(tool === td.id)} onClick={click}>
            {td.icon ?? label.charAt(0)}
          </button>
        );
      })}
      <button data-testid="rail-hide" aria-label={t("Hide tools")} title={t("Hide tools")} onClick={() => (setFlyId(null), useSettings.getState().patch({ leftRailHidden: true }))}
        style={{ ...btn(false), height: 22, font: "13px system-ui", color: "var(--mute)" }}>‹</button>
      {flyout}
      {Fly && <Fly onClose={() => setFlyId(null)} />}
    </div>
  );
}
