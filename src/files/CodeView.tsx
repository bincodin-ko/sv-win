// S-957·S-962·S-960: 코드 카드·탐색기·Markdown 코드 블록이 같이 쓰는 강조 그리기와 카드 겉모양
import { useMemo } from "react";
import { tokenize, type Tok } from "./highlight";

export const cardStyle: React.CSSProperties = {
  width: "100%", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", overflow: "hidden",
  background: "var(--surface)", border: "1px solid var(--bd)", borderRadius: 10, font: "12px system-ui", color: "var(--fg-2)",
};
export const headStyle: React.CSSProperties = {
  flex: "none", height: 34, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", borderBottom: "1px solid var(--bd)", cursor: "grab",
};
export const titleStyle: React.CSSProperties = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", font: "600 12px system-ui", color: "var(--fg)" };
export const btnStyle: React.CSSProperties = { border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg-2)", borderRadius: 6, padding: "2px 8px", font: "11px system-ui", cursor: "pointer" };
const MONO = "12px/18px ui-monospace, Consolas, 'Cascadia Mono', monospace";

/** 한 줄의 토큰. 일반 글자는 그대로, 나머지는 tok-<종류> 클래스 + 강조 색 변수 */
export function Toks({ toks }: { toks: Tok[] }) {
  return <>{toks.map((k, i) => k.type === "plain" ? k.text : <span key={i} className={`tok-${k.type}`} style={{ color: `var(--syn-${k.type})` }}>{k.text}</span>)}</>;
}

/** 줄 번호 + 강조된 코드 (읽기 전용). 끝의 줄바꿈 하나는 빈 줄로 그리지 않는다 */
export function CodeLines({ text, lang }: { text: string; lang: string }) {
  const lines = useMemo(() => tokenize(text.replace(/\r?\n$/, ""), lang), [text, lang]);
  const digits = String(lines.length).length;
  return (
    <div style={{ minWidth: "max-content", padding: "6px 0", font: MONO, color: "var(--fg)" }}>
      {lines.map((toks, i) => (
        <div key={i} data-testid="code-line" style={{ display: "flex", minHeight: 18, whiteSpace: "pre" }}>
          <span data-testid="code-ln" style={{ flex: "none", width: `${digits + 2}ch`, paddingRight: 12, textAlign: "right", color: "var(--mute-3)", userSelect: "none" }}>{i + 1}</span>
          <span><Toks toks={toks} /></span>
        </div>
      ))}
    </div>
  );
}
