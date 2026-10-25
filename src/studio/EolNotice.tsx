// FX7 S-1884: 줄 끝이 섞인 파일을 열었을 때 띠. 저장하면 많은 쪽으로 통일된다
import { useT } from "../i18n";
export default function EolNotice({ crlf }: { crlf: boolean }) {
  const t = useT();
  return (
    <div data-testid="eol-mixed" role="status" style={{ flex: "none", padding: "6px 14px", background: "var(--warn-bg, var(--panel-2))", borderBottom: "1px solid var(--studio-line)", font: "12px system-ui", color: "var(--text)" }}>
      {t("Line endings were mixed — saving will use {eol}.", { eol: crlf ? "CRLF" : "LF" })}
    </div>
  );
}
