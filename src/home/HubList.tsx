// H5 S-2870·S-2871: 홈의 'New Hub board' 단추와 'Hubs' 목록. 폴더 없는 보드라 repo 목록과 따로 둔다.
import { useT } from "../i18n";

type Hub = { id: string; name: string };
const box = { boxSizing: "border-box", width: "100%", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 14 } as const;

export default function HubList({ hubs, onNew, onOpen, onRemove }: { hubs: Hub[]; onNew: () => void; onOpen: (h: Hub) => void; onRemove: (h: Hub) => void }) {
  const t = useT();
  return (
    <>
      <button data-testid="new-hub" onClick={onNew} style={{ ...box, all: "unset", cursor: "pointer", padding: "10px 16px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: 10, color: "var(--text-dim)", fontSize: 14, width: "100%", boxSizing: "border-box" }}>
        + {t("New Hub board")}
      </button>
      {hubs.length > 0 && (
        <div style={{ width: "100%", display: "grid", gap: 6 }}>
          <div data-testid="hubs-head" style={{ fontSize: 12, color: "var(--text-dim)", padding: "0 4px" }}>{t("Hubs")}</div>
          {hubs.map((h) => (
            <div key={h.id} data-testid="hub-row" style={{ ...box, display: "flex", alignItems: "center", background: "var(--panel)" }}>
              <button data-testid="hub-open" onClick={() => onOpen(h)} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0, padding: "10px 16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                ⊞ {h.name}
              </button>
              <button data-testid="hub-remove" aria-label={t("Remove {name}", { name: h.name })} onClick={() => onRemove(h)} style={{ all: "unset", cursor: "pointer", padding: "10px 14px", color: "var(--text-dim)" }}>×</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
