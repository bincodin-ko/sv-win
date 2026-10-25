// E6 S-1992·S-1993: PDF 내보내기 호출 + 결과 알림줄(스튜디오·카드가 같이 쓴다). 취소하면 아무것도 안 한다
import { useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import { exportPdf, type ExportOpts, type SavedToast } from "../../pdf/exportPdf";

type T = (Partial<SavedToast> & { message: string; error?: boolean }) | null;
const link: React.CSSProperties = { border: 0, background: "transparent", color: "var(--accent)", font: "12px system-ui", cursor: "pointer", padding: 0, textDecoration: "underline" };

export function useExporter(): { go: (o: Omit<ExportOpts, "toast">) => Promise<void>; toast: ReactNode } {
  const tr = useT();
  const [t, setT] = useState<T>(null);
  const go = async (o: Omit<ExportOpts, "toast">) => {
    try {
      await exportPdf({ ...o, toast: setT });
    } catch (e) {
      setT({ message: String(e), error: true });
    }
  };
  const toast = t && (
    <div data-testid="doc-toast" role="status" style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 12px", font: "12px system-ui", color: t.error ? "var(--err-text)" : "var(--text)", borderTop: "1px solid var(--studio-line)" }}>
      <span style={{ flex: 1 }}>{t.message}</span>
      {t.open && <button style={link} onClick={t.open}>{tr("Open")}</button>}
      {t.reveal && <button style={link} onClick={t.reveal}>{tr("Show in folder")}</button>}
      <button aria-label={tr("Dismiss")} style={link} onClick={() => setT(null)}>×</button>
    </div>
  );
  return { go, toast };
}
