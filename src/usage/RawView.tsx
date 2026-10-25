// D10 S-1516: CLI 가 찍은 화면 글자를 고정폭으로 그대로
import { useT } from "../i18n";
export default function RawView({ text }: { text: string }) {
  const t = useT();
  return (
    <pre data-testid="usage-raw" style={{ margin: 0, padding: 8, background: "var(--well)", borderRadius: 6, font: "11px/1.35 ui-monospace, Consolas, 'Courier New', monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 320, overflow: "auto" }}>
      {text || t("(nothing was printed)")}
    </pre>
  );
}
