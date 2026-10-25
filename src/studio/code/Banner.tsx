// 5묶음 E4 S-1880·S-1882·S-1884·S-1885: 편집기 위 띠(초안 복구·디스크 변경·인코딩 변환·줄 끝 섞임)
import { tm, useT } from "../../i18n";
import type { Banner as B } from "./state";

const TEXT: Record<NonNullable<B>["kind"], string> = {
  recovered: tm("Recovered unsaved edits"),
  changed: tm("This file changed on disk."),
  cantEncode: tm("Some characters can't be saved as Windows-1252."),
};
const btn: React.CSSProperties = { padding: "2px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", font: "12px system-ui", cursor: "pointer" };

export default function Banner({ banner, error, on }: { banner: B; error: string | null; on: { discard: () => void; reload: () => void; keepMine: () => void; convert: () => void } }) {
  const t = useT();
  if (!banner && !error) return null;
  const kind = banner?.kind;
  return (
    <div data-testid="code-banner" role="status" style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: "var(--warn-bg, var(--panel-2))", borderBottom: "1px solid var(--studio-line)", font: "12px system-ui", color: error ? "var(--danger)" : "var(--text)" }}>
      <span style={{ flex: 1 }}>{error ?? t(TEXT[kind!])}</span>
      {kind === "recovered" && <button style={btn} onClick={on.discard}>{t("Discard")}</button>}
      {kind === "changed" && <><button style={btn} onClick={on.reload}>{t("Reload")}</button><button style={btn} onClick={on.keepMine}>{t("Keep mine")}</button></>}
      {kind === "cantEncode" && <button style={btn} onClick={on.convert}>{t("Convert to UTF-8")}</button>}
    </div>
  );
}
