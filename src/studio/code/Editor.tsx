// 5묶음 E4 S-1875·S-1876: 편집기. 줄 번호 칸 + 투명 <textarea> 아래에 겹친 강조 <pre>. 줄 바꿈 없음. 바깥 스크롤 칸 하나가 둘을 같이 움직인다(동기화 코드 없음).
// ponytail: 찾은 곳은 세로로만 스크롤(가로는 브라우저가 캐럿을 따라감). 찾는 동안 선택 영역은 편집기에 포커스가 올 때 보인다.
import { useEffect, useMemo, useState, type RefObject } from "react";
import { useT } from "../../i18n";
import { Toks } from "../../files/CodeView";
import { tokenize } from "../../files/highlight";
import { indentTab } from "./indent";
import { shouldHighlight } from "./state";

const FONT = "12px/18px ui-monospace, Consolas, 'Cascadia Mono', monospace";
export const LINE_H = 18;

export interface EditorProps {
  text: string; lang: string; readOnly: boolean;
  taRef: RefObject<HTMLTextAreaElement | null>; scrollRef: RefObject<HTMLDivElement | null>;
  onChange: (t: string) => void;
}

export default function Editor({ text, lang, readOnly, taRef, scrollRef, onChange }: EditorProps) {
  const t = useT();
  const [shown, setShown] = useState(text); // 120ms 쉰 뒤에 다시 칠한다(S-1876)
  useEffect(() => { const t = setTimeout(() => setShown(text), 120); return () => clearTimeout(t); }, [text]);
  const lines = useMemo(() => (shown === text && shouldHighlight(text.length) ? tokenize(text, lang) : null), [shown, text, lang]);
  const n = text.split("\n").length;
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || readOnly) return;
    e.preventDefault();
    const ta = e.currentTarget;
    if (document.execCommand("insertText", false, "  ")) return; // 되돌리기(Ctrl+Z)가 남는다
    const r = indentTab(ta.value, ta.selectionStart, ta.selectionEnd);
    onChange(r.text);
    requestAnimationFrame(() => ta.setSelectionRange(r.start, r.end));
  };
  return (
    <div ref={scrollRef} data-testid="code-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", alignItems: "flex-start", font: FONT, background: "var(--studio-bg)" }}>
      <div aria-hidden data-testid="code-gutter" style={{ position: "sticky", left: 0, zIndex: 1, flex: "none", minHeight: "100%", padding: "8px 10px 8px 12px", boxSizing: "border-box", textAlign: "right", color: "var(--text-dim)", opacity: 0.8, background: "var(--studio-side)", userSelect: "none", whiteSpace: "pre" }}>
        {Array.from({ length: n }, (_, i) => i + 1).join("\n")}
      </div>
      <div style={{ position: "relative", flex: 1, minWidth: "max-content", minHeight: "100%", boxSizing: "border-box" }}>
        <pre data-testid="code-pre" aria-hidden style={{ margin: 0, padding: "8px 16px 8px 12px", minHeight: "100%", boxSizing: "border-box", font: FONT, whiteSpace: "pre", color: "var(--text)", pointerEvents: "none" }}>
          {lines ? lines.map((toks, i) => <span key={i}>{i ? "\n" : ""}<Toks toks={toks} /></span>) : text}{"\n "}
        </pre>
        <textarea ref={taRef} data-testid="code-textarea" value={text} readOnly={readOnly} spellCheck={false} wrap="off" autoCapitalize="off" autoCorrect="off" aria-label={t("Code editor")}
          onChange={(e) => onChange(e.target.value)} onKeyDown={onKey}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", margin: 0, padding: "8px 16px 8px 12px", boxSizing: "border-box", border: 0, outline: "none", resize: "none", overflow: "hidden", font: FONT, whiteSpace: "pre", background: "transparent", color: "transparent", caretColor: "var(--text)" }} />
      </div>
    </div>
  );
}
