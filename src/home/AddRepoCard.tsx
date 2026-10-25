// S-317: "Add a repo" 카드. 클릭=폴더 선택창(Ctrl+O 도 같은 일). 폴더 끌어놓기는 창 전체가 받는다(HomeScreen).
import { useT } from "../i18n";
export default function AddRepoCard({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  return (
    <button
      data-testid="add-repo"
      onClick={onAdd}
      style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", width: "100%", padding: "14px 16px", borderRadius: 10, border: "1px dashed var(--border)", color: "var(--text-dim)", fontSize: 14, textAlign: "center" }}
    >
      + {t("Add a repo")} <span style={{ opacity: 0.6 }}>{t("(Ctrl+O, or drop folders here)")}</span>
    </button>
  );
}
