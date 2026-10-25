// S-801: registry 에 없는 종류의 노드는 점선 상자 하나만 그린다(필드는 저장에서 그대로 남는다)
import { useT } from "../../i18n";

export default function Unsupported({ kind }: { kind: string }) {
  const t = useT();
  return (
    <div data-testid="unsupported-node" style={{ width: "100%", height: "100%", boxSizing: "border-box", display: "grid", placeItems: "center", border: "2px dashed var(--bd-2)", borderRadius: 10, color: "var(--mute)", font: "12px system-ui", textAlign: "center", padding: 8, overflow: "hidden" }}>
      {t("Unsupported node: {kind}", { kind })}
    </div>
  );
}
